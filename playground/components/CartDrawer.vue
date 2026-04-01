<script setup lang="ts">
import { ref, provide } from 'vue'
import { useCartStore } from '../stores/cart'

/**
 * CartDrawer — provides 'cartContext' to all descendants.
 *
 * This creates the middle node in the provide/inject chain:
 *   app.vue (theme) → shop.vue (currency) → CartDrawer (cartContext) → CartItem (injects both)
 *
 * The provide/inject graph should render CartDrawer as a provider node
 * with CartItem as a consumer showing both resolved injections.
 */
const store = useCartStore()

// Provide cart context to descendants — CartItem will inject this
provide('cartContext', ref({ label: 'drawer-cart', version: 1 }))

const isOpen = defineModel<boolean>('open', { default: false })
</script>

<template>
    <Transition name="drawer">
        <aside v-if="isOpen" class="drawer">
            <div class="drawer-header">
                <h3>Cart ({{ store.itemCount }} items)</h3>
                <button class="close-btn" @click="isOpen = false">✕</button>
            </div>
            <div class="drawer-body">
                <CartItem />
            </div>
            <div class="drawer-footer">
                <button class="btn-clear" :disabled="store.items.length === 0" @click="store.clear()">Clear cart</button>
            </div>
        </aside>
    </Transition>
</template>

<style scoped>
.drawer {
    position: fixed;
    top: 0;
    right: 0;
    width: 320px;
    height: 100vh;
    background: white;
    border-left: 1px solid #e0ded8;
    box-shadow: -4px 0 20px rgb(0 0 0 / 8%);
    z-index: 100;
    display: flex;
    flex-direction: column;
}

.drawer-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 20px;
    border-bottom: 1px solid #e0ded8;
}

.drawer-header h3 {
    margin: 0;
    font-size: 15px;
}

.close-btn {
    background: none;
    border: none;
    cursor: pointer;
    font-size: 16px;
    color: #888;
    padding: 4px;
}

.drawer-body {
    flex: 1;
    overflow-y: auto;
    padding: 16px 20px;
}

.drawer-footer {
    padding: 12px 20px;
    border-top: 1px solid #e0ded8;
}

.btn-clear {
    width: 100%;
    padding: 8px;
    border-radius: 8px;
    border: 1px solid #e0ded8;
    background: white;
    cursor: pointer;
    font-size: 13px;
    color: #c0392b;
}

.btn-clear:disabled {
    color: #ccc;
    cursor: not-allowed;
}

.drawer-enter-active,
.drawer-leave-active {
    transition: transform 0.3s ease;
}

.drawer-enter-from,
.drawer-leave-to {
    transform: translateX(100%);
}
</style>
