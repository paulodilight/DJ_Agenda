import { create } from 'zustand'
import { supabase } from '@/lib/supabase'

async function _carregarPermissoes(userId, set) {
  if (!userId) { set({ permissoes: null, utilizadorNome: null }); return }
  const { data } = await supabase
    .from('user_permissoes')
    .select('paginas, is_admin, nome')
    .eq('user_id', userId)
    .maybeSingle()
  set({
    permissoes: !data || data.is_admin ? null : (data.paginas ?? []),
    utilizadorNome: data?.nome ?? null,
  })
}

export const useAuthStore = create((set) => ({
  session: null,
  user: null,
  permissoes: null,      // null = admin (acesso total), array = páginas permitidas
  utilizadorNome: null,  // nome de exibição do utilizador
  loading: true,

  init: async () => {
    const { data: { session } } = await supabase.auth.getSession()
    set({ session, user: session?.user ?? null, loading: false })
    await _carregarPermissoes(session?.user?.id, set)

    supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        set({ session: null, user: null, recoveryMode: true, permissoes: null, utilizadorNome: null })
        window.location.hash = '/reset-password'
        return
      }
      set({ session, user: session?.user ?? null, recoveryMode: false })
      await _carregarPermissoes(session?.user?.id, set)
    })
  },

  logout: async () => {
    await supabase.auth.signOut()
    set({ session: null, user: null, permissoes: null, utilizadorNome: null })
  },
}))

export const useAppStore = create((set) => ({
  config: {},
  setConfig: (config) => set({ config }),

  headerAction: null,
  setHeaderAction: (action) => set({ headerAction: action }),
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
