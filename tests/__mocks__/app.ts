// Minimal stub for Nuxt's '#app' virtual module used in unit tests.
// Only the subset required by the tested source files is exported here.
export function useRuntimeConfig() {
    return { public: { observatory: {} } }
}
