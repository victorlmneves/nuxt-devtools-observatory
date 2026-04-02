import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
    root: new URL('.', import.meta.url).pathname,
    // Served via sirv middleware at /__observatory on the Nuxt dev server (same-origin).
    // All asset paths must be relative to this base so the SPA loads correctly inside
    // the DevTools iframe without needing a separate dev server on a different port.
    base: '/__observatory/',
    plugins: [vue()],
    build: {
        outDir: './dist',
        emptyOutDir: true,
    },
})
