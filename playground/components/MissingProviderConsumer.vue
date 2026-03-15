<script setup lang="ts">
import { inject } from 'vue'

// 'cartContext' is never provided anywhere in the tree
// The provide/inject graph should show this as a red node
const cartContext = inject('cartContext')
</script>

<template>
    <div style="font-size: 13px; color: #c0392b; margin-top: 8px">
        MissingProviderConsumer: cartContext = {{ cartContext ?? 'undefined (no provider!)' }}
    </div>
</template>
