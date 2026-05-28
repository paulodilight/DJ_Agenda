import { createClient } from '@supabase/supabase-js'

// ── Cliente principal — DJ Schedule ─────────────────────────────────────────
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Variáveis de ambiente Supabase em falta. Verifica o ficheiro .env')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
  },
})

// ── Cliente supa_eventos — dashboard Ivo ─────────────────────────────────────
const supaEventosUrl = import.meta.env.VITE_SUPA_EVENTOS_URL
const supaEventosKey = import.meta.env.VITE_SUPA_EVENTOS_KEY

if (!supaEventosUrl || !supaEventosKey) {
  throw new Error('Variáveis de ambiente supa_eventos em falta. Verifica o ficheiro .env')
}

export const supaEventos = createClient(supaEventosUrl, supaEventosKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
    detectSessionInUrl: false,
    storageKey: 'supa-eventos-auth',
  },
})
