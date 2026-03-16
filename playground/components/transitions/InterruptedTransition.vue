<script setup lang="ts">
/**
 * InterruptedTransition — demonstrates the "component unmounted mid-transition" failure.
 *
 * The enter transition takes 1.5 s. After 150 ms the parent <div v-if> is set to
 * false, tearing down the <Transition> component while the enter is still in-flight.
 * Vue never fires onAfterEnter, so the Observatory's onUnmounted hook fires instead
 * and records the entry with phase 'interrupted'.
 *
 * What to look for in the Transition Tracker:
 *   - An entry with direction 'enter' and phase 'interrupted'
 *   - A durationMs around 150 ms (much shorter than the 1.5 s animation)
 */
import { ref, nextTick } from 'vue'

const wrapperMounted = ref(true)
const show = ref(false)

async function startAndInterrupt() {
    // Reset to a clean state first
    wrapperMounted.value = true
    show.value = false
    await nextTick()

    // Begin the enter transition
    show.value = true

    // After 150 ms (well before the 1.5 s CSS transition ends),
    // unmount the parent — this tears down <Transition> mid-flight
    setTimeout(async () => {
        wrapperMounted.value = false
        await nextTick()
        // Restore the wrapper so the demo can be repeated
        setTimeout(() => {
            wrapperMounted.value = true
        }, 300)
    }, 150)
}
</script>

<template>
    <div class="demo-card">
        <h3>
            Mid-flight unmount
            <span class="badge warn">interrupted</span>
        </h3>
        <p class="hint">
            The enter transition takes 1.5 s. After 150 ms the parent component is torn down — Vue never fires
            <code>onAfterEnter</code>
            . The Observatory detects this via
            <code>onUnmounted</code>
            and records the entry with phase
            <code>interrupted</code>
            .
        </p>
        <div class="controls">
            <button @click="startAndInterrupt">Start &amp; interrupt</button>
        </div>
        <div v-if="wrapperMounted" style="min-height: 60px; margin-top: 12px">
            <Transition name="slow-enter">
                <div v-if="show" class="interrupted-box">Entering… (will be interrupted)</div>
            </Transition>
        </div>
    </div>
</template>

<style scoped>
.slow-enter-enter-active {
    transition: opacity 1.5s ease, transform 1.5s ease;
}

.slow-enter-enter-from {
    opacity: 0;
    transform: translateX(-20px);
}

.interrupted-box {
    padding: 12px 16px;
    background: #fff8e7;
    border: 1px solid #e09a3a;
    border-radius: 8px;
    color: #b36a0a;
    font-size: 13px;
    font-weight: 500;
}
</style>
