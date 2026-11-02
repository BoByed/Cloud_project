<script lang="ts">
  import { onMount } from 'svelte';
  import { chatEngine } from './lib/services/chat-engine.svelte.js';
  import Sidebar from './lib/components/Sidebar.svelte';
  import ChatHeader from './lib/components/ChatHeader.svelte';
  import MessageList from './lib/components/MessageList.svelte';
  import MessageComposer from './lib/components/MessageComposer.svelte';
  import DevInspectorDrawer from './lib/components/DevInspectorDrawer.svelte';
  import LoginScreen from './lib/components/LoginScreen.svelte';

  let isDevDrawerOpen = $state(false);

  onMount(() => {
    // If not initialized yet, initialize the engine
    if (!chatEngine.session && chatEngine.authLoading) {
      chatEngine.initialize();
    }
  });
</script>

<div class="app-root">
  <!-- Storage Degraded Warning Banner (Section 2) -->
  {#if chatEngine.storageDegraded}
    <div class="degraded-banner" role="alert">
      <span>⚠️ <strong>คำเตือน:</strong> เบราว์เซอร์บล็อก IndexedDB ข้อมูลข้อความจะถูกเก็บในหน่วยความจำชั่วคราวและอาจสูญหายเมื่อรีเฟรชหน้า</span>
    </div>
  {/if}

  {#if chatEngine.authLoading}
    <div class="loading-screen">
      <div class="spin-icon loader-spinner">💬</div>
      <p>กำลังเตรียมความพร้อมระบบแชท...</p>
    </div>
  {:else if !chatEngine.session}
    <LoginScreen />
  {:else}
    <!-- Main Messenger 2-Column App Layout -->
    <div class="messenger-container">
      <!-- Left Panel: Sidebar -->
      <Sidebar onOpenDevDrawer={() => isDevDrawerOpen = !isDevDrawerOpen} />

      <!-- Right Panel: Active Chat Area -->
      <main class="chat-main" aria-label="ห้องสนทนาหลัก">
        {#if chatEngine.activeRoom}
          <ChatHeader
            {isDevDrawerOpen}
            onToggleDevDrawer={() => isDevDrawerOpen = !isDevDrawerOpen}
          />
          <MessageList />
          <MessageComposer />
        {:else}
          <div class="no-room-selected">
            <div class="empty-icon">
              <svg viewBox="0 0 36 36" width="72" height="72" fill="none">
                <defs>
                  <linearGradient id="empty-m-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stop-color="#0084ff" />
                    <stop offset="60%" stop-color="#0099ff" />
                    <stop offset="100%" stop-color="#a033ff" />
                  </linearGradient>
                </defs>
                <path
                  d="M18 2C9.163 2 2 8.716 2 17c0 4.717 2.33 8.914 6 11.667V34l5.127-2.82c1.554.43 3.193.667 4.873.667 8.837 0 16-6.716 16-15S26.837 2 18 2z"
                  fill="url(#empty-m-grad)"
                />
                <path
                  d="M10 20.5l5.5-5.8 4 4 6.5-6.2-5.5 5.8-4-4-6.5 6.2z"
                  fill="#ffffff"
                />
              </svg>
            </div>
            <h2 class="empty-title">เลือกห้องสนทนาเพื่อเริ่มคุย</h2>
            <p class="empty-subtitle">
              เลือกห้องแชทเดี่ยว (DM) หรือกลุ่ม (Group) ทางแผงด้านซ้าย เพื่อดูข้อความและสนทนาแบบเรียลไทม์
            </p>
          </div>
        {/if}
      </main>

      <!-- Right Side Dev Drawer (M1/M2 Simulator) -->
      {#if isDevDrawerOpen}
        <DevInspectorDrawer onClose={() => isDevDrawerOpen = false} />
      {/if}
    </div>
  {/if}
</div>

<style>
  .app-root {
    height: 100vh;
    width: 100vw;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    background-color: var(--bg-app);
  }

  .degraded-banner {
    background-color: #fff3cd;
    color: #856404;
    padding: 8px 16px;
    font-size: 12px;
    text-align: center;
    border-bottom: 1px solid #ffeeba;
    flex-shrink: 0;
    z-index: 1000;
  }

  .loading-screen {
    height: 100%;
    width: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 16px;
    color: var(--text-secondary);
    font-size: 14px;
  }

  .loader-spinner {
    font-size: 36px;
  }

  .messenger-container {
    height: 100%;
    width: 100%;
    display: flex;
    overflow: hidden;
  }

  .chat-main {
    flex: 1;
    display: flex;
    flex-direction: column;
    height: 100%;
    min-width: 0;
    position: relative;
    background-color: var(--bg-surface);
  }

  .no-room-selected {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 40px;
    text-align: center;
    color: var(--text-secondary);
    user-select: none;
  }

  .empty-icon {
    margin-bottom: 20px;
    animation: float 3s ease-in-out infinite;
  }

  @keyframes float {
    0%, 100% { transform: translateY(0); }
    50% { transform: translateY(-8px); }
  }

  .empty-title {
    font-size: 20px;
    font-weight: 700;
    color: var(--text-primary);
    margin-bottom: 8px;
  }

  .empty-subtitle {
    font-size: 14px;
    max-width: 380px;
    line-height: 1.5;
  }
</style>
