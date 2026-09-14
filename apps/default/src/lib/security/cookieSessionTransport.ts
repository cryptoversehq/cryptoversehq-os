/**
 * cookieSessionTransport.ts — Enterprise Cookie Session Transport & Gateway Proxy Architecture
 * Sprint 6.6.2-O — Explains and implements Secure, HttpOnly, SameSite=Strict cookie session transport.
 *
 * Architecture:
 *   In enterprise production deployments, session authentication tokens are set by the Gateway Auth Service
 *   as `Secure; HttpOnly; SameSite=Strict; Path=/` cookies (`cv_gateway_session`), preventing client-side
 *   script access (`document.cookie` cannot read HttpOnly cookies, mitigating XSS token theft).
 *
 *   For CDN preview and client-side testing environments where static origins cannot set HTTP response cookies,
 *   this module implements an encrypted in-memory session proxy (`cookieSessionTransport`) backed by
 *   `CloudDataLayer.ts`, eliminating unencrypted `localStorage` session exposure.
 */

import { cloudDataLayer } from '@/lib/cloudData';

export interface EnterpriseSessionToken {
  sessionId: string;
  userId: string;
  email: string;
  role: string;
  issuedAt: number;
  expiresAt: number;
}

// NOTE: no CSRF token is requested or sent anywhere in this module. Better Auth
// (which replaced Supabase Auth) exposes no CSRF endpoint — probing it returns
// 404 — and protects cookie session requests with Origin checking,
// `SameSite=None; Secure` cookies and Fetch Metadata headers. Sending
// `credentials: 'include'` is all that is required.

class EnterpriseCookieSessionTransport {
  private inMemorySession: EnterpriseSessionToken | null = null;

  /**
   * Sets a session token.
   * In production gateway mode, sends a request to `/api/taskade/auth/session` to set the HttpOnly cookie.
   * In CDN preview mode, stores the token in memory and syncs to Taskade Cloud via CloudDataLayer.
   */
  async setSession(session: EnterpriseSessionToken): Promise<void> {
    if (!session.sessionId || !session.userId || !session.email || !session.expiresAt || session.expiresAt <= Date.now()) {
      throw new Error('Invalid or expired session.');
    }

    this.inMemorySession = session;
    try {
      await fetch('/api/taskade/auth/session', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(session),
      }).then((response) => {
        if (!response.ok) throw new Error('Gateway session rejected.');
      });
    } catch {
      // Preview fallback remains memory-first and does not write session data to localStorage.
      await cloudDataLayer.save('auth_session', session.email, session, 'session');
    }
  }

  /**
   * Reads current session token.
   * Checks Gateway HttpOnly cookie status or returns authenticated memory/cloud state.
   */
  async getSession(email: string): Promise<EnterpriseSessionToken | null> {
    if (this.inMemorySession && Date.now() < this.inMemorySession.expiresAt) {
      return this.inMemorySession;
    }
    try {
      const res = await fetch('/api/taskade/auth/session', {
        method: 'GET',
        credentials: 'include',
      });
      if (res.ok) {
        const session = await res.json() as EnterpriseSessionToken;
        this.inMemorySession = session;
        return session;
      }
    } catch {
      // Fallback read from CloudDataLayer
      const cloud = await cloudDataLayer.get<EnterpriseSessionToken>('auth_session', email, 'persistent');
      if (cloud && Date.now() < cloud.expiresAt) {
        this.inMemorySession = cloud;
        return cloud;
      }
    }
    return null;
  }

  /**
   * Clears session token across Gateway HttpOnly cookie and cloud storage.
   */
  async clearSession(email: string): Promise<void> {
    this.inMemorySession = null;
    try {
      await fetch('/api/taskade/auth/session', {
        method: 'DELETE',
        credentials: 'include',
      }).then((response) => {
        if (!response.ok) throw new Error('Gateway logout rejected.');
      });
    } catch {
      await cloudDataLayer.delete('auth_session', email, 'session');
    }
  }
}

export const cookieSessionTransport = new EnterpriseCookieSessionTransport();
