<script setup lang="ts">
import { ref } from 'vue'

const count = ref(0)
const showHeavyList = ref(false)
const heavyListItems = ref<number[]>([])
const routeName = ref('/')

// Track mount count for persistent component testing
const persistentMountCount = ref(0)

const forceUpdate = (): void => {
    count.value++
}

const renderHeavyList = (): void => {
    if (import.meta.dev) {
        const win = window as unknown as { __heavyRenderStart?: number }
        win.__heavyRenderStart = performance.now()
    }

    // Generate 5000 items for heavy rendering
    const items: number[] = []

    for (let i = 0; i < 5000; i++) {
        items.push(i)
    }

    heavyListItems.value = items
    showHeavyList.value = true
}

const clearHeavyList = (): void => {
    heavyListItems.value = []
    showHeavyList.value = false
}

const navigateToRoute = async (route: string): Promise<void> => {
    routeName.value = route
    await navigateTo(route)
}

// Track persistent component mounts
const onPersistentMount = (): void => {
    persistentMountCount.value++
    const element = document.querySelector('[data-testid="persistent-layout"]') as HTMLElement & { __observatoryMountCount?: number }

    if (element) {
        element.__observatoryMountCount = persistentMountCount.value
    }
}

// Expose for testing
if (import.meta.dev) {
    onMounted(() => {
        onPersistentMount()
    })
}
</script>

<template>
    <div>
        <div data-testid="persistent-layout" class="layout">
            <h2>Render Heatmap Verification Test Page</h2>

            <div class="toolbar">
                <button data-testid="nav-to-route-a" @click="() => navigateToRoute('/shop')">Shop</button>
                <button data-testid="nav-to-route-b" @click="() => navigateToRoute('/dashboard')">Dashboard</button>
                <button data-testid="nav-to-other-route" @click="() => navigateToRoute('/settings')">Settings</button>
                <button data-testid="trigger-render" @click="forceUpdate">Trigger Render</button>
                <button data-testid="force-update" @click="forceUpdate">Force Update</button>
                <button data-testid="render-heavy-list" @click="renderHeavyList">Render Heavy List (5000 items)</button>
                <button data-testid="clear-heavy-list" @click="clearHeavyList">Clear Heavy List</button>
            </div>

            <div class="route-info">
                <p>
                    Current Route:
                    <strong data-testid="current-route">{{ routeName }}</strong>
                </p>
                <p>
                    Persistent Component Mounts:
                    <strong>{{ persistentMountCount }}</strong>
                </p>
            </div>

            <!-- Test component that will be tracked -->
            <div data-testid="test-component" class="test-component">
                <h3>Test Component</h3>
                <p>Render count: {{ count }}</p>
                <button @click="forceUpdate">Increment Render</button>
            </div>

            <!-- Fast update component -->
            <div class="fast-update-component">
                <h3>Fast Update Component</h3>
                <p>Count: {{ count }}</p>
                <p class="note">This component updates rapidly to test timeline capping</p>
            </div>

            <!-- Heavy list component -->
            <div v-if="showHeavyList" data-testid="heavy-list-rendered" class="heavy-list">
                <h3>Heavy List Component (5000 items)</h3>
                <div class="list-container">
                    <div v-for="item in heavyListItems.slice(0, 100)" :key="item" class="list-item">Item {{ item }}</div>
                    <div v-if="heavyListItems.length > 100" class="more-items">... and {{ heavyListItems.length - 100 }} more items</div>
                </div>
            </div>
        </div>
    </div>
</template>

<style scoped>
.layout {
    padding: 20px;
    font-family: sans-serif;
}

.toolbar {
    display: flex;
    gap: 10px;
    margin-bottom: 20px;
    flex-wrap: wrap;
}

.route-info {
    padding: 10px;
    background-color: #f0f0f0;
    border-radius: 8px;
    margin-bottom: 20px;
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

.test-component {
    margin: 20px 0;
    padding: 15px;
    border: 1px solid #ddd;
    border-radius: 8px;
    background-color: #f9f9f9;
}

.test-component h3 {
    margin-top: 0;
    color: #2c3e50;
}

.fast-update-component {
    margin: 20px 0;
    padding: 15px;
    border: 1px solid #e0e0e0;
    border-radius: 8px;
    background-color: #f5f5f5;
}

.fast-update-component h3 {
    margin-top: 0;
    color: #2c3e50;
}

.note {
    font-size: 12px;
    color: #888;
    margin-top: 8px;
}

.heavy-list {
    margin-top: 20px;
    border: 1px solid #ccc;
    border-radius: 8px;
    overflow: hidden;
}

.heavy-list h3 {
    margin: 0;
    padding: 12px;
    background-color: #e8f5e9;
    border-bottom: 1px solid #ccc;
}

.list-container {
    max-height: 400px;
    overflow-y: auto;
}

.list-item {
    padding: 4px 8px;
    border-bottom: 1px solid #eee;
    font-size: 12px;
}

.list-item:hover {
    background-color: #f0f0f0;
}

.more-items {
    padding: 8px;
    text-align: center;
    color: #7f8c8d;
    font-style: italic;
}
</style>
