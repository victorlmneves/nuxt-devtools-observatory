function randomUnit(): number {
    const values = new Uint32Array(1)

    crypto.getRandomValues(values)

    return values[0] / 0x1_0000_0000
}

/**
 * Returns random analytics stats — used by the dashboard page's polling demo.
 * Each call returns fresh random data to make the charts visually interesting.
 */
export default defineEventHandler(() => {
    const now = Date.now()

    return {
        timestamp: now,
        activeUsers: Math.floor(randomUnit() * 500) + 50,
        pageViews: Math.floor(randomUnit() * 2000) + 300,
        conversionRate: +(randomUnit() * 0.08 + 0.01).toFixed(4),
        revenue: +(randomUnit() * 4000 + 500).toFixed(2),
        topPages: [
            { path: '/shop', views: Math.floor(randomUnit() * 800) + 100 },
            { path: '/', views: Math.floor(randomUnit() * 600) + 80 },
            { path: '/dashboard', views: Math.floor(randomUnit() * 300) + 40 },
            { path: '/settings', views: Math.floor(randomUnit() * 200) + 20 },
        ],
    }
})
