import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export type TTheme = 'light' | 'dark' | 'system'
export type TLocale = 'en' | 'fr' | 'de' | 'ja'

export interface IUserPreferences {
    theme: TTheme
    locale: TLocale
    notifications: boolean
    compactView: boolean
    currency: string
}

export const useUserStore = defineStore('user', () => {
    const preferences = ref<IUserPreferences>({
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

    function setTheme(theme: TTheme) {
        preferences.value.theme = theme
    }

    function setLocale(locale: TLocale) {
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
