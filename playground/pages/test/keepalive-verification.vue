<script setup lang="ts">
import { defineAsyncComponent, defineComponent, h, onMounted, ref, shallowRef } from 'vue'

const tab = ref<'a' | 'b' | 'c'>('a')
const suspenseKey = ref(0)
const fallbackSeen = ref(0)
const resolveSeen = ref(0)
const suspenseReady = ref(false)

function createSlowAsync() {
    return defineAsyncComponent({
        loader: () =>
            new Promise<{ default: ReturnType<typeof defineComponent> }>((resolve) => {
                setTimeout(() => {
                    resolve({
                        default: defineComponent({
                            name: 'SlowAsyncPanel',
                            setup: () => () => h('div', { 'data-testid': 'suspense-ready' }, 'Async panel resolved'),
                        }),
                    })
                }, 600)
            }),
    })
}

const SlowAsync = shallowRef(createSlowAsync())

const PaneA = defineComponent({
    name: 'KeepAlivePaneA',
    setup: () => () => h('div', { class: 'pane pane-a', 'data-testid': 'pane-a' }, 'Pane A is active'),
})

const PaneB = defineComponent({
    name: 'KeepAlivePaneB',
    setup: () => () => h('div', { class: 'pane pane-b', 'data-testid': 'pane-b' }, 'Pane B is active'),
})

const PaneC = defineComponent({
    name: 'KeepAlivePaneC',
    setup: () => () => h('div', { class: 'pane pane-c', 'data-testid': 'pane-c' }, 'Pane C is active'),
})

onMounted(() => {
    suspenseReady.value = true
})

function remountSuspense() {
    SlowAsync.value = createSlowAsync()
    suspenseKey.value += 1
}
</script>

<template>
    <div class="layout">
        <h2>KeepAlive / Suspense Verification</h2>
        <p class="lede">
            Open the Observatory <strong>KeepAlive</strong> tab. Switch panes to record activate / deactivate / cache eviction
            (<code>max=2</code>). Remount Suspense to record pending, fallback, and resolve timing.
        </p>

        <section>
            <h3>KeepAlive cache (max 2)</h3>
            <div class="controls">
                <button data-testid="show-pane-a" :class="{ active: tab === 'a' }" @click="tab = 'a'">Pane A</button>
                <button data-testid="show-pane-b" :class="{ active: tab === 'b' }" @click="tab = 'b'">Pane B</button>
                <button data-testid="show-pane-c" :class="{ active: tab === 'c' }" @click="tab = 'c'">Pane C</button>
            </div>
            <KeepAlive :max="2">
                <PaneA v-if="tab === 'a'" />
                <PaneB v-else-if="tab === 'b'" />
                <PaneC v-else />
            </KeepAlive>
        </section>

        <section>
            <h3>Suspense fallback timing</h3>
            <div class="controls">
                <button data-testid="remount-suspense" @click="remountSuspense">Remount Suspense ({{ suspenseKey }})</button>
                <span class="muted">fallback {{ fallbackSeen }} · resolve {{ resolveSeen }}</span>
            </div>
            <ClientOnly>
                <Suspense
                    v-if="suspenseReady"
                    :key="suspenseKey"
                    :timeout="80"
                    @fallback="fallbackSeen++"
                    @resolve="resolveSeen++"
                >
                    <component :is="SlowAsync" />
                    <template #fallback>
                        <div data-testid="suspense-fallback" class="pane pane-fallback">Loading async panel…</div>
                    </template>
                </Suspense>
            </ClientOnly>
        </section>
    </div>
</template>

<style scoped>
.layout {
    padding: 24px 32px;
    max-width: 720px;
}

.lede {
    color: #555;
    font-size: 13px;
    margin-bottom: 20px;
}

section + section {
    margin-top: 28px;
}

.controls {
    display: flex;
    gap: 8px;
    align-items: center;
    margin: 10px 0 14px;
}

button.active {
    background: #111;
    color: #fff;
}

.pane {
    padding: 16px;
    border: 1px solid #ddd;
    border-radius: 8px;
}

.pane-a {
    background: #eef6ff;
}

.pane-b {
    background: #eefbf3;
}

.pane-c {
    background: #fff6e8;
}

.pane-fallback {
    background: #fff3e0;
}

.muted {
    color: #777;
    font-size: 12px;
}
</style>
