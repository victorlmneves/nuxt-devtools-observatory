import { ref, watch, onUnmounted } from 'vue'
import { useUserStore, type Theme, type Locale } from '../stores/user'

/**
 * useUserPreferences — async-init composable wrapping the userStore.
 *
 * Demonstrates:
 *   - Async initialisation (simulated /api/user fetch delay)
 *   - A persistent watcher on preferences that is properly cleaned up
 *   - onUnmounted registering the cleanup
 *
 * The Composable Tracker should show:
 *   - status: mounted → unmounted on navigation away
 *   - watcherCount: 1
 *   - lifecycle.watchersCleaned: true
 * @returns {object} User preference state, async initialisation status, save state, and mutation helpers.
 */
export async function useUserPreferences() {
    const store = useUserStore()
    const isInitialising = ref(true)
    const saveStatus = ref<'idle' | 'saving' | 'saved' | 'error'>('idle')

    // Watcher: auto-save preferences changes — properly cleaned up.
    // Registered before the first await so Vue can associate it with the
    // current component instance even when this composable is used in async setup.
    const stopPrefWatch = watch(
        () => ({ ...store.preferences }),
        async () => {
            if (isInitialising.value) {
                return
            }

            saveStatus.value = 'saving'
            await new Promise((resolve) => setTimeout(resolve, 80))
            saveStatus.value = 'saved'

            setTimeout(() => {
                saveStatus.value = 'idle'
            }, 1200)
        },
        { deep: true }
    )

    onUnmounted(() => {
        stopPrefWatch()
    })

    // Simulate loading the user's preferences from a server on first use
    await new Promise<void>((resolve) => {
        setTimeout(() => {
            // Pretend we received user prefs from the server
            store.preferences.notifications = true
            store.preferences.compactView = false
            isInitialising.value = false
            resolve()
        }, 150)
    })

    function setTheme(theme: Theme) {
        store.setTheme(theme)
    }

    function setLocale(locale: Locale) {
        store.setLocale(locale)
    }

    function toggleNotifications() {
        store.toggleNotifications()
    }

    function toggleCompactView() {
        store.toggleCompactView()
    }

    return {
        preferences: store.preferences,
        displayName: store.displayName,
        formattedLocale: store.formattedLocale,
        isInitialising,
        saveStatus,
        setTheme,
        setLocale,
        toggleNotifications,
        toggleCompactView,
    }
}
