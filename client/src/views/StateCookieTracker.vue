<script setup lang="ts">
import { ref, computed } from 'vue'
import { useObservatoryData } from '@observatory-client/stores/observatory'
import type { IStateCookieEntry, TStateCookieKind } from '@observatory/types/snapshot'

const { stateCookies, connected } = useObservatoryData()
const filter = ref<'all' | TStateCookieKind>('all')
const search = ref('')
const selectedId = ref<string | null>(null)

const selected = computed(() => stateCookies.value.find((entry) => entry.id === selectedId.value) ?? null)

const filtered = computed(() => {
    return stateCookies.value.filter((entry) => {
        if (filter.value !== 'all' && entry.kind !== filter.value) {
            return false
        }

        const q = search.value.toLowerCase()

        if (q && !entry.key.toLowerCase().includes(q) && !entry.kind.toLowerCase().includes(q)) {
            return false
        }

        return true
    })
})

function previewText(entry: IStateCookieEntry, pretty = false) {
    if (entry.preview === undefined) {
        return '—'
    }

    try {
        const indent = pretty ? 2 : 0
        const text = typeof entry.preview === 'string' ? entry.preview : JSON.stringify(entry.preview, null, indent)

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

function onRowKeydown(event: KeyboardEvent, id: string) {
    if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault()
        selectEntry(id)
    }
}
</script>

<template>
    <div class="state-cookie-tracker tracker-view">
        <div class="tracker-stats-row">
            <div class="stat-card">
                <div class="stat-label">entries</div>
                <div class="stat-val">{{ stateCookies.length }}</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">useState</div>
                <div class="stat-val">{{ stateCookies.filter((entry) => entry.kind === 'useState').length }}</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">useCookie</div>
                <div class="stat-val">{{ stateCookies.filter((entry) => entry.kind === 'useCookie').length }}</div>
            </div>
        </div>

        <div class="tracker-toolbar">
            <button :class="{ active: filter === 'all' }" @click="filter = 'all'">all</button>
            <button :class="{ active: filter === 'useState' }" @click="filter = 'useState'">useState</button>
            <button :class="{ active: filter === 'useCookie' }" @click="filter = 'useCookie'">useCookie</button>
            <label class="state-cookie-tracker__search-label muted" for="state-cookie-search">search</label>
            <input
                id="state-cookie-search"
                v-model="search"
                type="search"
                class="state-cookie-tracker__search tracker-toolbar__spacer"
                placeholder="search key…"
            />
        </div>

        <div class="tracker-split">
            <div class="tracker-table-wrap">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>key</th>
                            <th>kind</th>
                            <th>origin</th>
                            <th>preview</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-if="!filtered.length">
                            <td colspan="4" class="tracker-empty-cell">
                                {{ connected ? 'No useState or useCookie calls recorded yet.' : 'Waiting for connection to the Nuxt app…' }}
                            </td>
                        </tr>
                        <tr
                            v-for="entry in filtered"
                            :key="entry.id"
                            :class="{ selected: selected?.id === entry.id }"
                            tabindex="0"
                            @click="selectEntry(entry.id)"
                            @keydown="onRowKeydown($event, entry.id)"
                        >
                            <td class="mono">{{ entry.key }}</td>
                            <td>
                                <span class="badge badge-gray">{{ entry.kind }}</span>
                            </td>
                            <td>
                                <span class="badge" :class="entry.origin === 'ssr' ? 'badge-info' : 'badge-gray'">{{ entry.origin }}</span>
                            </td>
                            <td class="mono muted text-sm tracker-truncate">{{ previewText(entry) }}</td>
                        </tr>
                    </tbody>
                </table>
            </div>
            <div v-if="selected" class="tracker-detail-panel">
                <div class="tracker-section-label">{{ selected.kind }} / {{ selected.key }}</div>
                <pre class="state-cookie-tracker__preview">{{ previewText(selected, true) }}</pre>
                <div v-if="selected.cookie" class="muted text-sm">
                    cookie maxAge={{ selected.cookie.maxAge ?? '—' }} path={{ selected.cookie.path ?? '—' }}
                    httpOnly={{ selected.cookie.httpOnly ?? '—' }}
                </div>
            </div>
            <div v-else class="tracker-detail-empty">select a key to inspect</div>
        </div>
    </div>
</template>

<style scoped>
.state-cookie-tracker__search-label {
    font-size: 11px;
}

.state-cookie-tracker__search {
    max-width: 240px;
}

.state-cookie-tracker__preview {
    margin-top: 8px;
    padding: 8px;
    font-size: 11px;
    white-space: pre-wrap;
    overflow-wrap: break-word;
}
</style>
