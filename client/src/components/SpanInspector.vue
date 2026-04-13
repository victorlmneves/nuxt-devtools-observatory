<script setup lang="ts">
import { computed } from 'vue'
import type { TraceEntry, TraceSpan } from '@observatory/types/snapshot'

interface Props {
    trace: TraceEntry
    span?: TraceSpan
}

const props = defineProps<Props>()

const emit = defineEmits<{
    'select-span': [span: TraceSpan]
}>()

const parentSpan = computed(() => {
    if (!props.span || !props.span.parentSpanId) {
        return null
    }

    return props.trace.spans.find((s) => s.id === props.span!.parentSpanId)
})

const childSpans = computed(() => {
    if (!props.span) {
        return []
    }

    return props.trace.spans.filter((s) => s.parentSpanId === props.span!.id).sort((a, b) => a.startTime - b.startTime)
})

function formatDuration(durationMs?: number) {
    if (!durationMs) {
        return '0ms'
    }

    if (durationMs < 1) {
        return `${(durationMs * 1000).toFixed(1)}μs`
    }

    if (durationMs < 1000) {
        return `${durationMs.toFixed(1)}ms`
    }

    return `${(durationMs / 1000).toFixed(2)}s`
}

function formatTime(timestamp: number) {
    return new Date(timestamp).toLocaleTimeString('en-US', {
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        fractionalSecondDigits: 3,
    })
}

function formatRelativeTime(timestamp: number) {
    const relative = timestamp - props.trace.startTime

    return `+${Math.round(relative * 100) / 100}ms`
}

function getStatusColor(status: string): string {
    const colors: Record<string, string> = {
        ok: '#22c55e',
        error: '#ef4444',
        cancelled: '#6b7280',
        active: '#eab308',
    }

    return colors[status] || '#6b7280'
}

function getSpanColorClass(type: string) {
    const colors: Record<string, string> = {
        fetch: 'bg-blue-500',
        composable: 'bg-purple-500',
        component: 'bg-green-500',
        navigation: 'bg-yellow-500',
        render: 'bg-orange-500',
        transition: 'bg-pink-500',
    }

    return colors[type] || 'bg-gray-500'
}
</script>

<template>
    <div class="span-inspector">
        <div v-if="!span" class="span-inspector__empty">
            <div class="span-inspector__empty-icon">📊</div>
            <p>Select a span to view details</p>
        </div>

        <div v-else class="span-inspector__content">
            <div class="span-inspector__header">
                <div class="span-inspector__title">
                    <span :class="getSpanColorClass(span.type)" class="span-inspector__type-badge"></span>
                    {{ span.name }}
                </div>
                <div class="span-inspector__status" :style="{ color: getStatusColor(span.status) }">
                    {{ span.status }}
                </div>
            </div>

            <div class="span-inspector__section">
                <div class="span-inspector__section-title">Timing</div>
                <div class="span-inspector__property-grid">
                    <div class="span-inspector__property">
                        <span class="span-inspector__label">Duration</span>
                        <span class="span-inspector__value mono">{{ formatDuration(span.durationMs) }}</span>
                    </div>
                    <div class="span-inspector__property">
                        <span class="span-inspector__label">Start Time</span>
                        <span class="span-inspector__value mono">{{ formatRelativeTime(span.startTime) }}</span>
                    </div>
                    <div v-if="span.endTime" class="span-inspector__property">
                        <span class="span-inspector__label">End Time</span>
                        <span class="span-inspector__value mono">{{ formatRelativeTime(span.endTime) }}</span>
                    </div>
                </div>
            </div>

            <div class="span-inspector__section">
                <div class="span-inspector__section-title">Properties</div>
                <div class="span-inspector__property-grid">
                    <div class="span-inspector__property">
                        <span class="span-inspector__label">ID</span>
                        <span class="span-inspector__value mono text-xs">{{ span.id }}</span>
                    </div>
                    <div class="span-inspector__property">
                        <span class="span-inspector__label">Type</span>
                        <span class="span-inspector__value mono">{{ span.type }}</span>
                    </div>
                    <div class="span-inspector__property">
                        <span class="span-inspector__label">Trace ID</span>
                        <span class="span-inspector__value mono text-xs">{{ span.traceId }}</span>
                    </div>
                </div>
            </div>

            <div v-if="parentSpan" class="span-inspector__section">
                <div class="span-inspector__section-title">Parent Span</div>
                <div class="span-inspector__link" @click="emit('select-span', parentSpan)">
                    <span :class="getSpanColorClass(parentSpan.type)" class="span-inspector__link-badge"></span>
                    {{ parentSpan.name }}
                </div>
            </div>

            <div v-if="childSpans.length > 0" class="span-inspector__section">
                <div class="span-inspector__section-title">Child Spans ({{ childSpans.length }})</div>
                <div class="span-inspector__child-list">
                    <div v-for="child in childSpans" :key="child.id" class="span-inspector__child-item" @click="emit('select-span', child)">
                        <span :class="getSpanColorClass(child.type)" class="span-inspector__child-badge"></span>
                        <span class="span-inspector__child-name">{{ child.name }}</span>
                        <span class="span-inspector__child-duration">{{ formatDuration(child.durationMs) }}</span>
                    </div>
                </div>
            </div>

            <div v-if="span.metadata && Object.keys(span.metadata).length > 0" class="span-inspector__section">
                <div class="span-inspector__section-title">Metadata</div>
                <div class="span-inspector__metadata">
                    <div v-for="(value, key) in span.metadata" :key="key" class="span-inspector__metadata-item">
                        <span class="span-inspector__metadata-key">{{ key }}:</span>
                        <span class="span-inspector__metadata-value">
                            <code v-if="typeof value === 'object'" class="span-inspector__code">
                                {{ JSON.stringify(value, null, 2) }}
                            </code>
                            <span v-else class="span-inspector__code">{{ value }}</span>
                        </span>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>

<style scoped>
.span-inspector {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: auto;
    padding: 16px;
    background: var(--bg);
}

.span-inspector__empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: var(--text-secondary);
    font-size: 13px;
}

.span-inspector__empty-icon {
    font-size: 48px;
    margin-bottom: 12px;
    opacity: 0.5;
}

.span-inspector__content {
    display: flex;
    flex-direction: column;
    gap: 16px;
}

.span-inspector__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding-bottom: 12px;
    border-bottom: 1px solid var(--border);
}

.span-inspector__title {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 14px;
    font-weight: 600;
    color: var(--text);
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.span-inspector__type-badge {
    display: inline-block;
    width: 10px;
    height: 10px;
    border-radius: 2px;
    flex-shrink: 0;
}

.span-inspector__status {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    flex-shrink: 0;
}

.span-inspector__section {
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.span-inspector__section-title {
    font-size: 12px;
    font-weight: 600;
    color: var(--text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.5px;
}

.span-inspector__property-grid {
    display: flex;
    flex-direction: column;
    gap: 6px;
}

.span-inspector__property {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    font-size: 12px;
    padding: 6px;
    background: var(--bg-secondary);
    border-radius: 3px;
}

.span-inspector__label {
    color: var(--text-secondary);
    font-weight: 500;
}

.span-inspector__value {
    color: var(--text);
    font-family: var(--mono);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex-shrink: 0;
}

.span-inspector__link {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px;
    background: var(--bg-secondary);
    border: 1px solid var(--border);
    border-radius: 3px;
    cursor: pointer;
    transition: background 0.2s;
}

.span-inspector__link:hover {
    background: var(--bg-tertiary);
}

.span-inspector__link-badge {
    display: inline-block;
    width: 8px;
    height: 8px;
    border-radius: 2px;
    flex-shrink: 0;
}

.span-inspector__child-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
}

.span-inspector__child-item {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 8px;
    background: var(--bg-secondary);
    border-radius: 3px;
    cursor: pointer;
    font-size: 12px;
    transition: background 0.2s;
}

.span-inspector__child-item:hover {
    background: var(--bg-tertiary);
}

.span-inspector__child-badge {
    display: inline-block;
    width: 8px;
    height: 8px;
    border-radius: 2px;
    flex-shrink: 0;
}

.span-inspector__child-name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--text);
}

.span-inspector__child-duration {
    color: var(--text-secondary);
    font-family: var(--mono);
    font-size: 11px;
    flex-shrink: 0;
}

.span-inspector__metadata {
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.span-inspector__metadata-item {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 11px;
}

.span-inspector__metadata-key {
    color: var(--text-secondary);
    font-weight: 600;
}

.span-inspector__metadata-value {
    color: var(--text);
}

.span-inspector__code {
    display: block;
    padding: 6px 8px;
    background: var(--bg-secondary);
    border-radius: 3px;
    font-family: var(--mono);
    font-size: 10px;
    overflow: auto;
    max-height: 200px;
    white-space: pre-wrap;
    word-break: break-word;
}

/* Color utilities */
.bg-blue-500 {
    background-color: #3b82f6;
}

.bg-purple-500 {
    background-color: #a855f7;
}

.bg-green-500 {
    background-color: #22c55e;
}

.bg-yellow-500 {
    background-color: #eab308;
}

.bg-orange-500 {
    background-color: #f97316;
}

.bg-pink-500 {
    background-color: #ec4899;
}

.bg-gray-500 {
    background-color: #6b7280;
}

.mono {
    font-family: var(--mono);
}

.text-xs {
    font-size: 10px;
}
</style>
