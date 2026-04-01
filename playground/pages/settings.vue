<script setup lang="ts">
/**
 * settings.vue — User settings page.
 *
 * Observatory coverage:
 *   Composable       — useUserPreferences (async init + watcher + cleanup)
 *   Provide/Inject   — SettingsPanel shadows app-level 'theme' key
 *   Render Heatmap   — toggles cause re-renders across multiple setting rows
 */

const { preferences, displayName, isInitialising, saveStatus, setTheme, setLocale, toggleNotifications, toggleCompactView } =
    await useUserPreferences()
</script>

<template>
    <div>
        <header class="page-header">
            <div>
                <h1>Settings</h1>
                <p>useUserPreferences (async init · watcher · cleanup) · provide/inject shadow</p>
            </div>
            <div class="save-status">
                <Transition name="fade-fast">
                    <span v-if="saveStatus === 'saving'" class="status saving">saving…</span>
                    <span v-else-if="saveStatus === 'saved'" class="status saved">✓ saved</span>
                </Transition>
            </div>
        </header>

        <main class="page-body">
            <div v-if="isInitialising" class="loading">Initialising preferences…</div>

            <template v-else>
                <!-- user info -->
                <section class="section">
                    <h2>Account</h2>
                    <div class="row">
                        <span class="row-label">Display name</span>
                        <span class="row-value">{{ displayName }}</span>
                    </div>
                </section>

                <!-- appearance -->
                <section class="section">
                    <h2>Appearance</h2>
                    <div class="row">
                        <span class="row-label">Theme</span>
                        <div class="btn-group">
                            <button
                                v-for="t in ['light', 'dark', 'system'] as const"
                                :key="t"
                                :class="['opt-btn', { active: preferences.theme === t }]"
                                @click="setTheme(t)"
                            >
                                {{ t }}
                            </button>
                        </div>
                    </div>
                    <div class="row">
                        <span class="row-label">Compact view</span>
                        <button :class="['toggle', { on: preferences.compactView }]" @click="toggleCompactView">
                            {{ preferences.compactView ? 'On' : 'Off' }}
                        </button>
                    </div>
                </section>

                <!-- localisation -->
                <section class="section">
                    <h2>Localisation</h2>
                    <div class="row">
                        <span class="row-label">Language</span>
                        <div class="btn-group">
                            <button
                                v-for="l in ['en', 'fr', 'de', 'ja'] as const"
                                :key="l"
                                :class="['opt-btn', { active: preferences.locale === l }]"
                                @click="setLocale(l)"
                            >
                                {{ l }}
                            </button>
                        </div>
                    </div>
                </section>

                <!-- notifications -->
                <section class="section">
                    <h2>Notifications</h2>
                    <div class="row">
                        <span class="row-label">Enable notifications</span>
                        <button :class="['toggle', { on: preferences.notifications }]" @click="toggleNotifications">
                            {{ preferences.notifications ? 'On' : 'Off' }}
                        </button>
                    </div>
                </section>

                <!-- provide/inject shadow demo -->
                <section class="section">
                    <h2>Provide/Inject Demo — Theme Shadow</h2>
                    <p style="font-size: 13px; color: #666; margin-bottom: 12px">
                        <code>SettingsPanel</code>
                        provides its own
                        <code>theme</code>
                        key, shadowing the one provided by
                        <code>layouts/default.vue</code>
                        . The Observatory's provide/inject graph should flag this node.
                    </p>
                    <SettingsPanel />
                </section>
            </template>
        </main>
    </div>
</template>

<style scoped>
.page-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    padding: 24px 32px;
    border-bottom: 1px solid #e0ded8;
}

.page-header h1 {
    font-size: 20px;
    font-weight: 600;
    margin: 0 0 4px;
}

.page-header p {
    font-size: 13px;
    color: #888;
    margin: 0;
}

.page-body {
    padding: 24px 32px;
    display: flex;
    flex-direction: column;
    gap: 20px;
}

.loading {
    font-size: 14px;
    color: #aaa;
    padding: 12px 0;
}

.section {
    background: white;
    border: 1px solid #e0ded8;
    border-radius: 12px;
    padding: 20px 24px;
}

h2 {
    font-size: 15px;
    font-weight: 600;
    margin: 0 0 12px;
}

.row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 0;
    border-bottom: 1px solid #f5f3ef;
}

.row:last-child {
    border-bottom: none;
}

.row-label {
    font-size: 13px;
    color: #444;
}

.row-value {
    font-size: 13px;
    color: #1a1a18;
    font-weight: 500;
}

.btn-group {
    display: flex;
    gap: 6px;
}

.opt-btn {
    font-size: 12px;
    padding: 4px 12px;
    border-radius: 99px;
    border: 1px solid #d3d1c7;
    background: white;
    cursor: pointer;
}

.opt-btn.active {
    background: #1a1a18;
    color: white;
    border-color: #1a1a18;
}

.toggle {
    font-size: 12px;
    padding: 4px 14px;
    border-radius: 99px;
    border: 1px solid #d3d1c7;
    background: white;
    cursor: pointer;
    font-weight: 600;
}

.toggle.on {
    background: #1d9e75;
    color: white;
    border-color: #1d9e75;
}

.save-status {
    min-width: 70px;
    display: flex;
    align-items: center;
    justify-content: flex-end;
}

.status {
    font-size: 12px;
    padding: 4px 10px;
    border-radius: 99px;
}

.saving {
    background: #fef9c3;
    color: #92400e;
}

.saved {
    background: #f0fdf4;
    color: #166534;
}

.fade-fast-enter-active,
.fade-fast-leave-active {
    transition: opacity 0.2s;
}

.fade-fast-enter-from,
.fade-fast-leave-to {
    opacity: 0;
}
</style>
