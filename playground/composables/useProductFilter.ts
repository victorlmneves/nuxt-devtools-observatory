import { ref, computed, watch, onUnmounted } from 'vue'
import { useCartStore } from '../stores/cart'
import { useUserStore } from '../stores/user'

interface FilterableProduct {
    id: number
    name: string
    price: number
    currency?: string
}

/**
 * useProductFilter — cross-store watcher churn composable.
 *
 * Reads from BOTH cart store and user store simultaneously, creating watchers
 * that fire whenever either store changes. This exercises the composable tracker's
 * watcher counting and produces measurable churn when used alongside UI interactions
 * that mutate both stores (e.g. adding to cart while toggling preferences).
 *
 * Watcher inventory (all properly cleaned up):
 *   1. watch(filterText)       — re-filters when the text input changes
 *   2. watch(cartItems)        — re-filters when cart composition changes
 *   3. watch(userPreferences)  — re-filters when currency / locale / compactView changes
 *   4. watchEffect(combined)   — logs cross-store state on every combined mutation
 *
 * The composable tracker should show:
 *   - watcherCount: 4
 *   - lifecycle.watchersCleaned: true (no leak)
 * @returns {object} Filtered product list, active filter state, and setFilter/clearFilters helpers.
 */
export function useProductFilter() {
    const cartStore = useCartStore()
    const userStore = useUserStore()

    const _products = ref<FilterableProduct[]>([])
    const filterText = ref('')
    const activeFilters = ref<string[]>([])
    const filterStats = ref({ totalWatcherFires: 0 })

    // Derived: ids of products currently in cart
    const cartProductIds = computed(() => new Set(cartStore.items.map((i) => i.id)))

    // Derived: user's preferred currency
    const userCurrency = computed(() => userStore.preferences.currency)

    // ── filteredProducts ─────────────────────────────────────────────────────
    const filteredProducts = computed(() => {
        let list = _products.value

        if (filterText.value.trim()) {
            const needle = filterText.value.toLowerCase()
            list = list.filter((p) => p.name.toLowerCase().includes(needle))
        }

        if (activeFilters.value.includes('inCartOnly')) {
            list = list.filter((p) => cartProductIds.value.has(p.id))
        }

        if (activeFilters.value.includes('userCurrency')) {
            list = list.filter((p) => !p.currency || p.currency === userCurrency.value)
        }

        return list
    })

    // ── watcher 1: text input ─────────────────────────────────────────────────
    const stopTextWatch = watch(filterText, () => {
        filterStats.value.totalWatcherFires++

        if (import.meta.dev) {
            // eslint-disable-next-line no-console
            console.log('[useProductFilter] text filter changed:', filterText.value)
        }
    })

    // ── watcher 2: cart items ─────────────────────────────────────────────────
    const stopCartWatch = watch(
        () => cartStore.items.map((i) => i.id).join(','),
        (ids) => {
            filterStats.value.totalWatcherFires++
            if (import.meta.dev) {
                // eslint-disable-next-line no-console
                console.log('[useProductFilter] cart changed, item ids:', ids)
            }
        }
    )

    // ── watcher 3: user preferences ──────────────────────────────────────────
    const stopPrefWatch = watch(
        () => ({ currency: userStore.preferences.currency, locale: userStore.preferences.locale }),
        (prefs) => {
            filterStats.value.totalWatcherFires++

            if (import.meta.dev) {
                // eslint-disable-next-line no-console
                console.log('[useProductFilter] user prefs changed:', prefs)
            }
        },
        { deep: true }
    )

    // ── watcher 4: combined cross-store watchEffect ───────────────────────────
    const stopCombinedWatch = watch([() => cartStore.total, () => userStore.preferences.compactView], ([cartTotal, compactView]) => {
        filterStats.value.totalWatcherFires++

        if (import.meta.dev) {
            // eslint-disable-next-line no-console
            console.log('[useProductFilter] combined state:', { cartTotal: cartTotal.toFixed(2), compactView })
        }
    })

    onUnmounted(() => {
        stopTextWatch()
        stopCartWatch()
        stopPrefWatch()
        stopCombinedWatch()
    })

    // ── helpers ───────────────────────────────────────────────────────────────

    /**
     * Load (or replace) the full product list that this composable filters.
     * @param {FilterableProduct[]} products - The new product list to filter against.
     */
    function setProducts(products: FilterableProduct[]) {
        _products.value = products
    }

    /**
     * Set a named filter key/value.
     * - 'text' string value → updates filterText
     * - boolean key (e.g. 'inCartOnly') → toggles it in activeFilters
     * @param {string} key - The filter key ('text', 'inCartOnly', 'userCurrency').
     * @param {string | boolean} value - The new value for the filter.
     */
    function setFilter(key: string, value: string | boolean) {
        if (key === 'text' && typeof value === 'string') {
            filterText.value = value

            return
        }

        if (typeof value === 'boolean') {
            if (value && !activeFilters.value.includes(key)) {
                activeFilters.value = [...activeFilters.value, key]
            } else if (!value) {
                activeFilters.value = activeFilters.value.filter((f) => f !== key)
            }
        }
    }

    function clearFilters() {
        filterText.value = ''
        activeFilters.value = []
    }

    return {
        filteredProducts,
        filterText,
        activeFilters,
        filterStats,
        setProducts,
        setFilter,
        clearFilters,
    }
}
