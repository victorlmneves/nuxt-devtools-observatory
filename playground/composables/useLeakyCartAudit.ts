import { ref, watch } from 'vue'
import { useCartStore } from '../stores/cart'

/**
 * Intentionally leaky store-backed composable.
 *
 * It watches Pinia cart state and never stops the watcher on unmount.
 * The composable tracker should mark this as a leak after the component using
 * it is unmounted.
 * @returns {object} Audit event count and latest cart item count snapshot.
 */
export function useLeakyCartAudit() {
    const store = useCartStore()
    const auditEvents = ref(0)
    const latestItemCount = ref(store.itemCount)

    watch(
        () => store.itemCount,
        (count) => {
            latestItemCount.value = count
            auditEvents.value++

            if (import.meta.dev) {
                // eslint-disable-next-line no-console
                console.log('[useLeakyCartAudit] observed cart count', count)
            }
        },
        { immediate: true }
    )

    return { auditEvents, latestItemCount }
}
