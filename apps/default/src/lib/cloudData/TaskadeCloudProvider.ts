import type { CloudEntity, CloudHealth, CloudProvider, CloudReadQuery, CloudWriteRequest } from './types';
import { platformTransport } from '../platformTransport';

const USERS_PROJECT_ID = '3dMq65zUi1A7ayiC';
const API_ROOT = `/api/taskade/projects/${USERS_PROJECT_ID}`;

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
    return ((payload.payload as { nodes?: Record<string, unknown>[] } | undefined)?.nodes ?? []);
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
    const email = userId ?? this.email;
    const body = { '/attributes/@cv_email': email, '/attributes/@cv_data': JSON.stringify(data), '/attributes/@cv_updated': new Date().toISOString() };
    await this.request(nodeId ? `/nodes/${nodeId}` : '/nodes', { method: nodeId ? 'PATCH' : 'POST', body: JSON.stringify(nodeId ? body : { content: email ?? 'cloud-user', ...body }) });
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
