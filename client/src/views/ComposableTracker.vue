<script setup lang="ts">
import { ref, computed, type Ref } from 'vue'
import { useObservatoryData } from '../stores/observatory'

interface ComposableEntry {
    id: string
    name: string
    component: string
    instances: number
    status: string
    leak: boolean
    leakReason?: string
    refs: Array<{ key: string; type: string; val: string }>
    watchers: number
    intervals: number
    lifecycle: {
        onMounted: boolean
        onUnmounted: boolean
        watchersCleaned: boolean
        intervalsCleaned: boolean
    }
}

const { composables } = useObservatoryData()
const entries = composables as Ref<ComposableEntry[]>

const filter = ref('all')
const search = ref('')
const expanded = ref<string | null>(null)

const counts = computed<{ mounted: number; leaks: number }>(() => {
    return {
        mounted: entries.value.filter((e) => e.status === 'mounted').length,
        leaks: entries.value.filter((e) => e.leak).length,
    }
})

const filtered = computed<ComposableEntry[]>(() => {
    return entries.value.filter((e) => {
        if (filter.value === 'leak' && !e.leak) {
            return false
        } else {
            if (filter.value === 'unmounted' && e.status !== 'unmounted') {
                return false
            } else {
                const q = search.value.toLowerCase()

                if (q && !e.name.toLowerCase().includes(q) && !e.component.toLowerCase().includes(q)) {
                    return false
                } else {
                    return true
                }
            }
        }
    })
})

function lifecycleRows(e: ComposableEntry) {
    return [
        { label: 'onMounted', ok: e.lifecycle.onMounted, status: e.lifecycle.onMounted ? 'registered' : 'not used' },
        { label: 'onUnmounted', ok: e.lifecycle.onUnmounted, status: e.lifecycle.onUnmounted ? 'registered' : 'missing' },
        { label: 'watchers cleaned', ok: e.lifecycle.watchersCleaned, status: e.lifecycle.watchersCleaned ? 'all stopped' : 'NOT stopped' },
        {
            label: 'intervals cleared',
            ok: e.lifecycle.intervalsCleaned,
            status: e.lifecycle.intervalsCleaned ? 'all cleared' : 'NOT cleared',
        },
    ]
}
</script>

<template>
    <div class="view">
        <div class="stats-row">
            <div class="stat-card">
                <div class="stat-label">total</div>
                <div class="stat-val">{{ entries.length }}</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">mounted</div>
                <div class="stat-val" style="color: var(--teal)">{{ counts.mounted }}</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">leaks</div>
                <div class="stat-val" style="color: var(--red)">{{ counts.leaks }}</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">instances</div>
                <div class="stat-val">{{ entries.reduce((a, e) => a + e.instances, 0) }}</div>
            </div>
        </div>

        <div class="toolbar">
            <button :class="{ active: filter === 'all' }" @click="filter = 'all'">all</button>
            <button :class="{ 'danger-active': filter === 'leak' }" @click="filter = 'leak'">leaks only</button>
            <button :class="{ active: filter === 'unmounted' }" @click="filter = 'unmounted'">unmounted</button>
            <input
                v-model="search"
                type="search"
                placeholder="search composable or component…"
                style="max-width: 220px; margin-left: auto"
            />
        </div>

        <div class="list">
            <div
                v-for="e in filtered"
                :key="e.id"
                class="comp-card"
                :class="{ leak: e.leak, expanded: expanded === e.id }"
                @click="expanded = expanded === e.id ? null : e.id"
            >
                <div class="comp-header">
                    <span class="mono bold" style="font-size: 12px">{{ e.name }}</span>
                    <span class="muted text-sm" style="margin-left: 4px">{{ e.component }}</span>
                    <div class="comp-meta">
                        <span v-if="e.instances > 1" class="muted text-sm">{{ e.instances }}×</span>
                        <span v-if="e.watchers > 0 && !e.leak" class="badge badge-warn">
                            {{ e.watchers }} watcher{{ e.watchers > 1 ? 's' : '' }}
                        </span>
                        <span v-if="e.intervals > 0 && !e.leak" class="badge badge-warn">
                            {{ e.intervals }} interval{{ e.intervals > 1 ? 's' : '' }}
                        </span>
                        <span v-if="e.leak" class="badge badge-err">leak detected</span>
                        <span v-else-if="e.status === 'mounted'" class="badge badge-ok">mounted</span>
                        <span v-else class="badge badge-gray">unmounted</span>
                    </div>
                </div>

                <!-- Expanded detail -->
                <div v-if="expanded === e.id" class="comp-detail" @click.stop>
                    <div v-if="e.leak" class="leak-banner">{{ e.leakReason }}</div>

                    <div class="section-label">reactive state</div>
                    <div v-for="r in e.refs" :key="r.key" class="ref-row">
                        <span class="mono text-sm" style="min-width: 90px; color: var(--text2)">{{ r.key }}</span>
                        <span class="mono text-sm muted" style="flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap">
                            {{ r.val }}
                        </span>
                        <span class="badge badge-info text-xs">{{ r.type }}</span>
                    </div>

                    <div class="section-label" style="margin-top: 8px">lifecycle</div>
                    <div v-for="lc in lifecycleRows(e)" :key="lc.label" class="lc-row">
                        <span class="lc-dot" :style="{ background: lc.ok ? 'var(--teal)' : 'var(--red)' }"></span>
                        <span class="muted text-sm" style="min-width: 110px">{{ lc.label }}</span>
                        <span class="text-sm" :style="{ color: lc.ok ? 'var(--teal)' : 'var(--red)' }">{{ lc.status }}</span>
                    </div>
                </div>
            </div>

            <div v-if="!filtered.length" class="muted text-sm" style="padding: 16px 0">no composables match</div>
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

.stats-row {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 8px;
    flex-shrink: 0;
}

.toolbar {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;
    flex-wrap: wrap;
}

.list {
    flex: 1;
    overflow: auto;
    display: flex;
    flex-direction: column;
    gap: 6px;
}

.comp-card {
    background: var(--bg3);
    border: 0.5px solid var(--border);
    border-radius: var(--radius-lg);
    overflow: hidden;
    cursor: pointer;
}

.comp-card:hover {
    border-color: var(--text3);
}

.comp-card.leak {
    border-left: 2px solid var(--red);
    border-radius: 0 var(--radius-lg) var(--radius-lg) 0;
}

.comp-card.expanded {
    border-color: var(--purple);
}

.comp-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 9px 13px;
}

.comp-meta {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-left: auto;
}

.comp-detail {
    border-top: 0.5px solid var(--border);
    padding: 10px 13px;
}

.leak-banner {
    background: rgb(226 75 74 / 10%);
    border-radius: var(--radius);
    padding: 7px 10px;
    font-size: 12px;
    color: var(--red);
    margin-bottom: 8px;
}

.section-label {
    font-size: 10px;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.4px;
    color: var(--text3);
    margin-bottom: 5px;
}

.ref-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 5px 8px;
    background: var(--bg2);
    border-radius: var(--radius);
    margin-bottom: 3px;
}

.lc-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 0;
}

.lc-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    flex-shrink: 0;
}
</style>
