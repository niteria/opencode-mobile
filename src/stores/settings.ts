import { create } from "zustand"
import * as SecureStore from "expo-secure-store"
import { type Category, defaultPreferences } from "../lib/notifications"
import { clampPageSize, mergeStoredSettings } from "../lib/settings-merge"
import { setAppLocale } from "../lib/i18n/config"
import type { LocalePreference } from "../lib/i18n/locale-resolve"

const SETTINGS_KEY = "opencode_settings"

interface Settings {
  groupSessions: boolean
  pageSize: number
  notifications: Record<Category, boolean>
  locale: LocalePreference
}

const DEFAULTS: Settings = {
  groupSessions: false,
  pageSize: 25,
  notifications: { ...defaultPreferences },
  locale: "system",
}

interface SettingsState extends Settings {
  setGroupSessions: (grouped: boolean) => Promise<void>
  loaded: boolean
  load: () => Promise<void>
  setPageSize: (size: number) => Promise<void>
  setNotification: (category: Category, enabled: boolean) => Promise<void>
  setLocale: (locale: LocalePreference) => Promise<void>
}

function snapshot(get: () => SettingsState): Settings {
  return { groupSessions: get().groupSessions, pageSize: get().pageSize, notifications: get().notifications, locale: get().locale }
}

async function persist(settings: Settings) {
  await SecureStore.setItemAsync(SETTINGS_KEY, JSON.stringify(settings))
}

export const useSettings = create<SettingsState>((set, get) => ({
  ...DEFAULTS,
  loaded: false,

  setGroupSessions: async (groupSessions) => {
    set({ groupSessions })
    await persist(snapshot(get))
  },

  load: async () => {
    const raw = await SecureStore.getItemAsync(SETTINGS_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Settings>
      // Merge stored settings with defaults so new fields/categories get their default
      const merged = mergeStoredSettings(DEFAULTS, parsed)
      set({ ...merged, loaded: true })
      setAppLocale(merged.locale)
      return
    }
    set({ loaded: true })
  },

  setPageSize: async (size) => {
    const clamped = clampPageSize(size)
    set({ pageSize: clamped })
    await persist({ ...snapshot(get), pageSize: clamped })
  },

  setNotification: async (category, enabled) => {
    const notifications = { ...get().notifications, [category]: enabled }
    set({ notifications })
    await persist({ ...snapshot(get), notifications })
  },

  setLocale: async (locale) => {
    set({ locale })
    setAppLocale(locale) // applies immediately
    await persist({ ...snapshot(get), locale })
  },
}))
