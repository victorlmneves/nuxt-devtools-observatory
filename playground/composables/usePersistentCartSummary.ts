import { computed, onUnmounted, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useCartStore } from '../stores/cart'

/**
 * usePersistentCartSummary — layout-level cart summary composable.
 *
 * This composable consumes the same Pinia cart store as `useCart`, but is meant
 * to be used by a persistent layout component so it stays mounted while pages
 * change. That makes it a good demo of cross-navigation composable continuity.
 * @returns {object} Read-only cart summary for persistent navigation UI.
 */
export function usePersistentCartSummary() {
    const store = useCartStore()
    const { itemCount, total, items } = storeToRefs(store)
    const lastChangeAt = ref<number | null>(null)

    const stopWatch = watch(itemCount, () => {
        lastChangeAt.value = Date.now()
    })

    onUnmounted(() => {
        stopWatch()
    })

    return {
        itemCount,
        total,
        isEmpty: computed(() => items.value.length === 0),
        lastChangeAt,
    }
}
