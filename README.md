[![provide/inject Graph](https://github.com/victorlmneves/nuxt-devtools-observatory/blob/main/docs/public/nuxt-devtools-observatory-readme.png)](https://github.com/victorlmneves/nuxt-devtools-observatory/blob/main/docs/public/nuxt-devtools-observatory-readme.png)

# Nuxt DevTools Observatory

Nuxt DevTools module providing six missing observability features:

- **useFetch Dashboard** — central view of all async data calls, cache keys, waterfall timeline
- **provide/inject Graph** — interactive tree showing the full injection topology, value inspection, scope labels, shadow detection, and missing-provider warnings
- **Composable Tracker** — live view of active composables, reactive state, change history, leak detection, inline value editing, and reverse lookup
- **Render Heatmap** — component tree colour-coded by render frequency and duration, with per-render timeline, route filtering, and persistent-component accuracy fixes
- **Transition Tracker** — live timeline of every `<Transition>` lifecycle event with phase, duration, and cancellation state
- **Trace Viewer** — per-route span traces capturing component mount order, real render durations, fetch timing, composable setup, and navigation events in a unified Flamegraph and Waterfall view

## Documentation website

An in-repo documentation site lives in `docs/`. It is a custom Nuxt app built with
Nuxt Content and Nuxt UI.

- Run locally from repo root: `pnpm docs:dev`
- Production build: `pnpm docs:build`
- Generate a static build: `pnpm docs:generate`
- Preview the generated output: `pnpm docs:preview`

For Vercel deployment, set `docs/` as the project root directory.

## Installation

```bash
pnpm add nuxt-devtools-observatory
```

You can configure all observability features and limits from your consuming project's
`nuxt.config.ts` under the `observatory` key. Common environment variables are listed
in `.env.example`; use the `OBSERVATORY_*` names when configuring through `.env`.
Options set in `nuxt.config.ts` take precedence over environment variables.

**Available options:**

- `instrumentServer` (boolean) — Instrument the server for SSR/Nitro fetch and composable tracking (set via `OBSERVATORY_INSTRUMENT_SERVER`)
- `fetchDashboard` (boolean) — Enable useFetch dashboard
- `provideInjectGraph` (boolean) — Enable provide/inject graph
- `composableTracker` (boolean) — Enable composable tracker
- `renderHeatmap` (boolean) — Enable render heatmap
- `transitionTracker` (boolean) — Enable transition tracker (set via `OBSERVATORY_TRANSITION_TRACKER`)
- `traceViewer` (boolean) — Enable trace viewer tab with per-route Flamegraph and Waterfall (set via `OBSERVATORY_TRACE_VIEWER`)
- `composableNavigationMode` (string, 'route' | 'session') — Composable tracker mode: 'route' clears entries on page navigation (default), 'session' persists entries across navigation for historical inspection (`OBSERVATORY_COMPOSABLE_NAVIGATION_MODE`)
- `heatmapThresholdCount` (number) — Highlight components with N+ renders in heatmap
- `heatmapThresholdTime` (number) — Highlight components with render time above this (ms)
- `heatmapHideInternals` (boolean) — Hide node_modules and internal components in the render heatmap for a cleaner view
- `debugRpc` (boolean) — Enable RPC handshake debug logs in the Observatory iframe/host bridge (set via `OBSERVATORY_DEBUG_RPC`)
- `maxFetchEntries` (number) — Max fetch entries to keep in memory
- `maxPayloadBytes` (number) — Max payload size (bytes) per fetch entry
- `maxTransitions` (number) — Max transition entries to keep in memory
- `maxComposableHistory` (number) — Max composable history events per entry
- `maxComposableEntries` (number) — Max composable entries to keep in memory
- `maxRenderTimeline` (number) — Max render timeline events per entry

Feature tabs are enabled by default in development. `instrumentServer` defaults to
`true` for SSR apps and `false` for SPA apps.

```ts
// nuxt.config.ts
export default defineNuxtConfig({
    modules: ['nuxt-devtools-observatory'],

    observatory: {
        instrumentServer: true, // Instrument the server for SSR/Nitro fetch and composable tracking. Enable this when using SSR so server-side composable calls are captured. Disable for SPA projects to avoid double-registration caused by the transform running on both builds.
        fetchDashboard: true, // Enable useFetch dashboard
        provideInjectGraph: true, // Enable provide/inject graph
        composableTracker: true, // Enable composable tracker
        renderHeatmap: true, // Enable render heatmap
        transitionTracker: true, // Enable transition tracker
        traceViewer: true, // Enable trace viewer
        composableNavigationMode: 'route', // 'route' clears entries on navigation (default), 'session' persists across navigation
        heatmapThresholdCount: 5, // Highlight components with 5+ renders
        heatmapThresholdTime: 1600, // Highlight components with render time above this (ms)
        heatmapHideInternals: true, // Hide node_modules and internal components in the render heatmap
        debugRpc: false, // Enable RPC handshake debug logs (useful for troubleshooting)
        maxFetchEntries: 200, // Max fetch entries to keep in memory
        maxPayloadBytes: 10000, // Max payload size (bytes) per fetch entry
        maxTransitions: 500, // Max transition entries to keep in memory
        maxComposableHistory: 50, // Max composable history events per entry
        maxComposableEntries: 300, // Max composable entries to keep in memory
        maxRenderTimeline: 100, // Max render timeline events per entry
    },

    devtools: { enabled: true },
})
```

Open the Nuxt DevTools panel — six new tabs will appear.

The DevTools client SPA is served same-origin via the Nuxt dev server at `/__observatory/`.

## How it works

All instrumentation is **dev-only**. The module registers Vite transforms that wrap
`useFetch`, `provide/inject`, `useX()` composable calls, and `<Transition>` at the
AST/module level before compilation. In production (`import.meta.dev === false`) the
transforms are skipped entirely — zero runtime overhead.

### useFetch Dashboard

[![useFetch Dashboard](https://github.com/victorlmneves/nuxt-devtools-observatory/blob/main/docs/screenshots/fetch-dashboard.png)](https://github.com/victorlmneves/nuxt-devtools-observatory/blob/main/docs/screenshots/fetch-dashboard.png)

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

The panel provides:

- **Interactive SVG graph** — component tree with curved edges; nodes colour-coded by
  role (teal = provides, blue = both, grey = injects, red = missing provider)
- **Value inspection** — each provided key shows an inline preview (e.g. `{ user, isLoggedIn }`)
  with a `view` button to expand the full JSON for complex objects
- **Scope labels** — every provided key carries a `global`, `layout`, or `component`
  badge derived from the providing component's position in the tree
- **Shadow detection** — when a child component re-provides a key already provided by
  an ancestor, the entry is flagged with an amber warning and a `shadowed` filter button
  appears in the toolbar
- **Consumer list** — each provided key shows which components inject it, with chip badges
- **Missing-provider warnings** — unresolved `inject()` calls are shown with a red
  `no provider` badge and the component node turns red in the graph
- **Filter by key** — per-key filter buttons in the toolbar narrow the graph to only
  components involved with a specific key
- **Search** — free-text search across component names and key names
- **Jump to editor** — clicking `open ↗` in the detail panel header opens the selected
  component's source file in the configured editor

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

- **Navigation mode toggle** — switch between 'route' mode (clears entries on navigation) and 'session' mode (persists entries across pages). In session mode, a "clear session" button appears to manually reset the history
- **Filtering** by status (all / mounted / unmounted / leaks only) and free-text search across composable name, source file, ref key names, and ref values
- **Recency-first ordering** — newest entries appear first, with layout-level composables pinned to the top (layout composables persist across page navigation)
- **Inline ref chip preview** — up to three reactive values shown on the card without expanding, with distinct styling for `ref`, `computed`, and `reactive` types
- **Collapsible ref values** — long objects and arrays automatically collapse with a chevron toggle to expand them inline in the detail view with full pretty-printed JSON
- **Global state badges** — keys shared across instances are highlighted in amber with a `global` badge and an explanatory banner when expanded
- **Change history** — a scrollable log of the last 50 value mutations with key, new value, and relative timestamp
- **Lifecycle summary** — shows whether `onMounted`/`onUnmounted` were registered and whether watchers and intervals were properly cleaned up
- **Reverse lookup** — clicking any ref key opens a panel listing every other composable instance that exposes a key with the same name, with its composable name, file, and route
- **Inline value editing** — writable `ref` values have an `edit` button; clicking opens a JSON textarea that applies the new value directly to the live ref in the running app
- **Jump to editor** — an `open ↗` button in the context section opens the composable's source file in the configured editor

**Known gaps:**

- Reverse lookup matches by key name only, not by object identity
- Search does not look inside nested `reactive` object properties

### Render Heatmap

[![Render Heatmap](https://github.com/victorlmneves/nuxt-devtools-observatory/blob/main/docs/screenshots/render-heatmap.png)](https://github.com/victorlmneves/nuxt-devtools-observatory/blob/main/docs/screenshots/render-heatmap.png)

Uses Vue's built-in `renderTriggered` mixin hook and `app.config.performance = true`.
Accurate duration is measured by bracketing each `beforeMount`/`mounted` and
`beforeUpdate`/`updated` cycle with `performance.now()` timestamps.
Component bounding boxes are captured via `$el.getBoundingClientRect()` for the DOM
overlay mode.

Each `RenderEntry` carries a `timeline: RenderEvent[]` (capped at 100 events, newest
last). Every mount and update cycle appends an event recording:

- `kind` — `mount` or `update`
- `t` — `performance.now()` timestamp
- `durationMs` — measured render duration
- `triggerKey` — the reactive dep that caused the update (when `renderTriggered` fired
  before `updated`), formatted as `type: key`
- `route` — the route path at the time of the render

A `route` field on each entry records which route the component was first seen on.
`setRoute()` is called by the plugin on every `router.afterEach` so new entries and
timeline events are always stamped with the correct path.

**Persistent component fix:** layout and persistent components (those that survive
`reset()` and are flagged `isPersistent: true`) previously inflated render counts on
every navigation because their `beforeMount`/`mounted` cycle fired again as Vue
re-attached them to the new page. The registry now detects this case and skips both
the duration recording and the timeline event for the navigation re-attach, while still
counting and recording genuine reactive updates that fire after navigation.

The panel provides:

- **Route filter** — a dropdown in the toolbar listing every route seen across all
  component entries and timeline events; selecting one prunes the component tree to
  only show components that were active on that route
- **Render timeline** — in the detail panel, the last 30 events for the selected
  component showing kind, relative timestamp, duration, trigger key, and route
- **Trigger keys** — surfaced both in the existing triggers list and inline in each
  timeline event
- **Persistent and hydration badges** — `isPersistent` and `isHydrationMount` shown
  as pills in the tree row and the detail panel
- **Jump to editor** — every tree row shows an `↗` button on hover, and the detail
  panel's identity section has an `open ↗` button; both call Vite's built-in
  `/__open-in-editor` endpoint to open the component's source file in the configured
  editor

**Known gaps:**

- The route filter shows components active on a route but cannot hide persistent
  components (they appear on every route by definition)

### Trace Viewer

[![Trace Viewer](https://github.com/victorlmneves/nuxt-devtools-observatory/blob/main/docs/screenshots/trace-viewer.png)](https://github.com/victorlmneves/nuxt-devtools-observatory/blob/main/docs/screenshots/trace-viewer.png)

The Trace Viewer automatically collects per-route traces that span the full lifecycle of
each page visit. Every significant event is recorded as a typed span and grouped into a
single `TraceEntry` per navigation, so you can see everything that happened — in order —
after a route change.

**Span types collected:**

| Type         | Emitted by                        | What it measures                                     |
| ------------ | --------------------------------- | ---------------------------------------------------- |
| `navigation` | `router.afterEach` hook           | Route change from → to, duration                     |
| `component`  | Vue mixin lifecycle hooks         | Exact `mounted` / `updated` hook cost                |
| `render`     | `beforeMount` → `mounted` bracket | Real DOM-patching time per component mount/update    |
| `fetch`      | `useFetch` / `useAsyncData` shim  | Network request start, server/client origin, latency |
| `composable` | `__trackComposable` shim          | Setup phase of every tracked `useXxx()` call         |
| `transition` | `<Transition>` wrapper            | Full enter/leave lifecycle phase                     |

**Render span tracking:**
Real render time is measured by storing `performance.now()` in a `WeakMap<ComponentPublicInstance, number>` inside `beforeMount` / `beforeUpdate`, then reading it back in the corresponding `mounted` / `updated` hooks. This produces a `type: 'render'` span whose duration is the actual DOM-patching cost, separately from the `component:mounted` hook span (which only measures the hook body itself).

**Trace anchoring:**
Each `TraceEntry` is anchored to the `startTime` of its first span, so bar positions in the timeline are always relative to the first event in the trace rather than the time the trace object was created.

The panel provides:

- **Trace list** — every captured route visit shown with name, total duration, and span count; click to open
- **Flamegraph tab** — collapsible span tree with horizontal duration bars, depth-based indentation, parent–child nesting, and a selected-span highlight (purple tint)
- **Waterfall tab** — spans grouped by type with a shared horizontal timeline, group headers, and status badges
- **Span inspector** — clicking any span opens a detail panel showing type, status, duration, start offset, and all metadata fields
- **Filter panel** — filter by span type and free-text search across span names and metadata
- **Duration labels** — spans narrower than 5 % of the timeline render their label outside the bar for readability
- **In-progress traces** — active traces show `~Xms` (computed from the latest span end offset) rather than a hard "in progress" label

**What it tells you:**

- Mount order and render cost of every component on the route
- Whether render time is dominated by the component `setup()` / lifecycle hooks or by actual DOM patching
- Which `useFetch` calls are in the critical path and how long each took
- Whether composable setup is adding meaningful latency
- Which components are slow to mount and might benefit from `<Suspense>` or lazy loading

**Known gaps:**

- SSR spans are not yet captured — only client-side navigation traces are collected
- Re-render counts are tracked by Render Heatmap; the Trace Viewer records individual render events but does not aggregate them

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
Data is bridged between host app and Observatory using Nuxt DevTools RPC + Vite WS
events (`observatory:snapshot` / `observatory:command`) on the same dev server origin.

## Opting out

Add a `/* @devtools-ignore */` comment before any call to exclude it from instrumentation:

```ts
/* @devtools-ignore */
const { data } = useFetch('/api/sensitive')

/* @devtools-ignore */
const result = useMyComposable()
```

## Roadmap

### Composable Tracker

- [ ] Reverse lookup by object identity rather than key name only
- [ ] Deep search inside nested `reactive` object properties

### Trace Viewer

- [ ] SSR span collection (server-side navigation and composable setup)
- [ ] Cross-trace comparison view
- [ ] Export traces as JSON

## Development

```bash
# Install dependencies
pnpm install

# Run the playground
pnpm dev

# Run the docs site
pnpm docs:dev

# Run tests
pnpm test

# Run end-to-end checks
pnpm test:e2e

# Update screenshot fixtures
pnpm capture:screenshots

# Format + lint fixes
pnpm format

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
│   ├── plugin.ts                       ← Client runtime bootstrap + RPC/Vite WS bridge
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
        ├── TransitionTimeline.vue      ← Transition tracker tab UI
        └── TraceViewer.vue             ← Trace viewer tab UI (Flamegraph + Waterfall + Inspector)

playground/
├── app.vue                             ← Demo app shell used during local development
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

docs/
├── app.vue                             ← Docs app shell
├── content/                            ← Versioned guides and API pages
├── layouts/                            ← Docs layouts
├── pages/                              ← Landing page + content catch-all route
└── server/api/                         ← Docs-specific API handlers
```

## License

[MIT](https://opensource.org/licenses/MIT)

Copyright (c) 2026, Victor Neves
