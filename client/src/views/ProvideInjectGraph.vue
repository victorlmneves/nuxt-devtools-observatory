<template>
    <div class="view">
        <div class="toolbar">
            <button :class="{ active: filter === 'all' }" @click="filter = 'all'">all keys</button>
            <button v-for="k in allKeys" :key="k" :class="{ active: filter === k }" @click="filter = k" style="font-family: var(--mono)">
                {{ k }}
            </button>
            <button :class="{ 'danger-active': filter === 'warn' }" @click="filter = 'warn'" style="margin-left: auto">
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
                <div class="tree">
                    <TreeNode
                        v-for="node in rootNodes"
                        :key="node.id"
                        :node="node"
                        :selected="selected?.id"
                        :filter="filter"
                        @select="selected = $event"
                    />
                </div>
            </div>

            <!-- Detail -->
            <div v-if="selected" class="detail-panel">
                <div class="detail-header">
                    <span class="mono bold" style="font-size: 12px">{{ selected.label }}</span>
                    <button @click="selected = null">×</button>
                </div>

                <div v-if="selected.provides.length">
                    <div class="section-label">provides ({{ selected.provides.length }})</div>
                    <div v-for="p in selected.provides" :key="p.key" class="provide-row">
                        <span class="mono text-sm" style="min-width: 100px; color: var(--text2)">{{ p.key }}</span>
                        <span class="mono text-sm muted" style="flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap">
                            {{ p.val }}
                        </span>
                        <span class="badge" :class="p.reactive ? 'badge-ok' : 'badge-gray'">{{ p.reactive ? 'reactive' : 'static' }}</span>
                    </div>
                </div>

                <div v-if="selected.injects.length" :style="{ marginTop: selected.provides.length ? '10px' : '0' }">
                    <div class="section-label">injects ({{ selected.injects.length }})</div>
                    <div v-for="inj in selected.injects" :key="inj.key" class="inject-row" :class="{ 'inject-miss': !inj.ok }">
                        <span class="mono text-sm" style="min-width: 100px">{{ inj.key }}</span>
                        <span v-if="inj.ok" class="badge badge-ok">resolved</span>
                        <span v-else class="badge badge-err">no provider</span>
                        <span class="mono muted text-sm" style="margin-left: auto">{{ inj.from ?? 'undefined' }}</span>
                    </div>
                </div>

                <div v-if="!selected.provides.length && !selected.injects.length" class="muted text-sm" style="margin-top: 8px">
                    no provide/inject in this component
                </div>
            </div>
            <div v-else class="detail-empty">click a node to inspect</div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref, computed, defineComponent, h } from 'vue'

interface TreeNodeData {
    id: string
    label: string
    type: 'provider' | 'consumer' | 'both' | 'error'
    provides: Array<{ key: string; val: string; reactive: boolean }>
    injects: Array<{ key: string; from: string | null; ok: boolean }>
    children: TreeNodeData[]
}

// TreeNode recursive component
const TreeNode = defineComponent({
    name: 'TreeNode',
    props: { node: Object as () => TreeNodeData, selected: String, filter: String },
    emits: ['select'],
    setup(props, { emit }) {
        return () => {
            const n = props.node!
            const hasError = n.injects.some((i) => !i.ok)
            const matchesFilter =
                props.filter === 'all' || props.filter === 'warn'
                    ? props.filter === 'warn'
                        ? hasError
                        : true
                    : n.provides.some((p) => p.key === props.filter) || n.injects.some((i) => i.key === props.filter)

            const color = hasError
                ? 'var(--red)'
                : n.type === 'both'
                  ? 'var(--blue)'
                  : n.type === 'provider'
                    ? 'var(--teal)'
                    : 'var(--text3)'
            const isSel = props.selected === n.id

            return h('div', { class: 'tree-node-wrap' }, [
                h(
                    'div',
                    {
                        class: ['tree-node', isSel && 'selected'],
                        style: {
                            opacity: matchesFilter ? '1' : '0.25',
                            borderColor: isSel ? color : 'var(--border)',
                            background: isSel ? color + '14' : 'var(--bg3)',
                        },
                        onClick: () => emit('select', n),
                    },
                    [
                        h('span', { class: 'node-dot', style: { background: color } }),
                        h('span', { class: 'mono', style: { fontSize: '11px', fontWeight: isSel ? '500' : '400' } }, n.label),
                        n.provides.length
                            ? h(
                                  'span',
                                  { class: 'badge badge-ok', style: { fontSize: '9px', marginLeft: 'auto' } },
                                  '+' + n.provides.length
                              )
                            : null,
                        hasError
                            ? h(
                                  'span',
                                  { class: 'badge badge-err', style: { fontSize: '9px', marginLeft: n.provides.length ? '4px' : 'auto' } },
                                  '!'
                              )
                            : null,
                    ]
                ),
                n.children.length
                    ? h(
                          'div',
                          { class: 'tree-children' },
                          n.children.map((child) =>
                              h(TreeNode, {
                                  node: child,
                                  selected: props.selected,
                                  filter: props.filter,
                                  onSelect: (v: TreeNodeData) => emit('select', v),
                              })
                          )
                      )
                    : null,
            ])
        }
    },
})

const nodes = ref<TreeNodeData[]>([
    {
        id: 'App',
        label: 'App.vue',
        type: 'provider',
        provides: [
            { key: 'authContext', val: '{ user, logout }', reactive: true },
            { key: 'theme', val: '"dark"', reactive: false },
        ],
        injects: [],
        children: [
            {
                id: 'Layout',
                label: 'Layout.vue',
                type: 'both',
                provides: [{ key: 'routerState', val: 'useRoute()', reactive: true }],
                injects: [{ key: 'theme', from: 'App.vue', ok: true }],
                children: [
                    {
                        id: 'Sidebar',
                        label: 'Sidebar.vue',
                        type: 'consumer',
                        provides: [],
                        injects: [
                            { key: 'authContext', from: 'App.vue', ok: true },
                            { key: 'theme', from: 'App.vue', ok: true },
                        ],
                        children: [],
                    },
                    {
                        id: 'NavBar',
                        label: 'NavBar.vue',
                        type: 'consumer',
                        provides: [],
                        injects: [
                            { key: 'authContext', from: 'App.vue', ok: true },
                            { key: 'routerState', from: 'Layout.vue', ok: true },
                        ],
                        children: [],
                    },
                    {
                        id: 'ProductList',
                        label: 'ProductList.vue',
                        type: 'error',
                        provides: [],
                        injects: [
                            { key: 'cartContext', from: null, ok: false },
                            { key: 'theme', from: 'App.vue', ok: true },
                        ],
                        children: [
                            {
                                id: 'ProductCard',
                                label: 'ProductCard.vue',
                                type: 'error',
                                provides: [],
                                injects: [{ key: 'cartContext', from: null, ok: false }],
                                children: [],
                            },
                        ],
                    },
                    {
                        id: 'UserMenu',
                        label: 'UserMenu.vue',
                        type: 'consumer',
                        provides: [],
                        injects: [{ key: 'authContext', from: 'App.vue', ok: true }],
                        children: [],
                    },
                ],
            },
        ],
    },
])

const filter = ref('all')
const selected = ref<TreeNodeData | null>(null)
const rootNodes = computed(() => nodes.value)

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
</script>

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

.tree {
    display: flex;
    flex-direction: column;
    gap: 4px;
}

.tree-node-wrap {
    display: flex;
    flex-direction: column;
}

.tree-node {
    display: flex;
    align-items: center;
    gap: 7px;
    padding: 6px 10px;
    border-radius: var(--radius);
    border: 0.5px solid var(--border);
    cursor: pointer;
    transition: border-color 0.12s;
}

.tree-node:hover {
    border-color: var(--text3);
}

.tree-node.selected {
}

.tree-children {
    margin-left: 18px;
    border-left: 1.5px solid var(--border);
    padding-left: 10px;
    margin-top: 4px;
    display: flex;
    flex-direction: column;
    gap: 4px;
}

.node-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    flex-shrink: 0;
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
