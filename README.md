# nuxt-devtools-observatory

Nuxt DevTools extension providing five missing observability features:

- **useFetch Dashboard** — central view of all async data calls, cache keys, waterfall timeline
- **provide/inject Graph** — interactive tree showing the full injection topology with missing-provider detection
- **Composable Tracker** — live view of active composables, reactive state, change history, leak detection, and inline value editing
- **Render Heatmap** — component tree colour-coded by render frequency and duration
- **Transition Tracker** — live timeline of every `<Transition>` lifecycle event with phase, duration, and cancellation state

## Installation

```bash
pnpm add nuxt-devtools-observatory
```

```ts
// nuxt.config.ts
export default defineNuxtConfig({
    modules: ['nuxt-devtools-observatory'],

    observatory: {
        fetchDashboard: true,
        provideInjectGraph: true,
        composableTracker: true,
        renderHeatmap: true,
        transitionTracker: true,
        heatmapThreshold: 5, // highlight components with 5+ renders
    },

    devtools: { enabled: true },
})
```

Open the Nuxt DevTools panel — five new tabs will appear.

The DevTools client SPA runs on a dedicated Vite development server (port **4949**).

## How it works

All instrumentation is **dev-only**. The module registers Vite transforms that wrap
`useFetch`, `provide/inject`, `useX()` composable calls, and `<Transition>` at the
AST/module level before compilation. In production (`import.meta.dev === false`) the
transforms are skipped entirely — zero runtime overhead.

### useFetch Dashboard

[![useFetch Dashboard](./docs/screenshots/fetch-dashboard.png)](./docs/screenshots/fetch-dashboard.png)

A Vite plugin wraps `useFetch` / `useAsyncData` calls with a thin shim that records:

- Key, URL, status, origin (SSR/CSR)
- Payload size and duration
- Start offset for waterfall rendering

A Nitro plugin captures server-side fetch timing independently and tunnels it to the
client over the HMR WebSocket.

### provide/inject Graph

[![provide/inject Graph](https://github.com/victorlmneves/nuxt-devtools-observatory/blob/main/docs/screenshots/provide-inject-graph.png)](https://github.com/victorlmneves/nuxt-devtools-observatory/blob/main/docs/screenshots/provide-inject-graph.png)

A Vite plugin wraps `provide()` and `inject()` calls with annotated versions that
carry file and line metadata. At runtime, a `findProvider()` function walks
`instance.parent` chains to identify which ancestor provided each key.
Any `inject()` that resolves to `undefined` is flagged immediately as a red node.

**Known gaps:**

- No grouping or count badge when multiple components share the same key
- No inline value preview before expanding
- No scope label (global / layout / component-scoped) on provider nodes
- No warning when a child component overrides a key already provided by an ancestor
- No search or filter by key or component name
- No jump-to-component shortcut from a graph node

### Composable Tracker

[![Composable Tracker](https://github.com/victorlmneves/nuxt-devtools-observatory/blob/main/docs/screenshots/composable-tracker.png)](https://github.com/victorlmneves/nuxt-devtools-observatory/blob/main/docs/screenshots/composable-tracker.png)

A Vite plugin detects all `useXxx()` calls matching Vue's naming convention and
wraps them with a tracking shim (`__trackComposable`) that:

1. Temporarily replaces `window.setInterval`/`clearInterval` during setup to capture
   any intervals started inside the composable
2. Tracks new Vue effects (watchers) added to the component scope during setup
3. Snapshots returned `ref`, `computed`, and `reactive` values for the live state panel,
   keeping live references so values update in real time without polling
4. Detects shared (global) state by comparing object identity across multiple instances
   of the same composable — keys backed by the same reference are marked as global
5. Records a change history (capped at 50 events) via `watchEffect`, capturing which
   key changed, its new value, and a `performance.now()` timestamp
6. Flags any watcher or interval still active after `onUnmounted` fires as a **leak**

The panel provides:

- **Filtering** by status (all / mounted / unmounted / leaks only) and free-text search
  across composable name, source file, ref key names, and ref values
- **Inline ref chip preview** — up to three reactive values shown on the card without
  expanding, with distinct styling for `ref`, `computed`, and `reactive` types
- **Global state badges** — keys shared across instances are highlighted in amber with
  a `global` badge and an explanatory banner when expanded
- **Change history** — a scrollable log of the last 50 value mutations, showing the key,
  new value, and relative timestamp
- **Lifecycle summary** — shows whether `onMounted`/`onUnmounted` were registered and
  whether watchers and intervals were properly cleaned up
- **Context section** — source file, component UID, route, watcher count, and interval count
- **Reverse lookup** — clicking any ref key opens a panel listing every other composable
  instance that exposes a key with the same name, with its composable name, file, and route
- **Inline value editing** — writable `ref` values have an `edit` button; clicking opens
  a JSON textarea that applies the new value directly to the live ref in the running app,
  with the change reflected immediately in the history log

**Known gaps:**

- Search covers ref key names and serialised values but does not search inside nested
  object properties of `reactive` values
- The reverse lookup matches by key name only, not by object identity — two unrelated
  composables that both return a key named `count` will appear as consumers of each other

### Render Heatmap

[![Render Heatmap](https://github.com/victorlmneves/nuxt-devtools-observatory/blob/main/docs/screenshots/render-heatmap.png)](https://github.com/victorlmneves/nuxt-devtools-observatory/blob/main/docs/screenshots/render-heatmap.png)

Uses Vue's built-in `renderTriggered` mixin hook and `app.config.performance = true`.
A `PerformanceObserver` reads Vue's native `vue-component-render-start/end` marks for
accurate duration measurement. Component bounding boxes are captured via
`$el.getBoundingClientRect()` for the DOM overlay mode.

**Known gaps — accuracy (priority):**

- No unique instance ID per component; navigating back and forth between pages inflates
  counts for components that did not actually re-render
- No mechanism to mark persistent or layout components as excluded from
  navigation-triggered count increments
- Client-side hydration renders of unchanged SSR components are currently counted

**Known gaps — usability:**

- No render timeline or history — only the cumulative count is shown
- No filter by page or component name
- No jump-to-component shortcut from a heatmap entry
- The `renderTriggered` event key (which prop/state triggered the render) is captured
  but not yet surfaced in the UI

### Transition Tracker

[![Transition Tracker](https://github.com/victorlmneves/nuxt-devtools-observatory/blob/main/docs/screenshots/transition-tracker.png)](https://github.com/victorlmneves/nuxt-devtools-observatory/blob/main/docs/screenshots/transition-tracker.png)

A Vite plugin intercepts `import ... from 'vue'` in user code and serves a virtual
proxy module that overrides the `Transition` export with an instrumented wrapper.
This is necessary because the Vue 3 template compiler generates direct named imports
(`import { Transition as _Transition } from "vue"`) that bypass `app.component()`
entirely.

The wrapper records every lifecycle phase without interfering with Vue's internal
CSS/JS timing detection:

| Hook               | Phase recorded    |
| ------------------ | ----------------- |
| `onBeforeEnter`    | `entering`        |
| `onAfterEnter`     | `entered`         |
| `onEnterCancelled` | `enter-cancelled` |
| `onBeforeLeave`    | `leaving`         |
| `onAfterLeave`     | `left`            |
| `onLeaveCancelled` | `leave-cancelled` |

> `onEnter` / `onLeave` are intentionally **not** wrapped — Vue inspects their
> `.length` property to choose CSS-mode vs JS-mode timing, and wrapping changes
> that length.

The Transitions tab shows a live timeline with name, direction, phase, duration,
parent component, and cancellation state for every transition fired on the page.
Data is bridged from the Nuxt app (port 3000) to the Observatory SPA (port 4949)
via `postMessage` since the two origins are cross-origin inside the DevTools iframe.

## Opting out

Add a `/* @devtools-ignore */` comment before any call to exclude it from instrumentation:

```ts
/* @devtools-ignore */
const { data } = useFetch('/api/sensitive')

/* @devtools-ignore */
const result = useMyComposable()
```

## Roadmap

### provide/inject Graph

- [ ] Clickable key → expand/collapse deep object values
- [ ] Group components sharing the same key with an occurrence count badge
- [ ] Inline value preview (e.g. `{ user: {…}, isLoggedIn: true }`) before expanding
- [ ] Scope label on provider nodes: global / layout / component-scoped
- [ ] Warning when a child overrides a key already provided by an ancestor
- [ ] Filter panel by key or component name
- [ ] Jump-to-component shortcut from graph nodes

### Composable Tracker

- [ ] Reverse lookup by object identity rather than key name only
- [ ] Deep search inside nested `reactive` object properties

### Render Heatmap

- [ ] Per-instance unique ID to avoid double-counting on navigation
- [ ] Persistent/layout component exclusion flag
- [ ] Skip counting client-side hydration renders of unchanged SSR components
- [ ] Render timeline / history view
- [ ] Filter by page or component name
- [ ] Jump-to-component shortcut from heatmap entries
- [ ] Surface the `renderTriggered` key in the UI to show what caused each render

## Development

```bash
# Install dependencies
pnpm install

# Run the playground
pnpm dev

# Run tests
pnpm test

# Build the module (client SPA + Nuxt module)
pnpm build
```

## Architecture

```
src/
├── module.ts                           ← Nuxt module entry — registers transforms, plugins, devtools tabs
├── transforms/
│   ├── fetch-transform.ts              ← AST wraps useFetch/useAsyncData
│   ├── provide-inject-transform.ts     ← AST wraps provide/inject
│   ├── composable-transform.ts         ← AST wraps useX() composables
│   └── transition-transform.ts         ← Virtual vue proxy — overrides Transition export
├── runtime/
│   ├── plugin.ts                       ← Client runtime bootstrap + postMessage bridge
│   └── composables/
│       ├── fetch-registry.ts           ← Fetch tracking store + __devFetch shim
│       ├── provide-inject-registry.ts  ← Injection tracking + __devProvide/__devInject
│       ├── composable-registry.ts      ← Composable tracking + __trackComposable + leak detection
│       ├── render-registry.ts          ← Render performance data via PerformanceObserver
│       └── transition-registry.ts      ← Transition lifecycle store
└── nitro/
    └── fetch-capture.ts                ← SSR-side fetch timing

client/
├── index.html
├── vite.config.ts                      ← Client SPA Vite config (built to client/dist/)
├── tsconfig.json
└── src/
    ├── App.vue                         ← Tab navigation shell
    ├── main.ts
    ├── style.css                       ← Design system
    ├── components/
    ├── stores/
    └── views/
        ├── FetchDashboard.vue          ← useFetch tab UI
        ├── ProvideInjectGraph.vue      ← provide/inject tab UI
        ├── ComposableTracker.vue       ← Composable tab UI
        ├── RenderHeatmap.vue           ← Heatmap tab UI
        └── TransitionTimeline.vue      ← Transition tracker tab UI

playground/
├── app.vue                             ← Demo app exercising all five features
├── nuxt.config.ts
├── composables/
│   ├── useCounter.ts                   ← Clean composable (properly cleaned up)
│   └── useLeakyPoller.ts               ← Intentionally leaky (for demo)
├── components/
│   ├── ThemeConsumer.vue               ← Successfully injects 'theme'
│   ├── MissingProviderConsumer.vue     ← Injects 'cartContext' (no provider — red node)
│   ├── LeakyComponent.vue              ← Mounts useLeakyPoller
│   ├── HeavyList.vue                   ← Re-renders on every shuffle (heatmap demo)
│   ├── PriceDisplay.vue                ← Leaf component with high render count
│   └── transitions/
│       ├── FadeBox.vue                 ← Healthy enter/leave transition
│       ├── BrokenTransition.vue        ← Missing CSS classes (enter fires but stays in entering)
│       └── CancelledTransition.vue     ← Rapid toggle triggers enter-cancelled / leave-cancelled
└── server/api/
    └── product.ts                      ← Mock API endpoint
```

## License

MIT
