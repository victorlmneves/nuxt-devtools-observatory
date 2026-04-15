<script setup lang="ts">
import { ref, computed } from 'vue'
import { useVirtualizer } from '@tanstack/vue-virtual'
import { useVirtualizationConfig } from '@observatory-client/composables/useVirtualizationConfig'
import { useVirtualizationFlags } from '@observatory-client/composables/useVirtualizationFlags'
import {
    useObservatoryData,
    setComposableMode,
    editComposableValue,
    openInEditor as openInEditorFromStore,
} from '@observatory-client/stores/observatory'
import { matchesComposableEntryQuery } from '@observatory-client/composables/composable-search'
import type { ComposableEntry as RuntimeComposableEntry } from '@observatory/types/snapshot'

const { composables: rawEntries, connected, features, clearComposables } = useObservatoryData()

const composableMode = computed<'route' | 'session'>(() => (features.value?.composableNavigationMode === 'session' ? 'session' : 'route'))

function toggleComposableMode() {
    const nextMode = composableMode.value === 'route' ? 'session' : 'route'
    setComposableMode(nextMode)
}

function clearSession() {
    clearComposables()
}

// ── Flat per-instance display ─────────────────────────────────────────────
// Each entry is shown individually so you can see exactly which component
// instance uses which state. No grouping — instanceA and instanceB of the
// same composable in different components are two separate rows.

function formatVal(v: unknown): string {
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
    openInEditorFromStore(file)
}

const filter = ref('all')
const search = ref('')
const expanded = ref<string | null>(null)
const listScrollRef = ref<HTMLElement | null>(null)

const { effective: virtualizationFlags } = useVirtualizationFlags()
const { preset: virtualizationPreset } = useVirtualizationConfig({ rowHeight: 88, overscan: 8 })

const entries = computed<RuntimeComposableEntry[]>(() => rawEntries.value)

const counts = computed(() => ({
    mounted: entries.value.filter((e) => e.status === 'mounted').length,
    leaks: entries.value.filter((e) => e.leak).length,
}))

const filtered = computed(() => {
    // Newest entries are appended by the runtime registry, so reverse for recency-first UI.
    const reversed = [...entries.value].reverse()

    // Apply all filters first
    const filtered = reversed.filter((entry) => {
        if (filter.value === 'leak' && !entry.leak) {
            return false
        }

        if (filter.value === 'mounted' && entry.status !== 'mounted') {
            return false
        }

        if (filter.value === 'unmounted' && entry.status !== 'unmounted') {
            return false
        }

        if (search.value.trim() && !matchesComposableEntryQuery(entry, search.value)) {
            return false
        }

        return true
    })

    // Partition into layout-level (pinned to top) and regular entries
    const layoutEntries: RuntimeComposableEntry[] = []
    const regularEntries: RuntimeComposableEntry[] = []

    for (const entry of filtered) {
        if (entry.isLayoutComposable) {
            layoutEntries.push(entry)
        } else {
            regularEntries.push(entry)
        }
    }

    // Combine: layout entries first (already sorted by recency), then regular entries
    return [...layoutEntries, ...regularEntries]
})

const virtualizedCardsEnabled = computed(() => virtualizationFlags.value.composables && expanded.value === null)

const listVirtualizerOptions = computed(() => ({
    count: filtered.value.length,
    getScrollElement: () => listScrollRef.value,
    estimateSize: () => virtualizationPreset.value.rowHeight,
    overscan: virtualizationPreset.value.overscan,
}))

const listVirtualizer = useVirtualizer(listVirtualizerOptions)

const listVirtualItems = computed(() => {
    if (!virtualizedCardsEnabled.value) {
        return []
    }

    return listVirtualizer.value.getVirtualItems()
})

const topListPadding = computed(() => {
    if (!virtualizedCardsEnabled.value || listVirtualItems.value.length === 0) {
        return 0
    }

    return listVirtualItems.value[0].start
})

const bottomListPadding = computed(() => {
    if (!virtualizedCardsEnabled.value || listVirtualItems.value.length === 0) {
        return 0
    }

    const total = listVirtualizer.value.getTotalSize()
    const last = listVirtualItems.value[listVirtualItems.value.length - 1]

    return Math.max(0, total - last.end)
})

const visibleEntries = computed(() => {
    if (!virtualizedCardsEnabled.value) {
        return filtered.value
    }

    return listVirtualItems.value
        .map((item) => filtered.value[item.index])
        .filter((entry): entry is RuntimeComposableEntry => Boolean(entry))
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
    if (v === null || v === undefined || typeof v !== 'object') {
        return false
    }

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

    if (next.has(key)) {
        next.delete(key)
    } else {
        next.add(key)
    }

    expandedRefs.value = next
}

// ── Reverse lookup ────────────────────────────────────────────────────────
// Clicking a ref key prefers identity-based lookup for shared/global refs.
// For non-shared keys, fallback to legacy key-name lookup.

interface LookupTarget {
    key: string
    composableName: string
    identityGroup?: string
}

const lookupTarget = ref<LookupTarget | null>(null)

const lookupResults = computed(() => {
    if (!lookupTarget.value) {
        return []
    }

    const target = lookupTarget.value

    if (target.identityGroup) {
        return entries.value.filter(
            (entry) =>
                entry.name === target.composableName &&
                entry.sharedKeyGroups?.[target.key] === target.identityGroup &&
                target.key in entry.refs
        )
    }

    return entries.value.filter((entry) => target.key in entry.refs)
})

const lookupTitle = computed(() => {
    if (!lookupTarget.value) {
        return ''
    }

    if (lookupTarget.value.identityGroup) {
        return `${lookupTarget.value.key} (shared identity)`
    }

    return lookupTarget.value.key
})

function openLookup(entry: RuntimeComposableEntry, key: string) {
    const identityGroup = entry.sharedKeyGroups?.[key]
    const next: LookupTarget = {
        key,
        composableName: entry.name,
        identityGroup,
    }

    if (
        lookupTarget.value?.key === next.key &&
        lookupTarget.value?.composableName === next.composableName &&
        lookupTarget.value?.identityGroup === next.identityGroup
    ) {
        lookupTarget.value = null

        return
    }

    lookupTarget.value = next
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

    editComposableValue(editTarget.value.id, editTarget.value.key, parsed)

    editTarget.value = null
}
</script>

<template>
    <div class="composable-tracker tracker-view">
        <div class="composable-tracker__stats tracker-stats-row">
            <div class="stat-card">
                <div class="stat-label">total</div>
                <div class="stat-val">{{ entries.length }}</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">mounted</div>
                <div class="stat-val stat-val--active">{{ counts.mounted }}</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">leaks</div>
                <div class="stat-val stat-val--error">{{ counts.leaks }}</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">instances</div>
                <div class="stat-val">{{ entries.length }}</div>
            </div>
        </div>

        <div class="composable-tracker__toolbar tracker-toolbar">
            <button :class="{ active: filter === 'all' }" @click="filter = 'all'">all</button>
            <button :class="{ active: filter === 'mounted' }" @click="filter = 'mounted'">mounted</button>
            <button :class="{ 'danger-active': filter === 'leak' }" @click="filter = 'leak'">leaks only</button>
            <button :class="{ active: filter === 'unmounted' }" @click="filter = 'unmounted'">unmounted</button>
            <button
                class="composable-tracker__mode-btn"
                :title="`switch to ${composableMode === 'route' ? 'session' : 'route'} mode`"
                @click="toggleComposableMode"
            >
                mode: {{ composableMode }}
            </button>
            <span class="tracker-toolbar__spacer"></span>
            <input v-model="search" class="composable-tracker__search" type="search" placeholder="search name, file, or ref…" />
            <button
                v-if="composableMode === 'session'"
                class="composable-tracker__clear-btn"
                title="Clear session history"
                @click="clearSession"
            >
                clear session
            </button>
        </div>

        <div ref="listScrollRef" class="composable-tracker__list">
            <div
                v-if="virtualizedCardsEnabled && topListPadding > 0"
                class="composable-tracker__virtual-spacer"
                :style="{ height: `${topListPadding}px` }"
                aria-hidden="true"
            />
            <div
                v-for="entry in visibleEntries"
                :key="entry.id"
                class="composable-tracker__card"
                :class="{
                    'composable-tracker__card--leak': entry.leak,
                    'composable-tracker__card--expanded': expanded === entry.id,
                }"
                @click="expanded = expanded === entry.id ? null : entry.id"
            >
                <div class="composable-tracker__card-header">
                    <div class="composable-tracker__identity">
                        <span class="composable-tracker__name mono">{{ entry.name }}</span>
                        <span class="composable-tracker__file muted mono">{{ basename(entry.componentFile) }}</span>
                    </div>
                    <div class="composable-tracker__meta">
                        <span v-if="entry.watcherCount > 0 && !entry.leak" class="badge badge-warn">{{ entry.watcherCount }}w</span>
                        <span v-if="entry.intervalCount > 0 && !entry.leak" class="badge badge-warn">{{ entry.intervalCount }}t</span>
                        <span v-if="entry.leak" class="badge badge-err">leak</span>
                        <span v-else-if="entry.status === 'mounted'" class="badge badge-ok">mounted</span>
                        <span v-else class="badge badge-gray">unmounted</span>
                    </div>
                </div>

                <!-- Inline ref preview — shows up to 3 refs without expanding -->
                <div v-if="Object.keys(entry.refs).length" class="composable-tracker__refs-preview">
                    <span
                        v-for="[k, v] in Object.entries(entry.refs).slice(0, 3)"
                        :key="k"
                        class="composable-tracker__ref-chip"
                        :class="{
                            'composable-tracker__ref-chip--reactive': v.type === 'reactive',
                            'composable-tracker__ref-chip--computed': v.type === 'computed',
                            'composable-tracker__ref-chip--shared': entry.sharedKeys?.includes(k),
                        }"
                        :title="entry.sharedKeys?.includes(k) ? 'shared global state' : ''"
                    >
                        <span class="composable-tracker__ref-chip-key">{{ k }}</span>
                        <span class="composable-tracker__ref-chip-val">{{ formatVal(v.value) }}</span>
                        <span v-if="entry.sharedKeys?.includes(k)" class="composable-tracker__ref-chip-shared-dot" title="global"></span>
                    </span>
                    <span v-if="Object.keys(entry.refs).length > 3" class="muted text-sm">
                        +{{ Object.keys(entry.refs).length - 3 }} more
                    </span>
                </div>

                <div v-if="expanded === entry.id" class="composable-tracker__detail" @click.stop>
                    <div v-if="entry.leak" class="composable-tracker__leak-banner">{{ entry.leakReason }}</div>

                    <!-- Global state warning -->
                    <div v-if="entry.sharedKeys?.length" class="composable-tracker__global-banner">
                        <span class="composable-tracker__global-dot"></span>
                        <span>
                            <strong>global state</strong>
                            — {{ entry.sharedKeys.join(', ') }}
                            {{ entry.sharedKeys.length === 1 ? 'is' : 'are' }}
                            shared across all instances of {{ entry.name }}
                        </span>
                    </div>

                    <div class="composable-tracker__section-label tracker-section-label">reactive state</div>
                    <div v-if="!Object.keys(entry.refs).length" class="composable-tracker__compact-muted muted text-sm">
                        no tracked state returned
                    </div>
                    <div v-for="[k, v] in Object.entries(entry.refs)" :key="k" class="composable-tracker__ref-row">
                        <span
                            class="composable-tracker__ref-key composable-tracker__ref-key--clickable mono text-sm"
                            :title="
                                entry.sharedKeyGroups?.[k]
                                    ? `click to see instances sharing this exact '${k}' state`
                                    : `click to see all instances exposing '${k}'`
                            "
                            @click.stop="openLookup(entry, k)"
                        >
                            {{ k }}
                        </span>
                        <span
                            class="composable-tracker__ref-val mono text-sm"
                            :class="{
                                'composable-tracker__ref-val--full': isLongValue(v.value) && isRefExpanded(entry.id, k),
                                'composable-tracker__ref-val--collapsed': isLongValue(v.value) && !isRefExpanded(entry.id, k),
                            }"
                        >
                            {{ isLongValue(v.value) && !isRefExpanded(entry.id, k) ? formatVal(v.value) : formatValFull(v.value) }}
                        </span>
                        <div class="composable-tracker__ref-row-actions">
                            <button
                                v-if="isLongValue(v.value)"
                                class="composable-tracker__expand-btn"
                                :title="isRefExpanded(entry.id, k) ? 'Collapse' : 'Expand'"
                                @click.stop="toggleRefExpand(entry.id, k)"
                            >
                                {{ isRefExpanded(entry.id, k) ? '▲' : '▼' }}
                            </button>
                            <span class="badge text-xs" :class="typeBadgeClass(v.type)">{{ v.type }}</span>
                            <span v-if="entry.sharedKeys?.includes(k)" class="badge badge-amber text-xs">global</span>
                            <button
                                v-if="v.type === 'ref'"
                                class="composable-tracker__edit-btn"
                                title="Edit value"
                                @click.stop="openEdit(entry.id, k, v.value)"
                            >
                                edit
                            </button>
                        </div>
                    </div>

                    <template v-if="entry.history && entry.history.length">
                        <div class="composable-tracker__section-label composable-tracker__section-label--spaced tracker-section-label">
                            change history
                            <span class="composable-tracker__section-label-meta muted">({{ entry.history.length }} events)</span>
                        </div>
                        <div class="composable-tracker__history-list">
                            <div
                                v-for="(evt, idx) in [...entry.history].reverse().slice(0, 20)"
                                :key="idx"
                                class="composable-tracker__history-row"
                            >
                                <span class="composable-tracker__history-time mono muted">+{{ (evt.t / 1000).toFixed(2) }}s</span>
                                <span class="composable-tracker__history-key mono">{{ evt.key }}</span>
                                <span class="composable-tracker__history-val mono">{{ formatVal(evt.value) }}</span>
                            </div>
                            <div v-if="entry.history.length > 20" class="composable-tracker__compact-muted muted text-sm">
                                … {{ entry.history.length - 20 }} earlier events
                            </div>
                        </div>
                    </template>

                    <div class="composable-tracker__section-label composable-tracker__section-label--spaced tracker-section-label">
                        lifecycle
                    </div>
                    <div v-for="row in lifecycleRows(entry)" :key="row.label" class="composable-tracker__lifecycle-row">
                        <span
                            class="composable-tracker__lifecycle-dot"
                            :class="row.ok ? 'composable-tracker__lifecycle-dot--ok' : 'composable-tracker__lifecycle-dot--error'"
                        ></span>
                        <span class="composable-tracker__context-label muted text-sm">{{ row.label }}</span>
                        <span
                            class="composable-tracker__lifecycle-status text-sm"
                            :class="row.ok ? 'composable-tracker__lifecycle-status--ok' : 'composable-tracker__lifecycle-status--error'"
                        >
                            {{ row.status }}
                        </span>
                    </div>

                    <div class="composable-tracker__section-label composable-tracker__section-label--spaced tracker-section-label">
                        context
                    </div>
                    <div class="composable-tracker__lifecycle-row">
                        <span class="composable-tracker__context-label muted text-sm">component</span>
                        <span class="composable-tracker__context-value mono text-sm">{{ basename(entry.componentFile) }}</span>
                    </div>
                    <div class="composable-tracker__lifecycle-row">
                        <span class="composable-tracker__context-label muted text-sm">uid</span>
                        <span class="composable-tracker__context-value composable-tracker__context-value--muted mono text-sm muted">
                            {{ entry.componentUid }}
                        </span>
                    </div>
                    <div class="composable-tracker__lifecycle-row">
                        <span class="composable-tracker__context-label muted text-sm">defined in</span>
                        <span
                            class="composable-tracker__context-value composable-tracker__context-value--row composable-tracker__context-value--muted mono text-sm muted"
                        >
                            {{ entry.file }}:{{ entry.line }}
                            <button class="composable-tracker__jump-btn" title="Open in editor" @click.stop="openInEditor(entry.file)">
                                open ↗
                            </button>
                        </span>
                    </div>
                    <div class="composable-tracker__lifecycle-row">
                        <span class="composable-tracker__context-label muted text-sm">route</span>
                        <span class="composable-tracker__context-value composable-tracker__context-value--muted mono text-sm muted">
                            {{ entry.route }}
                        </span>
                    </div>
                    <div class="composable-tracker__lifecycle-row">
                        <span class="composable-tracker__context-label muted text-sm">watchers</span>
                        <span class="composable-tracker__context-value mono text-sm">{{ entry.watcherCount }}</span>
                    </div>
                    <div class="composable-tracker__lifecycle-row">
                        <span class="composable-tracker__context-label muted text-sm">intervals</span>
                        <span class="composable-tracker__context-value mono text-sm">{{ entry.intervalCount }}</span>
                    </div>
                </div>
            </div>

            <div
                v-if="virtualizedCardsEnabled && bottomListPadding > 0"
                class="composable-tracker__virtual-spacer"
                :style="{ height: `${bottomListPadding}px` }"
                aria-hidden="true"
            />

            <div v-if="!filtered.length" class="composable-tracker__empty muted text-sm">
                {{ connected ? 'No composables recorded yet.' : 'Waiting for connection to the Nuxt app…' }}
            </div>
        </div>

        <!-- ── Reverse lookup panel ──────────────────────────────────────── -->
        <Transition name="slide">
            <div v-if="lookupTarget" class="composable-tracker__lookup-panel">
                <div class="composable-tracker__lookup-header">
                    <span class="mono text-sm">{{ lookupTitle }}</span>
                    <span class="muted text-sm">— {{ lookupResults.length }} instance{{ lookupResults.length !== 1 ? 's' : '' }}</span>
                    <button class="composable-tracker__clear-btn composable-tracker__lookup-close" @click="lookupTarget = null">✕</button>
                </div>
                <div v-if="!lookupResults.length" class="composable-tracker__lookup-empty muted text-sm">
                    No instances matched this lookup.
                </div>
                <div v-for="r in lookupResults" :key="r.id" class="composable-tracker__lookup-row">
                    <span class="mono text-sm">{{ r.name }}</span>
                    <span class="muted text-sm">{{ basename(r.componentFile) }}</span>
                    <span class="composable-tracker__lookup-route muted text-sm">{{ r.route }}</span>
                </div>
            </div>
        </Transition>

        <!-- ── Edit value dialog ─────────────────────────────────────────── -->
        <Transition name="fade">
            <div v-if="editTarget" class="composable-tracker__edit-overlay" @click.self="editTarget = null">
                <div class="composable-tracker__edit-dialog">
                    <div class="composable-tracker__edit-dialog-header">
                        edit
                        <span class="mono">{{ editTarget.key }}</span>
                        <button class="composable-tracker__clear-btn composable-tracker__dialog-close" @click="editTarget = null">✕</button>
                    </div>
                    <p class="composable-tracker__edit-help muted text-sm">
                        Value applied immediately to the live ref. Only
                        <span class="mono">ref</span>
                        values are writable.
                    </p>
                    <textarea v-model="editTarget.rawValue" class="composable-tracker__edit-textarea" rows="6" spellcheck="false" />
                    <div v-if="editError" class="composable-tracker__edit-error text-sm">{{ editError }}</div>
                    <div class="composable-tracker__edit-actions">
                        <button @click="applyEdit">apply</button>
                        <button class="composable-tracker__clear-btn" @click="editTarget = null">cancel</button>
                    </div>
                </div>
            </div>
        </Transition>
    </div>
</template>

<style scoped>
.composable-tracker__clear-btn {
    color: var(--text3);
    border-color: var(--border);
    flex-shrink: 0;
}

.composable-tracker__clear-btn:hover {
    color: var(--red);
    border-color: var(--red);
    background: transparent;
}

.composable-tracker__mode-btn {
    border-color: color-mix(in srgb, var(--blue) 40%, var(--border));
    color: var(--blue);
}

.composable-tracker__mode-btn:hover {
    border-color: var(--blue);
    background: color-mix(in srgb, var(--blue) 12%, transparent);
}

.composable-tracker__search {
    max-width: 220px;
}

.composable-tracker__list {
    flex: 1;
    overflow: auto;
    display: flex;
    flex-direction: column;
    gap: var(--tracker-space-2);
    min-height: 0;
}

.composable-tracker__virtual-spacer {
    width: 100%;
    flex-shrink: 0;
}

.composable-tracker__card {
    background: var(--bg3);
    border: var(--tracker-border-width) solid var(--border);
    border-radius: var(--radius-lg);
    overflow: hidden;
    cursor: pointer;
    flex-shrink: 0;
}

.composable-tracker__card:hover {
    border-color: var(--text3);
}

.composable-tracker__card--leak {
    border-left: 2px solid var(--red);
    border-radius: 0 var(--radius-lg) var(--radius-lg) 0;
}

.composable-tracker__card--expanded {
    border-color: var(--purple);
}

.composable-tracker__card-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--tracker-space-3) var(--tracker-space-4);
    gap: var(--tracker-space-3);
}

.composable-tracker__identity {
    display: flex;
    align-items: baseline;
    gap: var(--tracker-space-2);
    min-width: 0;
    flex: 1;
}

.composable-tracker__name {
    font-size: var(--tracker-font-size-md);
    font-weight: 500;
    color: var(--text);
    flex-shrink: 0;
}

.composable-tracker__file {
    font-size: var(--tracker-font-size-sm);
    color: var(--text3);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.composable-tracker__meta {
    display: flex;
    align-items: center;
    gap: var(--tracker-space-2);
    flex-shrink: 0;
}

.composable-tracker__refs-preview {
    display: flex;
    flex-wrap: wrap;
    gap: var(--tracker-space-1);
    padding: 0 var(--tracker-space-4) var(--tracker-space-3);
    align-items: center;
}

.composable-tracker__ref-chip {
    display: inline-flex;
    align-items: center;
    gap: var(--tracker-space-1);
    padding: 2px 7px;
    border-radius: 4px;
    background: var(--bg2);
    border: var(--tracker-border-width) solid var(--border);
    font-size: var(--tracker-font-size-sm);
    font-family: var(--mono);
    max-width: 220px;
    overflow: hidden;
}

.composable-tracker__ref-chip--reactive {
    border-color: color-mix(in srgb, var(--purple) 40%, var(--border));
    background: color-mix(in srgb, var(--purple) 8%, var(--bg2));
}

.composable-tracker__ref-chip--computed {
    border-color: color-mix(in srgb, var(--blue) 40%, var(--border));
    background: color-mix(in srgb, var(--blue) 8%, var(--bg2));
}

.composable-tracker__ref-chip-key {
    color: var(--text2);
    flex-shrink: 0;
}

.composable-tracker__ref-chip-val {
    color: var(--teal);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.composable-tracker__detail {
    padding: var(--tracker-space-1) var(--tracker-space-4) var(--tracker-space-4);
    border-top: var(--tracker-border-width) solid var(--border);
    display: flex;
    flex-direction: column;
    gap: var(--tracker-space-1);
}

.composable-tracker__leak-banner {
    background: color-mix(in srgb, var(--red) 12%, transparent);
    border: var(--tracker-border-width) solid color-mix(in srgb, var(--red) 40%, var(--border));
    border-radius: var(--radius);
    padding: 6px 10px;
    font-size: var(--tracker-font-size-sm);
    color: var(--red);
    margin-bottom: var(--tracker-space-2);
    font-family: var(--mono);
}

.composable-tracker__section-label {
    margin-top: var(--tracker-space-2);
    margin-bottom: var(--tracker-space-1);
}

.composable-tracker__section-label--spaced {
    margin-top: var(--tracker-space-4);
}

.composable-tracker__section-label-meta {
    font-weight: 400;
    text-transform: none;
    letter-spacing: 0;
}

.composable-tracker__ref-row {
    display: flex;
    align-items: flex-start;
    gap: var(--tracker-space-3);
    padding: 3px 0;
}

.composable-tracker__ref-key {
    min-width: 90px;
    color: var(--text2);
    flex-shrink: 0;
}

.composable-tracker__ref-val {
    flex: 1;
    color: var(--teal);
    min-width: 0;
}

.composable-tracker__ref-val--collapsed {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.composable-tracker__ref-val--full {
    white-space: pre-wrap;
    word-break: break-all;
    line-height: 1.5;
}

.composable-tracker__ref-row-actions {
    display: flex;
    align-items: center;
    gap: var(--tracker-space-1);
    flex-shrink: 0;
}

.composable-tracker__expand-btn {
    font-size: var(--tracker-font-size-xs);
    padding: 1px 5px;
    border-radius: 4px;
    border: var(--tracker-border-width) solid var(--border);
    background: var(--bg2);
    color: var(--text3);
    cursor: pointer;
    line-height: 1.4;
    flex-shrink: 0;
}

.composable-tracker__expand-btn:hover {
    border-color: var(--text3);
    color: var(--text);
}

.composable-tracker__lifecycle-row {
    display: flex;
    align-items: center;
    gap: var(--tracker-space-3);
    padding: 2px 0;
}

.composable-tracker__lifecycle-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    flex-shrink: 0;
}

.composable-tracker__lifecycle-dot--ok {
    background: var(--teal);
}

.composable-tracker__lifecycle-dot--error {
    background: var(--red);
}

.composable-tracker__lifecycle-status--ok {
    color: var(--teal);
}

.composable-tracker__lifecycle-status--error {
    color: var(--red);
}

.composable-tracker__context-label {
    min-width: 120px;
}

.composable-tracker__context-value {
    min-width: 0;
}

.composable-tracker__context-value--row {
    display: flex;
    align-items: center;
    gap: var(--tracker-space-2);
    flex-wrap: wrap;
}

.composable-tracker__context-value--muted {
    color: var(--text3);
}

.composable-tracker__ref-chip--shared {
    border-color: color-mix(in srgb, var(--amber) 50%, var(--border));
    background: color-mix(in srgb, var(--amber) 10%, var(--bg2));
}

.composable-tracker__ref-chip-shared-dot {
    display: inline-block;
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: var(--amber);
    flex-shrink: 0;
    margin-left: 1px;
}

.composable-tracker__global-banner {
    display: flex;
    align-items: flex-start;
    gap: var(--tracker-space-3);
    background: color-mix(in srgb, var(--amber) 10%, transparent);
    border: var(--tracker-border-width) solid color-mix(in srgb, var(--amber) 40%, var(--border));
    border-radius: var(--radius);
    padding: 7px 10px;
    font-size: var(--tracker-font-size-sm);
    color: var(--text2);
    margin-bottom: var(--tracker-space-2);
}

.composable-tracker__global-dot {
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

.composable-tracker__history-list {
    display: flex;
    flex-direction: column;
    gap: 1px;
    background: var(--bg2);
    border-radius: var(--radius);
    padding: 4px 8px;
    max-height: 180px;
    overflow-y: auto;
}

.composable-tracker__history-row {
    display: flex;
    align-items: center;
    gap: var(--tracker-space-3);
    padding: 2px 0;
    font-size: var(--tracker-font-size-sm);
    font-family: var(--mono);
    border-bottom: var(--tracker-border-width) solid var(--border);
}

.composable-tracker__history-row:last-child {
    border-bottom: none;
}

.composable-tracker__history-time {
    min-width: 52px;
    color: var(--text3);
    flex-shrink: 0;
}

.composable-tracker__history-key {
    min-width: 80px;
    color: var(--text2);
    flex-shrink: 0;
}

.composable-tracker__history-val {
    color: var(--amber);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex: 1;
}

.composable-tracker__ref-key--clickable {
    cursor: pointer;
    text-decoration: underline dotted var(--text3);
    text-underline-offset: 2px;
}

.composable-tracker__ref-key--clickable:hover {
    color: var(--purple);
    text-decoration-color: var(--purple);
}

.composable-tracker__edit-btn {
    font-size: var(--tracker-font-size-xs);
    padding: 1px 6px;
    border-radius: var(--radius);
    border: var(--tracker-border-width) solid var(--border);
    background: transparent;
    color: var(--text3);
    cursor: pointer;
    margin-left: auto;
    flex-shrink: 0;
    font-family: var(--mono);
}

.composable-tracker__edit-btn:hover {
    border-color: var(--purple);
    color: var(--purple);
    background: color-mix(in srgb, var(--purple) 8%, transparent);
}

.composable-tracker__empty {
    padding: 16px 0;
}

.composable-tracker__compact-muted {
    padding: 2px 0 6px;
}

.composable-tracker__lookup-panel {
    flex-shrink: 0;
    border: var(--tracker-border-width) solid var(--border);
    border-radius: var(--radius-lg);
    background: var(--bg3);
    overflow: hidden;
}

.composable-tracker__lookup-header {
    display: flex;
    align-items: center;
    gap: var(--tracker-space-2);
    padding: 7px 12px;
    border-bottom: var(--tracker-border-width) solid var(--border);
    background: var(--bg2);
}

.composable-tracker__lookup-close,
.composable-tracker__dialog-close,
.composable-tracker__lookup-route {
    margin-left: auto;
}

.composable-tracker__lookup-empty {
    padding: 6px 12px;
}

.composable-tracker__lookup-row {
    display: flex;
    align-items: center;
    gap: var(--tracker-space-3);
    padding: 5px 12px;
    border-bottom: var(--tracker-border-width) solid var(--border);
}

.composable-tracker__lookup-row:last-child {
    border-bottom: none;
}

.composable-tracker__edit-overlay {
    position: fixed;
    inset: 0;
    background: rgb(0 0 0 / 40%);
    z-index: 100;
    display: flex;
    align-items: center;
    justify-content: center;
}

.composable-tracker__edit-dialog {
    background: var(--bg1, var(--bg2));
    border: var(--tracker-border-width) solid var(--border);
    border-radius: var(--radius-lg);
    padding: 14px 16px;
    width: 380px;
    max-width: 92vw;
    display: flex;
    flex-direction: column;
    gap: 6px;
    box-shadow: 0 8px 32px rgb(0 0 0 / 30%);
}

.composable-tracker__edit-dialog-header {
    display: flex;
    align-items: center;
    gap: var(--tracker-space-2);
    font-size: var(--tracker-font-size-md);
    color: var(--text2);
    margin-bottom: 2px;
}

.composable-tracker__edit-help {
    padding: 4px 0 8px;
}

.composable-tracker__edit-textarea {
    width: 100%;
    font-family: var(--mono);
    font-size: var(--tracker-font-size-md);
    padding: 8px 10px;
    background: var(--bg2);
    border: var(--tracker-border-width) solid var(--border);
    border-radius: var(--radius);
    color: var(--text);
    resize: vertical;
    outline: none;
}

.composable-tracker__edit-textarea:focus {
    border-color: var(--purple);
}

.composable-tracker__edit-error {
    color: var(--red);
    font-family: var(--mono);
}

.composable-tracker__edit-actions {
    display: flex;
    gap: var(--tracker-space-2);
    padding-top: 4px;
}

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

.composable-tracker__jump-btn {
    font-size: var(--tracker-font-size-xs);
    padding: 1px 6px;
    border: var(--tracker-border-width) solid var(--border);
    border-radius: var(--radius);
    background: transparent;
    color: var(--text3);
    cursor: pointer;
    flex-shrink: 0;
    font-family: var(--mono);
}

.composable-tracker__jump-btn:hover {
    border-color: var(--teal);
    color: var(--teal);
    background: color-mix(in srgb, var(--teal) 8%, transparent);
}

@media (width <= 900px) {
    .composable-tracker__card-header,
    .composable-tracker__ref-row,
    .composable-tracker__lifecycle-row,
    .composable-tracker__lookup-row {
        flex-wrap: wrap;
    }

    .composable-tracker__identity,
    .composable-tracker__context-label,
    .composable-tracker__lookup-route {
        min-width: 100%;
        margin-left: 0;
    }
}
</style>
