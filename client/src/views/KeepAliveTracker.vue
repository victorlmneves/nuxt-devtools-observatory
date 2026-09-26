<script setup lang="ts">
import { computed, ref } from 'vue'
import { useObservatoryData } from '@observatory-client/stores/observatory'
import type { TKeepAliveKind, TKeepAlivePhase } from '@observatory/types/snapshot'

const { keepAlive, connected } = useObservatoryData()
const filter = ref<'all' | TKeepAliveKind>('all')
const search = ref('')
const selectedId = ref<string | null>(null)

const events = computed(() => keepAlive.value.events)
const cache = computed(() => keepAlive.value.cache)

const selected = computed(() => events.value.find((entry) => entry.id === selectedId.value) ?? null)

const filtered = computed(() => {
    return events.value.filter((entry) => {
        if (filter.value !== 'all' && entry.kind !== filter.value) {
            return false
        }

        const q = search.value.toLowerCase()

        if (
            q &&
            !entry.name.toLowerCase().includes(q) &&
            !entry.phase.toLowerCase().includes(q) &&
            !entry.parentComponent.toLowerCase().includes(q)
        ) {
            return false
        }

        return true
    })
})

const keepAliveCount = computed(() => events.value.filter((entry) => entry.kind === 'keep-alive').length)
const suspenseCount = computed(() => events.value.filter((entry) => entry.kind === 'suspense').length)
const cachedCount = computed(() => cache.value.filter((entry) => entry.status === 'cached' || entry.status === 'active').length)
const pendingCount = computed(() => events.value.filter((entry) => entry.phase === 'pending' || entry.phase === 'fallback').length)
const avgFallbackMs = computed(() => {
    const timed = events.value.filter((entry) => entry.kind === 'suspense' && entry.fallbackMs !== undefined)

    if (!timed.length) {
        return 0
    }

    return Math.round(timed.reduce((sum, entry) => sum + (entry.fallbackMs ?? 0), 0) / timed.length)
})

function phaseClass(phase: TKeepAlivePhase) {
    if (phase === 'resolved' || phase === 'activated') {
        return 'badge-ok'
    }

    if (phase === 'fallback' || phase === 'pending') {
        return 'badge-warn'
    }

    if (phase === 'interrupted' || phase === 'evicted') {
        return 'badge-err'
    }

    return 'badge-gray'
}

function formatMs(value?: number) {
    return value === undefined ? '—' : `${value}ms`
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
    <div class="keep-alive-tracker tracker-view">
        <div class="tracker-stats-row">
            <div class="stat-card">
                <div class="stat-label">events</div>
                <div class="stat-val">{{ events.length }}</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">keep-alive</div>
                <div class="stat-val">{{ keepAliveCount }}</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">suspense</div>
                <div class="stat-val">{{ suspenseCount }}</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">cached</div>
                <div class="stat-val">{{ cachedCount }}</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">pending</div>
                <div class="stat-val">{{ pendingCount }}</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">avg fallback</div>
                <div class="stat-val">{{ avgFallbackMs }}ms</div>
            </div>
        </div>

        <div class="tracker-toolbar">
            <button :class="{ active: filter === 'all' }" @click="filter = 'all'">all</button>
            <button :class="{ active: filter === 'keep-alive' }" @click="filter = 'keep-alive'">KeepAlive</button>
            <button :class="{ active: filter === 'suspense' }" @click="filter = 'suspense'">Suspense</button>
            <label class="keep-alive-tracker__search-label muted" for="keep-alive-search">search</label>
            <input
                id="keep-alive-search"
                v-model="search"
                type="search"
                class="keep-alive-tracker__search tracker-toolbar__spacer"
                placeholder="search name or phase…"
            />
        </div>

        <div class="tracker-split">
            <div class="tracker-table-wrap">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>name</th>
                            <th>kind</th>
                            <th>phase</th>
                            <th>duration</th>
                            <th>fallback</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-if="!filtered.length">
                            <td colspan="5" class="tracker-empty-cell">
                                {{
                                    connected ? 'No KeepAlive or Suspense events recorded yet.' : 'Waiting for connection to the Nuxt app…'
                                }}
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
                            <td class="mono">{{ entry.name }}</td>
                            <td>
                                <span class="badge badge-gray">{{ entry.kind }}</span>
                            </td>
                            <td>
                                <span class="badge" :class="phaseClass(entry.phase)">{{ entry.phase }}</span>
                            </td>
                            <td class="mono muted">{{ formatMs(entry.durationMs) }}</td>
                            <td class="mono muted">{{ formatMs(entry.fallbackMs) }}</td>
                        </tr>
                    </tbody>
                </table>
            </div>
            <div v-if="selected" class="tracker-detail-panel">
                <div class="tracker-section-label">{{ selected.kind }} / {{ selected.name }}</div>
                <div class="muted text-sm">phase {{ selected.phase }}</div>
                <div class="muted text-sm">parent {{ selected.parentComponent }}</div>
                <div v-if="selected.key" class="muted text-sm">key {{ selected.key }}</div>
                <div v-if="selected.fromCache !== undefined" class="muted text-sm">fromCache {{ selected.fromCache }}</div>
                <div v-if="selected.cacheMax !== undefined" class="muted text-sm">
                    cache {{ selected.cacheSize ?? '—' }} / max {{ selected.cacheMax }}
                </div>
                <div v-if="selected.timeoutMs !== undefined" class="muted text-sm">timeout {{ selected.timeoutMs }}ms</div>
                <div v-if="selected.include" class="muted text-sm">include {{ selected.include }}</div>
                <div v-if="selected.exclude" class="muted text-sm">exclude {{ selected.exclude }}</div>
                <div class="tracker-section-label keep-alive-tracker__cache-label">cache</div>
                <table v-if="cache.length" class="data-table">
                    <thead>
                        <tr>
                            <th>name</th>
                            <th>status</th>
                            <th>hits</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-for="item in cache" :key="item.id">
                            <td class="mono">{{ item.name }}</td>
                            <td>
                                <span
                                    class="badge"
                                    :class="item.status === 'evicted' ? 'badge-err' : item.status === 'active' ? 'badge-ok' : 'badge-gray'"
                                >
                                    {{ item.status }}
                                </span>
                            </td>
                            <td class="mono">{{ item.hits }}</td>
                        </tr>
                    </tbody>
                </table>
                <div v-else class="muted text-sm">No KeepAlive cache entries yet.</div>
            </div>
            <div v-else class="tracker-detail-empty">select an event to inspect</div>
        </div>
    </div>
</template>

<style scoped>
.keep-alive-tracker__search-label {
    font-size: 11px;
}

.keep-alive-tracker__search {
    max-width: 240px;
}

.keep-alive-tracker__cache-label {
    margin-top: 12px;
}
</style>
