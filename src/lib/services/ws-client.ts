// ============================================================================
// WebSocket Client (chat.v1)
// Handles Heartbeats (25s ping / 10s pong), Full-Jitter Exponential Backoff,
// Auto-Resubscription, and Close Codes (1001, 1013, 1008, 1009, 4401)
// ============================================================================

import type { Message, WsClientMessage, WsServerMessage } from '../types/contract.js';
import { generateUuid } from '../types/contract.js';

export type WsState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'error';

export interface WsClientCallbacks {
  onStateChange?: (state: WsState, error?: string, closeCode?: number | null) => void;
  onMessageCreated?: (roomId: string, message: Message) => void;
  onSubscribed?: (roomId: string, lastSeq: string) => void;
  onUnsubscribed?: (roomId: string) => void;
  onSubscriptionRevoked?: (roomId: string, reason: string) => void;
  onProtocolAnomaly?: (reason: string) => void;
  onError?: (code: string, message: string) => void;
  onAuthExpired?: () => void;
  onReconnected?: () => void;
}

export class WsClient {
  private socket: WebSocket | null = null;
  private state: WsState = 'disconnected';
  private callbacks: WsClientCallbacks = {};

  private subscribedRooms = new Set<string>();
  private pendingSubscribes = new Map<string, Array<(lastSeq: string | null) => void>>();
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private continuousTimer: ReturnType<typeof setTimeout> | null = null;

  // Heartbeat
  private pingIntervalTimer: ReturnType<typeof setInterval> | null = null;
  private pongTimeoutTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingPingId: string | null = null;

  private explicitlyDisconnected = false;
  private wasPreviouslyConnected = false;

  constructor(callbacks: WsClientCallbacks = {}) {
    this.callbacks = callbacks;
  }

  public setCallbacks(callbacks: WsClientCallbacks): void {
    this.callbacks = { ...this.callbacks, ...callbacks };
  }

  public getState(): WsState {
    return this.state;
  }

  public getReconnectAttempt(): number {
    return this.reconnectAttempt;
  }

  public getSubscribedRooms(): string[] {
    return Array.from(this.subscribedRooms);
  }

  private setState(newState: WsState, error?: string, closeCode: number | null = null): void {
    this.state = newState;
    this.callbacks.onStateChange?.(newState, error, closeCode);
  }

  private startContinuousTimer(): void {
    if (this.continuousTimer) {
      clearTimeout(this.continuousTimer);
    }
    this.continuousTimer = setTimeout(() => {
      this.reconnectAttempt = 0;
      this.continuousTimer = null;
    }, 60000);
  }

  /**
   * Opens the WebSocket connection.
   */
  public connect(): void {
    if (this.socket && (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)) {
      return;
    }

    this.explicitlyDisconnected = false;
    this.clearTimers();

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/api/v1/ws`;

    this.setState(this.reconnectAttempt > 0 ? 'reconnecting' : 'connecting');

    try {
      this.socket = new WebSocket(wsUrl, ['chat.v1']);
    } catch (err) {
      this.setState('error', err instanceof Error ? err.message : 'WebSocket initialization failed');
      this.scheduleReconnect();
      return;
    }

    this.socket.onopen = () => {
      this.setState('connected');
      this.startHeartbeat();

      // Reset reconnect attempt after 60 seconds of stable connection (Rule 7)
      // If no subscribed rooms, start the 60-second timer right now
      if (this.subscribedRooms.size === 0) {
        this.startContinuousTimer();
      }

      // Re-subscribe to all active rooms
      for (const roomId of this.subscribedRooms) {
        this.sendWsMessage({
          type: 'subscribe',
          request_id: generateUuid(),
          room_id: roomId
        });
      }

      if (this.wasPreviouslyConnected) {
        this.callbacks.onReconnected?.();
      }
      this.wasPreviouslyConnected = true;
    };

    this.socket.onmessage = (event: MessageEvent) => {
      this.handleIncomingMessage(event.data);
    };

    this.socket.onerror = (event: Event) => {
      console.warn('WebSocket error encountered:', event);
    };

    this.socket.onclose = (event: CloseEvent) => {
      this.stopHeartbeat();
      if (this.continuousTimer) {
        clearTimeout(this.continuousTimer);
        this.continuousTimer = null;
      }
      this.socket = null;

      // Resolve pending subscribes with null on connection drop
      this.resolveAllPendingSubscribes(null);

      const code = event.code;
      console.log(`WebSocket closed (code: ${code}, reason: "${event.reason}")`);

      if (this.explicitlyDisconnected || code === 1000) {
        this.setState('disconnected', undefined, code);
        return;
      }

      // Close Code 4401: Session expired
      if (code === 4401) {
        this.setState('disconnected', 'Session expired', code);
        this.callbacks.onAuthExpired?.();
        return;
      }

      // Close Code 1008 (Policy Violation) or 1009 (Message Too Big): Permanent errors
      if (code === 1008 || code === 1009) {
        this.setState('error', `WebSocket closed with permanent error ${code}: ${event.reason}`, code);
        return;
      }

      // Codes 1001 (Going Away), 1013 (Try Again Later), 4002 (Protocol Anomaly), and abnormal closures (1006)
      this.setState('reconnecting', event.reason || undefined, code);
      this.scheduleReconnect();
    };
  }

  /**
   * Closes the connection cleanly.
   */
  public disconnect(): void {
    this.explicitlyDisconnected = true;
    this.clearTimers();
    this.resolveAllPendingSubscribes(null);
    if (this.socket) {
      try {
        this.socket.close(1000, 'User initiated disconnect');
      } catch {
        // Ignored
      }
      this.socket = null;
    }
    this.setState('disconnected');
  }

  /**
   * Intentionally closes connection with a specific code to simulate chaos/testing (e.g. 1001 or 1013).
   */
  public forceDisconnect(code = 1001): void {
    this.explicitlyDisconnected = false;
    this.stopHeartbeat();
    this.resolveAllPendingSubscribes(null);
    if (this.socket) {
      try {
        this.socket.close(code, 'Simulated Chaos Disconnect');
      } catch {
        // Ignored
      }
    }
  }

  /**
   * Tracks and subscribes to a chat room, returning a Promise that resolves when 'subscribed'
   * confirmation arrives, or resolves with null after timeoutMs (or WS offline/closed).
   */
  public subscribeRoom(roomId: string, timeoutMs = 2500): Promise<string | null> {
    this.subscribedRooms.add(roomId);

    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.sendWsMessage({
        type: 'subscribe',
        request_id: generateUuid(),
        room_id: roomId
      });
    }

    return new Promise<string | null>((resolve) => {
      let timer: ReturnType<typeof setTimeout> | null = null;
      const cb = (lastSeq: string | null) => {
        if (timer) {
          clearTimeout(timer);
          timer = null;
        }
        resolve(lastSeq);
      };

      const existing = this.pendingSubscribes.get(roomId) || [];
      this.pendingSubscribes.set(roomId, [...existing, cb]);

      timer = setTimeout(() => {
        const current = this.pendingSubscribes.get(roomId) || [];
        const filtered = current.filter((w) => w !== cb);
        if (filtered.length > 0) {
          this.pendingSubscribes.set(roomId, filtered);
        } else {
          this.pendingSubscribes.delete(roomId);
        }
        resolve(null);
      }, timeoutMs);
    });
  }

  /**
   * Unsubscribes and stops tracking a chat room.
   */
  public unsubscribeRoom(roomId: string): void {
    this.subscribedRooms.delete(roomId);
    this.resolvePendingSubscribes(roomId, null);

    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.sendWsMessage({
        type: 'unsubscribe',
        request_id: generateUuid(),
        room_id: roomId
      });
    }
  }

  private resolvePendingSubscribes(roomId: string, result: string | null): void {
    const waiters = this.pendingSubscribes.get(roomId);
    if (waiters && waiters.length > 0) {
      this.pendingSubscribes.delete(roomId);
      for (const cb of waiters) {
        cb(result);
      }
    }
  }

  private resolveAllPendingSubscribes(result: string | null): void {
    for (const [, waiters] of this.pendingSubscribes.entries()) {
      for (const cb of waiters) {
        cb(result);
      }
    }
    this.pendingSubscribes.clear();
  }

  private sendWsMessage(msg: WsClientMessage): void {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(msg));
    }
  }

  private reconnectDueToProtocolAnomaly(reason: string): void {
    if (this.socket) {
      try {
        this.socket.close(4002, reason);
      } catch {
        // Ignored
      }
    }
  }

  private handleIncomingMessage(rawData: string): void {
    let payload: WsServerMessage;
    try {
      payload = JSON.parse(rawData) as WsServerMessage;
    } catch {
      this.callbacks.onProtocolAnomaly?.(
        'Received malformed/invalid WebSocket frame; reconnecting and syncing per Section 5'
      );
      this.reconnectDueToProtocolAnomaly('Malformed JSON frame');
      return;
    }

    if (!payload || typeof payload !== 'object' || typeof (payload as { type?: unknown }).type !== 'string') {
      this.callbacks.onProtocolAnomaly?.(
        'Received malformed/invalid WebSocket frame; reconnecting and syncing per Section 5'
      );
      this.reconnectDueToProtocolAnomaly('Invalid frame object');
      return;
    }

    switch (payload.type) {
      case 'pong':
        if (this.pendingPingId && payload.request_id === this.pendingPingId) {
          if (this.pongTimeoutTimer) {
            clearTimeout(this.pongTimeoutTimer);
            this.pongTimeoutTimer = null;
          }
          this.pendingPingId = null;
        }
        break;

      case 'message.created': {
        const msg = payload.message;
        if (!msg || typeof msg.message_id !== 'string' || typeof msg.seq !== 'string') {
          this.callbacks.onProtocolAnomaly?.(
            'Received invalid message.created schema; reconnecting and syncing'
          );
          this.reconnectDueToProtocolAnomaly('Invalid message.created schema');
          return;
        }
        const targetRoomId = (payload as { room_id?: string }).room_id || msg?.room_id;
        if (targetRoomId) {
          this.callbacks.onMessageCreated?.(targetRoomId, msg);
        }
        break;
      }

      case 'subscribed':
        if (payload.room_id) {
          this.startContinuousTimer();
          this.resolvePendingSubscribes(payload.room_id, payload.last_seq);
          this.callbacks.onSubscribed?.(payload.room_id, payload.last_seq);
        }
        break;

      case 'unsubscribed':
        if (payload.room_id) {
          this.resolvePendingSubscribes(payload.room_id, null);
          this.callbacks.onUnsubscribed?.(payload.room_id);
        }
        break;

      case 'subscription.revoked': {
        const targetRoomId = payload.room_id;
        const reason = payload.reason || 'ACCESS_REVOKED';
        if (targetRoomId) {
          this.subscribedRooms.delete(targetRoomId);
          this.resolvePendingSubscribes(targetRoomId, null);
          this.callbacks.onSubscriptionRevoked?.(targetRoomId, reason);
        }
        break;
      }

      case 'error': {
        const errObj = (payload as { error?: { code?: string; message?: string }; code?: string; message?: string });
        const errCode = errObj.error?.code || errObj.code || 'WS_ERROR';
        const errMsg = errObj.error?.message || errObj.message || 'WebSocket command error';
        this.callbacks.onError?.(errCode, errMsg);
        break;
      }

      default:
        this.callbacks.onProtocolAnomaly?.(
          `Ignored unknown WebSocket event type: ${String((payload as { type?: unknown }).type)}`
        );
        break;
    }
  }

  /**
   * Heartbeat: Sends ping every 25,000ms; expects matching pong within 10,000ms.
   */
  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.pingIntervalTimer = setInterval(() => {
      if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return;

      const pingId = generateUuid();
      this.pendingPingId = pingId;
      this.sendWsMessage({ type: 'ping', request_id: pingId });

      // If matching pong is not received within 10,000ms, close socket to trigger reconnect
      this.pongTimeoutTimer = setTimeout(() => {
        console.warn('WebSocket heartbeat timeout: no pong received within 10s. Reconnecting...');
        if (this.socket) {
          try {
            this.socket.close(4000, 'Heartbeat timeout');
          } catch {
            // Ignored
          }
        }
      }, 10000);
    }, 25000);
  }

  private stopHeartbeat(): void {
    if (this.pingIntervalTimer) {
      clearInterval(this.pingIntervalTimer);
      this.pingIntervalTimer = null;
    }
    if (this.pongTimeoutTimer) {
      clearTimeout(this.pongTimeoutTimer);
      this.pongTimeoutTimer = null;
    }
    this.pendingPingId = null;
  }

  /**
   * Full-jitter exponential backoff:
   * random in [0, min(30000, 1000 * 2^attempt)]
   */
  private scheduleReconnect(): void {
    if (this.explicitlyDisconnected) return;
    if (this.reconnectTimer) return;

    this.reconnectAttempt++;
    const maxDelay = Math.min(30000, 1000 * Math.pow(2, this.reconnectAttempt));
    const delay = Math.floor(Math.random() * maxDelay);

    console.log(`Scheduling WebSocket reconnect attempt #${this.reconnectAttempt} in ${delay}ms`);

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  private clearTimers(): void {
    this.stopHeartbeat();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.continuousTimer) {
      clearTimeout(this.continuousTimer);
      this.continuousTimer = null;
    }
  }
}

export const wsClient = new WsClient();
