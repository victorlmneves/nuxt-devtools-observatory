<script setup lang="ts">
import { ref, onMounted, onUnmounted, nextTick } from 'vue'

// Slow Component - simulates slow mount timing
const showSlowComponent = ref(false)
const slowComponentMountTime = ref<number | null>(null)

// Heavy Render Component - simulates heavy DOM rendering
const showHeavyComponent = ref(false)
const heavyListItems = ref<number[]>([])

// Transition component
const showTransition = ref(false)

// Track mount start time for verification
onMounted(() => {
    if (import.meta.dev) {
        ;(window as unknown as { __lastMountStart?: number }).__lastMountStart = performance.now()
    }
})

const mountSlowComponent = (): void => {
    if (import.meta.dev) {
        ;(window as unknown as { __lastMountStart?: number }).__lastMountStart = performance.now()
    }

    showSlowComponent.value = true
    slowComponentMountTime.value = performance.now()
}

const unmountSlowComponent = (): void => {
    showSlowComponent.value = false
    slowComponentMountTime.value = null
}

const renderHeavyComponent = (): void => {
    if (import.meta.dev) {
        ;(window as unknown as { __heavyRenderStart?: number }).__heavyRenderStart = performance.now()
    }

    // Generate 5000 items for heavy rendering
    const items: number[] = []

    for (let i = 0; i < 5000; i++) {
        items.push(i)
    }

    heavyListItems.value = items
    showHeavyComponent.value = true
}

const clearHeavyComponent = (): void => {
    heavyListItems.value = []
    showHeavyComponent.value = false
}

const triggerNestedAsync = async (): Promise<void> => {
    // Sequential fetches to test parent-child relationships
    const response1 = await fetch('/api/slow-endpoint')
    await response1.json()

    const response2 = await fetch('/api/another-endpoint')
    await response2.json()
}

const triggerParallelFetches = async (): Promise<void> => {
    // Parallel fetches to test concurrent spans
    const fetch1 = fetch('/api/test-1')
    const fetch2 = fetch('/api/test-2')
    const fetch3 = fetch('/api/test-3')

    await Promise.all([fetch1, fetch2, fetch3])
}

const triggerAllSpans = async (): Promise<void> => {
    // 1. Trigger navigation span
    await navigateTo('/test-route')

    // 2. Trigger component and render spans
    mountSlowComponent()
    await nextTick()

    // 3. Trigger fetch span
    await fetch('/api/test')

    // 4. Trigger transition span
    showTransition.value = true
    await nextTick()
    await new Promise((resolve) => setTimeout(resolve, 100))
    showTransition.value = false

    // 5. Trigger server span (requires SSR)
    try {
        await $fetch('/api/server-side-operation')
    } catch {
        // Ignore if endpoint doesn't exist
    }

    // 6. Trigger composable span via composable usage
    const testComposable = useTestComposable()
    testComposable.increment()
}

// Mock composable for testing trace spans
const useTestComposable = () => {
    const count = ref(0)
    const increment = () => {
        count.value++
    }

    return { count, increment }
}

// Simulate expensive operation that blocks render
const triggerExpensiveRender = (): void => {
    if (import.meta.dev) {
        /**
         * Marks the start of a heavy render operation by recording the current performance timestamp.
         * The semicolon at the beginning ensures this statement is independent and prevents potential
         * issues with automatic semicolon insertion (ASI) if this code follows certain expressions.
         * The timestamp is stored in a global window property for later performance analysis or verification.
         */
        ;(window as unknown as { __heavyRenderStart?: number }).__heavyRenderStart = performance.now()
    }

    // Force multiple re-renders
    for (let i = 0; i < 100; i++) {
        heavyListItems.value = [...heavyListItems.value, i]
    }
}

// Navigate to different routes for trace separation
const navigateToRoute = async (route: string): Promise<void> => {
    await navigateTo(route)
}

// Clean up on unmount
onUnmounted(() => {
    if (showSlowComponent.value) {
        unmountSlowComponent()
    }

    if (showHeavyComponent.value) {
        clearHeavyComponent()
    }
})
</script>

<template>
    <div class="layout">
        <h2>Trace Verification Test Page</h2>

        <div class="controls">
            <button data-testid="mount-slow-component" @click="mountSlowComponent">Mount Slow Component</button>
            <button data-testid="unmount-slow-component" @click="unmountSlowComponent">Unmount Slow Component</button>

            <button data-testid="render-heavy-component" @click="renderHeavyComponent">Render Heavy Component (5000 items)</button>
            <button data-testid="clear-heavy-component" @click="clearHeavyComponent">Clear Heavy Component</button>

            <button data-testid="nested-async-operations" @click="triggerNestedAsync">Test Nested Async (Sequential)</button>

            <button data-testid="parallel-fetches" @click="triggerParallelFetches">Test Parallel Fetches</button>

            <button data-testid="expensive-render" @click="triggerExpensiveRender">Trigger Expensive Render</button>

            <button data-testid="trigger-all-spans" @click="triggerAllSpans">Trigger All Span Types</button>

            <button data-testid="show-transition" @click="showTransition = true">Show Transition</button>
            <button data-testid="hide-transition" @click="showTransition = false">Hide Transition</button>
        </div>

        <div class="navigation-controls">
            <h3>Navigation Testing</h3>
            <div class="nav-buttons">
                <button data-testid="nav-to-route-0" @click="() => navigateToRoute('/')">Home</button>
                <button data-testid="nav-to-route-1" @click="() => navigateToRoute('/route-1')">Route 1</button>
                <button data-testid="nav-to-route-2" @click="() => navigateToRoute('/route-2')">Route 2</button>
                <button data-testid="nav-to-route-3" @click="() => navigateToRoute('/route-3')">Route 3</button>
                <button data-testid="nav-to-route-4" @click="() => navigateToRoute('/route-4')">Route 4</button>
            </div>
        </div>

        <!-- Slow Component - simulates slow mount timing -->
        <div v-if="showSlowComponent" data-testid="slow-component-mounted" class="component slow-component">
            <h3>Slow Component (Simulated Slow Mount)</h3>
            <p>This component simulates a slow mounting process for trace duration testing.</p>
            <p>Mount time: {{ slowComponentMountTime }}</p>
            <div class="slow-inner">
                <!-- Simulate complex nested structure -->
                <div v-for="i in 100" :key="i" class="slow-item">Nested Item {{ i }}</div>
            </div>
        </div>

        <!-- Heavy Render Component - simulates heavy DOM rendering -->
        <div v-if="showHeavyComponent" data-testid="heavy-component-mounted" class="component heavy-component">
            <h3>Heavy Render Component</h3>
            <p>Items rendered: {{ heavyListItems.length }}</p>
            <div class="heavy-list">
                <div v-for="item in heavyListItems.slice(0, 100)" :key="item" class="heavy-item">Heavy Item {{ item }}</div>
                <div v-if="heavyListItems.length > 100" class="more-items">... and {{ heavyListItems.length - 100 }} more items</div>
            </div>
        </div>

        <!-- Transition Component -->
        <Transition name="fade" data-testid="transition-container">
            <div v-if="showTransition" data-testid="transition-element" class="transition-box">
                <h3>Transition Content</h3>
                <p>This element animates with Vue Transition</p>
            </div>
        </Transition>
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

.navigation-controls {
    margin: 20px 0;
    padding: 15px;
    border: 1px solid #ddd;
    border-radius: 8px;
    background-color: #f5f5f5;
}

.navigation-controls h3 {
    margin-top: 0;
    margin-bottom: 10px;
}

.nav-buttons {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
}

button {
    padding: 8px 16px;
    background-color: #42b883;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    transition: background-color 0.2s;
}

button:hover {
    background-color: #3aa876;
}

.component {
    margin: 20px 0;
    padding: 15px;
    border: 1px solid #ddd;
    border-radius: 8px;
    background-color: #f9f9f9;
}

.component h3 {
    margin-top: 0;
    color: #2c3e50;
}

.slow-component {
    border-left: 4px solid #e74c3c;
}

.slow-inner {
    max-height: 200px;
    overflow-y: auto;
    margin-top: 10px;
    padding: 10px;
    background-color: #f0f0f0;
    border-radius: 4px;
}

.slow-item {
    padding: 2px 4px;
    font-size: 12px;
    border-bottom: 1px solid #e0e0e0;
}

.heavy-component {
    border-left: 4px solid #3498db;
}

.heavy-list {
    max-height: 300px;
    overflow-y: auto;
    margin-top: 10px;
    padding: 10px;
    background-color: #f0f0f0;
    border-radius: 4px;
}

.heavy-item {
    padding: 4px 8px;
    font-size: 12px;
    border-bottom: 1px solid #e0e0e0;
}

.more-items {
    padding: 8px;
    text-align: center;
    color: #7f8c8d;
    font-style: italic;
}

.transition-box {
    margin: 20px 0;
    padding: 20px;
    background-color: #42b883;
    color: white;
    border-radius: 8px;
    text-align: center;
}

.transition-box h3 {
    margin: 0 0 10px;
    color: white;
}

.fade-enter-active,
.fade-leave-active {
    transition:
        opacity 0.3s ease,
        transform 0.3s ease;
}

.fade-enter-from {
    opacity: 0;
    transform: translateY(-10px);
}

.fade-leave-to {
    opacity: 0;
    transform: translateY(10px);
}
</style>
