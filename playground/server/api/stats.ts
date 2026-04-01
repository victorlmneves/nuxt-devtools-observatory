/**
 * Returns random analytics stats — used by the dashboard page's polling demo.
 * Each call returns fresh random data to make the charts visually interesting.
 */
export default defineEventHandler(() => {
    const now = Date.now()

    return {
        timestamp: now,
        activeUsers: Math.floor(Math.random() * 500) + 50,
        pageViews: Math.floor(Math.random() * 2000) + 300,
        conversionRate: +(Math.random() * 0.08 + 0.01).toFixed(4),
        revenue: +(Math.random() * 4000 + 500).toFixed(2),
        topPages: [
            { path: '/shop', views: Math.floor(Math.random() * 800) + 100 },
            { path: '/', views: Math.floor(Math.random() * 600) + 80 },
            { path: '/dashboard', views: Math.floor(Math.random() * 300) + 40 },
            { path: '/settings', views: Math.floor(Math.random() * 200) + 20 },
        ],
    }
})
