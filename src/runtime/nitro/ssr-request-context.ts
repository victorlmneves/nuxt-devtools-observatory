/**
 * Per-request SSR Observatory context.
 *
 * A single `globalThis` slot races under concurrent Nitro requests. AsyncLocalStorage
 * keeps each request’s id and start time on that request’s async resource. `enterWith`
 * is used from Nitro hooks because they cannot wrap the rest of the request in `run`.
 *
 * `node:async_hooks` is loaded lazily so the client bundle does not need the module.
 */

export interface SsrRequestContext {
    __observatoryRequestId: string
    __ssrFetchStart: number
}

interface ContextStore {
    enterWith(value: SsrRequestContext | undefined): void
    getStore(): SsrRequestContext | undefined
    run<T>(value: SsrRequestContext, fn: () => T): T
}

function createContextStore(): ContextStore {
    if (typeof process !== 'undefined' && process.versions?.node) {
        try {
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            const { AsyncLocalStorage } = require('node:async_hooks') as typeof import('node:async_hooks')
            const als = new AsyncLocalStorage<SsrRequestContext>()

            return {
                enterWith(value) {
                    als.enterWith(value as SsrRequestContext)
                },
                getStore() {
                    return als.getStore()
                },
                run(value, fn) {
                    return als.run(value, fn)
                },
            }
        } catch {
            // Fall through to the process-local slot (tests / non-Node).
        }
    }

    let slot: SsrRequestContext | undefined

    return {
        enterWith(value) {
            slot = value
        },
        getStore() {
            return slot
        },
        run(value, fn) {
            const previous = slot
            slot = value

            try {
                return fn()
            } finally {
                slot = previous
            }
        },
    }
}

const store = createContextStore()

export function enterSsrRequestContext(context: SsrRequestContext): void {
    store.enterWith(context)
}

export function getSsrRequestContext(): SsrRequestContext | undefined {
    return store.getStore()
}

export function clearSsrRequestContext(requestId: string): void {
    const active = store.getStore()

    if (active?.__observatoryRequestId === requestId) {
        store.enterWith(undefined)
    }
}

export function runWithSsrRequestContext<T>(context: SsrRequestContext, fn: () => T): T {
    return store.run(context, fn)
}
