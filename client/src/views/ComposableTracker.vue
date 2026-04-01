<script setup lang="ts">
import { ref, computed } from 'vue'
import { useObservatoryData, getObservatoryOrigin, type ComposableEntry as RuntimeComposableEntry } from '../stores/observatory'

const { composables: rawEntries, connected, clearComposables } = useObservatoryData()

function clearSession() {
    const origin = getObservatoryOrigin()
    if (!origin) return
    clearComposables()
    window.top?.postMessage({ type: 'observatory:clear-composables' }, origin)
}

// ── Flat per-instance display ─────────────────────────────────────────────
// Each entry is shown individually so you can see exactly which component
// instance uses which state. No grouping — instanceA and instanceB of the
// same composable in different components are two separate rows.

function formatVal(v: unknown): string {
    if (v === null) return 'null'
    if (v === undefined) return 'undefined'
    if (typeof v === 'string') return `"${v}"`
    if (typeof v === 'object') {
        try {
            const s = JSON.stringify(v)
            return s.length > 80 ? s.slice(0, 80) + '…' : s
        } catch {
            return String(v)
        }
    }
    return String(v)
}

/**
 * Full (non-truncated) formatter used in the expanded detail rows.
 * @param {unknown} v - The value to format.
 * @returns {string} Pretty-printed JSON or primitive string.
 */
function formatValFull(v: unknown): string {
    if (v === null) {
        return 'null'
    }

    if (v === undefined) {
        return 'undefined'
    }

    if (typeof v === 'string') {
        return `"${v}"`
    }

    if (typeof v === 'object') {
        try {
            return JSON.stringify(v, null, 2)
        } catch {
            return String(v)
        }
    }

    return String(v)
}

function basename(file: string) {
    return file.split('/').pop() ?? file
}

function openInEditor(file: string) {
    if (!file || file === 'unknown') {
        return
    }

    const origin = getObservatoryOrigin()

    if (!origin) {
        return
    }

    window.top?.postMessage({ type: 'observatory:open-in-editor', file }, origin)
}

const filter = ref('all')
const search = ref('')
const expanded = ref<string | null>(null)

const entries = computed<RuntimeComposableEntry[]>(() => rawEntries.value)

const counts = computed(() => ({
    mounted: entries.value.filter((e) => e.status === 'mounted').length,
    leaks: entries.value.filter((e) => e.leak).length,
}))

const filtered = computed(() => {
    return entries.value.filter((entry) => {
        if (filter.value === 'leak' && !entry.leak) {
            return false
        }

        if (filter.value === 'mounted' && entry.status !== 'mounted') {
            return false
        }

        if (filter.value === 'unmounted' && entry.status !== 'unmounted') {
            return false
        }

        const q = search.value.toLowerCase()

        if (q) {
            const matchesName = entry.name.toLowerCase().includes(q)
            const matchesFile = entry.componentFile.toLowerCase().includes(q)
            const matchesRef = Object.keys(entry.refs).some((k) => k.toLowerCase().includes(q))
            const matchesVal = Object.values(entry.refs).some((v) => {
                try {
                    return String(JSON.stringify(v.value)).toLowerCase().includes(q)
                } catch {
                    return false
                }
            })

            if (!matchesName && !matchesFile && !matchesRef && !matchesVal) {
                return false
            }
        }

        return true
    })
})

function lifecycleRows(entry: RuntimeComposableEntry) {
    return [
        {
            label: 'onMounted',
            ok: entry.lifecycle.hasOnMounted,
            status: entry.lifecycle.hasOnMounted ? 'registered' : 'not used',
        },
        {
            label: 'onUnmounted',
            ok: entry.lifecycle.hasOnUnmounted,
            status: entry.lifecycle.hasOnUnmounted ? 'registered' : 'missing',
        },
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

function typeBadgeClass(type: string) {
    if (type === 'computed') {
        return 'badge-info'
    }

    if (type === 'reactive') {
        return 'badge-purple'
    }

    return 'badge-gray'
}

// ── Collapsible ref values ──────────────────────────────────────────────
// Long values (objects/arrays) start collapsed inside the expanded card.
// Clicking the toggle chevron expands/collapses them inline.

/** Keys that are currently expanded: "<entryId>:<refKey>" */
const expandedRefs = ref<Set<string>>(new Set())

function refExpandKey(entryId: string, refKey: string) {
    return `${entryId}:${refKey}`
}

function isLongValue(v: unknown): boolean {
    if (v === null || v === undefined || typeof v !== 'object') return false
    try {
        return JSON.stringify(v).length > 60
    } catch {
        return false
    }
}

function isRefExpanded(entryId: string, refKey: string): boolean {
    return expandedRefs.value.has(refExpandKey(entryId, refKey))
}

function toggleRefExpand(entryId: string, refKey: string) {
    const key = refExpandKey(entryId, refKey)
    const next = new Set(expandedRefs.value)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    expandedRefs.value = next
}

// ── Reverse lookup ────────────────────────────────────────────────────────
// Clicking a ref key shows every mounted instance that exposes the same key.

const lookupKey = ref<string | null>(null)

const lookupResults = computed(() => {
    if (!lookupKey.value) {
        return []
    }

    const key = lookupKey.value

    return entries.value.filter((e) => key in e.refs)
})

function openLookup(key: string) {
    lookupKey.value = lookupKey.value === key ? null : key
}

// ── Inline editing ────────────────────────────────────────────────────────
// Only writable refs (type === 'ref') can be edited. Computed are read-only.

interface EditTarget {
    id: string
    key: string
    rawValue: string
}

const editTarget = ref<EditTarget | null>(null)
const editError = ref('')

function openEdit(id: string, key: string, currentValue: unknown) {
    editError.value = ''
    editTarget.value = {
        id,
        key,
        rawValue: JSON.stringify(currentValue, null, 2),
    }
}

function applyEdit() {
    if (!editTarget.value) {
        return
    }

    let parsed: unknown

    try {
        parsed = JSON.parse(editTarget.value.rawValue)
        editError.value = ''
    } catch (err) {
        editError.value = `Invalid JSON: ${(err as Error).message}`
        return
    }

    const origin = getObservatoryOrigin()

    if (!origin) {
        return
    }

    window.top?.postMessage(
        {
            type: 'observatory:edit-composable',
            id: editTarget.value.id,
            key: editTarget.value.key,
            value: parsed,
        },
        origin
    )

    editTarget.value = null
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
                <div class="stat-val">{{ entries.length }}</div>
            </div>
        </div>

        <div class="toolbar">
            <button :class="{ active: filter === 'all' }" @click="filter = 'all'">all</button>
            <button :class="{ active: filter === 'mounted' }" @click="filter = 'mounted'">mounted</button>
            <button :class="{ 'danger-active': filter === 'leak' }" @click="filter = 'leak'">leaks only</button>
            <button :class="{ active: filter === 'unmounted' }" @click="filter = 'unmounted'">unmounted</button>
            <input v-model="search" type="search" placeholder="search name, file, or ref…" style="max-width: 220px; margin-left: auto" />
            <button class="clear-btn" title="Clear session history" @click="clearSession">clear</button>
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
                    <div class="comp-identity">
                        <span class="comp-name mono">{{ entry.name }}</span>
                        <span class="comp-file muted mono">{{ basename(entry.componentFile) }}</span>
                    </div>
                    <div class="comp-meta">
                        <span v-if="entry.watcherCount > 0 && !entry.leak" class="badge badge-warn">{{ entry.watcherCount }}w</span>
                        <span v-if="entry.intervalCount > 0 && !entry.leak" class="badge badge-warn">{{ entry.intervalCount }}t</span>
                        <span v-if="entry.leak" class="badge badge-err">leak</span>
                        <span v-else-if="entry.status === 'mounted'" class="badge badge-ok">mounted</span>
                        <span v-else class="badge badge-gray">unmounted</span>
                    </div>
                </div>

                <!-- Inline ref preview — shows up to 3 refs without expanding -->
                <div v-if="Object.keys(entry.refs).length" class="refs-preview">
                    <span
                        v-for="[k, v] in Object.entries(entry.refs).slice(0, 3)"
                        :key="k"
                        class="ref-chip"
                        :class="{
                            'ref-chip--reactive': v.type === 'reactive',
                            'ref-chip--computed': v.type === 'computed',
                            'ref-chip--shared': entry.sharedKeys?.includes(k),
                        }"
                        :title="entry.sharedKeys?.includes(k) ? 'shared global state' : ''"
                    >
                        <span class="ref-chip-key">{{ k }}</span>
                        <span class="ref-chip-val">{{ formatVal(v.value) }}</span>
                        <span v-if="entry.sharedKeys?.includes(k)" class="ref-chip-shared-dot" title="global"></span>
                    </span>
                    <span v-if="Object.keys(entry.refs).length > 3" class="muted text-sm">
                        +{{ Object.keys(entry.refs).length - 3 }} more
                    </span>
                </div>

                <div v-if="expanded === entry.id" class="comp-detail" @click.stop>
                    <div v-if="entry.leak" class="leak-banner">{{ entry.leakReason }}</div>

                    <!-- Global state warning -->
                    <div v-if="entry.sharedKeys?.length" class="global-banner">
                        <span class="global-dot"></span>
                        <span>
                            <strong>global state</strong>
                            — {{ entry.sharedKeys.join(', ') }}
                            {{ entry.sharedKeys.length === 1 ? 'is' : 'are' }}
                            shared across all instances of {{ entry.name }}
                        </span>
                    </div>

                    <div class="section-label">reactive state</div>
                    <div v-if="!Object.keys(entry.refs).length" class="muted text-sm" style="padding: 2px 0 6px">
                        no tracked state returned
                    </div>
                    <div v-for="[k, v] in Object.entries(entry.refs)" :key="k" class="ref-row">
                        <span
                            class="mono text-sm ref-key ref-key--clickable"
                            :title="`click to see all instances exposing '${k}'`"
                            @click.stop="openLookup(k)"
                        >
                            {{ k }}
                        </span>
                        <span
                            class="mono text-sm ref-val"
                            :class="{
                                'ref-val--full': isLongValue(v.value) && isRefExpanded(entry.id, k),
                                'ref-val--collapsed': isLongValue(v.value) && !isRefExpanded(entry.id, k),
                            }"
                        >
                            {{ isLongValue(v.value) && !isRefExpanded(entry.id, k) ? formatVal(v.value) : formatValFull(v.value) }}
                        </span>
                        <div class="ref-row-actions">
                            <button
                                v-if="isLongValue(v.value)"
                                class="expand-btn"
                                :title="isRefExpanded(entry.id, k) ? 'Collapse' : 'Expand'"
                                @click.stop="toggleRefExpand(entry.id, k)"
                            >
                                {{ isRefExpanded(entry.id, k) ? '▲' : '▼' }}
                            </button>
                            <span class="badge text-xs" :class="typeBadgeClass(v.type)">{{ v.type }}</span>
                            <span v-if="entry.sharedKeys?.includes(k)" class="badge badge-amber text-xs">global</span>
                            <button
                                v-if="v.type === 'ref'"
                                class="edit-btn"
                                title="Edit value"
                                @click.stop="openEdit(entry.id, k, v.value)"
                            >
                                edit
                            </button>
                        </div>
                    </div>

                    <template v-if="entry.history && entry.history.length">
                        <div class="section-label" style="margin-top: 10px">
                            change history
                            <span class="muted" style="font-weight: 400; text-transform: none; letter-spacing: 0">
                                ({{ entry.history.length }} events)
                            </span>
                        </div>
                        <div class="history-list">
                            <div v-for="(evt, idx) in [...entry.history].reverse().slice(0, 20)" :key="idx" class="history-row">
                                <span class="history-time mono muted">+{{ (evt.t / 1000).toFixed(2) }}s</span>
                                <span class="history-key mono">{{ evt.key }}</span>
                                <span class="history-val mono">{{ formatVal(evt.value) }}</span>
                            </div>
                            <div v-if="entry.history.length > 20" class="muted text-sm" style="padding: 2px 0">
                                … {{ entry.history.length - 20 }} earlier events
                            </div>
                        </div>
                    </template>

                    <div class="section-label" style="margin-top: 10px">lifecycle</div>
                    <div v-for="row in lifecycleRows(entry)" :key="row.label" class="lc-row">
                        <span class="lc-dot" :style="{ background: row.ok ? 'var(--teal)' : 'var(--red)' }"></span>
                        <span class="muted text-sm" style="min-width: 120px">{{ row.label }}</span>
                        <span class="text-sm" :style="{ color: row.ok ? 'var(--teal)' : 'var(--red)' }">{{ row.status }}</span>
                    </div>

                    <div class="section-label" style="margin-top: 10px">context</div>
                    <div class="lc-row">
                        <span class="muted text-sm" style="min-width: 120px">component</span>
                        <span class="mono text-sm">{{ basename(entry.componentFile) }}</span>
                    </div>
                    <div class="lc-row">
                        <span class="muted text-sm" style="min-width: 120px">uid</span>
                        <span class="mono text-sm muted">{{ entry.componentUid }}</span>
                    </div>
                    <div class="lc-row">
                        <span class="muted text-sm" style="min-width: 120px">defined in</span>
                        <span class="mono text-sm muted" style="display: flex; align-items: center; gap: 6px">
                            {{ entry.file }}:{{ entry.line }}
                            <button class="jump-btn" title="Open in editor" @click.stop="openInEditor(entry.file)">open ↗</button>
                        </span>
                    </div>
                    <div class="lc-row">
                        <span class="muted text-sm" style="min-width: 120px">route</span>
                        <span class="mono text-sm muted">{{ entry.route }}</span>
                    </div>
                    <div class="lc-row">
                        <span class="muted text-sm" style="min-width: 120px">watchers</span>
                        <span class="mono text-sm">{{ entry.watcherCount }}</span>
                    </div>
                    <div class="lc-row">
                        <span class="muted text-sm" style="min-width: 120px">intervals</span>
                        <span class="mono text-sm">{{ entry.intervalCount }}</span>
                    </div>
                </div>
            </div>

            <div v-if="!filtered.length" class="muted text-sm" style="padding: 16px 0">
                {{ connected ? 'No composables recorded yet.' : 'Waiting for connection to the Nuxt app…' }}
            </div>
        </div>

        <!-- ── Reverse lookup panel ──────────────────────────────────────── -->
        <Transition name="slide">
            <div v-if="lookupKey" class="lookup-panel">
                <div class="lookup-header">
                    <span class="mono text-sm">{{ lookupKey }}</span>
                    <span class="muted text-sm">— {{ lookupResults.length }} instance{{ lookupResults.length !== 1 ? 's' : '' }}</span>
                    <button class="clear-btn" style="margin-left: auto" @click="lookupKey = null">✕</button>
                </div>
                <div v-if="!lookupResults.length" class="muted text-sm" style="padding: 6px 0">No mounted instances expose this key.</div>
                <div v-for="r in lookupResults" :key="r.id" class="lookup-row">
                    <span class="mono text-sm">{{ r.name }}</span>
                    <span class="muted text-sm">{{ basename(r.componentFile) }}</span>
                    <span class="muted text-sm" style="margin-left: auto">{{ r.route }}</span>
                </div>
            </div>
        </Transition>

        <!-- ── Edit value dialog ─────────────────────────────────────────── -->
        <Transition name="fade">
            <div v-if="editTarget" class="edit-overlay" @click.self="editTarget = null">
                <div class="edit-dialog">
                    <div class="edit-dialog-header">
                        edit
                        <span class="mono">{{ editTarget.key }}</span>
                        <button class="clear-btn" style="margin-left: auto" @click="editTarget = null">✕</button>
                    </div>
                    <p class="muted text-sm" style="padding: 4px 0 8px">
                        Value applied immediately to the live ref. Only
                        <span class="mono">ref</span>
                        values are writable.
                    </p>
                    <textarea v-model="editTarget.rawValue" class="edit-textarea" rows="6" spellcheck="false" />
                    <div v-if="editError" class="edit-error text-sm">{{ editError }}</div>
                    <div class="edit-actions">
                        <button @click="applyEdit">apply</button>
                        <button class="clear-btn" @click="editTarget = null">cancel</button>
                    </div>
                </div>
            </div>
        </Transition>
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
    gap: 5px;
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
    justify-content: space-between;
    padding: 8px 12px;
    gap: 8px;
}

.comp-identity {
    display: flex;
    align-items: baseline;
    gap: 6px;
    min-width: 0;
    flex: 1;
}

.comp-name {
    font-size: 12px;
    font-weight: 500;
    color: var(--text);
    flex-shrink: 0;
}

.comp-file {
    font-size: 11px;
    color: var(--text3);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.comp-meta {
    display: flex;
    align-items: center;
    gap: 5px;
    flex-shrink: 0;
}

/* Inline ref preview chips */
.refs-preview {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    padding: 0 12px 8px;
    align-items: center;
}

.ref-chip {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px 7px;
    border-radius: 4px;
    background: var(--bg2);
    border: 0.5px solid var(--border);
    font-size: 11px;
    font-family: var(--mono);
    max-width: 220px;
    overflow: hidden;
}

.ref-chip--reactive {
    border-color: color-mix(in srgb, var(--purple) 40%, var(--border));
    background: color-mix(in srgb, var(--purple) 8%, var(--bg2));
}

.ref-chip--computed {
    border-color: color-mix(in srgb, var(--blue) 40%, var(--border));
    background: color-mix(in srgb, var(--blue) 8%, var(--bg2));
}

.ref-chip-key {
    color: var(--text2);
    flex-shrink: 0;
}

.ref-chip-val {
    color: var(--teal);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

/* Expanded detail */
.comp-detail {
    padding: 4px 12px 12px;
    border-top: 0.5px solid var(--border);
    display: flex;
    flex-direction: column;
    gap: 3px;
}

.leak-banner {
    background: color-mix(in srgb, var(--red) 12%, transparent);
    border: 0.5px solid color-mix(in srgb, var(--red) 40%, var(--border));
    border-radius: var(--radius);
    padding: 6px 10px;
    font-size: 11px;
    color: var(--red);
    margin-bottom: 6px;
    font-family: var(--mono);
}

.section-label {
    font-size: 10px;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.4px;
    color: var(--text3);
    margin-top: 6px;
    margin-bottom: 3px;
}

.ref-row {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    padding: 3px 0;
}

.ref-key {
    min-width: 90px;
    color: var(--text2);
    flex-shrink: 0;
}

.ref-val {
    flex: 1;
    color: var(--teal);
    min-width: 0;
}

.ref-val--collapsed {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.ref-val--full {
    white-space: pre-wrap;
    word-break: break-all;
    line-height: 1.5;
}

.ref-row-actions {
    display: flex;
    align-items: center;
    gap: 4px;
    flex-shrink: 0;
}

.expand-btn {
    font-size: 9px;
    padding: 1px 5px;
    border-radius: 4px;
    border: 0.5px solid var(--border);
    background: var(--bg2);
    color: var(--text3);
    cursor: pointer;
    line-height: 1.4;
    flex-shrink: 0;
}

.expand-btn:hover {
    border-color: var(--text3);
    color: var(--text);
}

.lc-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 2px 0;
}

.lc-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    flex-shrink: 0;
}

.ref-chip--shared {
    border-color: color-mix(in srgb, var(--amber) 50%, var(--border));
    background: color-mix(in srgb, var(--amber) 10%, var(--bg2));
}

.ref-chip-shared-dot {
    display: inline-block;
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: var(--amber);
    flex-shrink: 0;
    margin-left: 1px;
}

.global-banner {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    background: color-mix(in srgb, var(--amber) 10%, transparent);
    border: 0.5px solid color-mix(in srgb, var(--amber) 40%, var(--border));
    border-radius: var(--radius);
    padding: 7px 10px;
    font-size: 11px;
    color: var(--text2);
    margin-bottom: 6px;
}

.global-dot {
    display: inline-block;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--amber);
    flex-shrink: 0;
    margin-top: 3px;
}

.badge-amber {
    background: color-mix(in srgb, var(--amber) 15%, transparent);
    color: color-mix(in srgb, var(--amber) 80%, var(--text));
    border: 0.5px solid color-mix(in srgb, var(--amber) 40%, var(--border));
}

.history-list {
    display: flex;
    flex-direction: column;
    gap: 1px;
    background: var(--bg2);
    border-radius: var(--radius);
    padding: 4px 8px;
    max-height: 180px;
    overflow-y: auto;
}

.history-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 2px 0;
    font-size: 11px;
    font-family: var(--mono);
    border-bottom: 0.5px solid var(--border);
}

.history-row:last-child {
    border-bottom: none;
}

.history-time {
    min-width: 52px;
    color: var(--text3);
    flex-shrink: 0;
}

.history-key {
    min-width: 80px;
    color: var(--text2);
    flex-shrink: 0;
}

.history-val {
    color: var(--amber);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex: 1;
}

/* Stat cards */
.stat-card {
    background: var(--bg3);
    border: 0.5px solid var(--border);
    border-radius: var(--radius-lg);
    padding: 10px 14px;
}

.stat-label {
    font-size: 10px;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.4px;
    color: var(--text3);
    margin-bottom: 4px;
}

.stat-val {
    font-size: 22px;
    font-weight: 500;
    line-height: 1;
    color: var(--text);
}

/* Clickable ref key */
.ref-key--clickable {
    cursor: pointer;
    text-decoration: underline dotted var(--text3);
    text-underline-offset: 2px;
}

.ref-key--clickable:hover {
    color: var(--purple);
    text-decoration-color: var(--purple);
}

/* Edit button inline with ref row */
.edit-btn {
    font-size: 10px;
    padding: 1px 6px;
    border-radius: var(--radius);
    border: 0.5px solid var(--border);
    background: transparent;
    color: var(--text3);
    cursor: pointer;
    margin-left: auto;
    flex-shrink: 0;
    font-family: var(--mono);
}

.edit-btn:hover {
    border-color: var(--purple);
    color: var(--purple);
    background: color-mix(in srgb, var(--purple) 8%, transparent);
}

/* Reverse lookup panel — appears below the list */
.lookup-panel {
    flex-shrink: 0;
    border: 0.5px solid var(--border);
    border-radius: var(--radius-lg);
    background: var(--bg3);
    overflow: hidden;
}

.lookup-header {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 7px 12px;
    border-bottom: 0.5px solid var(--border);
    background: var(--bg2);
}

.lookup-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 5px 12px;
    border-bottom: 0.5px solid var(--border);
}

.lookup-row:last-child {
    border-bottom: none;
}

/* Edit overlay + dialog */
.edit-overlay {
    position: fixed;
    inset: 0;
    background: rgb(0 0 0 / 40%);
    z-index: 100;
    display: flex;
    align-items: center;
    justify-content: center;
}

.edit-dialog {
    background: var(--bg1, var(--bg2));
    border: 0.5px solid var(--border);
    border-radius: var(--radius-lg);
    padding: 14px 16px;
    width: 380px;
    max-width: 92vw;
    display: flex;
    flex-direction: column;
    gap: 6px;
    box-shadow: 0 8px 32px rgb(0 0 0 / 30%);
}

.edit-dialog-header {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    color: var(--text2);
    margin-bottom: 2px;
}

.edit-textarea {
    width: 100%;
    font-family: var(--mono);
    font-size: 12px;
    padding: 8px 10px;
    background: var(--bg2);
    border: 0.5px solid var(--border);
    border-radius: var(--radius);
    color: var(--text);
    resize: vertical;
    outline: none;
}

.edit-textarea:focus {
    border-color: var(--purple);
}

.edit-error {
    color: var(--red);
    font-family: var(--mono);
}

.edit-actions {
    display: flex;
    gap: 6px;
    padding-top: 4px;
}

/* Slide / fade transitions for the panels */
.slide-enter-active,
.slide-leave-active {
    transition:
        opacity 0.15s,
        transform 0.15s;
}

.slide-enter-from,
.slide-leave-to {
    opacity: 0;
    transform: translateY(6px);
}

.fade-enter-active,
.fade-leave-active {
    transition: opacity 0.15s;
}

.fade-enter-from,
.fade-leave-to {
    opacity: 0;
}

.jump-btn {
    font-size: 10px;
    padding: 1px 6px;
    border: 0.5px solid var(--border);
    border-radius: var(--radius);
    background: transparent;
    color: var(--text3);
    cursor: pointer;
    flex-shrink: 0;
    font-family: var(--mono);
}

.jump-btn:hover {
    border-color: var(--teal);
    color: var(--teal);
    background: color-mix(in srgb, var(--teal) 8%, transparent);
}
</style>
