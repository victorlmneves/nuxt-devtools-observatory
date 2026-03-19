<script setup lang="ts">
import { ref, computed } from 'vue'
import { useObservatoryData } from '../stores/observatory'

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

function nodeColor(n: TreeNodeData): string {
    if (n.injects.some((i) => !i.ok)) {
        return 'var(--red)'
    }

    if (n.type === 'both') {
        return 'var(--blue)'
    }

    if (n.type === 'provider') {
        return 'var(--teal)'
    }

    return 'var(--text3)'
}

function matchesFilter(n: TreeNodeData, filter: string): boolean {
    if (filter === 'all') {
        return true
    }

    if (filter === 'warn') {
        return n.injects.some((i) => !i.ok)
    }

    return n.provides.some((p) => p.key === filter) || n.injects.some((i) => i.key === filter)
}

function countLeaves(n: TreeNodeData): number {
    return n.children.length === 0 ? 1 : n.children.reduce((s, c) => s + countLeaves(c), 0)
}

const { provideInject } = useObservatoryData()
const nodes = provideInject

const activeFilter = ref('all')
const selectedNode = ref<TreeNodeData | null>(null)

const allKeys = computed(() => {
    const keys = new Set<string>()

    function collect(ns: TreeNodeData[]) {
        ns.forEach((n) => {
            n.provides.forEach((p) => keys.add(p.key))
            n.injects.forEach((i) => keys.add(i.key))
            collect(n.children)
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
        const slotW = leaves * (NODE_W + H_GAP) - H_GAP

        flat.push({
            data: node,
            parentId,
            x: Math.round(slotLeft + slotW / 2),
            y: Math.round(pad + depth * (NODE_H + V_GAP) + NODE_H / 2),
        })

        let childLeft = slotLeft

        for (const child of node.children) {
            const cl = countLeaves(child)
            place(child, depth + 1, childLeft, node.id)
            childLeft += cl * (NODE_W + H_GAP)
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

const canvasW = computed(() => layout.value.reduce((m, n) => Math.max(m, n.x + NODE_W / 2 + 20), 400))

const canvasH = computed(() => layout.value.reduce((m, n) => Math.max(m, n.y + NODE_H / 2 + 20), 200))

const edges = computed<Edge[]>(() => {
    const byId = new Map(layout.value.map((n) => [n.data.id, n]))

    return layout.value
        .filter((n) => n.parentId !== null)
        .map((n) => {
            const p = byId.get(n.parentId!)!
            return {
                id: `${p.data.id}--${n.data.id}`,
                x1: p.x,
                y1: p.y + NODE_H / 2,
                x2: n.x,
                y2: n.y - NODE_H / 2,
            }
        })
})
</script>

<template>
    <div class="view">
        <div class="toolbar">
            <button :class="{ active: activeFilter === 'all' }" @click="activeFilter = 'all'">all keys</button>
            <button
                v-for="k in allKeys"
                :key="k"
                style="font-family: var(--mono)"
                :class="{ active: activeFilter === k }"
                @click="activeFilter = k"
            >
                {{ k }}
            </button>
            <button style="margin-left: auto" :class="{ 'danger-active': activeFilter === 'warn' }" @click="activeFilter = 'warn'">
                warnings only
            </button>
        </div>

        <div class="split">
            <!-- Graph -->
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
                <div class="canvas-wrap" :style="{ width: canvasW + 'px', height: canvasH + 'px' }">
                    <svg class="edges-svg" :width="canvasW" :height="canvasH" :viewBox="`0 0 ${canvasW} ${canvasH}`">
                        <path
                            v-for="e in edges"
                            :key="e.id"
                            :d="`M ${e.x1},${e.y1} C ${e.x1},${(e.y1 + e.y2) / 2} ${e.x2},${(e.y1 + e.y2) / 2} ${e.x2},${e.y2}`"
                            class="edge"
                            fill="none"
                        />
                    </svg>
                    <div
                        v-for="ln in layout"
                        :key="ln.data.id"
                        class="graph-node"
                        :class="{
                            'is-selected': selectedNode?.id === ln.data.id,
                            'is-dimmed': !matchesFilter(ln.data, activeFilter),
                        }"
                        :style="{
                            left: ln.x - NODE_W / 2 + 'px',
                            top: ln.y - NODE_H / 2 + 'px',
                            width: NODE_W + 'px',
                            '--node-color': nodeColor(ln.data),
                        }"
                        @click="selectedNode = ln.data"
                    >
                        <span class="node-dot" :style="{ background: nodeColor(ln.data) }"></span>
                        <span class="mono node-label">{{ ln.data.label }}</span>
                        <span v-if="ln.data.provides.length" class="badge badge-ok badge-xs">+{{ ln.data.provides.length }}</span>
                        <span v-if="ln.data.injects.some((i) => !i.ok)" class="badge badge-err badge-xs">!</span>
                    </div>
                </div>
            </div>

            <!-- Detail -->
            <div v-if="selectedNode" class="detail-panel">
                <div class="detail-header">
                    <span class="mono bold" style="font-size: 12px">{{ selectedNode.label }}</span>
                    <button @click="selectedNode = null">×</button>
                </div>

                <div v-if="selectedNode.provides.length">
                    <div class="section-label">provides ({{ selectedNode.provides.length }})</div>
                    <div v-for="p in selectedNode.provides" :key="p.key" class="provide-row">
                        <span class="mono text-sm" style="min-width: 100px; color: var(--text2)">{{ p.key }}</span>
                        <span class="mono text-sm muted" style="flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap">
                            {{ p.val }}
                        </span>
                        <span class="badge" :class="p.reactive ? 'badge-ok' : 'badge-gray'">{{ p.reactive ? 'reactive' : 'static' }}</span>
                    </div>
                </div>

                <div v-if="selectedNode.injects.length" :style="{ marginTop: selectedNode.provides.length ? '10px' : '0' }">
                    <div class="section-label">injects ({{ selectedNode.injects.length }})</div>
                    <div v-for="inj in selectedNode.injects" :key="inj.key" class="inject-row" :class="{ 'inject-miss': !inj.ok }">
                        <span class="mono text-sm" style="min-width: 100px">{{ inj.key }}</span>
                        <span v-if="inj.ok" class="badge badge-ok">resolved</span>
                        <span v-else class="badge badge-err">no provider</span>
                        <span class="mono muted text-sm" style="margin-left: auto">{{ inj.from ?? 'undefined' }}</span>
                    </div>
                </div>

                <div v-if="!selectedNode.provides.length && !selectedNode.injects.length" class="muted text-sm" style="margin-top: 8px">
                    no provide/inject in this component
                </div>
            </div>
            <div v-else class="detail-empty">click a node to inspect</div>
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
