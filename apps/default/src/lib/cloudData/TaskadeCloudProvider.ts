import type { CloudEntity, CloudHealth, CloudProvider, CloudReadQuery, CloudWriteRequest } from './types';
import { platformTransport } from '../platformTransport';
import { buildSyncPayload, describeBudget, payloadSize } from './SyncPayloadBudget';
import { CloudTrafficCircuit, circuitPauseMessage } from './CloudTrafficCircuit';

const USERS_PROJECT_ID = '3dMq65zUi1A7ayiC';
const API_ROOT = `/api/taskade/projects/${USERS_PROJECT_ID}`;

/**
 * P0 — once a payload has been rejected with 413 Content Too Large, remember the
 * size so the SAME oversized write is never sent again.
 *
 * Keyed by email → the smallest body size we know the server rejected. A body at or
 * above that size is refused locally (no network call at all); a body that later
 * shrinks below it is attempted once more, and if it succeeds the flag is cleared.
 * This self-tunes from real evidence instead of guessing the proxy's limit — but the
 * guess was the alternative, and guessing low would have disabled sync for accounts
 * that are currently working.
 */
const rejectedBodySizes = new Map<string, number>();

/** A write that retrying cannot fix (oversized body, bad request, missing node). */
export class PermanentCloudWriteError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PermanentCloudWriteError';
  }
}

/** The proxy's body-size rejection. Matched on status and message, not a constant. */
function isContentTooLarge(error: unknown): boolean {
  const status = (error as { status?: number })?.status;
  if (status === 413) return true;
  const message = error instanceof Error ? error.message : String(error ?? '');
  return /\b413\b|content too large|payload too large/i.test(message);
}

// ── P0.1b — circuit breaker ───────────────────────────────────────────────────
/** Pause cloud writes after 3 consecutive transport failures, for 5 minutes. */
const CIRCUIT = new CloudTrafficCircuit({ failureThreshold: 3, openMs: 300_000 });

/** One budget log per account per session — not one per write. */
const budgetLogged = new Set<string>();

/**
 * True when the failure was NOT an answer from the server (network / timeout / reset /
 * abort). A 4xx means the server replied, so it is not a transport problem and must not
 * trip the breaker.
 */
function isTransportFailure(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '');
  if (/\b(400|401|403|404|409|413|422)\b/.test(message)) return false;
  return /transport|network|timeout|timed out|ERR_|failed to fetch|aborted|socket|reset/i.test(message)
    || message.length === 0;
}

interface TaskadeNode {
  id: string;
  fieldValues?: Record<string, string>;
}

export class TaskadeCloudProvider implements CloudProvider {
  private connected = false;
  private email: string | null;
  private nodesCache: TaskadeNode[] | null = null;
  private nodesCacheAt = 0;
  private nodesRequest: Promise<TaskadeNode[]> | null = null;
  private emailToIndexMap: Map<string, TaskadeNode> = new Map();
  private saveRequests = new Map<string, Promise<void>>();

  constructor(email: string | null = null) {
    this.email = email;
  }

  setUser(email: string | null): void { this.email = email; }

  async connect(): Promise<void> {
    await this.request('/nodes');
    this.connected = true;
  }

  async read<T = unknown>(query: CloudReadQuery): Promise<CloudEntity<T> | null> {
    const node = await this.findNode(query.userId);
    if (!node) return null;
    const data = this.parseData(node);
    return (data[`${query.objectType}_${query.key ?? ''}`] ?? null) as CloudEntity<T> | null;
  }

  async write<T = unknown>(request: CloudWriteRequest<T>): Promise<CloudEntity<T>> {
    return this.persist(request);
  }

  async update<T = unknown>(request: CloudWriteRequest<T>): Promise<CloudEntity<T>> {
    return this.persist(request);
  }

  async delete(query: CloudReadQuery): Promise<void> {
    const node = await this.findNode(query.userId);
    if (!node) return;
    const data = this.parseData(node);
    delete data[`${query.objectType}_${query.key ?? ''}`];
    await this.saveNode(node.id, data, query.userId);
    this.nodesCache = null;
  }

  async batchRead<T = unknown>(queries: CloudReadQuery[]): Promise<Array<CloudEntity<T> | null>> {
    return Promise.all(queries.map(query => this.read<T>(query)));
  }

  async readAll<T = unknown>(query: CloudReadQuery): Promise<CloudEntity<T>[]> {
    const node = await this.findNode(query.userId);
    if (!node) return [];
    const prefix = query.objectType ? `${query.objectType}_` : '';
    const data = this.parseData(node);
    const entities: CloudEntity<T>[] = [];
    for (const [id, value] of Object.entries(data)) {
      if (prefix && !id.startsWith(prefix)) continue;
      if (!value || typeof value !== 'object') continue;
      entities.push(value as CloudEntity<T>);
    }
    return entities;
  }

  async batchWrite<T = unknown>(requests: CloudWriteRequest<T>[]): Promise<CloudEntity<T>[]> {
    const out: CloudEntity<T>[] = [];
    for (const request of requests) out.push(await this.write(request));
    return out;
  }

  async projectNodes(projectId: string): Promise<Record<string, unknown>[]> {
    const payload = await this.requestRoot(`/projects/${projectId}/nodes`);
    const nodes = (payload.payload as { nodes?: Record<string, unknown>[] } | undefined)?.nodes;
    // A body with no `nodes` array is NOT an empty project — it is a failed or
    // unexpected response (an error envelope, an HTML shell, a proxied error
    // page). Collapsing it to [] made a broken read indistinguishable from "no
    // users": logins failed as "incorrect password", signups skipped their
    // duplicate check, and sessions were signed out on load. An empty project
    // still returns `nodes: []`, which passes this guard.
    if (!Array.isArray(nodes)) {
      throw new Error(`Taskade project ${projectId} node list was missing from the response.`);
    }
    return nodes;
  }

  async createProjectNode(projectId: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
    return this.requestRoot(`/projects/${projectId}/nodes`, { method: 'POST', body: JSON.stringify(body) });
  }

  async updateProjectNode(projectId: string, nodeId: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
    return this.requestRoot(`/projects/${projectId}/nodes/${nodeId}`, { method: 'PATCH', body: JSON.stringify(body) });
  }

  async deleteProjectNode(projectId: string, nodeId: string): Promise<void> {
    await this.requestRoot(`/projects/${projectId}/nodes/${nodeId}`, { method: 'DELETE' });
  }

  async invokeWebhook(flowId: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
    return this.requestRoot(`/webhooks/${flowId}/run`, { method: 'POST', body: JSON.stringify(body) });
  }

  async health(): Promise<CloudHealth> {
    const start = Date.now();
    try {
      await this.request('/nodes');
      return { online: true, provider: 'taskade', latencyMs: Date.now() - start, checkedAt: new Date().toISOString() };
    } catch (error) {
      return { online: false, provider: 'taskade', latencyMs: Date.now() - start, checkedAt: new Date().toISOString(), detail: error instanceof Error ? error.message : 'Cloud health check failed' };
    }
  }

  async disconnect(): Promise<void> { this.connected = false; }
  isConnected(): boolean { return this.connected; }

  private async persist<T>(request: CloudWriteRequest<T>): Promise<CloudEntity<T>> {
    const node = await this.findNode(request.userId);
    const data = node ? this.parseData(node) : {};
    data[`${request.objectType}_${request.key}`] = request.entity;
    await this.saveNode(node?.id ?? null, data, request.userId);
    this.nodesCache = null;
    return request.entity;
  }

  private async findNode(userId?: string): Promise<TaskadeNode | null> {
    const email = (userId ?? this.email)?.toLowerCase();
    if (!email) return null;
    const now = Date.now();
    // ── Enterprise Scalable O(1) Indexed Lookup (Sprint 6.6.3-E) ──
    if (this.nodesCache && now - this.nodesCacheAt < 5_000 && this.emailToIndexMap.has(email)) {
      return this.emailToIndexMap.get(email) ?? null;
    }
    await this.loadNodes();
    return this.emailToIndexMap.get(email) ?? null;
  }

  private async loadNodes(): Promise<TaskadeNode[]> {
    const now = Date.now();
    if (this.nodesCache && now - this.nodesCacheAt < 5_000) return this.nodesCache;
    if (this.nodesRequest) return this.nodesRequest;
    this.nodesRequest = this.request('/nodes').then(payload => {
      const nodes = ((payload.payload as { nodes?: TaskadeNode[] } | undefined)?.nodes ?? []);
      this.nodesCache = nodes;
      this.nodesCacheAt = Date.now();
      // Build O(1) Cached Index
      this.emailToIndexMap.clear();
      for (const node of nodes) {
        const email = node.fieldValues?.['/attributes/@cv_email']?.toLowerCase();
        if (email) this.emailToIndexMap.set(email, node);
      }
      return nodes;
    }).finally(() => {
      this.nodesRequest = null;
    });
    return this.nodesRequest;
  }

  private parseData(node: TaskadeNode): Record<string, CloudEntity> {
    try { return JSON.parse(node.fieldValues?.['/attributes/@cv_data'] ?? '{}') as Record<string, CloudEntity>; } catch { return {}; }
  }

  private async saveNode(nodeId: string | null, data: Record<string, unknown>, userId?: string): Promise<void> {
    const email = (userId ?? this.email)?.trim().toLowerCase();
    if (!email) throw new Error('Cloud user email is required before saving user data');
    // ── P0.1b — circuit breaker ────────────────────────────────────────────────
    // Refuse locally while the cloud is failing, so a throttled proxy is not kept busy
    // by every store write. The error carries no 4xx status on purpose: the offline
    // queue must treat it as RETRYABLE and come back after the pause.
    if (CIRCUIT.isOpen) {
      throw new Error(circuitPauseMessage(email, CIRCUIT.remainingMs()));
    }

    // ── P0.1 — payload budget ─────────────────────────────────────────────────
    // `target` starts at the size the SERVER itself rejected for this account, and is
    // Infinity for a healthy one — so nothing is ever trimmed by default.
    let target = rejectedBodySizes.get(email) ?? Infinity;
    let budget = buildSyncPayload(data as Record<string, unknown>, {
      limitChars: target,
      criticalPrefixes: ['auth_profile'],   // never evicted: the next sign-in needs it
    });

    const buildBody = () => {
      const f = { Email: email, 'User Data (JSON)': JSON.stringify(budget.payload) };
      const p = nodeId ? f : { '/text': email, ...f };
      return JSON.stringify(p);
    };

    let body = buildBody();

    // The proxy limit applies to the OUTER request body while the budget measures the
    // inner document (the envelope and JSON escaping add overhead), so tighten until the
    // real body fits — at most three passes — instead of leaving it to the retry path to
    // converge over several rejected requests.
    for (let pass = 0; Number.isFinite(target) && body.length > target && pass < 3; pass += 1) {
      target = Math.max(1, payloadSize(budget.payload) - (body.length - target) - 16);
      budget = buildSyncPayload(data as Record<string, unknown>, {
        limitChars: target,
        criticalPrefixes: ['auth_profile'],
      });
      body = buildBody();
    }

    if ((budget.trimmedArrays > 0 || budget.deferred.length > 0) && !budgetLogged.has(email)) {
      budgetLogged.add(email);
      console.warn(`[CloudSync] payload budget applied for ${email}: ${describeBudget(budget)}`);
    }

    // P0 — payload size guard.
    //
    // Every write serialises the WHOLE per-user blob (all object types) into the
    // node's @cv_data, so once that blob outgrows what the proxy accepts, every
    // later write fails with 413 however small the actual change is. Retrying an
    // oversized body cannot succeed, and the offline queue re-enqueues on every new
    // signature (the signature contains that same changing blob) — which is exactly
    // how one oversized account produced hundreds of PATCH requests per minute.
    //
    // So: refuse locally, permanently, and loudly. Local data is untouched; only
    // remote sync for this account pauses until the payload shrinks.
    const rejectedAt = rejectedBodySizes.get(email);
    if (rejectedAt !== undefined && body.length >= rejectedAt) {
      throw new PermanentCloudWriteError(
        `Cloud sync paused for ${email}: this node's payload is ${body.length} chars and the server already rejected ${rejectedAt} chars with 413 Content Too Large. ` +
        'Nothing is retried until the payload shrinks. Local data is intact.',
      );
    }

    const send = (payloadBody: string) => this.request(nodeId ? `/nodes/${nodeId}` : '/nodes', {
      method: nodeId ? 'PATCH' : 'POST',
      body: payloadBody,
    });

    const previous = this.saveRequests.get(email) ?? Promise.resolve();
    const next = previous.catch(() => undefined).then(async () => {
      try {
        await send(body);
        // A body this size worked, so any earlier rejection no longer applies and the
        // endpoint is healthy again.
        rejectedBodySizes.delete(email);
        CIRCUIT.recordSuccess();
      } catch (error) {
        if (isContentTooLarge(error)) {
          rejectedBodySizes.set(email, body.length);

          // Self-healing: rebuild under the size the server just refused and try once
          // more, so sync recovers inside THIS write instead of waiting for the next one.
          const retry = buildSyncPayload(data as Record<string, unknown>, {
            limitChars: Math.max(1, body.length - 1),
            criticalPrefixes: ['auth_profile'],
          });
          if (retry.fits && payloadSize(retry.payload) < payloadSize(budget.payload)) {
            const retryFields = { Email: email, 'User Data (JSON)': JSON.stringify(retry.payload) };
            const retryBody = JSON.stringify(nodeId ? retryFields : { '/text': email, ...retryFields });
            try {
              await send(retryBody);
              CIRCUIT.recordSuccess();
              if (!budgetLogged.has(email)) {
                budgetLogged.add(email);
                console.warn(`[CloudSync] payload budget recovered ${email} after a 413: ${describeBudget(retry)}`);
              }
              return;
            } catch { /* fall through to the permanent failure below */ }
          }

          throw new PermanentCloudWriteError(
            `Cloud sync paused for ${email}: the server rejected a ${body.length}-char payload with 413 Content Too Large. ` +
            'Repeated attempts are stopped; local data is intact.',
          );
        }

        // Network/timeout/reset: transient, so the queue may retry — but count it, and
        // stop sending for a while once the endpoint looks unhealthy.
        if (isTransportFailure(error)) CIRCUIT.recordFailure();
        throw error;
      }
    });
    this.saveRequests.set(email, next);
    try {
      await next;
    } finally {
      if (this.saveRequests.get(email) === next) this.saveRequests.delete(email);
    }
  }

  private async requestRoot(path: string, options?: RequestInit): Promise<Record<string, unknown>> {
    return platformTransport.request<Record<string, unknown>>(`/api/taskade${path}`, {
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', ...(options?.headers ?? {}) },
      ...options,
    });
  }

  private async request(path: string, options?: RequestInit): Promise<Record<string, unknown>> {
    return platformTransport.request<Record<string, unknown>>(`${API_ROOT}${path}`, {
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', ...(options?.headers ?? {}) },
      ...options,
    });
  }
}
