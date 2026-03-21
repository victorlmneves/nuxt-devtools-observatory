<script setup lang="ts">
import { ref, computed } from 'vue'
import { useObservatoryData, type TransitionEntry } from '../stores/observatory'

const { transitions: entries, connected } = useObservatoryData()

type FilterMode = 'all' | 'cancelled' | 'active' | 'completed'
const filter = ref<FilterMode>('all')
const search = ref('')
const selected = ref<TransitionEntry | null>(null)

const filtered = computed(() => {
    let list = [...entries.value]

    if (search.value) {
        const q = search.value.toLowerCase()
        list = list.filter((e) => e.transitionName.toLowerCase().includes(q) || e.parentComponent.toLowerCase().includes(q))
    }

    if (filter.value === 'cancelled') {
        list = list.filter((e) => e.cancelled || e.phase === 'interrupted')
    } else if (filter.value === 'active') {
        list = list.filter((e) => e.phase === 'entering' || e.phase === 'leaving')
    } else if (filter.value === 'completed') {
        list = list.filter((e) => e.phase === 'entered' || e.phase === 'left')
    }

    return list.sort((a, b) => {
        const aTime = a.endTime ?? a.startTime
        const bTime = b.endTime ?? b.startTime

        return bTime - aTime
    })
})

const stats = computed(() => ({
    total: entries.value.length,
    active: entries.value.filter((e) => e.phase === 'entering' || e.phase === 'leaving').length,
    cancelled: entries.value.filter((e) => e.cancelled || e.phase === 'interrupted').length,
    avgMs: (() => {
        const completed = entries.value.filter((e) => e.durationMs !== undefined)

        if (!completed.length) {
            return 0
        }

        return Math.round(completed.reduce((s, e) => s + (e.durationMs ?? 0), 0) / completed.length)
    })(),
}))

// Timeline bar geometry — relative to the earliest startTime
const timelineGeometry = computed(() => {
    const all = filtered.value

    if (!all.length) {
        return []
    }

    const minT = Math.min(...all.map((e) => e.startTime))
    const maxT = Math.max(...all.map((e) => e.endTime ?? e.startTime + 400))
    const span = Math.max(maxT - minT, 1)

    return all.map((e) => ({
        left: ((e.startTime - minT) / span) * 100,
        width: (((e.endTime ?? e.startTime + 80) - e.startTime) / span) * 100,
    }))
})

function phaseColor(phase: TransitionEntry['phase']): string {
    if (phase === 'entering' || phase === 'leaving') {
        return '#7f77dd'
    }

    if (phase === 'entered') {
        return '#1d9e75'
    }

    if (phase === 'left') {
        return '#378add'
    }

    if (phase === 'enter-cancelled' || phase === 'leave-cancelled') {
        return '#e24b4a'
    }

    if (phase === 'interrupted') {
        return '#e09a3a'
    }

    return '#888'
}

function phaseBadgeClass(phase: TransitionEntry['phase']): string {
    if (phase === 'entering' || phase === 'leaving') {
        return 'badge-purple'
    }

    if (phase === 'entered' || phase === 'left') {
        return 'badge-ok'
    }

    if (phase.includes('cancelled')) {
        return 'badge-err'
    }

    if (phase === 'interrupted') {
        return 'badge-warn'
    }

    return 'badge-gray'
}

function directionLabel(e: TransitionEntry): string {
    if (e.appear) {
        return '✦ appear'
    }

    return e.direction === 'enter' ? '→ enter' : '← leave'
}

function directionColor(e: TransitionEntry): string {
    if (e.appear) {
        return 'var(--amber)'
    }

    return e.direction === 'enter' ? 'var(--teal)' : 'var(--blue)'
}
</script>

<template>
    <div class="timeline-root">
        <!-- Stats bar -->
        <div class="stats-row">
            <div class="stat-card">
                <div class="stat-val">{{ stats.total }}</div>
                <div class="stat-label">total</div>
            </div>
            <div class="stat-card">
                <div class="stat-val" style="color: var(--purple)">{{ stats.active }}</div>
                <div class="stat-label">active</div>
            </div>
            <div class="stat-card">
                <div class="stat-val" style="color: var(--red)">{{ stats.cancelled }}</div>
                <div class="stat-label">cancelled</div>
            </div>
            <div class="stat-card">
                <div class="stat-val">
                    {{ stats.avgMs }}
                    <span class="stat-unit">ms</span>
                </div>
                <div class="stat-label">avg duration</div>
            </div>
        </div>

        <!-- Toolbar -->
        <div class="toolbar">
            <input v-model="search" type="search" placeholder="filter by name or component…" class="search-input" />
            <div class="filter-group">
                <button :class="{ active: filter === 'all' }" @click="filter = 'all'">All</button>
                <button :class="{ active: filter === 'active' }" @click="filter = 'active'">Active</button>
                <button :class="{ active: filter === 'completed' }" @click="filter = 'completed'">Completed</button>
                <button :class="{ active: filter === 'cancelled', 'danger-active': filter === 'cancelled' }" @click="filter = 'cancelled'">
                    Cancelled
                </button>
            </div>
        </div>

        <!-- Main content -->
        <div class="content-area">
            <!-- Timeline table -->
            <div class="table-pane" :class="{ 'has-panel': selected }">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th style="width: 110px">NAME</th>
                            <th style="width: 80px">DIR</th>
                            <th style="width: 90px">PHASE</th>
                            <th style="width: 70px">DURATION</th>
                            <th>COMPONENT</th>
                            <th>TIMELINE</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr
                            v-for="(entry, i) in filtered"
                            :key="entry.id"
                            :class="{ selected: selected?.id === entry.id }"
                            @click="selected = selected?.id === entry.id ? null : entry"
                        >
                            <td>
                                <span class="mono" style="font-size: 11px; font-weight: 500">{{ entry.transitionName }}</span>
                            </td>
                            <td>
                                <span class="mono" style="font-size: 11px" :style="{ color: directionColor(entry) }">
                                    {{ directionLabel(entry) }}
                                </span>
                            </td>
                            <td>
                                <span class="badge" :class="phaseBadgeClass(entry.phase)">{{ entry.phase }}</span>
                            </td>
                            <td class="mono" style="font-size: 11px; color: var(--text2)">
                                {{ entry.durationMs !== undefined ? entry.durationMs + 'ms' : '—' }}
                            </td>
                            <td class="muted" style="font-size: 11px">{{ entry.parentComponent }}</td>
                            <td class="bar-cell">
                                <div class="bar-track">
                                    <div
                                        class="bar-fill"
                                        :style="{
                                            left: timelineGeometry[i]?.left + '%',
                                            width: Math.max(timelineGeometry[i]?.width ?? 1, 1) + '%',
                                            background: phaseColor(entry.phase),
                                            opacity: entry.phase === 'entering' || entry.phase === 'leaving' ? '0.55' : '1',
                                        }"
                                    />
                                </div>
                            </td>
                        </tr>

                        <tr v-if="!filtered.length">
                            <td colspan="6" style="text-align: center; color: var(--text3); padding: 24px">
                                {{
                                    connected
                                        ? 'No transitions recorded yet — trigger one on the page.'
                                        : 'Waiting for connection to the Nuxt app…'
                                }}
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>

            <!-- Detail panel -->
            <transition name="panel-slide">
                <aside v-if="selected" class="detail-panel">
                    <div class="panel-header">
                        <span class="panel-title">{{ selected.transitionName }}</span>
                        <button class="close-btn" @click="selected = null">✕</button>
                    </div>

                    <div class="panel-section">
                        <div class="panel-row">
                            <span class="panel-key">Direction</span>
                            <span class="panel-val" :style="{ color: directionColor(selected) }">{{ directionLabel(selected) }}</span>
                        </div>
                        <div class="panel-row">
                            <span class="panel-key">Phase</span>
                            <span class="badge" :class="phaseBadgeClass(selected.phase)">{{ selected.phase }}</span>
                        </div>
                        <div class="panel-row">
                            <span class="panel-key">Component</span>
                            <span class="panel-val mono">{{ selected.parentComponent }}</span>
                        </div>
                        <div v-if="selected.mode" class="panel-row">
                            <span class="panel-key">Mode</span>
                            <span class="panel-val mono">{{ selected.mode }}</span>
                        </div>
                    </div>

                    <div class="panel-section">
                        <div class="panel-section-title">Timing</div>
                        <div class="panel-row">
                            <span class="panel-key">Start</span>
                            <span class="panel-val mono">{{ selected.startTime.toFixed(2) }}ms</span>
                        </div>
                        <div class="panel-row">
                            <span class="panel-key">End</span>
                            <span class="panel-val mono">
                                {{ selected.endTime !== undefined ? selected.endTime.toFixed(2) + 'ms' : '—' }}
                            </span>
                        </div>
                        <div class="panel-row">
                            <span class="panel-key">Duration</span>
                            <span class="panel-val mono" style="font-weight: 500">
                                {{
                                    selected.durationMs !== undefined
                                        ? selected.durationMs + 'ms'
                                        : selected.phase === 'interrupted'
                                          ? 'interrupted'
                                          : 'in progress'
                                }}
                            </span>
                        </div>
                    </div>

                    <div class="panel-section">
                        <div class="panel-section-title">Flags</div>
                        <div class="panel-row">
                            <span class="panel-key">Appear</span>
                            <span class="panel-val" :style="{ color: selected.appear ? 'var(--amber)' : 'var(--text3)' }">
                                {{ selected.appear ? 'yes' : 'no' }}
                            </span>
                        </div>
                        <div class="panel-row">
                            <span class="panel-key">Cancelled</span>
                            <span class="panel-val" :style="{ color: selected.cancelled ? 'var(--red)' : 'var(--text3)' }">
                                {{ selected.cancelled ? 'yes' : 'no' }}
                            </span>
                        </div>
                    </div>

                    <div v-if="selected.cancelled" class="cancel-notice">
                        This transition was cancelled mid-flight. The element may be stuck in a partial animation state if the interruption
                        was not handled with
                        <code>onEnterCancelled</code>
                        /
                        <code>onLeaveCancelled</code>
                        .
                    </div>

                    <div v-if="selected.phase === 'entering' || selected.phase === 'leaving'" class="active-notice">
                        Transition is currently in progress. If it stays in this state longer than expected, the
                        <code>done()</code>
                        callback may not be getting called (JS-mode transition stall).
                    </div>
                </aside>
            </transition>
        </div>
    </div>
</template>

<style scoped>
.timeline-root {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
}

/* ── Stats ───────────────────────────────────────────────────────────────── */
.stats-row {
    display: flex;
    gap: 10px;
    padding: 12px 14px 0;
    flex-shrink: 0;
}

.stat-card {
    background: var(--bg2);
    border: 0.5px solid var(--border);
    border-radius: var(--radius);
    padding: 8px 14px;
    min-width: 72px;
    text-align: center;
}

.stat-val {
    font-size: 20px;
    font-weight: 600;
    font-family: var(--mono);
    line-height: 1.1;
}

.stat-unit {
    font-size: 12px;
    opacity: 0.6;
    margin-left: 1px;
}

.stat-label {
    font-size: 10px;
    color: var(--text3);
    margin-top: 2px;
    text-transform: uppercase;
    letter-spacing: 0.4px;
}

/* ── Toolbar ─────────────────────────────────────────────────────────────── */
.toolbar {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 14px;
    flex-shrink: 0;
    border-bottom: 0.5px solid var(--border);
}

.search-input {
    flex: 1;
    max-width: 260px;
}

.filter-group {
    display: flex;
    gap: 4px;
}

/* ── Content ─────────────────────────────────────────────────────────────── */
.content-area {
    display: flex;
    flex: 1;
    overflow: hidden;
    min-height: 0;
}

.table-pane {
    flex: 1;
    overflow: hidden auto;
    min-width: 0;
}

/* ── Timeline bar ────────────────────────────────────────────────────────── */
.bar-cell {
    width: 200px;
    padding: 4px 8px;
}

.bar-track {
    position: relative;
    height: 8px;
    background: var(--bg2);
    border-radius: 4px;
    overflow: hidden;
}

.bar-fill {
    position: absolute;
    top: 0;
    height: 100%;
    min-width: 3px;
    border-radius: 4px;
    transition: width 0.15s;
}

/* ── Detail panel ────────────────────────────────────────────────────────── */
.detail-panel {
    width: 260px;
    flex-shrink: 0;
    border-left: 0.5px solid var(--border);
    overflow-y: auto;
    background: var(--bg3);
    padding: 0 0 16px;
}

.panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 14px 8px;
    border-bottom: 0.5px solid var(--border);
    position: sticky;
    top: 0;
    background: var(--bg3);
    z-index: 1;
}

.panel-title {
    font-family: var(--mono);
    font-size: 13px;
    font-weight: 500;
}

.close-btn {
    border: none;
    background: transparent;
    color: var(--text3);
    font-size: 11px;
    padding: 2px 6px;
    cursor: pointer;
}

.panel-section {
    padding: 10px 14px 6px;
    border-bottom: 0.5px solid var(--border);
}

.panel-section-title {
    font-size: 10px;
    font-weight: 500;
    color: var(--text3);
    text-transform: uppercase;
    letter-spacing: 0.4px;
    margin-bottom: 8px;
}

.panel-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
    padding: 3px 0;
    font-size: 12px;
}

.panel-key {
    color: var(--text3);
    flex-shrink: 0;
}

.panel-val {
    color: var(--text);
    text-align: right;
    word-break: break-all;
}

.cancel-notice,
.active-notice {
    margin: 10px 14px 0;
    font-size: 11px;
    line-height: 1.6;
    padding: 8px 10px;
    border-radius: var(--radius);
}

.cancel-notice {
    background: rgb(226 75 74 / 10%);
    color: var(--red);
    border: 0.5px solid rgb(226 75 74 / 30%);
}

.active-notice {
    background: rgb(127 119 221 / 10%);
    color: var(--purple);
    border: 0.5px solid rgb(127 119 221 / 30%);
}

code {
    font-family: var(--mono);
    font-size: 10px;
    background: rgb(0 0 0 / 15%);
    padding: 1px 4px;
    border-radius: 3px;
}

/* Panel slide transition */
.panel-slide-enter-active,
.panel-slide-leave-active {
    transition:
        transform 0.18s ease,
        opacity 0.18s ease;
}

.panel-slide-enter-from,
.panel-slide-leave-to {
    transform: translateX(12px);
    opacity: 0;
}
</style>
