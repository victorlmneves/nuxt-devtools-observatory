import { ref } from 'vue'

/**
 * Intentionally leaks its setInterval to demonstrate the composable tracker's
 * leak detection. Do NOT use this pattern in real code.
 * @returns {{ ticks: import('vue').Ref<number> }} Reactive tick counter
 */
export function useLeakyPoller() {
    const ticks = ref(0)

    // BUG: setInterval is never cleared — no onUnmounted hook
    setInterval(() => {
        ticks.value++
    }, 1000)

    return { ticks }
}
