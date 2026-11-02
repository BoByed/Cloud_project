<script lang="ts">
  import { onMount } from 'svelte';
  import { chatEngine } from '../services/chat-engine.svelte.js';
  import type { Room } from '../types/contract.js';

  // Props
  let { onOpenDevDrawer }: { onOpenDevDrawer?: () => void } = $props();

  let searchQuery = $state('');
  let isUserDropdownOpen = $state(false);

  // Filtered rooms
  let filteredRooms = $derived(
    chatEngine.rooms.filter((room: Room) =>
      room.title.toLowerCase().includes(searchQuery.trim().toLowerCase())
    )
  );

  // Modern Web Guidance: dark-mode-toggle implementation
  let currentScheme = $state<'light' | 'dark'>('light');

  function updateCurrentSchemeState() {
    try {
      const stored = localStorage.getItem('color-scheme');
      if (stored === 'light' || stored === 'dark') {
        currentScheme = stored;
      } else {
        const isSystemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        currentScheme = isSystemDark ? 'dark' : 'light';
      }
    } catch {
      currentScheme = 'light';
    }
  }

  function toggleColorScheme() {
    try {
      const isSystemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      const systemPreference = isSystemDark ? 'dark' : 'light';
      
      // Target scheme is the opposite of currently rendered scheme
      const target = currentScheme === 'dark' ? 'light' : 'dark';

      if (target !== systemPreference) {
        localStorage.setItem('color-scheme', target);
      } else {
        localStorage.removeItem('color-scheme');
      }

      const meta = document.querySelector('meta[name="color-scheme"]');
      if (meta) {
        meta.setAttribute('content', localStorage.getItem('color-scheme') ?? 'light dark');
      }

      updateCurrentSchemeState();
    } catch (e) {
      console.warn('Failed to toggle color scheme in localStorage:', e);
    }
  }

  onMount(() => {
    updateCurrentSchemeState();

    const handleStorage = (event: StorageEvent) => {
      if (event.key === 'color-scheme') {
        const meta = document.querySelector('meta[name="color-scheme"]');
        if (meta) {
          meta.setAttribute('content', event.newValue ?? 'light dark');
        }
        updateCurrentSchemeState();
      }
    };

    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  });

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

<aside class="sidebar">
  <!-- Sidebar Header -->
  <header class="sidebar-header">
    <div class="header-top">
      <div class="brand">
        <div class="brand-icon">
          <svg viewBox="0 0 36 36" width="32" height="32" fill="none">
            <defs>
              <linearGradient id="m-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="#0084ff" />
                <stop offset="60%" stop-color="#0099ff" />
                <stop offset="100%" stop-color="#a033ff" />
              </linearGradient>
            </defs>
            <path
              d="M18 2C9.163 2 2 8.716 2 17c0 4.717 2.33 8.914 6 11.667V34l5.127-2.82c1.554.43 3.193.667 4.873.667 8.837 0 16-6.716 16-15S26.837 2 18 2z"
              fill="url(#m-grad)"
            />
            <path
              d="M10 20.5l5.5-5.8 4 4 6.5-6.2-5.5 5.8-4-4-6.5 6.2z"
              fill="#ffffff"
            />
          </svg>
        </div>
        <h1 class="brand-title">Chats</h1>
      </div>

      <div class="header-actions">
        <!-- Theme Toggle -->
        <button
          type="button"
          class="icon-button"
          title={`สลับธีม (ปัจจุบัน: ${currentScheme === 'dark' ? 'มืด' : 'สว่าง'})`}
          onclick={toggleColorScheme}
          aria-label="สลับธีมมืด/สว่าง"
        >
          {#if currentScheme === 'dark'}
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="5" />
              <line x1="12" y1="1" x2="12" y2="3" />
              <line x1="12" y1="21" x2="12" y2="23" />
              <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
              <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
              <line x1="1" y1="12" x2="3" y2="12" />
              <line x1="21" y1="12" x2="23" y2="12" />
              <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
              <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
            </svg>
          {:else}
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
            </svg>
          {/if}
        </button>

        <!-- Dev Simulator Drawer button -->
        {#if onOpenDevDrawer}
          <button
            type="button"
            class="icon-button dev-btn"
            title="เปิด Dev Simulator Drawer (M1/M2)"
            onclick={onOpenDevDrawer}
            aria-label="Dev Simulator"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
            </svg>
          </button>
        {/if}
      </div>
    </div>

    <!-- Current User Badge & Quick Switcher -->
    {#if chatEngine.session}
      <div class="user-card">
        <div class="user-info">
          <div class="user-avatar">
            {chatEngine.session.user.display_name.slice(0, 2).toUpperCase()}
            <span class="status-dot {chatEngine.wsState === 'connected' ? 'online' : 'reconnecting'}"></span>
          </div>
          <div class="user-details">
            <span class="user-name">{chatEngine.session.user.display_name}</span>
            <span class="user-id" title={chatEngine.session.user.user_id}>
              {chatEngine.session.user.user_id.slice(0, 8)}...
            </span>
          </div>
        </div>

        <button
          type="button"
          class="switch-menu-trigger"
          title="สลับบัญชีทดสอบหรือออกจากระบบ"
          onclick={() => isUserDropdownOpen = !isUserDropdownOpen}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <circle cx="12" cy="5" r="2" />
            <circle cx="12" cy="12" r="2" />
            <circle cx="12" cy="19" r="2" />
          </svg>
        </button>
      </div>

      <!-- Quick Switcher Dropdown -->
      {#if isUserDropdownOpen}
        <div class="user-dropdown">
          <div class="dropdown-section">
            <div class="dropdown-label">สลับผู้ใช้จำลอง (Multi-user Demo):</div>
            <div class="dev-users-grid">
              {#each chatEngine.devUsers as devUser}
                <button
                  type="button"
                  class="dev-user-chip {chatEngine.session?.user.user_id === devUser.user_id ? 'active' : ''}"
                  onclick={async () => {
                    isUserDropdownOpen = false;
                    await chatEngine.loginWithDevUser(devUser.user_id);
                  }}
                >
                  <span class="chip-avatar">{devUser.display_name.slice(0, 1)}</span>
                  <span class="chip-name">{devUser.display_name}</span>
                </button>
              {/each}
            </div>
          </div>

          <div class="dropdown-divider"></div>

          <div class="dropdown-actions">
            <button
              type="button"
              class="logout-btn"
              onclick={async () => {
                isUserDropdownOpen = false;
                await chatEngine.logout(false);
              }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
              ออกจากระบบเครื่องนี้
            </button>

            <button
              type="button"
              class="logout-btn danger"
              onclick={async () => {
                isUserDropdownOpen = false;
                await chatEngine.logout(true);
              }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M18.36 6.64a9 9 0 1 1-12.73 0" />
                <line x1="12" y1="2" x2="12" y2="12" />
              </svg>
              ออกจากระบบทุกอุปกรณ์
            </button>
          </div>
        </div>
      {/if}
    {/if}

    <!-- Search Input -->
    <div class="search-container">
      <svg class="search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="11" cy="11" r="8" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
      </svg>
      <input
        type="search"
        class="search-input"
        placeholder="ค้นหาห้องสนทนา..."
        bind:value={searchQuery}
      />
      {#if searchQuery}
        <button
          type="button"
          class="search-clear"
          onclick={() => searchQuery = ''}
          aria-label="ล้างการค้นหา"
        >
          ×
        </button>
      {/if}
    </div>
  </header>

  <!-- Rooms List -->
  <nav class="room-list-container" aria-label="ห้องสนทนา">
    {#if filteredRooms.length === 0}
      <div class="empty-rooms">
        {#if searchQuery}
          <p>ไม่พบห้องที่ตรงกับ "{searchQuery}"</p>
        {:else}
          <p>ไม่มีห้องสนทนา</p>
        {/if}
      </div>
    {:else}
      <ul class="room-list">
        {#each filteredRooms as room (room.room_id)}
          {@const isActive = chatEngine.activeRoomId === room.room_id}
          {@const cursor = chatEngine.cursorByRoom[room.room_id] ?? '0'}
          {@const isRevoked = Boolean(chatEngine.revokedRooms && chatEngine.revokedRooms[room.room_id])}
          <li>
            <button
              type="button"
              class="room-item {isActive ? 'active' : ''} {isRevoked ? 'revoked' : ''}"
              onclick={() => chatEngine.selectRoom(room.room_id)}
            >
              <!-- Avatar -->
              <div class="room-avatar {room.kind}">
                {getAvatarInitials(room.title)}
                {#if room.kind === 'dm'}
                  <span class="online-dot"></span>
                {/if}
              </div>

              <!-- Room Details -->
              <div class="room-content">
                <div class="room-title-row">
                  <span class="room-title" title={room.title}>{room.title}</span>
                  <div class="badges-row">
                    {#if isRevoked}
                      <span class="badge-revoked" title="ถูกถอนสิทธิ์การเป็นสมาชิก (ACCESS_REVOKED)">ถูกถอนสิทธิ์</span>
                    {/if}
                    <span class="badge-role {room.membership_role}">{room.membership_role}</span>
                  </div>
                </div>

                <div class="room-subtitle-row">
                  <span class="badge-kind {room.kind}">
                    {room.kind === 'group' ? 'Group' : 'DM'}
                  </span>
                  <span class="seq-tag" title="Last Seq: #{room.last_seq} • Contiguous Cursor: #{cursor}">
                    seq #{room.last_seq} <span class="cursor-pill">c:{cursor}</span>
                  </span>
                </div>
              </div>
            </button>
          </li>
        {/each}
      </ul>

      {#if chatEngine.roomsNextCursor}
        <div class="load-more-rooms-container">
          <button
            type="button"
            class="load-more-rooms-btn"
            disabled={chatEngine.loadingMoreRooms}
            onclick={() => chatEngine.loadMoreRooms()}
          >
            {#if chatEngine.loadingMoreRooms}
              <span>⏳ กำลังโหลด...</span>
            {:else}
              โหลดห้องสนทนาเพิ่มเติม (next_cursor)
            {/if}
          </button>
        </div>
      {/if}
    {/if}
  </nav>
</aside>

<style>
  .sidebar {
    width: 340px;
    height: 100%;
    display: flex;
    flex-direction: column;
    background-color: var(--bg-sidebar);
    border-right: 1px solid var(--border);
    flex-shrink: 0;
    user-select: none;
  }

  .sidebar-header {
    padding: 12px 16px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    border-bottom: 1px solid var(--border);
    position: relative;
  }

  .header-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .brand {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .brand-title {
    font-size: 24px;
    font-weight: 700;
    letter-spacing: -0.5px;
    color: var(--text-primary);
  }

  .header-actions {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .icon-button {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    border: none;
    background-color: var(--bg-input);
    color: var(--text-primary);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: background-color 0.15s ease, transform 0.1s ease;
  }

  .icon-button:hover {
    background-color: var(--item-hover);
    transform: scale(1.04);
  }

  .icon-button:active {
    transform: scale(0.96);
  }

  .dev-btn {
    color: var(--brand-blue);
  }

  /* User Card */
  .user-card {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 10px;
    background-color: var(--bg-input);
    border-radius: 10px;
  }

  .user-info {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
  }

  .user-avatar {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    background: var(--brand-gradient);
    color: #ffffff;
    font-weight: 600;
    font-size: 13px;
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
    flex-shrink: 0;
  }

  .status-dot {
    position: absolute;
    bottom: -1px;
    right: -1px;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    border: 2px solid var(--bg-surface);
  }

  .status-dot.online {
    background-color: var(--status-green);
  }

  .status-dot.reconnecting {
    background-color: var(--status-yellow);
  }

  .user-details {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  .user-name {
    font-weight: 600;
    font-size: 14px;
    color: var(--text-primary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .user-id {
    font-size: 11px;
    color: var(--text-secondary);
    font-family: monospace;
  }

  .switch-menu-trigger {
    background: transparent;
    border: none;
    color: var(--text-secondary);
    cursor: pointer;
    padding: 6px;
    border-radius: 6px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .switch-menu-trigger:hover {
    background-color: var(--item-hover);
    color: var(--text-primary);
  }

  /* User Dropdown */
  .user-dropdown {
    position: absolute;
    top: 108px;
    left: 16px;
    right: 16px;
    background-color: var(--bg-surface);
    border: 1px solid var(--border);
    border-radius: 12px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18);
    z-index: 100;
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .dropdown-label {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    color: var(--text-secondary);
    margin-bottom: 6px;
  }

  .dev-users-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .dev-user-chip {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 10px;
    border-radius: 20px;
    border: 1px solid var(--border);
    background-color: var(--bg-input);
    color: var(--text-primary);
    cursor: pointer;
    font-size: 12px;
    transition: all 0.15s ease;
  }

  .dev-user-chip:hover {
    border-color: var(--brand-blue);
    background-color: var(--item-hover);
  }

  .dev-user-chip.active {
    background-color: var(--item-active);
    border-color: var(--brand-blue);
    color: var(--brand-blue);
    font-weight: 600;
  }

  .chip-avatar {
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: var(--brand-gradient);
    color: white;
    font-size: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .dropdown-divider {
    height: 1px;
    background-color: var(--border);
    margin: 4px 0;
  }

  .dropdown-actions {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .logout-btn {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 10px;
    border-radius: 8px;
    border: none;
    background: transparent;
    color: var(--text-primary);
    font-size: 13px;
    cursor: pointer;
    text-align: left;
    transition: background-color 0.15s ease;
  }

  .logout-btn:hover {
    background-color: var(--item-hover);
  }

  .logout-btn.danger {
    color: var(--status-red);
  }

  .logout-btn.danger:hover {
    background-color: rgba(250, 56, 62, 0.1);
  }

  /* Search */
  .search-container {
    position: relative;
    display: flex;
    align-items: center;
  }

  .search-icon {
    position: absolute;
    left: 12px;
    color: var(--text-secondary);
    pointer-events: none;
  }

  .search-input {
    width: 100%;
    height: 36px;
    padding: 0 32px 0 36px;
    border-radius: 18px;
    border: none;
    background-color: var(--bg-input);
    color: var(--text-primary);
    font-size: 14px;
    outline: none;
    transition: box-shadow 0.15s ease;
  }

  .search-input:focus {
    box-shadow: 0 0 0 2px var(--brand-blue);
  }

  .search-clear {
    position: absolute;
    right: 10px;
    background: transparent;
    border: none;
    font-size: 16px;
    color: var(--text-secondary);
    cursor: pointer;
  }

  /* Room List */
  .room-list-container {
    flex: 1;
    overflow-y: auto;
    padding: 8px;
  }

  .room-list {
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .room-item {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 12px;
    border-radius: 10px;
    border: none;
    background: transparent;
    color: var(--text-primary);
    cursor: pointer;
    text-align: left;
    transition: background-color 0.15s ease;
  }

  .room-item:hover {
    background-color: var(--item-hover);
  }

  .room-item.active {
    background-color: var(--item-active);
  }

  .room-avatar {
    width: 48px;
    height: 48px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 600;
    font-size: 16px;
    color: white;
    position: relative;
    flex-shrink: 0;
  }

  .room-avatar.group {
    background: linear-gradient(135deg, #8a2be2 0%, #4a00e0 100%);
  }

  .room-avatar.dm {
    background: linear-gradient(135deg, #0084ff 0%, #00c6ff 100%);
  }

  .online-dot {
    position: absolute;
    bottom: 2px;
    right: 2px;
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background-color: var(--status-green);
    border: 2px solid var(--bg-surface);
  }

  .room-content {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .room-title-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  .room-title {
    font-weight: 600;
    font-size: 14px;
    color: var(--text-primary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .badges-row {
    display: flex;
    align-items: center;
    gap: 4px;
    flex-shrink: 0;
  }

  .badge-revoked {
    font-size: 10px;
    font-weight: 700;
    padding: 1px 6px;
    border-radius: 8px;
    background-color: rgba(250, 56, 62, 0.15);
    color: var(--status-red);
    border: 1px solid rgba(250, 56, 62, 0.3);
    white-space: nowrap;
  }

  .room-item.revoked {
    opacity: 0.85;
  }

  .load-more-rooms-container {
    padding: 10px 4px 6px;
  }

  .load-more-rooms-btn {
    width: 100%;
    padding: 8px 12px;
    border-radius: 8px;
    border: 1px dashed var(--border);
    background-color: var(--bg-input);
    color: var(--brand-blue);
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    transition: all 0.15s ease;
  }

  .load-more-rooms-btn:hover:not(:disabled) {
    background-color: var(--item-hover);
    border-color: var(--brand-blue);
  }

  .load-more-rooms-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .badge-role {
    font-size: 10px;
    text-transform: uppercase;
    padding: 1px 6px;
    border-radius: 8px;
    font-weight: 600;
    background-color: var(--bg-input);
    color: var(--text-secondary);
  }

  .badge-role.owner {
    color: #e67e22;
    background-color: rgba(230, 126, 34, 0.12);
  }

  .badge-role.admin {
    color: var(--brand-blue);
    background-color: rgba(0, 132, 255, 0.12);
  }

  .room-subtitle-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
    font-size: 12px;
  }

  .badge-kind {
    font-size: 11px;
    color: var(--text-secondary);
  }

  .seq-tag {
    font-family: monospace;
    font-size: 11px;
    color: var(--text-secondary);
  }

  .cursor-pill {
    background-color: var(--bg-input);
    padding: 1px 5px;
    border-radius: 6px;
    color: var(--text-tertiary);
  }

  .empty-rooms {
    padding: 32px 16px;
    text-align: center;
    color: var(--text-secondary);
    font-size: 13px;
  }
</style>
