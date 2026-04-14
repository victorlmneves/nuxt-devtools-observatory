<script setup lang="ts">
import { ref, computed } from 'vue'
import { useResizablePane } from '@observatory-client/composables/useResizablePane'
import { useObservatoryData } from '@observatory-client/stores/observatory'
import type { TransitionEntry } from '@observatory/types/snapshot'

const { transitions: entries, connected } = useObservatoryData()
const { paneWidth: detailWidth, onHandleMouseDown } = useResizablePane(260, 'observatory:transitions:detailWidth')

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

    return list.sort((a, b) => a.startTime - b.startTime)
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

    const minT = all.reduce((min, e) => Math.min(min, e.startTime), all[0].startTime)
    const maxT = all.reduce((max, e) => Math.max(max, e.endTime ?? e.startTime + 400), 0)
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
    <div class="transition-timeline tracker-view">
        <!-- Stats bar -->
        <div class="transition-timeline__stats tracker-stats-row">
            <div class="stat-card">
                <div class="stat-val">{{ stats.total }}</div>
                <div class="stat-label">total</div>
            </div>
            <div class="stat-card">
                <div class="stat-val stat-val--active">{{ stats.active }}</div>
                <div class="stat-label">active</div>
            </div>
            <div class="stat-card">
                <div class="stat-val stat-val--error">{{ stats.cancelled }}</div>
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
        <div class="transition-timeline__toolbar tracker-toolbar">
            <input v-model="search" type="search" placeholder="filter by name or component…" class="transition-timeline__search" />
            <div class="transition-timeline__filters">
                <button :class="{ active: filter === 'all' }" @click="filter = 'all'">All</button>
                <button :class="{ active: filter === 'active' }" @click="filter = 'active'">Active</button>
                <button :class="{ active: filter === 'completed' }" @click="filter = 'completed'">Completed</button>
                <button :class="{ active: filter === 'cancelled', 'danger-active': filter === 'cancelled' }" @click="filter = 'cancelled'">
                    Cancelled
                </button>
            </div>
        </div>

        <!-- Main content -->
        <div class="transition-timeline__content tracker-split">
            <!-- Timeline table -->
            <div class="transition-timeline__table tracker-table-wrap">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th class="transition-timeline__col-name">NAME</th>
                            <th class="transition-timeline__col-dir">DIR</th>
                            <th class="transition-timeline__col-phase">PHASE</th>
                            <th class="transition-timeline__col-duration">DURATION</th>
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
                                <span class="transition-timeline__name mono">{{ entry.transitionName }}</span>
                            </td>
                            <td>
                                <span class="transition-timeline__direction mono" :style="{ color: directionColor(entry) }">
                                    {{ directionLabel(entry) }}
                                </span>
                            </td>
                            <td>
                                <span class="badge" :class="phaseBadgeClass(entry.phase)">{{ entry.phase }}</span>
                            </td>
                            <td class="transition-timeline__duration mono">
                                {{ entry.durationMs !== undefined ? entry.durationMs + 'ms' : '—' }}
                            </td>
                            <td class="transition-timeline__component muted">{{ entry.parentComponent }}</td>
                            <td class="transition-timeline__bar-cell">
                                <div class="transition-timeline__bar-track">
                                    <div
                                        class="transition-timeline__bar-fill"
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
                            <td colspan="6" class="tracker-empty-cell">
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
                <div v-if="selected" class="tracker-resize-handle" @mousedown="onHandleMouseDown" />
            </transition>
            <transition name="panel-slide">
                <aside v-if="selected" class="transition-timeline__detail" :style="{ width: detailWidth + 'px' }">
                    <div class="transition-timeline__detail-header">
                        <span class="transition-timeline__detail-title">{{ selected.transitionName }}</span>
                        <button class="transition-timeline__close-btn" @click="selected = null">✕</button>
                    </div>

                    <div class="transition-timeline__detail-section">
                        <div class="transition-timeline__detail-row">
                            <span class="transition-timeline__detail-key">Direction</span>
                            <span class="transition-timeline__detail-val" :style="{ color: directionColor(selected) }">
                                {{ directionLabel(selected) }}
                            </span>
                        </div>
                        <div class="transition-timeline__detail-row">
                            <span class="transition-timeline__detail-key">Phase</span>
                            <span class="badge" :class="phaseBadgeClass(selected.phase)">{{ selected.phase }}</span>
                        </div>
                        <div class="transition-timeline__detail-row">
                            <span class="transition-timeline__detail-key">Component</span>
                            <span class="transition-timeline__detail-val transition-timeline__detail-val--mono mono">
                                {{ selected.parentComponent }}
                            </span>
                        </div>
                        <div v-if="selected.mode" class="transition-timeline__detail-row">
                            <span class="transition-timeline__detail-key">Mode</span>
                            <span class="transition-timeline__detail-val transition-timeline__detail-val--mono mono">
                                {{ selected.mode }}
                            </span>
                        </div>
                    </div>

                    <div class="transition-timeline__detail-section">
                        <div class="tracker-section-label transition-timeline__section-title">Timing</div>
                        <div class="transition-timeline__detail-row">
                            <span class="transition-timeline__detail-key">Start</span>
                            <span class="transition-timeline__detail-val transition-timeline__detail-val--mono mono">
                                {{ selected.startTime.toFixed(2) }}ms
                            </span>
                        </div>
                        <div class="transition-timeline__detail-row">
                            <span class="transition-timeline__detail-key">End</span>
                            <span class="transition-timeline__detail-val transition-timeline__detail-val--mono mono">
                                {{ selected.endTime !== undefined ? selected.endTime.toFixed(2) + 'ms' : '—' }}
                            </span>
                        </div>
                        <div class="transition-timeline__detail-row">
                            <span class="transition-timeline__detail-key">Duration</span>
                            <span
                                class="transition-timeline__detail-val transition-timeline__detail-val--mono transition-timeline__detail-val--strong mono"
                            >
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

                    <div class="transition-timeline__detail-section">
                        <div class="tracker-section-label transition-timeline__section-title">Flags</div>
                        <div class="transition-timeline__detail-row">
                            <span class="transition-timeline__detail-key">Appear</span>
                            <span
                                class="transition-timeline__detail-val"
                                :style="{ color: selected.appear ? 'var(--amber)' : 'var(--text3)' }"
                            >
                                {{ selected.appear ? 'yes' : 'no' }}
                            </span>
                        </div>
                        <div class="transition-timeline__detail-row">
                            <span class="transition-timeline__detail-key">Cancelled</span>
                            <span
                                class="transition-timeline__detail-val"
                                :style="{ color: selected.cancelled ? 'var(--red)' : 'var(--text3)' }"
                            >
                                {{ selected.cancelled ? 'yes' : 'no' }}
                            </span>
                        </div>
                    </div>

                    <div v-if="selected.cancelled" class="transition-timeline__notice transition-timeline__notice--cancelled">
                        This transition was cancelled mid-flight. The element may be stuck in a partial animation state if the interruption
                        was not handled with
                        <code>onEnterCancelled</code>
                        /
                        <code>onLeaveCancelled</code>
                        .
                    </div>

                    <div
                        v-if="selected.phase === 'entering' || selected.phase === 'leaving'"
                        class="transition-timeline__notice transition-timeline__notice--active"
                    >
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
.transition-timeline__stats {
    display: flex;
    gap: 10px;
}

.transition-timeline__stats :deep(.stat-card) {
    min-width: 72px;
    text-align: center;
    padding: var(--tracker-space-2) 14px;
    border: var(--tracker-border-width) solid var(--border);
}

.transition-timeline__stats :deep(.stat-val) {
    font-weight: 600;
    font-family: var(--mono);
    line-height: 1.1;
}

.stat-unit {
    font-size: var(--tracker-font-size-md);
    opacity: 0.6;
    margin-left: 1px;
}

/* ── Toolbar ─────────────────────────────────────────────────────────────── */
.transition-timeline__toolbar {
    border-bottom: var(--tracker-border-width) solid var(--border);
    padding-bottom: 10px;
}

.transition-timeline__search {
    flex: 1;
    max-width: 260px;
}

.transition-timeline__filters {
    display: flex;
    gap: 4px;
}

/* ── Content ─────────────────────────────────────────────────────────────── */
.transition-timeline__content {
    align-items: stretch;
}

.transition-timeline__table {
    overflow: hidden auto;
    min-width: 0;
    border: none;
    border-radius: 0;
}

/* ── Timeline bar ────────────────────────────────────────────────────────── */
.transition-timeline__bar-cell {
    width: 200px;
    padding: 4px 8px;
}

.transition-timeline__bar-track {
    position: relative;
    height: 8px;
    background: var(--bg2);
    border-radius: 4px;
    overflow: hidden;
}

.transition-timeline__bar-fill {
    position: absolute;
    top: 0;
    height: 100%;
    min-width: 3px;
    border-radius: 4px;
    transition: width var(--tracker-transition-ui);
}

.transition-timeline__col-name {
    width: 110px;
}

.transition-timeline__col-dir {
    width: 80px;
}

.transition-timeline__col-phase {
    width: 90px;
}

.transition-timeline__col-duration {
    width: 70px;
}

.transition-timeline__name {
    font-size: var(--tracker-font-size-sm);
    font-weight: 500;
}

.transition-timeline__direction {
    font-size: var(--tracker-font-size-sm);
}

.transition-timeline__duration {
    font-size: var(--tracker-font-size-sm);
    color: var(--text2);
}

.transition-timeline__component {
    font-size: var(--tracker-font-size-sm);
}

/* ── Detail panel ────────────────────────────────────────────────────────── */
.transition-timeline__detail {
    display: flex;
    flex-direction: column;
    flex-shrink: 0;
    border: var(--tracker-border-width) solid var(--border);
    border-radius: var(--radius-lg);
    overflow-y: auto;
    background: var(--bg3);
    padding: 0 0 16px;
}

.transition-timeline__detail-header {
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

.transition-timeline__detail-title {
    font-family: var(--mono);
    font-size: 13px;
    font-weight: 500;
}

.transition-timeline__close-btn {
    border: none;
    background: transparent;
    color: var(--text3);
    font-size: var(--tracker-font-size-sm);
    padding: 2px 6px;
    cursor: pointer;
}

.transition-timeline__detail-section {
    padding: 10px 14px 6px;
    border-bottom: var(--tracker-border-width) solid var(--border);
}

.transition-timeline__section-title {
    margin-bottom: 8px;
}

.transition-timeline__detail-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
    padding: 3px 0;
    font-size: var(--tracker-font-size-md);
}

.transition-timeline__detail-key {
    color: var(--text3);
    flex-shrink: 0;
}

.transition-timeline__detail-val {
    color: var(--text);
    text-align: right;
    word-break: break-all;
}

.transition-timeline__detail-val--mono {
    font-family: var(--mono);
}

.transition-timeline__detail-val--strong {
    font-weight: 500;
}

.transition-timeline__notice {
    margin: 10px 14px 0;
    font-size: var(--tracker-font-size-sm);
    line-height: 1.6;
    padding: 8px 10px;
    border-radius: var(--radius);
}

.transition-timeline__notice--cancelled {
    background: rgb(226 75 74 / 10%);
    color: var(--red);
    border: 0.5px solid rgb(226 75 74 / 30%);
}

.transition-timeline__notice--active {
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
