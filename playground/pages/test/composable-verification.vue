<script setup lang="ts">
import { ref, onMounted } from 'vue'

// Test composable: Simple counter
const useCounter = (initialValue: number = 0) => {
    const count = ref(initialValue)
    const increment = () => count.value++
    const decrement = () => count.value--

    return { count, increment, decrement }
}

// Test composable: Shared state across instances
const useSharedState = () => {
    // Shared state across instances (global)
    const sharedCounter = ref(0)
    const localState = ref(0)

    const incrementShared = () => sharedCounter.value++
    const incrementLocal = () => localState.value++

    return { sharedCounter, localState, incrementShared, incrementLocal }
}

// Test composable: Editable state for inline editing verification
const useEditableState = () => {
    const counter = ref(0)
    const textValue = ref('initial text')
    const nestedObject = ref({ level1: { level2: { value: 'deep' } } })

    const setCounter = (value: number) => {
        counter.value = value

        if (import.meta.dev) {
            ;(window as unknown as { __editableComponentCounter?: number }).__editableComponentCounter = value
        }
    }

    const setTextValue = (value: string) => {
        textValue.value = value
    }

    return { counter, textValue, nestedObject, setCounter, setTextValue }
}

// Test composable: Leaky poller (for leak detection)
const useLeakyPoller = () => {
    const pollCount = ref(0)
    let intervalId: NodeJS.Timeout | null = null

    const startPolling = () => {
        if (intervalId) {
            return
        }

        intervalId = setInterval(() => {
            pollCount.value++
        }, 100)
    }

    const stopPolling = () => {
        if (intervalId) {
            clearInterval(intervalId)
            intervalId = null
        }
    }

    // Start polling immediately (this will leak if component unmounts without cleanup)
    if (import.meta.client) {
        startPolling()
    }

    return { pollCount, stopPolling }
}

// Component instances for testing
const counterComposable = useCounter()
const sharedStateComposable1 = useSharedState()
const sharedStateComposable2 = useSharedState()
const editableStateComposable = useEditableState()
const leakyPollerComposable = useLeakyPoller()

// Component visibility state
const showLeakyComponent = ref(true)
const showSharedStateComponent1 = ref(true)
const showSharedStateComponent2 = ref(true)
const showEditableComponent = ref(true)
const showTrackedComponent = ref(true)

// Tracked counter for history verification
const trackedCounter = useCounter()

// Expose for testing
if (import.meta.dev) {
    onMounted(() => {
        ;(window as unknown as { __editableComponentCounter?: number }).__editableComponentCounter = 0
    })
}

// Control methods
const unmountLeakyComponent = (): void => {
    leakyPollerComposable.stopPolling()
    showLeakyComponent.value = false
}

const remountLeakyComponent = (): void => {
    // This will create a new instance with a new leak
    window.location.reload()
}

const incrementSharedCounter1 = (): void => {
    sharedStateComposable1.incrementShared()
}

const incrementSharedCounter2 = (): void => {
    sharedStateComposable2.incrementShared()
}

const incrementLocalCounter1 = (): void => {
    sharedStateComposable1.incrementLocal()
}

const incrementLocalCounter2 = (): void => {
    sharedStateComposable2.incrementLocal()
}

const updateEditableCounter = (): void => {
    const newValue = editableStateComposable.counter.value + 1
    editableStateComposable.setCounter(newValue)
}

const updateEditableText = (): void => {
    editableStateComposable.setTextValue(`Updated at ${new Date().toLocaleTimeString()}`)
}

const incrementTrackedCounter = (): void => {
    trackedCounter.increment()
}

const resetAllComponents = (): void => {
    showLeakyComponent.value = true
    showSharedStateComponent1.value = true
    showSharedStateComponent2.value = true
    showEditableComponent.value = true
    showTrackedComponent.value = true
}
</script>

<template>
    <div class="layout">
        <h2>Composable Tracker Verification Test Page</h2>

        <div class="controls">
            <button data-testid="unmount-leaky-component" @click="unmountLeakyComponent">Unmount Leaky Component</button>
            <button data-testid="remount-leaky-component" @click="remountLeakyComponent">Remount Leaky Component</button>

            <button data-testid="increment-shared-1" @click="incrementSharedCounter1">Increment Shared Counter (Comp 1)</button>
            <button data-testid="increment-shared-2" @click="incrementSharedCounter2">Increment Shared Counter (Comp 2)</button>
            <button data-testid="increment-local-1" @click="incrementLocalCounter1">Increment Local Counter (Comp 1)</button>
            <button data-testid="increment-local-2" @click="incrementLocalCounter2">Increment Local Counter (Comp 2)</button>

            <button data-testid="update-editable-counter" @click="updateEditableCounter">Update Editable Counter</button>
            <button data-testid="update-editable-text" @click="updateEditableText">Update Editable Text</button>

            <button data-testid="increment-tracked-counter" @click="incrementTrackedCounter">Increment Tracked Counter</button>

            <button data-testid="reset-all" @click="resetAllComponents">Reset All Components</button>
        </div>

        <!-- Leaky Component (for leak detection test) -->
        <div v-if="showLeakyComponent" data-testid="leaky-component" class="component">
            <h3>Leaky Component (useLeakyPoller)</h3>
            <p>Poll Count: {{ leakyPollerComposable.pollCount.value }}</p>
            <p class="warning">⚠️ This component intentionally leaks an interval when unmounted</p>
        </div>

        <!-- Shared State Component 1 (for global state detection) -->
        <div v-if="showSharedStateComponent1" data-testid="shared-state-1" class="component">
            <h3>Shared State Component 1</h3>
            <p>Shared Counter: {{ sharedStateComposable1.sharedCounter.value }}</p>
            <p>Local Counter: {{ sharedStateComposable1.localState.value }}</p>
            <button @click="incrementSharedCounter1">+1 Shared</button>
            <button @click="incrementLocalCounter1">+1 Local</button>
        </div>

        <!-- Shared State Component 2 (for global state detection) -->
        <div v-if="showSharedStateComponent2" data-testid="shared-state-2" class="component">
            <h3>Shared State Component 2</h3>
            <p>Shared Counter: {{ sharedStateComposable2.sharedCounter.value }}</p>
            <p>Local Counter: {{ sharedStateComposable2.localState.value }}</p>
            <button @click="incrementSharedCounter2">+1 Shared</button>
            <button @click="incrementLocalCounter2">+1 Local</button>
        </div>

        <!-- Editable Component (for inline editing test) -->
        <div v-if="showEditableComponent" data-testid="editable-component" class="component">
            <h3>Editable State Component (useEditableState)</h3>
            <p>Counter: {{ editableStateComposable.counter.value }}</p>
            <p>Text: {{ editableStateComposable.textValue.value }}</p>
            <p>Nested Object: {{ JSON.stringify(editableStateComposable.nestedObject.value) }}</p>
            <button @click="updateEditableCounter">Update Counter</button>
            <button @click="updateEditableText">Update Text</button>
        </div>

        <!-- Tracked Component (for history verification) -->
        <div v-if="showTrackedComponent" data-testid="tracked-component" class="component">
            <h3>Tracked Counter Component (useCounter)</h3>
            <p>Count: {{ trackedCounter.count.value }}</p>
            <button @click="trackedCounter.increment">+1</button>
            <button @click="trackedCounter.decrement">-1</button>
        </div>

        <!-- Simple counter display -->
        <div class="component">
            <h3>Basic Counter (useCounter)</h3>
            <p>Count: {{ counterComposable.count.value }}</p>
            <button @click="counterComposable.increment">+1</button>
            <button @click="counterComposable.decrement">-1</button>
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

.warning {
    color: #e67e22;
    font-size: 0.9em;
    margin-top: 10px;
}
</style>
