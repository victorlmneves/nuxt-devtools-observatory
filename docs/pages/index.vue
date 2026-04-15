<script setup lang="ts">
const appConfig = useAppConfig()

useSeoMeta({
    titleTemplate: '',
    title: appConfig.observatoryDocs.title,
    ogTitle: appConfig.observatoryDocs.title,
    description: appConfig.observatoryDocs.description,
    ogDescription: appConfig.observatoryDocs.description,
    ogImage: 'https://nuxt-devtools-observatory.vercel.app/logo-nuxt-devtools-observatory-header.png',
    ogUrl: 'https://nuxt-devtools-observatory.vercel.app',
})

const primaryLinks = [
    {
        label: 'Get Started',
        to: '/getting-started/installation',
        icon: 'i-lucide-rocket',
        variant: 'soft' as const,
    },
    {
        label: 'Explore Feature Guides',
        to: '/feature-guides',
        variant: 'subtle' as const,
        color: 'neutral' as const,
        icon: 'i-lucide-radar',
    },
]

const featureCards = [
    {
        title: 'useFetch Dashboard',
        description: 'Trace fetch calls, timings, payload shape, and request lifecycles without instrumenting your app by hand.',
        icon: 'i-lucide-activity',
        to: '/feature-guides/usefetch-dashboard',
    },
    {
        title: 'provide/inject Graph',
        description: 'Inspect provider chains, missing injections, and component-level data flow with a graph view built for debugging.',
        icon: 'i-lucide-network',
        to: '/feature-guides/provide-inject-graph',
    },
    {
        title: 'Composable Tracker',
        description: 'See how composables are registered, reused, and torn down so leaks and accidental duplication stand out quickly.',
        icon: 'i-lucide-orbit',
        to: '/feature-guides/composable-tracker',
    },
    {
        title: 'Render Heatmap',
        description: 'Identify hot components and noisy updates before they become performance regressions in real screens.',
        icon: 'i-lucide-flame',
        to: '/feature-guides/render-heatmap',
    },
    {
        title: 'Transition Tracker',
        description:
            'Validate transition hooks and animation flow to understand what actually happens during navigation and UI state changes.',
        icon: 'i-lucide-waypoints',
        to: '/feature-guides/transition-tracker',
    },
    {
        title: 'Trace Viewer',
        description:
            'Inspect per-route spans with overview, flamegraph, waterfall, and cross-trace render comparison for fast regression triage.',
        icon: 'i-lucide-gantt-chart-square',
        to: '/feature-guides/trace-viewer',
    },
    {
        title: 'API Reference',
        description: 'Check module options, RPC contracts, and snapshot structures against the implementation shipped in this repository.',
        icon: 'i-lucide-braces',
        to: '/api-reference',
    },
]

const quickLinks = [
    {
        title: 'Installation',
        description: 'Add the module, enable DevTools, and verify your first signal.',
        to: '/getting-started/installation',
    },
    {
        title: 'Configuration',
        description: 'Tune instrumentation scope, thresholds, and runtime behavior.',
        to: '/getting-started/configuration',
    },
    {
        title: 'Troubleshooting',
        description: 'Handle missing panels, empty registries, and stale instrumentation.',
        to: '/troubleshooting',
    },
]
</script>

<template>
    <UContainer class="landing-shell">
        <UPageHero
            title="Observe the parts of your Nuxt app that usually stay opaque"
            :description="appConfig.observatoryDocs.description"
            orientation="horizontal"
            :links="primaryLinks"
        >
            <template #headline>
                <UBadge variant="subtle" color="primary" size="lg">Nuxt module documentation</UBadge>
            </template>

            <template #body>
                <div class="landing-hero-copy">
                    <p>
                        Nuxt DevTools Observatory adds targeted visibility for fetch activity, composables, provide/inject chains, renders,
                        transitions, and route traces so you can debug app behavior from the same place you inspect the rest of Nuxt.
                    </p>
                </div>
            </template>

            <svg
                data-v-ad6859d7=""
                width="405"
                height="228"
                viewBox="0 0 405 228"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                class="mx-auto hidden h-64 lg:block"
            >
                <rect
                    x="1.23706"
                    y="0.668091"
                    width="403"
                    height="226"
                    rx="12"
                    fill="url(#paint0_linear_549_2000)"
                    fill-opacity="0.2"
                    stroke="url(#paint1_linear_549_2000)"
                    stroke-opacity="0.4"
                ></rect>
                <rect
                    opacity="0.08"
                    x="7.5"
                    y="10.931"
                    width="17"
                    height="17"
                    rx="5"
                    fill="#F1F5F9"
                    stroke="#F1F5F9"
                    stroke-width="1.73707"
                ></rect>
                <rect opacity="0.08" x="69" y="101" width="43" height="43" rx="5" fill="#F1F5F9" stroke="#F1F5F9"></rect>
                <rect opacity="0.08" x="125" y="101" width="43" height="43" rx="5" fill="#F1F5F9" stroke="#F1F5F9"></rect>
                <rect opacity="0.08" x="181" y="101" width="43" height="43" rx="5" fill="#F1F5F9" stroke="#F1F5F9"></rect>
                <rect opacity="0.08" x="237" y="101" width="43" height="43" rx="5" fill="#F1F5F9" stroke="#F1F5F9"></rect>
                <rect opacity="0.08" x="293" y="101" width="43" height="43" rx="5" fill="#F1F5F9" stroke="#F1F5F9"></rect>
                <rect opacity="0.08" x="7.5" y="38.8835" width="17" height="17" rx="3" stroke="#F1F5F9"></rect>
                <rect opacity="0.08" x="7.5" y="61.4656" width="17" height="17" rx="3" stroke="#F1F5F9"></rect>
                <rect opacity="0.08" x="7.5" y="84.0474" width="17" height="17" rx="3" stroke="#F1F5F9"></rect>
                <rect opacity="0.08" x="7.5" y="106.629" width="17" height="17" rx="3" stroke="#F1F5F9"></rect>
                <rect opacity="0.08" x="7.5" y="129.211" width="17" height="17" rx="3" stroke="#F1F5F9"></rect>
                <rect opacity="0.08" x="7.5" y="151.793" width="17" height="17" rx="3" stroke="#F1F5F9"></rect>
                <rect opacity="0.08" x="7.5" y="174.375" width="17" height="17" rx="3" stroke="#F1F5F9"></rect>
                <rect opacity="0.08" x="7.5" y="196.957" width="17" height="17" rx="3" stroke="#F1F5F9"></rect>
                <line opacity="0.08" x1="7.5" y1="32.431" x2="24.5" y2="32.431" stroke="#F1F5F9"></line>
                <path
                    d="M204.781 78H212.588C212.836 78 213.079 77.9354 213.294 77.8125C213.509 77.6896 213.687 77.5128 213.811 77.3C213.935 77.0871 214 76.8457 214 76.5999C214 76.3542 213.934 76.1128 213.81 75.9001L208.568 66.9001C208.444 66.6873 208.265 66.5105 208.051 66.3877C207.836 66.2648 207.592 66.2001 207.345 66.2001C207.097 66.2001 206.853 66.2648 206.638 66.3877C206.424 66.5105 206.246 66.6873 206.122 66.9001L204.781 69.2028L202.16 64.6998C202.036 64.487 201.858 64.3104 201.643 64.1875C201.428 64.0647 201.185 64 200.937 64C200.689 64 200.445 64.0647 200.231 64.1875C200.016 64.3104 199.837 64.487 199.713 64.6998L193.19 75.9001C193.066 76.1128 193 76.3542 193 76.5999C193 76.8457 193.065 77.0871 193.189 77.3C193.313 77.5128 193.491 77.6896 193.706 77.8125C193.921 77.9354 194.164 78 194.412 78H199.312C201.254 78 202.686 77.1547 203.671 75.5057L206.063 71.4001L207.344 69.2028L211.189 75.8028H206.063L204.781 78ZM199.233 75.8005L195.813 75.7998L200.939 67.0004L203.497 71.4001L201.784 74.3407C201.13 75.4107 200.387 75.8005 199.233 75.8005Z"
                    fill="white"
                    fill-opacity="0.1"
                ></path>
                <defs>
                    <linearGradient
                        id="paint0_linear_549_2000"
                        x1="202.737"
                        y1="0.668091"
                        x2="202.737"
                        y2="103.49"
                        gradientUnits="userSpaceOnUse"
                    >
                        <stop stop-color="white"></stop>
                        <stop offset="1" stop-color="white" stop-opacity="0"></stop>
                    </linearGradient>
                    <linearGradient
                        id="paint1_linear_549_2000"
                        x1="202.737"
                        y1="0.668091"
                        x2="202.764"
                        y2="154.266"
                        gradientUnits="userSpaceOnUse"
                    >
                        <stop stop-color="white"></stop>
                        <stop offset="1" stop-color="white" stop-opacity="0"></stop>
                    </linearGradient>
                </defs>
            </svg>

            <!-- <div class="relative group [&amp;&gt;pre]:rounded-t-none [&amp;&gt;pre]:my-0 my-5">
                <div class="flex items-center gap-1.5 border border-muted bg-default border-b-0 relative rounded-t-md px-4 py-3">
                    <span class="iconify i-vscode-icons:file-type-nuxt size-4 shrink-0" aria-hidden="true"></span>
                    <span class="text-default text-sm/6">nuxt.config.ts</span>
                </div>
                <button
                    type="button"
                    aria-label="Copy code to clipboard"
                    tabindex="-1"
                    data-slot="base"
                    class="rounded-md font-medium inline-flex items-center disabled:cursor-not-allowed aria-disabled:cursor-not-allowed disabled:opacity-75 aria-disabled:opacity-75 text-xs gap-1.5 ring ring-inset ring-accented text-default bg-default hover:bg-elevated active:bg-elevated disabled:bg-default aria-disabled:bg-default focus:outline-none focus-visible:ring-2 focus-visible:ring-inverted p-1.5 absolute top-[11px] right-[11px] lg:opacity-0 lg:group-hover:opacity-100 transition"
                >
                    <span class="iconify i-lucide:copy shrink-0 size-4" aria-hidden="true" data-slot="leadingIcon"></span>
                </button>
                <pre
                    class="group font-mono text-sm/6 border border-muted bg-muted rounded-md px-4 py-3 whitespace-pre-wrap break-words overflow-x-auto focus:outline-none **:[.line]:block **:[.line.highlight]:-mx-4 **:[.line.highlight]:px-4 **:[.line.highlight]:bg-accented/50!"
                ><pre class="language-ts shiki shiki-themes material-theme-lighter material-theme material-theme-palenight" code="export default defineNuxtConfig({
  modules: [
    'nuxt-devtools-observatory',
  ],

  devtools: {
    enabled: true,
  },

  observatory: {
    observatory: {
        instrumentServer: true, // Instrument the server for SSR/Nitro fetch and composable tracking. Enable this when using SSR so server-side composable calls are captured. Disable for SPA projects to avoid double-registration caused by the transform running on both builds.
        fetchDashboard: true, // Enable useFetch dashboard
        provideInjectGraph: true, // Enable provide/inject graph
        composableTracker: true, // Enable composable tracker
        renderHeatmap: true, // Enable render heatmap
        transitionTracker: true, // Enable transition tracker
        composableNavigationMode: 'route', // 'route' clears entries on navigation (default), 'session' persists across navigation
        heatmapThresholdCount: 3, // Highlight components with 3+ renders
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
  },
})
" filename="nuxt.config.ts" language="ts" meta="" style=""><code><span class="line" line="1"><span class="s7zQu">export</span><span class="s7zQu"> default</span><span class="s2Zo4"> defineNuxtConfig</span><span class="sTEyZ">(</span><span class="sMK4o">{
</span></span><span class="line" line="2"><span class="swJcz">  modules</span><span class="sMK4o">:</span><span class="sTEyZ"> [
</span></span><span class="line" line="3"><span class="sMK4o">    '</span><span class="sfazB">nuxt-devtools-observatory</span><span class="sMK4o">'</span><span class="sMK4o">,
</span></span><span class="line" line="4"><span class="sTEyZ">  ]</span><span class="sMK4o">,
</span></span><span class="line" line="5"><span emptylineplaceholder="true">
</span></span><span class="line" line="6"><span class="swJcz">  observatory</span><span class="sMK4o">:</span><span class="sTEyZ"> {
</span></span><span class="line" line="7"><span class="sMK4o">    </span><span class="sfazB">instrumentServer</span><span class="sMK4o">: true</span><span class="sMK4o">,
</span></span><span class="line" line="7"><span class="sMK4o">    </span><span class="sfazB">fetchDashboard</span><span class="sMK4o">: true</span><span class="sMK4o">,
</span></span><span class="line" line="7"><span class="sMK4o">    </span><span class="sfazB">provideInjectGraph</span><span class="sMK4o">: true</span><span class="sMK4o">,
</span></span><span class="line" line="7"><span class="sMK4o">    </span><span class="sfazB">composableTracker</span><span class="sMK4o">: true</span><span class="sMK4o">,
</span></span><span class="line" line="7"><span class="sMK4o">    </span><span class="sfazB">renderHeatmap</span><span class="sMK4o">: true</span><span class="sMK4o">,
</span></span><span class="line" line="7"><span class="sMK4o">    </span><span class="sfazB">transitionTracker</span><span class="sMK4o">: true</span><span class="sMK4o">,
</span></span><span class="line" line="7"><span class="sMK4o">    </span><span class="sfazB">composableNavigationMode</span><span class="sMK4o">: true</span><span class="sMK4o">,
</span></span><span class="line" line="7"><span class="sMK4o">    </span><span class="sfazB">heatmapThresholdCount</span><span class="sMK4o">: 3</span><span class="sMK4o">,
</span></span><span class="line" line="7"><span class="sMK4o">    </span><span class="sfazB">heatmapThresholdTime</span><span class="sMK4o">: 1600</span><span class="sMK4o">,
</span></span><span class="line" line="7"><span class="sMK4o">    </span><span class="sfazB">heatmapHideInternals</span><span class="sMK4o">: true</span><span class="sMK4o">,
</span></span><span class="line" line="7"><span class="sMK4o">    </span><span class="sfazB">debugRpc</span><span class="sMK4o">: true</span><span class="sMK4o">,
</span></span><span class="line" line="7"><span class="sMK4o">    </span><span class="sfazB">maxFetchEntries</span><span class="sMK4o">: 200</span><span class="sMK4o">,
</span></span><span class="line" line="7"><span class="sMK4o">    </span><span class="sfazB">maxPayloadBytes</span><span class="sMK4o">: 10000</span><span class="sMK4o">,
</span></span><span class="line" line="7"><span class="sMK4o">    </span><span class="sfazB">maxTransitions</span><span class="sMK4o">: 500</span><span class="sMK4o">,
</span></span><span class="line" line="7"><span class="sMK4o">    </span><span class="sfazB">maxComposableHistory</span><span class="sMK4o">: 59</span><span class="sMK4o">,
</span></span><span class="line" line="7"><span class="sMK4o">    </span><span class="sfazB">maxComposableEntries</span><span class="sMK4o">: 300</span><span class="sMK4o">,
</span></span><span class="line" line="7"><span class="sMK4o">    </span><span class="sfazB">maxRenderTimeline</span><span class="sMK4o">: 100</span><span class="sMK4o">,
</span></span><span class="line" line="9"><span class="sTEyZ">  }</span><span class="sMK4o">,
</span></span><span class="line" line="10"><span class="sMK4o">}</span><span class="sTEyZ">)
</span></span></code></pre></pre>
            </div> -->
        </UPageHero>

        <UPageSection
            title="Built around the six tabs you actually use while debugging"
            description="Each guide maps directly to the playground scenarios and the runtime registries behind the module."
        >
            <UPageGrid>
                <UPageCard
                    v-for="card in featureCards"
                    :key="card.title"
                    :title="card.title"
                    :description="card.description"
                    :icon="card.icon"
                    :to="card.to"
                    variant="subtle"
                />
            </UPageGrid>
        </UPageSection>

        <UPageSection
            title="Start with a clean path"
            description="Use the setup pages first, then move into feature guides once the module is collecting data from your app."
        >
            <UPageGrid>
                <UPageCard
                    v-for="link in quickLinks"
                    :key="link.title"
                    :title="link.title"
                    :description="link.description"
                    :to="link.to"
                    icon="i-lucide-arrow-up-right"
                />
            </UPageGrid>
        </UPageSection>

        <UPageCTA
            title="Need the exact option names and runtime contracts?"
            description="The reference section tracks the module options and snapshot types directly from the repository source."
            :links="[
                { label: 'Open API Reference', to: '/api-reference' },
                {
                    label: 'View Repository',
                    to: 'https://github.com/victorneves/nuxt-devtools-observatory',
                    target: '_blank',
                    variant: 'ghost',
                    color: 'neutral',
                },
            ]"
        />
    </UContainer>
</template>
