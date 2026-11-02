// ============================================================================
// HTTP API Client
// Handles CSRF tokens, Cookie authentication, Error mappings, and Chaos flags
// ============================================================================

import type {
  ApiErrorPayload,
  HistoryResponse,
  Room,
  SendMessageResponse,
  SessionInfo,
  SyncResponse,
  UserSummary
} from '../types/contract.js';

export class ApiError extends Error {
  status: number;
  code: string;
  retryable: boolean;
  requestId?: string;
  details?: Array<{ field: string; code: string }>;
  retryAfterSeconds?: number;

  constructor(
    message: string,
    status: number,
    code: string,
    retryable: boolean,
    requestId?: string,
    details?: Array<{ field: string; code: string }>,
    retryAfterSeconds?: number
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.retryable = retryable;
    this.requestId = requestId;
    this.details = details;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export class HttpClient {
  private csrfToken: string | null = null;
  public simulateDropAfterSend = false;

  public setCsrfToken(token: string | null): void {
    this.csrfToken = token;
  }

  public getCsrfToken(): string | null {
    return this.csrfToken;
  }

  private async request<T>(
    path: string,
    options: RequestInit = {},
    isRetry = false
  ): Promise<T> {
    const headers = new Headers(options.headers || {});
    headers.set('Accept', 'application/json');

    const method = (options.method || 'GET').toUpperCase();
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
      if (!headers.has('Content-Type') && options.body) {
        headers.set('Content-Type', 'application/json');
      }
      if (this.csrfToken && !headers.has('X-CSRF-Token')) {
        headers.set('X-CSRF-Token', this.csrfToken);
      }
    }

    let response: Response;
    try {
      response = await fetch(path, {
        ...options,
        headers,
        credentials: 'include'
      });
    } catch (err) {
      // Network failures, connection refused, DNS issues etc. are retryable
      throw new ApiError(
        err instanceof Error ? err.message : 'Network error',
        0,
        'NETWORK_ERROR',
        true
      );
    }

    // Handle 403 CSRF_FAILED with a single refresh attempt
    if (
      response.status === 403 &&
      !isRetry &&
      path !== '/api/v1/session' &&
      path !== '/auth/login'
    ) {
      const clone = response.clone();
      let isCsrfError = false;
      try {
        const body = (await clone.json()) as ApiErrorPayload;
        if (body?.error?.code === 'CSRF_FAILED' || body?.error?.code === 'INVALID_CSRF_TOKEN') {
          isCsrfError = true;
        }
      } catch {
        // Ignored
      }

      if (isCsrfError) {
        try {
          await this.fetchSession();
          return this.request<T>(path, options, true);
        } catch {
          // If session refresh fails, fall through to error throw
        }
      }
    }

    if (!response.ok) {
      let code = `HTTP_${response.status}`;
      let message = response.statusText || 'Request failed';
      let retryable = response.status >= 500 || response.status === 429;
      let requestId: string | undefined;
      let details: Array<{ field: string; code: string }> | undefined;

      try {
        const body = (await response.json()) as ApiErrorPayload;
        if (body?.error) {
          code = body.error.code || code;
          message = body.error.message || message;
          if (typeof body.error.retryable === 'boolean') {
            retryable = body.error.retryable;
          }
          requestId = body.error.request_id;
          details = body.error.details;
        }
      } catch {
        // Fallback to text status
      }

      if (response.status === 401) {
        this.csrfToken = null;
        code = 'UNAUTHENTICATED';
        retryable = false;
      }

      const retryAfterHeader = response.headers.get('Retry-After');
      let retryAfterSeconds: number | undefined;
      if (retryAfterHeader && Number.isFinite(Number(retryAfterHeader))) {
        retryAfterSeconds = Number(retryAfterHeader);
        message = `${message} (Retry-After: ${retryAfterSeconds}s)`;
      }

      throw new ApiError(message, response.status, code, retryable, requestId, details, retryAfterSeconds);
    }

    // 204 No Content
    if (response.status === 204) {
      return {} as T;
    }

    return (await response.json()) as T;
  }

  /**
   * Fetches current session info and updates csrf_token.
   */
  public async fetchSession(): Promise<SessionInfo> {
    const data = await this.request<SessionInfo>('/api/v1/session');
    if (data?.csrf_token) {
      this.setCsrfToken(data.csrf_token);
    }
    return data;
  }

  /**
   * Fetches mock dev users available for local switching (M1/M2).
   */
  public async fetchDevUsers(): Promise<UserSummary[]> {
    try {
      const res = await this.request<
        UserSummary[] | { users?: UserSummary[]; items?: UserSummary[] }
      >('/auth/dev-users');
      if (Array.isArray(res)) return res;
      if (res && Array.isArray(res.users)) return res.users;
      if (res && Array.isArray(res.items)) return res.items;
      return [];
    } catch {
      // Default local fallback list with canonical UUIDs matching temp_backend
      return [
        { user_id: '11111111-1111-4111-8111-111111111111', display_name: 'Demo A' },
        { user_id: '11111111-1111-4111-8111-222222222222', display_name: 'Demo B' },
        { user_id: '11111111-1111-4111-8111-333333333333', display_name: 'Demo C' }
      ];
    }
  }

  /**
   * Switches user immediately via local dev endpoint.
   */
  public async devLogin(userId: string): Promise<SessionInfo> {
    const data = await this.request<SessionInfo>('/auth/dev-login', {
      method: 'POST',
      body: JSON.stringify({ user_id: userId })
    });
    if (data?.csrf_token) {
      this.setCsrfToken(data.csrf_token);
    }
    return data;
  }

  /**
   * Logs out from current device or all devices.
   */
  public async logout(allDevices = false): Promise<void> {
    const path = allDevices ? '/auth/logout-all' : '/auth/logout';
    try {
      await this.request<void>(path, { method: 'POST' });
    } finally {
      this.setCsrfToken(null);
    }
  }

  /**
   * Fetches room list for current user.
   */
  public async fetchRooms(
    limit = 50,
    cursor?: string | null
  ): Promise<{ items: Room[]; next_cursor: string | null }> {
    const params = new URLSearchParams();
    if (limit) params.set('limit', limit.toString());
    if (cursor) params.set('cursor', cursor);

    const qs = params.toString() ? `?${params.toString()}` : '';
    return this.request<{ items: Room[]; next_cursor: string | null }>(`/api/v1/rooms${qs}`);
  }

  /**
   * Sends a message via HTTP POST.
   * If simulateDropAfterSend is active, sends the POST so server commits it,
   * but artificially throws a simulated timeout to test M1/M2 idempotency recovery.
   */
  public async sendMessageHttp(
    roomId: string,
    clientMessageId: string,
    text: string,
    bypassChaos = false
  ): Promise<SendMessageResponse> {
    if (this.simulateDropAfterSend && !bypassChaos) {
      // Fire and commit on server, but drop client response
      await this.request<SendMessageResponse>(`/api/v1/rooms/${encodeURIComponent(roomId)}/messages`, {
        method: 'POST',
        body: JSON.stringify({
          client_message_id: clientMessageId,
          text
        })
      });
      throw new ApiError(
        'Simulated network timeout: client dropped response after server committed (Chaos Test)',
        0,
        'SIMULATED_NETWORK_TIMEOUT',
        true
      );
    }

    return this.request<SendMessageResponse>(`/api/v1/rooms/${encodeURIComponent(roomId)}/messages`, {
      method: 'POST',
      body: JSON.stringify({
        client_message_id: clientMessageId,
        text
      })
    });
  }

  /**
   * Fetches historical messages older than beforeSeq.
   * Note: History does NOT advance the contiguous recovery cursor.
   */
  public async fetchRoomHistory(
    roomId: string,
    limit = 50,
    beforeSeq?: string | null
  ): Promise<HistoryResponse> {
    const params = new URLSearchParams();
    if (limit) params.set('limit', limit.toString());
    if (beforeSeq) params.set('before_seq', beforeSeq);

    const qs = params.toString() ? `?${params.toString()}` : '';
    return this.request<HistoryResponse>(
      `/api/v1/rooms/${encodeURIComponent(roomId)}/messages${qs}`
    );
  }

  /**
   * Fetches missing messages starting afterSeq up to throughSeq.
   */
  public async fetchRoomSync(
    roomId: string,
    afterSeq: string,
    throughSeq?: string | null,
    limit = 100
  ): Promise<SyncResponse> {
    const params = new URLSearchParams();
    params.set('after_seq', afterSeq);
    if (throughSeq) params.set('through_seq', throughSeq);
    if (limit) params.set('limit', limit.toString());

    return this.request<SyncResponse>(
      `/api/v1/rooms/${encodeURIComponent(roomId)}/sync?${params.toString()}`
    );
  }

  /**
   * Triggers server-side chaos and testing simulations (e.g. inject peer message, force ws disconnect).
   */
  public async triggerDevChaos<T = Record<string, unknown>>(payload: Record<string, unknown>): Promise<T> {
    return this.request<T>('/api/v1/dev/chaos', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  }
}

export const httpClient = new HttpClient();
