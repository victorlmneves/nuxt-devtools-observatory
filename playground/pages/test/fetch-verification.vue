<script setup lang="ts">
import { ref } from 'vue'

const fetchStatus = ref('idle')
const fetchResult = ref('')
const fetchCount = ref(0)

// useFetch calls are instrumented by the Vite fetch-transform → __devFetchCall → fetch registry.
// immediate: false / watch: false prevents fetching on mount; execute() triggers on demand.
const { execute: runProduct } = useFetch('/api/product', { immediate: false, watch: false })
const { execute: runStats } = useFetch('/api/stats', { immediate: false, watch: false })
const { execute: runProducts } = useFetch('/api/products', { immediate: false, watch: false })
const { execute: runFailed } = useFetch('/api/does-not-exist-404', { immediate: false, watch: false })
const { execute: runP1 } = useFetch('/api/product', { key: 'verify-p1', immediate: false, watch: false })
const { execute: runP2 } = useFetch('/api/products', { key: 'verify-p2', immediate: false, watch: false })
const { execute: runP3 } = useFetch('/api/stats', { key: 'verify-p3', immediate: false, watch: false })
const { execute: runP4 } = useFetch('/api/product', { key: 'verify-p4', immediate: false, watch: false })
const { execute: runP5 } = useFetch('/api/products', { key: 'verify-p5', immediate: false, watch: false })

const triggerFetch = async (): Promise<void> => {
    fetchStatus.value = 'loading'
    try {
        await runProduct()
        fetchStatus.value = 'success'
        fetchResult.value = 'Basic fetch (/api/product) completed'
    } catch (error) {
        fetchStatus.value = 'error'
        fetchResult.value = String(error)
    }
}

const triggerSlowFetch = async (): Promise<void> => {
    fetchStatus.value = 'loading'
    const startTime = performance.now()

    try {
        await runStats()
        const duration = performance.now() - startTime
        fetchStatus.value = 'success'
        fetchResult.value = `Stats fetch completed in ${duration.toFixed(0)}ms`
    } catch (error) {
        fetchStatus.value = 'error'
        fetchResult.value = String(error)
    }
}

const triggerCachedFetch = async (): Promise<void> => {
    fetchStatus.value = 'loading'

    try {
        await runProducts()
        fetchStatus.value = 'success'
        fetchResult.value = 'Products fetch completed'
    } catch (error) {
        fetchStatus.value = 'error'
        fetchResult.value = String(error)
    }
}

const triggerFailedFetch = async (): Promise<void> => {
    fetchStatus.value = 'loading'

    try {
        await runFailed()
        fetchStatus.value = 'success'
    } catch {
        fetchStatus.value = 'error'
        fetchResult.value = '404 error captured as expected'
    }
}

const triggerParallelFetches = async (): Promise<void> => {
    fetchStatus.value = 'loading'
    await Promise.all([runP1(), runP2(), runP3(), runP4(), runP5()])
    fetchStatus.value = 'success'
    fetchResult.value = `5 parallel fetches completed at ${new Date().toLocaleTimeString()}`
}

const triggerSequentialFetches = async (): Promise<void> => {
    fetchStatus.value = 'loading'
    const startTime = performance.now()
    await runProduct()
    await runStats()
    await runProducts()
    const duration = performance.now() - startTime
    fetchStatus.value = 'success'
    fetchResult.value = `3 sequential fetches completed in ${duration.toFixed(0)}ms`
}

const triggerLargePayload = async (): Promise<void> => {
    fetchStatus.value = 'loading'

    try {
        await runProducts()
        fetchStatus.value = 'success'
        fetchResult.value = 'Large payload fetch completed'
    } catch (error) {
        fetchStatus.value = 'error'
        fetchResult.value = String(error)
    }
}

const triggerFetchByNumber = async (index: number): Promise<void> => {
    fetchStatus.value = 'loading'

    try {
        if (index % 3 === 0) {
            await runStats()
        } else if (index % 2 === 0) {
            await runProducts()
        } else {
            await runProduct()
        }

        fetchCount.value++
        fetchStatus.value = 'success'
        fetchResult.value = `Fetch ${index} completed (${fetchCount.value} total)`
    } catch {
        fetchStatus.value = 'error'
        fetchResult.value = `Fetch ${index} failed`
    }
}

const clearResults = (): void => {
    fetchStatus.value = 'idle'
    fetchResult.value = ''
}
</script>

<template>
    <div>
        <h2>Fetch Dashboard Verification Test Page</h2>

        <div class="controls">
            <button data-testid="trigger-fetch" @click="triggerFetch">Basic Fetch</button>
            <button data-testid="trigger-slow-fetch" @click="triggerSlowFetch">Slow Fetch (500ms)</button>
            <button data-testid="trigger-cached-fetch" @click="triggerCachedFetch">Cached Fetch</button>
            <button data-testid="trigger-failed-fetch" @click="triggerFailedFetch">Failed Fetch (404)</button>
            <button data-testid="trigger-parallel-fetches" @click="triggerParallelFetches">Parallel Fetches (5x)</button>
            <button data-testid="trigger-sequential-fetches" @click="triggerSequentialFetches">Sequential Fetches (3x)</button>
            <button data-testid="trigger-large-payload-fetch" @click="triggerLargePayload">Large Payload (5000 items)</button>
            <button data-testid="clear-results" @click="clearResults">Clear Results</button>
        </div>

        <div class="dynamic-fetches">
            <h3>Dynamic Fetch Tests (for maxFetchEntries limit)</h3>
            <div class="fetch-buttons">
                <button v-for="i in 15" :key="i" :data-testid="`trigger-fetch-${i}`" @click="() => triggerFetchByNumber(i)">
                    Fetch {{ i }}
                </button>
            </div>
        </div>

        <div v-if="fetchStatus !== 'idle'" class="status">
            <div :class="['status-box', fetchStatus]" data-testid="fetch-complete">
                <h3>Status: {{ fetchStatus.toUpperCase() }}</h3>
                <pre v-if="fetchResult" class="result">{{ fetchResult }}</pre>
                <p v-if="fetchCount > 0" class="counter">Total fetches: {{ fetchCount }}</p>
            </div>
        </div>

        <div class="info">
            <h3>Testing Instructions</h3>
            <ul>
                <li>Open Nuxt DevTools → Observatory → Fetch Dashboard tab</li>
                <li>Click "Basic Fetch" - verify URL, duration, and status appear</li>
                <li>Click "Slow Fetch" - verify duration is accurately measured (~500ms)</li>
                <li>Click "Cached Fetch" twice - verify cache key is same and second fetch is faster</li>
                <li>Click "Failed Fetch" - verify error status is captured</li>
                <li>Click "Parallel Fetches" - verify waterfall shows concurrent requests</li>
                <li>Click "Sequential Fetches" - verify waterfall shows sequential ordering</li>
                <li>Click multiple "Fetch X" buttons - verify maxFetchEntries limit is respected</li>
            </ul>
        </div>
    </div>
</template>

<style scoped>
.controls {
    display: flex;
    gap: 10px;
    margin-bottom: 20px;
    flex-wrap: wrap;
}

.dynamic-fetches {
    margin: 20px 0;
    padding: 15px;
    border: 1px solid #ddd;
    border-radius: 8px;
    background-color: #f9f9f9;
}

.dynamic-fetches h3 {
    margin-top: 0;
    margin-bottom: 10px;
    font-size: 14px;
}

.fetch-buttons {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
}

.fetch-buttons button {
    padding: 4px 12px;
    font-size: 12px;
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

.status {
    margin-top: 20px;
}

.status-box {
    padding: 15px;
    border-radius: 8px;
    background-color: #f0f0f0;
}

.status-box.idle {
    background-color: #e0e0e0;
}

.status-box.loading {
    background-color: #fff3e0;
    border-left: 4px solid #ff9800;
}

.status-box.success {
    background-color: #e8f5e9;
    border-left: 4px solid #4caf50;
}

.status-box.error {
    background-color: #ffebee;
    border-left: 4px solid #f44336;
}

.status-box h3 {
    margin-top: 0;
    margin-bottom: 10px;
}

.result {
    background-color: #fff;
    padding: 10px;
    border-radius: 4px;
    overflow: auto;
    font-size: 12px;
    max-height: 200px;
}

.counter {
    margin-top: 10px;
    font-size: 12px;
    color: #666;
}

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
