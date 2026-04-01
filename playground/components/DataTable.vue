<script setup lang="ts">
import { ref, computed } from 'vue'

type SortDir = 'asc' | 'desc'

interface Row {
    id: number
    name: string
    category: string
    price: number
    stock: number
}

const props = defineProps<{ rows: Row[] }>()

const sortKey = ref<keyof Row>('name')
const sortDir = ref<SortDir>('asc')

/**
 * Every time sortKey or sortDir changes ALL rows re-sort and re-render.
 * With enough rows this generates a visible spike in the render heatmap.
 */
const sorted = computed(() => {
    const key = sortKey.value
    const dir = sortDir.value === 'asc' ? 1 : -1

    return [...props.rows].sort((a, b) => {
        const av = a[key]
        const bv = b[key]

        if (typeof av === 'string' && typeof bv === 'string') {
            return av.localeCompare(bv) * dir
        }

        return ((av as number) - (bv as number)) * dir
    })
})

function sortBy(key: keyof Row) {
    if (sortKey.value === key) {
        sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc'
    } else {
        sortKey.value = key
        sortDir.value = 'asc'
    }
}

const columns: Array<{ key: keyof Row; label: string }> = [
    { key: 'id', label: '#' },
    { key: 'name', label: 'Product' },
    { key: 'category', label: 'Category' },
    { key: 'price', label: 'Price' },
    { key: 'stock', label: 'Stock' },
]
</script>

<template>
    <div class="table-wrap">
        <table>
            <thead>
                <tr>
                    <th v-for="col in columns" :key="col.key" :class="{ active: sortKey === col.key }" @click="sortBy(col.key)">
                        {{ col.label }}
                        <span class="sort-icon">{{ sortKey === col.key ? (sortDir === 'asc' ? '↑' : '↓') : '↕' }}</span>
                    </th>
                </tr>
            </thead>
            <tbody>
                <tr v-for="row in sorted" :key="row.id">
                    <td>{{ row.id }}</td>
                    <td>{{ row.name }}</td>
                    <td>{{ row.category }}</td>
                    <td>${{ row.price.toFixed(2) }}</td>
                    <td :style="{ color: row.stock < 8 ? '#c0392b' : 'inherit' }">{{ row.stock }}</td>
                </tr>
            </tbody>
        </table>
        <p class="hint">Click a column header to sort — each sort triggers re-renders on every row (visible in the Render Heatmap).</p>
    </div>
</template>

<style scoped>
.table-wrap {
    overflow-x: auto;
}

table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
}

th,
td {
    text-align: left;
    padding: 7px 12px;
    border-bottom: 1px solid #f0ede8;
}

th {
    font-weight: 600;
    cursor: pointer;
    user-select: none;
    color: #555;
    white-space: nowrap;
}

th.active {
    color: #1a1a18;
}

.sort-icon {
    margin-left: 4px;
    font-size: 11px;
    color: #aaa;
}

th.active .sort-icon {
    color: #333;
}

tr:hover td {
    background: #fafaf8;
}

.hint {
    font-size: 12px;
    color: #888;
    margin-top: 8px;
}
</style>
