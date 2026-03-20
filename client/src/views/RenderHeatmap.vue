<script setup lang="ts">
import { ref, computed, defineComponent, h, type VNode } from 'vue'
import { useObservatoryData, type RenderEntry } from '../stores/observatory'

interface ComponentNode {
    id: string
    label: string
    file: string
    renders: number
    avgMs: number
    triggers: string[]
    children: ComponentNode[]
}

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
    setup(props, { emit }): () => VNode | null {
        function getVal(node: ComponentNode) {
            return props.mode === 'count' ? node.renders : node.avgMs
        }

        function getMax(): number {
            let max = 1

            function walk(nodes: ComponentNode[]) {
                nodes.forEach((node) => {
                    const value = getVal(node)

                    if (value > max) {
                        max = value
                    }

                    walk(node.children)
                })
            }

            walk([props.node!])

            return Math.max(max, props.mode === 'count' ? 40 : 20)
        }

        function heatColor(value: number, max: number) {
            const ratio = Math.min(value / max, 1)

            if (ratio < 0.25) {
                return { bg: '#EAF3DE', text: '#27500A', border: '#97C459' }
            }

            if (ratio < 0.55) {
                return { bg: '#FAEEDA', text: '#633806', border: '#EF9F27' }
            }

            if (ratio < 0.8) {
                return { bg: '#FAECE7', text: '#712B13', border: '#D85A30' }
            }

            return { bg: '#FCEBEB', text: '#791F1F', border: '#E24B4A' }
        }

        function isHot(node: ComponentNode) {
            return (props.mode === 'count' ? node.renders : node.avgMs) >= props.threshold!
        }

        return () => {
            const node = props.node!

            if (props.hotOnly && !isHot(node) && !node.children.some((child) => (props.mode === 'count' ? child.renders : child.avgMs) >= props.threshold!)) {
                return null
            }

            const max = getMax()
            const value = getVal(node)
            const colors = heatColor(value, max)
            const isSelected = props.selected === node.id
            const unit = props.mode === 'count' ? 'renders' : 'ms avg'
            const valueLabel = props.mode === 'count' ? String(value) : `${value.toFixed(1)}ms`

            return h(
                'div',
                {
                    style: {
                        background: colors.bg,
                        border: isSelected ? `2px solid ${colors.border}` : `1px solid ${colors.border}`,
                        borderRadius: '6px',
                        padding: '6px 9px',
                        marginBottom: '5px',
                        cursor: 'pointer',
                    },
                    onClick: () => emit('select', node),
                },
                [
                    h('div', { style: { display: 'flex', alignItems: 'center', gap: '6px' } }, [
                        h('span', { style: { fontFamily: 'var(--mono)', fontSize: '11px', fontWeight: '500', color: colors.text } }, node.label),
                        h(
                            'span',
                            { style: { fontFamily: 'var(--mono)', fontSize: '10px', color: colors.text, opacity: '0.7', marginLeft: 'auto' } },
                            `${valueLabel} ${unit}`
                        ),
                    ]),
                    node.children.length
                        ? h(
                              'div',
                              {
                                  style: {
                                      marginLeft: '10px',
                                      borderLeft: `1.5px solid ${colors.border}40`,
                                      paddingLeft: '8px',
                                      marginTop: '5px',
                                  },
                              },
                              node.children.map((child) =>
                                  h(ComponentBlock, {
                                      node: child,
                                      mode: props.mode,
                                      threshold: props.threshold,
                                      hotOnly: props.hotOnly,
                                      selected: props.selected,
                                      onSelect: (value: ComponentNode) => emit('select', value),
                                  })
                              )
                          )
                        : null,
                ]
            )
        }
    },
})

const { renders, connected } = useObservatoryData()

const activeMode = ref<'count' | 'time'>('count')
const activeThreshold = ref(5)
const activeHotOnly = ref(false)
const frozen = ref(false)
const activeSelectedId = ref<string | null>(null)
const frozenSnapshot = ref<ComponentNode[]>([])

function formatTrigger(trigger: RenderEntry['triggers'][number]) {
    return `${trigger.type}: ${trigger.key}`
}

function buildNodes(entries: RenderEntry[]) {
    const byId = new Map<string, ComponentNode>()

    for (const entry of entries) {
        byId.set(String(entry.uid), {
            id: String(entry.uid),
            label: entry.file.split('/').pop() ?? entry.name,
            file: entry.file,
            renders: entry.renders,
            avgMs: entry.avgMs,
            triggers: entry.triggers.map(formatTrigger),
            children: [],
        })
    }

    const roots: ComponentNode[] = []

    for (const entry of entries) {
        const node = byId.get(String(entry.uid))

        if (!node) {
            continue
        }

        const parent = entry.parentUid !== undefined ? byId.get(String(entry.parentUid)) : undefined

        if (parent) {
            parent.children.push(node)
        } else {
            roots.push(node)
        }
    }

    return roots
}

const liveNodes = computed(() => buildNodes(renders.value))
const rootNodes = computed(() => (frozen.value ? frozenSnapshot.value : liveNodes.value))

const allComponents = computed(() => {
    const all: ComponentNode[] = []

    function collect(nodes: ComponentNode[]) {
        nodes.forEach((node) => {
            all.push(node)
            collect(node.children)
        })
    }

    collect(rootNodes.value)

    return all
})

const activeSelected = computed(() => allComponents.value.find((node) => node.id === activeSelectedId.value) ?? null)
const totalRenders = computed(() => allComponents.value.reduce((sum, node) => sum + node.renders, 0))
const hotCount = computed(() => allComponents.value.filter((node) => isHot(node)).length)
const avgTime = computed(() => {
    const components = allComponents.value.filter((node) => node.avgMs > 0)

    if (!components.length) {
        return '0.0'
    }

    return (components.reduce((sum, node) => sum + node.avgMs, 0) / components.length).toFixed(1)
})

function isHot(node: ComponentNode) {
    return (activeMode.value === 'count' ? node.renders : node.avgMs) >= activeThreshold.value
}

function toggleFreeze() {
    if (frozen.value) {
        frozen.value = false
        frozenSnapshot.value = []
        return
    }

    frozenSnapshot.value = JSON.parse(JSON.stringify(liveNodes.value)) as ComponentNode[]
    frozen.value = true
}
</script>

<template>
    <div class="view">
        <div class="controls">
            <div class="mode-group">
                <button :class="{ active: activeMode === 'count' }" @click="activeMode = 'count'">render count</button>
                <button :class="{ active: activeMode === 'time' }" @click="activeMode = 'time'">render time</button>
            </div>
            <div class="threshold-group">
                <span class="muted text-sm">threshold</span>
                <input v-model.number="activeThreshold" type="range" min="1" max="30" step="1" style="width: 90px" />
                <span class="mono text-sm">{{ activeThreshold }}+</span>
            </div>
            <button :class="{ active: activeHotOnly }" @click="activeHotOnly = !activeHotOnly">hot only</button>
            <button :class="{ active: frozen }" style="margin-left: auto" @click="toggleFreeze">
                {{ frozen ? 'unfreeze' : 'freeze snapshot' }}
            </button>
        </div>

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
                    v-for="rootNode in rootNodes"
                    :key="rootNode.id"
                    :node="rootNode"
                    :mode="activeMode"
                    :threshold="activeThreshold"
                    :hot-only="activeHotOnly"
                    :selected="activeSelected?.id"
                    @select="activeSelectedId = $event.id"
                />
                <div v-if="!rootNodes.length" class="detail-empty" style="height: 180px; margin-top: 12px">
                    {{ connected ? 'No render activity recorded yet.' : 'Waiting for connection to the Nuxt app…' }}
                </div>
            </div>

            <div class="sidebar">
                <template v-if="activeSelected">
                    <div class="detail-header">
                        <span class="mono bold" style="font-size: 12px">{{ activeSelected.label }}</span>
                        <button @click="activeSelectedId = null">×</button>
                    </div>

                    <div class="meta-grid">
                        <span class="muted text-sm">renders</span>
                        <span class="mono text-sm">{{ activeSelected.renders }}</span>
                        <span class="muted text-sm">avg time</span>
                        <span class="mono text-sm">{{ activeSelected.avgMs.toFixed(1) }}ms</span>
                        <span class="muted text-sm">hot?</span>
                        <span class="text-sm" :style="{ color: isHot(activeSelected) ? 'var(--red)' : 'var(--teal)' }">
                            {{ isHot(activeSelected) ? 'yes' : 'no' }}
                        </span>
                        <span class="muted text-sm">file</span>
                        <span class="mono text-sm muted">{{ activeSelected.file }}</span>
                    </div>

                    <div class="section-label">triggers</div>
                    <div v-for="trigger in activeSelected.triggers" :key="trigger" class="trigger-item mono text-sm">{{ trigger }}</div>
                    <div v-if="!activeSelected.triggers.length" class="muted text-sm">no triggers recorded</div>
                </template>
                <div v-else class="detail-empty">click a component to inspect</div>
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
