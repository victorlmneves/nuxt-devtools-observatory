import type { Plugin } from 'vite'

/**
 * Vite plugin that intercepts `import { Transition } from 'vue'` in user code and
 * replaces it with an instrumented wrapper that records lifecycle events into
 * window.__observatory__.transition (set up by the Nuxt plugin at runtime).
 *
 * Why we can't use app.component('Transition', wrapper):
 *   The Vue 3 compiler generates a direct `import { Transition as _Transition } from "vue"`
 *   for `<Transition>` in templates — resolveComponent() is never called, so the app
 *   component registry is completely bypassed.
 *
 * Solution:
 *   Intercept the 'vue' module import in user code (non-node_modules) via Vite's
 *   resolveId/load hooks and serve a virtual proxy that:
 *     1. Re-exports everything from the real 'vue' (`export * from 'vue'`).
 *     2. Overrides the `Transition` export with _ObservedTransition.
 *
 *   The virtual proxy itself imports `from 'vue'`. When Vite resolves those imports,
 *   the importer is `\0obs:vue-proxy` (starts with '\0'), which our resolveId hook
 *   skips — so the real Vue is used without any circular redirect.
 *
 * Key invariants preserved:
 *   - onEnter / onLeave are NOT wrapped (Vue inspects .length to decide CSS vs JS mode).
 *   - On SSR: window is undefined → _obsRegistry() returns undefined → real Transition used.
 */

const VIRTUAL_ID = '\0obs:vue-proxy'

const PROXY_MODULE = `
import {
  defineComponent as _obsDefineComponent,
  h as _obsH,
  getCurrentInstance as _obsGetCurrentInstance,
  onUnmounted as _obsOnUnmounted,
  Transition as _ObsRealTransition
} from 'vue'

function _obsRegistry() {
  if (typeof window === 'undefined') return undefined
  return window.__observatory__ && window.__observatory__.transition
}

function _obsMergeHook(original, fn) {
  return function(el) { fn(el); if (original) original(el) }
}

// Monotonically increasing counter used to make transition IDs unique even
// when multiple transitions fire within the same performance.now() millisecond
// (e.g. rapid-toggle stress tests, or simultaneous enter + leave on a swap).
let _obsSeq = 0

const _ObservedTransition = _obsDefineComponent({
  name: 'Transition',
  inheritAttrs: false,
  setup(_, ctx) {
    const inst = _obsGetCurrentInstance()
    const par = inst && inst.parent
    const parentComponent = (par && par.type && (par.type.__name || par.type.name)) || 'unknown'
    let enterEntryId = null
    let leaveEntryId = null
    _obsOnUnmounted(function() {
      const r = _obsRegistry()
      if (!r) return
      if (enterEntryId) { r.update(enterEntryId, { phase: 'interrupted', endTime: performance.now() }); enterEntryId = null }
      if (leaveEntryId) { r.update(leaveEntryId, { phase: 'interrupted', endTime: performance.now() }); leaveEntryId = null }
    })
    return function() {
      const attrs = ctx.attrs
      const slots = ctx.slots
      const r = _obsRegistry()
      if (!r) return _obsH(_ObsRealTransition, attrs, slots)
      const transitionName = String(attrs.name != null ? attrs.name : 'default')
      const isAppear = Boolean(attrs.appear)
      const mode = typeof attrs.mode === 'string' ? attrs.mode : undefined
      const hookedAttrs = Object.assign({}, attrs, {
        onBeforeEnter: _obsMergeHook(attrs.onBeforeEnter, function() {
          const t = performance.now()
          const id = transitionName + '::enter::' + t + '::' + (++_obsSeq)
          enterEntryId = id
          r.register({ id, transitionName, parentComponent, direction: 'enter', phase: 'entering', startTime: t, cancelled: false, appear: isAppear, mode })
        }),
        onAfterEnter: _obsMergeHook(attrs.onAfterEnter, function() {
          if (enterEntryId) { r.update(enterEntryId, { phase: 'entered', endTime: performance.now() }); enterEntryId = null }
        }),
        onEnterCancelled: _obsMergeHook(attrs.onEnterCancelled, function() {
          if (enterEntryId) { r.update(enterEntryId, { phase: 'enter-cancelled', cancelled: true, endTime: performance.now() }); enterEntryId = null }
        }),
        onBeforeLeave: _obsMergeHook(attrs.onBeforeLeave, function() {
          const t = performance.now()
          const id = transitionName + '::leave::' + t + '::' + (++_obsSeq)
          leaveEntryId = id
          r.register({ id, transitionName, parentComponent, direction: 'leave', phase: 'leaving', startTime: t, cancelled: false, appear: false, mode })
        }),
        onAfterLeave: _obsMergeHook(attrs.onAfterLeave, function() {
          if (leaveEntryId) { r.update(leaveEntryId, { phase: 'left', endTime: performance.now() }); leaveEntryId = null }
        }),
        onLeaveCancelled: _obsMergeHook(attrs.onLeaveCancelled, function() {
          if (leaveEntryId) { r.update(leaveEntryId, { phase: 'leave-cancelled', cancelled: true, endTime: performance.now() }); leaveEntryId = null }
        }),
      })
      return _obsH(_ObsRealTransition, hookedAttrs, slots)
    }
  }
})

export * from 'vue'
export { _ObservedTransition as Transition }
`.trim()

export function transitionTrackerPlugin(): Plugin {
    return {
        name: 'observatory:transition-tracker',
        enforce: 'pre',

        async resolveId(id, importer) {
            if (id !== 'vue') {
                return
            }

            if (!importer) {
                return
            }

            // Skip the proxy module itself — prevents the proxy's own `from 'vue'` imports
            // from looping back here. In Vite 7+ we must explicitly resolve 'vue' to its
            // real path so the virtual module can import it correctly.
            if (importer.includes('obs:vue-proxy')) {
                return this.resolve('vue', importer, { skipSelf: true })
            }

            // Skip node_modules — Vue itself, Nuxt internals, etc.
            if (importer.includes('node_modules')) {
                return
            }

            // Skip this module's own runtime files to avoid double-wrapping the registry
            if (importer.includes('/src/runtime/') || importer.includes('/dist/runtime/')) {
                return
            }

            return VIRTUAL_ID
        },

        load(id) {
            // vite-node may request the module as 'obs:vue-proxy' (without \0 prefix)
            if (id !== VIRTUAL_ID && id !== 'obs:vue-proxy') {
                return null
            }

            return PROXY_MODULE
        },
    }
}
