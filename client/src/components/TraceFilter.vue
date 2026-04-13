<script setup lang="ts">
import { computed } from 'vue'
import type { TraceEntry } from '@observatory/types/snapshot'
import { useTraceFilter } from '@observatory-client/composables/useTraceFilter'

interface Props {
    traces: TraceEntry[]
    searchQuery: string
    selectedSpanTypes: Set<string>
    minDuration: number
    maxDuration: number
    routeFilter: string
    hasActiveFilters: boolean
}

const props = defineProps<Props>()

const emit = defineEmits<{
    'update:search': [value: string]
    'update:types': [value: Set<string>]
    'update:min-duration': [value: number]
    'update:max-duration': [value: number]
    'update:route': [value: string]
    'clear-filters': []
}>()

const { getSpanTypesFromTraces } = useTraceFilter()

const availableSpanTypes = computed(() => getSpanTypesFromTraces(props.traces))

const maxTraceDuration = computed(() => {
    let max = 0

    for (const trace of props.traces) {
        if (trace.durationMs && trace.durationMs > max) {
            max = trace.durationMs
        }
    }

    return Math.ceil(max / 10) * 10 || 1000
})

function handleSearchChange(value: string) {
    emit('update:search', value)
}

function getInputValue(event: Event): string {
    return (event.target as HTMLInputElement).value
}

function handleTypeToggle(type: string) {
    const nextTypes = new Set(props.selectedSpanTypes)

    if (nextTypes.has(type)) {
        nextTypes.delete(type)
    } else {
        nextTypes.add(type)
    }

    emit('update:types', nextTypes)
}

function handleMinDurationChange(value: string) {
    const num = Math.max(0, parseInt(value) || 0)
    emit('update:min-duration', num)
}

function handleMaxDurationChange(value: string) {
    const num = Math.max(0, parseInt(value) || Infinity)
    emit('update:max-duration', num)
}

function handleRouteChange(value: string) {
    emit('update:route', value)
}

function handleClearFilters() {
    emit('clear-filters')
}

function getSpanTypeColor(type: string): string {
    const colors: Record<string, string> = {
        fetch: '#3b82f6',
        composable: '#a855f7',
        component: '#22c55e',
        navigation: '#eab308',
        render: '#f97316',
        transition: '#ec4899',
    }

    return colors[type] || '#6b7280'
}
</script>

<template>
    <div class="trace-filter">
        <!-- Search bar -->
        <div class="trace-filter__section">
            <label class="trace-filter__label">Search</label>
            <input
                :value="props.searchQuery"
                type="text"
                class="trace-filter__search-input"
                placeholder="Search traces, spans, endpoints…"
                @input="handleSearchChange(getInputValue($event))"
            />
        </div>

        <!-- Span type filter -->
        <div v-if="availableSpanTypes.length > 0" class="trace-filter__section">
            <label class="trace-filter__label">Span Type</label>
            <div class="trace-filter__type-filters">
                <button
                    v-for="type in availableSpanTypes"
                    :key="type"
                    :class="{ 'trace-filter__type-badge--selected': props.selectedSpanTypes.has(type) }"
                    class="trace-filter__type-badge"
                    :title="`Filter by ${type} spans`"
                    @click="handleTypeToggle(type)"
                >
                    <span class="trace-filter__type-dot" :style="{ backgroundColor: getSpanTypeColor(type) }"></span>
                    {{ type }}
                </button>
            </div>
        </div>

        <!-- Duration filter -->
        <div class="trace-filter__section">
            <label class="trace-filter__label">Duration (ms)</label>
            <div class="trace-filter__duration-inputs">
                <input
                    :value="props.minDuration"
                    type="number"
                    min="0"
                    class="trace-filter__duration-input"
                    placeholder="Min"
                    @input="handleMinDurationChange(getInputValue($event))"
                />
                <span class="trace-filter__duration-separator">–</span>
                <input
                    :value="props.maxDuration === Infinity ? '' : props.maxDuration"
                    type="number"
                    :min="props.minDuration"
                    :max="maxTraceDuration"
                    class="trace-filter__duration-input"
                    placeholder="Max"
                    @input="handleMaxDurationChange(getInputValue($event))"
                />
            </div>
            <input
                v-if="maxTraceDuration"
                :value="props.maxDuration === Infinity ? maxTraceDuration : props.maxDuration"
                type="range"
                :min="0"
                :max="maxTraceDuration"
                class="trace-filter__duration-slider"
                @input="handleMaxDurationChange(getInputValue($event))"
            />
        </div>

        <!-- Route filter -->
        <div class="trace-filter__section">
            <label class="trace-filter__label">Route</label>
            <input
                :value="props.routeFilter"
                type="text"
                class="trace-filter__search-input"
                placeholder="Filter by route…"
                @input="handleRouteChange(getInputValue($event))"
            />
        </div>

        <!-- Clear filters button -->
        <button v-if="props.hasActiveFilters" class="trace-filter__clear-btn" @click="handleClearFilters">Clear Filters</button>
    </div>
</template>

<style scoped>
.trace-filter {
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding: 12px;
    background: var(--bg-secondary);
    border-bottom: 1px solid var(--border);
}

.trace-filter__section {
    display: flex;
    flex-direction: column;
    gap: 6px;
}

.trace-filter__label {
    font-size: 11px;
    font-weight: 600;
    color: var(--text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.5px;
}

.trace-filter__search-input {
    padding: 6px 8px;
    border: 1px solid var(--border);
    border-radius: 4px;
    background: var(--bg);
    color: var(--text);
    font-family: var(--mono);
    font-size: 11px;
    transition: border-color 0.2s;
}

.trace-filter__search-input:focus {
    outline: none;
    border-color: var(--accent);
}

.trace-filter__type-filters {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
}

.trace-filter__type-badge {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 4px 8px;
    border: 1px solid var(--border);
    border-radius: 3px;
    background: var(--bg);
    color: var(--text-secondary);
    font-size: 10px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
}

.trace-filter__type-badge:hover {
    background: var(--bg-tertiary);
    border-color: var(--accent);
}

.trace-filter__type-badge--selected {
    background: var(--accent-bg);
    border-color: var(--accent);
    color: var(--accent);
}

.trace-filter__type-dot {
    display: inline-block;
    width: 6px;
    height: 6px;
    border-radius: 1px;
}

.trace-filter__duration-inputs {
    display: flex;
    align-items: center;
    gap: 6px;
}

.trace-filter__duration-input {
    flex: 1;
    min-width: 0;
    padding: 6px 8px;
    border: 1px solid var(--border);
    border-radius: 4px;
    background: var(--bg);
    color: var(--text);
    font-family: var(--mono);
    font-size: 11px;
    transition: border-color 0.2s;
}

.trace-filter__duration-input:focus {
    outline: none;
    border-color: var(--accent);
}

.trace-filter__duration-input::placeholder {
    color: var(--text-secondary);
}

.trace-filter__duration-separator {
    color: var(--text-secondary);
    font-size: 10px;
}

.trace-filter__duration-slider {
    width: 100%;
    height: 4px;
    border-radius: 2px;
    background: var(--bg);
    outline: none;
    -webkit-appearance: none;
    appearance: none;
}

.trace-filter__duration-slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: var(--accent);
    cursor: pointer;
    transition: background 0.2s;
}

.trace-filter__duration-slider::-webkit-slider-thumb:hover {
    background: var(--accent-bright);
}

.trace-filter__duration-slider::-moz-range-thumb {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: var(--accent);
    border: none;
    cursor: pointer;
    transition: background 0.2s;
}

.trace-filter__duration-slider::-moz-range-thumb:hover {
    background: var(--accent-bright);
}

.trace-filter__clear-btn {
    padding: 6px 12px;
    border: 1px solid var(--border);
    border-radius: 4px;
    background: var(--bg-tertiary);
    color: var(--text-secondary);
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
}

.trace-filter__clear-btn:hover {
    background: var(--bg);
    border-color: var(--accent);
    color: var(--accent);
}
</style>
