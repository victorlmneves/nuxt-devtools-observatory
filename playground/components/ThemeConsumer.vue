<script setup lang="ts">
import { inject } from 'vue'

// This inject resolves correctly — 'theme' is provided by app.vue
const theme = inject<string>('theme')
</script>

<template>
    <div style="font-size: 13px; color: #444; margin-bottom: 8px">
        ThemeConsumer: current theme =
        <strong>{{ theme }}</strong>
    </div>
</template>
