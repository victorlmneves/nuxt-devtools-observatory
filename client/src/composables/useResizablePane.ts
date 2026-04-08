import { ref, onBeforeUnmount } from 'vue'

/**
 * Adds drag-to-resize behaviour for a right-side detail panel.
 * The handle sits between the main area and the panel; dragging it
 * left/right adjusts the panel width.
 * @param {number} defaultWidth  Initial panel width in px.
 * @param {string} [storageKey]  Optional localStorage key to persist the width.
 * @returns {{ paneWidth: import('vue').Ref<number>, onHandleMouseDown: (e: MouseEvent) => void }} `paneWidth` ref (in px) and `onHandleMouseDown` event handler to attach to the resize handle element.
 */
export function useResizablePane(defaultWidth: number, storageKey?: string) {
    const stored = storageKey ? Number(localStorage.getItem(storageKey)) || defaultWidth : defaultWidth
    const paneWidth = ref(Math.max(160, Math.min(600, stored)))

    let dragging = false
    let startX = 0
    let startWidth = 0

    function onMouseMove(e: MouseEvent) {
        if (!dragging) {
            return
        }

        // Handle is on the LEFT edge of the panel → moving left increases width
        const delta = startX - e.clientX
        paneWidth.value = Math.max(160, Math.min(600, startWidth + delta))

        if (storageKey) {
            // eslint-disable-next-line
            localStorage.setItem(storageKey, String(paneWidth.value))
        }
    }

    function onMouseUp() {
        if (!dragging) {
            return
        }

        dragging = false
        document.removeEventListener('mousemove', onMouseMove)
        document.removeEventListener('mouseup', onMouseUp)
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
    }

    function onHandleMouseDown(e: MouseEvent) {
        e.preventDefault()
        dragging = true
        startX = e.clientX
        startWidth = paneWidth.value
        document.addEventListener('mousemove', onMouseMove)
        document.addEventListener('mouseup', onMouseUp)
        document.body.style.cursor = 'col-resize'
        document.body.style.userSelect = 'none'
    }

    onBeforeUnmount(() => {
        document.removeEventListener('mousemove', onMouseMove)
        document.removeEventListener('mouseup', onMouseUp)
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
    })

    return { paneWidth, onHandleMouseDown }
}
