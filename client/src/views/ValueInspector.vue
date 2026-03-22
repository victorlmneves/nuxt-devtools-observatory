<script setup lang="ts">
import { ref } from 'vue'

defineProps<{
    value: unknown
    compact?: boolean
}>()

const open = ref(false)

function truncate(s: string, max: number) {
    return s.length > max ? s.slice(0, max) + '…' : s
}
</script>

<template>
    <span class="vi">
        <!-- null / undefined -->
        <span v-if="value === null || value === undefined" class="vi-null">{{ String(value) }}</span>

        <!-- boolean -->
        <span v-else-if="typeof value === 'boolean'" class="vi-bool">{{ value }}</span>

        <!-- number -->
        <span v-else-if="typeof value === 'number'" class="vi-num">{{ value }}</span>

        <!-- string -->
        <span v-else-if="typeof value === 'string'" class="vi-str">"{{ compact ? truncate(value, 40) : value }}"</span>

        <!-- array -->
        <span v-else-if="Array.isArray(value)">
            <span v-if="compact || !open">
                <span class="vi-punc">[</span>
                <span class="vi-dim">{{ value.length }} item{{ value.length !== 1 ? 's' : '' }}</span>
                <span class="vi-punc">]</span>
                <button v-if="!compact" class="vi-toggle" @click.stop="open = true">▸</button>
            </span>
            <span v-else class="vi-block">
                <button class="vi-toggle" @click.stop="open = false">▾</button>
                <span class="vi-punc">[</span>
                <span v-for="(item, i) in value" :key="i" class="vi-indent">
                    <ValueInspector :value="item" />
                    <span v-if="i < value.length - 1" class="vi-punc">,</span>
                </span>
                <span class="vi-punc">]</span>
            </span>
        </span>

        <!-- object -->
        <span v-else-if="typeof value === 'object'">
            <span v-if="compact || !open">
                <span class="vi-punc">{</span>
                <span class="vi-dim">
                    {{
                        Object.keys(value as object)
                            .slice(0, 3)
                            .join(', ')
                    }}{{ Object.keys(value as object).length > 3 ? '…' : '' }}
                </span>
                <span class="vi-punc">}</span>
                <button v-if="!compact" class="vi-toggle" @click.stop="open = true">▸</button>
            </span>
            <span v-else class="vi-block">
                <button class="vi-toggle" @click.stop="open = false">▾</button>
                <span class="vi-punc">{</span>
                <span v-for="(v, k, i) in value as Record<string, unknown>" :key="k" class="vi-indent">
                    <span class="vi-key">{{ k }}</span>
                    <span class="vi-punc">:</span>
                    <ValueInspector :value="v" />
                    <span v-if="i < Object.keys(value as object).length - 1" class="vi-punc">,</span>
                </span>
                <span class="vi-punc">}</span>
            </span>
        </span>

        <!-- fallback -->
        <span v-else class="vi-dim">{{ String(value) }}</span>
    </span>
</template>

<style scoped>
.vi {
    font-family: var(--font-mono);
    font-size: 12px;
}
.vi-null {
    color: #888;
}
.vi-bool {
    color: #534ab7;
}
.vi-num {
    color: #ba7517;
}
.vi-str {
    color: #0f6e56;
}
.vi-key {
    color: #185195;
}
.vi-punc {
    color: #888;
}
.vi-dim {
    color: #888;
    font-style: italic;
}
.vi-toggle {
    background: none;
    border: none;
    cursor: pointer;
    font-size: 10px;
    color: #888;
    padding: 0 2px;
}
.vi-block {
    display: inline-flex;
    flex-direction: column;
}
.vi-indent {
    padding-left: 12px;
    display: block;
}
</style>
