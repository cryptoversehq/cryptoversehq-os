import { cloudDataLayer } from './cloudData';

export const PRODUCT_ANALYTICS_PROJECT_ID = 'dRjwXywSkjwxAnen';

export type ProductAnalyticsEvent =
  | 'signup_started'
  | 'signup_completed'
  | 'otp_success'
  | 'otp_failure'
  | 'first_login'
  | 'lesson_completed'
  | 'first_trade'
  | 'feature_used'
  | 'session_started';

export interface AnalyticsUser {
  id?: string;
  email?: string;
}

export interface AnalyticsEventInput {
  type: ProductAnalyticsEvent;
  user?: AnalyticsUser | null;
  feature?: string;
  success?: boolean;
  metadata?: string;
}

const firstEventKey = (type: ProductAnalyticsEvent, user: AnalyticsUser | null | undefined) =>
  `cryptoverse_analytics_once:${type}:${user?.id ?? user?.email ?? 'anonymous'}`;

function canUseStorage(): boolean {
  return typeof window !== 'undefined' && typeof localStorage !== 'undefined';
}

export function wasTracked(type: ProductAnalyticsEvent, user?: AnalyticsUser | null): boolean {
  if (!canUseStorage() || !user || (!user.id && !user.email)) return false;
  return localStorage.getItem(firstEventKey(type, user)) === 'true';
}

export async function trackProductEvent(input: AnalyticsEventInput): Promise<void> {
  const user = input.user ?? null;
  const eventName = input.metadata ? `${input.type}:${input.metadata}` : input.type;
  const body: Record<string, unknown> = {
    '/text': eventName,
    '/attributes/@an_event': eventName,
    '/attributes/@an_user': user?.id ?? '',
    '/attributes/@an_email': user?.email ?? '',
    '/attributes/@an_time': new Date().toISOString(),
    '/attributes/@an_type': input.type,
    '/attributes/@an_feature': input.feature ?? '',
    '/attributes/@an_success': input.success === false ? 'no' : 'yes',
  };

  try {
    await cloudDataLayer.createProjectNode(PRODUCT_ANALYTICS_PROJECT_ID, body);
  } catch (error) {
    console.warn('[ProductAnalytics] event was not persisted', error);
  }
}

export function trackProductEventInBackground(input: AnalyticsEventInput): void {
  void trackProductEvent(input);
}

export function trackProductEventOnce(input: AnalyticsEventInput): void {
  const user = input.user ?? null;
  if (!user || (!user.id && !user.email)) {
    trackProductEventInBackground(input);
    return;
  }
  const key = firstEventKey(input.type, user);
  if (canUseStorage() && localStorage.getItem(key) === 'true') return;
  if (canUseStorage()) localStorage.setItem(key, 'true');
  trackProductEventInBackground(input);
}

export interface AnalyticsRow {
  id: string;
  text: string;
  userId: string;
  email: string;
  occurredAt: string;
  type: ProductAnalyticsEvent | string;
  feature: string;
  success: string;
}

function field(node: Record<string, unknown>, key: string): string {
  const values = (node.fieldValues ?? node.attributes ?? {}) as Record<string, unknown>;
  const value = values[key] ?? values[`/attributes/${key}`] ?? values[key.replace('/attributes/', '')];
  return value == null ? '' : String(value);
}

export function normalizeAnalyticsRows(nodes: Record<string, unknown>[]): AnalyticsRow[] {
  return nodes.map(node => ({
    id: String(node.id ?? ''),
    text: String(node.text ?? node.content ?? field(node, '/text') ?? ''),
    userId: field(node, '@an_user') || field(node, '/attributes/@an_user'),
    email: field(node, '@an_email') || field(node, '/attributes/@an_email'),
    occurredAt: field(node, '@an_time') || field(node, '/attributes/@an_time'),
    type: field(node, '@an_type') || field(node, '/attributes/@an_type'),
    feature: field(node, '@an_feature') || field(node, '/attributes/@an_feature'),
    success: field(node, '@an_success') || field(node, '/attributes/@an_success'),
  })).filter(row => row.type || row.text);
}

export async function getProductAnalyticsRows(): Promise<AnalyticsRow[]> {
  const nodes = await cloudDataLayer.projectNodes(PRODUCT_ANALYTICS_PROJECT_ID);
  return normalizeAnalyticsRows(nodes);
}
