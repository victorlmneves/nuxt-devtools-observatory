import { ref } from 'vue'

/**
 * @devtools-demo This composable intentionally leaks its setInterval
 * to demonstrate the composable tracker's leak detection.
 * Do NOT use this pattern in real code.
 */
export function useLeakyPoller() {
    const ticks = ref(0)

    // BUG: setInterval is never cleared — no onUnmounted hook
    setInterval(() => {
        ticks.value++
    }, 1000)

    return { ticks }
}
