<script setup lang="ts">
import { ref, provide } from 'vue'

/**
 * shop.vue — Product catalog page.
 *
 * Observatory coverage:
 *   Fetch Dashboard  — parallel useFetch (product list) + lazy detail fetch on click + POST to /api/cart
 *   Provide/Inject   — provides 'currency' (injected deep in CartItem)
 *   Composable       — useCart (healthy, watcher cleaned up)
 *   Render Heatmap   — product grid re-renders on cart state changes
 *   Transition       — TransitionGroup on the product grid + CartDrawer slide
 */

// ── provide/inject ─────────────────────────────────────────────────────────
const currency = ref('USD')
provide('currency', currency)

// ── fetch: product list ────────────────────────────────────────────────────
const { data: products, status: productsStatus, refresh: refreshProducts } = await useFetch('/api/products')

// ── fetch: product detail (lazy — triggered on click) ─────────────────────
const selectedId = ref<number | null>(null)
const {
    data: detail,
    status: detailStatus,
    execute: fetchDetail,
} = useFetch(() => `/api/products/${selectedId.value}`, { immediate: false, watch: false })

async function selectProduct(id: number) {
    selectedId.value = id
    await fetchDetail()
}

// ── composable: cart ───────────────────────────────────────────────────────
const cart = useCart()
const drawerOpen = ref(false)

// ── fetch: POST to /api/cart on add ───────────────────────────────────────
const addStatus = ref<'idle' | 'adding' | 'done' | 'error'>('idle')

async function addToCart(product: { id: number; name: string; price: number }) {
    cart.addToCart(product)

    // Also fire a POST to exercise the fetch dashboard's POST tracking
    addStatus.value = 'adding'

    try {
        await $fetch('/api/cart', {
            method: 'POST',
            body: { productId: product.id, quantity: 1 },
        })
        addStatus.value = 'done'
        setTimeout(() => {
            addStatus.value = 'idle'
        }, 1000)
    } catch {
        addStatus.value = 'error'
    }
}

const categories = ref<string[]>([])
const activeCategory = ref<string | null>(null)

// Derive unique categories once products load
watch(
    products,
    (list) => {
        if (!list) return
        categories.value = [...new Set(list.map((p) => p.category))].sort()
    },
    { immediate: true }
)

const filteredProducts = computed(() => {
    if (!products.value) {
        return []
    }

    if (!activeCategory.value) {
        return products.value
    }

    return products.value.filter((p) => p.category === activeCategory.value)
})
</script>

<template>
    <div>
        <header class="page-header">
            <div>
                <h1>Shop</h1>
                <p>Fetch Dashboard · Provide/Inject · useCart composable · Render Heatmap · Transitions</p>
            </div>
            <button class="cart-btn" @click="drawerOpen = true">
                Cart
                <span v-if="cart.itemCount.value > 0" class="cart-badge">{{ cart.itemCount.value }}</span>
            </button>
        </header>

        <main class="page-body">
            <!-- controls -->
            <div class="toolbar">
                <button :disabled="productsStatus === 'pending'" @click="() => refreshProducts()">↺ Refresh list</button>
                <span style="color: #aaa; font-size: 12px">currency:</span>
                <select v-model="currency" style="font-size: 13px; padding: 4px 8px; border-radius: 6px; border: 1px solid #d3d1c7">
                    <option>USD</option>
                    <option>EUR</option>
                    <option>GBP</option>
                </select>
                <span style="flex: 1" />
                <span v-if="addStatus === 'adding'" style="font-size: 12px; color: #888">Syncing to server…</span>
                <span v-else-if="addStatus === 'done'" style="font-size: 12px; color: #1d9e75">✓ Added</span>
            </div>

            <!-- category filter -->
            <div class="categories">
                <button :class="['cat-btn', { active: activeCategory === null }]" @click="activeCategory = null">All</button>
                <button
                    v-for="cat in categories"
                    :key="cat"
                    :class="['cat-btn', { active: activeCategory === cat }]"
                    @click="activeCategory = cat"
                >
                    {{ cat }}
                </button>
            </div>

            <!-- product grid with transition -->
            <TransitionGroup name="product-list" tag="div" class="product-grid">
                <div
                    v-for="product in filteredProducts"
                    :key="product.id"
                    class="product-card"
                    :class="{ selected: selectedId === product.id }"
                    @click="selectProduct(product.id)"
                >
                    <div class="product-name">{{ product.name }}</div>
                    <div class="product-cat">{{ product.category }}</div>
                    <div class="product-price">${{ product.price.toFixed(2) }}</div>
                    <div class="product-stock" :style="{ color: product.stock < 8 ? '#c0392b' : '#888' }">{{ product.stock }} in stock</div>
                    <button class="add-btn" @click.stop="addToCart(product)">+ Add to cart</button>
                </div>
            </TransitionGroup>

            <!-- detail panel -->
            <Transition name="fade">
                <div v-if="detail" class="detail-panel">
                    <div v-if="detailStatus === 'pending'" class="detail-loading">Loading…</div>
                    <template v-else>
                        <h3>{{ detail.name }}</h3>
                        <p style="color: #666; font-size: 13px">{{ detail.description }}</p>
                        <p style="font-size: 13px">
                            <strong>{{ currency }} {{ detail.price.toFixed(2) }}</strong>
                            · {{ detail.stock }} in stock
                        </p>
                    </template>
                </div>
            </Transition>
        </main>

        <!-- Cart drawer (provides cartContext) -->
        <CartDrawer v-model:open="drawerOpen" />
    </div>
</template>

<style scoped>
.page-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    padding: 24px 32px;
    border-bottom: 1px solid #e0ded8;
}

.page-header h1 {
    font-size: 20px;
    font-weight: 600;
    margin: 0 0 4px;
}

.page-header p {
    font-size: 13px;
    color: #888;
    margin: 0;
}

.page-body {
    padding: 24px 32px;
    display: flex;
    flex-direction: column;
    gap: 20px;
}

.toolbar {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
}

.toolbar button {
    font-size: 13px;
    padding: 5px 12px;
    border-radius: 8px;
    border: 1px solid #d3d1c7;
    background: white;
    cursor: pointer;
}

.cart-btn {
    position: relative;
    font-size: 14px;
    padding: 8px 18px;
    border-radius: 8px;
    border: 1px solid #d3d1c7;
    background: white;
    cursor: pointer;
}

.cart-badge {
    position: absolute;
    top: -6px;
    right: -6px;
    background: #1d9e75;
    color: white;
    border-radius: 99px;
    font-size: 11px;
    font-weight: 700;
    min-width: 18px;
    height: 18px;
    display: flex;
    align-items: center;
    justify-content: center;
}

.categories {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
}

.cat-btn {
    font-size: 12px;
    padding: 4px 12px;
    border-radius: 99px;
    border: 1px solid #d3d1c7;
    background: white;
    cursor: pointer;
}

.cat-btn.active {
    background: #1a1a18;
    color: white;
    border-color: #1a1a18;
}

.product-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
    gap: 16px;
}

.product-card {
    background: white;
    border: 1px solid #e0ded8;
    border-radius: 10px;
    padding: 16px;
    cursor: pointer;
    transition: border-color 0.15s;
    display: flex;
    flex-direction: column;
    gap: 4px;
}

.product-card:hover,
.product-card.selected {
    border-color: #1a1a18;
}

.product-name {
    font-size: 14px;
    font-weight: 600;
}

.product-cat {
    font-size: 11px;
    color: #aaa;
    text-transform: uppercase;
    letter-spacing: 0.05em;
}

.product-price {
    font-size: 15px;
    font-weight: 700;
    color: #1d9e75;
    margin-top: 4px;
}

.product-stock {
    font-size: 12px;
}

.add-btn {
    margin-top: 8px;
    font-size: 12px;
    padding: 5px 10px;
    border-radius: 7px;
    border: 1px solid #d3d1c7;
    background: white;
    cursor: pointer;
}

.add-btn:hover {
    background: #1a1a18;
    color: white;
    border-color: #1a1a18;
}

.detail-panel {
    background: #f8f7f4;
    border: 1px solid #e0ded8;
    border-radius: 10px;
    padding: 20px 24px;
}

.detail-loading {
    font-size: 13px;
    color: #aaa;
}

.product-list-enter-active,
.product-list-leave-active {
    transition: all 0.25s ease;
}

.product-list-enter-from {
    opacity: 0;
    transform: scale(0.95);
}

.product-list-leave-to {
    opacity: 0;
    transform: scale(0.95);
}

.product-list-move {
    transition: transform 0.25s ease;
}

.fade-enter-active,
.fade-leave-active {
    transition: opacity 0.2s;
}

.fade-enter-from,
.fade-leave-to {
    opacity: 0;
}
</style>
