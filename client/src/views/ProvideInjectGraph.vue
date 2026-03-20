<script setup lang="ts">
import { ref, computed } from 'vue'
import { useObservatoryData, type InjectEntry, type ProvideEntry } from '../stores/observatory'

interface TreeNodeData {
    id: string
    label: string
    type: 'provider' | 'consumer' | 'both' | 'error'
    provides: Array<{ key: string; val: string; reactive: boolean }>
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

function countLeaves(node: TreeNodeData): number {
    return node.children.length === 0 ? 1 : node.children.reduce((sum, child) => sum + countLeaves(child), 0)
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
            label: entry.componentFile,
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
            val: stringifyValue(entry.valueSnapshot),
            reactive: entry.isReactive,
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

const allKeys = computed(() => {
    const keys = new Set<string>()

    function collect(nodesToVisit: TreeNodeData[]) {
        nodesToVisit.forEach((node) => {
            node.provides.forEach((entry) => keys.add(entry.key))
            node.injects.forEach((entry) => keys.add(entry.key))
            collect(node.children)
        })
    }

    collect(nodes.value)

    return [...keys]
})

const layout = computed<LayoutNode[]>(() => {
    const flat: LayoutNode[] = []
    const pad = H_GAP

    function place(node: TreeNodeData, depth: number, slotLeft: number, parentId: string | null) {
        const leaves = countLeaves(node)
        const slotWidth = leaves * (NODE_W + H_GAP) - H_GAP

        flat.push({
            data: node,
            parentId,
            x: Math.round(slotLeft + slotWidth / 2),
            y: Math.round(pad + depth * (NODE_H + V_GAP) + NODE_H / 2),
        })

        let childLeft = slotLeft

        for (const child of node.children) {
            const childLeaves = countLeaves(child)
            place(child, depth + 1, childLeft, node.id)
            childLeft += childLeaves * (NODE_W + H_GAP)
        }
    }

    let left = pad

    for (const root of nodes.value) {
        const leaves = countLeaves(root)
        place(root, 0, left, null)
        left += leaves * (NODE_W + H_GAP) + H_GAP * 2
    }

    return flat
})

const canvasW = computed(() => layout.value.reduce((max, node) => Math.max(max, node.x + NODE_W / 2 + 20), 400))
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
                        :class="{
                            'is-selected': selectedNode?.id === layoutNode.data.id,
                            'is-dimmed': !matchesFilter(layoutNode.data, activeFilter),
                        }"
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
                        <span v-if="layoutNode.data.provides.length" class="badge badge-ok badge-xs">+{{ layoutNode.data.provides.length }}</span>
                        <span v-if="layoutNode.data.injects.some((entry) => !entry.ok)" class="badge badge-err badge-xs">!</span>
                    </div>
                </div>
            </div>

            <div v-if="selectedNode" class="detail-panel">
                <div class="detail-header">
                    <span class="mono bold" style="font-size: 12px">{{ selectedNode.label }}</span>
                    <button @click="selectedNode = null">×</button>
                </div>

                <div v-if="selectedNode.provides.length">
                    <div class="section-label">provides ({{ selectedNode.provides.length }})</div>
                    <div v-for="entry in selectedNode.provides" :key="entry.key" class="provide-row">
                        <span class="mono text-sm" style="min-width: 100px; color: var(--text2)">{{ entry.key }}</span>
                        <span class="mono text-sm muted" style="flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap">
                            {{ entry.val }}
                        </span>
                        <span class="badge" :class="entry.reactive ? 'badge-ok' : 'badge-gray'">
                            {{ entry.reactive ? 'reactive' : 'static' }}
                        </span>
                    </div>
                </div>

                <div v-if="selectedNode.injects.length" :style="{ marginTop: selectedNode.provides.length ? '10px' : '0' }">
                    <div class="section-label">injects ({{ selectedNode.injects.length }})</div>
                    <div v-for="entry in selectedNode.injects" :key="entry.key" class="inject-row" :class="{ 'inject-miss': !entry.ok }">
                        <span class="mono text-sm" style="min-width: 100px">{{ entry.key }}</span>
                        <span v-if="entry.ok" class="badge badge-ok">resolved</span>
                        <span v-else class="badge badge-err">no provider</span>
                        <span class="mono muted text-sm" style="margin-left: auto">{{ entry.from ?? 'undefined' }}</span>
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

.graph-node.is-dimmed {
    opacity: 0.2;
    pointer-events: none;
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

.provide-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 5px 8px;
    background: var(--bg2);
    border-radius: var(--radius);
    margin-bottom: 3px;
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

.inject-miss {
    background: rgb(226 75 74 / 8%);
}
</style>
