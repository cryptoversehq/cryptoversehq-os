import type { CloudEventMap, CloudEventName } from './types';

type Listener<K extends CloudEventName> = (payload: CloudEventMap[K]) => void;

export class CloudEventBus {
  private listeners = new Map<CloudEventName, Set<Listener<CloudEventName>>>();

  on<K extends CloudEventName>(name: K, listener: Listener<K>): () => void {
    const set = this.listeners.get(name) ?? new Set<Listener<CloudEventName>>();
    set.add(listener as Listener<CloudEventName>);
    this.listeners.set(name, set);
    return () => set.delete(listener as Listener<CloudEventName>);
  }

  emit<K extends CloudEventName>(name: K, payload: CloudEventMap[K]): void {
    this.listeners.get(name)?.forEach(listener => listener(payload as never));
  }

  clear(): void {
    this.listeners.clear();
  }
}

export const cloudEventBus = new CloudEventBus();
