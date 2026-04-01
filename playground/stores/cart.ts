import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export interface CartItem {
    id: number
    name: string
    price: number
    quantity: number
}

export const useCartStore = defineStore('cart', () => {
    const items = ref<CartItem[]>([])

    const total = computed(() => items.value.reduce((sum, item) => sum + item.price * item.quantity, 0))

    const itemCount = computed(() => items.value.reduce((sum, item) => sum + item.quantity, 0))

    function addItem(product: { id: number; name: string; price: number }, quantity = 1) {
        const existing = items.value.find((i) => i.id === product.id)

        if (existing) {
            existing.quantity += quantity
        } else {
            items.value.push({ ...product, quantity })
        }
    }

    function removeItem(productId: number) {
        const index = items.value.findIndex((i) => i.id === productId)

        if (index !== -1) {
            items.value.splice(index, 1)
        }
    }

    function decrementItem(productId: number) {
        const item = items.value.find((i) => i.id === productId)

        if (!item) {
            return
        }

        if (item.quantity <= 1) {
            removeItem(productId)
        } else {
            item.quantity--
        }
    }

    function clear() {
        items.value = []
    }

    return { items, total, itemCount, addItem, removeItem, decrementItem, clear }
})
