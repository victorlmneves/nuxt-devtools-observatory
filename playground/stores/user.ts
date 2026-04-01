import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export type Theme = 'light' | 'dark' | 'system'
export type Locale = 'en' | 'fr' | 'de' | 'ja'

export interface UserPreferences {
    theme: Theme
    locale: Locale
    notifications: boolean
    compactView: boolean
    currency: string
}

export const useUserStore = defineStore('user', () => {
    const preferences = ref<UserPreferences>({
        theme: 'light',
        locale: 'en',
        notifications: true,
        compactView: false,
        currency: 'USD',
    })

    const displayName = ref('Dev User')
    const isLoading = ref(false)

    const formattedLocale = computed(() =>
        new Intl.DisplayNames([preferences.value.locale], { type: 'language' }).of(preferences.value.locale)
    )

    function setTheme(theme: Theme) {
        preferences.value.theme = theme
    }

    function setLocale(locale: Locale) {
        preferences.value.locale = locale
    }

    function setCurrency(currency: string) {
        preferences.value.currency = currency
    }

    function toggleNotifications() {
        preferences.value.notifications = !preferences.value.notifications
    }

    function toggleCompactView() {
        preferences.value.compactView = !preferences.value.compactView
    }

    return {
        preferences,
        displayName,
        isLoading,
        formattedLocale,
        setTheme,
        setLocale,
        setCurrency,
        toggleNotifications,
        toggleCompactView,
    }
})
