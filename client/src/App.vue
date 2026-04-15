<script setup lang="ts">
import { ref, computed } from 'vue'
import { useObservatoryData } from './stores/observatory'
import FetchDashboard from './views/FetchDashboard.vue'
import ProvideInjectGraph from './views/ProvideInjectGraph.vue'
import ComposableTracker from './views/ComposableTracker.vue'
import RenderHeatmap from './views/RenderHeatmap.vue'
import TransitionTimeline from './views/TransitionTimeline.vue'
import TraceViewer from './views/TraceViewer.vue'
import { useVirtualizationFlags } from './composables/useVirtualizationFlags'

const pathMap: Record<string, string> = {
    fetch: 'fetch',
    provide: 'provide',
    composables: 'composable',
    heatmap: 'heatmap',
    transitions: 'transitions',
    traces: 'traces',
}

const segment = window.location.pathname.split('/').filter(Boolean).pop() ?? ''
const activeTab = ref(pathMap[segment] ?? 'fetch')

const { features } = useObservatoryData()

// Initializes rollout flags from query params before view rendering.
useVirtualizationFlags()

const tabs = computed(() => {
    const f = features.value || {}
    return [
        f.fetchDashboard && { id: 'fetch', label: 'useFetch', icon: '⬡' },
        f.provideInjectGraph && { id: 'provide', label: 'provide/inject', icon: '⬡' },
        f.composableTracker && { id: 'composable', label: 'Composables', icon: '⬡' },
        f.renderHeatmap && { id: 'heatmap', label: 'Heatmap', icon: '⬡' },
        f.transitionTracker && { id: 'transitions', label: 'Transitions', icon: '⬡' },
        f.traceViewer && { id: 'traces', label: 'Traces', icon: '⬡' },
    ].filter((tab): tab is { id: string; label: string; icon: string } => Boolean(tab))
})
</script>

<template>
    <div id="app-root">
        <nav class="tabbar">
            <div class="tabbar-brand">observatory</div>
            <button v-for="tab in tabs" :key="tab.id" class="tab-btn" :class="{ active: activeTab === tab.id }" @click="activeTab = tab.id">
                <span class="tab-icon">{{ tab.icon }}</span>
                {{ tab.label }}
            </button>
        </nav>

        <main class="tab-content">
            <FetchDashboard v-if="activeTab === 'fetch'" />
            <ProvideInjectGraph v-else-if="activeTab === 'provide'" />
            <ComposableTracker v-else-if="activeTab === 'composable'" />
            <RenderHeatmap v-else-if="activeTab === 'heatmap'" />
            <TransitionTimeline v-else-if="activeTab === 'transitions'" />
            <TraceViewer v-else-if="activeTab === 'traces'" />
        </main>
    </div>
</template>

<style scoped>
#app-root {
    display: flex;
    flex-direction: column;
    height: 100vh;
    overflow: hidden;
}

.tabbar {
    display: flex;
    align-items: center;
    gap: 2px;
    padding: 8px 12px 0;
    border-bottom: 0.5px solid var(--border);
    background: var(--bg3);
    flex-shrink: 0;
}

.tabbar-brand {
    font-size: 11px;
    font-weight: 500;
    color: var(--purple);
    letter-spacing: 0.5px;
    margin-right: 12px;
    padding-bottom: 8px;
}

.tab-btn {
    border: none;
    border-bottom: 2px solid transparent;
    border-radius: 0;
    background: transparent;
    color: var(--text3);
    font-size: 12px;
    padding: 6px 12px 8px;
    cursor: pointer;
    transition:
        color 0.12s,
        border-color 0.12s;
    display: flex;
    align-items: center;
    gap: 5px;
}

.tab-btn:hover {
    color: var(--text);
    background: transparent;
}

.tab-btn.active {
    color: var(--purple);
    border-bottom-color: var(--purple);
}

.tab-icon {
    font-size: 10px;
    opacity: 0.6;
}

.tab-content {
    flex: 1;
    overflow: hidden;
    display: flex;
    flex-direction: column;
}
</style>
