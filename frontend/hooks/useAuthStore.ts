"use client"

import { create } from "zustand"
import { api, UserInfo } from "@/lib/api"

interface AuthStore {
  user: UserInfo | null
  loading: boolean
  refresh: () => Promise<void>
  clear: () => void
}

export const useAuthStore = create<AuthStore>((set) => ({
  user: null,
  loading: true,
  refresh: async () => {
    try {
      const user = await api.me.get()
      set({ user, loading: false })
    } catch {
      set({ user: null, loading: false })
    }
  },
  clear: () => set({ user: null, loading: false }),
}))
