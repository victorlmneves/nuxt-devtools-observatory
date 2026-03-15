// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createApp, defineComponent, h, provide } from 'vue'
import { setupProvideInjectRegistry, __devProvide, __devInject } from '../../src/runtime/composables/provide-inject-registry'

type ObservatoryWindow = Window & {
    __observatory__?: { provideInject?: ReturnType<typeof setupProvideInjectRegistry> }
}

function getWindow() {
    return window as ObservatoryWindow
}

/** Mount a component tree and run setup functions, then unmount. Returns the app for cleanup. */
function mountApp(rootComponent: ReturnType<typeof defineComponent>) {
    const app = createApp(rootComponent)
    const el = document.createElement('div')
    app.mount(el)

    return { app, el }
}

beforeEach(() => {
    delete getWindow().__observatory__
    vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
    delete getWindow().__observatory__
    vi.restoreAllMocks()
})

describe('setupProvideInjectRegistry', () => {
    it('returns registerProvide, registerInject, and getAll', () => {
        const reg = setupProvideInjectRegistry()

        expect(typeof reg.registerProvide).toBe('function')
        expect(typeof reg.registerInject).toBe('function')
        expect(typeof reg.getAll).toBe('function')
    })

    it('registerProvide() pushes a ProvideEntry', () => {
        const reg = setupProvideInjectRegistry()

        reg.registerProvide({
            key: 'theme',
            componentName: 'App',
            componentFile: 'App.vue',
            componentUid: 1,
            isReactive: false,
            valueSnapshot: 'dark',
            line: 5,
        })

        expect(reg.getAll().provides).toHaveLength(1)
        expect(reg.getAll().provides[0].key).toBe('theme')
    })

    it('registerInject() pushes an InjectEntry', () => {
        const reg = setupProvideInjectRegistry()

        reg.registerInject({
            key: 'theme',
            componentName: 'Child',
            componentFile: 'Child.vue',
            componentUid: 2,
            resolved: true,
            line: 8,
        })

        expect(reg.getAll().injects).toHaveLength(1)
        expect(reg.getAll().injects[0].resolved).toBe(true)
    })

    it('getAll() returns both provides and injects arrays', () => {
        const reg = setupProvideInjectRegistry()
        const result = reg.getAll()

        expect(Array.isArray(result.provides)).toBe(true)
        expect(Array.isArray(result.injects)).toBe(true)
    })

    it('multiple registrations accumulate correctly', () => {
        const reg = setupProvideInjectRegistry()

        reg.registerProvide({
            key: 'a',
            componentName: 'C',
            componentFile: 'C.vue',
            componentUid: 1,
            isReactive: false,
            valueSnapshot: null,
            line: 1,
        })
        reg.registerProvide({
            key: 'b',
            componentName: 'C',
            componentFile: 'C.vue',
            componentUid: 1,
            isReactive: false,
            valueSnapshot: null,
            line: 2,
        })
        reg.registerInject({ key: 'a', componentName: 'D', componentFile: 'D.vue', componentUid: 2, resolved: true, line: 5 })

        expect(reg.getAll().provides).toHaveLength(2)
        expect(reg.getAll().injects).toHaveLength(1)
    })
})

describe('__devProvide', () => {
    it('registers a ProvideEntry in the registry', () => {
        const reg = setupProvideInjectRegistry()
        getWindow().__observatory__ = { provideInject: reg }

        __devProvide('myKey', 'myValue', { file: 'Comp.vue', line: 10 })

        expect(reg.getAll().provides).toHaveLength(1)

        const entry = reg.getAll().provides[0]

        expect(entry.key).toBe('myKey')
        expect(entry.componentFile).toBe('Comp.vue')
        expect(entry.line).toBe(10)
    })

    it('records isReactive: false for a plain (non-reactive) value', () => {
        const reg = setupProvideInjectRegistry()
        getWindow().__observatory__ = { provideInject: reg }

        __devProvide('plain', 'static-string', { file: 'C.vue', line: 1 })

        expect(reg.getAll().provides[0].isReactive).toBe(false)
    })

    it('records valueSnapshot of the provided value', () => {
        const reg = setupProvideInjectRegistry()
        getWindow().__observatory__ = { provideInject: reg }

        __devProvide('config', { debug: true }, { file: 'C.vue', line: 1 })

        expect(reg.getAll().provides[0].valueSnapshot).toEqual({ debug: true })
    })

    it('stores [Function] snapshot for function values', () => {
        const reg = setupProvideInjectRegistry()
        getWindow().__observatory__ = { provideInject: reg }

        __devProvide('handler', () => {}, { file: 'C.vue', line: 1 })

        expect(reg.getAll().provides[0].valueSnapshot).toBe('[Function]')
    })

    it('is a no-op (does not register) when __observatory__ is not set', () => {
        // No __observatory__ on window
        expect(() => __devProvide('k', 'v', { file: 'C.vue', line: 1 })).not.toThrow()
    })
})

describe('__devInject', () => {
    it('registers an InjectEntry with resolved: false when key has no provider', () => {
        const reg = setupProvideInjectRegistry()
        getWindow().__observatory__ = { provideInject: reg }

        __devInject('nonExistentKey', undefined, { file: 'Comp.vue', line: 5 })

        expect(reg.getAll().injects).toHaveLength(1)

        const entry = reg.getAll().injects[0]

        expect(entry.key).toBe('nonExistentKey')
        expect(entry.resolved).toBe(false)
        expect(entry.componentFile).toBe('Comp.vue')
    })

    it('returns the default value when the key has no provider (inside a component)', () => {
        // Vue's inject() only returns the defaultValue when called inside a component setup.
        // Outside a component it returns undefined regardless of the default.
        let result: string | undefined
        const Comp = defineComponent({
            setup() {
                result = __devInject('missingKey', 'fallback', { file: 'C.vue', line: 1 }) as string
                return () => h('div')
            },
        })
        const app = createApp(Comp)
        app.mount(document.createElement('div'))
        app.unmount()
        expect(result).toBe('fallback')
    })

    it('is a no-op (does not register) when __observatory__ is not set', () => {
        expect(() => __devInject('k', undefined, { file: 'C.vue', line: 1 })).not.toThrow()
    })
})

describe('__devProvide + __devInject in component tree', () => {
    it('__devInject records resolved: true when an ancestor provides the key', () => {
        const reg = setupProvideInjectRegistry()
        getWindow().__observatory__ = { provideInject: reg }

        let injectEntry: ReturnType<typeof reg.getAll>['injects'][0] | undefined

        const Child = defineComponent({
            setup() {
                __devInject('color', undefined, { file: 'Child.vue', line: 3 })
                injectEntry = reg.getAll().injects.at(-1)
                return () => h('span', 'child')
            },
        })

        const Parent = defineComponent({
            setup() {
                provide('color', 'red') // native Vue provide
                return () => h(Child)
            },
        })

        const { app } = mountApp(Parent)
        app.unmount()

        expect(injectEntry).toBeDefined()
        expect(injectEntry!.resolved).toBe(true)
        expect(injectEntry!.key).toBe('color')
    })

    it('__devProvide records isReactive: true for a ref value', async () => {
        const { ref } = await import('vue')
        const reg = setupProvideInjectRegistry()
        getWindow().__observatory__ = { provideInject: reg }

        const Parent = defineComponent({
            setup() {
                __devProvide('count', ref(0), { file: 'Parent.vue', line: 2 })
                return () => h('div')
            },
        })

        const { app } = mountApp(Parent)
        app.unmount()

        expect(reg.getAll().provides).toHaveLength(1)
        expect(reg.getAll().provides[0].isReactive).toBe(true)
    })
})
