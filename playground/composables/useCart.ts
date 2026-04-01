import { computed, onUnmounted, watch } from 'vue'
import { useCartStore } from '../stores/cart'

/**
 * useCart — wraps the Pinia cartStore and exposes a clean API.
 *
 * Demonstrates a composable that:
 *   - Consumes a Pinia store (cartStore)
 *   - Registers a watcher that is properly cleaned up on unmount
 *   - Shows as "healthy" in the Composable Tracker (no leaks)
 * @returns {object} Cart state plus add/remove helpers backed by the Pinia cart store.
 */
export function useCart() {
    const store = useCartStore()

    // This watcher logs cart changes and is properly cleaned up
    const stopCartWatch = watch(
        () => store.total,
        (newTotal) => {
            if (import.meta.dev) {
                // eslint-disable-next-line no-console
                console.log('[useCart] cart total changed:', newTotal.toFixed(2))
            }
        }
    )

    onUnmounted(() => {
        stopCartWatch()
    })

    const isEmpty = computed(() => store.items.length === 0)

    function addToCart(product: { id: number; name: string; price: number }, quantity = 1) {
        store.addItem(product, quantity)
    }

    function removeFromCart(productId: number) {
        store.removeItem(productId)
    }

    function decrementFromCart(productId: number) {
        store.decrementItem(productId)
    }

    return {
        items: computed(() => store.items),
        total: computed(() => store.total),
        itemCount: computed(() => store.itemCount),
        isEmpty,
        addToCart,
        removeFromCart,
        decrementFromCart,
    }
}
