/**
 * notificationStore.ts — CryptoVerse HQ
 *
 * Persistent notification system. Notifications survive browser refreshes
 * and sessions. Users can mark them as read or dismiss them.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { PersistStorage } from 'zustand/middleware';
import { createCloudStorage } from './cloudData';
import { useAuthStore } from './authStore';

export type NotificationType =
  | 'price_alert'
  | 'liquidation_warning'
  | 'sl_tp_hit'
  | 'system'
  | 'achievement'
  | 'payment';

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  read: boolean;
  createdAt: string;
  link?: string;
}

interface NotificationState {
  notifications: Notification[];

  addNotification: (n: Omit<Notification, 'id' | 'read' | 'createdAt'>) => void;
  markRead: (id: string) => void;
  markAllRead: () => void;
  dismiss: (id: string) => void;
  clearAll: () => void;
  unreadCount: () => number;
}

const MAX_NOTIFICATIONS = 200;

function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export const useNotificationStore = create<NotificationState>()(
  persist(
    (set, get) => ({
      notifications: [],

      addNotification: (n) => {
        const notif: Notification = {
          ...n,
          id: uid(),
          read: false,
          createdAt: new Date().toISOString(),
        };
        set(state => ({
          notifications: [notif, ...state.notifications].slice(0, MAX_NOTIFICATIONS),
        }));
      },

      markRead: (id) => {
        set(state => ({
          notifications: state.notifications.map(n =>
            n.id === id ? { ...n, read: true } : n,
          ),
        }));
      },

      markAllRead: () => {
        set(state => ({
          notifications: state.notifications.map(n => ({ ...n, read: true })),
        }));
      },

      dismiss: (id) => {
        set(state => ({
          notifications: state.notifications.filter(n => n.id !== id),
        }));
      },

      clearAll: () => set({ notifications: [] }),

      unreadCount: () => get().notifications.filter(n => !n.read).length,
    }),
    {
      name: 'cv-notifications',
      storage: createCloudStorage<NotificationState>({ objectType: 'notifications', userId: () => useAuthStore.getState().user?.email ?? null, cachePolicy: 'session' }) as PersistStorage<NotificationState>,
      partialize: (state) => ({
        notifications: state.notifications.slice(0, MAX_NOTIFICATIONS),
      }),
    },
  ),
);
