import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
    root: new URL('.', import.meta.url).pathname,
    base: '/',
    plugins: [vue()],
    build: {
        outDir: './dist',
        emptyOutDir: true,
    },
})
