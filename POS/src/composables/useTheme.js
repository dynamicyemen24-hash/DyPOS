import { onBeforeUnmount, onMounted, ref } from "vue"
import {
  getThemePreferences,
  setThemeAccent,
  setThemeContrast,
  setThemeDensity,
  setThemeMode,
  resetThemePreferences,
  subscribeTheme,
} from "@/styles/theme-manager"

export function useTheme() {
  const preferences = ref(getThemePreferences())
  let unsubscribe = null

  onMounted(() => {
    unsubscribe = subscribeTheme((next) => {
      preferences.value = next
    })
  })

  onBeforeUnmount(() => {
    unsubscribe?.()
    unsubscribe = null
  })

  return {
    preferences,
    setMode: setThemeMode,
    setAccent: setThemeAccent,
    setDensity: setThemeDensity,
    setContrast: setThemeContrast,
    reset: resetThemePreferences,
  }
}

export default useTheme
