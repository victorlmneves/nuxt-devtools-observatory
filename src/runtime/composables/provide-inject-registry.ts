import { ref, isRef, isReactive, unref, getCurrentInstance, provide, inject } from 'vue'

export interface ProvideEntry {
    key: string
    componentName: string
    componentFile: string
    componentUid: number
    isReactive: boolean
    valueSnapshot: unknown
    line: number
}

export interface InjectEntry {
    key: string
    componentName: string
    componentFile: string
    componentUid: number
    resolved: boolean
    resolvedFromFile?: string
    resolvedFromUid?: number
    line: number
}

/**
 * Sets up the provide/inject registry, which tracks all provide/inject calls
 * and their associated metadata (e.g. component name, file, line).
 * @returns {object} The provide/inject registry with `registerProvide`, `registerInject`, and `getAll` members.
 */
export function setupProvideInjectRegistry() {
    const provides = ref<ProvideEntry[]>([])
    const injects = ref<InjectEntry[]>([])

    function registerProvide(entry: ProvideEntry) {
        provides.value.push(entry)
        emit('provide:register', entry)
    }

    function registerInject(entry: InjectEntry) {
        injects.value.push(entry)
        emit('inject:register', entry)
    }

    function getAll() {
        return { provides: provides.value, injects: injects.value }
    }

    function emit(event: string, data: unknown) {
        if (!import.meta.client) {
            return
        }

        const channel = (window as Window & { __nuxt_devtools__?: { channel?: { send: (event: string, data: unknown) => void } } })
            .__nuxt_devtools__?.channel
        channel?.send(event, data)
    }

    return { registerProvide, registerInject, getAll }
}

// ── Dev shims called by Vite transform ────────────────────────────────────

export function __devProvide(key: string | symbol, value: unknown, meta: { file: string; line: number }) {
    provide(key, value)

    if (!import.meta.dev || !import.meta.client) {
        return
    }

    const registry = (window as Window & { __observatory__?: { provideInject?: ReturnType<typeof setupProvideInjectRegistry> } })
        .__observatory__?.provideInject

    if (!registry) {
        return
    }

    const instance = getCurrentInstance()
    registry.registerProvide({
        key: String(key),
        componentName: instance?.type?.__name ?? 'unknown',
        componentFile: meta.file,
        componentUid: instance?.uid ?? -1,
        isReactive: isRef(value) || isReactive(value as object),
        valueSnapshot: safeSnapshot(unref(value)),
        line: meta.line,
    })
}

export function __devInject<T>(key: string | symbol, defaultValue: T | undefined, meta: { file: string; line: number }): T | undefined {
    const resolved = inject<T>(key, defaultValue as T)

    if (!import.meta.dev || !import.meta.client) {
        return resolved
    }

    const registry = (window as Window & { __observatory__?: { provideInject?: ReturnType<typeof setupProvideInjectRegistry> } })
        .__observatory__?.provideInject

    if (!registry) {
        return resolved
    }

    const instance = getCurrentInstance()
    const providerInfo = findProvider(String(key), instance)

    registry.registerInject({
        key: String(key),
        componentName: instance?.type?.__name ?? 'unknown',
        componentFile: meta.file,
        componentUid: instance?.uid ?? -1,
        resolved: resolved !== undefined,
        resolvedFromFile: providerInfo?.file,
        resolvedFromUid: providerInfo?.uid,
        line: meta.line,
    })

    return resolved
}

/**
 * Walks up the `instance.parent` chain to find the first ancestor that provides the given key.
 * @param {string} key - The injection key to search for
 * @param {ReturnType<typeof getCurrentInstance>} instance - The current component instance
 * @returns {{ file: string, uid: number } | null} The providing ancestor's file and uid, or null
 */
function findProvider(key: string, instance: ReturnType<typeof getCurrentInstance>) {
    let cur = instance?.parent

    while (cur) {
        if (cur.appContext?.provides && key in cur.appContext.provides) {
            return { file: cur.type?.__file ?? 'unknown', uid: cur.uid }
        }

        if (
            (cur as { provides?: Record<string, unknown> }).provides &&
            key in ((cur as { provides?: Record<string, unknown> }).provides ?? {})
        ) {
            return { file: cur.type?.__file ?? 'unknown', uid: cur.uid }
        }

        cur = cur.parent
    }

    return null
}

function safeSnapshot(value: unknown): unknown {
    try {
        if (value === null || value === undefined) {
            return value
        }

        if (typeof value === 'function') {
            return '[Function]'
        }

        if (typeof value === 'object') {
            return JSON.parse(JSON.stringify(value))
        }

        return value
    } catch {
        return '[unserializable]'
    }
}
