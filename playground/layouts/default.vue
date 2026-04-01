<script setup lang="ts">
import { ref, provide, computed } from 'vue'

const theme = ref('dark')
const authContext = ref({ user: { id: 'u_1', name: 'Dev User' }, isLoggedIn: true })
const cartSummary = usePersistentCartSummary()

provide('theme', theme)
provide('authContext', authContext)
provide(
    'layoutContext',
    computed(() => ({ area: 'default-layout', theme: theme.value }))
)
</script>

<template>
    <div id="app-shell">
        <nav class="app-nav">
            <span class="nav-brand">Observatory</span>
            <div class="nav-links">
                <NuxtLink to="/" class="nav-link">Home</NuxtLink>
                <NuxtLink to="/shop" class="nav-link">Shop</NuxtLink>
                <NuxtLink to="/dashboard" class="nav-link">Dashboard</NuxtLink>
                <NuxtLink to="/settings" class="nav-link">Settings</NuxtLink>
            </div>
            <div class="nav-spacer" />
            <NuxtLink to="/shop" class="cart-pill" title="Persistent cart summary from layout-level composable">
                <span>Cart</span>
                <span class="mono">{{ cartSummary.itemCount }}</span>
                <span class="mono">${{ cartSummary.total }}</span>
            </NuxtLink>
        </nav>

        <slot />
    </div>
</template>

<style scoped>
#app-shell {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
}

.app-nav {
    display: flex;
    align-items: center;
    gap: 24px;
    padding: 0 32px;
    height: 48px;
    background: white;
    border-bottom: 1px solid #e0ded8;
    position: sticky;
    top: 0;
    z-index: 50;
}

.nav-brand {
    font-size: 14px;
    font-weight: 700;
    color: #1a1a18;
    letter-spacing: -0.02em;
}

.nav-links {
    display: flex;
    gap: 4px;
}

.nav-spacer {
    flex: 1;
}

.nav-link {
    font-size: 13px;
    color: #666;
    text-decoration: none;
    padding: 5px 10px;
    border-radius: 6px;
    transition:
        background 0.12s,
        color 0.12s;
}

.nav-link:hover {
    background: #f0ede8;
    color: #1a1a18;
}

.nav-link.router-link-active {
    background: #1a1a18;
    color: white;
}

.cart-pill {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 5px 10px;
    border-radius: 7px;
    border: 1px solid #d3d1c7;
    background: #f7f5f1;
    color: #3f3d38;
    text-decoration: none;
    font-size: 12px;
}

.cart-pill:hover {
    border-color: #b9b6ab;
    background: #efece7;
}
</style>
