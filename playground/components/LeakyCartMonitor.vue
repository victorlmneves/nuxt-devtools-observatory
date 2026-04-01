<script setup lang="ts">
import { useLeakyCartAudit } from '../composables/useLeakyCartAudit'

const { auditEvents, latestItemCount } = useLeakyCartAudit()
</script>

<template>
    <div class="monitor">
        <div class="monitor-row">
            <strong>Leaky cart audit is mounted</strong>
            <span class="badge err">watcher not cleaned</span>
        </div>
        <p>
            This composable consumes the Pinia cart store and registers a watcher without stopping it. Unmount this panel, then change the
            cart on the Shop page and inspect the Composable Tracker.
        </p>
        <div class="stats">
            <span>Audit events: {{ auditEvents }}</span>
            <span>Latest cart count: {{ latestItemCount }}</span>
        </div>
    </div>
</template>

<style scoped>
.monitor {
    background: #fff4f2;
    border: 1px solid #fecaca;
    border-radius: 10px;
    padding: 14px 16px;
}

.monitor-row {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 6px;
}

p {
    font-size: 12px;
    color: #7f1d1d;
    margin: 0 0 10px;
}

.stats {
    display: flex;
    gap: 16px;
    font-size: 12px;
    color: #991b1b;
}

.badge.err {
    font-size: 11px;
    padding: 2px 8px;
    border-radius: 99px;
    background: #fee2e2;
    color: #991b1b;
    border: 1px solid #fecaca;
}
</style>
