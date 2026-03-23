// This script launches the Observatory SPA at :4949, injects mock data, and captures screenshots for all tabs.
// Run with: pnpm capture:screenshots

const { chromium } = require('playwright');
const path = require('path');

const BASE_URL = 'http://localhost:4949';
const screenshots = [
  { name: 'fetch-dashboard', path: '/fetch', file: 'docs/screenshots/fetch-dashboard.png' },
  { name: 'provide-inject-graph', path: '/provide', file: 'docs/screenshots/provide-inject-graph.png' },
  { name: 'composable-tracker', path: '/composables', file: 'docs/screenshots/composable-tracker.png' },
  { name: 'render-heatmap', path: '/heatmap', file: 'docs/screenshots/render-heatmap.png' },
  { name: 'transition-tracker', path: '/transitions', file: 'docs/screenshots/transition-tracker.png' },
];

// Example mock data for all trackers (customize as needed)
const mockData = {
  type: 'observatory:snapshot',
  data: {
    fetch: [
      { id: '1', key: 'products-get', url: '/api/products', status: 'ok', origin: 'csr', startTime: Date.now() - 10000, endTime: Date.now() - 9900, ms: 100, size: 512, cached: false, payload: { products: [1,2,3] } },
      { id: '2', key: 'products-post', url: '/api/products', status: 'ok', origin: 'csr', startTime: Date.now() - 9000, endTime: Date.now() - 8900, ms: 100, size: 128, cached: false, payload: { id: 4 } },
      { id: '3', key: 'user-get', url: '/api/user', status: 'error', origin: 'csr', startTime: Date.now() - 8000, endTime: Date.now() - 7990, ms: 10, size: 0, cached: false, payload: { error: 'Unauthorized' } },
      { id: '4', key: 'cart-put', url: '/api/cart', status: 'error', origin: 'csr', startTime: Date.now() - 7000, endTime: Date.now() - 6980, ms: 20, size: 0, cached: false, payload: { error: 'Server error' } },
      { id: '5', key: 'checkout-post', url: '/api/checkout', status: 'ok', origin: 'csr', startTime: Date.now() - 6000, endTime: Date.now() - 5950, ms: 50, size: 64, cached: false, payload: { checkout: true } },
      { id: '6', key: 'orders-get', url: '/api/orders', status: 'ok', origin: 'csr', startTime: Date.now() - 5000, endTime: Date.now() - 4950, ms: 50, size: 256, cached: false, payload: { orders: [100,101] } },
      { id: '7', key: 'orders-post', url: '/api/orders', status: 'pending', origin: 'csr', startTime: Date.now() - 4000, cached: false },
      { id: '8', key: 'analytics-get', url: '/api/analytics', status: 'cached', origin: 'csr', startTime: Date.now() - 3000, endTime: Date.now() - 2990, ms: 10, size: 32, cached: true, payload: { analytics: true } },
      { id: '9', key: 'slow-get', url: '/api/slow', status: 'ok', origin: 'csr', startTime: Date.now() - 2000, endTime: Date.now() - 1800, ms: 200, size: 1024, cached: false, payload: { slow: true } },
      { id: '10', key: 'timeout-get', url: '/api/timeout', status: 'error', origin: 'csr', startTime: Date.now() - 1000, endTime: Date.now() - 500, ms: 500, size: 0, cached: false, payload: { error: 'Timeout' } },
    ],
      // Set the first entry as selected for screenshot
      selectedFetchId: '1',
    provideInject: {
      provides: [
        { key: 'theme', componentName: 'ThemeProvider', componentFile: 'ThemeProvider.vue', componentUid: 1, isReactive: true, valueSnapshot: 'dark', line: 10, scope: 'global', isShadowing: false },
        { key: 'user', componentName: 'AuthProvider', componentFile: 'AuthProvider.vue', componentUid: 2, isReactive: true, valueSnapshot: '{ user: "alice" }', line: 12, scope: 'global', isShadowing: false },
        { key: 'cart', componentName: 'CartProvider', componentFile: 'CartProvider.vue', componentUid: 3, isReactive: true, valueSnapshot: '{ items: 3 }', line: 15, scope: 'component', isShadowing: false },
        { key: 'locale', componentName: 'ConfigProvider', componentFile: 'ConfigProvider.vue', componentUid: 4, isReactive: false, valueSnapshot: 'en', line: 8, scope: 'layout', isShadowing: false },
        { key: 'flag', componentName: 'FeatureFlagProvider', componentFile: 'FeatureFlagProvider.vue', componentUid: 5, isReactive: false, valueSnapshot: '{ enabled: true }', line: 20, scope: 'component', isShadowing: false },
      ],
      injects: [
        { key: 'theme', componentName: 'ThemeConsumer', componentFile: 'ThemeConsumer.vue', componentUid: 10, resolved: true, line: 22 },
        { key: 'user', componentName: 'UserProfile', componentFile: 'UserProfile.vue', componentUid: 11, resolved: true, line: 18 },
        { key: 'cart', componentName: 'CartSummary', componentFile: 'CartSummary.vue', componentUid: 12, resolved: true, line: 25 },
        { key: 'flag', componentName: 'BetaBanner', componentFile: 'BetaBanner.vue', componentUid: 13, resolved: true, line: 30 },
        { key: 'missing', componentName: 'MissingProviderConsumer', componentFile: 'MissingProviderConsumer.vue', componentUid: 14, resolved: false, line: 40 },
      ]
    },
    composables: [
      { name: 'useCounter', calls: 3, time: Date.now() - 10000, id: 'c1', componentFile: 'Counter.vue', componentUid: 1, status: 'mounted', leak: false, refs: { count: { type: 'ref', value: 5 } }, history: [], sharedKeys: [], watcherCount: 1, intervalCount: 0, lifecycle: { hasOnMounted: true, hasOnUnmounted: true, watchersCleaned: true, intervalsCleaned: true }, file: 'Counter.vue', line: 10 },
      { name: 'useLeakyPoller', calls: 2, time: Date.now() - 9500, id: 'c2', componentFile: 'LeakyPoller.vue', componentUid: 2, status: 'mounted', leak: true, leakReason: 'interval', refs: { poll: { type: 'ref', value: 42 } }, history: [], sharedKeys: [], watcherCount: 2, intervalCount: 1, lifecycle: { hasOnMounted: true, hasOnUnmounted: false, watchersCleaned: false, intervalsCleaned: false }, file: 'LeakyPoller.vue', line: 12 },
      { name: 'useProductList', calls: 1, time: Date.now() - 9000, id: 'c3', componentFile: 'ProductList.vue', componentUid: 3, status: 'mounted', leak: false, refs: { products: { type: 'ref', value: [1,2,3] } }, history: [], sharedKeys: [], watcherCount: 1, intervalCount: 0, lifecycle: { hasOnMounted: true, hasOnUnmounted: true, watchersCleaned: true, intervalsCleaned: true }, file: 'ProductList.vue', line: 15 },
      { name: 'useTheme', calls: 4, time: Date.now() - 8500, id: 'c4', componentFile: 'Theme.vue', componentUid: 4, status: 'mounted', leak: false, refs: { theme: { type: 'ref', value: 'dark' } }, history: [], sharedKeys: [], watcherCount: 1, intervalCount: 0, lifecycle: { hasOnMounted: true, hasOnUnmounted: true, watchersCleaned: true, intervalsCleaned: true }, file: 'Theme.vue', line: 8 },
      { name: 'useUser', calls: 2, time: Date.now() - 8000, id: 'c5', componentFile: 'User.vue', componentUid: 5, status: 'unmounted', leak: false, refs: { user: { type: 'ref', value: 'alice' } }, history: [], sharedKeys: [], watcherCount: 0, intervalCount: 0, lifecycle: { hasOnMounted: true, hasOnUnmounted: true, watchersCleaned: true, intervalsCleaned: true }, file: 'User.vue', line: 20 },
      { name: 'useCart', calls: 5, time: Date.now() - 7500, id: 'c6', componentFile: 'Cart.vue', componentUid: 6, status: 'mounted', leak: false, refs: { cart: { type: 'ref', value: [1,2] } }, history: [], sharedKeys: [], watcherCount: 1, intervalCount: 0, lifecycle: { hasOnMounted: true, hasOnUnmounted: true, watchersCleaned: true, intervalsCleaned: true }, file: 'Cart.vue', line: 25 },
      { name: 'useSettings', calls: 2, time: Date.now() - 7000, id: 'c7', componentFile: 'Settings.vue', componentUid: 7, status: 'mounted', leak: false, refs: { locale: { type: 'ref', value: 'en' } }, history: [], sharedKeys: [], watcherCount: 1, intervalCount: 0, lifecycle: { hasOnMounted: true, hasOnUnmounted: true, watchersCleaned: true, intervalsCleaned: true }, file: 'Settings.vue', line: 30 },
      { name: 'useOrders', calls: 1, time: Date.now() - 6500, id: 'c8', componentFile: 'Orders.vue', componentUid: 8, status: 'mounted', leak: false, refs: { orders: { type: 'ref', value: [100,101] } }, history: [], sharedKeys: [], watcherCount: 1, intervalCount: 0, lifecycle: { hasOnMounted: true, hasOnUnmounted: true, watchersCleaned: true, intervalsCleaned: true }, file: 'Orders.vue', line: 35 },
    ],
    renders: [
      { uid: 1, name: 'HeavyList', file: 'HeavyList.vue', mountCount: 2, rerenders: 5, totalMs: 120, avgMs: 24, triggers: [{ key: 'data', type: 'ref', timestamp: Date.now() - 10000 }], timeline: [], isPersistent: false, isHydrationMount: false, route: '/' },
      { uid: 2, name: 'PriceDisplay', file: 'PriceDisplay.vue', mountCount: 1, rerenders: 2, totalMs: 60, avgMs: 30, triggers: [{ key: 'price', type: 'ref', timestamp: Date.now() - 9500 }], timeline: [], isPersistent: false, isHydrationMount: false, route: '/' },
      { uid: 3, name: 'ThemeConsumer', file: 'ThemeConsumer.vue', mountCount: 1, rerenders: 3, totalMs: 45, avgMs: 15, triggers: [{ key: 'theme', type: 'ref', timestamp: Date.now() - 9000 }], timeline: [], isPersistent: false, isHydrationMount: false, route: '/' },
      { uid: 4, name: 'LeakyComponent', file: 'LeakyComponent.vue', mountCount: 1, rerenders: 1, totalMs: 10, avgMs: 10, triggers: [{ key: 'poll', type: 'ref', timestamp: Date.now() - 8500 }], timeline: [], isPersistent: false, isHydrationMount: false, route: '/' },
      { uid: 5, name: 'MissingProviderConsumer', file: 'MissingProviderConsumer.vue', mountCount: 1, rerenders: 1, totalMs: 8, avgMs: 8, triggers: [{ key: 'missing', type: 'ref', timestamp: Date.now() - 8000 }], timeline: [], isPersistent: false, isHydrationMount: false, route: '/' },
      { uid: 6, name: 'CartSummary', file: 'CartSummary.vue', mountCount: 1, rerenders: 2, totalMs: 20, avgMs: 10, triggers: [{ key: 'cart', type: 'ref', timestamp: Date.now() - 7500 }], timeline: [], isPersistent: false, isHydrationMount: false, route: '/' },
      { uid: 7, name: 'UserProfile', file: 'UserProfile.vue', mountCount: 1, rerenders: 1, totalMs: 12, avgMs: 12, triggers: [{ key: 'user', type: 'ref', timestamp: Date.now() - 7000 }], timeline: [], isPersistent: false, isHydrationMount: false, route: '/' },
      { uid: 8, name: 'BetaBanner', file: 'BetaBanner.vue', mountCount: 1, rerenders: 1, totalMs: 7, avgMs: 7, triggers: [{ key: 'flag', type: 'ref', timestamp: Date.now() - 6500 }], timeline: [], isPersistent: false, isHydrationMount: false, route: '/' },
    ],
    transitions: [
      { id: 't1', transitionName: 'fade', parentComponent: 'App', direction: 'enter', phase: 'entered', startTime: Date.now() - 2000, endTime: Date.now() - 1500, durationMs: 500, cancelled: false, appear: false },
      { id: 't2', transitionName: 'slide', parentComponent: 'App', direction: 'leave', phase: 'interrupted', startTime: Date.now() - 3000, endTime: Date.now() - 2300, durationMs: 700, cancelled: false, appear: false },
      { id: 't3', transitionName: 'fade', parentComponent: 'App', direction: 'enter', phase: 'enter-cancelled', startTime: Date.now() - 4000, endTime: Date.now() - 3900, durationMs: 100, cancelled: true, appear: false },
      { id: 't4', transitionName: 'slide', parentComponent: 'App', direction: 'leave', phase: 'left', startTime: Date.now() - 5000, endTime: Date.now() - 4800, durationMs: 200, cancelled: false, appear: false },
      { id: 't5', transitionName: 'fade', parentComponent: 'App', direction: 'enter', phase: 'entering', startTime: Date.now() - 100, cancelled: false, appear: false },
      { id: 't6', transitionName: 'zoom', parentComponent: 'App', direction: 'enter', phase: 'entered', startTime: Date.now() - 6000, endTime: Date.now() - 5900, durationMs: 100, cancelled: false, appear: true },
      { id: 't7', transitionName: 'zoom', parentComponent: 'App', direction: 'leave', phase: 'leave-cancelled', startTime: Date.now() - 7000, endTime: Date.now() - 6900, durationMs: 100, cancelled: true, appear: false },
    ],
  },
};

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  for (const tab of screenshots) {
    await page.goto(BASE_URL + tab.path);
    // Wait for SPA to load/render
    await page.waitForTimeout(1000);
    // Inject mock data after navigation
    await page.evaluate((data) => {
      window.dispatchEvent(new MessageEvent('message', { data }));
    }, mockData);
    // Wait for UI to update
    await page.waitForTimeout(800);
    // Select the correct element for each tab to show details
    if (tab.name === 'fetch-dashboard') {
      await page.evaluate(() => {
        const firstRow = document.querySelector('.data-table tbody tr');
        if (firstRow) firstRow.click();
      });
      await page.waitForTimeout(200);
    } else if (tab.name === 'provide-inject-graph') {
      await page.evaluate(() => {
        const firstNode = document.querySelector('.graph-node');
        if (firstNode) firstNode.click();
      });
      await page.waitForTimeout(200);
    } else if (tab.name === 'composable-tracker') {
      await page.evaluate(() => {
        const firstRow = document.querySelector('.composable-row, .data-table tbody tr');
        if (firstRow) firstRow.click();
      });
      await page.waitForTimeout(200);
    } else if (tab.name === 'render-heatmap') {
      // Wait for the .tree-row to appear
      await page.waitForSelector('.tree-row', { timeout: 2000 });
      await page.evaluate(() => {
        const firstTreeRow = document.querySelector('.tree-row');
        if (firstTreeRow) firstTreeRow.click();
      });
      await page.waitForTimeout(400);
    } else if (tab.name === 'transition-tracker') {
      await page.evaluate(() => {
        const firstRow = document.querySelector('.transition-row, .data-table tbody tr');
        if (firstRow) firstRow.click();
      });
      await page.waitForTimeout(200);
    }
    // Save screenshot
    await page.screenshot({ path: path.resolve(tab.file), fullPage: true });
    console.log(`Saved screenshot: ${tab.file}`);
  }

  await browser.close();
})();
