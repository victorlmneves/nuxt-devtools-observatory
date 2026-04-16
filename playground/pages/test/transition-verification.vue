<script setup lang="ts">
import { ref } from 'vue'

const showTransition = ref(false)
const showBrokenTransition = ref(false)
const showNestedTransition = ref(false)
const showSlowTransition = ref(false)
const transitionCount = ref(0)
const cancellationCount = ref(0)

const toggleTransition = (): void => {
    showTransition.value = !showTransition.value

    if (!showTransition.value) {
        transitionCount.value++
    }
}

const rapidToggle = async (): Promise<void> => {
    for (let i = 0; i < 5; i++) {
        showTransition.value = true
        await new Promise((resolve) => setTimeout(resolve, 50))
        showTransition.value = false
        cancellationCount.value++
        await new Promise((resolve) => setTimeout(resolve, 50))
    }
}

const showBroken = (): void => {
    showBrokenTransition.value = true
    setTimeout(() => {
        showBrokenTransition.value = false
    }, 500)
}

const showNested = (): void => {
    showNestedTransition.value = true
    setTimeout(() => {
        showNestedTransition.value = false
    }, 500)
}

const showSlow = (): void => {
    showSlowTransition.value = true
    setTimeout(() => {
        showSlowTransition.value = false
    }, 1000)
}
</script>

<template>
    <div class="layout">
        <h2>Transition Tracker Verification Test Page</h2>

        <div class="controls">
            <button data-testid="show-transition" @click="showTransition = true">Show Transition</button>
            <button data-testid="hide-transition" @click="showTransition = false">Hide Transition</button>
            <button data-testid="toggle-transition" @click="toggleTransition">Toggle Transition (Count: {{ transitionCount }})</button>
            <button data-testid="toggle-transition-rapid" @click="rapidToggle">
                Rapid Toggle (Cancellations: {{ cancellationCount }})
            </button>
            <button data-testid="show-broken-transition" @click="showBroken">Show Broken Transition</button>
            <button data-testid="show-nested-transition" @click="showNested">Show Nested Transition</button>
            <button data-testid="show-slow-transition" @click="showSlow">Show Slow Transition (1s)</button>
        </div>

        <!-- Normal Transition -->
        <Transition name="fade">
            <div v-if="showTransition" data-testid="transition-visible" class="transition-box normal">
                <h3>Normal Transition</h3>
                <p>This transition has proper CSS classes</p>
                <p>Toggle count: {{ transitionCount }}</p>
            </div>
        </Transition>

        <!-- Slow Transition -->
        <Transition name="slow">
            <div v-if="showSlowTransition" class="transition-box slow">
                <h3>Slow Transition (1 second)</h3>
                <p>This transition takes 1 second to complete</p>
                <p>Tests duration accuracy with longer animations</p>
            </div>
        </Transition>

        <!-- Broken Transition (missing CSS) -->
        <Transition name="broken">
            <div v-if="showBrokenTransition" class="transition-box broken">
                <h3>Broken Transition</h3>
                <p>This transition has missing CSS classes</p>
                <p>Should show error in transition tracker</p>
            </div>
        </Transition>

        <!-- Nested Transition -->
        <Transition name="fade">
            <div v-if="showNestedTransition" class="transition-box nested-parent">
                <h3>Parent Transition</h3>
                <p>This contains a nested transition</p>
                <Transition name="slide">
                    <div v-if="showNestedTransition" class="nested-box">Nested Content - This should appear as a separate transition</div>
                </Transition>
            </div>
        </Transition>

        <div class="info">
            <h3>Testing Instructions</h3>
            <ul>
                <li>Open Nuxt DevTools → Observatory → Transitions tab</li>
                <li>Click "Toggle Transition" and verify entering/entered/leaving/left phases appear</li>
                <li>Click "Rapid Toggle" and verify enter-cancelled/leave-cancelled phases appear</li>
                <li>Click "Show Broken Transition" and verify error is captured</li>
                <li>Click "Show Slow Transition" and verify duration is accurately measured (~1000ms)</li>
                <li>Click "Show Nested Transition" and verify both parent and child transitions are tracked</li>
            </ul>
        </div>
    </div>
</template>

<style scoped>
.layout {
    padding: 20px;
    font-family: sans-serif;
}

.controls {
    display: flex;
    gap: 10px;
    margin-bottom: 20px;
    flex-wrap: wrap;
}

button {
    padding: 8px 16px;
    background-color: #42b883;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
}

button:hover {
    background-color: #3aa876;
}

.transition-box {
    margin: 20px 0;
    padding: 20px;
    border-radius: 8px;
    text-align: center;
}

.transition-box h3 {
    margin: 0 0 10px;
}

.transition-box p {
    margin: 5px 0;
}

.normal {
    background-color: #42b883;
    color: white;
}

.normal h3 {
    color: white;
}

.slow {
    background-color: #3498db;
    color: white;
}

.slow h3 {
    color: white;
}

.broken {
    background-color: #e74c3c;
    color: white;
}

.broken h3 {
    color: white;
}

.nested-parent {
    background-color: #9b59b6;
    color: white;
}

.nested-parent h3 {
    color: white;
}

.nested-box {
    margin-top: 20px;
    padding: 15px;
    background-color: #8e44ad;
    border-radius: 4px;
}

/* Working transitions */
.fade-enter-active,
.fade-leave-active {
    transition: opacity 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
    opacity: 0;
}

.slow-enter-active,
.slow-leave-active {
    transition: opacity 1s ease;
}

.slow-enter-from,
.slow-leave-to {
    opacity: 0;
}

.slide-enter-active,
.slide-leave-active {
    transition: transform 0.3s ease;
}

.slide-enter-from,
.slide-leave-to {
    transform: translateX(20px);
}

/* Broken transition - intentionally missing CSS classes */

/* No CSS for .broken-* classes - this will cause errors */

.info {
    margin-top: 30px;
    padding: 15px;
    background-color: #f5f5f5;
    border-radius: 8px;
}

.info h3 {
    margin-top: 0;
    color: #2c3e50;
}

.info ul {
    margin: 10px 0;
    padding-left: 20px;
}

.info li {
    margin: 5px 0;
    color: #555;
}
</style>
