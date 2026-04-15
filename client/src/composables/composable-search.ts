import type { ComposableEntry } from '@observatory/types/snapshot'

const MAX_SEARCH_DEPTH = 6
const MAX_SEARCH_NODES = 1500

interface SearchBudget {
    nodes: number
}

function valueMatchesQuery(value: unknown, query: string, seen: WeakSet<object>, budget: SearchBudget, depth = 0): boolean {
    if (budget.nodes >= MAX_SEARCH_NODES) {
        return false
    }

    budget.nodes++

    if (value === null || value === undefined) {
        return false
    }

    const valueType = typeof value

    if (valueType === 'string' || valueType === 'number' || valueType === 'boolean' || valueType === 'bigint') {
        return String(value).toLowerCase().includes(query)
    }

    if (valueType !== 'object') {
        return false
    }

    if (depth >= MAX_SEARCH_DEPTH) {
        return false
    }

    const objectValue = value as object

    if (seen.has(objectValue)) {
        return false
    }

    seen.add(objectValue)

    if (Array.isArray(value)) {
        return value.some((item) => valueMatchesQuery(item, query, seen, budget, depth + 1))
    }

    if (value instanceof Map) {
        for (const [mapKey, mapValue] of value.entries()) {
            if (valueMatchesQuery(mapKey, query, seen, budget, depth + 1)) {
                return true
            }

            if (valueMatchesQuery(mapValue, query, seen, budget, depth + 1)) {
                return true
            }
        }

        return false
    }

    if (value instanceof Set) {
        for (const setValue of value.values()) {
            if (valueMatchesQuery(setValue, query, seen, budget, depth + 1)) {
                return true
            }
        }

        return false
    }

    try {
        const entries = Object.entries(value as Record<string, unknown>)

        for (const [key, nestedValue] of entries) {
            if (key.toLowerCase().includes(query)) {
                return true
            }

            if (valueMatchesQuery(nestedValue, query, seen, budget, depth + 1)) {
                return true
            }
        }
    } catch {
        // Ignore objects that throw on entry access and continue matching safely.
        return false
    }

    return false
}

/**
 * Returns true when a composable entry matches the search query.
 * Search scope includes name, file, ref keys, and nested reactive key/value content.
 */
export function matchesComposableEntryQuery(entry: ComposableEntry, query: string): boolean {
    const normalizedQuery = query.trim().toLowerCase()

    if (!normalizedQuery) {
        return true
    }

    if (entry.name.toLowerCase().includes(normalizedQuery)) {
        return true
    }

    if (entry.componentFile.toLowerCase().includes(normalizedQuery)) {
        return true
    }

    const seen = new WeakSet<object>()
    const budget: SearchBudget = { nodes: 0 }

    for (const [refKey, refInfo] of Object.entries(entry.refs)) {
        if (refKey.toLowerCase().includes(normalizedQuery)) {
            return true
        }

        if (valueMatchesQuery(refInfo.value, normalizedQuery, seen, budget)) {
            return true
        }
    }

    return false
}
