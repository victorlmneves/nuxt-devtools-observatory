<script setup lang="ts">
defineProps<{ price: number }>()
</script>

<template>
    <span style="font-weight: 500; color: #1d9e75">${{ price.toFixed(2) }}</span>
</template>
