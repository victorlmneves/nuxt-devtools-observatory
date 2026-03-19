<script setup lang="ts">
import { ref, computed, onUnmounted } from 'vue'
import ComponentBlock from './ComponentBlock.vue'
import { useObservatoryData } from '../stores/observatory'

interface ComponentNode {
    id: string
    label: string
    file: string
    renders: number
    avgMs: number
    triggers: string[]
    children: ComponentNode[]
}

const { renders } = useObservatoryData()
const baseNodes = renders

let liveInterval: ReturnType<typeof setInterval> | undefined

const activeMode = ref<'count' | 'time'>('count')
const activeThreshold = ref(5)
const activeHotOnly = ref(false)
const frozen = ref(false)
const activeSelected = ref<ComponentNode | null>(null)

const rootNodes = computed(() => baseNodes.value)

const allComponents = computed(() => {
    const all: ComponentNode[] = []

    function collect(ns: ComponentNode[]) {
        ns.forEach((n) => {
            all.push(n)
            collect(n.children)
        })
    }

    collect(baseNodes.value)

    return all
})

const totalRenders = computed(() => allComponents.value.reduce((a, n) => a + n.renders, 0))
const hotCount = computed(() => allComponents.value.filter((n) => isHot(n)).length)
const avgTime = computed(() => {
    const comps = allComponents.value.filter((n) => n.avgMs > 0)

    if (!comps.length) {
        return '0.0'
    }

    return (comps.reduce((a, n) => a + n.avgMs, 0) / comps.length).toFixed(1)
})

function isHot(n: ComponentNode) {
    return (activeMode.value === 'count' ? n.renders : n.avgMs) >= activeThreshold.value
}

function toggleFreeze() {
    frozen.value = !frozen.value
}

function startLive() {
    liveInterval = setInterval(() => {
        if (frozen.value) {
            return
        }

        allComponents.value.forEach((n) => {
            if (Math.random() < 0.3) n.renders += Math.floor(Math.random() * 3) + 1
        })
    }, 1800)
}

startLive()
onUnmounted(() => {
    if (liveInterval) {
        clearInterval(liveInterval)
    }
})
</script>

<template>
    <div class="view">
        <!-- Controls -->
        <div class="controls">
            <div class="mode-group">
                <button :class="{ active: activeMode === 'count' }" @click="activeMode = 'count'">render count</button>
                <button :class="{ active: activeMode === 'time' }" @click="activeMode = 'time'">render time</button>
            </div>
            <div class="threshold-group">
                <span class="muted text-sm">threshold</span>
                <input v-model.number="activeThreshold" type="range" min="1" max="30" step="1" style="width: 90px" />
                <span class="mono text-sm">{{ activeThreshold }}+</span>
            </div>
            <button :class="{ active: activeHotOnly }" @click="activeHotOnly = !activeHotOnly">hot only</button>
            <button :class="{ active: frozen }" style="margin-left: auto" @click="toggleFreeze">
                {{ frozen ? 'unfreeze' : 'freeze snapshot' }}
            </button>
        </div>

        <!-- Stats -->
        <div class="stats-row">
            <div class="stat-card">
                <div class="stat-label">components</div>
                <div class="stat-val">{{ allComponents.length }}</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">total renders</div>
                <div class="stat-val">{{ totalRenders }}</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">hot</div>
                <div class="stat-val" style="color: var(--red)">{{ hotCount }}</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">avg time</div>
                <div class="stat-val">{{ avgTime }}ms</div>
            </div>
        </div>

        <div class="split">
            <!-- Page mockup -->
            <div class="page-frame">
                <div class="legend">
                    <div class="swatch-row">
                        <span class="swatch" style="background: #eaf3de"></span>
                        <span class="swatch" style="background: #97c459"></span>
                        <span class="swatch" style="background: #ef9f27"></span>
                        <span class="swatch" style="background: #e24b4a"></span>
                    </div>
                    <span class="muted text-sm">cool → hot</span>
                </div>
                <ComponentBlock
                    v-for="rootNode in rootNodes"
                    :key="rootNode.id"
                    :node="rootNode"
                    :mode="activeMode"
                    :threshold="activeThreshold"
                    :hot-only="activeHotOnly"
                    :selected="activeSelected?.id"
                    @select="activeSelected = $event"
                />
            </div>

            <!-- Detail panel -->
            <div class="sidebar">
                <template v-if="activeSelected">
                    <div class="detail-header">
                        <span class="mono bold" style="font-size: 12px">{{ activeSelected.label }}</span>
                        <button @click="activeSelected = null">×</button>
                    </div>

                    <div class="meta-grid">
                        <span class="muted text-sm">renders</span>
                        <span class="mono text-sm">{{ activeSelected.renders }}</span>
                        <span class="muted text-sm">avg time</span>
                        <span class="mono text-sm">{{ activeSelected.avgMs.toFixed(1) }}ms</span>
                        <span class="muted text-sm">hot?</span>
                        <span class="text-sm" :style="{ color: isHot(activeSelected) ? 'var(--red)' : 'var(--teal)' }">
                            {{ isHot(activeSelected) ? 'yes' : 'no' }}
                        </span>
                        <span class="muted text-sm">file</span>
                        <span class="mono text-sm muted">{{ activeSelected.file }}</span>
                    </div>

                    <div class="section-label">triggers</div>
                    <div v-for="t in activeSelected.triggers" :key="t" class="trigger-item mono text-sm">{{ t }}</div>
                    <div v-if="!activeSelected.triggers.length" class="muted text-sm">no triggers recorded</div>
                </template>
                <div v-else class="detail-empty">click a component to inspect</div>
            </div>
        </div>
    </div>
</template>

<style scoped>
.view {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
    padding: 12px;
    gap: 10px;
}

.controls {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
    flex-wrap: wrap;
}

.mode-group {
    display: flex;
    gap: 2px;
}

.threshold-group {
    display: flex;
    align-items: center;
    gap: 6px;
}

.stats-row {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 8px;
    flex-shrink: 0;
}

.split {
    display: flex;
    gap: 12px;
    flex: 1;
    overflow: hidden;
    min-height: 0;
}

.page-frame {
    flex: 1;
    overflow: auto;
    border: 0.5px solid var(--border);
    border-radius: var(--radius-lg);
    padding: 12px;
    background: var(--bg3);
}

.legend {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 10px;
}

.swatch-row {
    display: flex;
    gap: 2px;
}

.swatch {
    width: 16px;
    height: 8px;
    border-radius: 2px;
}

.sidebar {
    width: 260px;
    flex-shrink: 0;
    overflow: auto;
    border: 0.5px solid var(--border);
    border-radius: var(--radius-lg);
    padding: 12px;
    background: var(--bg3);
    display: flex;
    flex-direction: column;
    gap: 6px;
}

.detail-empty {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: var(--text3);
    font-size: 12px;
}

.detail-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
}

.meta-grid {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 4px 12px;
}

.section-label {
    font-size: 10px;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.4px;
    color: var(--text3);
    margin-top: 8px;
    margin-bottom: 4px;
}

.trigger-item {
    background: var(--bg2);
    border-radius: var(--radius);
    padding: 4px 8px;
    margin-bottom: 3px;
    color: var(--text2);
}
</style>
