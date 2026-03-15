<script setup lang="ts">
import { useLeakyPoller } from '../composables/useLeakyPoller'

const { ticks } = useLeakyPoller()
</script>

<template>
    <div style="background: #fff3cd; border: 1px solid #ffc107; border-radius: 8px; padding: 12px; margin-top: 10px">
        <p style="font-size: 13px; color: #856404; margin: 0">
            LeakyComponent is mounted. It starts a setInterval but never clears it. Unmount it and check the Composable Tracker — it should
            show a leak.
        </p>
        <p style="font-size: 12px; color: #856404; margin-top: 6px">Tick count: {{ ticks }}</p>
    </div>
</template>
