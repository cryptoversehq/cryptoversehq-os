/** authEvents.ts — Lightweight pub/sub event emitter for auth events. UI components subscribe without coupling to session logic. */
import type { AuthEvent, AuthEventType, AuthEventListener } from './authTypes';
const listeners = new Map<AuthEventType, Set<AuthEventListener>>();
const ALL_EVENTS_KEY = '__ALL__' as AuthEventType;
export function onAuthEvent(type: AuthEventType, listener: AuthEventListener): () => void {
  if (!listeners.has(type)) listeners.set(type, new Set());
  listeners.get(type)!.add(listener);
  return () => { listeners.get(type)?.delete(listener); };
}
export function onAnyAuthEvent(listener: AuthEventListener): () => void {
  return onAuthEvent(ALL_EVENTS_KEY, listener);
}
export function emitAuthEvent(event: AuthEvent): void {
  const typeListeners = listeners.get(event.type);
  if (typeListeners) { for (const listener of typeListeners) { try { listener(event); } catch {} } }
  const allListeners = listeners.get(ALL_EVENTS_KEY);
  if (allListeners) { for (const listener of allListeners) { try { listener(event); } catch {} } }
}
export function hasAuthEventListeners(type: AuthEventType): boolean {
  const typeSet = listeners.get(type); const allSet = listeners.get(ALL_EVENTS_KEY);
  return (typeSet !== undefined && typeSet.size > 0) || (allSet !== undefined && allSet.size > 0);
}
