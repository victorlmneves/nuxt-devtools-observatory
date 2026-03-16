<script setup lang="ts">
/**
 * FadeBox — healthy transition example.
 *
 * Uses a CSS-mode <Transition name="fade"> and <TransitionGroup name="list">.
 * Every enter/leave completes normally → the Transition Tracker should show
 * entries going enter → entered and leave → left with a clean durationMs.
 */
import { ref } from 'vue'

const visible = ref(true)
const items = ref(['apple', 'banana', 'cherry'])

function addItem() {
    const fruits = ['dragonfruit', 'elderberry', 'fig', 'grape', 'honeydew']
    const next = fruits[Math.floor(Math.random() * fruits.length)]

    if (!items.value.includes(next)) {
        items.value.push(next)
    }
}

function removeRandom() {
    if (items.value.length > 1) {
        items.value.splice(Math.floor(Math.random() * items.value.length), 1)
    }
}
</script>

<template>
    <div class="demo-card">
        <h3>
            Healthy transitions
            <span class="badge ok">CSS mode</span>
        </h3>
        <p class="hint">
            All enter/leave cycles complete normally. Check the tracker — every entry should reach
            <code>entered</code>
            or
            <code>left</code>
            .
        </p>

        <div class="controls">
            <button @click="visible = !visible">
                {{ visible ? 'Hide box' : 'Show box' }}
            </button>
        </div>

        <Transition name="fade" appear>
            <div v-if="visible" class="fade-box">I fade in and out cleanly.</div>
        </Transition>

        <hr class="divider" />

        <div class="controls">
            <button @click="addItem">Add fruit</button>
            <button @click="removeRandom">Remove random</button>
        </div>

        <TransitionGroup name="list" tag="ul" class="fruit-list">
            <li v-for="item in items" :key="item" class="fruit-item">{{ item }}</li>
        </TransitionGroup>
    </div>
</template>

<style scoped>
.demo-card {
    background: #f0fdf4;
    border: 1px solid #86efac;
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
    color: #555;
    margin: 0 0 12px;
}

.controls {
    display: flex;
    gap: 8px;
    margin-bottom: 10px;
}

button {
    font-size: 12px;
    padding: 5px 12px;
    border: 1px solid #86efac;
    border-radius: 6px;
    background: #fff;
    cursor: pointer;
}

button:hover {
    background: #dcfce7;
}

.fade-box {
    background: #dcfce7;
    border: 1px solid #4ade80;
    border-radius: 8px;
    padding: 10px 14px;
    font-size: 13px;
    margin-bottom: 6px;
}

.badge {
    font-size: 10px;
    font-weight: 600;
    padding: 2px 8px;
    border-radius: 99px;
}

.badge.ok {
    background: #dcfce7;
    color: #166534;
}

.divider {
    border: none;
    border-top: 1px solid #bbf7d0;
    margin: 12px 0;
}

.fruit-list {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
}

.fruit-item {
    background: #fff;
    border: 1px solid #4ade80;
    border-radius: 6px;
    padding: 4px 10px;
    font-size: 12px;
}

/* Transition CSS classes */
.fade-enter-active,
.fade-leave-active {
    transition:
        opacity 0.35s ease,
        transform 0.35s ease;
}

.fade-enter-from,
.fade-leave-to {
    opacity: 0;
    transform: translateY(6px);
}

.list-enter-active,
.list-leave-active {
    transition: all 0.28s ease;
}

.list-enter-from,
.list-leave-to {
    opacity: 0;
    transform: scale(0.85);
}

.list-move {
    transition: transform 0.28s ease;
}
</style>
