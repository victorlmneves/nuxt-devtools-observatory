import type { IComposableEntry } from '@observatory/types/snapshot'

const MAX_SEARCH_DEPTH = 6
const MAX_SEARCH_NODES = 1500

interface ISearchBudget {
    nodes: number
}

function isSearchPrimitive(value: unknown): value is string | number | boolean | bigint {
    const valueType = typeof value

    return valueType === 'string' || valueType === 'number' || valueType === 'boolean' || valueType === 'bigint'
}

function mapMatchesQuery(
    value: Map<unknown, unknown>,
    query: string,
    seen: WeakSet<object>,
    budget: ISearchBudget,
    depth: number
): boolean {
    for (const [mapKey, mapValue] of value.entries()) {
        if (valueMatchesQuery(mapKey, query, seen, budget, depth)) {
            return true
        }

        if (valueMatchesQuery(mapValue, query, seen, budget, depth)) {
            return true
        }
    }

    return false
}

function setMatchesQuery(value: Set<unknown>, query: string, seen: WeakSet<object>, budget: ISearchBudget, depth: number): boolean {
    for (const setValue of value.values()) {
        if (valueMatchesQuery(setValue, query, seen, budget, depth)) {
            return true
        }
    }

    return false
}

function recordMatchesQuery(value: object, query: string, seen: WeakSet<object>, budget: ISearchBudget, depth: number): boolean {
    try {
        for (const [key, nestedValue] of Object.entries(value)) {
            if (key.toLowerCase().includes(query)) {
                return true
            }

            if (valueMatchesQuery(nestedValue, query, seen, budget, depth)) {
                return true
            }
        }
    } catch {
        // Ignore objects that throw on entry access and continue matching safely.
        return false
    }

    return false
}

function valueMatchesQuery(value: unknown, query: string, seen: WeakSet<object>, budget: ISearchBudget, depth = 0): boolean {
    if (budget.nodes >= MAX_SEARCH_NODES) {
        return false
    }

    budget.nodes++

    if (value === null || value === undefined) {
        return false
    }

    if (isSearchPrimitive(value)) {
        return String(value).toLowerCase().includes(query)
    }

    if (typeof value !== 'object' || depth >= MAX_SEARCH_DEPTH || seen.has(value)) {
        return false
    }

    seen.add(value)

    const nextDepth = depth + 1

    if (Array.isArray(value)) {
        return value.some((item) => valueMatchesQuery(item, query, seen, budget, nextDepth))
    }

    if (value instanceof Map) {
        return mapMatchesQuery(value, query, seen, budget, nextDepth)
    }

    if (value instanceof Set) {
        return setMatchesQuery(value, query, seen, budget, nextDepth)
    }

    return recordMatchesQuery(value, query, seen, budget, nextDepth)
}

/**
 * Returns true when a composable entry matches the search query.
 * Search scope includes name, file, ref keys, and nested reactive key/value content.
 * @param {IComposableEntry} entry - Composable entry to inspect.
 * @param {string} query - Case-insensitive search query.
 * @returns {boolean} True when the entry matches the query.
 */
export function matchesComposableEntryQuery(entry: IComposableEntry, query: string): boolean {
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
    const budget: ISearchBudget = { nodes: 0 }

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
