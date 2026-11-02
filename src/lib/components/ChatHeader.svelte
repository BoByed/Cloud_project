<script lang="ts">
  import { chatEngine } from '../services/chat-engine.svelte.js';

  // Props
  let {
    isDevDrawerOpen = false,
    onToggleDevDrawer
  }: {
    isDevDrawerOpen?: boolean;
    onToggleDevDrawer?: () => void;
  } = $props();

  let room = $derived(chatEngine.activeRoom);
  let cursor = $derived(chatEngine.activeCursor);
  let isSyncing = $derived(
    room ? (chatEngine.syncingByRoom[room.room_id] ?? false) : false
  );
  let isRevoked = $derived(
    Boolean(chatEngine.activeRoomId && chatEngine.revokedRooms && chatEngine.revokedRooms[chatEngine.activeRoomId])
  );

  function getAvatarInitials(title: string): string {
    return title
      .split(' ')
      .map((s) => s[0])
      .filter(Boolean)
      .slice(0, 2)
      .join('')
      .toUpperCase() || '💬';
  }
</script>

{#if room}
  <header class="chat-header">
    <div class="header-left">
      <div class="room-avatar {room.kind}">
        {getAvatarInitials(room.title)}
      </div>

      <div class="room-meta">
        <div class="title-line">
          <h2 class="room-title">{room.title}</h2>
          <span class="role-badge {room.membership_role}">{room.membership_role}</span>
          <span class="kind-badge">{room.kind.toUpperCase()}</span>
        </div>

        <div class="status-line">
          <!-- WebSocket Status Pill -->
          <div class="ws-status-pill {chatEngine.wsState}">
            <span class="ws-dot"></span>
            {#if chatEngine.wsState === 'connected'}
              <span>Connected (chat.v1)</span>
            {:else if chatEngine.wsState === 'reconnecting'}
              <span>Reconnecting (#{chatEngine.reconnectAttempt})...</span>
            {:else if chatEngine.wsState === 'connecting'}
              <span>Connecting...</span>
            {:else}
              <span>Disconnected</span>
            {/if}
          </div>

          <!-- Contiguous Recovery Cursor Badge -->
          <div class="cursor-badge" title="Contiguous Sequence Cursor (Section 6)">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            <span>Cursor seq: #{cursor}</span>
          </div>

          <!-- Worker Paused Badge -->
          {#if chatEngine.workerPaused}
            <span class="worker-paused-badge" title="Outbox Worker is paused on server (M2 Simulation)">
              ⏸️ Worker Paused (Outbox: {chatEngine.outboxBacklogCount})
            </span>
          {/if}

          <!-- Revocation Badge & Restore Action -->
          {#if isRevoked}
            <span class="revoked-badge" title="Access Revoked per Section 5 & 7">
              🚫 ถูกลบสิทธิ์สมาชิก (Access Revoked)
            </span>
            <button
              type="button"
              class="restore-btn"
              onclick={() => chatEngine.simulateRestoreMember()}
              title="ขอคืนสิทธิ์สมาชิกและกลับเข้าห้อง"
            >
              🔄 คืนสิทธิ์สมาชิก
            </button>
          {/if}
        </div>
      </div>
    </div>

    <div class="header-right">
      <!-- Sync Button -->
      <button
        type="button"
        class="action-btn sync-btn"
        disabled={isSyncing}
        onclick={() => room && chatEngine.syncRoom(room.room_id)}
        title="รัน Contiguous Recovery Sync ทันที (Section 6)"
      >
        <svg
          class={isSyncing ? 'spin-icon' : ''}
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
        </svg>
        <span>{isSyncing ? 'กำลัง Sync...' : 'Sync ทันที'}</span>
      </button>

      <!-- Dev Simulator Drawer Toggle -->
      {#if onToggleDevDrawer}
        <button
          type="button"
          class="action-btn dev-toggle-btn {isDevDrawerOpen ? 'active' : ''}"
          onclick={onToggleDevDrawer}
          title="เปิด/ปิด แผง Dev Simulator (M1/M2)"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
          </svg>
          <span>Dev Simulator</span>
        </button>
      {/if}
    </div>
  </header>
{/if}

<style>
  .chat-header {
    height: 64px;
    padding: 0 20px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    background-color: var(--bg-surface);
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
    user-select: none;
    z-index: 10;
  }

  .header-left {
    display: flex;
    align-items: center;
    gap: 12px;
    min-width: 0;
  }

  .room-avatar {
    width: 42px;
    height: 42px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 600;
    font-size: 14px;
    color: white;
    flex-shrink: 0;
  }

  .room-avatar.group {
    background: linear-gradient(135deg, #8a2be2 0%, #4a00e0 100%);
  }

  .room-avatar.dm {
    background: linear-gradient(135deg, #0084ff 0%, #00c6ff 100%);
  }

  .room-meta {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .title-line {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .room-title {
    font-size: 16px;
    font-weight: 700;
    color: var(--text-primary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .role-badge {
    font-size: 10px;
    text-transform: uppercase;
    padding: 1px 6px;
    border-radius: 8px;
    font-weight: 600;
    background-color: var(--bg-input);
    color: var(--text-secondary);
  }

  .role-badge.owner {
    color: #e67e22;
    background-color: rgba(230, 126, 34, 0.12);
  }

  .role-badge.admin {
    color: var(--brand-blue);
    background-color: rgba(0, 132, 255, 0.12);
  }

  .kind-badge {
    font-size: 10px;
    font-weight: 600;
    padding: 1px 6px;
    border-radius: 8px;
    background-color: var(--bg-input);
    color: var(--text-secondary);
  }

  .status-line {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 12px;
  }

  .ws-status-pill {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-size: 11px;
    color: var(--text-secondary);
  }

  .ws-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .ws-status-pill.connected .ws-dot {
    background-color: var(--status-green);
    box-shadow: 0 0 6px var(--status-green);
  }

  .ws-status-pill.reconnecting .ws-dot,
  .ws-status-pill.connecting .ws-dot {
    background-color: var(--status-yellow);
  }

  .ws-status-pill.disconnected .ws-dot,
  .ws-status-pill.error .ws-dot {
    background-color: var(--status-red);
  }

  .cursor-badge {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-family: monospace;
    font-size: 11px;
    padding: 2px 7px;
    border-radius: 12px;
    background-color: var(--bg-input);
    color: var(--text-secondary);
  }

  .header-right {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .action-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 7px 12px;
    border-radius: 8px;
    border: 1px solid var(--border);
    background-color: var(--bg-surface);
    color: var(--text-primary);
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .action-btn:hover:not(:disabled) {
    background-color: var(--item-hover);
    border-color: var(--brand-blue);
  }

  .action-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .sync-btn {
    color: var(--brand-blue);
  }

  .dev-toggle-btn.active {
    background-color: var(--item-active);
    border-color: var(--brand-blue);
    color: var(--brand-blue);
    font-weight: 600;
  }

  .worker-paused-badge {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 11px;
    font-weight: 600;
    padding: 2px 8px;
    border-radius: 12px;
    background-color: rgba(230, 126, 34, 0.15);
    color: #b35900;
    border: 1px solid rgba(230, 126, 34, 0.3);
  }

  .revoked-badge {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 11px;
    font-weight: 700;
    padding: 2px 8px;
    border-radius: 12px;
    background-color: rgba(250, 56, 62, 0.15);
    color: var(--status-red);
    border: 1px solid rgba(250, 56, 62, 0.35);
    animation: pulse-soft 2s infinite ease-in-out;
  }

  .restore-btn {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px 8px;
    border-radius: 8px;
    border: 1px solid var(--brand-blue);
    background-color: rgba(0, 132, 255, 0.1);
    color: var(--brand-blue);
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .restore-btn:hover {
    background-color: var(--brand-blue);
    color: white;
  }

  @keyframes pulse-soft {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.7; }
  }
</style>
