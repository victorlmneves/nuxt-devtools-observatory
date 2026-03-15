<script setup lang="ts">
import { ref } from 'vue'
import FetchDashboard from './views/FetchDashboard.vue'
import ProvideInjectGraph from './views/ProvideInjectGraph.vue'
import ComposableTracker from './views/ComposableTracker.vue'
import RenderHeatmap from './views/RenderHeatmap.vue'

const activeTab = ref('fetch')

const tabs = [
    { id: 'fetch', label: 'useFetch', icon: '⬡' },
    { id: 'provide', label: 'provide/inject', icon: '⬡' },
    { id: 'composable', label: 'Composables', icon: '⬡' },
    { id: 'heatmap', label: 'Heatmap', icon: '⬡' },
]
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
