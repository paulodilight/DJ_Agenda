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

// ─── Sessão do colaborador (app Apoio T — login por nome + PIN) ────────────────
const COLAB_KEY = 'colaborador-sessao'

function lerSessaoColab() {
  try { return JSON.parse(localStorage.getItem(COLAB_KEY)) } catch { return null }
}

export const useColaboradorStore = create((set) => ({
  colaborador: lerSessaoColab(), // { id, nome, foto_url } | null

  entrar: (colaborador) => {
    localStorage.setItem(COLAB_KEY, JSON.stringify(colaborador))
    set({ colaborador })
  },

  sair: () => {
    localStorage.removeItem(COLAB_KEY)
    set({ colaborador: null })
  },

  actualizarFoto: (foto_url) => set((s) => {
    if (!s.colaborador) return s
    const colaborador = { ...s.colaborador, foto_url }
    localStorage.setItem(COLAB_KEY, JSON.stringify(colaborador))
    return { colaborador }
  }),
}))
