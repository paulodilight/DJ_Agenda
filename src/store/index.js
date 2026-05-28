import { create } from 'zustand'
import { supabase } from '@/lib/supabase'

export const useAuthStore = create((set) => ({
  session: null,
  user: null,
  loading: true,

  init: async () => {
    const { data: { session } } = await supabase.auth.getSession()
    set({ session, user: session?.user ?? null, loading: false })

    supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        // Redireciona para a página de reset sem gravar sessão normal
        set({ session: null, user: null, recoveryMode: true })
        window.location.hash = '/reset-password'
        return
      }
      set({ session, user: session?.user ?? null, recoveryMode: false })
    })
  },

  logout: async () => {
    await supabase.auth.signOut()
    set({ session: null, user: null })
  },
}))

export const useAppStore = create((set) => ({
  config: {},

  setConfig: (config) => set({ config }),
}))

// ─── Mês de trabalho global ───────────────────────────────────────────────────
import { format, addMonths } from 'date-fns'

export const useMesStore = create((set, get) => ({
  anoMes: format(new Date(), 'yyyy-MM'),

  setAnoMes: (anoMes) => set({ anoMes }),

  navegar: (dir) => {
    const [ano, mes] = get().anoMes.split('-').map(Number)
    set({ anoMes: format(addMonths(new Date(ano, mes - 1, 1), dir), 'yyyy-MM') })
  },
}))
