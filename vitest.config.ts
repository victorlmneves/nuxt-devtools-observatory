import { defineConfig } from 'vitest/config'

// Vite's `define` option does not reliably replace `import.meta.*` properties.
// A transform plugin ensures the replacement is applied to every processed file.
const importMetaShim = {
    name: 'nuxt-test-meta-shim',
    enforce: 'pre' as const,
    transform(code: string, id: string) {
        if (id.includes('node_modules')) {
            return null
        }

        if (!id.endsWith('.ts') && !id.endsWith('.vue')) {
            return null
        }

        const next = code
            .replace(/\bimport\.meta\.dev\b/g, 'true')
            .replace(/\bimport\.meta\.client\b/g, 'true')
            .replace(/\bimport\.meta\.server\b/g, 'false')

        return next !== code ? { code: next } : null
    },
}

export default defineConfig({
    plugins: [importMetaShim],
    test: {
        include: ['tests/**/*.test.ts'],
        coverage: {
            provider: 'v8',
            include: ['src/transforms/**', 'src/runtime/**', 'src/nitro/**'],
        },
    },
})
