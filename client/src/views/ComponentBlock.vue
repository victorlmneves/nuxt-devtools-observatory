<script setup lang="ts">
interface ComponentNode {
    id: string
    label: string
    file: string
    renders: number
    avgMs: number
    triggers: string[]
    children: ComponentNode[]
}

const props = defineProps<{
    node: ComponentNode
    mode: string
    threshold: number
    hotOnly: boolean
    selected?: string
}>()

const emit = defineEmits(['select'])

function getVal(n: ComponentNode) {
    return props.mode === 'count' ? n.renders : n.avgMs
}

function getMax(n: ComponentNode): number {
    let max = 1

    function walk(ns: ComponentNode[]) {
        ns.forEach((n) => {
            const v = getVal(n)

            if (v > max) {
                max = v
            }

            walk(n.children)
        })
    }

    walk([n])

    return Math.max(max, props.mode === 'count' ? 40 : 20)
}

function heatColor(val: number, max: number) {
    const r = Math.min(val / max, 1)

    if (r < 0.25) {
        return { bg: '#EAF3DE', text: '#27500A', border: '#97C459' }
    } else {
        if (r < 0.55) {
            return { bg: '#FAEEDA', text: '#633806', border: '#EF9F27' }
        } else {
            if (r < 0.8) {
                return { bg: '#FAECE7', text: '#712B13', border: '#D85A30' }
            } else {
                return { bg: '#FCEBEB', text: '#791F1F', border: '#E24B4A' }
            }
        }
    }
}

function isHotNode(n: ComponentNode) {
    let value: number

    if (props.mode === 'count') {
        value = n.renders
    } else {
        value = n.avgMs
    }

    if (value >= props.threshold) {
        return true
    } else {
        return false
    }
}

function shouldShow(n: ComponentNode): boolean {
    if (!props.hotOnly) {
        return true
    } else {
        if (isHotNode(n)) {
            return true
        } else {
            if (n.children.some(isHotNode)) {
                return true
            } else {
                return false
            }
        }
    }
}

function handleSelect(n: ComponentNode) {
    emit('select', n)
}
</script>

<template>
    <div
        v-if="shouldShow(props.node)"
        :style="{
            background: heatColor(getVal(props.node), getMax(props.node)).bg,
            border:
                props.selected === props.node.id
                    ? `2px solid ${heatColor(getVal(props.node), getMax(props.node)).border}`
                    : `1px solid ${heatColor(getVal(props.node), getMax(props.node)).border}`,
            borderRadius: '6px',
            padding: '6px 9px',
            marginBottom: '5px',
            cursor: 'pointer',
        }"
        @click="handleSelect(props.node)"
    >
        <div style="display: flex; align-items: center; gap: 6px">
            <span
                :style="{
                    fontFamily: 'var(--mono)',
                    fontSize: '11px',
                    fontWeight: 500,
                    color: heatColor(getVal(props.node), getMax(props.node)).text,
                }"
            >
                {{ props.node.label }}
            </span>
            <span
                :style="{
                    fontFamily: 'var(--mono)',
                    fontSize: '10px',
                    color: heatColor(getVal(props.node), getMax(props.node)).text,
                    opacity: 0.7,
                    marginLeft: 'auto',
                }"
            >
                {{ props.mode === 'count' ? getVal(props.node) : getVal(props.node).toFixed(1) + 'ms' }}
                {{ props.mode === 'count' ? 'renders' : 'ms avg' }}
            </span>
        </div>
        <div
            v-if="props.node.children && props.node.children.length"
            :style="{
                marginLeft: '10px',
                borderLeft: `1.5px solid ${heatColor(getVal(props.node), getMax(props.node)).border}40`,
                paddingLeft: '8px',
                marginTop: '5px',
            }"
        >
            <ComponentBlock
                v-for="child in props.node.children"
                :key="child.id"
                :node="child"
                :mode="props.mode"
                :threshold="props.threshold"
                :hot-only="props.hotOnly"
                :selected="props.selected"
                @select="handleSelect"
            />
        </div>
    </div>
</template>
