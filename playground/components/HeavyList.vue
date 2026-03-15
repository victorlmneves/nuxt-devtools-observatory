<script setup lang="ts">
import PriceDisplay from './PriceDisplay.vue'

defineProps<{
    items: Array<{ id: number; name: string; price: number }>
}>()
</script>

<template>
    <div>
        <div
            v-for="item in items"
            :key="item.id"
            style="display: flex; justify-content: space-between; padding: 5px 0; border-bottom: 1px solid #f0ede8; font-size: 13px"
        >
            <span>{{ item.name }}</span>
            <PriceDisplay :price="item.price" />
        </div>
    </div>
</template>
