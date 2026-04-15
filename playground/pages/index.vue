<script setup lang="ts">
import { ref } from 'vue'

// Shared theme/auth providers now come from layouts/default.vue.
// Note: 'cartContext' is intentionally NOT provided here — MissingProviderConsumer will fail.

// ── Composable tracker ──────────────────────────────────────────────────────
const { counter, increment } = useCounter()
const showLeaky = ref(false)

// ── Render heatmap ──────────────────────────────────────────────────────────
const items = ref(Array.from({ length: 20 }, (_, i) => ({ id: i, name: `Item ${i}`, price: Math.round(((i * 13 + 7) % 100) * 10) / 10 })))

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
            <p>This page exercises all five devtools features. Open the devtools panel to inspect.</p>
            <div class="page-links">
                <NuxtLink to="/shop" class="page-link">
                    → Shop
                    <span class="page-link-sub">fetch · provide/inject · useCart · transitions</span>
                </NuxtLink>
                <NuxtLink to="/dashboard" class="page-link">
                    → Dashboard
                    <span class="page-link-sub">polling · parallel fetch · heatmap</span>
                </NuxtLink>
                <NuxtLink to="/settings" class="page-link">
                    → Settings
                    <span class="page-link-sub">async composable · theme shadow</span>
                </NuxtLink>
            </div>
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

            <!-- Transition tracker section -->
            <section>
                <h2>Transition Tracker</h2>
                <p style="font-size: 13px; color: #555; margin-bottom: 14px">
                    Three scenarios — open the
                    <strong>Transitions</strong>
                    devtools tab to inspect each one.
                </p>
                <!-- 1. All transitions complete normally -->
                <TransitionsFadeBox />
                <!-- 2. JS-mode hook reads a DOM element that doesn't exist → done() never called -->
                <TransitionsBrokenTransition />
                <!-- 3. A slow leave interrupted mid-flight → leave-cancelled -->
                <TransitionsCancelledTransition />
                <!-- 4. Parent component unmounts while enter is in-flight → interrupted -->
                <TransitionsInterruptedTransition />
            </section>

            <!-- Verification Test Suite Section (NEW) -->
            <section class="verification-section">
                <h2>🧪 Verification Test Suite</h2>
                <p style="font-size: 13px; color: #555; margin-bottom: 14px">
                    These pages are designed to test the accuracy of Observatory's data collection. Open Nuxt DevTools and navigate to
                    Observatory tabs while running these tests.
                </p>
                <div class="verification-links">
                    <NuxtLink to="/test/trace-verification" class="verification-link">
                        <strong>Trace Viewer Verification</strong>
                        <span>Test span duration, parent-child relationships, and all 7 span types</span>
                    </NuxtLink>
                    <NuxtLink to="/test/heatmap-verification" class="verification-link">
                        <strong>Render Heatmap Verification</strong>
                        <span>Test persistent components, route attribution, and render duration accuracy</span>
                    </NuxtLink>
                    <NuxtLink to="/test/composable-verification" class="verification-link">
                        <strong>Composable Tracker Verification</strong>
                        <span>Test leak detection, global state identification, and change history</span>
                    </NuxtLink>
                    <NuxtLink to="/test/provide-inject-verification" class="verification-link">
                        <strong>Provide/Inject Verification</strong>
                        <span>Test provider scope, shadow detection, and missing provider warnings</span>
                    </NuxtLink>
                    <NuxtLink to="/test/transition-verification" class="verification-link">
                        <strong>Transition Tracker Verification</strong>
                        <span>Test transition phases, cancellation detection, and duration accuracy</span>
                    </NuxtLink>
                    <NuxtLink to="/test/fetch-verification" class="verification-link">
                        <strong>Fetch Dashboard Verification</strong>
                        <span>Test fetch timing, cache tracking, and waterfall ordering</span>
                    </NuxtLink>
                </div>
            </section>
        </main>
    </div>
</template>

<style scoped>
header {
    padding: 24px 32px;
    border-bottom: 1px solid #e0ded8;
}

.page-links {
    display: flex;
    gap: 12px;
    flex-wrap: wrap;
    margin-top: 14px;
}

.page-link {
    display: inline-flex;
    flex-direction: column;
    gap: 2px;
    font-size: 13px;
    font-weight: 600;
    color: #1a1a18;
    text-decoration: none;
    background: white;
    border: 1px solid #e0ded8;
    border-radius: 8px;
    padding: 10px 14px;
    transition: border-color 0.12s;
}

.page-link:hover {
    border-color: #1a1a18;
}

.page-link-sub {
    font-size: 11px;
    font-weight: 400;
    color: #aaa;
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

.verification-section {
    background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%);
    border: 2px solid #42b883;
}

.verification-links {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 12px;
    margin-top: 16px;
}

.verification-link {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 12px 16px;
    background: white;
    border: 1px solid #d3d1c7;
    border-radius: 8px;
    text-decoration: none;
    color: #1a1a18;
    transition: all 0.2s;
}

.verification-link:hover {
    border-color: #42b883;
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgb(66 184 131 / 10%);
}

.verification-link strong {
    font-size: 14px;
    color: #2c3e50;
}

.verification-link span {
    font-size: 12px;
    color: #888780;
}

h1 {
    font-size: 20px;
    font-weight: 600;
    margin-bottom: 4px;
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

header p {
    color: #888780;
    font-size: 14px;
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
