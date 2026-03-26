<script setup lang="ts">
import { ref, computed } from 'vue'
import { useObservatoryData, type FetchEntry } from '../stores/observatory'

type FetchViewEntry = FetchEntry & { startOffset: number }

const { fetch, connected } = useObservatoryData()

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
    <div class="view">
        <div class="stats-row">
            <div class="stat-card">
                <div class="stat-label">total</div>
                <div class="stat-val">{{ entries.length }}</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">success</div>
                <div class="stat-val" style="color: var(--teal)">{{ counts.ok }}</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">pending</div>
                <div class="stat-val" style="color: var(--amber)">{{ counts.pending }}</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">error</div>
                <div class="stat-val" style="color: var(--red)">{{ counts.error }}</div>
            </div>
        </div>

        <div class="toolbar">
            <button :class="{ active: filter === 'all' }" @click="filter = 'all'">all</button>
            <button :class="{ 'danger-active': filter === 'error' }" @click="filter = 'error'">errors</button>
            <button :class="{ active: filter === 'pending' }" @click="filter = 'pending'">pending</button>
            <button :class="{ active: filter === 'cached' }" @click="filter = 'cached'">cached</button>
            <input v-model="search" type="search" placeholder="search key or url…" style="max-width: 240px; margin-left: auto" />
        </div>

        <div class="split">
            <div class="table-wrap">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>key</th>
                            <th>url</th>
                            <th>status</th>
                            <th>origin</th>
                            <th>size</th>
                            <th>time</th>
                            <th style="min-width: 80px">bar</th>
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
                                <span class="mono" style="font-size: 11px; color: var(--text2)">{{ entry.key }}</span>
                            </td>
                            <td>
                                <span
                                    class="mono"
                                    style="
                                        font-size: 11px;
                                        max-width: 200px;
                                        display: block;
                                        overflow: hidden;
                                        text-overflow: ellipsis;
                                        white-space: nowrap;
                                    "
                                    :title="entry.url"
                                >
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
                                <div style="height: 4px; background: var(--bg2); border-radius: 2px; overflow: hidden">
                                    <div
                                        :style="{
                                            width: `${barWidth(entry)}%`,
                                            background: barColor(entry.status),
                                            height: '100%',
                                            borderRadius: '2px',
                                        }"
                                    ></div>
                                </div>
                            </td>
                        </tr>
                        <tr v-if="!filtered.length">
                            <td colspan="7" style="text-align: center; color: var(--text3); padding: 24px">
                                {{ connected ? 'No fetches recorded yet.' : 'Waiting for connection to the Nuxt app…' }}
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>

            <div v-if="selected" class="detail-panel">
                <div class="detail-header">
                    <span class="mono bold" style="font-size: 12px">{{ selected.key }}</span>
                    <div class="flex gap-2">
                        <button @click="selectedId = null">×</button>
                    </div>
                </div>

                <div class="meta-grid">
                    <template v-for="[key, value] in metaRows" :key="key">
                        <span class="muted text-sm">{{ key }}</span>
                        <span class="mono text-sm" style="word-break: break-all">{{ value }}</span>
                    </template>
                </div>

                <div class="section-label">payload</div>
                <pre class="payload-box">{{ payloadStr }}</pre>

                <div class="section-label" style="margin-top: 10px">source</div>
                <div class="mono text-sm muted">{{ selected.file }}:{{ selected.line }}</div>
            </div>
            <div v-else class="detail-empty">select a call to inspect</div>
        </div>

        <div class="waterfall">
            <div class="waterfall-header">
                <div class="section-label" style="margin-top: 0; margin-bottom: 0">waterfall</div>
                <button :class="{ active: waterfallOpen }" @click="waterfallOpen = !waterfallOpen">
                    {{ waterfallOpen ? 'hide' : 'show' }}
                </button>
            </div>

            <div v-if="waterfallOpen" class="waterfall-body">
                <div v-for="entry in entries" :key="entry.id" class="wf-row">
                    <span
                        class="mono muted text-sm"
                        style="width: 140px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex-shrink: 0"
                    >
                        {{ entry.key }}
                    </span>
                    <div class="wf-track">
                        <div
                            class="wf-bar"
                            :style="{
                                left: `${wfLeft(entry)}%`,
                                width: `${Math.max(2, wfWidth(entry))}%`,
                                background: barColor(entry.status),
                            }"
                        ></div>
                    </div>
                    <span class="mono muted text-sm" style="width: 44px; text-align: right; flex-shrink: 0">
                        {{ entry.ms != null ? `${entry.ms}ms` : '—' }}
                    </span>
                </div>
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

.split {
    display: flex;
    gap: 12px;
    flex: 1;
    overflow: hidden;
    min-height: 0;
}

.table-wrap {
    flex: 1;
    overflow: auto;
    border: 0.5px solid var(--border);
    border-radius: var(--radius-lg);
}

.detail-panel {
    width: 280px;
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
    overflow: auto;
    border: 0.5px solid var(--border);
    border-radius: var(--radius-lg);
    padding: 12px;
    background: var(--bg3);
}

.detail-empty {
    width: 280px;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--text3);
    font-size: 12px;
    border: 0.5px dashed var(--border);
    border-radius: var(--radius-lg);
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
    font-size: 11px;
}

.section-label {
    font-size: 10px;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.4px;
    color: var(--text3);
    margin-top: 6px;
    min-height: fit-content;
}

.payload-box {
    font-family: var(--mono);
    font-size: 11px;
    color: var(--text2);
    background: var(--bg2);
    border-radius: var(--radius);
    padding: 8px 10px;
    overflow: auto;
    white-space: pre;
    max-height: 160px;
}

.waterfall {
    flex-shrink: 0;
    background: var(--bg3);
    border: 0.5px solid var(--border);
    border-radius: var(--radius-lg);
    padding: 10px 12px;
}

.waterfall-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
}

.waterfall-body {
    margin-top: 6px;
}

.wf-row {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 4px;
}

.wf-track {
    flex: 1;
    position: relative;
    height: 8px;
    background: var(--bg2);
    border-radius: 2px;
    overflow: hidden;
}

.wf-bar {
    position: absolute;
    top: 0;
    height: 100%;
    border-radius: 2px;
    opacity: 0.8;
}
</style>
