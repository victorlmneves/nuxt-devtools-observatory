<script setup lang="ts">
/**
 * StatsCard — a simple metric display card.
 * Five of these are rendered side-by-side in the dashboard, making them
 * individually visible in the Render Heatmap as distinct component instances.
 */
defineProps<{
    label: string
    value: string | number
    sub?: string
    trend?: 'up' | 'down' | 'neutral'
}>()
</script>

<template>
    <div class="stats-card">
        <div class="label">{{ label }}</div>
        <div class="value">{{ value }}</div>
        <div v-if="sub" class="sub" :class="trend ?? 'neutral'">{{ sub }}</div>
    </div>
</template>

<style scoped>
.stats-card {
    background: white;
    border: 1px solid #e0ded8;
    border-radius: 10px;
    padding: 16px 20px;
    min-width: 120px;
    flex: 1;
}

.label {
    font-size: 12px;
    color: #888;
    margin-bottom: 4px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
}

.value {
    font-size: 22px;
    font-weight: 700;
    color: #1a1a18;
}

.sub {
    font-size: 12px;
    margin-top: 4px;
}

.up {
    color: #1d9e75;
}

.down {
    color: #c0392b;
}

.neutral {
    color: #888;
}
</style>
