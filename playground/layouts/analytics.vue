<script setup lang="ts">
import { ref, provide, computed } from 'vue'

/**
 * analytics layout — provider tree for analytics/dashboard pages.
 *
 * Provide/Inject graph impact:
 *   - Shadows the default layout's 'theme' key with a 'light' value
 *     (default layout provides 'dark', this layout overrides it to 'light')
 *   - Adds 'analyticsContext' — a new key only available on analytics pages
 *   - 'layoutContext' is re-provided with area: 'analytics-layout' so consumers
 *     can distinguish which layout they are under
 *
 * This creates a two-tier layout provide/inject chain:
 *   default layout (theme: 'dark') → analytics layout (theme: 'light') → dashboard page → SettingsPanel
 */

// Shadow the default layout's 'theme' — value differs intentionally
const theme = ref<'light' | 'dark'>('light')

// New key exclusive to analytics pages
const analyticsContext = computed(() => ({
    layout: 'analytics',
    theme: theme.value,
    capabilities: ['export', 'filter', 'drill-down'] as string[],
}))

provide('theme', theme)
provide('analyticsContext', analyticsContext)
provide(
    'layoutContext',
    computed(() => ({ area: 'analytics-layout', theme: theme.value }))
)
</script>

<template>
    <div class="analytics-shell">
        <!-- Analytics-specific sub-header shown below the default nav -->
        <div class="analytics-bar">
            <span class="analytics-label">Analytics</span>
            <div class="analytics-pills">
                <span v-for="cap in analyticsContext.capabilities" :key="cap" class="capability-pill">{{ cap }}</span>
            </div>
            <div class="theme-badge">
                theme override:
                <strong>{{ theme }}</strong>
                <button class="theme-toggle-btn" @click="theme = theme === 'light' ? 'dark' : 'light'">toggle</button>
            </div>
        </div>

        <slot />
    </div>
</template>

<style scoped>
.analytics-shell {
    display: flex;
    flex-direction: column;
    flex: 1;
}

.analytics-bar {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 0 32px;
    height: 38px;
    background: #f0f9ff;
    border-bottom: 1px solid #bae6fd;
    font-size: 12px;
    color: #0369a1;
}

.analytics-label {
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    font-size: 11px;
}

.analytics-pills {
    display: flex;
    gap: 6px;
    flex: 1;
}

.capability-pill {
    background: #e0f2fe;
    border: 1px solid #bae6fd;
    border-radius: 99px;
    padding: 2px 8px;
    font-size: 11px;
}

.theme-badge {
    display: flex;
    align-items: center;
    gap: 6px;
    color: #0c4a6e;
    font-size: 11px;
}

.theme-toggle-btn {
    font-size: 11px;
    padding: 2px 7px;
    border-radius: 5px;
    border: 1px solid #bae6fd;
    background: white;
    color: #0369a1;
    cursor: pointer;
}
</style>
