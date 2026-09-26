<script setup lang="ts">
import { ref, computed } from 'vue'
import { useObservatoryData } from '@observatory-client/stores/observatory'
import type { IPayloadKeyEntry } from '@observatory/types/snapshot'

const { payload, connected } = useObservatoryData()
const filter = ref<'all' | 'data' | 'state' | 'csr'>('all')
const search = ref('')
const selectedId = ref<string | null>(null)

const keys = computed(() => payload.value.keys)
const selected = computed(() => keys.value.find((entry) => entry.id === selectedId.value) ?? null)

const filtered = computed(() => {
    return keys.value.filter((entry) => {
        if (filter.value === 'csr' && entry.origin !== 'csr') {
            return false
        }

        if (filter.value !== 'all' && filter.value !== 'csr' && entry.bucket !== filter.value) {
            return false
        }

        const q = search.value.toLowerCase()

        if (q && !entry.key.toLowerCase().includes(q) && !entry.bucket.toLowerCase().includes(q)) {
            return false
        }

        return true
    })
})

function formatBytes(bytes: number) {
    if (bytes < 1024) {
        return `${bytes}B`
    }

    return `${(bytes / 1024).toFixed(1)}KB`
}

function previewText(entry: IPayloadKeyEntry, pretty = false) {
    if (entry.preview === undefined) {
        return '—'
    }

    try {
        const indent = pretty ? 2 : 0
        let text: string

        if (typeof entry.preview === 'string') {
            text = entry.preview
        } else {
            text = JSON.stringify(entry.preview, null, indent)
        }

        if (pretty) {
            return text
        }

        if (text.length > 80) {
            return text.slice(0, 80) + '…'
        }

        return text
    } catch {
        return '[unserializable]'
    }
}

function selectEntry(id: string) {
    selectedId.value = id
}
</script>

<template>
    <div class="payload-inspector tracker-view">
        <div class="tracker-stats-row">
            <div class="stat-card">
                <div class="stat-label">keys</div>
                <div class="stat-val">{{ payload.keyCount }}</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">total</div>
                <div class="stat-val">{{ formatBytes(payload.totalBytes) }}</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">ssr</div>
                <div class="stat-val">{{ payload.serverRendered ? 'yes' : 'no' }}</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">hydrating</div>
                <div class="stat-val">{{ payload.isHydrating ? 'yes' : 'no' }}</div>
            </div>
        </div>

        <div class="tracker-toolbar">
            <button :class="{ active: filter === 'all' }" @click="filter = 'all'">all</button>
            <button :class="{ active: filter === 'data' }" @click="filter = 'data'">data</button>
            <button :class="{ active: filter === 'state' }" @click="filter = 'state'">state</button>
            <button :class="{ active: filter === 'csr' }" @click="filter = 'csr'">csr only</button>
            <label class="payload-inspector__search-label muted" for="payload-inspector-search">search</label>
            <input
                id="payload-inspector-search"
                v-model="search"
                type="search"
                class="payload-inspector__search tracker-toolbar__spacer"
                placeholder="search key…"
            />
        </div>

        <div class="tracker-split">
            <div class="tracker-table-wrap">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>key</th>
                            <th>bucket</th>
                            <th>origin</th>
                            <th>size</th>
                            <th>preview</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-if="!filtered.length">
                            <td colspan="5" class="tracker-empty-cell">
                                {{ connected ? 'No payload keys recorded yet.' : 'Waiting for connection to the Nuxt app…' }}
                            </td>
                        </tr>
                        <tr v-for="entry in filtered" :key="entry.id" :class="{ selected: selected?.id === entry.id }">
                            <td class="mono">
                                <button type="button" class="data-table__row-select" @click="selectEntry(entry.id)">{{ entry.key }}</button>
                            </td>
                            <td>
                                <span class="badge badge-gray">{{ entry.bucket }}</span>
                            </td>
                            <td>
                                <span class="badge" :class="entry.origin === 'ssr' ? 'badge-info' : 'badge-gray'">{{ entry.origin }}</span>
                            </td>
                            <td class="mono text-sm">{{ formatBytes(entry.bytes) }}</td>
                            <td class="mono muted text-sm tracker-truncate">{{ previewText(entry) }}</td>
                        </tr>
                    </tbody>
                </table>
            </div>
            <div v-if="selected" class="tracker-detail-panel">
                <div class="tracker-section-label">{{ selected.bucket }} / {{ selected.key }}</div>
                <pre class="payload-inspector__preview">{{ previewText(selected, true) }}</pre>
            </div>
            <div v-else class="tracker-detail-empty">select a key to inspect</div>
        </div>
    </div>
</template>

<style scoped>
.payload-inspector__search-label {
    font-size: 11px;
}

.payload-inspector__search {
    max-width: 240px;
}

.payload-inspector__preview {
    margin-top: 8px;
    padding: 8px;
    font-size: 11px;
    white-space: pre-wrap;
    overflow-wrap: break-word;
}
</style>
