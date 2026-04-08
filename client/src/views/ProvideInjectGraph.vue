<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useResizablePane } from '@observatory-client/composables/useResizablePane'
import { useObservatoryData, openInEditor as openInEditorFromStore } from '@observatory-client/stores/observatory'
import type { InjectEntry, ProvideEntry } from '@observatory/types/snapshot'

interface TreeNodeData {
    id: string
    label: string
    componentName: string
    componentFile: string
    type: 'provider' | 'consumer' | 'both' | 'error'
    provides: Array<{
        key: string
        val: string
        raw: unknown
        reactive: boolean
        complex: boolean
        scope: 'global' | 'layout' | 'component'
        isShadowing: boolean
        /** UIDs of components that inject this key */
        consumerUids: number[]
        consumerNames: string[]
    }>
    injects: Array<{ key: string; from: string | null; fromName: string | null; ok: boolean }>
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
const { paneWidth: detailWidth, onHandleMouseDown } = useResizablePane(280, 'observatory:provide:detailWidth')

function nodeColor(node: TreeNodeData): string {
    if (node.injects.some((entry) => !entry.ok)) {
        return 'var(--red)'
    }

    if (node.type === 'both') {
        return 'var(--blue)'
    }

    if (node.type === 'provider') {
        return 'var(--teal)'
    }

    return 'var(--text3)'
}

function matchesFilter(node: TreeNodeData, filter: string): boolean {
    if (filter === 'all') {
        return true
    }

    if (filter === 'warn') {
        return node.injects.some((entry) => !entry.ok)
    }

    if (filter === 'shadow') {
        return node.provides.some((entry) => entry.isShadowing)
    }

    return node.provides.some((entry) => entry.key === filter) || node.injects.some((entry) => entry.key === filter)
}

function matchesSearch(node: TreeNodeData, query: string): boolean {
    if (!query) {
        return true
    }

    const q = query.toLowerCase()

    return (
        node.label.toLowerCase().includes(q) ||
        node.componentName.toLowerCase().includes(q) ||
        node.provides.some((p) => p.key.toLowerCase().includes(q)) ||
        node.injects.some((i) => i.key.toLowerCase().includes(q))
    )
}

/**
 * Count leaf nodes in a subtree iteratively to avoid stack overflow on
 * pathologically deep provide/inject trees (e.g. every component re-providing
 * the same key creates a chain as long as the component tree itself).
 * @param {TreeNodeData} root - The root node of the subtree to count leaves for.
 * @returns {number} The number of leaf nodes in the subtree.
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

function openInEditor(file: string) {
    openInEditorFromStore(file)
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
            componentName: entry.componentName ?? basename(entry.componentFile),
            componentFile: entry.componentFile,
            type: 'consumer',
            provides: [],
            injects: [],
            children: [],
        }

        nodeMap.set(id, created)
        parentMap.set(id, entry.parentUid !== undefined ? String(entry.parentUid) : null)
        return created
    }

    // Build a lookup: key → list of inject entries (to compute consumer lists)
    const injectsByKey = new Map<string, InjectEntry[]>()
    for (const entry of provideInject.value.injects) {
        const list = injectsByKey.get(entry.key) ?? []
        list.push(entry)
        injectsByKey.set(entry.key, list)
    }

    // Build a lookup: uid → componentName for resolvedFrom display
    const nameByUid = new Map<number, string>()
    for (const entry of provideInject.value.provides) {
        nameByUid.set(entry.componentUid, entry.componentName)
    }
    for (const entry of provideInject.value.injects) {
        nameByUid.set(entry.componentUid, entry.componentName)
    }

    for (const entry of provideInject.value.provides) {
        const node = ensureNode(entry)
        const consumers = injectsByKey.get(entry.key) ?? []
        node.provides.push({
            key: entry.key,
            val: formatValuePreview(entry.valueSnapshot),
            raw: entry.valueSnapshot,
            reactive: entry.isReactive,
            complex: isComplexValue(entry.valueSnapshot),
            scope: entry.scope ?? 'component',
            isShadowing: entry.isShadowing ?? false,
            consumerUids: consumers.map((c) => c.componentUid),
            consumerNames: consumers.map((c) => c.componentName),
        })
    }

    for (const entry of provideInject.value.injects) {
        const node = ensureNode(entry)
        node.injects.push({
            key: entry.key,
            from: entry.resolvedFromFile ?? null,
            fromName: entry.resolvedFromUid !== undefined ? (nameByUid.get(entry.resolvedFromUid) ?? null) : null,
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
const searchQuery = ref('')
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
    /**
     * Iterative post-order prune — avoids stack overflow on deep trees.
     * Processes nodes bottom-up so each parent can inspect its children's
     * already-computed visibility before deciding its own.
     * @param {TreeNodeData} root - The root node of the tree to prune.
     * @returns {TreeNodeData | null} The pruned tree node or null if the node is not visible.
     */
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
            const selfMatches = matchesFilter(node, activeFilter.value) && matchesSearch(node, searchQuery.value)

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
    <div class="provide-graph tracker-view">
        <div class="provide-graph__toolbar tracker-toolbar">
            <button :class="{ active: activeFilter === 'all' }" @click="activeFilter = 'all'">all keys</button>
            <button
                v-for="key in allKeys"
                :key="key"
                class="provide-graph__key-filter mono"
                :class="{ active: activeFilter === key }"
                @click="activeFilter = key"
            >
                {{ key }}
            </button>
            <button
                class="provide-graph__toolbar-spacer"
                :class="{ 'danger-active': activeFilter === 'shadow' }"
                @click="activeFilter = activeFilter === 'shadow' ? 'all' : 'shadow'"
            >
                shadowed
            </button>
            <button :class="{ 'danger-active': activeFilter === 'warn' }" @click="activeFilter = activeFilter === 'warn' ? 'all' : 'warn'">
                warnings
            </button>
            <input v-model="searchQuery" type="search" class="provide-graph__search" placeholder="search component or key…" />
        </div>

        <div class="provide-graph__split tracker-split">
            <div class="provide-graph__graph-area">
                <div class="provide-graph__legend">
                    <span class="provide-graph__legend-dot provide-graph__legend-dot--provides"></span>
                    <span>provides</span>
                    <span class="provide-graph__legend-dot provide-graph__legend-dot--both"></span>
                    <span>both</span>
                    <span class="provide-graph__legend-dot provide-graph__legend-dot--injects"></span>
                    <span>injects</span>
                    <span class="provide-graph__legend-dot provide-graph__legend-dot--missing"></span>
                    <span>missing provider</span>
                </div>
                <div v-if="layout.length" class="provide-graph__canvas-stage">
                    <div class="provide-graph__canvas-wrap" :style="{ width: `${canvasW}px`, height: `${canvasH}px` }">
                        <svg class="provide-graph__edges-svg" :width="canvasW" :height="canvasH" :viewBox="`0 0 ${canvasW} ${canvasH}`">
                            <path
                                v-for="edge in edges"
                                :key="edge.id"
                                :d="`M ${edge.x1},${edge.y1} C ${edge.x1},${(edge.y1 + edge.y2) / 2} ${edge.x2},${(edge.y1 + edge.y2) / 2} ${edge.x2},${edge.y2}`"
                                class="provide-graph__edge"
                                fill="none"
                            />
                        </svg>
                        <div
                            v-for="layoutNode in layout"
                            :key="layoutNode.data.id"
                            class="provide-graph__node"
                            :class="{ 'provide-graph__node--selected': selectedNode?.id === layoutNode.data.id }"
                            :style="{
                                left: `${layoutNode.x - NODE_W / 2}px`,
                                top: `${layoutNode.y - NODE_H / 2}px`,
                                width: `${NODE_W}px`,
                                '--node-color': nodeColor(layoutNode.data),
                            }"
                            @click="selectedNode = layoutNode.data"
                        >
                            <span class="provide-graph__node-dot" :style="{ background: nodeColor(layoutNode.data) }"></span>
                            <span class="mono provide-graph__node-label">{{ layoutNode.data.label }}</span>
                            <span v-if="layoutNode.data.provides.length" class="badge badge-ok badge-xs">
                                +{{ layoutNode.data.provides.length }}
                            </span>
                            <span v-if="layoutNode.data.injects.some((entry) => !entry.ok)" class="badge badge-err badge-xs">!</span>
                        </div>
                    </div>
                </div>
                <div v-else class="provide-graph__graph-empty">
                    {{ connected ? 'No components match the current provide/inject filter.' : 'Waiting for connection to the Nuxt app…' }}
                </div>
            </div>

            <div v-if="selectedNode" class="tracker-resize-handle" @mousedown="onHandleMouseDown" />

            <div v-if="selectedNode" class="provide-graph__detail tracker-detail-panel" :style="{ width: detailWidth + 'px' }">
                <div class="provide-graph__detail-header">
                    <span class="provide-graph__detail-title mono bold">{{ selectedNode.label }}</span>
                    <button
                        v-if="selectedNode.componentFile && selectedNode.componentFile !== 'unknown'"
                        class="jump-btn"
                        title="Open in editor"
                        @click="openInEditor(selectedNode.componentFile)"
                    >
                        open ↗
                    </button>
                    <button @click="selectedNode = null">×</button>
                </div>

                <div v-if="selectedNode.provides.length" class="detail-section">
                    <div class="tracker-section-label provide-graph__section-label">provides ({{ selectedNode.provides.length }})</div>
                    <div class="detail-list">
                        <div
                            v-for="(entry, index) in selectedNode.provides"
                            :key="provideValueId(selectedNode.id, entry.key, index)"
                            class="provide-row"
                        >
                            <div class="row-main">
                                <span class="mono text-sm row-key">{{ entry.key }}</span>
                                <span class="mono text-sm muted row-value-preview" :title="entry.val">{{ entry.val }}</span>
                                <span class="badge scope-badge" :class="`scope-${entry.scope}`">{{ entry.scope }}</span>
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
                            <!-- Shadowing warning -->
                            <div v-if="entry.isShadowing" class="row-warning">shadows a parent provide with the same key</div>
                            <!-- Consumer list -->
                            <div v-if="entry.consumerNames.length" class="row-consumers">
                                <span class="muted text-sm">used by:</span>
                                <span v-for="name in entry.consumerNames" :key="name" class="consumer-chip mono">{{ name }}</span>
                                <span v-if="!entry.consumerNames.length" class="muted text-sm">no consumers</span>
                            </div>
                            <div v-else class="provide-graph__compact-muted muted text-sm">no consumers detected</div>
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
                    <div class="tracker-section-label provide-graph__section-label">injects ({{ selectedNode.injects.length }})</div>
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
                            <span class="mono text-sm row-from" :class="entry.fromName ? '' : 'muted'" :title="entry.from ?? 'undefined'">
                                {{ entry.fromName ?? entry.from ?? 'undefined' }}
                            </span>
                        </div>
                    </div>
                </div>

                <div v-if="!selectedNode.provides.length && !selectedNode.injects.length" class="provide-graph__empty-detail muted text-sm">
                    no provide/inject in this component
                </div>
            </div>
            <div v-else class="tracker-detail-empty">
                {{ connected ? 'Click a node to inspect.' : 'Waiting for connection to the Nuxt app…' }}
            </div>
        </div>
    </div>
</template>

<style scoped>
.provide-graph__toolbar-spacer {
    margin-left: auto;
}

.provide-graph__search {
    max-width: 200px;
}

.provide-graph__graph-area {
    flex: 1;
    overflow: auto;
    border: var(--tracker-border-width) solid var(--border);
    border-radius: var(--radius-lg);
    padding: var(--tracker-space-3);
    background: var(--bg3);
}

.provide-graph__legend {
    display: flex;
    align-items: center;
    gap: var(--tracker-space-3);
    font-size: var(--tracker-font-size-sm);
    color: var(--text2);
    margin-bottom: var(--tracker-space-3);
}

.provide-graph__canvas-stage {
    display: flex;
    justify-content: center;
    align-items: flex-start;
    min-width: 100%;
}

.provide-graph__legend-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    display: inline-block;
    margin-right: 2px;
}

.provide-graph__legend-dot--provides {
    background: var(--teal);
}

.provide-graph__legend-dot--both {
    background: var(--blue);
}

.provide-graph__legend-dot--injects {
    background: var(--text3);
}

.provide-graph__legend-dot--missing {
    background: var(--red);
}

.provide-graph__canvas-wrap {
    position: relative;
}

.provide-graph__edges-svg {
    position: absolute;
    top: 0;
    left: 0;
    pointer-events: none;
}

.provide-graph__edge {
    stroke: var(--border);
    stroke-width: 1.5;
}

.provide-graph__node {
    position: absolute;
    display: flex;
    align-items: center;
    gap: 7px;
    padding: 0 10px;
    height: 32px;
    border-radius: var(--radius);
    border: var(--tracker-border-width) solid var(--border);
    background: var(--bg3);
    cursor: pointer;
    transition:
        border-color var(--tracker-transition-fast),
        background var(--tracker-transition-fast);
    overflow: hidden;
    box-sizing: border-box;
    white-space: nowrap;
}

.provide-graph__node:hover {
    border-color: var(--text3);
}

.provide-graph__node--selected {
    border-color: var(--node-color);
    background: color-mix(in srgb, var(--node-color) 8%, transparent);
}

.provide-graph__node-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    flex-shrink: 0;
}

.provide-graph__node-label {
    font-size: var(--tracker-font-size-sm);
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
}

.badge-xs {
    font-size: 9px;
    padding: 1px 4px;
}

.provide-graph__detail {
    min-height: 0;
    gap: var(--tracker-space-1);
}

.provide-graph__graph-empty {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 180px;
    color: var(--text3);
    font-size: var(--tracker-font-size-md);
}

.provide-graph__detail-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: var(--tracker-gap-toolbar);
}

.provide-graph__detail-title {
    font-size: var(--tracker-font-size-md);
}

.provide-graph__section-label {
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
    padding-right: 2px;
}

.provide-row {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 5px 8px;
    background: var(--bg2);
    border-radius: var(--radius);
    margin-bottom: 3px;
}

.row-warning {
    font-size: var(--tracker-font-size-sm);
    color: var(--amber);
    padding: 2px 0;
}

.provide-graph__compact-muted {
    padding: 2px 0;
    font-size: var(--tracker-font-size-sm);
}

.provide-graph__empty-detail {
    margin-top: var(--tracker-space-2);
}

.row-consumers {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px;
    padding: 2px 0;
}

.consumer-chip {
    font-size: 10px;
    padding: 1px 6px;
    border-radius: 4px;
    background: color-mix(in srgb, var(--blue) 10%, var(--bg3));
    border: 0.5px solid color-mix(in srgb, var(--blue) 30%, var(--border));
    color: var(--text2);
}

.scope-badge {
    font-size: 10px;
    padding: 1px 6px;
    border-radius: 4px;
}

.scope-global {
    background: color-mix(in srgb, var(--amber) 15%, transparent);
    border: 0.5px solid color-mix(in srgb, var(--amber) 40%, var(--border));
    color: color-mix(in srgb, var(--amber) 80%, var(--text));
}

.scope-layout {
    background: color-mix(in srgb, var(--purple) 15%, transparent);
    border: 0.5px solid color-mix(in srgb, var(--purple) 40%, var(--border));
    color: color-mix(in srgb, var(--purple) 80%, var(--text));
}

.scope-component {
    background: var(--bg3);
    border: 0.5px solid var(--border);
    color: var(--text3);
}

.row-main {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 4px 8px;
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
    overflow-wrap: break-word;
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
