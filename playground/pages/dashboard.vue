<script setup lang="ts">
/**
 * dashboard.vue — Analytics dashboard page.
 *
 * Observatory coverage:
 *   Fetch Dashboard  — parallel useFetch (products) + polling via useDashboard ($fetch every 4s)
 *   Composable       — useDashboard (watcher + interval, both cleaned), useCart (read-only)
 *   Render Heatmap   — DataTable re-renders on sort + 5×StatsCard instances
 *   Provide/Inject   — reads layout-provided auth context and mounts a leaky store-backed composable
 */
import { inject } from 'vue'

// inject authContext provided by the default layout provider tree
const authContext = inject<{ user: { id: string; name: string }; isLoggedIn: boolean } | null>('authContext', null)

const { stats, isLoading, error, pollCount, fetchStats } = useDashboard()
const cart = useCart()

// Parallel fetch — exercises the fetch dashboard showing multiple in-flight requests
const { data: products } = await useFetch('/api/products')

const tableRows = computed(() => products.value ?? [])
const showLeakyAudit = ref(false)
</script>

<template>
    <div>
        <header class="page-header">
            <div>
                <h1>Dashboard</h1>
                <p>useDashboard composable · polling fetch · DataTable heatmap · parallel fetches</p>
            </div>
            <div v-if="authContext" class="user-chip">
                {{ authContext.user.name }}
            </div>
        </header>

        <main class="page-body">
            <!-- stats row — 5 StatsCard instances side by side -->
            <section class="section">
                <div class="section-head">
                    <h2>Live Stats</h2>
                    <span class="poll-badge">poll #{{ pollCount }}</span>
                    <button :disabled="isLoading" @click="fetchStats">↺ Refresh now</button>
                </div>
                <div v-if="error" class="error-msg">{{ error }}</div>
                <div class="stats-row">
                    <StatsCard
                        label="Active Users"
                        :value="stats?.activeUsers ?? '—'"
                        :sub="isLoading ? 'updating…' : 'live'"
                        :trend="isLoading ? 'neutral' : 'up'"
                    />
                    <StatsCard label="Page Views" :value="stats?.pageViews ?? '—'" :sub="isLoading ? 'updating…' : 'live'" trend="up" />
                    <StatsCard
                        label="Conversion"
                        :value="stats ? (stats.conversionRate * 100).toFixed(2) + '%' : '—'"
                        :sub="isLoading ? 'updating…' : 'live'"
                        trend="neutral"
                    />
                    <StatsCard
                        label="Revenue"
                        :value="stats ? '$' + stats.revenue.toFixed(0) : '—'"
                        :sub="isLoading ? 'updating…' : 'live'"
                        trend="up"
                    />
                    <StatsCard label="Cart Total" :value="'$' + cart.total.value.toFixed(2)" sub="from Pinia store" trend="neutral" />
                </div>
            </section>

            <!-- top pages -->
            <section v-if="stats?.topPages" class="section">
                <h2>Top Pages</h2>
                <div class="top-pages">
                    <div v-for="page in stats.topPages" :key="page.path" class="page-row">
                        <span class="page-path">{{ page.path }}</span>
                        <div class="page-bar-wrap">
                            <div
                                class="page-bar"
                                :style="{ width: (page.views / Math.max(...stats!.topPages.map((p) => p.views))) * 100 + '%' }"
                            />
                        </div>
                        <span class="page-views">{{ page.views }}</span>
                    </div>
                </div>
            </section>

            <section class="section">
                <div class="section-head">
                    <h2>Composable Tracker Stress</h2>
                    <button @click="showLeakyAudit = !showLeakyAudit">
                        {{ showLeakyAudit ? 'Unmount leaky audit' : 'Mount leaky audit' }}
                    </button>
                </div>
                <p style="font-size: 12px; color: #888; margin-bottom: 12px">
                    This is the store-backed counterpart to the original interval leak demo on the home page.
                </p>
                <LeakyCartMonitor v-if="showLeakyAudit" />
            </section>

            <!-- product table — DataTable with heavy column sort rerenders -->
            <section class="section">
                <h2>Product Inventory</h2>
                <p style="font-size: 12px; color: #888; margin-bottom: 12px">
                    Click a column header to sort — observe the Render Heatmap spike.
                </p>
                <DataTable :rows="tableRows" />
            </section>
        </main>
    </div>
</template>

<style scoped>
.page-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    padding: 24px 32px;
    border-bottom: 1px solid #e0ded8;
}

.page-header h1 {
    font-size: 20px;
    font-weight: 600;
    margin: 0 0 4px;
}

.page-header p {
    font-size: 13px;
    color: #888;
    margin: 0;
}

.page-body {
    padding: 24px 32px;
    display: flex;
    flex-direction: column;
    gap: 24px;
}

.section {
    background: white;
    border: 1px solid #e0ded8;
    border-radius: 12px;
    padding: 20px 24px;
}

.section-head {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 12px;
}

.section-head h2 {
    margin: 0;
    font-size: 15px;
    font-weight: 600;
    flex: 1;
}

.section-head button {
    font-size: 12px;
    padding: 4px 10px;
    border-radius: 7px;
    border: 1px solid #d3d1c7;
    background: white;
    cursor: pointer;
}

h2 {
    font-size: 15px;
    font-weight: 600;
    margin: 0 0 12px;
}

.poll-badge {
    font-size: 11px;
    background: #f0f9ff;
    color: #0369a1;
    border: 1px solid #bae6fd;
    border-radius: 99px;
    padding: 2px 8px;
}

.stats-row {
    display: flex;
    gap: 12px;
    flex-wrap: wrap;
}

.user-chip {
    background: #f0fdf4;
    border: 1px solid #86efac;
    border-radius: 99px;
    padding: 4px 14px;
    font-size: 13px;
    color: #166534;
}

.error-msg {
    color: #c0392b;
    font-size: 13px;
    margin-bottom: 8px;
}

.top-pages {
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.page-row {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 13px;
}

.page-path {
    width: 100px;
    color: #555;
    font-family: monospace;
}

.page-bar-wrap {
    flex: 1;
    background: #f0ede8;
    border-radius: 4px;
    height: 8px;
    overflow: hidden;
}

.page-bar {
    height: 100%;
    background: #1d9e75;
    border-radius: 4px;
    transition: width 0.4s ease;
}

.page-views {
    width: 50px;
    text-align: right;
    color: #888;
}
</style>
