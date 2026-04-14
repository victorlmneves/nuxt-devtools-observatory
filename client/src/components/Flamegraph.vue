<script setup lang="ts">
import { computed, ref } from 'vue'
import type { TraceEntry, TraceSpan } from '@observatory/types/snapshot'

interface TraceNode extends TraceSpan {
    children: TraceNode[]
    level: number
}

interface Props {
    trace: TraceEntry
    selectedSpanId?: string
}

const props = defineProps<Props>()
const emit = defineEmits<{
    'select-span': [span: TraceSpan]
}>()

const expandedNodes = ref<Set<string>>(new Set())

function toggleExpanded(spanId: string) {
    if (expandedNodes.value.has(spanId)) {
        expandedNodes.value.delete(spanId)
    } else {
        expandedNodes.value.add(spanId)
    }
}

function buildTree(spans: TraceSpan[], parentId: string | undefined = undefined, level = 0): TraceNode[] {
    return spans
        .filter((s) => s.parentSpanId === parentId)
        .map((span) => ({
            ...span,
            children: buildTree(spans, span.id, level + 1),
            level,
        }))
}

const spanTree = computed(() => buildTree(props.trace.spans, undefined, 0))

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

    // Add 10% padding so the rightmost span isn't clipped at 100%
    return maxEndOffset > 0 ? maxEndOffset * 1.1 : 1
})

function getBarPosition(span: TraceSpan): { left: string; width: string } {
    const traceStart = props.trace.startTime
    const left = ((span.startTime - traceStart) / timelineDuration.value) * 100
    const width = ((span.durationMs || 0) / timelineDuration.value) * 100

    return {
        left: `${Math.min(100, Math.max(0, left))}%`,
        width: `${Math.max(0.5, Math.min(100 - Math.max(0, left), width))}%`,
    }
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

function asString(value: unknown): string | undefined {
    return typeof value === 'string' && value.length > 0 ? value : undefined
}

function asNumber(value: unknown): number | undefined {
    return typeof value === 'number' ? value : undefined
}

function getSpanDisplayName(span: TraceSpan): string {
    const metadata = span.metadata ?? {}
    const lifecycle = asString(metadata.lifecycle)
    const componentName = asString(metadata.componentName)
    const uid = asNumber(metadata.uid)
    const route = asString(metadata.route) ?? asString(metadata.path)
    const method = asString(metadata.method)
    const url = asString(metadata.url)

    if (componentName && lifecycle) {
        return uid !== undefined ? `${componentName}.${lifecycle} #${uid}` : `${componentName}.${lifecycle}`
    }

    if (componentName) {
        return uid !== undefined ? `${componentName} #${uid}` : componentName
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
    const metadata = span.metadata ?? {}
    const displayName = getSpanDisplayName(span)
    const status = span.status
    const duration = formatDuration(span.durationMs)
    const route = asString(metadata.route) ?? asString(metadata.path)

    if (route) {
        return `${displayName} - ${duration} (${status}) [${route}]`
    }

    return `${displayName} - ${duration} (${status})`
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

function renderNode(node: TraceNode): TraceNode[] {
    const result: TraceNode[] = [node]

    if (expandedNodes.value.has(node.id) && node.children.length > 0) {
        for (const child of node.children) {
            result.push(...renderNode(child))
        }
    }

    return result
}

const flattenedTree = computed(() => {
    const result: Array<{ node: TraceNode; displayDepth: number }> = []

    for (const rootNode of spanTree.value) {
        for (const node of renderNode(rootNode)) {
            const depth = node.level + (node.parentSpanId ? 1 : 0)
            result.push({ node, displayDepth: depth })
        }
    }

    return result
})
</script>

<template>
    <div class="flamegraph">
        <div class="flamegraph__timeline-header">
            <div class="flamegraph__time-label">0ms</div>
            <div class="flamegraph__time-label">{{ formatDuration(timelineDuration / 2) }}</div>
            <div class="flamegraph__time-label">{{ formatDuration(timelineDuration) }}</div>
        </div>

        <div class="flamegraph__rows">
            <div
                v-for="{ node, displayDepth } in flattenedTree"
                :key="node.id"
                :class="{ 'flamegraph__row--selected': node.id === props.selectedSpanId }"
                class="flamegraph__row"
            >
                <div class="flamegraph__label" :style="{ paddingLeft: `calc(8px + ${displayDepth * 16}px)` }">
                    <button
                        v-if="node.children.length > 0"
                        :class="{
                            'flamegraph__expand-btn': true,
                            'flamegraph__expand-btn--expanded': expandedNodes.has(node.id),
                        }"
                        @click="toggleExpanded(node.id)"
                    >
                        ▶
                    </button>
                    <button class="flamegraph__node-button" @click="emit('select-span', node)">
                        <span class="flamegraph__span-name">{{ getSpanDisplayName(node) }}</span>
                        <span class="flamegraph__span-type">{{ node.type }}</span>
                    </button>
                </div>

                <div class="flamegraph__bar-container">
                    <div
                        class="flamegraph__bar"
                        :class="getSpanColorClass(node.type)"
                        :style="getBarPosition(node)"
                        :title="getSpanTooltip(node)"
                        @click="emit('select-span', node)"
                    >
                        <span v-if="!isNarrowBar(node)" class="flamegraph__bar-label">{{ formatDuration(node.durationMs) }}</span>
                    </div>
                    <span v-if="isNarrowBar(node)" class="flamegraph__bar-label-outside" :style="{ left: getBarPosition(node).left }">
                        {{ formatDuration(node.durationMs) }}
                    </span>
                </div>
            </div>

            <div v-if="flattenedTree.length === 0" class="flamegraph__empty">No spans in this trace</div>
        </div>
    </div>
</template>

<style scoped>
.flamegraph {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-width: 0;
    overflow-x: hidden;
    overflow-y: auto;
    font-family: var(--mono);
    font-size: 11px;
}

.flamegraph__timeline-header {
    display: flex;
    justify-content: space-between;
    padding: 8px 0;
    border-bottom: 1px solid var(--border);
    position: sticky;
    top: 0;
    min-width: 0;
    background: var(--bg2, var(--bg));
    box-shadow: 0 1px 0 var(--border);
    z-index: 10;
}

.flamegraph__time-label {
    font-size: 10px;
    color: var(--text2, var(--text));
    padding: 0 8px;
}

.flamegraph__rows {
    display: flex;
    flex-direction: column;
    min-width: 0;
}

.flamegraph__row {
    display: flex;
    height: 28px;
    border-bottom: 1px solid var(--border);
    align-items: center;
    min-width: 0;
    cursor: pointer;
}

.flamegraph__row--selected {
    background: var(--tracker-tint-purple-soft, rgba(127, 119, 221, 0.08));
}

.flamegraph__row--selected .flamegraph__span-name {
    color: var(--purple, var(--accent));
}

.flamegraph__label {
    display: flex;
    align-items: center;
    width: 280px;
    min-width: 280px;
    gap: 6px;
    padding-right: 8px;
    overflow: hidden;
}

.flamegraph__node-button {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
    padding: 0;
    border: none;
    background: transparent;
    color: inherit;
    cursor: pointer;
    text-align: left;
}

.flamegraph__expand-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 16px;
    padding: 0;
    margin: 0;
    background: none;
    border: none;
    color: var(--text2, var(--text));
    cursor: pointer;
    font-size: 10px;
    transition: transform 0.2s;
}

.flamegraph__expand-btn--expanded {
    transform: rotate(90deg);
}

.flamegraph__expand-btn:hover {
    color: var(--text);
}

.flamegraph__span-name {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--text);
}

.flamegraph__span-type {
    padding: 2px 6px;
    background: var(--bg2, var(--bg));
    border-radius: 3px;
    color: var(--text2, var(--text));
    font-size: 9px;
    flex-shrink: 0;
}

.flamegraph__bar-container {
    flex: 1;
    height: 100%;
    min-width: 0;
    position: relative;
    padding: 4px 0;
    overflow: hidden;
}

.flamegraph__bar {
    position: absolute;
    top: 50%;
    transform: translateY(-50%);
    height: 16px;
    border-radius: 2px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
    overflow: hidden;
    cursor: pointer;
    transition: opacity 0.2s;
}

.flamegraph__bar:hover {
    opacity: 0.8;
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.3);
}

.flamegraph__bar-label {
    font-size: 9px;
    white-space: nowrap;
    padding: 0 4px;
}

.flamegraph__bar-label-outside {
    position: absolute;
    top: 50%;
    transform: translateY(-50%);
    font-size: 9px;
    white-space: nowrap;
    color: var(--text);
    padding-left: 4px;
    pointer-events: none;
}

.flamegraph__empty {
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
</style>
