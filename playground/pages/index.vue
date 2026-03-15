<script setup lang="ts">
import { ref, provide } from 'vue'

// ── provide/inject ──────────────────────────────────────────────────────────
provide('theme', ref('dark'))
provide('authContext', ref({ user: { id: 'u_1', name: 'Dev User' }, isLoggedIn: true }))
// Note: 'cartContext' is intentionally NOT provided — MissingProviderConsumer will fail

// ── Composable tracker ──────────────────────────────────────────────────────
const { counter, increment } = useCounter()
const showLeaky = ref(false)

// ── Render heatmap ──────────────────────────────────────────────────────────
const items = ref(Array.from({ length: 20 }, (_, i) => ({ id: i, name: `Item ${i}`, price: Math.random() * 100 })))

function shuffleItems() {
    items.value = [...items.value].sort(() => Math.random() - 0.5)
}

// ── useFetch ────────────────────────────────────────────────────────────────
const { data: product, refresh: refreshProduct, error: fetchError } = await useFetch('/api/product')

async function triggerError() {
    await useFetch('/api/nonexistent')
}
</script>

<template>
    <div>
        <header>
            <h1>Observatory Playground</h1>
            <p>This page exercises all four devtools features. Open the devtools panel to inspect.</p>
        </header>

        <main>
            <!-- useFetch section -->
            <section>
                <h2>useFetch Dashboard</h2>
                <p v-if="product">Product: {{ product.name }} — ${{ product.price }}</p>
                <p v-if="fetchError" style="color: red">Error: {{ fetchError }}</p>
                <button @click="() => refreshProduct()">refresh product</button>
                <button @click="triggerError">trigger 404</button>
            </section>

            <!-- provide/inject section -->
            <section>
                <h2>provide/inject Graph</h2>
                <ThemeConsumer />
                <MissingProviderConsumer />
            </section>

            <!-- Composable tracker section -->
            <section>
                <h2>Composable Tracker</h2>
                <p>Counter: {{ counter }}</p>
                <button @click="increment">increment</button>
                <LeakyComponent v-if="showLeaky" />
                <button @click="showLeaky = !showLeaky">
                    {{ showLeaky ? 'unmount leaky component' : 'mount leaky component' }}
                </button>
            </section>

            <!-- Render heatmap section -->
            <section>
                <h2>Render Heatmap</h2>
                <HeavyList :items="items" />
                <button @click="shuffleItems">shuffle items (triggers many renders)</button>
            </section>
        </main>
    </div>
</template>

<style>
body {
    font-family: -apple-system, sans-serif;
    margin: 0;
    padding: 0;
    background: #f8f7f4;
    color: #1a1a18;
}

header {
    padding: 24px 32px;
    border-bottom: 1px solid #e0ded8;
}

h1 {
    font-size: 20px;
    font-weight: 600;
    margin-bottom: 4px;
}

header p {
    color: #888780;
    font-size: 14px;
}

main {
    padding: 24px 32px;
    display: flex;
    flex-direction: column;
    gap: 32px;
}

section {
    background: white;
    border: 1px solid #e0ded8;
    border-radius: 12px;
    padding: 20px 24px;
}

h2 {
    font-size: 15px;
    font-weight: 600;
    margin-bottom: 12px;
}

p {
    font-size: 14px;
    color: #444;
    margin-bottom: 8px;
}

button {
    font-size: 13px;
    padding: 6px 14px;
    border-radius: 8px;
    border: 1px solid #d3d1c7;
    background: white;
    cursor: pointer;
    margin-right: 8px;
    margin-top: 4px;
}

button:hover {
    background: #f1efe8;
}
</style>
