import { computed, ref } from 'vue'
import type { TraceEntry } from '@observatory/types/snapshot'

export function getSpanTypesFromTraces(traces: TraceEntry[]): string[] {
    const types = new Set<string>()

    for (const trace of traces) {
        for (const span of trace.spans) {
            types.add(span.type)
        }
    }

    return Array.from(types).sort()
}

export function useTraceFilter() {
    const searchQuery = ref<string>('')
    const selectedSpanTypes = ref<Set<string>>(new Set())
    const minDuration = ref<number>(0)
    const maxDuration = ref<number>(Infinity)
    const routeFilter = ref<string>('')

    function matchesSearch(trace: TraceEntry, query: string): boolean {
        if (!query) {
            return true
        }

        const lowerQuery = query.toLowerCase()

        // Search in trace name
        if (trace.name.toLowerCase().includes(lowerQuery)) {
            return true
        }

        // Search in span names
        for (const span of trace.spans) {
            if (span.name.toLowerCase().includes(lowerQuery)) {
                return true
            }
        }

        // Search in metadata (e.g., route, URL endpoint)
        for (const span of trace.spans) {
            if (span.metadata) {
                for (const value of Object.values(span.metadata)) {
                    if (typeof value === 'string' && value.toLowerCase().includes(lowerQuery)) {
                        return true
                    }
                }
            }
        }

        return false
    }

    function matchesSpanTypeFilter(trace: TraceEntry, types: Set<string>): boolean {
        if (types.size === 0) return true

        for (const span of trace.spans) {
            if (types.has(span.type)) {
                return true
            }
        }

        return false
    }

    function matchesDurationFilter(trace: TraceEntry, min: number, max: number): boolean {
        const hasExplicitDurationFilter = min > 0 || max < Infinity

        if (trace.durationMs === undefined) {
            return !hasExplicitDurationFilter
        }

        return trace.durationMs >= min && trace.durationMs <= max
    }

    function matchesRouteFilter(trace: TraceEntry, route: string): boolean {
        if (!route) {
            return true
        }

        // Check trace metadata for route
        if (trace.metadata?.route && typeof trace.metadata.route === 'string') {
            if (trace.metadata.route.toLowerCase().includes(route.toLowerCase())) {
                return true
            }
        }

        // Check span metadata for route or path
        for (const span of trace.spans) {
            if (span.metadata?.route) {
                const routeValue = String(span.metadata.route).toLowerCase()

                if (routeValue.includes(route.toLowerCase())) {
                    return true
                }
            }

            if (span.metadata?.path) {
                const pathValue = String(span.metadata.path).toLowerCase()

                if (pathValue.includes(route.toLowerCase())) {
                    return true
                }
            }
        }

        return false
    }

    function filterTraces(traces: TraceEntry[]): TraceEntry[] {
        return traces.filter((trace) => {
            return (
                matchesSearch(trace, searchQuery.value) &&
                matchesSpanTypeFilter(trace, selectedSpanTypes.value) &&
                matchesDurationFilter(trace, minDuration.value, maxDuration.value) &&
                matchesRouteFilter(trace, routeFilter.value)
            )
        })
    }

    function toggleSpanType(type: string) {
        if (selectedSpanTypes.value.has(type)) {
            selectedSpanTypes.value.delete(type)
        } else {
            selectedSpanTypes.value.add(type)
        }
    }

    function clearFilters() {
        searchQuery.value = ''
        selectedSpanTypes.value.clear()
        minDuration.value = 0
        maxDuration.value = Infinity
        routeFilter.value = ''
    }

    const hasActiveFilters = computed(() => {
        return (
            searchQuery.value.length > 0 ||
            selectedSpanTypes.value.size > 0 ||
            minDuration.value > 0 ||
            maxDuration.value < Infinity ||
            routeFilter.value.length > 0
        )
    })

    return {
        searchQuery,
        selectedSpanTypes,
        minDuration,
        maxDuration,
        routeFilter,
        filterTraces,
        toggleSpanType,
        clearFilters,
        hasActiveFilters,
    }
}
