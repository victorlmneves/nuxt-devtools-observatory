<script setup lang="ts">
import { computed, defineComponent, h, ref, watch, type VNode } from 'vue'
import { useObservatoryData, openInEditor as openInEditorFromStore } from '../stores/observatory'
import { useResizablePane } from '../composables/useResizablePane'
import type { RenderEntry, RenderEvent } from '../../../src/types/snapshot'

interface ComponentNode {
    id: string
    label: string
    file: string
    element?: string
    depth: number
    path: string[]
    rerenders: number
    mountCount: number
    avgMs: number
    triggers: string[]
    timeline: RenderEvent[]
    children: ComponentNode[]
    parentId?: string
    parentLabel?: string
    isPersistent: boolean
    isHydrationMount: boolean
    route: string
}

const TreeNode = defineComponent({
    name: 'TreeNode',
    props: {
        node: Object as () => ComponentNode,
        mode: String,
        threshold: Number,
        selected: String,
        expandedIds: Object as () => Set<string>,
    },
    emits: ['select', 'toggle'],
    setup(props, { emit }): () => VNode | null {
        function nodeValue(node: ComponentNode) {
            return props.mode === 'count' ? node.rerenders + node.mountCount : node.avgMs
        }

        function isHot(node: ComponentNode) {
            return nodeValue(node) >= props.threshold!
        }

        function rowClass(node: ComponentNode) {
            return {
                selected: props.selected === node.id,
                hot: isHot(node),
            }
        }

        return () => {
            const node = props.node!
            const expanded = props.expandedIds?.has(node.id) ?? false
            const canExpand = node.children.length > 0
            const metric = props.mode === 'count' ? `${node.rerenders + node.mountCount}` : `${node.avgMs.toFixed(1)}ms`
            const metricLabel = props.mode === 'count' ? 'renders' : 'avg'
            const badges = []
            const normalizedElement = node.element?.toLowerCase()

            if (node.element && node.element !== node.label && !['div', 'span', 'p'].includes(normalizedElement ?? '')) {
                badges.push(node.element)
            }

            if (node.file !== 'unknown') {
                const fileBadge =
                    node.file
                        .split('/')
                        .pop()
                        ?.replace(/\.vue$/i, '') ?? node.file

                if (fileBadge !== node.label && !badges.includes(fileBadge)) {
                    badges.push(fileBadge)
                }
            }

            return h('div', { class: 'tree-node' }, [
                h(
                    'div',
                    {
                        class: ['tree-row', rowClass(node)],
                        style: { '--tree-depth': String(node.depth) },
                        onClick: (event: MouseEvent) => {
                            event.stopPropagation()
                            emit('select', node)
                        },
                    },
                    [
                        h('span', { class: 'tree-rail', 'aria-hidden': 'true' }),
                        h(
                            'button',
                            {
                                class: ['tree-toggle', { empty: !canExpand }],
                                disabled: !canExpand,
                                onClick: (event: MouseEvent) => {
                                    event.stopPropagation()

                                    if (canExpand) {
                                        emit('toggle', node.id)
                                    }
                                },
                            },
                            canExpand ? (expanded ? '⌄' : '›') : ''
                        ),
                        h('div', { class: 'tree-copy' }, [
                            h('span', { class: 'tree-name mono', title: node.label }, node.label),
                            badges.length
                                ? h(
                                      'div',
                                      { class: 'tree-badges' },
                                      badges.slice(0, 1).map((badge) => h('span', { class: 'tree-badge mono', title: badge }, badge))
                                  )
                                : null,
                        ]),
                        h('div', { class: 'tree-metrics mono' }, [
                            node.isPersistent
                                ? h(
                                      'span',
                                      { class: 'tree-persistent-pill', title: 'Layout / persistent component — survives navigation' },
                                      'persistent'
                                  )
                                : null,
                            node.isHydrationMount
                                ? h(
                                      'span',
                                      {
                                          class: 'tree-hydration-pill',
                                          title: 'First mount was SSR hydration — not a user-triggered render',
                                      },
                                      'hydrated'
                                  )
                                : null,
                            h('span', { class: 'tree-metric-pill' }, `${metric} ${metricLabel}`),
                            node.file && node.file !== 'unknown'
                                ? h(
                                      'button',
                                      {
                                          class: 'tree-jump-btn',
                                          title: `Open ${node.file} in editor`,
                                          onClick: (e: MouseEvent) => {
                                              e.stopPropagation()
                                              openInEditor(node.file)
                                          },
                                      },
                                      '↗'
                                  )
                                : null,
                        ]),
                    ]
                ),
                expanded && canExpand
                    ? h(
                          'div',
                          { class: 'tree-children' },
                          node.children.map((child) =>
                              h(TreeNode, {
                                  node: child,
                                  mode: props.mode,
                                  threshold: props.threshold,
                                  selected: props.selected,
                                  expandedIds: props.expandedIds,
                                  onSelect: (value: ComponentNode) => emit('select', value),
                                  onToggle: (value: string) => emit('toggle', value),
                              })
                          )
                      )
                    : null,
            ])
        }
    },
})

const { renders, connected } = useObservatoryData()
const { paneWidth: detailWidth, onHandleMouseDown: onDetailHandleMouseDown } = useResizablePane(280, 'observatory:heatmap:detailWidth')

const activeMode = ref<'count' | 'time'>('count')
// Route filter — '' means show all routes
const activeRoute = ref('')
// Separate thresholds per mode so switching modes doesn't produce nonsense results.
// Count: flag components that rendered 3+ times (1 hydration mount is normal).
// Time: flag components averaging 16ms+ (one animation frame budget).
const COUNT_THRESHOLD = import.meta.env.VITE_OBSERVATORY_HEATMAP_THRESHOLD_COUNT ?? 3
const TIME_THRESHOLD = import.meta.env.VITE_OBSERVATORY_HEATMAP_THRESHOLD_TIME ?? 1600
const countThreshold = ref(Number(COUNT_THRESHOLD))
const timeThreshold = ref(Number(TIME_THRESHOLD))
// Writable computed so the threshold slider can use v-model directly.
const activeThreshold = computed({
    get: () => (activeMode.value === 'count' ? countThreshold.value : timeThreshold.value),
    set: (val: number) => {
        if (activeMode.value === 'count') {
            countThreshold.value = val
        } else {
            timeThreshold.value = val
        }
    },
})
const activeHotOnly = ref(false)
const frozen = ref(false)
const search = ref('')
const activeSelectedId = ref<string | null>(null)
const activeRootId = ref<string | null>(null)
const expandedIds = ref<Set<string>>(new Set())
const frozenSnapshot = ref<RenderEntry[]>([])
const expansionReady = ref(false)

function displayLabel(entry: RenderEntry) {
    if (entry.name && entry.name !== 'unknown' && !/^Component#\d+$/.test(entry.name)) {
        return entry.name
    }

    if (entry.element) {
        return entry.element
    }

    const basename = entry.file
        .split('/')
        .pop()
        ?.replace(/\.vue$/i, '')

    if (basename && basename !== 'unknown') {
        return basename
    }

    if (entry.name && entry.name !== 'unknown') {
        return entry.name
    }

    return `Component#${entry.uid}`
}

function formatTrigger(trigger: RenderEntry['triggers'][number]) {
    return `${trigger.type}: ${trigger.key}`
}

function buildNodes(entries: RenderEntry[]) {
    const byId = new Map<string, ComponentNode>()

    for (const entry of entries) {
        byId.set(String(entry.uid), {
            id: String(entry.uid),
            label: displayLabel(entry),
            file: entry.file,
            element: entry.element,
            depth: 0,
            path: [],
            rerenders: entry.rerenders ?? 0,
            mountCount: entry.mountCount ?? 1,
            avgMs: entry.avgMs,
            triggers: entry.triggers.map(formatTrigger),
            timeline: entry.timeline ?? [],
            children: [],
            parentId: entry.parentUid !== undefined ? String(entry.parentUid) : undefined,
            isPersistent: Boolean(entry.isPersistent),
            isHydrationMount: Boolean(entry.isHydrationMount),
            route: entry.route ?? '/',
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
            node.parentLabel = parent.label
            parent.children.push(node)
        } else {
            roots.push(node)
        }
    }

    function finalize(node: ComponentNode, path: string[] = [], depth = 0) {
        node.depth = depth
        node.path = [...path, node.label]
        node.children.forEach((child) => finalize(child, node.path, depth + 1))
    }

    roots.forEach((root) => finalize(root))

    return roots
}

function flatten(nodes: ComponentNode[]) {
    const flat: ComponentNode[] = []

    function walk(node: ComponentNode) {
        flat.push(node)
        node.children.forEach(walk)
    }

    nodes.forEach(walk)

    return flat
}

function countSubtree(node: ComponentNode): number {
    return 1 + node.children.reduce((sum, child) => sum + countSubtree(child), 0)
}

function collectIds(node: ComponentNode, target = new Set<string>()) {
    target.add(node.id)
    node.children.forEach((child) => collectIds(child, target))

    return target
}

function pathToNode(node: ComponentNode, targetId: string, trail: string[] = []): string[] | null {
    const nextTrail = [...trail, node.id]

    if (node.id === targetId) {
        return nextTrail
    }

    for (const child of node.children) {
        const childTrail = pathToNode(child, targetId, nextTrail)

        if (childTrail) {
            return childTrail
        }
    }

    return null
}

function findFirstHotNode(node: ComponentNode): ComponentNode | null {
    if (isHot(node)) {
        return node
    }

    for (const child of node.children) {
        const match = findFirstHotNode(child)

        if (match) {
            return match
        }
    }

    return null
}

function defaultExpandedIds(root: ComponentNode | null) {
    if (!root) {
        return new Set<string>()
    }

    // Expand all nodes that have children — gives a fully-open tree on first load.
    // The user can collapse individual branches as needed.
    const expanded = new Set<string>()

    function expandAll(node: ComponentNode) {
        if (node.children.length > 0) {
            expanded.add(node.id)
            node.children.forEach(expandAll)
        }
    }

    expandAll(root)

    return expanded
}

function searchExpandedIds(root: ComponentNode | null, term: string) {
    const expanded = defaultExpandedIds(root)

    if (!root || !term) {
        return expanded
    }

    function visit(node: ComponentNode): boolean {
        const childMatched = node.children.some((child) => visit(child))
        const selfMatched = matchesSearch(node, term)

        if (childMatched) {
            expanded.add(node.id)
        }

        return selfMatched || childMatched
    }

    visit(root)

    return expanded
}

function nodeValue(node: ComponentNode) {
    return activeMode.value === 'count' ? node.rerenders + node.mountCount : node.avgMs
}

function isHot(node: ComponentNode) {
    return nodeValue(node) >= activeThreshold.value
}

function matchesSearch(node: ComponentNode, searchTerm: string): boolean {
    if (!searchTerm) {
        return true
    }

    const query = searchTerm.toLowerCase()

    return (
        node.label.toLowerCase().includes(query) ||
        node.file.toLowerCase().includes(query) ||
        node.path.some((segment) => segment.toLowerCase().includes(query)) ||
        node.triggers.some((trigger) => trigger.toLowerCase().includes(query))
    )
}

function treeMatches(node: ComponentNode, searchTerm: string): boolean {
    if (!searchTerm) {
        return true
    }

    return matchesSearch(node, searchTerm) || node.children.some((child) => treeMatches(child, searchTerm))
}

function subtreeHasHotNode(node: ComponentNode): boolean {
    return isHot(node) || node.children.some((child) => subtreeHasHotNode(child))
}

function nodeMatchesRoute(node: ComponentNode): boolean {
    if (!activeRoute.value) {
        return true
    }

    // A component is visible for a route if it was first seen on that route
    // OR if any of its timeline events happened on that route.
    if (node.route === activeRoute.value) {
        return true
    }

    return node.timeline.some((e) => e.route === activeRoute.value)
}

function subtreeMatchesRoute(node: ComponentNode): boolean {
    return nodeMatchesRoute(node) || node.children.some((child) => subtreeMatchesRoute(child))
}

function isVisibleRoot(node: ComponentNode, searchTerm: string): boolean {
    const matchesCurrentSearch = treeMatches(node, searchTerm)
    const matchesCurrentHeat = !activeHotOnly.value || subtreeHasHotNode(node)
    const matchesCurrentRoute = !activeRoute.value || subtreeMatchesRoute(node)

    return matchesCurrentSearch && matchesCurrentHeat && matchesCurrentRoute
}

function pruneVisibleTree(node: ComponentNode, searchTerm: string): ComponentNode | null {
    const visibleChildren = node.children
        .map((child) => pruneVisibleTree(child, searchTerm))
        .filter((child): child is ComponentNode => child !== null)

    const matchesCurrentSearch = !searchTerm || matchesSearch(node, searchTerm) || visibleChildren.length > 0
    const matchesCurrentHeat = !activeHotOnly.value || isHot(node) || visibleChildren.length > 0
    const matchesCurrentRoute = !activeRoute.value || nodeMatchesRoute(node) || visibleChildren.length > 0

    if (!matchesCurrentSearch || !matchesCurrentHeat || !matchesCurrentRoute) {
        return null
    }

    return {
        ...node,
        children: visibleChildren,
    }
}

const displayEntries = computed(() => (frozen.value ? frozenSnapshot.value : renders.value))
const rootNodes = computed(() => buildNodes(displayEntries.value))
const rootMap = computed(() => new Map(rootNodes.value.map((node) => [node.id, node])))
const allComponents = computed(() => flatten(rootNodes.value))

const filteredRoots = computed(() => {
    const term = search.value.trim()

    return rootNodes.value.filter((root) => isVisibleRoot(root, term))
})

const activeRoot = computed(() => {
    if (activeRootId.value) {
        return filteredRoots.value.find((node) => node.id === activeRootId.value) ?? rootMap.value.get(activeRootId.value) ?? null
    }

    return filteredRoots.value[0] ?? rootNodes.value[0] ?? null
})

const visibleActiveRoot = computed(() => {
    const term = search.value.trim()

    return activeRoot.value ? pruneVisibleTree(activeRoot.value, term) : null
})

const visibleTreeRoots = computed(() => {
    if (!visibleActiveRoot.value) {
        return []
    }

    return [visibleActiveRoot.value]
})

const appEntries = computed(() =>
    filteredRoots.value.map((root, index) => ({
        id: root.id,
        label: `App ${index + 1}`,
        meta: `${countSubtree(root)} nodes`,
        root,
    }))
)

const knownRoutes = computed(() => {
    const routes = new Set<string>()

    for (const node of allComponents.value) {
        if (node.route) {
            routes.add(node.route)
        }

        for (const event of node.timeline) {
            if (event.route) routes.add(event.route)
        }
    }
    return [...routes].sort()
})

const activeSelected = computed(() => allComponents.value.find((node) => node.id === activeSelectedId.value) ?? null)
const totalRenders = computed(() => allComponents.value.reduce((sum, node) => sum + node.rerenders + node.mountCount, 0))
const hotCount = computed(() => allComponents.value.filter((node) => isHot(node)).length)
const avgTime = computed(() => {
    const components = allComponents.value.filter((node) => node.avgMs > 0)

    if (!components.length) {
        return '0.0'
    }

    return (components.reduce((sum, node) => sum + node.avgMs, 0) / components.length).toFixed(1)
})

watch(
    rootNodes,
    (roots) => {
        if (!roots.length) {
            activeRootId.value = null
            activeSelectedId.value = null
            expandedIds.value = new Set()
            expansionReady.value = false

            return
        }

        const rootIds = new Set(roots.map((root) => root.id))

        if (!activeRootId.value || !rootIds.has(activeRootId.value)) {
            activeRootId.value = roots[0].id
        }

        if (activeSelectedId.value && !allComponents.value.some((node) => node.id === activeSelectedId.value)) {
            activeSelectedId.value = null
        }

        const validIds = new Set(allComponents.value.map((node) => node.id))
        const preserved = new Set([...expandedIds.value].filter((id) => validIds.has(id)))

        if (!expansionReady.value) {
            expandedIds.value = defaultExpandedIds(activeRoot.value)
            expansionReady.value = true

            return
        }

        if (!search.value.trim() && activeSelectedId.value && activeRoot.value) {
            const selectedPath = pathToNode(activeRoot.value, activeSelectedId.value) ?? []
            selectedPath.forEach((id) => preserved.add(id))
        }

        expandedIds.value = preserved
    },
    { immediate: true }
)

watch(search, (term) => {
    if (!activeRoot.value) {
        return
    }

    const normalized = term.trim()

    if (normalized) {
        expandedIds.value = searchExpandedIds(activeRoot.value, normalized)

        return
    }

    if (activeSelectedId.value) {
        const selectedPath = pathToNode(activeRoot.value, activeSelectedId.value)
        expandedIds.value = selectedPath ? new Set(selectedPath) : defaultExpandedIds(activeRoot.value)

        return
    }

    expandedIds.value = defaultExpandedIds(activeRoot.value)
})

watch([activeHotOnly, activeThreshold, activeMode, filteredRoots], () => {
    if (!activeHotOnly.value) {
        return
    }

    const topLevelRoot = filteredRoots.value[0] ?? null

    if (!topLevelRoot) {
        activeSelectedId.value = null

        return
    }

    const firstHot = findFirstHotNode(topLevelRoot)

    if (!firstHot) {
        activeSelectedId.value = null

        return
    }

    activeRootId.value = topLevelRoot.id

    if (activeSelectedId.value !== firstHot.id) {
        activeSelectedId.value = firstHot.id
    }

    expandedIds.value = new Set(pathToNode(topLevelRoot, firstHot.id) ?? [topLevelRoot.id])
})

function selectNode(node: ComponentNode) {
    activeSelectedId.value = node.id

    const topLevelRoot = rootNodes.value.find((root) => collectIds(root).has(node.id))

    if (topLevelRoot) {
        activeRootId.value = topLevelRoot.id
        expandedIds.value = new Set(pathToNode(topLevelRoot, node.id) ?? [topLevelRoot.id])
    }
}

function toggleNode(id: string) {
    const next = new Set(expandedIds.value)

    if (next.has(id)) {
        next.delete(id)
    } else {
        next.add(id)
    }

    expandedIds.value = next
}

function selectRoot(root: ComponentNode) {
    activeRootId.value = root.id
    expandedIds.value = defaultExpandedIds(root)
    expansionReady.value = true
}

function updateSearch(event: Event) {
    const target = event.target as HTMLInputElement | null
    search.value = target?.value ?? ''
}

function toggleFreeze() {
    if (frozen.value) {
        frozen.value = false
        frozenSnapshot.value = []

        return
    }

    frozenSnapshot.value = JSON.parse(JSON.stringify(renders.value)) as RenderEntry[]
    frozen.value = true
}

function basename(file: string) {
    return (
        file
            .split('/')
            .pop()
            ?.replace(/\.vue$/i, '') ?? file
    )
}

function openInEditor(file: string) {
    openInEditorFromStore(file)
}

function pathLabel(node: ComponentNode) {
    return node.path.join(' / ')
}

function formatMs(ms: number): string {
    return ms < 1 ? '<1ms' : `${ms.toFixed(1)}ms`
}

function formatTimestamp(t: number): string {
    // t is performance.now() — show as relative seconds from page load
    return `+${(t / 1000).toFixed(2)}s`
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
                <input
                    v-model.number="activeThreshold"
                    type="range"
                    :min="activeMode === 'count' ? 2 : 4"
                    :max="activeMode === 'count' ? 20 : 100"
                    :step="activeMode === 'count' ? 1 : 4"
                    style="width: 90px"
                />
                <span class="mono text-sm">{{ activeThreshold }}{{ activeMode === 'count' ? '+ renders' : 'ms+' }}</span>
            </div>
            <button :class="{ active: activeHotOnly }" @click="activeHotOnly = !activeHotOnly">hot only</button>
            <select v-model="activeRoute" class="route-select mono text-sm" title="Filter by route">
                <option value="">all routes</option>
                <option v-for="r in knownRoutes" :key="r" :value="r">{{ r }}</option>
            </select>
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

        <div class="inspector">
            <aside class="roots-panel">
                <div class="panel-title">apps</div>
                <button
                    v-for="entry in appEntries"
                    :key="entry.id"
                    class="root-item"
                    :class="{ active: activeRootId === entry.id }"
                    @click="selectRoot(entry.root)"
                >
                    <div class="root-copy">
                        <span class="root-label mono">{{ entry.label }}</span>
                        <span class="root-sub muted mono">{{ entry.root.label }}</span>
                    </div>
                    <span class="root-meta mono">{{ entry.meta }}</span>
                </button>
                <div v-if="!appEntries.length" class="detail-empty">no apps match</div>
            </aside>

            <section class="tree-panel">
                <div class="tree-toolbar">
                    <input :value="search" class="search-input mono" placeholder="Find components..." @input="updateSearch" />
                </div>

                <div class="tree-frame">
                    <div class="tree-canvas">
                        <TreeNode
                            v-for="root in visibleTreeRoots"
                            :key="root.id"
                            :node="root"
                            :mode="activeMode"
                            :threshold="activeThreshold"
                            :selected="activeSelected?.id"
                            :expanded-ids="expandedIds"
                            @select="selectNode"
                            @toggle="toggleNode"
                        />
                    </div>
                    <div v-if="!visibleTreeRoots.length" class="detail-empty">
                        {{ connected ? 'No render activity recorded yet.' : 'Waiting for connection to the Nuxt app…' }}
                    </div>
                </div>
            </section>

            <div class="resize-handle" @mousedown="onDetailHandleMouseDown" />

            <aside class="detail-panel" :style="{ width: detailWidth + 'px' }">
                <template v-if="activeSelected">
                    <div class="detail-header">
                        <span class="mono bold" style="font-size: 12px">{{ activeSelected.label }}</span>
                        <button @click="activeSelectedId = null">×</button>
                    </div>

                    <div class="detail-pill-row">
                        <span class="detail-pill mono">
                            {{ activeSelected.rerenders + activeSelected.mountCount }} render{{
                                activeSelected.rerenders + activeSelected.mountCount !== 1 ? 's' : ''
                            }}
                        </span>
                        <span class="detail-pill mono muted">
                            {{ activeSelected.mountCount }} mount{{ activeSelected.mountCount !== 1 ? 's' : '' }}
                        </span>
                        <span v-if="activeSelected.rerenders" class="detail-pill mono">
                            {{ activeSelected.rerenders }} re-render{{ activeSelected.rerenders !== 1 ? 's' : '' }}
                        </span>
                        <span v-if="activeSelected.isPersistent" class="detail-pill mono persistent">persistent</span>
                        <span v-if="activeSelected.isHydrationMount" class="detail-pill mono hydrated">hydrated</span>
                        <span class="detail-pill mono">{{ activeSelected.avgMs.toFixed(1) }}ms avg</span>
                        <span class="detail-pill mono" :class="{ hot: isHot(activeSelected) }">
                            {{ isHot(activeSelected) ? 'hot' : 'cool' }}
                        </span>
                    </div>

                    <div class="section-label">identity</div>
                    <div class="meta-grid">
                        <span class="muted text-sm">label</span>
                        <span class="mono text-sm">{{ activeSelected.label }}</span>
                        <span class="muted text-sm">path</span>
                        <span class="mono text-sm">{{ pathLabel(activeSelected) }}</span>
                        <span class="muted text-sm">file</span>
                        <span class="mono text-sm muted" style="display: flex; align-items: center; gap: 6px">
                            {{ activeSelected.file }}
                            <button
                                v-if="activeSelected.file && activeSelected.file !== 'unknown'"
                                class="jump-btn"
                                title="Open in editor"
                                @click="openInEditor(activeSelected.file)"
                            >
                                open ↗
                            </button>
                        </span>
                        <span class="muted text-sm">file name</span>
                        <span class="mono text-sm">{{ basename(activeSelected.file) }}</span>
                        <span class="muted text-sm">parent</span>
                        <span class="mono text-sm">{{ activeSelected.parentLabel ?? 'none' }}</span>
                        <span class="muted text-sm">children</span>
                        <span class="mono text-sm">{{ activeSelected.children.length }}</span>
                    </div>

                    <div class="section-label">rendering</div>
                    <div class="meta-grid">
                        <span class="muted text-sm">total renders</span>
                        <span class="mono text-sm">{{ activeSelected.rerenders + activeSelected.mountCount }}</span>
                        <span class="muted text-sm">re-renders</span>
                        <span class="mono text-sm">{{ activeSelected.rerenders }}</span>
                        <span class="muted text-sm">mounts</span>
                        <span class="mono text-sm">{{ activeSelected.mountCount }}</span>
                        <span class="muted text-sm">persistent</span>
                        <span class="mono text-sm" :style="{ color: activeSelected.isPersistent ? 'var(--amber)' : 'inherit' }">
                            {{ activeSelected.isPersistent ? 'yes — survives navigation' : 'no' }}
                        </span>
                        <span class="muted text-sm">hydration mount</span>
                        <span class="mono text-sm">{{ activeSelected.isHydrationMount ? 'yes — SSR hydrated' : 'no' }}</span>
                        <span class="muted text-sm">avg render time</span>
                        <span class="mono text-sm">{{ activeSelected.avgMs.toFixed(1) }}ms</span>
                        <span class="muted text-sm">threshold</span>
                        <span class="mono text-sm">{{ activeThreshold }}{{ activeMode === 'count' ? '+ renders' : 'ms+' }}</span>
                        <span class="muted text-sm">mode</span>
                        <span class="mono text-sm">{{ activeMode === 'count' ? 're-render count' : 'render time' }}</span>
                    </div>

                    <div class="section-label">triggers</div>
                    <div v-for="trigger in activeSelected.triggers" :key="trigger" class="trigger-item mono text-sm">{{ trigger }}</div>
                    <div v-if="!activeSelected.triggers.length" class="muted text-sm">no triggers recorded</div>

                    <div class="section-label" style="margin-top: 8px">
                        render timeline
                        <span class="muted" style="font-weight: 400; text-transform: none; letter-spacing: 0">
                            ({{ activeSelected.timeline.length }})
                        </span>
                    </div>
                    <div v-if="!activeSelected.timeline.length" class="muted text-sm">no timeline events yet</div>
                    <div v-else class="timeline-list">
                        <div v-for="(event, idx) in [...activeSelected.timeline].reverse().slice(0, 30)" :key="idx" class="timeline-row">
                            <span class="timeline-kind mono" :class="event.kind">{{ event.kind }}</span>
                            <span class="timeline-time mono muted">{{ formatTimestamp(event.t) }}</span>
                            <span class="timeline-dur mono">{{ formatMs(event.durationMs) }}</span>
                            <span v-if="event.triggerKey" class="timeline-trigger mono muted">{{ event.triggerKey }}</span>
                            <span class="timeline-route mono muted" style="margin-left: auto">{{ event.route }}</span>
                        </div>
                        <div v-if="activeSelected.timeline.length > 30" class="muted text-sm" style="padding: 2px 0">
                            … {{ activeSelected.timeline.length - 30 }} earlier events
                        </div>
                    </div>
                </template>
                <div v-else class="detail-empty">click a component to inspect</div>
            </aside>
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

.stat-sub {
    margin-top: 4px;
    font-size: 11px;
    color: var(--text3);
}

.inspector {
    display: flex;
    gap: 0;
    flex: 1;
    min-height: 0;
}

.resize-handle {
    width: 8px;
    flex-shrink: 0;
    cursor: col-resize;
    background: transparent;
    position: relative;
    z-index: 1;
    margin: 0 2px;
}

.resize-handle::after {
    content: '';
    position: absolute;
    inset: 0 3px;
    border-radius: 2px;
    background: var(--border);
    opacity: 0;
    transition: opacity 0.15s;
}

.resize-handle:hover::after {
    opacity: 1;
}

.roots-panel,
.detail-panel {
    flex-shrink: 0;
}

.roots-panel {
    width: 240px;
    margin-right: 12px;
}

.roots-panel,
.tree-panel,
.detail-panel {
    border: 0.5px solid var(--border);
    border-radius: var(--radius-lg);
    background: var(--bg3);
    min-height: 0;
}

.roots-panel,
.detail-panel {
    display: flex;
    flex-direction: column;
    overflow: auto;
    padding: 12px;
    gap: 8px;
}

.panel-title {
    font-size: 10px;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.4px;
    color: var(--text3);
}

.root-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    width: 100%;
    padding: 10px 12px;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--bg2);
    color: var(--text);
    text-align: left;
}

.root-item.active {
    border-color: var(--teal);
    background: color-mix(in srgb, var(--teal) 16%, var(--bg2));
}

.root-label {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.root-copy {
    display: flex;
    flex-direction: column;
    min-width: 0;
}

.root-sub {
    font-size: 11px;
}

.root-meta {
    color: var(--text3);
    font-size: 11px;
}

.tree-panel {
    display: flex;
    flex-direction: column;
    overflow: hidden;
    flex: 1;
    min-width: 0;
}

.tree-toolbar {
    padding: 12px;
    border-bottom: 0.5px solid var(--border);
}

.search-input {
    width: 100%;
    padding: 10px 12px;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--bg2);
    color: var(--text);
}

.tree-frame {
    flex: 1;
    min-height: 0;
    overflow: auto;
    padding: 12px;
}

:deep(.tree-canvas) {
    display: inline-block;
    min-width: 100%;
    width: max-content;
}

:deep(.tree-node) {
    margin-bottom: 4px;
}

:deep(.tree-row) {
    display: grid;
    grid-template-columns: 8px 18px minmax(0, 1fr) auto;
    align-items: center;
    gap: 6px;
    min-width: 0;
    width: 100%;
    padding: 4px 8px;
    padding-left: calc(8px + (var(--tree-depth, 0) * 16px));
    border: 1px solid transparent;
    border-radius: var(--radius);
    cursor: pointer;
    white-space: nowrap;
}

:deep(.tree-row:hover) {
    background: var(--bg2);
}

:deep(.tree-row.selected) {
    background: color-mix(in srgb, var(--teal) 12%, var(--bg2));
    border-color: var(--teal);
}

:deep(.tree-row.hot) {
    box-shadow: inset 2px 0 0 var(--red);
}

:deep(.tree-toggle) {
    width: 16px;
    height: 16px;
    border: none;
    background: transparent;
    color: var(--text3);
    padding: 0;
    font-size: 14px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
}

:deep(.tree-toggle:disabled) {
    cursor: default;
}

:deep(.tree-toggle.empty) {
    opacity: 0;
}

:deep(.tree-rail) {
    display: block;
    width: 2px;
    height: 14px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--border) 75%, transparent);
}

:deep(.tree-copy) {
    display: flex;
    align-items: center;
    min-width: 0;
    gap: 6px;
    overflow: hidden;
}

:deep(.tree-name) {
    font-size: 12px;
    color: var(--text);
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
}

:deep(.tree-badges) {
    display: flex;
    gap: 6px;
    flex-shrink: 0;
    overflow: hidden;
}

:deep(.tree-badge) {
    border: 1px solid var(--border);
    border-radius: 999px;
    padding: 2px 7px;
    font-size: 10px;
    color: var(--text3);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 160px;
}

:deep(.tree-metrics) {
    display: flex;
    align-items: center;
    min-width: 92px;
    justify-content: flex-end;
    flex-shrink: 0;
    gap: 6px;
}

:deep(.tree-metric-pill) {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 78px;
    padding: 2px 8px;
    border: 1px solid var(--border);
    border-radius: 999px;
    background: var(--bg2);
    font-size: 10px;
    color: var(--text3);
}

:deep(.tree-persistent-pill) {
    display: inline-flex;
    align-items: center;
    padding: 2px 8px;
    border: 1px solid color-mix(in srgb, var(--amber) 55%, var(--border));
    border-radius: 999px;
    background: color-mix(in srgb, var(--amber) 10%, var(--bg2));
    font-size: 10px;
    color: color-mix(in srgb, var(--amber) 80%, var(--text));
}

:deep(.tree-hydration-pill) {
    display: inline-flex;
    align-items: center;
    padding: 2px 8px;
    border: 1px solid color-mix(in srgb, var(--teal) 55%, var(--border));
    border-radius: 999px;
    background: color-mix(in srgb, var(--teal) 10%, var(--bg2));
    font-size: 10px;
    color: color-mix(in srgb, var(--teal) 80%, var(--text));
}

:deep(.tree-children) {
    margin-left: 7px;
    padding-left: 11px;
    border-left: 1px solid color-mix(in srgb, var(--border) 72%, transparent);
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

.detail-pill-row {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
}

.detail-pill {
    border: 1px solid var(--border);
    border-radius: 999px;
    padding: 4px 8px;
    background: var(--bg2);
    font-size: 11px;
}

.detail-pill.hot {
    border-color: color-mix(in srgb, var(--red) 50%, var(--border));
    color: var(--red);
}

.detail-pill.persistent {
    border-color: color-mix(in srgb, var(--amber) 55%, var(--border));
    color: color-mix(in srgb, var(--amber) 80%, var(--text));
}

.detail-pill.hydrated {
    border-color: color-mix(in srgb, var(--teal) 55%, var(--border));
    color: color-mix(in srgb, var(--teal) 80%, var(--text));
}

.detail-pill.muted {
    color: var(--text3);
    border-color: var(--border);
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

:deep(.tree-jump-btn) {
    display: none;
    padding: 0 4px;
    border: none;
    background: transparent;
    color: var(--text3);
    font-size: 11px;
    cursor: pointer;
    line-height: 1;
    flex-shrink: 0;
}

:deep(.tree-row:hover .tree-jump-btn),
:deep(.tree-row.selected .tree-jump-btn) {
    display: inline-flex;
}

:deep(.tree-jump-btn:hover) {
    color: var(--teal);
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

.route-select {
    padding: 3px 7px;
    border: 0.5px solid var(--border);
    border-radius: var(--radius);
    background: var(--bg2);
    color: var(--text);
    font-size: 11px;
    cursor: pointer;
    max-width: 140px;
}

.timeline-list {
    display: flex;
    flex-direction: column;
    gap: 1px;
    background: var(--bg2);
    border-radius: var(--radius);
    padding: 4px 8px;
    max-height: 200px;
    overflow-y: auto;
    min-height: fit-content;
}

.timeline-row {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 2px 0;
    font-size: 11px;
    border-bottom: 0.5px solid var(--border);
    min-width: 0;
    min-height: fit-content;
}

.timeline-row:last-child {
    border-bottom: none;
}

.timeline-kind {
    flex-shrink: 0;
    font-size: 10px;
    font-weight: 500;
    min-width: 40px;
}

.timeline-kind.mount {
    color: var(--teal);
}

.timeline-kind.update {
    color: var(--amber);
}

.timeline-time {
    flex-shrink: 0;
    min-width: 52px;
    color: var(--text3);
}

.timeline-dur {
    flex-shrink: 0;
    min-width: 38px;
    color: var(--text2);
}

.timeline-trigger {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--text3);
    flex: 1;
    min-width: 0;
}

.timeline-route {
    flex-shrink: 0;
    color: var(--text3);
    font-size: 10px;
}

@media (width <= 1180px) {
    .roots-panel {
        display: none;
    }

    .detail-panel {
        max-height: 220px;
    }
}
</style>
