import { computed, ref } from 'vue'
import type { ITraceEntry } from '@observatory/types/snapshot'

export function getSpanTypesFromTraces(traces: ITraceEntry[]): string[] {
    const types = new Set<string>()

    for (const trace of traces) {
        for (const span of trace.spans) {
            types.add(span.type)
        }
    }

    return Array.from(types).sort((left, right) => left.localeCompare(right))
}

function textIncludes(value: string, query: string): boolean {
    return value.toLowerCase().includes(query)
}

function spanMetadataIncludes(metadata: Record<string, unknown> | undefined, query: string): boolean {
    if (!metadata) {
        return false
    }

    return Object.values(metadata).some((value) => typeof value === 'string' && textIncludes(value, query))
}

function matchesSearch(trace: ITraceEntry, query: string): boolean {
    if (!query) {
        return true
    }

    const lowerQuery = query.toLowerCase()

    if (textIncludes(trace.name, lowerQuery)) {
        return true
    }

    return trace.spans.some((span) => textIncludes(span.name, lowerQuery) || spanMetadataIncludes(span.metadata, lowerQuery))
}

function matchesRouteFilter(trace: ITraceEntry, route: string): boolean {
    if (!route) {
        return true
    }

    const lowerRoute = route.toLowerCase()
    const traceRoute = trace.metadata?.route

    if (typeof traceRoute === 'string' && textIncludes(traceRoute, lowerRoute)) {
        return true
    }

    for (const span of trace.spans) {
        const spanRoute = span.metadata?.route
        const spanPath = span.metadata?.path

        if (typeof spanRoute === 'string' && textIncludes(spanRoute, lowerRoute)) {
            return true
        }

        if (typeof spanPath === 'string' && textIncludes(spanPath, lowerRoute)) {
            return true
        }
    }

    return false
}

export function useTraceFilter() {
    const searchQuery = ref<string>('')
    const selectedSpanTypes = ref<Set<string>>(new Set())
    const minDuration = ref<number>(0)
    const maxDuration = ref<number>(Number.POSITIVE_INFINITY)
    const routeFilter = ref<string>('')

    function matchesSpanTypeFilter(trace: ITraceEntry, types: Set<string>): boolean {
        if (types.size === 0) return true

        for (const span of trace.spans) {
            if (types.has(span.type)) {
                return true
            }
        }

        return false
    }

    function matchesDurationFilter(trace: ITraceEntry, min: number, max: number): boolean {
        const hasExplicitDurationFilter = min > 0 || max < Number.POSITIVE_INFINITY

        if (trace.durationMs === undefined) {
            return !hasExplicitDurationFilter
        }

        return trace.durationMs >= min && trace.durationMs <= max
    }

    function filterTraces(traces: ITraceEntry[]): ITraceEntry[] {
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
        maxDuration.value = Number.POSITIVE_INFINITY
        routeFilter.value = ''
    }

    const hasActiveFilters = computed(() => {
        return (
            searchQuery.value.length > 0 ||
            selectedSpanTypes.value.size > 0 ||
            minDuration.value > 0 ||
            maxDuration.value < Number.POSITIVE_INFINITY ||
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
