<script setup lang="ts">
import { ref, provide, inject } from 'vue'
import { useUserStore } from '../stores/user'

/**
 * SettingsPanel — intentionally shadows the layout-level 'theme' key.
 *
 * layouts/default.vue provides 'theme' = ref('dark').
 * This component provides its own local 'theme' ref, which shadows the parent.
 * The provide/inject graph should flag this as a shadowing node.
 *
 * Also injects layout/auth context to demonstrate resolved multi-level
 * injections originating from the default layout provider tree.
 */
const store = useUserStore()

// Local theme override — this SHADOWS the app-level 'theme' provide
const localTheme = ref(store.preferences.theme)
provide('theme', localTheme)

// Inject auth context from the top of the tree — should be resolved
const authContext = inject<{ user: { id: string; name: string }; isLoggedIn: boolean } | null>('authContext', null)
const layoutContext = inject<{ area: string; theme: string } | null>('layoutContext', null)
</script>

<template>
    <div class="panel">
        <div class="panel-row">
            <span class="panel-label">Shadowed 'theme' provide</span>
            <span class="badge shadow">shadows app-level</span>
        </div>
        <p class="panel-desc">
            This component provides its own
            <code>theme</code>
            key — the provide/inject graph should show it as a shadowing node. Local theme:
            <strong>{{ localTheme }}</strong>
        </p>

        <div v-if="authContext" class="panel-row" style="margin-top: 12px">
            <span class="panel-label">inject('authContext') resolved ✓</span>
            <span class="panel-value">{{ authContext.user.name }}</span>
        </div>
        <div v-else class="panel-row" style="margin-top: 12px; color: #c0392b">inject('authContext') — unresolved (no provider)</div>

        <div v-if="layoutContext" class="panel-row" style="margin-top: 10px">
            <span class="panel-label">inject('layoutContext') resolved ✓</span>
            <span class="panel-value">{{ layoutContext.area }} · {{ layoutContext.theme }}</span>
        </div>
    </div>
</template>

<style scoped>
.panel {
    background: #fffbeb;
    border: 1px solid #fde68a;
    border-radius: 10px;
    padding: 14px 18px;
    font-size: 13px;
}

.panel-row {
    display: flex;
    align-items: center;
    gap: 10px;
}

.panel-label {
    color: #444;
    font-weight: 500;
}

.panel-value {
    color: #1a1a18;
}

.panel-desc {
    color: #666;
    margin: 6px 0 0;
    font-size: 12px;
}

.badge {
    font-size: 11px;
    padding: 2px 8px;
    border-radius: 99px;
    font-weight: 600;
}

.shadow {
    background: #fef9c3;
    color: #92400e;
    border: 1px solid #fde68a;
}
</style>
