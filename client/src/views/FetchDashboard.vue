<script setup lang="ts">
import { ref, computed } from 'vue'
import { useObservatoryData } from '../stores/observatory'

interface FetchEntry {
    id: string
    key: string
    url: string
    status: 'pending' | 'ok' | 'error' | 'cached'
    origin: 'ssr' | 'csr'
    ms?: number
    size?: number
    cached: boolean
    payload?: unknown
    file?: string
    line?: number
    startOffset?: number
}

// Use live fetch data from the Nuxt registry bridge
const { fetches: entries } = useObservatoryData()

const filter = ref<string>('all')
const search = ref('')
const selected = ref<FetchEntry | null>(null)

const counts = computed(() => ({
    ok: entries.value?.filter((e) => e.status === 'ok').length ?? 0,
    pending: entries.value?.filter((e) => e.status === 'pending').length ?? 0,
    error: entries.value?.filter((e) => e.status === 'error').length ?? 0,
}))

const filtered = computed(() => {
    return (entries.value ?? []).filter((e) => {
        if (filter.value !== 'all' && e.status !== filter.value) return false
        const q = search.value.toLowerCase()
        if (q && !e.key.includes(q) && !e.url.includes(q)) return false
        return true
    })
})

const metaRows = computed(() => {
    if (!selected.value) return []
    const e = selected.value
    return [
        ['url', e.url],
        ['status', e.status],
        ['origin', e.origin],
        ['duration', e.ms != null ? e.ms + 'ms' : '—'],
        ['size', e.size ? formatSize(e.size) : '—'],
        ['cached', e.cached ? 'yes' : 'no'],
    ]
})

const payloadStr = computed(() => {
    if (!selected.value) return ''
    const p = selected.value.payload
    if (!p) return '(no payload captured yet)'
    try {
        return JSON.stringify(p, null, 2)
    } catch {
        return String(p)
    }
})

function statusClass(s: string) {
    return { ok: 'badge-ok', error: 'badge-err', pending: 'badge-warn', cached: 'badge-gray' }[s] ?? 'badge-gray'
}

function barColor(s: string) {
    return { ok: 'var(--teal)', error: 'var(--red)', pending: 'var(--amber)', cached: 'var(--border)' }[s] ?? 'var(--border)'
}

function barWidth(e: FetchEntry) {
    const maxMs = Math.max(...(entries.value ?? []).filter((x) => x.ms).map((x) => x.ms!), 1)
    return e.ms != null ? Math.max(4, Math.round((e.ms / maxMs) * 100)) : 4
}

function wfLeft(e: FetchEntry) {
    const maxEnd = Math.max(...(entries.value ?? []).map((x) => (x.startOffset ?? 0) + (x.ms ?? 0)), 1)
    return Math.round(((e.startOffset ?? 0) / maxEnd) * 100)
}
function wfWidth(e: FetchEntry) {
    const maxEnd = Math.max(...(entries.value ?? []).map((x) => (x.startOffset ?? 0) + (x.ms ?? 0)), 1)
    return e.ms != null ? Math.round((e.ms / maxEnd) * 100) : 2
}

function formatSize(bytes: number) {
    if (bytes < 1024) return bytes + 'B'
    return (bytes / 1024).toFixed(1) + 'KB'
}

function replayFetch() {
    // No-op: cannot replay fetch from devtools UI (see Nuxt docs)
    // You should call the original refresh() from useFetch in-app, not here
}

function clearAll() {
    // No-op: cannot clear live registry from client
    selected.value = null
}
</script>

<template>
    <div class="view">
        <!-- Stats row -->
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

        <!-- Toolbar -->
        <div class="toolbar">
            <button :class="{ active: filter === 'all' }" @click="filter = 'all'">all</button>
            <button :class="{ 'danger-active': filter === 'error' }" @click="filter = 'error'">errors</button>
            <button :class="{ active: filter === 'pending' }" @click="filter = 'pending'">pending</button>
            <button :class="{ active: filter === 'cached' }" @click="filter = 'cached'">cached</button>
            <input v-model="search" type="search" placeholder="search key or url…" style="max-width: 240px; margin-left: auto" />
            <button @click="clearAll">clear</button>
        </div>

        <!-- Split view -->
        <div class="split">
            <!-- Table -->
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
                        <tr v-for="e in filtered" :key="e.id" :class="{ selected: selected?.id === e.id }" @click="selected = e">
                            <td>
                                <span class="mono" style="font-size: 11px; color: var(--text2)">{{ e.key }}</span>
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
                                    :title="e.url"
                                >
                                    {{ e.url }}
                                </span>
                            </td>
                            <td>
                                <span class="badge" :class="statusClass(e.status)">{{ e.status }}</span>
                            </td>
                            <td>
                                <span class="badge" :class="e.origin === 'ssr' ? 'badge-info' : 'badge-gray'">{{ e.origin }}</span>
                            </td>
                            <td class="muted text-sm">{{ e.size ? formatSize(e.size) : '—' }}</td>
                            <td class="mono text-sm">{{ e.ms != null ? e.ms + 'ms' : '—' }}</td>
                            <td>
                                <div style="height: 4px; background: var(--bg2); border-radius: 2px; overflow: hidden">
                                    <div
                                        :style="{
                                            width: barWidth(e) + '%',
                                            background: barColor(e.status),
                                            height: '100%',
                                            borderRadius: '2px',
                                        }"
                                    ></div>
                                </div>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>

            <!-- Detail panel -->
            <div v-if="selected" class="detail-panel">
                <div class="detail-header">
                    <span class="mono bold" style="font-size: 12px">{{ selected.key }}</span>
                    <div class="flex gap-2">
                        <button @click="replayFetch">↺ replay</button>
                        <button @click="selected = null">×</button>
                    </div>
                </div>

                <div class="meta-grid">
                    <template v-for="[k, v] in metaRows" :key="k">
                        <span class="muted text-sm">{{ k }}</span>
                        <span class="mono text-sm" style="word-break: break-all">{{ v }}</span>
                    </template>
                </div>

                <div class="section-label">payload</div>
                <pre class="payload-box">{{ payloadStr }}</pre>

                <div class="section-label" style="margin-top: 10px">source</div>
                <div class="mono text-sm muted">{{ selected.file }}:{{ selected.line }}</div>
            </div>
            <div v-else class="detail-empty">select a call to inspect</div>
        </div>

        <!-- Waterfall -->
        <div class="waterfall">
            <div class="section-label" style="margin-bottom: 6px">waterfall</div>
            <div v-for="e in entries" :key="e.id" class="wf-row">
                <span
                    class="mono muted text-sm"
                    style="width: 140px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex-shrink: 0"
                >
                    {{ e.key }}
                </span>
                <div class="wf-track">
                    <div
                        class="wf-bar"
                        :style="{
                            left: wfLeft(e) + '%',
                            width: Math.max(2, wfWidth(e)) + '%',
                            background: barColor(e.status),
                        }"
                    ></div>
                </div>
                <span class="mono muted text-sm" style="width: 44px; text-align: right; flex-shrink: 0">
                    {{ e.ms != null ? e.ms + 'ms' : '—' }}
                </span>
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
