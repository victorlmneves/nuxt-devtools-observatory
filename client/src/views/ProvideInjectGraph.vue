<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useObservatoryData, type InjectEntry, type ProvideEntry } from '../stores/observatory'

interface TreeNodeData {
    id: string
    label: string
    type: 'provider' | 'consumer' | 'both' | 'error'
    provides: Array<{ key: string; val: string; raw: unknown; reactive: boolean; complex: boolean }>
    injects: Array<{ key: string; from: string | null; ok: boolean }>
    children: TreeNodeData[]
}

interface LayoutNode {
    data: TreeNodeData
    parentId: string | null
    x: number
    y: number
}

interface Edge {
    id: string
    x1: number
    y1: number
    x2: number
    y2: number
}

const NODE_W = 140
const NODE_H = 32
const V_GAP = 72
const H_GAP = 18

const { provideInject, connected } = useObservatoryData()

function nodeColor(node: TreeNodeData): string {
    if (node.injects.some((entry) => !entry.ok)) return 'var(--red)'
    if (node.type === 'both') return 'var(--blue)'
    if (node.type === 'provider') return 'var(--teal)'
    return 'var(--text3)'
}

function matchesFilter(node: TreeNodeData, filter: string): boolean {
    if (filter === 'all') return true
    if (filter === 'warn') return node.injects.some((entry) => !entry.ok)
    return node.provides.some((entry) => entry.key === filter) || node.injects.some((entry) => entry.key === filter)
}

/**
 * Count leaf nodes in a subtree iteratively to avoid stack overflow on
 * pathologically deep provide/inject trees (e.g. every component re-providing
 * the same key creates a chain as long as the component tree itself).
 */
function countLeaves(root: TreeNodeData): number {
    let count = 0
    const stack: TreeNodeData[] = [root]
    while (stack.length) {
        const node = stack.pop()!
        if (node.children.length === 0) {
            count++
        } else {
            stack.push(...node.children)
        }
    }
    return count
}

function stringifyValue(value: unknown) {
    if (typeof value === 'string') {
        return value
    }

    try {
        return JSON.stringify(value)
    } catch {
        return String(value)
    }
}

function isComplexValue(value: unknown) {
    return typeof value === 'object' && value !== null
}

function formatValuePreview(value: unknown) {
    if (value === null) {
        return 'null'
    }

    if (Array.isArray(value)) {
        return `Array(${value.length})`
    }

    if (typeof value === 'object') {
        const keys = Object.keys(value as Record<string, unknown>)
        return keys.length ? `{ ${keys.join(', ')} }` : '{}'
    }

    return stringifyValue(value)
}

function formatValueDetail(value: unknown) {
    if (!isComplexValue(value)) {
        return stringifyValue(value)
    }

    try {
        return JSON.stringify(value, null, 2)
    } catch {
        return stringifyValue(value)
    }
}

function provideValueId(nodeId: string, key: string, index: number) {
    return `${nodeId}:${key}:${index}`
}

function basename(file: string) {
    return file.split('/').pop() ?? file
}

function componentId(entry: ProvideEntry | InjectEntry) {
    return String(entry.componentUid)
}

const nodes = computed<TreeNodeData[]>(() => {
    const nodeMap = new Map<string, TreeNodeData>()
    const parentMap = new Map<string, string | null>()

    function ensureNode(entry: ProvideEntry | InjectEntry) {
        const id = componentId(entry)
        const existing = nodeMap.get(id)

        if (existing) {
            return existing
        }

        const created: TreeNodeData = {
            id,
            label: basename(entry.componentFile),
            type: 'consumer',
            provides: [],
            injects: [],
            children: [],
        }

        nodeMap.set(id, created)
        parentMap.set(id, entry.parentUid !== undefined ? String(entry.parentUid) : null)
        return created
    }

    for (const entry of provideInject.value.provides) {
        const node = ensureNode(entry)
        node.provides.push({
            key: entry.key,
            val: formatValuePreview(entry.valueSnapshot),
            raw: entry.valueSnapshot,
            reactive: entry.isReactive,
            complex: isComplexValue(entry.valueSnapshot),
        })
    }

    for (const entry of provideInject.value.injects) {
        const node = ensureNode(entry)
        node.injects.push({
            key: entry.key,
            from: entry.resolvedFromFile ?? null,
            ok: entry.resolved,
        })
    }

    for (const node of nodeMap.values()) {
        if (node.injects.some((entry) => !entry.ok)) {
            node.type = 'error'
        } else if (node.provides.length && node.injects.length) {
            node.type = 'both'
        } else if (node.provides.length) {
            node.type = 'provider'
        } else {
            node.type = 'consumer'
        }
    }

    const roots: TreeNodeData[] = []

    for (const [id, node] of nodeMap.entries()) {
        const parentId = parentMap.get(id)
        const parent = parentId ? nodeMap.get(parentId) : undefined

        if (parent) {
            parent.children.push(node)
        } else {
            roots.push(node)
        }
    }

    return roots
})

const activeFilter = ref('all')
const selectedNode = ref<TreeNodeData | null>(null)
const expandedProvideValues = ref<Set<string>>(new Set())

watch(selectedNode, () => {
    expandedProvideValues.value = new Set()
})

function toggleProvideValue(id: string) {
    const next = new Set(expandedProvideValues.value)

    if (next.has(id)) {
        next.delete(id)
    } else {
        next.add(id)
    }

    expandedProvideValues.value = next
}

const allKeys = computed(() => {
    const keys = new Set<string>()
    const stack = [...nodes.value]
    while (stack.length) {
        const node = stack.pop()!
        node.provides.forEach((entry) => keys.add(entry.key))
        node.injects.forEach((entry) => keys.add(entry.key))
        stack.push(...node.children)
    }
    return [...keys]
})

const visibleNodes = computed<TreeNodeData[]>(() => {
    // Iterative post-order prune — avoids stack overflow on deep trees.
    // We process nodes bottom-up so each parent can inspect its children's
    // already-computed visibility before deciding its own.
    function pruneIterative(root: TreeNodeData): TreeNodeData | null {
        // Phase 1: collect nodes in pre-order (parent before children)
        const order: TreeNodeData[] = []
        const stack: TreeNodeData[] = [root]
        while (stack.length) {
            const node = stack.pop()!
            order.push(node)
            for (let i = node.children.length - 1; i >= 0; i--) {
                stack.push(node.children[i])
            }
        }

        // Phase 2: process in reverse pre-order (children before parents)
        const pruned = new Map<TreeNodeData, TreeNodeData | null>()
        for (let i = order.length - 1; i >= 0; i--) {
            const node = order[i]
            const visibleChildren = node.children
                .map((child) => pruned.get(child) ?? null)
                .filter((child): child is TreeNodeData => child !== null)
            const selfMatches = matchesFilter(node, activeFilter.value)

            if (!selfMatches && !visibleChildren.length) {
                pruned.set(node, null)
            } else {
                pruned.set(node, { ...node, children: visibleChildren })
            }
        }

        return pruned.get(root) ?? null
    }

    return nodes.value.map(pruneIterative).filter(Boolean) as TreeNodeData[]
})

watch([visibleNodes, selectedNode], ([currentNodes, currentSelected]) => {
    if (!currentSelected) {
        return
    }

    const ids = new Set<string>()
    const stack = [...currentNodes]
    while (stack.length) {
        const node = stack.pop()!
        ids.add(node.id)
        stack.push(...node.children)
    }

    if (!ids.has(currentSelected.id)) {
        selectedNode.value = null
    }
})

const layout = computed<LayoutNode[]>(() => {
    const flat: LayoutNode[] = []
    const pad = H_GAP

    // Iterative replacement for the recursive place() — avoids stack overflow
    // on deep component trees. Uses an explicit stack of pending work items.
    interface WorkItem {
        node: TreeNodeData
        depth: number
        slotLeft: number
        parentId: string | null
    }

    let left = pad

    for (const root of visibleNodes.value) {
        const stack: WorkItem[] = [{ node: root, depth: 0, slotLeft: left, parentId: null }]

        while (stack.length) {
            const { node, depth, slotLeft, parentId } = stack.pop()!
            const leaves = countLeaves(node)
            const slotWidth = leaves * (NODE_W + H_GAP) - H_GAP

            flat.push({
                data: node,
                parentId,
                x: Math.round(slotLeft + slotWidth / 2),
                y: Math.round(pad + depth * (NODE_H + V_GAP) + NODE_H / 2),
            })

            // Push children in reverse so leftmost child is processed first
            let childLeft = slotLeft
            const childWork: WorkItem[] = []
            for (const child of node.children) {
                const childLeaves = countLeaves(child)
                childWork.push({ node: child, depth: depth + 1, slotLeft: childLeft, parentId: node.id })
                childLeft += childLeaves * (NODE_W + H_GAP)
            }
            for (let i = childWork.length - 1; i >= 0; i--) {
                stack.push(childWork[i])
            }
        }

        const rootLeaves = countLeaves(root)
        left += rootLeaves * (NODE_W + H_GAP) + H_GAP * 2
    }

    return flat
})

const canvasW = computed(() => layout.value.reduce((max, node) => Math.max(max, node.x + NODE_W / 2 + 20), 520))
const canvasH = computed(() => layout.value.reduce((max, node) => Math.max(max, node.y + NODE_H / 2 + 20), 200))

const edges = computed<Edge[]>(() => {
    const byId = new Map(layout.value.map((node) => [node.data.id, node]))

    return layout.value
        .filter((node) => node.parentId !== null)
        .map((node) => {
            const parent = byId.get(node.parentId!)!
            return {
                id: `${parent.data.id}--${node.data.id}`,
                x1: parent.x,
                y1: parent.y + NODE_H / 2,
                x2: node.x,
                y2: node.y - NODE_H / 2,
            }
        })
})
</script>

<template>
    <div class="view">
        <div class="toolbar">
            <button :class="{ active: activeFilter === 'all' }" @click="activeFilter = 'all'">all keys</button>
            <button
                v-for="key in allKeys"
                :key="key"
                style="font-family: var(--mono)"
                :class="{ active: activeFilter === key }"
                @click="activeFilter = key"
            >
                {{ key }}
            </button>
            <button style="margin-left: auto" :class="{ 'danger-active': activeFilter === 'warn' }" @click="activeFilter = 'warn'">
                warnings only
            </button>
        </div>

        <div class="split">
            <div class="graph-area">
                <div class="legend">
                    <span class="dot" style="background: var(--teal)"></span>
                    <span>provides</span>
                    <span class="dot" style="background: var(--blue)"></span>
                    <span>both</span>
                    <span class="dot" style="background: var(--text3)"></span>
                    <span>injects</span>
                    <span class="dot" style="background: var(--red)"></span>
                    <span>missing provider</span>
                </div>
                <div v-if="layout.length" class="canvas-stage">
                    <div class="canvas-wrap" :style="{ width: `${canvasW}px`, height: `${canvasH}px` }">
                        <svg class="edges-svg" :width="canvasW" :height="canvasH" :viewBox="`0 0 ${canvasW} ${canvasH}`">
                            <path
                                v-for="edge in edges"
                                :key="edge.id"
                                :d="`M ${edge.x1},${edge.y1} C ${edge.x1},${(edge.y1 + edge.y2) / 2} ${edge.x2},${(edge.y1 + edge.y2) / 2} ${edge.x2},${edge.y2}`"
                                class="edge"
                                fill="none"
                            />
                        </svg>
                        <div
                            v-for="layoutNode in layout"
                            :key="layoutNode.data.id"
                            class="graph-node"
                            :class="{ 'is-selected': selectedNode?.id === layoutNode.data.id }"
                            :style="{
                                left: `${layoutNode.x - NODE_W / 2}px`,
                                top: `${layoutNode.y - NODE_H / 2}px`,
                                width: `${NODE_W}px`,
                                '--node-color': nodeColor(layoutNode.data),
                            }"
                            @click="selectedNode = layoutNode.data"
                        >
                            <span class="node-dot" :style="{ background: nodeColor(layoutNode.data) }"></span>
                            <span class="mono node-label">{{ layoutNode.data.label }}</span>
                            <span v-if="layoutNode.data.provides.length" class="badge badge-ok badge-xs">
                                +{{ layoutNode.data.provides.length }}
                            </span>
                            <span v-if="layoutNode.data.injects.some((entry) => !entry.ok)" class="badge badge-err badge-xs">!</span>
                        </div>
                    </div>
                </div>
                <div v-else class="graph-empty">
                    {{ connected ? 'No components match the current provide/inject filter.' : 'Waiting for connection to the Nuxt app…' }}
                </div>
            </div>

            <div v-if="selectedNode" class="detail-panel">
                <div class="detail-header">
                    <span class="mono bold" style="font-size: 12px">{{ selectedNode.label }}</span>
                    <button @click="selectedNode = null">×</button>
                </div>

                <div v-if="selectedNode.provides.length" class="detail-section">
                    <div class="section-label">provides ({{ selectedNode.provides.length }})</div>
                    <div class="detail-list">
                        <div
                            v-for="(entry, index) in selectedNode.provides"
                            :key="provideValueId(selectedNode.id, entry.key, index)"
                            class="provide-row"
                        >
                            <div class="row-main">
                                <span class="mono text-sm row-key">{{ entry.key }}</span>
                                <span class="mono text-sm muted row-value-preview" :title="entry.val">{{ entry.val }}</span>
                                <span class="badge" :class="entry.reactive ? 'badge-ok' : 'badge-gray'">
                                    {{ entry.reactive ? 'reactive' : 'static' }}
                                </span>
                                <button
                                    v-if="entry.complex"
                                    class="row-toggle mono"
                                    @click="toggleProvideValue(provideValueId(selectedNode.id, entry.key, index))"
                                >
                                    {{ expandedProvideValues.has(provideValueId(selectedNode.id, entry.key, index)) ? 'hide' : 'view' }}
                                </button>
                            </div>
                            <pre
                                v-if="entry.complex && expandedProvideValues.has(provideValueId(selectedNode.id, entry.key, index))"
                                class="value-box"
                                >{{ formatValueDetail(entry.raw) }}</pre
                            >
                        </div>
                    </div>
                </div>

                <div
                    v-if="selectedNode.injects.length"
                    class="detail-section"
                    :style="{ marginTop: selectedNode.provides.length ? '10px' : '0' }"
                >
                    <div class="section-label">injects ({{ selectedNode.injects.length }})</div>
                    <div class="detail-list">
                        <div
                            v-for="entry in selectedNode.injects"
                            :key="entry.key"
                            class="inject-row"
                            :class="{ 'inject-miss': !entry.ok }"
                        >
                            <span class="mono text-sm row-key">{{ entry.key }}</span>
                            <span v-if="entry.ok" class="badge badge-ok">resolved</span>
                            <span v-else class="badge badge-err">no provider</span>
                            <span class="mono muted text-sm row-from" :title="entry.from ?? 'undefined'">
                                {{ entry.from ?? 'undefined' }}
                            </span>
                        </div>
                    </div>
                </div>

                <div v-if="!selectedNode.provides.length && !selectedNode.injects.length" class="muted text-sm" style="margin-top: 8px">
                    no provide/inject in this component
                </div>
            </div>
            <div v-else class="detail-empty">
                {{ connected ? 'Click a node to inspect.' : 'Waiting for connection to the Nuxt app…' }}
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

.graph-area {
    flex: 1;
    overflow: auto;
    border: 0.5px solid var(--border);
    border-radius: var(--radius-lg);
    padding: 12px;
    background: var(--bg3);
}

.legend {
    display: flex;
    align-items: center;
    gap: 12px;
    font-size: 11px;
    color: var(--text2);
    margin-bottom: 12px;
}

.canvas-stage {
    display: flex;
    justify-content: center;
    align-items: flex-start;
    min-width: 100%;
}

.dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    display: inline-block;
    margin-right: 2px;
}

.canvas-wrap {
    position: relative;
}

.edges-svg {
    position: absolute;
    top: 0;
    left: 0;
    pointer-events: none;
}

.edge {
    stroke: var(--border);
    stroke-width: 1.5;
}

.graph-node {
    position: absolute;
    display: flex;
    align-items: center;
    gap: 7px;
    padding: 0 10px;
    height: 32px;
    border-radius: var(--radius);
    border: 0.5px solid var(--border);
    background: var(--bg3);
    cursor: pointer;
    transition:
        border-color 0.12s,
        background 0.12s;
    overflow: hidden;
    box-sizing: border-box;
    white-space: nowrap;
}

.graph-node:hover {
    border-color: var(--text3);
}

.graph-node.is-selected {
    border-color: var(--node-color);
    background: color-mix(in srgb, var(--node-color) 8%, transparent);
}

.node-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    flex-shrink: 0;
}

.node-label {
    font-size: 11px;
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
}

.badge-xs {
    font-size: 9px;
    padding: 1px 4px;
}

.detail-panel {
    width: 280px;
    flex-shrink: 0;
    overflow: auto;
    border: 0.5px solid var(--border);
    border-radius: var(--radius-lg);
    padding: 12px;
    background: var(--bg3);
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-height: 0;
}

.detail-empty {
    width: 280px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--text3);
    font-size: 12px;
    border: 0.5px dashed var(--border);
    border-radius: var(--radius-lg);
    flex-shrink: 0;
}

.graph-empty {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 180px;
    color: var(--text3);
    font-size: 12px;
}

.detail-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 6px;
}

.section-label {
    font-size: 10px;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.4px;
    color: var(--text3);
    margin: 8px 0 5px;
}

.detail-section {
    display: flex;
    flex-direction: column;
    min-height: 0;
}

.detail-list {
    display: flex;
    flex-direction: column;
    gap: 3px;
    overflow: auto;
    max-height: 220px;
    padding-right: 2px;
}

.provide-row {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 5px 8px;
    background: var(--bg2);
    border-radius: var(--radius);
    margin-bottom: 3px;
}

.row-main {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
}

.row-key {
    min-width: 100px;
    color: var(--text2);
    flex-shrink: 0;
}

.row-value-preview {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.row-toggle {
    padding: 2px 8px;
    font-size: 10px;
}

.value-box {
    font-family: var(--mono);
    font-size: 11px;
    color: var(--text2);
    background: rgb(0 0 0 / 10%);
    border-radius: var(--radius);
    padding: 8px 10px;
    white-space: pre-wrap;
    word-break: break-word;
    overflow: auto;
    max-height: 180px;
}

.inject-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 5px 8px;
    background: var(--bg2);
    border-radius: var(--radius);
    margin-bottom: 3px;
}

.row-from {
    margin-left: auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.inject-miss {
    background: rgb(226 75 74 / 8%);
}
</style>
