<script setup lang="ts">
/**
 * dashboard.vue — Analytics dashboard page.
 *
 * Observatory coverage:
 *   Fetch Dashboard  — parallel useFetch (products) + polling via useDashboard ($fetch every 4s)
 *   Composable       — useDashboard (watcher + interval, both cleaned), useCart (read-only),
 *                      useProductFilter (cross-store churn)
 *   Render Heatmap   — DataTable re-renders on sort + 5×StatsCard instances
 *   Provide/Inject   — reads layout-provided auth + analyticsContext (analytics layout shadows theme)
 */
import { inject, watch } from 'vue'
import { useProductFilter } from '../composables/useProductFilter'

definePageMeta({ layout: 'analytics' })

// inject authContext provided by the default layout provider tree
const authContext = inject<{ user: { id: string; name: string }; isLoggedIn: boolean } | null>('authContext', null)

// inject analyticsContext provided by the analytics layout
const analyticsContext = inject<{ layout: string; theme: string; capabilities: string[] } | null>('analyticsContext', null)

const { stats, isLoading, error, pollCount, fetchStats } = useDashboard()
const cart = useCart()

// Cross-store filter composable — exercises combined watcher churn in the tracker
const { filteredProducts, filterText, activeFilters, setFilter, clearFilters, filterStats, setProducts } = useProductFilter()

// Parallel fetch — exercises the fetch dashboard showing multiple in-flight requests
const { data: products } = await useFetch('/api/products')

// Seed the product filter with the fetched list (and keep it reactive)
watch(
    () => products.value,
    (list) => {
        if (list) {
            setProducts(list as Parameters<typeof setProducts>[0])
        }
    },
    { immediate: true }
)

const tableRows = computed(() => products.value ?? [])
const showLeakyAudit = ref(false)
</script>

<template>
    <div>
        <header class="page-header">
            <div>
                <h1>Dashboard</h1>
                <p>useDashboard composable · polling fetch · DataTable heatmap · parallel fetches · cross-store filter</p>
            </div>
            <div class="header-chips">
                <div v-if="authContext" class="user-chip">
                    {{ authContext.user.name }}
                </div>
                <div v-if="analyticsContext" class="analytics-chip">
                    layout: {{ analyticsContext.layout }} · theme: {{ analyticsContext.theme }}
                </div>
            </div>
        </header>

        <main class="page-body">
            <!-- cross-store product filter — exercises useProductFilter watcher churn -->
            <section class="section">
                <div class="section-head">
                    <h2>Product Filter</h2>
                    <span class="filter-badge">{{ filterStats.totalWatcherFires }} watcher fires</span>
                    <button v-if="activeFilters.length" @click="clearFilters">✕ Clear filters</button>
                </div>
                <p style="font-size: 12px; color: #888; margin-bottom: 12px">
                    Typing changes both cart-store and user-store watchers simultaneously — stress-tests the composable tracker.
                </p>
                <div class="filter-row">
                    <input
                        :value="filterText"
                        placeholder="Filter products…"
                        class="filter-input"
                        @input="setFilter('text', ($event.target as HTMLInputElement).value)"
                    />
                    <button class="filter-btn" @click="setFilter('inCartOnly', !activeFilters.includes('inCartOnly'))">
                        {{ activeFilters.includes('inCartOnly') ? '✓ In cart only' : 'In cart only' }}
                    </button>
                    <button class="filter-btn" @click="setFilter('userCurrency', !activeFilters.includes('userCurrency'))">
                        {{ activeFilters.includes('userCurrency') ? '✓ Currency match' : 'Currency match' }}
                    </button>
                </div>
                <div v-if="filteredProducts.length" class="filter-results">
                    <span v-for="p in filteredProducts.slice(0, 5)" :key="p.id" class="filter-chip">{{ p.name }}</span>
                    <span v-if="filteredProducts.length > 5" class="filter-more">+{{ filteredProducts.length - 5 }} more</span>
                </div>
                <div v-else class="filter-empty">No products match the current filters.</div>
            </section>
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

h2 {
    font-size: 15px;
    font-weight: 600;
    margin: 0 0 12px;
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

.header-chips {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 6px;
}

.analytics-chip {
    background: #f0f9ff;
    border: 1px solid #bae6fd;
    border-radius: 99px;
    padding: 4px 14px;
    font-size: 12px;
    color: #0369a1;
}

.filter-badge {
    font-size: 11px;
    background: #fefce8;
    color: #854d0e;
    border: 1px solid #fde68a;
    border-radius: 99px;
    padding: 2px 8px;
}

.filter-row {
    display: flex;
    gap: 8px;
    align-items: center;
    flex-wrap: wrap;
    margin-bottom: 12px;
}

.filter-input {
    flex: 1;
    min-width: 160px;
    padding: 6px 10px;
    border: 1px solid #d3d1c7;
    border-radius: 7px;
    font-size: 13px;
}

.filter-btn {
    font-size: 12px;
    padding: 5px 10px;
    border-radius: 7px;
    border: 1px solid #d3d1c7;
    background: white;
    cursor: pointer;
}

.filter-results {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
}

.filter-chip {
    background: #f0ede8;
    border-radius: 6px;
    padding: 3px 8px;
    font-size: 12px;
    color: #555;
}

.filter-more {
    font-size: 12px;
    color: #888;
    padding: 3px 0;
}

.filter-empty {
    font-size: 13px;
    color: #aaa;
    padding: 8px 0;
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
