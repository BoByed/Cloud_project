<script lang="ts">
  import { chatEngine } from '../services/chat-engine.svelte.js';
  import { getUtf8ByteLength, validateMessageText } from '../types/contract.js';

  let text = $state('');
  let isSending = $state(false);
  let errorMessage = $state<string | null>(null);

  let byteLength = $derived(getUtf8ByteLength(text));
  let validation = $derived(validateMessageText(text));
  let isRevoked = $derived(
    Boolean(chatEngine.activeRoomId && chatEngine.revokedRooms && chatEngine.revokedRooms[chatEngine.activeRoomId])
  );
  let canSend = $derived(validation.valid && !isSending && !isRevoked);

  let placeholderText = $derived(
    isRevoked
      ? 'ไม่สามารถส่งข้อความได้เนื่องจากสิทธิ์สมาชิกในห้องนี้ถูกเพิกถอน (404 / ACCESS_REVOKED)'
      : 'พิมพ์ข้อความ... (Enter เพื่อส่ง, Shift + Enter เพื่อขึ้นบรรทัดใหม่)'
  );

  async function handleSend() {
    if (!canSend) return;

    isSending = true;
    errorMessage = null;
    const textToSend = text;

    try {
      // Clear input immediately for snappy user experience
      text = '';
      await chatEngine.sendMessage(textToSend);
    } catch (err) {
      // Note: chatEngine will keep the message in pending_sends as failed_retryable / failed_permanent
      // so the message is not lost.
      errorMessage = err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการส่ง';
    } finally {
      isSending = false;
    }
  }

  function handleKeyDown(event: KeyboardEvent) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleSend();
    }
  }
</script>

<div class="composer-wrapper">
  <!-- Top Chaos Toggle Strip -->
  <div class="composer-chaos-strip">
    <label class="chaos-toggle" title="เมื่อเปิดใช้งาน: เบราว์เซอร์จะจำลองการขาดการเชื่อมต่อทันทีหลังยิงคำขอ เพื่อทดสอบการกด Retry ด้วย client_message_id เดิม (Idempotency)">
      <input
        type="checkbox"
        bind:checked={chatEngine.simulateTimeoutOnSend}
      />
      <span class="chaos-label">
        <span class="zap-icon">⚡</span>
        จำลองเน็ตหลุดหลังส่ง (Timeout Test)
      </span>
    </label>

    <div class="byte-indicator {byteLength > 4096 ? 'danger' : byteLength > 3500 ? 'warning' : ''}">
      <span>{byteLength.toLocaleString()} / 4,096 bytes (UTF-8)</span>
    </div>
  </div>

  <!-- Message Composer Bar -->
  <div class="composer-bar {isRevoked ? 'revoked' : ''}">
    <div class="textarea-container">
      <textarea
        class="composer-textarea"
        placeholder={placeholderText}
        bind:value={text}
        onkeydown={handleKeyDown}
        disabled={isSending || isRevoked}
        rows="1"
      ></textarea>
    </div>

    <!-- Send Button -->
    <button
      type="button"
      class="send-btn"
      disabled={!canSend}
      onclick={handleSend}
      aria-label="ส่งข้อความ"
      title={isRevoked ? 'สิทธิ์สมาชิกถูกเพิกถอน' : canSend ? 'ส่งข้อความ (Enter)' : validation.reason || 'พิมพ์ข้อความก่อนส่ง'}
    >
      <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
        <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
      </svg>
    </button>
  </div>

  <!-- Validation / Send Error Alert -->
  {#if errorMessage}
    <div class="composer-alert">
      <span>⚠️ {errorMessage}</span>
      <button type="button" class="dismiss-alert" onclick={() => errorMessage = null}>×</button>
    </div>
  {/if}
</div>

<style>
  .composer-wrapper {
    background-color: var(--bg-surface);
    border-top: 1px solid var(--border);
    padding: 10px 16px 14px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    flex-shrink: 0;
  }

  .composer-chaos-strip {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 11px;
    user-select: none;
  }

  .chaos-toggle {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    cursor: pointer;
    color: var(--text-secondary);
    padding: 2px 6px;
    border-radius: 6px;
    transition: background-color 0.15s ease;
  }

  .chaos-toggle:hover {
    background-color: var(--bg-input);
    color: var(--text-primary);
  }

  .chaos-label {
    display: flex;
    align-items: center;
    gap: 4px;
    font-weight: 500;
  }

  .zap-icon {
    color: var(--status-yellow);
  }

  .byte-indicator {
    font-family: monospace;
    font-size: 11px;
    color: var(--text-secondary);
  }

  .byte-indicator.warning {
    color: var(--status-yellow);
    font-weight: 600;
  }

  .byte-indicator.danger {
    color: var(--status-red);
    font-weight: 700;
  }

  .composer-bar {
    display: flex;
    align-items: flex-end;
    gap: 8px;
    background-color: var(--bg-input);
    border-radius: 20px;
    padding: 4px 6px 4px 12px;
    border: 1px solid var(--border);
    transition: border-color 0.15s ease, box-shadow 0.15s ease;
  }

  .composer-bar.revoked {
    opacity: 0.7;
    background-color: var(--item-hover);
    cursor: not-allowed;
  }

  .composer-bar:focus-within {
    border-color: var(--brand-blue);
    box-shadow: 0 0 0 1px var(--brand-blue);
  }

  .textarea-container {
    flex: 1;
    display: flex;
    min-width: 0;
  }

  .send-btn {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    border: none;
    background: var(--brand-gradient);
    color: white;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    flex-shrink: 0;
    transition: transform 0.1s ease, opacity 0.15s ease;
    padding-left: 3px; /* visual center for send arrow */
  }

  .send-btn:hover:not(:disabled) {
    transform: scale(1.06);
  }

  .send-btn:active:not(:disabled) {
    transform: scale(0.95);
  }

  .send-btn:disabled {
    background: var(--border);
    color: var(--text-tertiary);
    cursor: not-allowed;
    opacity: 0.6;
  }

  .composer-alert {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 6px 12px;
    background-color: rgba(250, 56, 62, 0.12);
    border-radius: 8px;
    color: var(--status-red);
    font-size: 12px;
  }

  .dismiss-alert {
    background: transparent;
    border: none;
    font-size: 16px;
    color: var(--status-red);
    cursor: pointer;
  }
</style>
