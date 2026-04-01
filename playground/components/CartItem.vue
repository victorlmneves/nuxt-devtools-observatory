<script setup lang="ts">
import { inject } from 'vue'
import { useCartStore } from '../stores/cart'

/**
 * CartItem — injects BOTH 'cartContext' AND 'currency' from the tree.
 *
 * The provide/inject graph should show:
 *   CartDrawer --provides--> cartContext
 *   shop.vue   --provides--> currency
 *   CartItem   --injects--> cartContext (resolved from CartDrawer)
 *   CartItem   --injects--> currency    (resolved from shop.vue)
 */
const cartCtx = inject<{ label: string }>('cartContext')
const currency = inject<string>('currency', 'USD')

const store = useCartStore()
</script>

<template>
    <TransitionGroup name="cart-item" tag="ul" class="cart-list">
        <li v-for="item in store.items" :key="item.id" class="cart-row">
            <span class="item-name">{{ item.name }}</span>
            <span class="item-qty">× {{ item.quantity }}</span>
            <span class="item-price">{{ currency }} {{ (item.price * item.quantity).toFixed(2) }}</span>
        </li>
    </TransitionGroup>

    <div v-if="store.items.length === 0" class="empty">
        Cart is empty
        <span v-if="cartCtx" style="color: #aaa; font-size: 11px">(ctx: {{ cartCtx.label }})</span>
    </div>

    <div class="total">
        Total:
        <strong>{{ currency }} {{ store.total.toFixed(2) }}</strong>
    </div>
</template>

<style scoped>
.cart-list {
    list-style: none;
    padding: 0;
    margin: 0 0 8px;
}

.cart-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 5px 0;
    border-bottom: 1px solid #f0ede8;
    font-size: 13px;
}

.item-name {
    flex: 1;
}

.item-qty {
    color: #888;
    min-width: 28px;
}

.item-price {
    font-weight: 500;
    color: #1d9e75;
}

.empty {
    font-size: 13px;
    color: #aaa;
    padding: 8px 0;
}

.total {
    font-size: 14px;
    text-align: right;
    padding-top: 8px;
    border-top: 1px solid #e0ded8;
}

.cart-item-enter-active,
.cart-item-leave-active {
    transition: all 0.25s ease;
}

.cart-item-enter-from {
    opacity: 0;
    transform: translateX(-10px);
}

.cart-item-leave-to {
    opacity: 0;
    transform: translateX(10px);
}
</style>
