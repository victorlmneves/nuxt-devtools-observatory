<template>
    <div class="view">
        <!-- Controls -->
        <div class="controls">
            <div class="mode-group">
                <button :class="{ active: mode === 'count' }" @click="mode = 'count'">render count</button>
                <button :class="{ active: mode === 'time' }" @click="mode = 'time'">render time</button>
            </div>
            <div class="threshold-group">
                <span class="muted text-sm">threshold</span>
                <input type="range" min="1" max="30" step="1" v-model.number="threshold" style="width: 90px" />
                <span class="mono text-sm">{{ threshold }}+</span>
            </div>
            <button :class="{ active: hotOnly }" @click="hotOnly = !hotOnly">hot only</button>
            <button :class="{ active: frozen }" @click="toggleFreeze" style="margin-left: auto">
                {{ frozen ? 'unfreeze' : 'freeze snapshot' }}
            </button>
        </div>

        <!-- Stats -->
        <div class="stats-row">
            <div class="stat-card">
                <div class="stat-label">components</div>
                <div class="stat-val">{{ allComponents.length }}</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">total renders</div>
                <div class="stat-val">{{ totalRenders }}</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">hot</div>
                <div class="stat-val" style="color: var(--red)">{{ hotCount }}</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">avg time</div>
                <div class="stat-val">{{ avgTime }}ms</div>
            </div>
        </div>

        <div class="split">
            <!-- Page mockup -->
            <div class="page-frame">
                <div class="legend">
                    <div class="swatch-row">
                        <span class="swatch" style="background: #eaf3de"></span>
                        <span class="swatch" style="background: #97c459"></span>
                        <span class="swatch" style="background: #ef9f27"></span>
                        <span class="swatch" style="background: #e24b4a"></span>
                    </div>
                    <span class="muted text-sm">cool → hot</span>
                </div>
                <ComponentBlock
                    v-for="node in rootNodes"
                    :key="node.id"
                    :node="node"
                    :mode="mode"
                    :threshold="threshold"
                    :hot-only="hotOnly"
                    :selected="selected?.id"
                    @select="selected = $event"
                />
            </div>

            <!-- Detail panel -->
            <div class="sidebar">
                <template v-if="selected">
                    <div class="detail-header">
                        <span class="mono bold" style="font-size: 12px">{{ selected.label }}</span>
                        <button @click="selected = null">×</button>
                    </div>

                    <div class="meta-grid">
                        <span class="muted text-sm">renders</span>
                        <span class="mono text-sm">{{ selected.renders }}</span>
                        <span class="muted text-sm">avg time</span>
                        <span class="mono text-sm">{{ selected.avgMs.toFixed(1) }}ms</span>
                        <span class="muted text-sm">hot?</span>
                        <span class="text-sm" :style="{ color: isHot(selected) ? 'var(--red)' : 'var(--teal)' }">
                            {{ isHot(selected) ? 'yes' : 'no' }}
                        </span>
                        <span class="muted text-sm">file</span>
                        <span class="mono text-sm muted">{{ selected.file }}</span>
                    </div>

                    <div class="section-label">triggers</div>
                    <div v-for="t in selected.triggers" :key="t" class="trigger-item mono text-sm">{{ t }}</div>
                    <div v-if="!selected.triggers.length" class="muted text-sm">no triggers recorded</div>
                </template>
                <div v-else class="detail-empty">click a component to inspect</div>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref, computed, defineComponent, h, onUnmounted } from 'vue'

interface ComponentNode {
    id: string
    label: string
    file: string
    renders: number
    avgMs: number
    triggers: string[]
    children: ComponentNode[]
}

// ComponentBlock — recursive inline component
const ComponentBlock = defineComponent({
    name: 'ComponentBlock',
    props: {
        node: Object as () => ComponentNode,
        mode: String,
        threshold: Number,
        hotOnly: Boolean,
        selected: String,
    },
    emits: ['select'],
    setup(props, { emit }) {
        function getVal(n: ComponentNode) {
            return props.mode === 'count' ? n.renders : n.avgMs
        }
        function getMax(): number {
            let max = 1
            function walk(ns: ComponentNode[]) {
                ns.forEach((n) => {
                    const v = getVal(n)
                    if (v > max) max = v
                    walk(n.children)
                })
            }
            // Walk from root — approximate with a fixed reference
            return Math.max(max, props.mode === 'count' ? 40 : 20)
        }
        function heatColor(val: number, max: number) {
            const r = Math.min(val / max, 1)
            if (r < 0.25) return { bg: '#EAF3DE', text: '#27500A', border: '#97C459' }
            if (r < 0.55) return { bg: '#FAEEDA', text: '#633806', border: '#EF9F27' }
            if (r < 0.8) return { bg: '#FAECE7', text: '#712B13', border: '#D85A30' }
            return { bg: '#FCEBEB', text: '#791F1F', border: '#E24B4A' }
        }
        function isHot(n: ComponentNode) {
            return (props.mode === 'count' ? n.renders : n.avgMs) >= props.threshold!
        }

        return () => {
            const n = props.node!
            if (props.hotOnly && !isHot(n) && !n.children.some((c) => (props.mode === 'count' ? c.renders : c.avgMs) >= props.threshold!))
                return null

            const max = getMax()
            const val = getVal(n)
            const col = heatColor(val, max)
            const isSel = props.selected === n.id
            const unit = props.mode === 'count' ? 'renders' : 'ms avg'
            const valStr = props.mode === 'count' ? String(val) : val.toFixed(1) + 'ms'

            return h(
                'div',
                {
                    style: {
                        background: col.bg,
                        border: isSel ? `2px solid ${col.border}` : `1px solid ${col.border}`,
                        borderRadius: '6px',
                        padding: '6px 9px',
                        marginBottom: '5px',
                        cursor: 'pointer',
                    },
                    onClick: () => emit('select', n),
                },
                [
                    h('div', { style: { display: 'flex', alignItems: 'center', gap: '6px' } }, [
                        h('span', { style: { fontFamily: 'var(--mono)', fontSize: '11px', fontWeight: '500', color: col.text } }, n.label),
                        h(
                            'span',
                            { style: { fontFamily: 'var(--mono)', fontSize: '10px', color: col.text, opacity: '0.7', marginLeft: 'auto' } },
                            `${valStr} ${unit}`
                        ),
                    ]),
                    n.children.length
                        ? h(
                              'div',
                              {
                                  style: {
                                      marginLeft: '10px',
                                      borderLeft: `1.5px solid ${col.border}40`,
                                      paddingLeft: '8px',
                                      marginTop: '5px',
                                  },
                              },
                              n.children.map((child) =>
                                  h(ComponentBlock, {
                                      node: child,
                                      mode: props.mode,
                                      threshold: props.threshold,
                                      hotOnly: props.hotOnly,
                                      selected: props.selected,
                                      onSelect: (v: ComponentNode) => emit('select', v),
                                  })
                              )
                          )
                        : null,
                ]
            )
        }
    },
})

// Mock data
const baseNodes = ref<ComponentNode[]>([
    {
        id: 'NavBar',
        label: 'NavBar.vue',
        file: 'components/NavBar.vue',
        renders: 3,
        avgMs: 1.2,
        triggers: ['props.user changed'],
        children: [],
    },
    {
        id: 'Sidebar',
        label: 'Sidebar.vue',
        file: 'components/Sidebar.vue',
        renders: 2,
        avgMs: 0.8,
        triggers: ['parent re-render'],
        children: [],
    },
    {
        id: 'ProductGrid',
        label: 'ProductGrid.vue',
        file: 'components/ProductGrid.vue',
        renders: 18,
        avgMs: 14.3,
        triggers: ['store: products updated', 'props.filter changed', 'parent re-render (×16)'],
        children: [
            {
                id: 'ProductCard',
                label: 'ProductCard.vue ×12',
                file: 'components/ProductCard.vue',
                renders: 24,
                avgMs: 3.1,
                triggers: ['parent re-render (×24)'],
                children: [],
            },
            {
                id: 'PriceTag',
                label: 'PriceTag.vue ×12',
                file: 'components/PriceTag.vue',
                renders: 36,
                avgMs: 0.4,
                triggers: ['props.price changed (×36)'],
                children: [],
            },
        ],
    },
    {
        id: 'CartSummary',
        label: 'CartSummary.vue',
        file: 'components/CartSummary.vue',
        renders: 9,
        avgMs: 5.7,
        triggers: ['store: cart updated (×9)'],
        children: [
            {
                id: 'CartItem',
                label: 'CartItem.vue ×3',
                file: 'components/CartItem.vue',
                renders: 12,
                avgMs: 1.8,
                triggers: ['parent re-render (×12)'],
                children: [],
            },
        ],
    },
    {
        id: 'FilterBar',
        label: 'FilterBar.vue',
        file: 'components/FilterBar.vue',
        renders: 7,
        avgMs: 2.1,
        triggers: ['store: filters changed (×7)'],
        children: [],
    },
    { id: 'Footer', label: 'Footer.vue', file: 'components/Footer.vue', renders: 1, avgMs: 0.3, triggers: ['initial mount'], children: [] },
])

const mode = ref<'count' | 'time'>('count')
const threshold = ref(5)
const hotOnly = ref(false)
const frozen = ref(false)
const selected = ref<ComponentNode | null>(null)
let liveInterval: ReturnType<typeof setInterval> | null = null

const rootNodes = computed(() => baseNodes.value)

const allComponents = computed(() => {
    const all: ComponentNode[] = []
    function collect(ns: ComponentNode[]) {
        ns.forEach((n) => {
            all.push(n)
            collect(n.children)
        })
    }
    collect(baseNodes.value)
    return all
})

const totalRenders = computed(() => allComponents.value.reduce((a, n) => a + n.renders, 0))
const hotCount = computed(() => allComponents.value.filter((n) => isHot(n)).length)
const avgTime = computed(() => {
    const comps = allComponents.value.filter((n) => n.avgMs > 0)
    if (!comps.length) return '0.0'
    return (comps.reduce((a, n) => a + n.avgMs, 0) / comps.length).toFixed(1)
})

function isHot(n: ComponentNode) {
    return (mode.value === 'count' ? n.renders : n.avgMs) >= threshold.value
}

function startLive() {
    liveInterval = setInterval(() => {
        if (frozen.value) return
        allComponents.value.forEach((n) => {
            if (Math.random() < 0.3) n.renders += Math.floor(Math.random() * 3) + 1
        })
    }, 1800)
}

function toggleFreeze() {
    frozen.value = !frozen.value
}

startLive()
onUnmounted(() => {
    if (liveInterval) clearInterval(liveInterval)
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

.controls {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
    flex-wrap: wrap;
}

.mode-group {
    display: flex;
    gap: 2px;
}

.threshold-group {
    display: flex;
    align-items: center;
    gap: 6px;
}

.stats-row {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 8px;
    flex-shrink: 0;
}

.split {
    display: flex;
    gap: 12px;
    flex: 1;
    overflow: hidden;
    min-height: 0;
}

.page-frame {
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
    gap: 8px;
    margin-bottom: 10px;
}

.swatch-row {
    display: flex;
    gap: 2px;
}

.swatch {
    width: 16px;
    height: 8px;
    border-radius: 2px;
}

.sidebar {
    width: 260px;
    flex-shrink: 0;
    overflow: auto;
    border: 0.5px solid var(--border);
    border-radius: var(--radius-lg);
    padding: 12px;
    background: var(--bg3);
    display: flex;
    flex-direction: column;
    gap: 6px;
}

.detail-empty {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: var(--text3);
    font-size: 12px;
}

.detail-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
}

.meta-grid {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 4px 12px;
}

.section-label {
    font-size: 10px;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.4px;
    color: var(--text3);
    margin-top: 8px;
    margin-bottom: 4px;
}

.trigger-item {
    background: var(--bg2);
    border-radius: var(--radius);
    padding: 4px 8px;
    margin-bottom: 3px;
    color: var(--text2);
}
</style>
