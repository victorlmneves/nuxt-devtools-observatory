<script setup lang="ts">
import { computed } from 'vue'
import { useCart } from '../../composables/useCart'
import { useUserStore } from '../../stores/user'
import { useCartStore } from '../../stores/cart'

const cart = useCart()
const cartStore = useCartStore()
const userStore = useUserStore()

const cartTotal = computed(() => Number(cart.total.value).toFixed(2))
const cartItemCount = computed(() => cart.itemCount.value)

function addCartItem() {
    cart.addToCart({ id: 101, name: 'Pinia Test Item', price: 19.99 }, 1)
}

function removeCartItem() {
    const first = cart.items.value[0]

    if (!first) {
        return
    }

    cart.removeFromCart(first.id)
}

function clearCartItems() {
    const ids = cart.items.value.map((item) => item.id)

    for (const id of ids) {
        cart.removeFromCart(id)
    }
}

function applyDirectMutation() {
    cartStore.$patch((state) => {
        state.items.push({ id: 999, name: 'Patched Item', price: 1.5, quantity: 1 })
    })
}

function toggleTheme() {
    userStore.setTheme(userStore.preferences.theme === 'light' ? 'dark' : 'light')
}

function toggleNotifications() {
    userStore.toggleNotifications()
}
</script>

<template>
    <section class="layout">
        <h2>Pinia Tracker Verification</h2>

        <div class="controls">
            <button data-testid="pinia-add-item" @click="addCartItem">Add Item</button>
            <button data-testid="pinia-remove-item" @click="removeCartItem">Remove First Item</button>
            <button data-testid="pinia-clear-cart" @click="clearCartItems">Clear Cart</button>
            <button data-testid="pinia-direct-mutation" @click="applyDirectMutation">Apply Direct Mutation</button>
            <button data-testid="pinia-toggle-theme" @click="toggleTheme">Toggle Theme</button>
            <button data-testid="pinia-toggle-notifications" @click="toggleNotifications">Toggle Notifications</button>
        </div>

        <div class="card" data-testid="pinia-state-readout">
            <p>Items: {{ cartItemCount }}</p>
            <p>Total: {{ cartTotal }}</p>
            <p>Theme: {{ userStore.preferences.theme }}</p>
            <p>Notifications: {{ userStore.preferences.notifications ? 'on' : 'off' }}</p>
        </div>
    </section>
</template>

<style scoped>
.layout {
    padding: 20px;
    font-family: sans-serif;
    display: flex;
    flex-direction: column;
    gap: 16px;
}

.controls {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
}

button {
    border: none;
    border-radius: 6px;
    background: #0f766e;
    color: #fff;
    padding: 8px 14px;
    cursor: pointer;
}

button:hover {
    background: #0b5d57;
}

.card {
    border: 1px solid #d1d5db;
    border-radius: 8px;
    padding: 14px;
    background: #f8fafc;
}

.card p {
    margin: 4px 0;
}
</style>
