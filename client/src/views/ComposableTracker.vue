<script setup lang="ts">
import { ref, computed } from 'vue'

interface RefEntry {
    key: string
    type: string
    val: string
}
interface ComposableEntry {
    id: string
    name: string
    component: string
    instances: number
    status: 'mounted' | 'unmounted'
    leak: boolean
    leakReason?: string
    refs: RefEntry[]
    watchers: number
    intervals: number
    lifecycle: { onMounted: boolean; onUnmounted: boolean; watchersCleaned: boolean; intervalsCleaned: boolean }
}

const entries = ref<ComposableEntry[]>([
    {
        id: '1',
        name: 'useAuth',
        component: 'App.vue',
        instances: 1,
        status: 'mounted',
        leak: false,
        refs: [
            { key: 'user', type: 'ref', val: '{ id: "u_9x3k", role: "admin" }' },
            { key: 'isLoggedIn', type: 'computed', val: 'true' },
        ],
        watchers: 1,
        intervals: 0,
        lifecycle: { onMounted: true, onUnmounted: true, watchersCleaned: true, intervalsCleaned: true },
    },
    {
        id: '2',
        name: 'useWebSocket',
        component: 'Dashboard.vue',
        instances: 1,
        status: 'unmounted',
        leak: true,
        leakReason: 'socket.close() never called — 2 watchers still running after unmount',
        refs: [
            { key: 'socket', type: 'ref', val: 'WebSocket { readyState: 1 }' },
            { key: 'messages', type: 'ref', val: 'Array(47)' },
        ],
        watchers: 2,
        intervals: 0,
        lifecycle: { onMounted: true, onUnmounted: false, watchersCleaned: false, intervalsCleaned: true },
    },
    {
        id: '3',
        name: 'usePoller',
        component: 'StockTicker.vue',
        instances: 2,
        status: 'unmounted',
        leak: true,
        leakReason: 'setInterval #37 never cleared — still firing every 2000ms',
        refs: [
            { key: 'data', type: 'ref', val: '{ price: 142.5 }' },
            { key: 'intervalId', type: 'ref', val: '37' },
        ],
        watchers: 0,
        intervals: 1,
        lifecycle: { onMounted: true, onUnmounted: false, watchersCleaned: true, intervalsCleaned: false },
    },
    {
        id: '4',
        name: 'useCart',
        component: 'CartDrawer.vue',
        instances: 1,
        status: 'mounted',
        leak: false,
        refs: [
            { key: 'items', type: 'ref', val: 'Array(3)' },
            { key: 'total', type: 'computed', val: '248.50' },
        ],
        watchers: 0,
        intervals: 0,
        lifecycle: { onMounted: false, onUnmounted: false, watchersCleaned: true, intervalsCleaned: true },
    },
    {
        id: '5',
        name: 'useBreakpoint',
        component: 'Layout.vue',
        instances: 1,
        status: 'mounted',
        leak: false,
        refs: [
            { key: 'isMobile', type: 'computed', val: 'false' },
            { key: 'width', type: 'ref', val: '1280' },
        ],
        watchers: 0,
        intervals: 0,
        lifecycle: { onMounted: true, onUnmounted: true, watchersCleaned: true, intervalsCleaned: true },
    },
    {
        id: '6',
        name: 'useIntersectionObserver',
        component: 'LazyImage.vue',
        instances: 4,
        status: 'mounted',
        leak: false,
        refs: [{ key: 'isVisible', type: 'ref', val: 'true' }],
        watchers: 0,
        intervals: 0,
        lifecycle: { onMounted: true, onUnmounted: true, watchersCleaned: true, intervalsCleaned: true },
    },
])

const filter = ref('all')
const search = ref('')
const expanded = ref<string | null>(null)

const counts = computed(() => ({
    mounted: entries.value.filter((e) => e.status === 'mounted').length,
    leaks: entries.value.filter((e) => e.leak).length,
}))

const filtered = computed(() => {
    return entries.value.filter((e) => {
        if (filter.value === 'leak' && !e.leak) return false
        if (filter.value === 'unmounted' && e.status !== 'unmounted') return false
        const q = search.value.toLowerCase()
        if (q && !e.name.toLowerCase().includes(q) && !e.component.toLowerCase().includes(q)) return false
        return true
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
