<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { chatEngine } from '../services/chat-engine.svelte.js';
  import type { Message, PendingMessage } from '../types/contract.js';
  import { getUtf8ByteLength, validateMessageText } from '../types/contract.js';

  let messagesContainer = $state<HTMLElement | null>(null);
  let editDialog = $state<HTMLDialogElement | null>(null);

  // Edit modal state
  let editingItem = $state<PendingMessage | null>(null);
  let editText = $state('');
  let editError = $state<string | null>(null);
  let editByteLength = $derived(getUtf8ByteLength(editText));

  let messages = $derived(chatEngine.activeMessages);
  let pendingSends = $derived(chatEngine.activePending);
  let activeRoom = $derived(chatEngine.activeRoom);
  let hasMoreHistory = $derived(
    activeRoom ? (chatEngine.historyHasMoreByRoom[activeRoom.room_id] ?? false) : false
  );
  let revokedReason = $derived(
    chatEngine.activeRoomId && chatEngine.revokedRooms
      ? chatEngine.revokedRooms[chatEngine.activeRoomId]
      : null
  );

  // Auto-scroll helper
  async function scrollToBottom(smooth = false) {
    await tick();
    if (messagesContainer) {
      messagesContainer.scrollTo({
        top: messagesContainer.scrollHeight,
        behavior: smooth ? 'smooth' : 'auto'
      });
    }
  }

  // Scroll to bottom when messages count changes
  $effect(() => {
    if (messages.length > 0 || pendingSends.length > 0) {
      scrollToBottom(true);
    }
  });

  // Modern Web Guidance: light-dismiss-a-dialog fallback
  onMount(() => {
    scrollToBottom(false);

    if (editDialog && !('closedBy' in HTMLDialogElement.prototype)) {
      editDialog.addEventListener('click', (event: MouseEvent) => {
        if (event.target !== editDialog) return;
        const rect = editDialog.getBoundingClientRect();
        const isDialogContent =
          rect.top <= event.clientY &&
          event.clientY <= rect.top + rect.height &&
          rect.left <= event.clientX &&
          event.clientX <= rect.left + rect.width;

        if (isDialogContent) return;
        editDialog.close();
      });
    }
  });

  function openEditModal(item: PendingMessage) {
    editingItem = item;
    editText = item.text;
    editError = null;
    if (editDialog) {
      editDialog.showModal();
    }
  }

  function closeEditModal() {
    if (editDialog) {
      editDialog.close();
    }
    editingItem = null;
    editText = '';
    editError = null;
  }

  async function handleConfirmEdit() {
    if (!editingItem) return;
    const validation = validateMessageText(editText);
    if (!validation.valid) {
      editError = validation.reason || 'ข้อความไม่ถูกต้อง';
      return;
    }

    try {
      await chatEngine.editAndResendPendingMessage(editingItem.client_message_id, editText);
      closeEditModal();
    } catch (err) {
      editError = err instanceof Error ? err.message : 'ส่งข้อความใหม่ไม่สำเร็จ';
    }
  }

  function formatTime(isoString: string): string {
    try {
      const d = new Date(isoString);
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
    } catch {
      return '';
    }
  }
</script>

<div class="message-list-viewport" bind:this={messagesContainer}>
  <!-- Revocation Warning Banner (Section 5 & 7) -->
  {#if revokedReason}
    <div class="revocation-banner">
      <div class="revocation-content">
        <span class="revocation-icon">🚫</span>
        <div class="revocation-text">
          <strong>คุณไม่ได้เป็นสมาชิกห้องนี้แล้ว ({revokedReason})</strong> — ระบบหยุดติดตาม WebSocket และระงับการส่งข้อความตามสัญญา Section 5 & 7
        </div>
      </div>
      <button
        type="button"
        class="restore-demo-btn"
        onclick={() => chatEngine.simulateRestoreMember()}
      >
        🔄 คืนสิทธิ์สมาชิกกลับเข้าห้อง (Demo Restore)
      </button>
    </div>
  {/if}

  <!-- Top Load More History Button -->
  {#if activeRoom}
    <div class="history-loader-area">
      {#if hasMoreHistory}
        <button
          type="button"
          class="load-more-btn"
          disabled={chatEngine.loadingHistory}
          onclick={() => chatEngine.loadOlderHistory()}
        >
          {#if chatEngine.loadingHistory}
            <span class="spin-icon">⏳</span> กำลังโหลดประวัติ...
          {:else}
            ↑ โหลดประวัติก่อนหน้า (before_seq)
          {/if}
        </button>
      {:else if messages.length > 0}
        <div class="history-start-pill">จุดเริ่มต้นของประวัติการสนทนาในเครื่อง</div>
      {/if}
    </div>
  {/if}

  <!-- Empty State -->
  {#if messages.length === 0 && pendingSends.length === 0}
    <div class="empty-state">
      <div class="empty-icon">👋</div>
      <p class="empty-title">ยังไม่มีข้อความในห้องนี้</p>
      <p class="empty-desc">เริ่มการสนทนาคนแรกด้วยการพิมพ์ข้อความด้านล่าง</p>
    </div>
  {/if}

  <!-- Confirmed Messages Timeline -->
  <div class="messages-stack">
    {#each messages as msg (msg.message_id)}
      {@const isSelf = msg.sender.user_id === chatEngine.session?.user.user_id}
      <div class="message-row {isSelf ? 'self' : 'peer'}">
        <!-- Peer Avatar -->
        {#if !isSelf}
          <div class="sender-avatar" title="{msg.sender.display_name} ({msg.sender.user_id})">
            {msg.sender.display_name.slice(0, 2).toUpperCase()}
          </div>
        {/if}

        <div class="bubble-container">
          <!-- Peer Sender Name Header -->
          {#if !isSelf}
            <span class="sender-name">{msg.sender.display_name}</span>
          {/if}

          <!-- Plain Text Bubble (No HTML interpretation) -->
          <div class="bubble">
            <span class="bubble-text">{msg.text}</span>
          </div>

          <!-- Bubble Metadata (Seq & Time) -->
          <div class="bubble-meta">
            <span class="seq-tag">#{msg.seq}</span>
            <span class="time-tag">{formatTime(msg.created_at)}</span>
          </div>
        </div>
      </div>
    {/each}

    <!-- Pending Outbox Section (Section 4 & Section 6) -->
    {#if pendingSends.length > 0}
      <div class="pending-section-divider">
        <span>ข้อความรอยืนยัน (Outbox)</span>
      </div>

      {#each pendingSends as pending (pending.client_message_id)}
        <div class="message-row self pending {pending.status}">
          <div class="bubble-container">
            <!-- Plain Text Bubble -->
            <div class="bubble pending-bubble">
              <span class="bubble-text">{pending.text}</span>
            </div>

            <!-- Outbox Status & Action Bar -->
            <div class="pending-meta-bar">
              <span class="pending-id" title={pending.client_message_id}>
                ID: {pending.client_message_id.slice(0, 8)}...
              </span>

              {#if pending.status === 'sending' || pending.status === 'pending'}
                <span class="status-indicator sending">
                  <span class="spin-icon">⟳</span> กำลังส่ง...
                </span>
              {:else if pending.status === 'failed_retryable'}
                <div class="status-indicator retryable">
                  <span class="error-badge">⚠️ ส่งไม่สำเร็จ ({pending.error_code ?? 'เน็ตหลุด/Timeout'})</span>
                  <button
                    type="button"
                    class="retry-btn"
                    title="ลองส่งซ้ำโดยใช้ client_message_id เดิม เพื่อพิสูจน์ Idempotency"
                    onclick={() => chatEngine.retryPendingMessage(pending.client_message_id)}
                  >
                    ลองส่งซ้ำ (ใช้รหัสเดิม)
                  </button>
                  <button
                    type="button"
                    class="edit-btn"
                    title="แก้ไขข้อความ โดยจะล้างรายการเดิมและสร้าง client_message_id ใหม่"
                    onclick={() => openEditModal(pending)}
                  >
                    แก้ไขข้อความ (สร้างรหัสใหม่)
                  </button>
                  <button
                    type="button"
                    class="cancel-btn"
                    onclick={() => chatEngine.cancelPendingMessage(pending.client_message_id)}
                  >
                    ยกเลิก
                  </button>
                </div>
              {:else if pending.status === 'failed_permanent'}
                <div class="status-indicator permanent">
                  <span class="error-badge danger">❌ {pending.error_code ?? 'Error 4xx'}</span>
                  <button
                    type="button"
                    class="edit-btn"
                    title="แก้ไขข้อความ โดยจะล้างรายการเดิมและสร้าง client_message_id ใหม่"
                    onclick={() => openEditModal(pending)}
                  >
                    แก้ไขข้อความ (สร้างรหัสใหม่)
                  </button>
                  <button
                    type="button"
                    class="cancel-btn"
                    onclick={() => chatEngine.cancelPendingMessage(pending.client_message_id)}
                  >
                    ยกเลิก
                  </button>
                </div>
              {/if}
            </div>
          </div>
        </div>
      {/each}
    {/if}
  </div>
</div>

<!-- Modern Web Guidance: Native Light-Dismiss Dialog for Editing Failed Message -->
<!-- closedby="any" handles clicking backdrop, Esc key, and form submission -->
<dialog
  bind:this={editDialog}
  closedby="any"
  aria-labelledby="editDialogTitle"
  class="edit-modal"
>
  <div class="dialog-content">
    <div class="dialog-header">
      <h3 id="editDialogTitle">แก้ไขข้อความ (สร้างรหัสใหม่)</h3>
      <button type="button" class="close-x" onclick={closeEditModal} aria-label="ปิดหน้าต่าง">×</button>
    </div>

    <div class="dialog-body">
      <p class="dialog-hint">
        ตามสัญญาส่วนที่ 6: การแก้ไขเนื้อหาถือเป็นเจตนาใหม่ ระบบจะลบรายการเดิมและสร้าง <code>client_message_id</code> ใหม่ให้อัตโนมัติ
      </p>

      <textarea
        class="edit-textarea composer-textarea"
        bind:value={editText}
        placeholder="พิมพ์ข้อความใหม่ที่ต้องการส่ง..."
        rows="3"
      ></textarea>

      <div class="edit-footer-info">
        <span class="byte-counter {editByteLength > 4096 ? 'warning' : ''}">
          {editByteLength.toLocaleString()} / 4,096 bytes
        </span>
        {#if editError}
          <span class="edit-error-msg">{editError}</span>
        {/if}
      </div>
    </div>

    <div class="dialog-actions">
      <button type="button" class="btn-secondary" onclick={closeEditModal}>
        ยกเลิก
      </button>
      <button
        type="button"
        class="btn-primary"
        disabled={editByteLength === 0 || editByteLength > 4096}
        onclick={handleConfirmEdit}
      >
        ส่งข้อความใหม่
      </button>
    </div>
  </div>
</dialog>

<style>
  .message-list-viewport {
    flex: 1;
    overflow-y: auto;
    padding: 16px 20px;
    display: flex;
    flex-direction: column;
    background-color: var(--bg-surface);
  }

  .revocation-banner {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 12px 16px;
    margin-bottom: 16px;
    border-radius: 10px;
    background-color: rgba(250, 56, 62, 0.12);
    border: 1px solid rgba(250, 56, 62, 0.35);
    color: var(--status-red);
    flex-wrap: wrap;
  }

  .revocation-content {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 13px;
    flex: 1;
    min-width: 260px;
  }

  .revocation-icon {
    font-size: 20px;
    flex-shrink: 0;
  }

  .revocation-text {
    line-height: 1.4;
    color: var(--text-primary);
  }

  .revocation-text strong {
    color: var(--status-red);
  }

  .restore-demo-btn {
    padding: 6px 14px;
    border-radius: 8px;
    border: 1px solid var(--status-red);
    background-color: var(--status-red);
    color: white;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    white-space: nowrap;
    transition: all 0.15s ease;
  }

  .restore-demo-btn:hover {
    background-color: #d93025;
    border-color: #d93025;
    transform: scale(1.02);
  }

  .history-loader-area {
    display: flex;
    justify-content: center;
    margin-bottom: 16px;
  }

  .load-more-btn {
    padding: 6px 14px;
    border-radius: 16px;
    border: 1px solid var(--border);
    background-color: var(--bg-input);
    color: var(--text-primary);
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .load-more-btn:hover:not(:disabled) {
    background-color: var(--item-hover);
    border-color: var(--brand-blue);
    color: var(--brand-blue);
  }

  .load-more-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .history-start-pill {
    font-size: 11px;
    color: var(--text-secondary);
    background-color: var(--bg-input);
    padding: 3px 10px;
    border-radius: 10px;
  }

  .empty-state {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    color: var(--text-secondary);
    text-align: center;
    padding: 40px;
  }

  .empty-icon {
    font-size: 48px;
    margin-bottom: 12px;
  }

  .empty-title {
    font-size: 16px;
    font-weight: 600;
    color: var(--text-primary);
    margin-bottom: 4px;
  }

  .empty-desc {
    font-size: 13px;
  }

  .messages-stack {
    display: flex;
    flex-direction: column;
    gap: 12px;
    min-height: min-content;
  }

  .message-row {
    display: flex;
    gap: 8px;
    max-width: 75%;
  }

  .message-row.peer {
    align-self: flex-start;
  }

  .message-row.self {
    align-self: flex-end;
    flex-direction: row-reverse;
  }

  .sender-avatar {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    background: var(--border);
    color: var(--text-primary);
    font-size: 11px;
    font-weight: 600;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    align-self: flex-end;
  }

  .bubble-container {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .message-row.self .bubble-container {
    align-items: flex-end;
  }

  .sender-name {
    font-size: 11px;
    color: var(--text-secondary);
    padding-left: 4px;
    font-weight: 500;
  }

  /* Bubble Styling */
  .bubble {
    padding: 9px 14px;
    border-radius: 18px;
    font-size: 14px;
    line-height: 1.4;
    word-break: break-word;
    white-space: pre-wrap;
    user-select: text;
  }

  .message-row.peer .bubble {
    background-color: var(--bubble-in-bg);
    color: var(--bubble-in-text);
    border-bottom-left-radius: 4px;
  }

  .message-row.self .bubble {
    background: var(--brand-gradient);
    color: var(--bubble-out-text);
    border-bottom-right-radius: 4px;
  }

  .bubble-meta {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    color: var(--text-secondary);
    padding: 0 4px;
  }

  .seq-tag {
    font-family: monospace;
    font-size: 10px;
    opacity: 0.8;
  }

  .time-tag {
    font-size: 10px;
  }

  /* Pending / Outbox Section */
  .pending-section-divider {
    display: flex;
    align-items: center;
    justify-content: center;
    margin: 16px 0 8px;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    color: var(--text-secondary);
    position: relative;
  }

  .pending-section-divider::before,
  .pending-section-divider::after {
    content: '';
    flex: 1;
    height: 1px;
    background-color: var(--border);
    margin: 0 10px;
  }

  .message-row.pending .bubble {
    opacity: 0.85;
    border: 1px dashed var(--brand-blue);
  }

  .message-row.pending.failed_retryable .bubble {
    border-color: var(--status-yellow);
    background: rgba(245, 166, 35, 0.15);
    color: var(--text-primary);
  }

  .message-row.pending.failed_permanent .bubble {
    border-color: var(--status-red);
    background: rgba(250, 56, 62, 0.15);
    color: var(--text-primary);
  }

  .pending-meta-bar {
    display: flex;
    flex-direction: column;
    gap: 4px;
    align-items: flex-end;
    margin-top: 2px;
  }

  .pending-id {
    font-family: monospace;
    font-size: 10px;
    color: var(--text-secondary);
  }

  .status-indicator {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    flex-wrap: wrap;
    justify-content: flex-end;
  }

  .status-indicator.sending {
    color: var(--brand-blue);
  }

  .error-badge {
    padding: 2px 6px;
    border-radius: 4px;
    background-color: rgba(245, 166, 35, 0.15);
    color: #b37400;
    font-size: 11px;
  }

  .error-badge.danger {
    background-color: rgba(250, 56, 62, 0.15);
    color: var(--status-red);
  }

  .retry-btn,
  .edit-btn,
  .cancel-btn {
    padding: 3px 8px;
    border-radius: 6px;
    border: 1px solid var(--border);
    background-color: var(--bg-surface);
    color: var(--text-primary);
    font-size: 11px;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .retry-btn {
    border-color: var(--brand-blue);
    color: var(--brand-blue);
    font-weight: 600;
  }

  .retry-btn:hover {
    background-color: var(--item-active);
  }

  .edit-btn {
    border-color: #e67e22;
    color: #e67e22;
    font-weight: 600;
  }

  .edit-btn:hover {
    background-color: rgba(230, 126, 34, 0.12);
  }

  .cancel-btn:hover {
    background-color: var(--item-hover);
    color: var(--status-red);
  }

  /* Edit Dialog */
  .edit-modal {
    padding: 0;
  }

  .dialog-content {
    padding: 20px;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .dialog-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .dialog-header h3 {
    font-size: 16px;
    font-weight: 700;
    color: var(--text-primary);
  }

  .close-x {
    background: transparent;
    border: none;
    font-size: 20px;
    color: var(--text-secondary);
    cursor: pointer;
  }

  .dialog-body {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .dialog-hint {
    font-size: 12px;
    color: var(--text-secondary);
    line-height: 1.4;
  }

  .dialog-hint code {
    font-family: monospace;
    background-color: var(--bg-input);
    padding: 1px 4px;
    border-radius: 4px;
  }

  .edit-textarea {
    border: 1px solid var(--border) !important;
    border-radius: 8px !important;
    background-color: var(--bg-input) !important;
    padding: 10px !important;
  }

  .edit-footer-info {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 11px;
  }

  .byte-counter {
    color: var(--text-secondary);
  }

  .byte-counter.warning {
    color: var(--status-red);
    font-weight: 600;
  }

  .edit-error-msg {
    color: var(--status-red);
  }

  .dialog-actions {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 8px;
  }

  .btn-primary,
  .btn-secondary {
    padding: 8px 16px;
    border-radius: 8px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .btn-primary {
    border: none;
    background: var(--brand-gradient);
    color: white;
  }

  .btn-primary:hover:not(:disabled) {
    opacity: 0.92;
    transform: translateY(-1px);
  }

  .btn-primary:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .btn-secondary {
    border: 1px solid var(--border);
    background-color: var(--bg-surface);
    color: var(--text-primary);
  }

  .btn-secondary:hover {
    background-color: var(--item-hover);
  }
</style>
