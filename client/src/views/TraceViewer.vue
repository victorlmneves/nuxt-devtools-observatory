<script setup lang="ts">
import { computed, ref } from 'vue'
import { useObservatoryData } from '@observatory-client/stores/observatory'
import Flamegraph from '@observatory-client/components/Flamegraph.vue'
import WaterfallView from '@observatory-client/components/WaterfallView.vue'
import SpanInspector from '@observatory-client/components/SpanInspector.vue'
import TraceFilter from '@observatory-client/components/TraceFilter.vue'
import { useTraceFilter } from '@observatory-client/composables/useTraceFilter'
import { exportJson, importJson } from '@observatory-client/composables/useExportImport'
import type { ObservatoryExportFile } from '@observatory-client/composables/useExportImport'
import type { TraceEntry, TraceSpan } from '@observatory/types/snapshot'

const { traces, connected } = useObservatoryData()

const importedTraces = ref<TraceEntry[]>([])
const isImportMode = computed(() => importedTraces.value.length > 0)

const selectedTraceId = ref<string | null>(null)
const selectedSpan = ref<TraceSpan | undefined>(undefined)
const viewMode = ref<'overview' | 'flamegraph' | 'waterfall'>('overview')
const showFilters = ref(false)

const {
    searchQuery,
    selectedSpanTypes,
    minDuration,
    maxDuration,
    routeFilter,
    filterTraces: applyFilters,
    clearFilters,
    hasActiveFilters,
} = useTraceFilter()

const sortedTraces = computed(() => {
    const source = isImportMode.value ? importedTraces.value : traces.value
    return [...source].sort((a, b) => b.startTime - a.startTime)
})

const filteredTraces = computed(() => {
    return applyFilters(sortedTraces.value)
})

const traceCountLabel = computed(() => {
    const suffix = isImportMode.value ? ' (imported)' : ''

    if (!hasActiveFilters.value) {
        return `${sortedTraces.value.length} traces${suffix}`
    }

    return `Showing ${filteredTraces.value.length} of ${sortedTraces.value.length} traces${suffix}`
})

const selectedTrace = computed(() => {
    if (!selectedTraceId.value) {
        return filteredTraces.value[0]
    }

    return filteredTraces.value.find((t) => t.id === selectedTraceId.value)
})

function elapsedFromSpans(trace: TraceEntry): number | undefined {
    if (!trace.spans.length) {
        return undefined
    }

    let max = 0

    for (const span of trace.spans) {
        const end = span.endTime ?? span.startTime + (span.durationMs ?? 0)
        const offset = end - trace.startTime

        if (offset > max) {
            max = offset
        }
    }

    return max > 0 ? max : undefined
}

function formatDuration(durationMs?: number, trace?: TraceEntry): string {
    if (durationMs !== undefined) {
        return `${Math.round(durationMs * 10) / 10}ms`
    }

    if (trace) {
        const elapsed = elapsedFromSpans(trace)

        if (elapsed !== undefined) {
            return `~${Math.round(elapsed * 10) / 10}ms`
        }
    }

    return 'active'
}

function asString(val: unknown): string {
    return typeof val === 'string' ? val : ''
}

function getSpanDisplayName(span: TraceSpan): string {
    const m = span.metadata as Record<string, unknown> | undefined

    if (!m) {
        return span.name
    }

    const componentName = asString(m.componentName)
    const lifecycle = asString(m.lifecycle)
    const uid = m.uid !== undefined ? String(m.uid) : ''
    const method = asString(m.method)
    const url = asString(m.url)
    const route = asString(m.route) || asString(m.path)

    if (componentName && lifecycle) {
        return uid ? `${componentName}.${lifecycle} #${uid}` : `${componentName}.${lifecycle}`
    }

    if (componentName) {
        return uid ? `${componentName} #${uid}` : componentName
    }

    if (method && url) {
        return `${method} ${url}`
    }

    if (url) {
        return url
    }

    if (route) {
        return `${span.name} (${route})`
    }

    return span.name
}

function selectTrace(trace: TraceEntry) {
    selectedTraceId.value = trace.id
    selectedSpan.value = undefined
}

function handleClearFilters() {
    clearFilters()
    selectedSpan.value = undefined
}

function handleSpanTypesUpdate(value: Set<string>) {
    selectedSpanTypes.value = value
}

function handleExport() {
    exportJson(`observatory-traces-${Date.now()}.json`, {
        type: 'observatory-traces',
        version: '1',
        exportedAt: Date.now(),
        count: traces.value.length,
        data: traces.value,
    })
}

async function handleImport() {
    let parsed: unknown

    try {
        parsed = await importJson()
    }
    catch (err) {
        if (err instanceof Error && err.message !== 'cancelled') {
            alert(`Import failed: ${err.message}`)
        }
        return
    }

    const file = parsed as ObservatoryExportFile<TraceEntry>

    if (
        file?.type !== 'observatory-traces'
        || file?.version !== '1'
        || !Array.isArray(file?.data)
        || (file.data.length > 0 && (!file.data[0]?.id || !file.data[0]?.name || !Array.isArray(file.data[0]?.spans)))
    ) {
        alert('Invalid observatory traces file.')
        return
    }

    importedTraces.value = file.data
    selectedTraceId.value = null
    selectedSpan.value = undefined
}

function handleBackToLive() {
    importedTraces.value = []
    selectedTraceId.value = null
    selectedSpan.value = undefined
}
</script>

<template>
    <div class="trace-viewer tracker-view">
        <!-- Header -->
        <div class="trace-viewer__header tracker-toolbar">
            <div class="trace-viewer__title">Trace Viewer</div>
            <div class="trace-viewer__header-actions">
                <div class="trace-viewer__count muted text-sm">{{ traceCountLabel }}</div>
                <button
                    v-if="isImportMode"
                    class="trace-viewer__import-mode-btn"
                    title="Return to live data"
                    @click="handleBackToLive"
                >
                    ← live
                </button>
                <button
                    class="trace-viewer__action-btn"
                    title="Export traces as JSON"
                    :disabled="traces.length === 0 && !isImportMode"
                    @click="handleExport"
                >
                    ↓ export
                </button>
                <button
                    class="trace-viewer__action-btn"
                    title="Import traces from JSON file"
                    @click="handleImport"
                >
                    ↑ import
                </button>
                <button
                    :class="{ 'trace-viewer__filter-btn--active': showFilters }"
                    class="trace-viewer__filter-btn"
                    title="Toggle filters"
                    @click="showFilters = !showFilters"
                >
                    🔍
                </button>
            </div>
        </div>

        <!-- Filters panel -->
        <TraceFilter
            v-if="showFilters"
            :traces="sortedTraces"
            :search-query="searchQuery"
            :selected-span-types="selectedSpanTypes"
            :min-duration="minDuration"
            :max-duration="maxDuration"
            :route-filter="routeFilter"
            :has-active-filters="hasActiveFilters"
            @update:search="searchQuery = $event"
            @update:types="handleSpanTypesUpdate"
            @update:min-duration="minDuration = $event"
            @update:max-duration="maxDuration = $event"
            @update:route="routeFilter = $event"
            @clear-filters="handleClearFilters"
        />

        <!-- Main content -->
        <div class="trace-viewer__container">
            <!-- Trace list / Preview -->
            <div class="trace-viewer__list">
                <div class="trace-viewer__list-header">
                    <span class="trace-viewer__list-title">Traces</span>
                </div>
                <div class="trace-viewer__table-wrap tracker-table-wrap">
                    <table class="data-table">
                        <thead>
                            <tr>
                                <th>Trace Name</th>
                                <th>Duration</th>
                                <th>Spans</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr
                                v-for="trace in filteredTraces"
                                :key="trace.id"
                                :class="{ 'trace-viewer__trace-row--selected': selectedTrace?.id === trace.id }"
                                class="trace-viewer__trace-row"
                                @click="selectTrace(trace)"
                            >
                                <td class="mono">{{ trace.name }}</td>
                                <td class="mono">{{ formatDuration(trace.durationMs, trace) }}</td>
                                <td class="mono">{{ trace.spans.length }}</td>
                            </tr>
                            <tr v-if="!filteredTraces.length">
                                <td colspan="3" class="tracker-empty-cell">
                                    {{
                                        sortedTraces.length === 0
                                            ? connected
                                                ? 'No traces recorded yet.'
                                                : 'Waiting for connection to the Nuxt app…'
                                            : 'No traces match applied filters.'
                                    }}
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>

            <!-- Visualization area + Inspector -->
            <div v-if="selectedTrace" class="trace-viewer__detail">
                <div class="trace-viewer__detail-content">
                    <!-- View mode tabs -->
                    <div class="trace-viewer__tabs">
                        <button
                            :class="{ 'trace-viewer__tab--active': viewMode === 'overview' }"
                            class="trace-viewer__tab"
                            @click="viewMode = 'overview'"
                        >
                            Overview
                        </button>
                        <button
                            :class="{ 'trace-viewer__tab--active': viewMode === 'flamegraph' }"
                            class="trace-viewer__tab"
                            @click="viewMode = 'flamegraph'"
                        >
                            Flamegraph
                        </button>
                        <button
                            :class="{ 'trace-viewer__tab--active': viewMode === 'waterfall' }"
                            class="trace-viewer__tab"
                            @click="viewMode = 'waterfall'"
                        >
                            Waterfall
                        </button>
                    </div>

                    <!-- Visualization -->
                    <div class="trace-viewer__visualization">
                        <!-- Overview -->
                        <div v-if="viewMode === 'overview'" class="trace-viewer__overview">
                            <div class="trace-viewer__overview-header">
                                <div>
                                    <div class="trace-viewer__overview-label">Trace</div>
                                    <div class="trace-viewer__overview-value">{{ selectedTrace.name }}</div>
                                </div>
                                <div>
                                    <div class="trace-viewer__overview-label">Duration</div>
                                    <div class="trace-viewer__overview-value">
                                        {{ formatDuration(selectedTrace.durationMs, selectedTrace) }}
                                    </div>
                                </div>
                                <div>
                                    <div class="trace-viewer__overview-label">Spans</div>
                                    <div class="trace-viewer__overview-value">{{ selectedTrace.spans.length }}</div>
                                </div>
                                <div>
                                    <div class="trace-viewer__overview-label">Status</div>
                                    <div class="trace-viewer__overview-value">{{ selectedTrace.status }}</div>
                                </div>
                            </div>

                            <div class="trace-viewer__span-list">
                                <div
                                    v-for="span in selectedTrace.spans"
                                    :key="span.id"
                                    :class="{ 'trace-viewer__span-item--selected': selectedSpan?.id === span.id }"
                                    class="trace-viewer__span-item"
                                    @click="selectedSpan = span"
                                >
                                    <div class="trace-viewer__span-name">{{ getSpanDisplayName(span) }}</div>
                                    <div class="trace-viewer__span-meta">
                                        <span class="trace-viewer__span-type">{{ span.type }}</span>
                                        <span class="trace-viewer__span-duration">{{ formatDuration(span.durationMs) }}</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- Flamegraph -->
                        <div v-if="viewMode === 'flamegraph'" class="trace-viewer__flamegraph">
                            <Flamegraph :trace="selectedTrace" :selected-span-id="selectedSpan?.id" @select-span="selectedSpan = $event" />
                        </div>

                        <!-- Waterfall -->
                        <div v-if="viewMode === 'waterfall'" class="trace-viewer__waterfall">
                            <WaterfallView :trace="selectedTrace" />
                        </div>
                    </div>
                </div>

                <!-- Inspector sidebar -->
                <div class="trace-viewer__inspector">
                    <SpanInspector :trace="selectedTrace" :span="selectedSpan" @select-span="selectedSpan = $event" />
                </div>
            </div>
        </div>
    </div>
</template>

<style scoped>
.trace-viewer {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
}

.trace-viewer__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-shrink: 0;
}

.trace-viewer__title {
    font-size: 13px;
    font-weight: 600;
    color: var(--text);
}

.trace-viewer__header-actions {
    display: flex;
    align-items: center;
    gap: 12px;
}

.trace-viewer__count {
    font-family: var(--mono);
}

.trace-viewer__filter-btn {
    padding: 4px 8px;
    background: none;
    border: 1px solid transparent;
    color: var(--text-secondary);
    cursor: pointer;
    font-size: 14px;
    transition: all 0.2s;
    border-radius: 3px;
}

.trace-viewer__filter-btn:hover {
    background: var(--bg-secondary);
    border-color: var(--border);
}

.trace-viewer__filter-btn--active {
    background: var(--accent-bg);
    border-color: var(--accent);
    color: var(--accent);
}

.trace-viewer__action-btn {
    padding: 3px 8px;
    background: none;
    border: 1px solid var(--border);
    color: var(--text-secondary);
    cursor: pointer;
    font-size: 11px;
    border-radius: 3px;
    transition: all 0.12s;
    font-family: var(--mono);
}

.trace-viewer__action-btn:hover:not(:disabled) {
    background: var(--bg-secondary);
    color: var(--text);
}

.trace-viewer__action-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
}

.trace-viewer__import-mode-btn {
    padding: 3px 8px;
    background: var(--accent-bg);
    border: 1px solid var(--accent);
    color: var(--accent);
    cursor: pointer;
    font-size: 11px;
    border-radius: 3px;
    transition: all 0.12s;
    font-family: var(--mono);
}

.trace-viewer__import-mode-btn:hover {
    opacity: 0.8;
}

.trace-viewer__container {
    display: flex;
    flex: 1;
    min-height: 0;
    gap: 1px;
    background: var(--border);
}

.trace-viewer__list {
    display: flex;
    flex-direction: column;
    width: 280px;
    min-width: 280px;
    background: var(--bg);
    border-right: 1px solid var(--border);
    overflow: hidden;
}

.trace-viewer__list-header {
    padding: 8px 12px;
    font-size: 12px;
    font-weight: 600;
    color: var(--text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
}

.trace-viewer__table-wrap {
    flex: 1;
    overflow: auto;
}

.trace-viewer__trace-row {
    cursor: pointer;
    transition: background 0.2s;
}

.trace-viewer__trace-row:hover {
    background: var(--bg2, var(--bg));
}

.trace-viewer__trace-row--selected {
    background: var(--bg2, var(--bg));
    border-left: 2px solid var(--accent);
}

.trace-viewer__detail {
    flex: 1;
    display: flex;
    min-width: 0;
    background: var(--bg);
    overflow: hidden;
}

.trace-viewer__detail-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-width: 0;
    overflow: hidden;
}

.trace-viewer__tabs {
    display: flex;
    gap: 0;
    border-bottom: 0.5px solid var(--border);
    background: var(--bg3);
    flex-shrink: 0;
    padding: 8px 4px 0;
}

.trace-viewer__tab {
    padding: 6px 12px 8px;
    background: transparent;
    border: none;
    border-bottom: 2px solid transparent;
    margin-bottom: -1px;
    color: var(--text3);
    cursor: pointer;
    font-size: 12px;
    font-weight: 500;
    transition:
        color 0.12s,
        border-color 0.12s;
    border-radius: 0;
}

.trace-viewer__tab:hover {
    color: var(--text);
    background: transparent;
}

.trace-viewer__tab--active {
    color: var(--purple);
    border-bottom-color: var(--purple);
    background: transparent;
}

.trace-viewer__visualization {
    flex: 1;
    overflow: hidden;
    min-height: 0;
}

.trace-viewer__overview {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
}

.trace-viewer__overview-header {
    display: flex;
    gap: 24px;
    padding: 16px;
    border-bottom: 1px solid var(--border);
    background: var(--bg2, var(--bg));
    flex-shrink: 0;
}

.trace-viewer__overview-label {
    font-size: 10px;
    font-weight: 600;
    color: var(--text2, var(--text));
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: 4px;
}

.trace-viewer__overview-value {
    font-size: 13px;
    font-weight: 600;
    color: var(--text);
    font-family: var(--mono);
}

.trace-viewer__span-list {
    flex: 1;
    overflow: auto;
    display: flex;
    flex-direction: column;
}

.trace-viewer__span-item {
    padding: 8px 16px;
    border-bottom: 1px solid var(--border);
    cursor: pointer;
    transition: background 0.2s;
}

.trace-viewer__span-item:hover {
    background: var(--bg2, var(--bg));
}

.trace-viewer__span-item--selected {
    background: var(--bg2, var(--bg));
    border-left: 2px solid var(--accent);
}

.trace-viewer__span-name {
    font-size: 12px;
    color: var(--text);
    font-weight: 500;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.trace-viewer__span-meta {
    display: flex;
    gap: 8px;
    margin-top: 4px;
    font-size: 10px;
    color: var(--text2, var(--text));
}

.trace-viewer__span-type {
    padding: 2px 6px;
    background: var(--bg2, var(--bg));
    border: 1px solid var(--border);
    border-radius: 3px;
}

.trace-viewer__span-duration {
    font-family: var(--mono);
}

.trace-viewer__flamegraph {
    height: 100%;
    overflow: hidden;
}

.trace-viewer__waterfall {
    height: 100%;
    overflow: hidden;
}

.trace-viewer__inspector {
    width: 300px;
    min-width: 300px;
    border-left: 1px solid var(--border);
    background: var(--bg);
    overflow: auto;
}

@media (max-width: 1024px) {
    .trace-viewer__container {
        flex-direction: column;
        gap: 0;
    }

    .trace-viewer__list {
        width: 100%;
        min-width: auto;
        height: 200px;
        min-height: 200px;
        border-right: none;
        border-bottom: 1px solid var(--border);
    }

    .trace-viewer__inspector {
        width: 100%;
        min-width: auto;
        height: 200px;
        min-height: 200px;
        border-left: none;
        border-top: 1px solid var(--border);
    }
}
</style>
