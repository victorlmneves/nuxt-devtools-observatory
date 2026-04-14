import { startSpan } from '../tracing/tracing'

interface AsyncDataMeta {
    key: string
    file: string
    line: number
    originalFn?: string
}

type AnyFn = (...args: any[]) => any

function getNormalizedKey(key: unknown) {
    return typeof key === 'string' && key.length > 0 ? key : 'useAsyncData'
}

export function useTracedAsyncData<TFn extends AnyFn>(
    originalFn: TFn,
    args: unknown[],
    handlerIndex: number,
    key: unknown,
    meta: AsyncDataMeta
): ReturnType<TFn> {
    if (!import.meta.dev || !import.meta.client) {
        return originalFn(...(args as Parameters<TFn>)) as ReturnType<TFn>
    }

    const nextArgs = [...args]
    const originalHandler = nextArgs[handlerIndex]

    if (typeof originalHandler !== 'function') {
        return originalFn(...(args as Parameters<TFn>)) as ReturnType<TFn>
    }

    const normalizedKey = getNormalizedKey(key)

    nextArgs[handlerIndex] = (...handlerArgs: unknown[]) => {
        const span = startSpan({
            name: meta.originalFn ?? 'useAsyncData',
            type: 'fetch',
            metadata: {
                key: normalizedKey,
                status: 'pending',
                file: meta.file,
                line: meta.line,
                source: 'async-data',
            },
        })

        return Promise.resolve((originalHandler as AnyFn)(...handlerArgs))
            .then((result) => {
                span.end({
                    status: 'ok',
                    metadata: {
                        key: normalizedKey,
                        status: 'ok',
                    },
                })

                return result
            })
            .catch((error: unknown) => {
                span.end({
                    status: 'error',
                    metadata: {
                        key: normalizedKey,
                        status: 'error',
                        errorMessage: error instanceof Error ? error.message : String(error),
                    },
                })

                throw error
            })
    }

    return originalFn(...(nextArgs as Parameters<TFn>)) as ReturnType<TFn>
}
