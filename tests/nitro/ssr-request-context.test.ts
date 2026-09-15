import { describe, expect, it } from 'vitest'
import {
    clearSsrRequestContext,
    enterSsrRequestContext,
    getSsrRequestContext,
    runWithSsrRequestContext,
} from '../../src/runtime/nitro/ssr-request-context'

describe('ssr request context', () => {
    it('isolates overlapping run() scopes', async () => {
        const seen: string[] = []

        await Promise.all([
            Promise.resolve().then(() =>
                runWithSsrRequestContext({ __observatoryRequestId: 'req-a', __ssrFetchStart: 1 }, () => {
                    seen.push(getSsrRequestContext()?.__observatoryRequestId ?? '')
                })
            ),
            Promise.resolve().then(() =>
                runWithSsrRequestContext({ __observatoryRequestId: 'req-b', __ssrFetchStart: 2 }, () => {
                    seen.push(getSsrRequestContext()?.__observatoryRequestId ?? '')
                })
            ),
        ])

        expect(seen.sort()).toEqual(['req-a', 'req-b'])
    })

    it('clears enterWith context only for the matching request id', () => {
        enterSsrRequestContext({ __observatoryRequestId: 'req-keep', __ssrFetchStart: 10 })
        clearSsrRequestContext('req-other')

        expect(getSsrRequestContext()?.__observatoryRequestId).toBe('req-keep')

        clearSsrRequestContext('req-keep')

        expect(getSsrRequestContext()).toBeUndefined()
    })
})
