/**
 * Prevents the $fetch interceptor from recording a second dashboard row
 * for HTTP that is already tracked by the useFetch / useAsyncData shims.
 */

export const OBSERVATORY_FETCH_TRACKED = '__observatoryFetchTracked'

let nestedSuppressCount = 0

export function isObservatoryTrackedFetch(options?: Record<string, unknown>): boolean {
    return options?.[OBSERVATORY_FETCH_TRACKED] === true
}

export function markObservatoryTrackedFetch(options?: Record<string, unknown>): Record<string, unknown> {
    return {
        ...(options ?? {}),
        [OBSERVATORY_FETCH_TRACKED]: true,
    }
}

export function beginNestedFetchSuppress() {
    nestedSuppressCount++
}

export function endNestedFetchSuppress() {
    nestedSuppressCount = Math.max(0, nestedSuppressCount - 1)
}

export function isNestedFetchSuppressed() {
    return nestedSuppressCount > 0
}
