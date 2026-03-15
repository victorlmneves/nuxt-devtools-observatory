import { ref, computed, onUnmounted, watch } from 'vue'

export function useCounter(initial = 0) {
    const counter = ref(initial)
    const doubled = computed(() => counter.value * 2)

    // This watcher is properly cleaned up — the composable tracker should show green
    const stopWatch = watch(counter, (val) => {
        if (import.meta.dev) {
            // eslint-disable-next-line no-console
            console.log('[useCounter] value changed to', val)
        }
    })

    onUnmounted(() => {
        stopWatch()
    })

    function increment() {
        counter.value++
    }

    function reset() {
        counter.value = initial
    }

    return { counter, doubled, increment, reset }
}
