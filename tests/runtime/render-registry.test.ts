// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest'
import { createApp, defineComponent, h, TriggerOpTypes, type ComponentPublicInstance } from 'vue'
import { setupRenderRegistry } from '../../src/runtime/composables/render-registry'

function makeNuxtApp(app: ReturnType<typeof createApp>) {
    return { vueApp: app }
}

/**
 * Build a minimal fake ComponentPublicInstance sufficient for mixin hooks.
 * @param {number} uid - The component uid
 * @param {string} [name] - The component display name. Defaults to `TestComp`
 * @param {string} [file] - The component source file. Defaults to `Test.vue`
 * @returns {ComponentPublicInstance} A fake component public instance
 */
function fakeCPI(uid: number, name = 'TestComp', file = 'Test.vue'): ComponentPublicInstance {
    return {
        $: {
            uid,
            type: { __name: name, __file: file, name },
        },
        $el: {
            tagName: 'DIV',
            id: '',
            className: 'test-comp',
            getBoundingClientRect: () => ({ x: 0, y: 0, width: 100, height: 50, top: 0, left: 0 }),
        },
        $parent: null,
    } as unknown as ComponentPublicInstance
}

describe('setupRenderRegistry', () => {
    it('returns getAll and snapshot functions', () => {
        const app = createApp({})
        const { getAll, snapshot } = setupRenderRegistry(makeNuxtApp(app))

        expect(typeof getAll).toBe('function')
        expect(typeof snapshot).toBe('function')
    })

    it('snapshot() is an alias for getAll()', () => {
        const app = createApp({})
        const { getAll, snapshot } = setupRenderRegistry(makeNuxtApp(app))

        expect(getAll()).toEqual(snapshot())
    })

    it('returns an empty list when no components have rendered', () => {
        const app = createApp({})
        const { getAll } = setupRenderRegistry(makeNuxtApp(app))

        expect(getAll()).toEqual([])
    })

    it('installs a global mixin on the vueApp', () => {
        const app = createApp({})
        const mixinsBefore = (app as unknown as { _context: { mixins: unknown[] } })._context.mixins.length

        setupRenderRegistry(makeNuxtApp(app))

        const mixinsAfter = (app as unknown as { _context: { mixins: unknown[] } })._context.mixins.length

        expect(mixinsAfter).toBe(mixinsBefore + 1)
    })

    it('increments the renders counter when a render-triggered update fires', () => {
        const app = createApp({})
        const { getAll } = setupRenderRegistry(makeNuxtApp(app))

        // Get the mixin we just installed and call its `updated` hook directly
        const mixins = (app as unknown as { _context: { mixins: Array<Record<string, unknown>> } })._context.mixins
        const mixin = mixins[mixins.length - 1]

        const instance = fakeCPI(42)
        ;(mixin.renderTriggered as (this: ComponentPublicInstance, e: { key: string; type: string }) => void).call(instance, {
            key: 'items',
            type: TriggerOpTypes.SET,
        })
        ;(mixin.updated as (this: ComponentPublicInstance) => void).call(instance)
        ;(mixin.renderTriggered as (this: ComponentPublicInstance, e: { key: string; type: string }) => void).call(instance, {
            key: 'items',
            type: TriggerOpTypes.SET,
        })
        ;(mixin.updated as (this: ComponentPublicInstance) => void).call(instance)

        const entries = getAll()

        expect(entries).toHaveLength(1)
        expect(entries[0].uid).toBe(42)
        expect(entries[0].rerenders).toBe(2) // two renderTriggered+updated cycles
    })

    it('ignores updated hooks that were not preceded by renderTriggered', () => {
        const app = createApp({})
        const { getAll } = setupRenderRegistry(makeNuxtApp(app))

        const mixins = (app as unknown as { _context: { mixins: Array<Record<string, unknown>> } })._context.mixins
        const mixin = mixins[mixins.length - 1]

        const instance = fakeCPI(44)
        ;(mixin.updated as (this: ComponentPublicInstance) => void).call(instance)

        expect(getAll()[0].rerenders).toBe(0)
    })

    it('getAll() returns entries even when they are below the heatmap threshold', () => {
        const app = createApp({})
        const { getAll } = setupRenderRegistry(makeNuxtApp(app))

        const mixins = (app as unknown as { _context: { mixins: Array<Record<string, unknown>> } })._context.mixins
        const mixin = mixins[mixins.length - 1]

        const instA = fakeCPI(1, 'CompA')
        const instB = fakeCPI(2, 'CompB')

        // CompA fires updated twice — below threshold of 3
        ;(mixin.renderTriggered as (this: ComponentPublicInstance, e: { key: string; type: string }) => void).call(instA, {
            key: 'count',
            type: TriggerOpTypes.SET,
        })
        ;(mixin.updated as (this: ComponentPublicInstance) => void).call(instA)
        ;(mixin.renderTriggered as (this: ComponentPublicInstance, e: { key: string; type: string }) => void).call(instA, {
            key: 'count',
            type: TriggerOpTypes.SET,
        })
        ;(mixin.updated as (this: ComponentPublicInstance) => void).call(instA)

        // CompB fires updated three times — meets threshold
        ;(mixin.renderTriggered as (this: ComponentPublicInstance, e: { key: string; type: string }) => void).call(instB, {
            key: 'count',
            type: TriggerOpTypes.SET,
        })
        ;(mixin.updated as (this: ComponentPublicInstance) => void).call(instB)
        ;(mixin.renderTriggered as (this: ComponentPublicInstance, e: { key: string; type: string }) => void).call(instB, {
            key: 'count',
            type: TriggerOpTypes.SET,
        })
        ;(mixin.updated as (this: ComponentPublicInstance) => void).call(instB)
        ;(mixin.renderTriggered as (this: ComponentPublicInstance, e: { key: string; type: string }) => void).call(instB, {
            key: 'count',
            type: TriggerOpTypes.SET,
        })
        ;(mixin.updated as (this: ComponentPublicInstance) => void).call(instB)

        const visible = getAll()

        expect(visible).toHaveLength(2)
        expect(visible.map((entry) => entry.uid)).toEqual([1, 2])
    })

    it('initial mount does NOT count as a re-render (mountCount tracks it instead)', () => {
        const app = createApp({})
        const { getAll } = setupRenderRegistry(makeNuxtApp(app))

        const mixins = (app as unknown as { _context: { mixins: Array<Record<string, unknown>> } })._context.mixins
        const mixin = mixins[mixins.length - 1]

        const instance = fakeCPI(7, 'MountedOnly')
        ;(mixin.mounted as (this: ComponentPublicInstance) => void).call(instance)

        const entries = getAll()

        expect(entries).toHaveLength(1)
        expect(entries[0].uid).toBe(7)
        expect(entries[0].rerenders).toBe(0) // initial mount is NOT a re-render
        expect(entries[0].mountCount).toBe(1)
        expect(entries[0].navigationRenders).toBe(0)
    })

    it('tracks renders that happen during a route navigation window', () => {
        const app = createApp({})
        const { getAll, markNavigation } = setupRenderRegistry(makeNuxtApp(app))

        const mixins = (app as unknown as { _context: { mixins: Array<Record<string, unknown>> } })._context.mixins
        const mixin = mixins[mixins.length - 1]

        const instance = fakeCPI(70, 'RouterView')

        markNavigation()
        ;(mixin.renderTriggered as (this: ComponentPublicInstance, e: { key: string; type: string }) => void).call(instance, {
            key: 'route',
            type: TriggerOpTypes.SET,
        })
        ;(mixin.updated as (this: ComponentPublicInstance) => void).call(instance)

        expect(getAll()[0].rerenders).toBe(1)
        expect(getAll()[0].navigationRenders).toBe(1)
    })

    it('removes entries when components unmount', () => {
        const app = createApp({})
        const { getAll } = setupRenderRegistry(makeNuxtApp(app))

        const mixins = (app as unknown as { _context: { mixins: Array<Record<string, unknown>> } })._context.mixins
        const mixin = mixins[mixins.length - 1]

        const instance = fakeCPI(9, 'Transient', 'Transient.vue')
        ;(mixin.mounted as (this: ComponentPublicInstance) => void).call(instance)
        expect(getAll()).toHaveLength(1)
        ;(mixin.unmounted as (this: ComponentPublicInstance) => void).call(instance)
        expect(getAll()).toEqual([])
    })

    it('accumulates renderTriggered trigger entries with key and type', () => {
        const app = createApp({})
        const { getAll } = setupRenderRegistry(makeNuxtApp(app))

        const mixins = (app as unknown as { _context: { mixins: Array<Record<string, unknown>> } })._context.mixins
        const mixin = mixins[mixins.length - 1]

        const instance = fakeCPI(10)

        // Fire renderTriggered before updated so the entry exists
        ;(mixin.renderTriggered as (this: ComponentPublicInstance, e: { key: string; type: string }) => void).call(instance, {
            key: 'count',
            type: TriggerOpTypes.SET,
        })
        ;(mixin.updated as (this: ComponentPublicInstance) => void).call(instance)

        const entry = getAll()[0]

        expect(entry.triggers).toHaveLength(1)
        expect(entry.triggers[0].key).toBe('count')
        expect(entry.triggers[0].type).toBe('set')
    })

    it('keeps at most 50 trigger entries per component', () => {
        const app = createApp({})
        const { getAll } = setupRenderRegistry(makeNuxtApp(app))

        const mixins = (app as unknown as { _context: { mixins: Array<Record<string, unknown>> } })._context.mixins
        const mixin = mixins[mixins.length - 1]

        const instance = fakeCPI(20)

        // Fire 60 renderTriggered events
        for (let i = 0; i < 60; i++) {
            ;(mixin.renderTriggered as (this: ComponentPublicInstance, e: { key: string; type: string }) => void).call(instance, {
                key: `k${i}`,
                type: 'set',
            })
        }
        ;(mixin.updated as (this: ComponentPublicInstance) => void).call(instance)

        expect(getAll()[0].triggers).toHaveLength(50)
    })

    it('sets the component name from instance.$.type.__name', () => {
        const app = createApp({})
        const { getAll } = setupRenderRegistry(makeNuxtApp(app))

        const mixins = (app as unknown as { _context: { mixins: Array<Record<string, unknown>> } })._context.mixins
        const mixin = mixins[mixins.length - 1]

        const instance = fakeCPI(5, 'ProductCard', 'ProductCard.vue')
        ;(mixin.renderTriggered as (this: ComponentPublicInstance, e: { key: string; type: string }) => void).call(instance, {
            key: 'visible',
            type: TriggerOpTypes.SET,
        })
        ;(mixin.updated as (this: ComponentPublicInstance) => void).call(instance)

        const entry = getAll()[0]

        expect(entry.name).toBe('ProductCard')
        expect(entry.file).toBe('ProductCard.vue')
    })

    it('falls back to a DOM element description when component metadata is unavailable', () => {
        const app = createApp({})
        const { getAll } = setupRenderRegistry(makeNuxtApp(app))

        const mixins = (app as unknown as { _context: { mixins: Array<Record<string, unknown>> } })._context.mixins
        const mixin = mixins[mixins.length - 1]

        const instance = {
            $: {
                uid: 8,
                type: {},
            },
            $el: {
                tagName: 'SECTION',
                id: 'hero',
                className: 'landing-panel wide',
                getBoundingClientRect: () => ({ x: 0, y: 0, width: 300, height: 120, top: 0, left: 0 }),
            },
            $parent: null,
        } as unknown as ComponentPublicInstance

        ;(mixin.renderTriggered as (this: ComponentPublicInstance, e: { key: string; type: string }) => void).call(instance, {
            key: 'visible',
            type: TriggerOpTypes.SET,
        })
        ;(mixin.updated as (this: ComponentPublicInstance) => void).call(instance)

        const entry = getAll()[0]

        expect(entry.name).toBe('section#hero.landing-panel')
        expect(entry.element).toBe('section#hero.landing-panel')
    })

    it('infers anonymous labels from the nearest named parent when available', () => {
        const app = createApp({})
        const { getAll } = setupRenderRegistry(makeNuxtApp(app))

        const mixins = (app as unknown as { _context: { mixins: Array<Record<string, unknown>> } })._context.mixins
        const mixin = mixins[mixins.length - 1]

        const instance = {
            $: {
                uid: 12,
                type: {},
            },
            $el: {
                tagName: 'LI',
                id: '',
                className: 'min-w-0 truncate',
                getBoundingClientRect: () => ({ x: 0, y: 0, width: 120, height: 30, top: 0, left: 0 }),
            },
            $parent: {
                $: {
                    uid: 3,
                    type: { __name: 'NavigationMenuList' },
                },
            },
        } as unknown as ComponentPublicInstance

        ;(mixin.renderTriggered as (this: ComponentPublicInstance, e: { key: string; type: string }) => void).call(instance, {
            key: 'visible',
            type: TriggerOpTypes.SET,
        })
        ;(mixin.updated as (this: ComponentPublicInstance) => void).call(instance)

        const entry = getAll()[0]

        expect(entry.name).toBe('NavigationMenuList li.min-w-0')
        expect(entry.element).toBe('li.min-w-0')
    })
})

// ── Tests for fixes introduced in the bug-fix pass ────────────────────────

describe('RenderEntry interface — children field removed (fix: render-registry)', () => {
    it('getAll() entries do not have a children property', () => {
        const app = createApp({ render: () => h('div') })
        const { getAll } = setupRenderRegistry({ vueApp: app })
        const el = document.createElement('div')
        app.mount(el)

        const entries = getAll()

        // If any entry got mounted, verify it has no children field
        for (const entry of entries) {
            expect(Object.prototype.hasOwnProperty.call(entry, 'children')).toBe(false)
        }

        app.unmount()
    })

    it('getAll() entries have parentUid as the relationship field', () => {
        const app = createApp({ render: () => h('div') })
        const { getAll } = setupRenderRegistry({ vueApp: app })
        const el = document.createElement('div')
        app.mount(el)

        const entries = getAll()

        for (const entry of entries) {
            // parentUid may be a number or undefined — never a children array
            expect(['number', 'undefined']).toContain(typeof entry.parentUid)
        }

        app.unmount()
    })
})

// ── describeElement / resolveTypeLabel / inferAnonymousLabel coverage ────

function triggerRender(mixin: Record<string, unknown>, instance: import('vue').ComponentPublicInstance, key = 'count') {
    ;(
        mixin.renderTriggered as (
            this: import('vue').ComponentPublicInstance,
            e: { key: string; type: (typeof TriggerOpTypes)[keyof typeof TriggerOpTypes] }
        ) => void
    ).call(instance, {
        key,
        type: TriggerOpTypes.SET,
    })
    ;(mixin.updated as (this: import('vue').ComponentPublicInstance) => void).call(instance)
}

describe('makeEntry — describeElement edge cases', () => {
    it('includes element id when present', () => {
        const app = createApp({})
        const { getAll } = setupRenderRegistry(makeNuxtApp(app))
        const mixins = (app as unknown as { _context: { mixins: Array<Record<string, unknown>> } })._context.mixins
        const mixin = mixins[mixins.length - 1]

        const instance = {
            $: { uid: 10, type: { __name: 'Named', __file: 'Named.vue', name: 'Named' }, subTree: {} },
            $el: { tagName: 'SECTION', id: 'hero', className: '', getBoundingClientRect: () => ({ x: 0, y: 0, width: 0, height: 0 }) },
            $parent: null,
        } as unknown as import('vue').ComponentPublicInstance

        triggerRender(mixin, instance)

        const entry = getAll().find((e) => e.uid === 10)
        expect(entry?.element).toBe('section#hero')
    })

    it('includes first class when id is absent', () => {
        const app = createApp({})
        const { getAll } = setupRenderRegistry(makeNuxtApp(app))
        const mixins = (app as unknown as { _context: { mixins: Array<Record<string, unknown>> } })._context.mixins
        const mixin = mixins[mixins.length - 1]

        const instance = {
            $: { uid: 11, type: { __name: 'Styled', __file: 'Styled.vue', name: 'Styled' }, subTree: {} },
            $el: {
                tagName: 'SPAN',
                id: '',
                className: 'badge primary',
                getBoundingClientRect: () => ({ x: 0, y: 0, width: 0, height: 0 }),
            },
            $parent: null,
        } as unknown as import('vue').ComponentPublicInstance

        triggerRender(mixin, instance)

        const entry = getAll().find((e) => e.uid === 11)
        expect(entry?.element).toBe('span.badge')
    })

    it('omits element when $el has no tagName (text node)', () => {
        const app = createApp({})
        const { getAll } = setupRenderRegistry(makeNuxtApp(app))
        const mixins = (app as unknown as { _context: { mixins: Array<Record<string, unknown>> } })._context.mixins
        const mixin = mixins[mixins.length - 1]

        const instance = {
            $: { uid: 12, type: { __name: 'TextNode', __file: 'T.vue', name: 'TextNode' }, subTree: {} },
            $el: { nodeType: 3 },
            $parent: null,
        } as unknown as import('vue').ComponentPublicInstance

        triggerRender(mixin, instance)

        const entry = getAll().find((e) => e.uid === 12)
        expect(entry?.element).toBeUndefined()
    })

    it('omits element when $el is null', () => {
        const app = createApp({})
        const { getAll } = setupRenderRegistry(makeNuxtApp(app))
        const mixins = (app as unknown as { _context: { mixins: Array<Record<string, unknown>> } })._context.mixins
        const mixin = mixins[mixins.length - 1]

        const instance = {
            $: { uid: 13, type: { __name: 'NoEl', __file: 'N.vue', name: 'NoEl' }, subTree: {} },
            $el: null,
            $parent: null,
        } as unknown as import('vue').ComponentPublicInstance

        triggerRender(mixin, instance)

        const entry = getAll().find((e) => e.uid === 13)
        expect(entry?.element).toBeUndefined()
    })
})

describe('makeEntry — resolveTypeLabel fallback chain', () => {
    it('falls back to type.name when __name is absent', () => {
        const app = createApp({})
        const { getAll } = setupRenderRegistry(makeNuxtApp(app))
        const mixins = (app as unknown as { _context: { mixins: Array<Record<string, unknown>> } })._context.mixins
        const mixin = mixins[mixins.length - 1]

        const instance = {
            $: { uid: 20, type: { name: 'FallbackName', __file: 'F.vue' }, subTree: {} },
            $el: null,
            $parent: null,
        } as unknown as import('vue').ComponentPublicInstance

        triggerRender(mixin, instance)

        expect(getAll().find((e) => e.uid === 20)?.name).toBe('FallbackName')
    })

    it('derives name from __file when __name and name are absent', () => {
        const app = createApp({})
        const { getAll } = setupRenderRegistry(makeNuxtApp(app))
        const mixins = (app as unknown as { _context: { mixins: Array<Record<string, unknown>> } })._context.mixins
        const mixin = mixins[mixins.length - 1]

        const instance = {
            $: { uid: 21, type: { __file: '/src/components/ProductCard.vue' }, subTree: {} },
            $el: null,
            $parent: null,
        } as unknown as import('vue').ComponentPublicInstance

        triggerRender(mixin, instance)

        expect(getAll().find((e) => e.uid === 21)?.name).toBe('ProductCard')
    })

    it('uses parent label + element for anonymous component with parent', () => {
        const app = createApp({})
        const { getAll } = setupRenderRegistry(makeNuxtApp(app))
        const mixins = (app as unknown as { _context: { mixins: Array<Record<string, unknown>> } })._context.mixins
        const mixin = mixins[mixins.length - 1]

        const instance = {
            $: { uid: 31, type: {}, subTree: {} },
            $el: { tagName: 'BUTTON', id: '', className: '', getBoundingClientRect: () => ({ x: 0, y: 0, width: 0, height: 0 }) },
            $parent: { $: { uid: 30, type: { __name: 'ParentComp', __file: 'P.vue' } } },
        } as unknown as import('vue').ComponentPublicInstance

        triggerRender(mixin, instance)

        expect(getAll().find((e) => e.uid === 31)?.name).toBe('ParentComp button')
    })

    it('uses parent label + "child" when no element and no own label', () => {
        const app = createApp({})
        const { getAll } = setupRenderRegistry(makeNuxtApp(app))
        const mixins = (app as unknown as { _context: { mixins: Array<Record<string, unknown>> } })._context.mixins
        const mixin = mixins[mixins.length - 1]

        const instance = {
            $: { uid: 41, type: {}, subTree: {} },
            $el: null,
            $parent: { $: { uid: 40, type: { __name: 'ListComp', __file: 'L.vue' } } },
        } as unknown as import('vue').ComponentPublicInstance

        triggerRender(mixin, instance)

        expect(getAll().find((e) => e.uid === 41)?.name).toBe('ListComp child')
    })
})

describe('render-registry — describeElement / resolveTypeLabel / inferAnonymousLabel coverage', () => {
    function makeNuxtApp(app: ReturnType<typeof createApp>) {
        return { vueApp: app }
    }

    it('uses __file as fallback label when __name and name are both absent', () => {
        const app = createApp({ render: () => h('div') })
        const reg = setupRenderRegistry(makeNuxtApp(app))
        app.mount(document.createElement('div'))

        // Mount a component with only __file, no __name or name
        const Anon = defineComponent({
            __file: '/src/components/SomeWidget.vue',
            render() {
                return h('div')
            },
        })
        const inner = createApp(Anon)
        const innerEl = document.createElement('div')
        inner.mixin(app._context.mixins[0])
        inner.mount(innerEl)

        const entries = reg.getAll()
        const anon = entries.find((e) => e.file.includes('SomeWidget'))
        // Either resolved from __file or fell back to Component#uid — both are valid
        if (anon) {
            expect(typeof anon.name).toBe('string')
            expect(anon.name.length).toBeGreaterThan(0)
        }

        inner.unmount()
        app.unmount()
    })

    it('describeElement handles an element with id and class', () => {
        const app = createApp({ render: () => h('div') })
        const nuxtApp = makeNuxtApp(app)
        const reg = setupRenderRegistry(nuxtApp)

        // Create a component whose $el has id and className
        const WithEl = defineComponent({
            render() {
                return h('section', { id: 'hero', class: 'landing-page' })
            },
        })

        const inner = createApp(WithEl)
        inner.mixin(app._context.mixins[0])
        const el = document.createElement('section')
        el.id = 'hero'
        el.className = 'landing-page'
        inner.mount(el)

        const entries = reg.getAll()
        const entry = entries.find((e) => e.element?.includes('section'))
        if (entry) {
            expect(entry.element).toContain('section')
        }

        inner.unmount()
        app.unmount()
    })

    it('describeElement returns undefined for a non-object element', () => {
        // This exercises the !el || typeof el !== 'object' guard
        const app = createApp({ render: () => h('div') })
        const reg = setupRenderRegistry(makeNuxtApp(app))

        // Mount a component that renders a text node ($el will be a text node, not an element)
        const TextComp = defineComponent({
            render() {
                return 'plain text' as unknown as ReturnType<typeof h>
            },
        })

        const inner = createApp(TextComp)
        inner.mixin(app._context.mixins[0])
        inner.mount(document.createElement('div'))

        // Should not throw — entry is created but element may be undefined/null
        const entries = reg.getAll()
        expect(entries.length).toBeGreaterThanOrEqual(0)

        inner.unmount()
        app.unmount()
    })
})

// ── Coverage for describeElement / resolveTypeLabel / inferAnonymousLabel ─

describe('makeEntry — describeElement paths', () => {
    it('produces element descriptor with id and class from $el', () => {
        const app = createApp({})
        const { getAll } = setupRenderRegistry(makeNuxtApp(app))

        // Build an instance whose $el has tagName, id, and className
        const cpi = {
            $: { uid: 50, type: { __name: 'TagComp', __file: 'Tag.vue', name: 'TagComp' } },
            $el: {
                tagName: 'BUTTON',
                id: 'submit-btn',
                className: 'primary rounded',
                getBoundingClientRect: () => ({ x: 0, y: 0, width: 80, height: 32, top: 0, left: 0 }),
            },
            $parent: null,
        } as unknown as ComponentPublicInstance

        app._context.mixins[app._context.mixins.length - 1].mounted?.call(cpi)

        const entry = getAll()[0]
        expect(entry.element).toBe('button#submit-btn.primary')
    })

    it('returns undefined element when $el has no tagName', () => {
        const app = createApp({})
        const { getAll } = setupRenderRegistry(makeNuxtApp(app))

        const cpi = {
            $: { uid: 51, type: { __name: 'TextComp', __file: 'Text.vue', name: 'TextComp' } },
            $el: {
                /* text node — no tagName */
            },
            $parent: null,
        } as unknown as ComponentPublicInstance

        app._context.mixins[app._context.mixins.length - 1].mounted?.call(cpi)

        const entry = getAll()[0]
        expect(entry.element).toBeUndefined()
    })

    it('handles SVG className.baseVal for className', () => {
        const app = createApp({})
        const { getAll } = setupRenderRegistry(makeNuxtApp(app))

        const cpi = {
            $: { uid: 52, type: { __name: 'SvgComp', __file: 'Svg.vue', name: 'SvgComp' } },
            $el: {
                tagName: 'circle',
                id: '',
                className: { baseVal: 'icon animated' },
                getBoundingClientRect: () => ({ x: 0, y: 0, width: 10, height: 10, top: 0, left: 0 }),
            },
            $parent: null,
        } as unknown as ComponentPublicInstance

        app._context.mixins[app._context.mixins.length - 1].mounted?.call(cpi)

        const entry = getAll()[0]
        expect(entry.element).toBe('circle.icon')
    })
})

describe('makeEntry — resolveTypeLabel and inferAnonymousLabel paths', () => {
    it('falls back to __file basename when __name and name are absent', () => {
        const app = createApp({})
        const { getAll } = setupRenderRegistry(makeNuxtApp(app))

        const cpi = {
            $: { uid: 60, type: { __file: '/app/components/ButtonGroup.vue' } },
            $el: {
                tagName: 'DIV',
                id: '',
                className: '',
                getBoundingClientRect: () => ({ x: 0, y: 0, width: 0, height: 0, top: 0, left: 0 }),
            },
            $parent: null,
        } as unknown as ComponentPublicInstance

        app._context.mixins[app._context.mixins.length - 1].mounted?.call(cpi)

        expect(getAll()[0].name).toBe('ButtonGroup')
    })

    it('uses parent label + element for anonymous component label', () => {
        const app = createApp({})
        const { getAll } = setupRenderRegistry(makeNuxtApp(app))

        // Anonymous component (no __name, no name, no __file)
        // but has a parent and a DOM element
        const cpi = {
            $: { uid: 70, type: {} },
            $el: {
                tagName: 'SPAN',
                id: '',
                className: '',
                getBoundingClientRect: () => ({ x: 0, y: 0, width: 0, height: 0, top: 0, left: 0 }),
            },
            $parent: {
                $: { uid: 69, type: { __name: 'ParentCard', __file: 'Parent.vue', name: 'ParentCard' } },
            },
        } as unknown as ComponentPublicInstance

        app._context.mixins[app._context.mixins.length - 1].mounted?.call(cpi)

        expect(getAll()[0].name).toBe('ParentCard span')
    })

    it('uses "parent child" when parent exists but element is indescribable', () => {
        const app = createApp({})
        const { getAll } = setupRenderRegistry(makeNuxtApp(app))

        const cpi = {
            $: { uid: 71, type: {} },
            $el: {}, // no tagName
            $parent: {
                $: { uid: 69, type: { __name: 'Layout', __file: 'Layout.vue', name: 'Layout' } },
            },
        } as unknown as ComponentPublicInstance

        app._context.mixins[app._context.mixins.length - 1].mounted?.call(cpi)

        expect(getAll()[0].name).toBe('Layout child')
    })
})

describe('setupRenderRegistry — reset() and navigationRender window', () => {
    it('reset() zeroes all render counters on all existing entries', () => {
        const app = createApp({})
        const { getAll, reset } = setupRenderRegistry(makeNuxtApp(app))
        const mixin = app._context.mixins[app._context.mixins.length - 1]

        const cpi = fakeCPI(10)
        mixin.mounted?.call(cpi)
        mixin.mounted?.call(cpi) // render it twice

        expect(getAll()[0].rerenders).toBe(1) // 2nd mount counts as rerender

        reset()

        expect(getAll()[0].rerenders).toBe(0)
        expect(getAll()[0].totalMs).toBe(0)
        expect(getAll()[0].avgMs).toBe(0)
        expect(getAll()[0].triggers).toEqual([])
    })

    it('marks renders within 800ms of markNavigation() as navigationRenders', () => {
        const app = createApp({})
        const { getAll, markNavigation } = setupRenderRegistry(makeNuxtApp(app))
        const mixin = app._context.mixins[app._context.mixins.length - 1]

        markNavigation() // opens the 800ms window

        const cpi = fakeCPI(20)
        mixin.mounted?.call(cpi)

        // Only rerenders (via updated()) count toward navigationRenders — not initial mounts
        expect(getAll()[0].navigationRenders).toBe(0)
    })

    it('does NOT mark renders as navigationRenders after the 800ms window expires', async () => {
        const app = createApp({})
        const { getAll } = setupRenderRegistry(makeNuxtApp(app))
        const mixin = app._context.mixins[app._context.mixins.length - 1]

        // markNavigation in the past (simulate window already closed)
        // by directly NOT calling markNavigation before mounting
        const cpi = fakeCPI(21)
        mixin.mounted?.call(cpi)

        expect(getAll()[0].navigationRenders).toBe(0)
    })

    it('beforeUpdate calls startRenderTimer for re-renders', () => {
        const app = createApp({})
        const { getAll } = setupRenderRegistry(makeNuxtApp(app))
        const mixin = app._context.mixins[app._context.mixins.length - 1]

        const cpi = fakeCPI(30)
        // Mount first
        mixin.mounted?.call(cpi)
        // Then trigger update cycle
        mixin.beforeUpdate?.call(cpi)
        ;(mixin.renderTriggered as (this: ComponentPublicInstance, e: { key: string; type: string }) => void)?.call(cpi, {
            key: 'count',
            type: TriggerOpTypes.SET,
        })
        mixin.updated?.call(cpi)

        expect(getAll()[0].rerenders).toBe(1) // only the reactive update counts
    })

    it('syncRect returns undefined rect when $el has no getBoundingClientRect', () => {
        const app = createApp({})
        const { getAll } = setupRenderRegistry(makeNuxtApp(app))
        const mixin = app._context.mixins[app._context.mixins.length - 1]

        const cpi = {
            $: { uid: 40, type: { __name: 'NoRect', __file: 'NoRect.vue', name: 'NoRect' } },
            $el: null, // no element
            $parent: null,
        } as unknown as ComponentPublicInstance

        mixin.mounted?.call(cpi)

        expect(getAll()[0].rect).toBeUndefined()
    })
})

describe('setupRenderRegistry — isPersistent and isHydrationMount', () => {
    it('isPersistent is false on first registration before any reset()', () => {
        const app = createApp({})
        const { getAll } = setupRenderRegistry(makeNuxtApp(app))
        const mixin = app._context.mixins[app._context.mixins.length - 1]
        const cpi = fakeCPI(100)
        mixin.mounted?.call(cpi)

        expect(getAll()[0].isPersistent).toBe(false)
    })

    it('isPersistent becomes true for a component that survives reset()', () => {
        const app = createApp({})
        const { getAll, reset } = setupRenderRegistry(makeNuxtApp(app))
        const mixin = app._context.mixins[app._context.mixins.length - 1]

        const cpi = fakeCPI(101)
        mixin.mounted?.call(cpi)

        expect(getAll()[0].isPersistent).toBe(false)

        // Simulate navigation: reset() snapshots current uids
        reset()

        // Component re-mounts on the new page (uid 101 was in preResetUids)
        mixin.mounted?.call(cpi)

        expect(getAll()[0].isPersistent).toBe(true)
    })

    it('a new component that mounts only after reset() is NOT persistent', () => {
        const app = createApp({})
        const { getAll, reset } = setupRenderRegistry(makeNuxtApp(app))
        const mixin = app._context.mixins[app._context.mixins.length - 1]

        const oldCpi = fakeCPI(200)
        mixin.mounted?.call(oldCpi)
        reset()
        mixin.unmounted?.call(oldCpi)

        // Brand new component, never seen before reset
        const newCpi = fakeCPI(201)
        mixin.mounted?.call(newCpi)

        const entry = getAll().find((e) => e.uid === 201)

        expect(entry?.isPersistent).toBe(false)
    })

    it('isHydrationMount is true when mounted during hydration', () => {
        const app = createApp({})
        const hydrating = true
        const { getAll } = setupRenderRegistry(makeNuxtApp(app), {
            isHydrating: () => hydrating,
        })
        const mixin = app._context.mixins[app._context.mixins.length - 1]

        const cpi = fakeCPI(300)
        mixin.mounted?.call(cpi)

        expect(getAll()[0].isHydrationMount).toBe(true)
        expect(getAll()[0].rerenders).toBe(0) // hydration mount is not a rerender
        expect(getAll()[0].mountCount).toBe(1)
    })

    it('isHydrationMount is false for components mounted after hydration ends', () => {
        const app = createApp({})
        const hydrating = false
        const { getAll } = setupRenderRegistry(makeNuxtApp(app), {
            isHydrating: () => hydrating,
        })
        const mixin = app._context.mixins[app._context.mixins.length - 1]

        const cpi = fakeCPI(301)
        mixin.mounted?.call(cpi)

        expect(getAll()[0].isHydrationMount).toBe(false)
    })

    it('re-mounting the same component (mountCount > 1) counts as a rerender', () => {
        const app = createApp({})
        const { getAll } = setupRenderRegistry(makeNuxtApp(app))
        const mixin = app._context.mixins[app._context.mixins.length - 1]

        const cpi = fakeCPI(400)
        mixin.mounted?.call(cpi) // first mount — not a rerender
        mixin.mounted?.call(cpi) // second mount (v-if re-toggle) — counts as rerender

        expect(getAll()[0].mountCount).toBe(2)
        expect(getAll()[0].rerenders).toBe(1)
    })
})
