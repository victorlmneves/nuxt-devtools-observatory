<script setup lang="ts">
import { ref, computed } from 'vue'
import { useObservatoryData, getObservatoryOrigin, type ComposableEntry as RuntimeComposableEntry } from '../stores/observatory'

interface ComposableViewEntry {
    id: string
    name: string
    component: string
    route: string
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

const { composables: rawEntries, connected, clearComposables } = useObservatoryData()

function clearSession() {
    const origin = getObservatoryOrigin()
    if (!origin) return
    // Optimistically empty the local list so the UI responds immediately
    clearComposables()
    // Tell the host app to wipe its registry too
    window.top?.postMessage({ type: 'observatory:clear-composables' }, origin)
}

const entries = computed<ComposableViewEntry[]>(() => {
    const groups = new Map<string, RuntimeComposableEntry[]>()

    for (const entry of rawEntries.value) {
        const key = `${entry.name}::${entry.componentFile}`
        const list = groups.get(key) ?? []
        list.push(entry)
        groups.set(key, list)
    }

    return [...groups.entries()].map(([key, group]) => {
        // Sort by the timestamp embedded in the id (format: name::uid::file:line::timestamp::rand)
        // so "latest" means the most recently registered instance, not the highest line number.
        const sorted = [...group].sort((a, b) => {
            const tsA = Number(a.id.split('::')[4] ?? 0)
            const tsB = Number(b.id.split('::')[4] ?? 0)
            return tsB - tsA
        })
        const latest = sorted[0]
        const leakReasons = [...new Set(group.map((entry) => entry.leakReason).filter(Boolean))]

        return {
            id: key,
            name: latest.name,
            component: latest.componentFile,
            // Show all unique routes this composable was seen on — most entries
            // will have just one, but session accumulation may show several.
            route: [...new Set(group.map((entry) => entry.route).filter(Boolean))].join(', ') || '/',
            instances: group.length,
            status: group.some((entry) => entry.status === 'mounted') ? 'mounted' : 'unmounted',
            leak: group.some((entry) => entry.leak),
            leakReason: leakReasons.join(' · ') || undefined,
            refs: Object.entries(latest.refs).map(([refKey, refValue]) => ({
                key: refKey,
                type: refValue.type,
                val: typeof refValue.value === 'string' ? refValue.value : JSON.stringify(refValue.value),
            })),
            watchers: group.reduce((sum, entry) => sum + entry.watcherCount, 0),
            intervals: group.reduce((sum, entry) => sum + entry.intervalCount, 0),
            lifecycle: {
                onMounted: group.some((entry) => entry.lifecycle.hasOnMounted),
                onUnmounted: group.some((entry) => entry.lifecycle.hasOnUnmounted),
                watchersCleaned: group.every((entry) => entry.lifecycle.watchersCleaned),
                intervalsCleaned: group.every((entry) => entry.lifecycle.intervalsCleaned),
            },
        }
    })
})

const filter = ref('all')
const search = ref('')
const expanded = ref<string | null>(null)

const counts = computed(() => ({
    mounted: entries.value.filter((entry) => entry.status === 'mounted').length,
    leaks: entries.value.filter((entry) => entry.leak).length,
}))

const filtered = computed(() => {
    return entries.value.filter((entry) => {
        if (filter.value === 'leak' && !entry.leak) {
            return false
        }

        if (filter.value === 'unmounted' && entry.status !== 'unmounted') {
            return false
        }

        const q = search.value.toLowerCase()

        if (q && !entry.name.toLowerCase().includes(q) && !entry.component.toLowerCase().includes(q)) {
            return false
        }

        return true
    })
})

function lifecycleRows(entry: ComposableViewEntry) {
    return [
        { label: 'onMounted', ok: entry.lifecycle.onMounted, status: entry.lifecycle.onMounted ? 'registered' : 'not used' },
        { label: 'onUnmounted', ok: entry.lifecycle.onUnmounted, status: entry.lifecycle.onUnmounted ? 'registered' : 'missing' },
        {
            label: 'watchers cleaned',
            ok: entry.lifecycle.watchersCleaned,
            status: entry.lifecycle.watchersCleaned ? 'all stopped' : 'NOT stopped',
        },
        {
            label: 'intervals cleared',
            ok: entry.lifecycle.intervalsCleaned,
            status: entry.lifecycle.intervalsCleaned ? 'all cleared' : 'NOT cleared',
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
                <div class="stat-val">{{ entries.reduce((sum, entry) => sum + entry.instances, 0) }}</div>
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
            <button class="clear-btn" title="Clear session history" @click="clearSession">clear session</button>
        </div>

        <div class="list">
            <div
                v-for="entry in filtered"
                :key="entry.id"
                class="comp-card"
                :class="{ leak: entry.leak, expanded: expanded === entry.id }"
                @click="expanded = expanded === entry.id ? null : entry.id"
            >
                <div class="comp-header">
                    <span class="mono bold" style="font-size: 12px">{{ entry.name }}</span>
                    <span class="muted text-sm" style="margin-left: 4px">{{ entry.component }}</span>
                    <div class="comp-meta">
                        <span v-if="entry.instances > 1" class="muted text-sm">{{ entry.instances }}×</span>
                        <span v-if="entry.watchers > 0 && !entry.leak" class="badge badge-warn">
                            {{ entry.watchers }} watcher{{ entry.watchers > 1 ? 's' : '' }}
                        </span>
                        <span v-if="entry.intervals > 0 && !entry.leak" class="badge badge-warn">
                            {{ entry.intervals }} interval{{ entry.intervals > 1 ? 's' : '' }}
                        </span>
                        <span v-if="entry.leak" class="badge badge-err">leak detected</span>
                        <span v-else-if="entry.status === 'mounted'" class="badge badge-ok">mounted</span>
                        <span v-else class="badge badge-gray">unmounted</span>
                    </div>
                </div>

                <div v-if="expanded === entry.id" class="comp-detail" @click.stop>
                    <div v-if="entry.leak" class="leak-banner">{{ entry.leakReason }}</div>

                    <div class="section-label">reactive state</div>
                    <div v-if="!entry.refs.length" class="muted text-sm" style="padding: 2px 0 6px">no tracked refs</div>
                    <div v-for="refEntry in entry.refs" :key="refEntry.key" class="ref-row">
                        <span class="mono text-sm" style="min-width: 90px; color: var(--text2)">{{ refEntry.key }}</span>
                        <span class="mono text-sm muted" style="flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap">
                            {{ refEntry.val }}
                        </span>
                        <span class="badge badge-info text-xs">{{ refEntry.type }}</span>
                    </div>

                    <div class="section-label" style="margin-top: 8px">lifecycle</div>
                    <div v-for="row in lifecycleRows(entry)" :key="row.label" class="lc-row">
                        <span class="lc-dot" :style="{ background: row.ok ? 'var(--teal)' : 'var(--red)' }"></span>
                        <span class="muted text-sm" style="min-width: 110px">{{ row.label }}</span>
                        <span class="text-sm" :style="{ color: row.ok ? 'var(--teal)' : 'var(--red)' }">{{ row.status }}</span>
                    </div>

                    <div class="section-label" style="margin-top: 8px">registered on</div>
                    <span class="mono text-sm muted">{{ entry.route }}</span>
                </div>
            </div>

            <div v-if="!filtered.length" class="muted text-sm" style="padding: 16px 0">
                {{ connected ? 'No composables recorded yet.' : 'Waiting for connection to the Nuxt app…' }}
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

.clear-btn {
    color: var(--text3);
    border-color: var(--border);
    flex-shrink: 0;
}

.clear-btn:hover {
    color: var(--red);
    border-color: var(--red);
    background: transparent;
}

.list {
    flex: 1;
    overflow: auto;
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-height: 0;
}

.comp-card {
    background: var(--bg3);
    border: 0.5px solid var(--border);
    border-radius: var(--radius-lg);
    overflow: hidden;
    cursor: pointer;
    flex-shrink: 0;
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
    min-height: 44px;
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
