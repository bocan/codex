/**
 * MCP Session Store
 * In-memory session management with TTL and per-key limits.
 */

import { config } from './config';

interface Session {
  id: string;
  apiKey: string;
  createdAt: number;
  lastAccessedAt: number;
  protocolVersion?: string;
  initialized: boolean;
}

/**
 * Simple in-memory session store with TTL and limits
 */
export class SessionStore {
  private sessions = new Map<string, Session>();
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;

  constructor() {
    // Run cleanup every minute
    this.cleanupInterval = setInterval(() => this.cleanup(), 60000);
  }

  /**
   * Create a new session
   */
  create(apiKey: string): Session {
    // Check per-key limit
    const keySessions = this.getSessionsByApiKey(apiKey);
    if (keySessions.length >= config.maxSessionsPerKey) {
      // Remove oldest session for this API key (LRU)
      const oldest = keySessions.sort((a, b) => a.lastAccessedAt - b.lastAccessedAt)[0];
      if (oldest) {
        this.delete(oldest.id);
      }
    }

    const session: Session = {
      id: crypto.randomUUID(),
      apiKey,
      createdAt: Date.now(),
      lastAccessedAt: Date.now(),
      initialized: false,
    };

    this.sessions.set(session.id, session);

    if (config.debug) {
      console.log(`[MCP] Session created: ${session.id}`);
    }

    return session;
  }

  /**
   * Get a session by ID
   */
  get(sessionId: string): Session | undefined {
    const session = this.sessions.get(sessionId);

    if (!session) {
      return undefined;
    }

    // Check TTL
    if (Date.now() - session.lastAccessedAt > config.sessionTtlMs) {
      this.delete(sessionId);
      return undefined;
    }

    // Update last accessed time
    session.lastAccessedAt = Date.now();
    return session;
  }

  /**
   * Mark session as initialized (after MCP handshake)
   */
  initialize(sessionId: string, protocolVersion?: string): boolean {
    const session = this.get(sessionId);
    if (!session) return false;

    session.initialized = true;
    session.protocolVersion = protocolVersion;
    return true;
  }

  /**
   * Delete a session
   */
  delete(sessionId: string): boolean {
    const deleted = this.sessions.delete(sessionId);
    if (deleted && config.debug) {
      console.log(`[MCP] Session deleted: ${sessionId}`);
    }
    return deleted;
  }

  /**
   * Validate session exists and is valid
   */
  validate(sessionId: string): boolean {
    return this.get(sessionId) !== undefined;
  }

  /**
   * Get all sessions for an API key
   */
  private getSessionsByApiKey(apiKey: string): Session[] {
    return Array.from(this.sessions.values()).filter(s => s.apiKey === apiKey);
  }

  /**
   * Clean up expired sessions
   */
  private cleanup(): void {
    const now = Date.now();
    let cleaned = 0;

    for (const [id, session] of this.sessions) {
      if (now - session.lastAccessedAt > config.sessionTtlMs) {
        this.sessions.delete(id);
        cleaned++;
      }
    }

    if (cleaned > 0 && config.debug) {
      console.log(`[MCP] Cleaned up ${cleaned} expired sessions`);
    }
  }

  /**
   * Stop cleanup interval (for graceful shutdown)
   */
  stopCleanup(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  /**
   * Get session count (for health checks)
   */
  count(): number {
    return this.sessions.size;
  }
}

// Singleton instance
export const sessionStore = new SessionStore();
