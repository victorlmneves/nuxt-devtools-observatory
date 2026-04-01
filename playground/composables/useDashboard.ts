import { ref, computed, watchEffect, onUnmounted } from 'vue'
import { useCartStore } from '../stores/cart'

interface StatsSnapshot {
    timestamp: number
    activeUsers: number
    pageViews: number
    conversionRate: number
    revenue: number
    topPages: Array<{ path: string; views: number }>
}

/**
 * useDashboard — composable that combines:
 *   1. Polling /api/stats every 4 seconds via a manual setInterval
 *   2. A watchEffect that logs whenever the cart total changes
 *   3. Proper onUnmounted cleanup (interval + watcher)
 *
 * The Composable Tracker should show:
 *   - intervalCount: 1
 *   - watcherCount: >= 1
 *   - lifecycle.intervalsCleaned: true
 *   - lifecycle.watchersCleaned: true (no leak)
 * @returns {object} Live stats state, cart-derived metrics, and a manual refresh function.
 */
export function useDashboard() {
    const stats = ref<StatsSnapshot | null>(null)
    const isLoading = ref(false)
    const error = ref<string | null>(null)
    const pollCount = ref(0)

    const store = useCartStore()

    const cartRevenue = computed(() => store.total)

    // Watcher that reacts to cart changes — properly cleaned up
    const stopEffect = watchEffect(() => {
        if (import.meta.dev && stats.value) {
            // Accessing cartRevenue.value here makes it a dependency
            const combined = stats.value.revenue + cartRevenue.value
            // eslint-disable-next-line no-console
            console.log('[useDashboard] combined revenue (server + cart):', combined.toFixed(2))
        }
    })

    async function fetchStats() {
        isLoading.value = true
        error.value = null

        try {
            const data = await $fetch<StatsSnapshot>('/api/stats')
            stats.value = data
            pollCount.value++
        } catch (e) {
            error.value = e instanceof Error ? e.message : 'Failed to fetch stats'
        } finally {
            isLoading.value = false
        }
    }

    // Kick off the first fetch immediately — client-only (polling is a client concept;
    // using useFetch/useAsyncData would be more idiomatic for SSR, but here we
    // deliberately use $fetch + manual polling to exercise the Composable Tracker's
    // intervalCount / intervalsCleaned tracking)
    let intervalId: ReturnType<typeof setInterval> | null = null

    if (import.meta.client) {
        fetchStats()
        intervalId = setInterval(fetchStats, 4000)
    }

    onUnmounted(() => {
        if (intervalId !== null) clearInterval(intervalId)
        stopEffect()
    })

    return { stats, isLoading, error, pollCount, cartRevenue, fetchStats }
}
