<script setup lang="ts">
/**
 * CancelledTransition — demonstrates a leave-cancelled scenario.
 *
 * The bug pattern: a slow leave animation is interrupted mid-flight because
 * the v-if condition flips back to true before the leave finishes. Vue calls
 * onLeaveCancelled. If the developer's JS hook has already started modifying
 * the DOM (e.g. kicked off a GSAP timeline or set inline styles) those changes
 * are now orphaned — the element is back in the tree in a half-animated state.
 *
 * What to look for in the Transition Tracker:
 *   - A "leave" entry that starts in `leaving`
 *   - Before it reaches `left`, a rapid toggle re-shows the element
 *   - The leave entry flips to `leave-cancelled` with cancelled: true
 *   - A fresh "enter" entry starts immediately after
 *   - The out-in mode entry shows the same pattern but serialised
 */
import { ref } from 'vue'

const visible = ref(true)
let leaveTimer: ReturnType<typeof setTimeout> | null = null

function slowLeave(_el: Element, done: () => void) {
    // Simulate a 1200ms JS-driven leave (longer than a typical CSS transition)
    leaveTimer = setTimeout(() => {
        done()
        leaveTimer = null
    }, 1200)
}

function onLeaveCancelled(_el: Element) {
    // Clean up the pending timer so we don't call done() on a dead transition
    if (leaveTimer !== null) {
        clearTimeout(leaveTimer)
        leaveTimer = null
    }
}

function quickFlip() {
    // Hide then immediately (~80ms) re-show — the leave cannot finish in time
    visible.value = false
    setTimeout(() => {
        visible.value = true
    }, 80)
}

// out-in mode example
const page = ref<'a' | 'b'>('a')
</script>

<template>
    <div class="demo-card">
        <h3>
            Cancelled transition
            <span class="badge warn">interrupted mid-flight</span>
        </h3>
        <p class="hint">
            Click
            <strong>Quick flip</strong>
            to hide and immediately re-show. The 1200ms JS leave is interrupted mid-flight — the tracker records
            <code>leave-cancelled</code>
            . Compare with
            <strong>Slow toggle</strong>
            which lets the leave complete normally.
        </p>

        <div class="controls">
            <button class="btn-warn" @click="quickFlip">Quick flip (cancels leave)</button>
            <button @click="visible = !visible">Slow toggle (completes leave)</button>
        </div>

        <Transition
            name="slow"
            :css="false"
            :on-leave="slowLeave"
            :on-leave-cancelled="onLeaveCancelled"
            :on-enter="(_el: Element, done: () => void) => done()"
        >
            <div v-if="visible" class="content-box">
                I have a 1200ms JS-driven leave. Interrupt it to see
                <code>leave-cancelled</code>
                in the tracker.
            </div>
        </Transition>

        <hr class="divider" />

        <p class="hint" style="margin-bottom: 10px">
            <strong>out-in mode</strong>
            — swapping pages quickly causes the outgoing leave to be cancelled when the incoming enter starts.
        </p>

        <div class="controls">
            <button @click="page = page === 'a' ? 'b' : 'a'">Switch page (out-in)</button>
        </div>

        <Transition name="page-swap" mode="out-in">
            <div v-if="page === 'a'" key="a" class="page-box page-a">Page A — switch fast to see the leave cancelled</div>
            <div v-else key="b" class="page-box page-b">Page B — switch fast to see the leave cancelled</div>
        </Transition>
    </div>
</template>

<style scoped>
.demo-card {
    background: #fffbeb;
    border: 1px solid #fcd34d;
    border-radius: 10px;
    padding: 16px 20px;
    margin-top: 14px;
}

h3 {
    margin: 0 0 6px;
    font-size: 15px;
    display: flex;
    align-items: center;
    gap: 8px;
}

.hint {
    font-size: 12px;
    color: #78350f;
    margin: 0 0 12px;
    line-height: 1.6;
}

.controls {
    display: flex;
    gap: 8px;
    margin-bottom: 12px;
}

button {
    font-size: 12px;
    padding: 5px 12px;
    border-radius: 6px;
    cursor: pointer;
    background: #fff;
    border: 1px solid #fcd34d;
    color: #78350f;
}

button:hover {
    background: #fef9c3;
}

.btn-warn {
    background: #fef3c7;
    border-color: #f59e0b;
    color: #92400e;
    font-weight: 500;
}

.btn-warn:hover {
    background: #fde68a;
}

.badge {
    font-size: 10px;
    font-weight: 600;
    padding: 2px 8px;
    border-radius: 99px;
    background: #fef3c7;
    color: #92400e;
}

.content-box {
    background: #fffbeb;
    border: 1px solid #fcd34d;
    border-radius: 8px;
    padding: 10px 14px;
    font-size: 13px;
    margin-bottom: 8px;
}

.divider {
    border: none;
    border-top: 1px solid #fde68a;
    margin: 12px 0;
}

.page-box {
    border-radius: 8px;
    padding: 10px 14px;
    font-size: 13px;
}

.page-a {
    background: #eff6ff;
    border: 1px solid #93c5fd;
}

.page-b {
    background: #f0fdf4;
    border: 1px solid #86efac;
}

/* CSS transition classes for out-in page swap */
.page-swap-enter-active,
.page-swap-leave-active {
    transition:
        opacity 0.5s ease,
        transform 0.5s ease;
}

.page-swap-enter-from {
    opacity: 0;
    transform: translateX(10px);
}

.page-swap-leave-to {
    opacity: 0;
    transform: translateX(-10px);
}
</style>
