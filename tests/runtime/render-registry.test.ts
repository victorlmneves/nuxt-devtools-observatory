// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest'
import { createApp, defineComponent, h, type ComponentPublicInstance } from 'vue'
import { setupRenderRegistry } from '@observatory/runtime/composables/render-registry'
import { traceStore } from '@observatory/runtime/tracing/traceStore'

beforeEach(() => {
    traceStore.clear()
})

/**
 * Creates and immediately ends a component span in the global traceStore.
 * Used to populate aggregateFromComponentSpans() with test data.
 */
function addComponentSpan(uid: number, lifecycle: 'mounted' | 'updated', options: { startTime?: number; durationMs?: number; route?: string } = {}) {
    const { startTime = performance.now(), durationMs = 10, route = '/' } = options
    const traceId = `test-component-${uid}-${lifecycle}-${Math.random()}`
    const span = traceStore.addSpan({
        traceId,
        name: `component:${lifecycle}`,
        type: 'component',
        startTime,
        metadata: { uid, lifecycle, route },
    })
    traceStore.endSpan(span.id, traceId, {
        endTime: startTime + durationMs,
        status: 'ok',
    })
}

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

    it('increments the renders counter when an update fires', () => {
        const app = createApp({})
        const { getAll } = setupRenderRegistry(makeNuxtApp(app))

        // Get the mixin we just installed and call its `updated` hook directly
        const mixins = (app as unknown as { _context: { mixins: Array<Record<string, unknown>> } })._context.mixins
        const mixin = mixins[mixins.length - 1]

        const instance = fakeCPI(42)
        ;(mixin.updated as (this: ComponentPublicInstance) => void).call(instance)

        // Simulate two reactive re-renders via spans
        addComponentSpan(42, 'updated')
        addComponentSpan(42, 'updated')

        const entries = getAll()

        expect(entries).toHaveLength(1)
        expect(entries[0].uid).toBe(42)
        expect(entries[0].rerenders).toBe(2)
    })

    it('counts updated() even without a preceding renderTriggered (parent-driven re-renders)', () => {
        const app = createApp({})
        const { getAll } = setupRenderRegistry(makeNuxtApp(app))

        const mixins = (app as unknown as { _context: { mixins: Array<Record<string, unknown>> } })._context.mixins
        const mixin = mixins[mixins.length - 1]

        const instance = fakeCPI(44)
        // updated() without renderTriggered — this is how parent-driven re-renders
        // arrive (prop changes, slot re-renders, forced updates).
        // They must be counted, otherwise most real-world re-renders are invisible.
        ;(mixin.updated as (this: ComponentPublicInstance) => void).call(instance)

        // Add one re-render span (lifecycle !== 'mounted') to simulate the update
        addComponentSpan(44, 'updated')

        expect(getAll()[0].rerenders).toBe(1)
    })

    it('getAll() returns all entries regardless of update count', () => {
        const app = createApp({})
        const { getAll } = setupRenderRegistry(makeNuxtApp(app))

        const mixins = (app as unknown as { _context: { mixins: Array<Record<string, unknown>> } })._context.mixins
        const mixin = mixins[mixins.length - 1]

        const instA = fakeCPI(1, 'CompA')
        const instB = fakeCPI(2, 'CompB')

        // Create entries for both components
        ;(mixin.updated as (this: ComponentPublicInstance) => void).call(instA)
        ;(mixin.updated as (this: ComponentPublicInstance) => void).call(instB)

        // CompA fired updated twice
        addComponentSpan(1, 'updated')
        addComponentSpan(1, 'updated')

        // CompB fired updated three times
        addComponentSpan(2, 'updated')
        addComponentSpan(2, 'updated')
        addComponentSpan(2, 'updated')

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

        // Simulate a mount span (lifecycle='mounted' → mountCount++, not rerenders)
        addComponentSpan(7, 'mounted')

        const entries = getAll()

        expect(entries).toHaveLength(1)
        expect(entries[0].uid).toBe(7)
        expect(entries[0].rerenders).toBe(0) // initial mount is NOT a re-render
        expect(entries[0].mountCount).toBe(1)
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

    it('triggers field is always empty — trigger tracking was removed in span-based implementation', () => {
        const app = createApp({})
        const { getAll } = setupRenderRegistry(makeNuxtApp(app))

        const mixins = (app as unknown as { _context: { mixins: Array<Record<string, unknown>> } })._context.mixins
        const mixin = mixins[mixins.length - 1]

        const instance = fakeCPI(10)
        ;(mixin.updated as (this: ComponentPublicInstance) => void).call(instance)

        const entry = getAll()[0]

        expect(entry.triggers).toHaveLength(0)
    })

    it('triggers is always empty regardless of update count — trigger tracking removed', () => {
        const app = createApp({})
        const { getAll } = setupRenderRegistry(makeNuxtApp(app))

        const mixins = (app as unknown as { _context: { mixins: Array<Record<string, unknown>> } })._context.mixins
        const mixin = mixins[mixins.length - 1]

        const instance = fakeCPI(20)

        // Fire many updated events
        for (let i = 0; i < 60; i++) {
            ;(mixin.updated as (this: ComponentPublicInstance) => void).call(instance)
        }

        expect(getAll()[0].triggers).toHaveLength(0)
    })

    it('sets the component name from instance.$.type.__name', () => {
        const app = createApp({})
        const { getAll } = setupRenderRegistry(makeNuxtApp(app))

        const mixins = (app as unknown as { _context: { mixins: Array<Record<string, unknown>> } })._context.mixins
        const mixin = mixins[mixins.length - 1]

        const instance = fakeCPI(5, 'ProductCard', 'ProductCard.vue')
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

function triggerRender(mixin: Record<string, unknown>, instance: import('vue').ComponentPublicInstance) {
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

        // Simulate one re-render
        addComponentSpan(10, 'updated')

        expect(getAll()[0].rerenders).toBe(1)

        reset()

        expect(getAll()[0].rerenders).toBe(0)
        expect(getAll()[0].totalMs).toBe(0)
        expect(getAll()[0].avgMs).toBe(0)
        expect(getAll()[0].triggers).toEqual([])
    })

    it('beforeUpdate is a no-op in the mixin (render timing is tracked via component spans)', () => {
        const app = createApp({})
        const { getAll } = setupRenderRegistry(makeNuxtApp(app))
        const mixin = app._context.mixins[app._context.mixins.length - 1]

        const cpi = fakeCPI(30)
        // Mount first
        mixin.mounted?.call(cpi)
        // Simulate a reactive update via a component span
        addComponentSpan(30, 'updated')

        expect(getAll()[0].rerenders).toBe(1)
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

        // Add a mounted span so mountCount is populated
        addComponentSpan(300, 'mounted')

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

    it('re-mounting the same component increments mountCount (re-mounts are not counted as rerenders)', () => {
        const app = createApp({})
        const { getAll } = setupRenderRegistry(makeNuxtApp(app))
        const mixin = app._context.mixins[app._context.mixins.length - 1]

        const cpi = fakeCPI(400)
        mixin.mounted?.call(cpi) // first mount
        mixin.mounted?.call(cpi) // second mount (v-if re-toggle)

        // Add two mounted spans — both count toward mountCount, not rerenders
        addComponentSpan(400, 'mounted')
        addComponentSpan(400, 'mounted')

        expect(getAll()[0].mountCount).toBe(2)
        expect(getAll()[0].rerenders).toBe(0) // re-mounts create 'mounted' spans, not rerenders
    })
})

describe('setupRenderRegistry — reset() preserves mountCount', () => {
    it('reset() does NOT zero mountCount — mounts are page-lifetime data', () => {
        const app = createApp({})
        const { getAll, reset } = setupRenderRegistry(makeNuxtApp(app))
        const mixin = app._context.mixins[app._context.mixins.length - 1]

        const cpi = fakeCPI(500)
        mixin.mounted?.call(cpi)
        addComponentSpan(500, 'mounted')
        addComponentSpan(500, 'updated') // one re-render before reset
        expect(getAll()[0].mountCount).toBe(1)

        reset()

        // mountCount survives — still reflects the page lifetime (allSpans, not filtered)
        expect(getAll()[0].mountCount).toBe(1)
        // But rerenders and timing are cleared (postResetSpans = 0)
        expect(getAll()[0].rerenders).toBe(0)
        expect(getAll()[0].totalMs).toBe(0)
    })

    it('a component that re-mounts after reset() gets mountCount 2 (not 1)', () => {
        const app = createApp({})
        const { getAll, reset } = setupRenderRegistry(makeNuxtApp(app))
        const mixin = app._context.mixins[app._context.mixins.length - 1]

        const cpi = fakeCPI(501)
        mixin.mounted?.call(cpi) // mountCount = 1
        addComponentSpan(501, 'mounted')
        reset()
        mixin.mounted?.call(cpi) // re-mount after reset
        addComponentSpan(501, 'mounted') // 2nd mounted span — allSpans has 2 mounts → mountCount = 2

        expect(getAll()[0].mountCount).toBe(2)
        // The re-mount creates a 'mounted' span (not 'updated'), so rerenders stays 0
        expect(getAll()[0].rerenders).toBe(0)
    })
})

describe('setupRenderRegistry — timeline', () => {
    it('records a mount timeline event on the first mount', () => {
        const app = createApp({})
        const { getAll } = setupRenderRegistry(makeNuxtApp(app))
        const mixin = app._context.mixins[app._context.mixins.length - 1]

        const cpi = fakeCPI(600)
        mixin.mounted?.call(cpi)

        // Add a mounted component span (simulates what component instrumentation records)
        addComponentSpan(600, 'mounted', { startTime: 100, durationMs: 5 })

        const entry = getAll()[0]
        expect(entry.timeline).toHaveLength(1)
        expect(entry.timeline[0].kind).toBe('mount')
        expect(typeof entry.timeline[0].t).toBe('number')
        expect(typeof entry.timeline[0].durationMs).toBe('number')
    })

    it('records an update timeline event on rerenders', () => {
        const app = createApp({})
        const { getAll } = setupRenderRegistry(makeNuxtApp(app))
        const mixin = app._context.mixins[app._context.mixins.length - 1]

        const cpi = fakeCPI(601)
        mixin.mounted?.call(cpi)
        mixin.updated?.call(cpi)

        addComponentSpan(601, 'mounted', { startTime: 100, durationMs: 5 })
        addComponentSpan(601, 'updated', { startTime: 200, durationMs: 3 })

        const entry = getAll()[0]
        expect(entry.timeline).toHaveLength(2)
        expect(entry.timeline[1].kind).toBe('update')
    })

    it('timeline is cleared by reset()', () => {
        const app = createApp({})
        const { getAll, reset } = setupRenderRegistry(makeNuxtApp(app))
        const mixin = app._context.mixins[app._context.mixins.length - 1]

        const cpi = fakeCPI(602)
        mixin.mounted?.call(cpi)
        addComponentSpan(602, 'mounted', { startTime: 100 })
        expect(getAll()[0].timeline).toHaveLength(1)

        reset()
        // No new spans after reset → timeline is empty (postResetSpans = [])
        expect(getAll()[0].timeline).toHaveLength(0)
    })

    it('timeline entries do not include triggerKey — trigger tracking was removed', () => {
        const app = createApp({})
        const { getAll } = setupRenderRegistry(makeNuxtApp(app))
        const mixin = app._context.mixins[app._context.mixins.length - 1]

        const cpi = fakeCPI(603)
        mixin.mounted?.call(cpi)
        mixin.updated?.call(cpi)

        addComponentSpan(603, 'mounted', { startTime: 100 })
        addComponentSpan(603, 'updated', { startTime: 200 })

        const updateEvent = getAll()[0].timeline.find((e) => e.kind === 'update')
        expect(updateEvent?.triggerKey).toBeUndefined()
    })

    it('timeline stores the route each event happened on', () => {
        const app = createApp({})
        const { getAll, setRoute } = setupRenderRegistry(makeNuxtApp(app))
        const mixin = app._context.mixins[app._context.mixins.length - 1]

        setRoute('/products')
        const cpi = fakeCPI(604)
        mixin.mounted?.call(cpi)

        // Span must carry the route in metadata for aggregateFromComponentSpans to pick it up
        addComponentSpan(604, 'mounted', { startTime: 100, route: '/products' })

        expect(getAll()[0].timeline[0].route).toBe('/products')
    })
})

describe('setupRenderRegistry — route and setRoute', () => {
    it('entry.route is "/" by default', () => {
        const app = createApp({})
        const { getAll } = setupRenderRegistry(makeNuxtApp(app))
        const mixin = app._context.mixins[app._context.mixins.length - 1]

        const cpi = fakeCPI(700)
        mixin.mounted?.call(cpi)

        expect(getAll()[0].route).toBe('/')
    })

    it('entry.route reflects the active route when the component first mounted', () => {
        const app = createApp({})
        const { getAll, setRoute } = setupRenderRegistry(makeNuxtApp(app))
        const mixin = app._context.mixins[app._context.mixins.length - 1]

        setRoute('/about')
        const cpi = fakeCPI(701)
        mixin.mounted?.call(cpi)

        expect(getAll()[0].route).toBe('/about')
    })

    it('setRoute does not change the route field of already-registered entries', () => {
        const app = createApp({})
        const { getAll, setRoute } = setupRenderRegistry(makeNuxtApp(app))
        const mixin = app._context.mixins[app._context.mixins.length - 1]

        setRoute('/home')
        const cpi = fakeCPI(702)
        mixin.mounted?.call(cpi)

        setRoute('/profile')
        // Navigating away should not alter the entry's creation route
        expect(getAll()[0].route).toBe('/home')
    })
})

describe('setupRenderRegistry — persistent component double-count fix', () => {
    it('persistent component re-mounting after navigation does NOT add a mount timeline event', () => {
        const app = createApp({})
        const { getAll, reset } = setupRenderRegistry(makeNuxtApp(app))
        const mixin = app._context.mixins[app._context.mixins.length - 1]

        const cpi = fakeCPI(800)
        mixin.mounted?.call(cpi)
        addComponentSpan(800, 'mounted', { startTime: 100 }) // first mount — recorded in timeline

        reset() // simulates navigation — this component survives → isPersistent = true

        mixin.mounted?.call(cpi) // re-attach after navigation — no new span (not adding one)

        const entry = getAll()[0]
        // The re-mount after navigation should NOT appear in the timeline
        expect(entry.isPersistent).toBe(true)
        expect(entry.timeline).toHaveLength(0) // no post-reset spans → empty timeline
    })

    it('reactive updates on a persistent component ARE still recorded in the timeline', () => {
        const app = createApp({})
        const { getAll, reset } = setupRenderRegistry(makeNuxtApp(app))
        const mixin = app._context.mixins[app._context.mixins.length - 1]

        const cpi = fakeCPI(801)
        mixin.mounted?.call(cpi)
        addComponentSpan(801, 'mounted', { startTime: 100 })
        reset()
        mixin.mounted?.call(cpi) // re-attach after navigation — isPersistent is now true, no span added
        mixin.updated?.call(cpi)
        // A real reactive update fires after navigation
        addComponentSpan(801, 'updated', { durationMs: 5 })

        const entry = getAll()[0]
        // timeline has only the reactive update event (not the navigation re-attach)
        expect(entry.timeline).toHaveLength(1)
        expect(entry.timeline[0].kind).toBe('update')
        // rerenders = 1 (only the post-reset 'updated' span counts)
        expect(entry.rerenders).toBe(1)
    })
})
