<script setup lang="ts">
import { computed } from 'vue'
import type { TraceEntry, TraceSpan } from '@observatory/types/snapshot'

interface Props {
    trace: TraceEntry
}

const props = defineProps<Props>()

const spansByType = computed(() => {
    const groups: Record<string, TraceSpan[]> = {}

    for (const span of props.trace.spans) {
        if (!groups[span.type]) {
            groups[span.type] = []
        }

        groups[span.type].push(span)
    }

    return Object.entries(groups)
        .map(([type, spans]) => ({
            type,
            spans: spans.sort((a, b) => a.startTime - b.startTime),
        }))
        .sort((a, b) => {
            const typeOrder: Record<string, number> = {
                navigation: 0,
                fetch: 1,
                composable: 2,
                component: 3,
                render: 4,
                transition: 5,
            }

            return (typeOrder[a.type] ?? 999) - (typeOrder[b.type] ?? 999)
        })
})

const timelineDuration = computed(() => {
    if (props.trace.durationMs && props.trace.durationMs > 0) {
        return props.trace.durationMs
    }

    if (props.trace.endTime && props.trace.endTime > props.trace.startTime) {
        return props.trace.endTime - props.trace.startTime
    }

    let maxEndOffset = 0

    for (const span of props.trace.spans) {
        const endTime = span.endTime ?? span.startTime + (span.durationMs ?? 0)
        const endOffset = endTime - props.trace.startTime

        if (endOffset > maxEndOffset) {
            maxEndOffset = endOffset
        }
    }

    return maxEndOffset || 1
})

function getSpanX(span: TraceSpan): number {
    const left = ((span.startTime - props.trace.startTime) / timelineDuration.value) * 100

    return Math.min(100, Math.max(0, left))
}

function getSpanWidth(span: TraceSpan): number {
    const left = getSpanX(span)
    const width = ((span.durationMs || 0) / timelineDuration.value) * 100

    return Math.max(2, Math.min(100 - left, width))
}

function isNarrowBar(span: TraceSpan): boolean {
    const width = ((span.durationMs || 0) / timelineDuration.value) * 100

    return width < 5
}

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

function getStatusColor(status: string) {
    const statusColors: Record<string, string> = {
        ok: 'border-green-400',
        error: 'border-red-400',
        cancelled: 'border-gray-400',
        active: 'border-yellow-400',
    }

    return statusColors[status] || 'border-gray-400'
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

function getSpanTooltip(span: TraceSpan): string {
    const displayName = getSpanDisplayName(span)
    const duration = formatDuration(span.durationMs)
    const m = span.metadata as Record<string, unknown> | undefined
    const route = m ? asString(m.route) || asString(m.path) : ''
    let tooltip = `${displayName} — ${duration} (${span.status})`

    if (route && !displayName.includes(route)) {
        tooltip += ` [${route}]`
    }

    return tooltip
}
</script>

<template>
    <div class="waterfall">
        <div class="waterfall__timeline-header">
            <div class="waterfall__type-col">Type</div>
            <div class="waterfall__timeline-col">
                <div class="waterfall__time-markers">
                    <div class="waterfall__time-marker">0ms</div>
                    <div class="waterfall__time-marker">{{ formatDuration(timelineDuration / 4) }}</div>
                    <div class="waterfall__time-marker">{{ formatDuration(timelineDuration / 2) }}</div>
                    <div class="waterfall__time-marker">{{ formatDuration((timelineDuration * 3) / 4) }}</div>
                    <div class="waterfall__time-marker">{{ formatDuration(timelineDuration) }}</div>
                </div>
            </div>
        </div>

        <div class="waterfall__groups">
            <div v-for="group in spansByType" :key="group.type" class="waterfall__group">
                <div class="waterfall__group-header">
                    <span class="waterfall__group-type">
                        <span class="waterfall__color-dot" :class="getSpanColorClass(group.type)"></span>
                        {{ group.type }}
                    </span>
                    <span class="waterfall__group-count">{{ group.spans.length }}</span>
                </div>

                <div class="waterfall__group-spans">
                    <div v-for="span in group.spans" :key="span.id" class="waterfall__span-row">
                        <div class="waterfall__span-label">
                            <span :title="getSpanTooltip(span)">{{ getSpanDisplayName(span) }}</span>
                        </div>
                        <div class="waterfall__span-bar-container">
                            <div
                                class="waterfall__span-bar"
                                :class="[getSpanColorClass(span.type), getStatusColor(span.status)]"
                                :style="{
                                    left: `${getSpanX(span)}%`,
                                    width: `${Math.max(1, getSpanWidth(span))}%`,
                                }"
                                :title="getSpanTooltip(span)"
                            >
                                <span v-if="!isNarrowBar(span)" class="waterfall__bar-duration">{{ formatDuration(span.durationMs) }}</span>
                            </div>
                            <span
                                v-if="isNarrowBar(span)"
                                class="waterfall__bar-duration-outside"
                                :style="{ left: `calc(${getSpanX(span)}% + 4px)` }"
                            >
                                {{ formatDuration(span.durationMs) }}
                            </span>
                        </div>
                    </div>
                </div>
            </div>

            <div v-if="spansByType.length === 0" class="waterfall__empty">No spans in this trace</div>
        </div>
    </div>
</template>

<style scoped>
.waterfall {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: auto;
    font-family: var(--mono);
    font-size: 11px;
}

.waterfall__timeline-header {
    display: flex;
    position: sticky;
    top: 0;
    z-index: 20;
    background: var(--bg2, var(--bg));
    box-shadow: 0 1px 0 var(--border);
    border-bottom: 1px solid var(--border);
}

.waterfall__type-col {
    width: 120px;
    min-width: 120px;
    padding: 8px 0;
    border-right: 1px solid var(--border);
}

.waterfall__timeline-col {
    flex: 1;
    min-width: 0;
}

.waterfall__time-markers {
    display: flex;
    justify-content: space-around;
    padding: 8px 16px;
    gap: 8px;
}

.waterfall__time-marker {
    font-size: 10px;
    color: var(--text2, var(--text));
    flex: 1;
    text-align: center;
}

.waterfall__groups {
    display: flex;
    flex-direction: column;
}

.waterfall__group {
    border-bottom: 1px solid var(--border);
}

.waterfall__group-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    background: var(--bg2, var(--bg));
    padding: 8px 16px;
    font-weight: 600;
    font-size: 12px;
    color: var(--text2, var(--text));
}

.waterfall__group-type {
    display: flex;
    align-items: center;
    gap: 6px;
}

.waterfall__color-dot {
    display: inline-block;
    width: 8px;
    height: 8px;
    border-radius: 2px;
}

.waterfall__group-count {
    background: var(--bg);
    border: 1px solid var(--border);
    padding: 2px 6px;
    border-radius: 3px;
    font-size: 10px;
}

.waterfall__group-spans {
    display: flex;
    flex-direction: column;
}

.waterfall__span-row {
    display: flex;
    height: 28px;
    align-items: center;
    border-bottom: 1px solid var(--border);
}

.waterfall__span-label {
    width: 120px;
    min-width: 120px;
    padding: 0 16px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--text);
    font-size: 11px;
    border-right: 1px solid var(--border);
}

.waterfall__span-bar-container {
    flex: 1;
    height: 100%;
    position: relative;
    min-width: 0;
}

.waterfall__span-bar {
    position: absolute;
    top: 50%;
    transform: translateY(-50%);
    height: 16px;
    border-radius: 2px;
    border-left: 2px solid;
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
    overflow: hidden;
    cursor: pointer;
    transition: opacity 0.2s;
    padding: 0 4px;
}

.waterfall__span-bar:hover {
    opacity: 0.8;
    box-shadow: inset 0 0 0 1px rgb(255 255 255 / 30%);
}

.waterfall__bar-duration {
    font-size: 9px;
    white-space: nowrap;
}

.waterfall__bar-duration-outside {
    position: absolute;
    top: 50%;
    transform: translateY(-50%);
    font-size: 9px;
    white-space: nowrap;
    color: var(--text);
    pointer-events: none;
}

.waterfall__empty {
    padding: 32px 16px;
    text-align: center;
    color: var(--text2, var(--text));
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

.border-green-400 {
    border-color: #4ade80;
}

.border-red-400 {
    border-color: #f87171;
}

.border-gray-400 {
    border-color: #9ca3af;
}

.border-yellow-400 {
    border-color: #facc15;
}
</style>
