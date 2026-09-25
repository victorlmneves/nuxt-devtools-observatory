<script setup lang="ts">
const visitCount = useState('playground-visits', () => 0)
const theme = useState('playground-theme', () => 'light')
const token = useCookie<string | null>('playground-token', { maxAge: 120, path: '/', httpOnly: false })

function bumpVisits() {
    visitCount.value += 1
    token.value = `t-${visitCount.value}`
}

function toggleTheme() {
    theme.value = theme.value === 'light' ? 'dark' : 'light'
}

function clearToken() {
    token.value = null
}
</script>

<template>
    <section class="layout">
        <h2>State / cookies verification</h2>
        <p>Open Observatory → State. Keys should be <code>playground-visits</code>, <code>playground-theme</code>, and <code>playground-token</code>.</p>
        <p>visits: {{ visitCount }} · theme: {{ theme }} · cookie: {{ token ?? '—' }}</p>
        <div class="controls">
            <button data-testid="state-bump-visits" @click="bumpVisits">Bump visits (updates cookie)</button>
            <button data-testid="state-toggle-theme" @click="toggleTheme">Toggle theme</button>
            <button data-testid="state-clear-token" @click="clearToken">Clear cookie</button>
        </div>
    </section>
</template>

<style scoped>
.layout {
    padding: 24px 32px;
    max-width: 720px;
}

.controls {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 12px;
}
</style>
