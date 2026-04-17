<script setup lang="ts">
// No store is accessed or created here, so Pinia Tracker will show 'no store available' by default.
import { computed, ref } from 'vue'
import { useObservatoryData, clearPiniaStores, editPiniaState } from '@observatory-client/stores/observatory'
import type { PiniaMutationEvent, PiniaStoreEntry } from '@observatory/types/snapshot'

const { piniaStores, connected } = useObservatoryData()

const selectedStoreId = ref<string | null>(null)
const selectedEventId = ref<string | null>(null)
const editPath = ref('')
const editValue = ref('')
const editError = ref('')

const stores = computed(() => [...piniaStores.value].sort((a, b) => a.id.localeCompare(b.id)))

const selectedStore = computed<PiniaStoreEntry | null>(() => {
    if (!selectedStoreId.value) {
        return stores.value[0] ?? null
    }

    return stores.value.find((item) => item.id === selectedStoreId.value) ?? null
})

const timeline = computed<PiniaMutationEvent[]>(() => {
    return selectedStore.value ? [...selectedStore.value.timeline].slice().reverse() : []
})

const selectedEvent = computed<PiniaMutationEvent | null>(() => {
    if (!selectedEventId.value) {
        return timeline.value[0] ?? null
    }

    return timeline.value.find((event) => event.id === selectedEventId.value) ?? null
})

function selectStore(id: string) {
    selectedStoreId.value = id
    selectedEventId.value = null
    editError.value = ''
}

function pretty(value: unknown) {
    try {
        return JSON.stringify(value, null, 2)
    } catch {
        return String(value)
    }
}

function renderDuration(event: PiniaMutationEvent) {
    if (typeof event.durationMs !== 'number') {
        return '-'
    }

    return `${event.durationMs.toFixed(2)}ms`
}

function applyEdit() {
    const store = selectedStore.value

    if (!store) {
        editError.value = 'Select a store first.'

        return
    }

    if (!editPath.value.trim()) {
        editError.value = 'Path is required (for example: preferences.theme).'

        return
    }

    let nextValue: unknown = editValue.value

    if (editValue.value.trim()) {
        try {
            nextValue = JSON.parse(editValue.value)
        } catch {
            nextValue = editValue.value
        }
    }

    editError.value = ''
    editPiniaState(store.id, editPath.value.trim(), nextValue)
}
</script>

<template>
    <section class="pinia-tracker">
        <header class="toolbar">
            <h2>Pinia State and Mutations</h2>
            <div class="toolbar-actions">
                <span v-if="connected" class="status connected">Connected</span>
                <span v-else class="status">Waiting for app</span>
                <button class="danger" @click="clearPiniaStores">Clear timeline</button>
            </div>
        </header>

        <div v-if="stores.length === 0" class="empty">No Pinia stores detected yet. Trigger store usage in the app.</div>

        <div v-else class="content-grid">
            <aside class="panel stores">
                <h3>Stores</h3>
                <button
                    v-for="store in stores"
                    :key="store.id"
                    class="store-row"
                    :class="{ active: selectedStore?.id === store.id }"
                    @click="selectStore(store.id)"
                >
                    <span>{{ store.name }}</span>
                    <small>{{ store.timeline.length }} events</small>
                </button>
            </aside>

            <section class="panel timeline">
                <h3>Timeline</h3>
                <div class="list">
                    <button
                        v-for="event in timeline"
                        :key="event.id"
                        class="event-row"
                        :class="{ active: selectedEvent?.id === event.id }"
                        @click="selectedEventId = event.id"
                    >
                        <strong>{{ event.kind }}</strong>
                        <span>{{ event.name }}</span>
                        <small>{{ renderDuration(event) }}</small>
                    </button>
                </div>
            </section>

            <section class="panel inspector">
                <h3>Inspector</h3>

                <div v-if="selectedStore" class="block">
                    <h4>Current state</h4>
                    <pre>{{ pretty(selectedStore.state) }}</pre>
                </div>

                <div v-if="selectedStore" class="block edit-box">
                    <h4>Edit state path</h4>
                    <input v-model="editPath" placeholder="preferences.theme" />
                    <textarea v-model="editValue" rows="4" placeholder='"dark" or {"enabled":true}' />
                    <div class="actions">
                        <button @click="applyEdit">Apply edit</button>
                        <small v-if="editError" class="error">{{ editError }}</small>
                    </div>
                </div>

                <div v-if="selectedEvent" class="block">
                    <h4>Selected event</h4>
                    <p class="meta">
                        {{ selectedEvent.kind }} · {{ selectedEvent.name }} · {{ selectedEvent.status }} ·
                        {{ renderDuration(selectedEvent) }}
                    </p>
                    <h5>Diff</h5>
                    <ul class="diff-list">
                        <li v-for="item in selectedEvent.diff" :key="item.path">
                            <code>{{ item.path }}</code>
                        </li>
                    </ul>
                    <h5>Before</h5>
                    <pre>{{ pretty(selectedEvent.beforeState) }}</pre>
                    <h5>After</h5>
                    <pre>{{ pretty(selectedEvent.afterState) }}</pre>
                </div>
            </section>
        </div>
    </section>
</template>

<style scoped>
.pinia-tracker {
    display: flex;
    flex-direction: column;
    height: 100%;
    gap: 12px;
    padding: 12px;
}

.toolbar {
    display: flex;
    justify-content: space-between;
    align-items: center;
}

.toolbar h2 {
    margin: 0;
    font-size: 14px;
}

.toolbar-actions {
    display: flex;
    align-items: center;
    gap: 8px;
}

.status {
    color: var(--text3);
    font-size: 12px;
}

.status.connected {
    color: var(--green);
}

.content-grid {
    display: grid;
    grid-template-columns: 220px 280px 1fr;
    gap: 10px;
    min-height: 0;
    flex: 1;
}

.panel {
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--bg2);
    padding: 10px;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.panel h3 {
    margin: 0;
    font-size: 12px;
    color: var(--text2);
    letter-spacing: 0.02em;
    text-transform: uppercase;
}

.stores,
.timeline,
.inspector,
.list {
    overflow: auto;
}

.store-row,
.event-row {
    width: 100%;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--bg3);
    color: var(--text);
    text-align: left;
    padding: 8px;
    display: flex;
    flex-direction: column;
    gap: 2px;
    cursor: pointer;
}

.store-row.active,
.event-row.active {
    border-color: var(--purple);
}

.store-row small,
.event-row small {
    color: var(--text3);
}

.block {
    border-top: 1px solid var(--border);
    padding-top: 8px;
}

.block h4,
.block h5 {
    margin: 0 0 6px;
    font-size: 12px;
}

.meta {
    margin: 0 0 6px;
    color: var(--text2);
    font-size: 12px;
}

pre {
    margin: 0;
    background: var(--bg3);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 8px;
    white-space: pre-wrap;
    word-break: break-word;
    font-size: 11px;
    max-height: 200px;
    overflow: auto;
}

.edit-box input,
.edit-box textarea {
    width: 100%;
    background: var(--bg3);
    border: 1px solid var(--border);
    border-radius: 6px;
    color: var(--text);
    padding: 6px;
    font-size: 12px;
}

.actions {
    display: flex;
    align-items: center;
    gap: 8px;
}

.error {
    color: var(--red);
}

.empty {
    padding: 24px;
    border: 1px dashed var(--border);
    border-radius: 8px;
    color: var(--text2);
}

.diff-list {
    margin: 0;
    padding-left: 16px;
}

.danger {
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--bg2);
    color: var(--text);
    padding: 6px 10px;
    cursor: pointer;
}
</style>
