<script setup lang="ts">
import { ref, computed } from 'vue'
import { useResizablePane } from '@observatory-client/composables/useResizablePane'
import { useObservatoryData } from '@observatory-client/stores/observatory'
import type { FetchEntry } from '@observatory/types/snapshot'

type FetchViewEntry = FetchEntry & { startOffset: number }

const { fetch, connected } = useObservatoryData()
const { paneWidth: detailWidth, onHandleMouseDown } = useResizablePane(280, 'observatory:fetch:detailWidth')

const filter = ref<string>('all')
const search = ref('')
const selectedId = ref<string | null>(null)
const waterfallOpen = ref(true)

const entries = computed<FetchViewEntry[]>(() => {
    const sorted = [...fetch.value].sort((a, b) => a.startTime - b.startTime)
    const minStart = sorted.length > 0 ? sorted[0].startTime : 0

    return sorted.map((entry) => ({
        ...entry,
        startOffset: Math.max(0, entry.startTime - minStart),
    }))
})

const selected = computed(() => entries.value.find((entry) => entry.id === selectedId.value) ?? null)

const counts = computed(() => ({
    ok: entries.value.filter((entry) => entry.status === 'ok' || entry.status === 'cached').length,
    pending: entries.value.filter((entry) => entry.status === 'pending').length,
    error: entries.value.filter((entry) => entry.status === 'error').length,
}))

const filtered = computed(() => {
    return entries.value.filter((entry) => {
        if (filter.value !== 'all' && entry.status !== filter.value) {
            return false
        }

        const q = search.value.toLowerCase()

        if (q && !entry.key.toLowerCase().includes(q) && !entry.url.toLowerCase().includes(q)) {
            return false
        }

        return true
    })
})

const metaRows = computed(() => {
    if (!selected.value) {
        return []
    }

    const entry = selected.value

    return [
        ['url', entry.url],
        ['status', entry.status],
        ['origin', entry.origin],
        ['duration', entry.ms != null ? `${entry.ms}ms` : '—'],
        ['size', entry.size ? formatSize(entry.size) : '—'],
        ['cached', entry.cached ? 'yes' : 'no'],
    ]
})

const payloadStr = computed(() => {
    if (!selected.value) {
        return ''
    }

    const payload = selected.value.payload

    if (payload === undefined) {
        return '(no payload captured yet)'
    }

    try {
        return JSON.stringify(payload, null, 2)
    } catch {
        return String(payload)
    }
})

function statusClass(status: string) {
    return { ok: 'badge-ok', error: 'badge-err', pending: 'badge-warn', cached: 'badge-gray' }[status] ?? 'badge-gray'
}

function barColor(status: string) {
    return { ok: 'var(--teal)', error: 'var(--red)', pending: 'var(--amber)', cached: 'var(--border)' }[status] ?? 'var(--border)'
}

function barWidth(entry: FetchViewEntry) {
    // Only consider completed entries for the max, so pending entries don't
    // collapse all bars to a dot while waiting.
    const completedMs = entries.value.filter((e) => e.ms != null).map((e) => e.ms!)
    const maxMs = completedMs.length > 0 ? Math.max(...completedMs, 1) : 1

    return entry.ms != null ? Math.max(4, Math.round((entry.ms / maxMs) * 100)) : 4
}

// Waterfall uses absolute time offsets from the earliest startTime.
// maxEnd is computed only from completed entries so that a long-running
// pending request doesn't squash all completed bars to invisible.
function waterfallScale() {
    const completed = entries.value.filter((e) => e.ms != null)
    const maxEnd = completed.length > 0 ? Math.max(...completed.map((e) => e.startOffset + e.ms!), 1) : 1

    return maxEnd
}

function wfLeft(entry: FetchViewEntry) {
    const scale = waterfallScale()
    return Math.min(98, Math.round((entry.startOffset / scale) * 100))
}

function wfWidth(entry: FetchViewEntry) {
    if (entry.ms == null) {
        // Pending: render a pulsing 2% bar at its start position instead of
        // a zero-width invisible bar.
        return 2
    }

    const scale = waterfallScale()
    const left = wfLeft(entry)

    // Clamp so bar + left never exceeds 100%
    return Math.min(100 - left, Math.max(2, Math.round((entry.ms / scale) * 100)))
}

function formatSize(bytes: number) {
    if (bytes < 1024) {
        return `${bytes}B`
    }

    return `${(bytes / 1024).toFixed(1)}KB`
}
</script>

<template>
    <div class="fetch-dashboard tracker-view">
        <div class="fetch-dashboard__stats tracker-stats-row">
            <div class="stat-card">
                <div class="stat-label">total</div>
                <div class="stat-val">{{ entries.length }}</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">success</div>
                <div class="stat-val stat-val--ok">{{ counts.ok }}</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">pending</div>
                <div class="stat-val stat-val--pending">{{ counts.pending }}</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">error</div>
                <div class="stat-val stat-val--error">{{ counts.error }}</div>
            </div>
        </div>

        <div class="fetch-dashboard__toolbar tracker-toolbar">
            <button :class="{ active: filter === 'all' }" @click="filter = 'all'">all</button>
            <button :class="{ 'danger-active': filter === 'error' }" @click="filter = 'error'">errors</button>
            <button :class="{ active: filter === 'pending' }" @click="filter = 'pending'">pending</button>
            <button :class="{ active: filter === 'cached' }" @click="filter = 'cached'">cached</button>
            <input
                v-model="search"
                type="search"
                class="fetch-dashboard__search tracker-toolbar__spacer"
                placeholder="search key or url…"
            />
        </div>

        <div class="fetch-dashboard__split tracker-split">
            <div class="fetch-dashboard__table tracker-table-wrap">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>key</th>
                            <th>url</th>
                            <th>status</th>
                            <th>origin</th>
                            <th>size</th>
                            <th>time</th>
                            <th class="fetch-dashboard__bar-column">bar</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr
                            v-for="entry in filtered"
                            :key="entry.id"
                            :class="{ selected: selected?.id === entry.id }"
                            @click="selectedId = entry.id"
                        >
                            <td>
                                <span class="fetch-dashboard__key mono tracker-mono-secondary">{{ entry.key }}</span>
                            </td>
                            <td>
                                <span class="fetch-dashboard__url mono tracker-mono-secondary tracker-truncate" :title="entry.url">
                                    {{ entry.url }}
                                </span>
                            </td>
                            <td>
                                <span class="badge" :class="statusClass(entry.status)">{{ entry.status }}</span>
                            </td>
                            <td>
                                <span class="badge" :class="entry.origin === 'ssr' ? 'badge-info' : 'badge-gray'">{{ entry.origin }}</span>
                            </td>
                            <td class="muted text-sm">{{ entry.size ? formatSize(entry.size) : '—' }}</td>
                            <td class="mono text-sm">{{ entry.ms != null ? `${entry.ms}ms` : '—' }}</td>
                            <td>
                                <div class="fetch-dashboard__bar-track tracker-progress-bar">
                                    <div
                                        class="fetch-dashboard__bar-fill tracker-progress-bar__fill"
                                        :style="{
                                            width: `${barWidth(entry)}%`,
                                            background: barColor(entry.status),
                                        }"
                                    ></div>
                                </div>
                            </td>
                        </tr>
                        <tr v-if="!filtered.length">
                            <td colspan="7" class="tracker-empty-cell">
                                {{ connected ? 'No fetches recorded yet.' : 'Waiting for connection to the Nuxt app…' }}
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>

            <div v-if="selected" class="tracker-resize-handle" @mousedown="onHandleMouseDown" />

            <div v-if="selected" class="fetch-dashboard__detail tracker-detail-panel" :style="{ width: detailWidth + 'px' }">
                <div class="fetch-dashboard__detail-header">
                    <span class="fetch-dashboard__detail-title mono bold">{{ selected.key }}</span>
                    <div class="flex gap-2">
                        <button @click="selectedId = null">×</button>
                    </div>
                </div>

                <div class="fetch-dashboard__meta-grid">
                    <template v-for="[key, value] in metaRows" :key="key">
                        <span class="muted text-sm">{{ key }}</span>
                        <span class="fetch-dashboard__meta-value mono text-sm">{{ value }}</span>
                    </template>
                </div>

                <div class="tracker-section-label fetch-dashboard__section-label">payload</div>
                <pre class="fetch-dashboard__payload-box">{{ payloadStr }}</pre>

                <div class="tracker-section-label fetch-dashboard__section-label fetch-dashboard__section-label--source">source</div>
                <div class="mono text-sm muted">{{ selected.file }}:{{ selected.line }}</div>
            </div>
            <div v-else class="tracker-detail-empty">select a call to inspect</div>
        </div>

        <div class="fetch-dashboard__waterfall">
            <div class="fetch-dashboard__waterfall-header">
                <div class="tracker-section-label fetch-dashboard__waterfall-label">waterfall</div>
                <button :class="{ active: waterfallOpen }" @click="waterfallOpen = !waterfallOpen">
                    {{ waterfallOpen ? 'hide' : 'show' }}
                </button>
            </div>

            <div v-if="waterfallOpen" class="fetch-dashboard__waterfall-body">
                <div v-for="entry in entries" :key="entry.id" class="fetch-dashboard__waterfall-row">
                    <span class="fetch-dashboard__waterfall-key mono muted text-sm">
                        {{ entry.key }}
                    </span>
                    <div class="fetch-dashboard__waterfall-track">
                        <div
                            class="fetch-dashboard__waterfall-bar"
                            :style="{
                                left: `${wfLeft(entry)}%`,
                                width: `${Math.max(2, wfWidth(entry))}%`,
                                background: barColor(entry.status),
                            }"
                        ></div>
                    </div>
                    <span class="fetch-dashboard__waterfall-time mono muted text-sm">
                        {{ entry.ms != null ? `${entry.ms}ms` : '—' }}
                    </span>
                </div>
            </div>
        </div>
    </div>
</template>

<style scoped>
.fetch-dashboard__search {
    max-width: 240px;
}

.fetch-dashboard__bar-column {
    min-width: 80px;
}

.fetch-dashboard__url {
    max-width: 200px;
}

.fetch-dashboard__detail-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
}

.fetch-dashboard__detail-title {
    font-size: var(--tracker-font-size-md);
}

.fetch-dashboard__meta-grid {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: var(--tracker-space-1) var(--tracker-space-3);
    font-size: var(--tracker-font-size-sm);
}

.fetch-dashboard__meta-value {
    word-break: break-all;
}

.fetch-dashboard__section-label {
    margin-top: 6px;
    min-height: fit-content;
}

.fetch-dashboard__section-label--source {
    margin-top: 10px;
}

.fetch-dashboard__payload-box {
    font-family: var(--mono);
    font-size: var(--tracker-font-size-sm);
    color: var(--text2);
    background: var(--bg2);
    border-radius: var(--radius);
    padding: var(--tracker-space-2) 10px;
    overflow: auto;
    white-space: pre;
    max-height: 160px;
}

.fetch-dashboard__waterfall {
    flex-shrink: 0;
    background: var(--bg3);
    border: var(--tracker-border-width) solid var(--border);
    border-radius: var(--radius-lg);
    padding: 10px var(--tracker-space-3);
}

.fetch-dashboard__waterfall-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--tracker-space-2);
}

.fetch-dashboard__waterfall-label {
    margin: 0;
}

.fetch-dashboard__waterfall-body {
    margin-top: var(--tracker-gap-toolbar);
}

.fetch-dashboard__waterfall-row {
    display: flex;
    align-items: center;
    gap: var(--tracker-space-2);
    margin-bottom: var(--tracker-space-1);
}

.fetch-dashboard__waterfall-key {
    width: 140px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex-shrink: 0;
}

.fetch-dashboard__waterfall-track {
    position: relative;
    flex: 1;
    height: 8px;
    background: var(--bg2);
    border-radius: 2px;
    overflow: hidden;
}

.fetch-dashboard__waterfall-bar {
    position: absolute;
    top: 0;
    height: 100%;
    border-radius: 2px;
    opacity: 0.8;
}

.fetch-dashboard__waterfall-time {
    width: 44px;
    text-align: right;
    flex-shrink: 0;
}
</style>
