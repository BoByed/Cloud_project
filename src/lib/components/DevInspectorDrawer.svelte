<script lang="ts">
  import { onMount } from 'svelte';
  import { chatEngine } from '../services/chat-engine.svelte.js';

  let { onClose }: { onClose: () => void } = $props();

  // Card 1: Idempotency state
  let idempotencyRunning = $state(false);
  let idempotencyResult = $state<{
    total: number;
    created201: number;
    replayed200: number;
    uniqueMessageIds: number;
    seq: string;
  } | null>(null);
  let idempotencyError = $state<string | null>(null);

  // 409 Conflict state
  let conflict409Running = $state(false);
  let conflict409Result = $state<{
    code: string;
    status: number;
    message: string;
    clientMessageId?: string;
  } | null>(null);
  let conflict409Error = $state<string | null>(null);

  // Loading flags for chaos actions
  let actionLoading = $state<string | null>(null);

  onMount(() => {
    if (typeof chatEngine.refreshDevChaosStatus === 'function') {
      chatEngine.refreshDevChaosStatus().catch(() => {});
    }
  });

  async function runIdempotencyTest(count: number) {
    idempotencyRunning = true;
    idempotencyResult = null;
    idempotencyError = null;

    try {
      const res = await chatEngine.runConcurrentIdempotencyDemo(count);
      idempotencyResult = res;
    } catch (err) {
      idempotencyError = err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการทดสอบ';
    } finally {
      idempotencyRunning = false;
    }
  }

  async function runConflict409Test() {
    conflict409Running = true;
    conflict409Result = null;
    conflict409Error = null;

    try {
      const res = await chatEngine.simulateIdempotencyConflict409();
      if (res) {
        conflict409Result = res;
      }
    } catch (err) {
      conflict409Error = err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการทดสอบ 409';
    } finally {
      conflict409Running = false;
    }
  }

  async function handleToggleWorker() {
    actionLoading = 'worker';
    try {
      await chatEngine.toggleOutboxWorker();
    } catch (err) {
      console.error('Failed to toggle worker:', err);
    } finally {
      actionLoading = null;
    }
  }

  async function handleSimulateIncoming() {
    actionLoading = 'incoming';
    try {
      await chatEngine.simulateIncomingFromPeer();
    } catch (err) {
      console.error(err);
    } finally {
      actionLoading = null;
    }
  }

  async function handleSimulateSilentPeerMessage() {
    actionLoading = 'silent';
    try {
      await chatEngine.simulateSilentPeerMessage();
    } catch (err) {
      console.error(err);
    } finally {
      actionLoading = null;
    }
  }

  async function handleSimulateDuplicateWs() {
    actionLoading = 'duplicate';
    try {
      await chatEngine.simulateDuplicateWsEvent();
    } catch (err) {
      console.error(err);
    } finally {
      actionLoading = null;
    }
  }

  async function handleSimulateOutOfOrderWs() {
    actionLoading = 'out_of_order';
    try {
      await chatEngine.simulateOutOfOrderWsEvent();
    } catch (err) {
      console.error(err);
    } finally {
      actionLoading = null;
    }
  }

  async function handleRemoveMember(silent: boolean) {
    actionLoading = silent ? 'remove_silent' : 'remove_loud';
    try {
      await chatEngine.simulateRemoveMember(silent);
    } catch (err) {
      console.error(err);
    } finally {
      actionLoading = null;
    }
  }

  async function handleRestoreMember() {
    actionLoading = 'restore';
    try {
      await chatEngine.simulateRestoreMember();
    } catch (err) {
      console.error(err);
    } finally {
      actionLoading = null;
    }
  }

  function clearLogs() {
    chatEngine.eventLog = [];
  }
</script>

<aside class="dev-drawer" aria-label="Dev Simulator & Inspector">
  <div class="drawer-header">
    <div class="drawer-title-group">
      <div class="drawer-icon">🛠️</div>
      <div>
        <h3 class="drawer-title">Dev Simulator (M1/M2)</h3>
        <p class="drawer-subtitle">Contract, Idempotency & Chaos Testing</p>
      </div>
    </div>
    <button type="button" class="drawer-close-btn" onclick={onClose} aria-label="ปิด Drawer">×</button>
  </div>

  <div class="drawer-content">
    <!-- Card 1: Idempotency & Conflict (Section 4 & 9) -->
    <section class="drawer-card">
      <h4 class="card-title">1. Idempotency & Conflict (Section 4 & 9)</h4>
      <p class="card-desc">
        ยิงคำขอ POST ด้วย <code>client_message_id</code> เดิมเพื่อพิสูจน์สัญญา Section 4 และ 9 ว่าไม่เกิดข้อความซ้ำ และปฏิเสธ 409 หากข้อความเปลี่ยน
      </p>

      <div class="btn-group">
        <button
          type="button"
          class="sim-btn primary"
          disabled={idempotencyRunning || !chatEngine.activeRoomId}
          onclick={() => runIdempotencyTest(20)}
        >
          {idempotencyRunning ? 'กำลังยิงคำขอ...' : '⚡ ยิงพร้อมกัน 20 ครั้ง (Same ID)'}
        </button>

        <button
          type="button"
          class="sim-btn purple"
          disabled={idempotencyRunning || !chatEngine.activeRoomId}
          onclick={() => runIdempotencyTest(100)}
        >
          {idempotencyRunning ? 'กำลังยิงคำขอ...' : '🔥 ยิงพร้อมกัน 100 ครั้ง (Same ID)'}
        </button>

        <button
          type="button"
          class="sim-btn warning"
          disabled={conflict409Running || !chatEngine.activeRoomId}
          onclick={runConflict409Test}
        >
          {conflict409Running ? 'กำลังทดสอบ...' : '⚠️ ทดสอบรหัสเดิมแต่เปลี่ยน Text (409 Conflict)'}
        </button>
      </div>

      {#if idempotencyResult}
        <div class="result-box success">
          <div class="result-header">✅ Idempotency Verified!</div>
          <div class="result-grid">
            <span class="grid-label">Total Requests:</span>
            <span class="grid-val">{idempotencyResult.total}</span>

            <span class="grid-label">201 Created:</span>
            <span class="grid-val highlight-green">{idempotencyResult.created201}</span>

            <span class="grid-label">200 Replayed:</span>
            <span class="grid-val highlight-blue">{idempotencyResult.replayed200}</span>

            <span class="grid-label">Unique message_id:</span>
            <span class="grid-val highlight-gold">{idempotencyResult.uniqueMessageIds} (ไม่เบิ้ล!)</span>

            <span class="grid-label">Assigned seq:</span>
            <span class="grid-val">#{idempotencyResult.seq}</span>
          </div>
        </div>
      {/if}

      {#if conflict409Result}
        <div class="result-box warning-box">
          <div class="result-header warn-color">⚠️ 409 Conflict Caught!</div>
          <div class="result-grid">
            <span class="grid-label">Status Code:</span>
            <span class="grid-val highlight-red">{conflict409Result.status}</span>

            <span class="grid-label">Error Code:</span>
            <span class="grid-val highlight-gold">{conflict409Result.code}</span>

            <span class="grid-label">Message:</span>
            <span class="grid-val">{conflict409Result.message}</span>

            {#if conflict409Result.clientMessageId}
              <span class="grid-label">Client ID:</span>
              <span class="grid-val">{conflict409Result.clientMessageId.slice(0, 8)}...</span>
            {/if}
          </div>
        </div>
      {/if}

      {#if idempotencyError}
        <div class="result-box error">
          <span>❌ {idempotencyError}</span>
        </div>
      {/if}
      {#if conflict409Error}
        <div class="result-box error">
          <span>❌ {conflict409Error}</span>
        </div>
      {/if}
    </section>

    <!-- Card 2: Transactional Outbox & Worker Simulation (M2) -->
    <section class="drawer-card">
      <div class="card-header-flex">
        <h4 class="card-title">2. Transactional Outbox & Worker (M2)</h4>
        <span class="worker-status-pill {chatEngine.workerPaused ? 'paused' : 'running'}">
          {chatEngine.workerPaused ? '⏸️ Worker Paused' : '▶️ Worker Running'}
        </span>
      </div>
      <p class="card-desc">
        จำลอง Transactional Outbox Pattern: เมื่อหยุด Worker ข้อความจะบันทึกในตารางสำเร็จ (201) แต่ดองไว้ยังไม่กระจาย WS จนกว่าจะเปิด Worker ให้ Flush งานค้าง
      </p>

      <div class="worker-meta-bar">
        <span class="backlog-label">Outbox Backlog:</span>
        <span class="backlog-counter {chatEngine.outboxBacklogCount > 0 ? 'has-backlog' : ''}">
          {chatEngine.outboxBacklogCount} งาน
        </span>
      </div>

      <button
        type="button"
        class="sim-btn {chatEngine.workerPaused ? 'success-btn' : 'warning'}"
        disabled={actionLoading === 'worker'}
        onclick={handleToggleWorker}
      >
        {#if actionLoading === 'worker'}
          กำลังสลับสถานะ...
        {:else if chatEngine.workerPaused}
          ▶️ เปิด Worker & ส่งงานค้าง (Flush Outbox)
        {:else}
          ⏸️ หยุด Outbox Worker (ดองงานแจ้งเตือน)
        {/if}
      </button>
    </section>

    <!-- Card 3: Live Event Anomalies & Silent Drop Recovery (Section 6 & 9) -->
    <section class="drawer-card">
      <h4 class="card-title">3. Live Event Anomalies & Silent Drop (Section 6 & 9)</h4>
      <p class="card-desc">
        ทดสอบพฤติกรรมเมื่อ WebSocket มีความผิดปกติ เช่น ข้อความหายเงียบ, เฟรมเบิ้ลซ้ำ, หรือเฟรมลัดคิว
      </p>

      <div class="btn-group">
        <button
          type="button"
          class="sim-btn"
          disabled={!chatEngine.activeRoomId || actionLoading === 'incoming'}
          onclick={handleSimulateIncoming}
        >
          💬 ให้เพื่อน (Demo B) ส่งข้อความสดเข้าห้อง
        </button>

        <button
          type="button"
          class="sim-btn secondary"
          disabled={!chatEngine.activeRoomId || actionLoading === 'silent'}
          onclick={handleSimulateSilentPeerMessage}
          title="เซิร์ฟเวอร์ commit ข้อความแต่ไม่บรอดแคสต์ WS รอตัวจับ 15s Periodic Sync หรือกด Sync กู้คืน"
        >
          🔇 เพื่อนส่งแต่แจ้งเตือน WS หายเงียบ (รอ Periodic Sync 15s กู้คืน)
        </button>

        <button
          type="button"
          class="sim-btn secondary"
          disabled={!chatEngine.activeRoomId || actionLoading === 'duplicate'}
          onclick={handleSimulateDuplicateWs}
          title="เซิร์ฟเวอร์ยิงเฟรม message.created ซ้ำ 3 ครั้งติดกัน พิสูจน์ไคลเอนต์กรองซ้ำด้วย message_id"
        >
          👯 ยิงเฟรม WS ซ้ำ 3 รอบ (พิสูจน์ตัดซ้ำด้วย message_id)
        </button>

        <button
          type="button"
          class="sim-btn secondary"
          disabled={!chatEngine.activeRoomId || actionLoading === 'out_of_order'}
          onclick={handleSimulateOutOfOrderWs}
          title="เซิร์ฟเวอร์ส่งข้อความ #N+2 ก่อน #N+1 พิสูจน์ไคลเอนต์ตรวจจับ Gap และกู้คืน"
        >
          🔀 ยิงเฟรม WS สลับลำดับ (#N+2 มาถึงก่อน #N+1)
        </button>
      </div>
    </section>

    <!-- Card 4: Membership Revocation (ACCESS_REVOKED & 404) -->
    <section class="drawer-card">
      <h4 class="card-title">4. Membership Revocation (ACCESS_REVOKED & 404)</h4>
      <p class="card-desc">
        ทดสอบการถูกเพิกถอนสิทธิ์สมาชิกตามสัญญา Section 5 & 7 ทั้งแบบรับ WS ทันที หรือแบบเงียบแล้วติด 404
      </p>

      <div class="btn-group">
        <button
          type="button"
          class="sim-btn danger"
          disabled={!chatEngine.activeRoomId || actionLoading === 'remove_loud'}
          onclick={() => handleRemoveMember(false)}
        >
          🚫 เตะออกจากห้องสดๆ (subscription.revoked)
        </button>

        <button
          type="button"
          class="sim-btn warning"
          disabled={!chatEngine.activeRoomId || actionLoading === 'remove_silent'}
          onclick={() => handleRemoveMember(true)}
          title="เตะออกเงียบๆ ไม่ส่ง WS แล้วลองส่งข้อความหรือ Sync เพื่อดูการตอบ 404 ROOM_NOT_FOUND"
        >
          🕵️ เตะออกจากห้องแบบเงียบ (แจ้งเตือนหาย แต่ส่ง/ซิงก์แล้วติด 404)
        </button>

        <button
          type="button"
          class="sim-btn success-btn"
          disabled={!chatEngine.activeRoomId || actionLoading === 'restore'}
          onclick={handleRestoreMember}
        >
          ✅ คืนสิทธิ์สมาชิกกลับเข้าห้อง
        </button>
      </div>
    </section>

    <!-- Card 5: WebSocket Chaos (1001 / 1013 / Gap Recovery) -->
    <section class="drawer-card">
      <h4 class="card-title">5. WebSocket Chaos & Auto-Recovery</h4>
      <p class="card-desc">
        สั่งตัด WebSocket ด้วย Close Code ต่างๆ เพื่อดู Full-Jitter Backoff และการรัน Contiguous Sync อัตโนมัติเมื่อกลับมาต่อติด
      </p>

      <div class="btn-group">
        <button
          type="button"
          class="sim-btn warning"
          onclick={() => chatEngine.simulateWsDisconnect(1001)}
        >
          🔌 สั่งหลุด: 1001 (Server Going Away)
        </button>
        <button
          type="button"
          class="sim-btn danger"
          onclick={() => chatEngine.simulateWsDisconnect(1013)}
        >
          🛑 สั่งหลุด: 1013 (Backpressure)
        </button>
        <button
          type="button"
          class="sim-btn secondary"
          disabled={!chatEngine.activeRoomId}
          onclick={() => chatEngine.simulateLocalGapAndSync()}
        >
          🕳️ จำลองข้อความแหว่ง (Gap Recovery Test)
        </button>
      </div>
    </section>

    <!-- Card 6: Live Protocol & Sync Event Log -->
    <section class="drawer-card logs-section">
      <div class="logs-header">
        <h4 class="card-title">6. Live Protocol & Sync Event Log</h4>
        <button type="button" class="clear-btn" onclick={clearLogs}>ล้าง Log</button>
      </div>

      <div class="logs-container">
        {#if chatEngine.eventLog.length === 0}
          <div class="empty-logs">ยังไม่มีบันทึกเหตุการณ์</div>
        {:else}
          {#each chatEngine.eventLog as log (log.id)}
            <div class="log-entry {log.type}">
              <span class="log-time">[{log.time}]</span>
              <span class="log-tag {log.type}">{log.type.toUpperCase()}</span>
              <span class="log-text">{log.text}</span>
            </div>
          {/each}
        {/if}
      </div>
    </section>
  </div>
</aside>

<style>
  .dev-drawer {
    width: 400px;
    height: 100%;
    background-color: var(--bg-surface);
    border-left: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    flex-shrink: 0;
    box-shadow: -4px 0 20px rgba(0, 0, 0, 0.08);
    z-index: 20;
    user-select: none;
  }

  .drawer-header {
    height: 64px;
    padding: 0 16px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    border-bottom: 1px solid var(--border);
    background-color: var(--bg-sidebar);
  }

  .drawer-title-group {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .drawer-icon {
    font-size: 20px;
  }

  .drawer-title {
    font-size: 14px;
    font-weight: 700;
    color: var(--text-primary);
  }

  .drawer-subtitle {
    font-size: 11px;
    color: var(--text-secondary);
  }

  .drawer-close-btn {
    background: transparent;
    border: none;
    font-size: 22px;
    color: var(--text-secondary);
    cursor: pointer;
    line-height: 1;
    padding: 4px;
  }

  .drawer-close-btn:hover {
    color: var(--text-primary);
  }

  .drawer-content {
    flex: 1;
    overflow-y: auto;
    padding: 14px;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .drawer-card {
    background-color: var(--bg-input);
    border-radius: 10px;
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    border: 1px solid var(--border);
  }

  .card-header-flex {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  .card-title {
    font-size: 13px;
    font-weight: 600;
    color: var(--text-primary);
  }

  .card-desc {
    font-size: 11px;
    color: var(--text-secondary);
    line-height: 1.4;
  }

  .card-desc code {
    font-family: monospace;
    background-color: var(--bg-surface);
    padding: 1px 4px;
    border-radius: 4px;
  }

  .btn-group {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .sim-btn {
    padding: 8px 12px;
    border-radius: 8px;
    border: 1px solid var(--border);
    background-color: var(--bg-surface);
    color: var(--text-primary);
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s ease;
    text-align: left;
    display: flex;
    align-items: center;
    justify-content: flex-start;
  }

  .sim-btn:hover:not(:disabled) {
    background-color: var(--item-hover);
    border-color: var(--brand-blue);
  }

  .sim-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .sim-btn.primary {
    background: var(--brand-blue);
    border-color: var(--brand-blue);
    color: white;
    font-weight: 600;
  }

  .sim-btn.primary:hover:not(:disabled) {
    background: var(--brand-blue-hover);
  }

  .sim-btn.purple {
    background: linear-gradient(135deg, #8a2be2 0%, #4a00e0 100%);
    border-color: #8a2be2;
    color: white;
    font-weight: 600;
  }

  .sim-btn.warning {
    border-color: var(--status-yellow);
    color: #b37400;
  }

  .sim-btn.danger {
    border-color: var(--status-red);
    color: var(--status-red);
  }

  .sim-btn.success-btn {
    border-color: var(--status-green);
    color: var(--status-green);
    font-weight: 600;
  }

  .sim-btn.success-btn:hover:not(:disabled) {
    background-color: rgba(49, 162, 76, 0.1);
  }

  .sim-btn.secondary {
    color: var(--text-secondary);
  }

  .sim-btn.secondary:hover:not(:disabled) {
    color: var(--text-primary);
  }

  /* Worker elements */
  .worker-status-pill {
    font-size: 11px;
    font-weight: 700;
    padding: 2px 8px;
    border-radius: 10px;
    white-space: nowrap;
  }

  .worker-status-pill.running {
    background-color: rgba(49, 162, 76, 0.15);
    color: var(--status-green);
    border: 1px solid rgba(49, 162, 76, 0.3);
  }

  .worker-status-pill.paused {
    background-color: rgba(230, 126, 34, 0.15);
    color: #e67e22;
    border: 1px solid rgba(230, 126, 34, 0.3);
  }

  .worker-meta-bar {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
    padding: 4px 6px;
    background-color: var(--bg-surface);
    border-radius: 6px;
    border: 1px solid var(--border);
  }

  .backlog-label {
    color: var(--text-secondary);
  }

  .backlog-counter {
    font-family: monospace;
    font-weight: 600;
    color: var(--text-primary);
  }

  .backlog-counter.has-backlog {
    color: #e67e22;
    font-weight: 700;
  }

  /* Results */
  .result-box {
    margin-top: 6px;
    padding: 10px;
    border-radius: 8px;
    font-size: 12px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .result-box.success {
    background-color: rgba(49, 162, 76, 0.12);
    border: 1px solid rgba(49, 162, 76, 0.3);
  }

  .result-box.warning-box {
    background-color: rgba(230, 126, 34, 0.12);
    border: 1px solid rgba(230, 126, 34, 0.35);
  }

  .result-box.error {
    background-color: rgba(250, 56, 62, 0.12);
    border: 1px solid rgba(250, 56, 62, 0.3);
    color: var(--status-red);
  }

  .result-header {
    font-weight: 700;
    color: var(--status-green);
  }

  .result-header.warn-color {
    color: #b35900;
  }

  .result-grid {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 4px 8px;
    font-size: 11px;
  }

  .grid-label {
    color: var(--text-secondary);
  }

  .grid-val {
    font-family: monospace;
    font-weight: 600;
  }

  .highlight-green {
    color: var(--status-green);
  }

  .highlight-blue {
    color: var(--brand-blue);
  }

  .highlight-gold {
    color: #e67e22;
  }

  .highlight-red {
    color: var(--status-red);
  }

  /* Logs */
  .logs-section {
    flex: 1;
    min-height: 220px;
  }

  .logs-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .clear-btn {
    background: transparent;
    border: none;
    font-size: 11px;
    color: var(--text-secondary);
    cursor: pointer;
    text-decoration: underline;
  }

  .clear-btn:hover {
    color: var(--text-primary);
  }

  .logs-container {
    flex: 1;
    overflow-y: auto;
    background-color: var(--bg-surface);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 6px 8px;
    display: flex;
    flex-direction: column;
    gap: 4px;
    max-height: 250px;
  }

  .empty-logs {
    font-size: 11px;
    color: var(--text-secondary);
    text-align: center;
    padding: 20px 0;
  }

  .log-entry {
    display: flex;
    align-items: flex-start;
    gap: 6px;
    font-size: 11px;
    line-height: 1.35;
    word-break: break-all;
  }

  .log-time {
    color: var(--text-secondary);
    font-family: monospace;
    font-size: 10px;
    flex-shrink: 0;
  }

  .log-tag {
    font-family: monospace;
    font-size: 9px;
    font-weight: 700;
    padding: 1px 4px;
    border-radius: 4px;
    flex-shrink: 0;
  }

  .log-tag.info {
    background: #e4e6eb;
    color: #333;
  }

  .log-tag.http {
    background: #e7f3ff;
    color: var(--brand-blue);
  }

  .log-tag.ws {
    background: #f0e6ff;
    color: #8a2be2;
  }

  .log-tag.sync {
    background: #e6f9ed;
    color: var(--status-green);
  }

  .log-tag.error {
    background: #ffebe6;
    color: var(--status-red);
  }

  .log-text {
    color: var(--text-primary);
  }
</style>
