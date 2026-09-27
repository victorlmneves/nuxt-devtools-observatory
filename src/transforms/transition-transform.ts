import type { Plugin } from 'vite'

/**
 * Vite plugin that intercepts `import { Transition, TransitionGroup } from 'vue'`
 * in user code and replaces them with instrumented wrappers that record lifecycle
 * events into window.__observatory__.transition (set up by the Nuxt plugin at runtime).
 *
 * Why we can't use app.component('Transition', wrapper):
 *   The Vue 3 compiler generates a direct `import { Transition as _Transition } from "vue"`
 *   (and the same for TransitionGroup) for templates — resolveComponent() is never called.
 *
 * Solution:
 *   Intercept the 'vue' module import in user code (non-node_modules) via Vite's
 *   resolveId/load hooks and serve a virtual proxy that:
 *     1. Re-exports everything from the real 'vue' (`export * from 'vue'`).
 *     2. Overrides the `Transition` and `TransitionGroup` exports with observed wrappers.
 *
 *   The virtual proxy itself imports `from 'vue'`. When Vite resolves those imports,
 *   the importer is `\0obs:vue-proxy` (starts with '\0'), which our resolveId hook
 *   skips — so the real Vue is used without any circular redirect.
 *
 * Key invariants preserved:
 *   - onEnter / onLeave are NOT wrapped (Vue inspects .length to decide CSS vs JS mode).
 *   - On SSR: window is undefined → _obsRegistry() returns undefined → real components used.
 *
 * Note on transport:
 *   Transition instrumentation happens at Vue-compiler import level, so this file
 *   cannot depend on Nuxt DevTools iframe helpers directly. Snapshot delivery to
 *   the panel is handled by the runtime plugin/server RPC bridge.
 */

const VIRTUAL_ID = '\0obs:vue-proxy'

const PROXY_MODULE = `
import {
  defineComponent as _obsDefineComponent,
  h as _obsH,
  getCurrentInstance as _obsGetCurrentInstance,
  onUnmounted as _obsOnUnmounted,
  Transition as _ObsRealTransition,
  TransitionGroup as _ObsRealTransitionGroup,
  KeepAlive as _ObsRealKeepAlive,
  Suspense as _ObsRealSuspense
} from 'vue'

function _obsRegistry() {
  if (typeof window === 'undefined') return undefined
  return window.__observatory__ && window.__observatory__.transition
}

function _obsKeepAliveRegistry() {
  if (typeof window === 'undefined') return undefined
  return window.__observatory__ && window.__observatory__.keepAlive
}

function _obsChildName(vnode) {
  if (!vnode) return 'unknown'
  const t = vnode.type
  if (typeof t === 'string') return t
  return (t && (t.__name || t.name)) || 'anonymous'
}

function _obsChildKey(vnode) {
  if (!vnode) return undefined
  return vnode.key != null ? String(vnode.key) : undefined
}

function _obsNum(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value !== '') {
    const n = Number(value)
    return Number.isFinite(n) ? n : undefined
  }
  return undefined
}

function _obsMergeHook(original, fn) {
  return function(el) { fn(el); if (original) original(el) }
}

let _obsSeq = 0

function _obsMakeObserved(Real, displayName) {
  return _obsDefineComponent({
    name: displayName,
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
        if (!r) return _obsH(Real, attrs, slots)
        const transitionName = String(attrs.name != null ? attrs.name : 'default')
        const isAppear = Boolean(attrs.appear)
        const mode = typeof attrs.mode === 'string' ? attrs.mode : undefined
        const hookedAttrs = Object.assign({}, attrs, {
          onBeforeEnter: _obsMergeHook(attrs.onBeforeEnter, function() {
            const t = performance.now()
            const id = displayName + '::' + transitionName + '::enter::' + t + '::' + (++_obsSeq)
            enterEntryId = id
            r.register({ id, transitionName, parentComponent, direction: 'enter', phase: 'entering', startTime: t, cancelled: false, appear: isAppear, mode, component: displayName })
          }),
          onAfterEnter: _obsMergeHook(attrs.onAfterEnter, function() {
            if (enterEntryId) { r.update(enterEntryId, { phase: 'entered', endTime: performance.now() }); enterEntryId = null }
          }),
          onEnterCancelled: _obsMergeHook(attrs.onEnterCancelled, function() {
            if (enterEntryId) { r.update(enterEntryId, { phase: 'enter-cancelled', cancelled: true, endTime: performance.now() }); enterEntryId = null }
          }),
          onBeforeLeave: _obsMergeHook(attrs.onBeforeLeave, function() {
            const t = performance.now()
            const id = displayName + '::' + transitionName + '::leave::' + t + '::' + (++_obsSeq)
            leaveEntryId = id
            r.register({ id, transitionName, parentComponent, direction: 'leave', phase: 'leaving', startTime: t, cancelled: false, appear: false, mode, component: displayName })
          }),
          onAfterLeave: _obsMergeHook(attrs.onAfterLeave, function() {
            if (leaveEntryId) { r.update(leaveEntryId, { phase: 'left', endTime: performance.now() }); leaveEntryId = null }
          }),
          onLeaveCancelled: _obsMergeHook(attrs.onLeaveCancelled, function() {
            if (leaveEntryId) { r.update(leaveEntryId, { phase: 'leave-cancelled', cancelled: true, endTime: performance.now() }); leaveEntryId = null }
          }),
        })
        return _obsH(Real, hookedAttrs, slots)
      }
    }
  })
}

const _ObservedTransition = _obsMakeObserved(_ObsRealTransition, 'Transition')
const _ObservedTransitionGroup = _obsMakeObserved(_ObsRealTransitionGroup, 'TransitionGroup')

const _ObservedKeepAlive = _obsDefineComponent({
  name: 'KeepAlive',
  inheritAttrs: false,
  setup(_, ctx) {
    const inst = _obsGetCurrentInstance()
    const par = inst && inst.parent
    const parentComponent = (par && par.type && (par.type.__name || par.type.name)) || 'unknown'
    let patched = false
    function kaMeta() {
      const max = _obsNum(ctx.attrs.max)
      return {
        parentComponent,
        cacheMax: max,
        include: ctx.attrs.include != null ? String(ctx.attrs.include) : undefined,
        exclude: ctx.attrs.exclude != null ? String(ctx.attrs.exclude) : undefined,
      }
    }
    function patchKeepAlive(kaInst) {
      if (!kaInst || patched) return
      const r = _obsKeepAliveRegistry()
      if (!r) return
      const host = kaInst.ctx || kaInst
      const origAct = host.activate
      const origDeact = host.deactivate
      if (typeof origAct !== 'function' || typeof origDeact !== 'function') return
      patched = true
      host.activate = function(vnode) {
        r.record(Object.assign({
          kind: 'keep-alive',
          phase: 'activated',
          name: _obsChildName(vnode),
          key: _obsChildKey(vnode),
          startTime: performance.now(),
          fromCache: true,
        }, kaMeta()))
        return origAct.apply(this, arguments)
      }
      host.deactivate = function(vnode) {
        r.record(Object.assign({
          kind: 'keep-alive',
          phase: 'deactivated',
          name: _obsChildName(vnode),
          key: _obsChildKey(vnode),
          startTime: performance.now(),
          fromCache: false,
        }, kaMeta()))
        return origDeact.apply(this, arguments)
      }
    }
    function hookSlots(slots) {
      if (!slots || typeof slots.default !== 'function') return slots
      return Object.assign({}, slots, {
        default: function() {
          const raw = slots.default.apply(this, arguments)
          const children = Array.isArray(raw) ? raw : raw ? [raw] : []
          return children.map(function(child) {
            if (!child || typeof child !== 'object') return child
            const props = child.props || (child.props = {})
            props.onVnodeMounted = _obsMergeHook(props.onVnodeMounted, function() {
              const registry = _obsKeepAliveRegistry()
              if (!registry) return
              registry.record(Object.assign({
                kind: 'keep-alive',
                phase: 'activated',
                name: _obsChildName(child),
                key: _obsChildKey(child),
                startTime: performance.now(),
                fromCache: false,
              }, kaMeta()))
            })
            return child
          })
        },
      })
    }
    return function() {
      const r = _obsKeepAliveRegistry()
      if (!r) return _obsH(_ObsRealKeepAlive, ctx.attrs, ctx.slots)
      const attrs = Object.assign({}, ctx.attrs, {
        onVnodeMounted: _obsMergeHook(ctx.attrs.onVnodeMounted, function(vnode) {
          patchKeepAlive(vnode && vnode.component)
        }),
      })
      return _obsH(_ObsRealKeepAlive, attrs, hookSlots(ctx.slots))
    }
  }
})

function _obsHookSuspenseVnode(vnode, parentInstance, previous) {
  const r = _obsKeepAliveRegistry()
  if (!r || !vnode) return
  const props = vnode.props || (vnode.props = {})
  let owner = parentInstance
  const ownerName = owner && owner.type && (owner.type.__name || owner.type.name)
  if (ownerName === 'ClientOnly' && owner.parent) {
    owner = owner.parent
  }
  const parentType = owner && owner.type
  const parentComponent = (parentType && (parentType.__name || parentType.name)) || ownerName || 'unknown'
  const state = (previous && previous.props && previous.props.__observatorySuspenseState) || props.__observatorySuspenseState || {
    entryId: null,
    pendingAt: null,
    fallbackAt: null,
  }
  props.__observatorySuspenseState = state
  const timeoutMs = _obsNum(props.timeout)
  props.onPending = _obsMergeHook(props.onPending, function() {
    state.pendingAt = performance.now()
    state.fallbackAt = null
    state.entryId = 'Suspense::' + parentComponent + '::' + state.pendingAt + '::' + (++_obsSeq)
    r.record({
      id: state.entryId,
      kind: 'suspense',
      phase: 'pending',
      name: parentComponent,
      parentComponent,
      startTime: state.pendingAt,
      timeoutMs,
    })
  })
  props.onFallback = _obsMergeHook(props.onFallback, function() {
    state.fallbackAt = performance.now()
    if (!state.entryId) return
    r.record({
      id: state.entryId,
      kind: 'suspense',
      phase: 'fallback',
      name: parentComponent,
      parentComponent,
      startTime: state.pendingAt || state.fallbackAt,
      fallbackMs: state.fallbackAt - (state.pendingAt || state.fallbackAt),
      timeoutMs,
    })
  })
  props.onResolve = _obsMergeHook(props.onResolve, function() {
    const t = performance.now()
    if (!state.entryId) return
    r.record({
      id: state.entryId,
      kind: 'suspense',
      phase: 'resolved',
      name: parentComponent,
      parentComponent,
      startTime: state.pendingAt || t,
      endTime: t,
      fallbackMs: state.fallbackAt != null ? state.fallbackAt - (state.pendingAt || state.fallbackAt) : undefined,
      timeoutMs,
    })
    state.entryId = null
  })
}

const _ObservedSuspense = {
  name: 'Suspense',
  __isSuspense: true,
  process(n1, n2, container, anchor, parentComponent, parentSuspense, namespace, slotScopeIds, optimized, rendererInternals) {
    _obsHookSuspenseVnode(n2, parentComponent, n1)
    return _ObsRealSuspense.process(
      n1,
      n2,
      container,
      anchor,
      parentComponent,
      parentSuspense,
      namespace,
      slotScopeIds,
      optimized,
      rendererInternals
    )
  },
  hydrate: _ObsRealSuspense.hydrate,
  normalize: _ObsRealSuspense.normalize,
}

export * from 'vue'
export {
  _ObservedTransition as Transition,
  _ObservedTransitionGroup as TransitionGroup,
  _ObservedKeepAlive as KeepAlive,
  _ObservedSuspense as Suspense,
}
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
