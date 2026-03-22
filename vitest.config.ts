import { defineConfig } from 'vitest/config'

// Vite's `define` option does not reliably replace `import.meta.*` properties.
// A transform plugin ensures the replacement is applied to every processed file.
// NOTE: enforce is NOT set to 'pre'. With 'pre', this plugin runs before
// v8 coverage can instrument source files, causing files to show 0% coverage
// even when their tests all pass. Without 'pre', v8 instruments first, then
// this shim replaces import.meta.* — still works because the replacement is
// purely textual (regex) and survives instrumentation.
const importMetaShim = {
    name: 'nuxt-test-meta-shim',
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
            // plugin.ts requires a full Nuxt runtime and cannot be unit tested.
            // Excluding it prevents a misleading 0% entry in the coverage report.
            exclude: ['src/runtime/plugin.ts'],
            thresholds: {
                statements: 75,
                branches: 70,
                functions: 75,
                lines: 75,
            },
        },
    },
})
