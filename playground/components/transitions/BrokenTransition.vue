<script setup lang="ts">
/**
 * BrokenTransition — demonstrates the "element does not exist" failure.
 *
 * The bug: a JS-mode <Transition> hook reaches into the DOM via
 * document.getElementById() to read a sibling element's height so it can
 * animate to an exact pixel value. If the element hasn't been rendered yet
 * (or has already been removed by the leave phase) the lookup returns null
 * and the handler throws — leaving the transition stuck in "entering" with
 * done() never called.
 *
 * What to look for in the Transition Tracker:
 *   - An entry stuck in the `entering` phase with no endTime / durationMs
 *   - The tracker's "stuck" warning fires for that entry
 *   - If you then click "Safe toggle" the healthy path runs and shows entered
 */
import { ref } from 'vue'

const broken = ref(false)
const safe = ref(false)
const error = ref<string | null>(null)

function brokenEnter(el: Element, done: () => void) {
    error.value = null
    // BUG: tries to read a sibling that does not exist in the DOM yet
    const phantom = document.getElementById('phantom-sibling-that-never-exists')

    if (!phantom) {
        // In a real app this would silently leave `done` uncalled.
        // We surface the failure visually here so it's obvious.
        error.value =
            'document.getElementById("phantom-sibling-that-never-exists") returned null — done() was never called. Transition is stuck in "entering".'

        // done() intentionally NOT called → transition stays in "entering"
        return
    }

    // This branch is never reached, but shows what the intended logic was
    const height = phantom.getBoundingClientRect().height
    ;(el as HTMLElement).style.maxHeight = height + 'px'
    requestAnimationFrame(done)
}

function safeEnter(_el: Element, done: () => void) {
    // Healthy path: does a layout read on the element being transitioned
    // (always safe — Vue guarantees the element exists when onEnter fires)
    requestAnimationFrame(done)
}
</script>

<template>
    <div class="demo-card">
        <h3>
            Missing DOM element
            <span class="badge err">JS mode — broken</span>
        </h3>
        <p class="hint">
            The JS-mode
            <code>onEnter</code>
            hook calls
            <code>document.getElementById("phantom-sibling-that-never-exists")</code>
            . That element never exists, so
            <code>done()</code>
            is never called — the transition stalls in
            <code>entering</code>
            . Check the Transition Tracker for a stuck entry with no
            <code>durationMs</code>
            .
        </p>

        <div class="controls">
            <button class="btn-err" @click="broken = !broken">Broken toggle (stalls)</button>
            <button class="btn-ok" @click="safe = !safe">Safe toggle (works)</button>
        </div>

        <Transition name="broken" :css="false" :on-enter="brokenEnter" :on-leave="(_el: Element, done: () => void) => done()">
            <div v-if="broken" class="broken-box">I am stuck in "entering". The tracker shows no durationMs.</div>
        </Transition>

        <div v-if="error" class="error-banner">
            <strong>Runtime error caught:</strong>
            <br />
            {{ error }}
        </div>

        <Transition name="safe" :css="false" :on-enter="safeEnter" :on-leave="(_el: Element, done: () => void) => done()">
            <div v-if="safe" class="safe-box">
                I animate normally. Tracker shows
                <code>entered</code>
                with a duration.
            </div>
        </Transition>
    </div>
</template>

<style scoped>
.demo-card {
    background: #fff7f7;
    border: 1px solid #fca5a5;
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
    color: #7f1d1d;
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
}

.btn-err {
    background: #fee2e2;
    border: 1px solid #f87171;
    color: #991b1b;
}

.btn-err:hover {
    background: #fecaca;
}

.btn-ok {
    background: #dcfce7;
    border: 1px solid #4ade80;
    color: #166534;
}

.btn-ok:hover {
    background: #bbf7d0;
}

.badge {
    font-size: 10px;
    font-weight: 600;
    padding: 2px 8px;
    border-radius: 99px;
}

.badge.err {
    background: #fee2e2;
    color: #991b1b;
}

.broken-box {
    background: #fef2f2;
    border: 1px solid #f87171;
    border-radius: 8px;
    padding: 10px 14px;
    font-size: 13px;
    margin-bottom: 8px;
}

.safe-box {
    background: #f0fdf4;
    border: 1px solid #4ade80;
    border-radius: 8px;
    padding: 10px 14px;
    font-size: 13px;
    margin-bottom: 8px;
}

.error-banner {
    background: #7f1d1d;
    color: #fef2f2;
    border-radius: 8px;
    padding: 10px 14px;
    font-size: 12px;
    line-height: 1.6;
    margin-bottom: 8px;
}
</style>
