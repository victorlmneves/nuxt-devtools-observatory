export interface ObservatoryExportFile<T> {
    type: 'observatory-traces' | 'observatory-renders'
    version: '1'
    exportedAt: number
    count: number
    data: T[]
}

export function exportJson(filename: string, envelope: ObservatoryExportFile<unknown>): void {
    const json = JSON.stringify(envelope, null, 2)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = filename
    anchor.click()
    URL.revokeObjectURL(url)
}

export function importJson(): Promise<unknown> {
    return new Promise((resolve, reject) => {
        const input = document.createElement('input')
        input.type = 'file'
        input.accept = '.json,application/json'

        input.addEventListener('change', () => {
            const file = input.files?.[0]

            if (!file) {
                reject(new Error('No file selected'))
                return
            }

            const reader = new FileReader()

            reader.addEventListener('load', () => {
                try {
                    resolve(JSON.parse(reader.result as string))
                } catch {
                    reject(new Error('Invalid JSON file'))
                }
            })

            reader.addEventListener('error', () => reject(new Error('Failed to read file')))
            reader.readAsText(file)
        })

        // Reject if the dialog is cancelled (focus returns without a change event)
        window.addEventListener(
            'focus',
            () => {
                setTimeout(() => {
                    if (!input.files?.length) {
                        reject(new Error('cancelled'))
                    }
                }, 300)
            },
            { once: true }
        )

        input.click()
    })
}
