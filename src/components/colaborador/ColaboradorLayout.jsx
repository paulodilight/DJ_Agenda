import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { LogOut, Home, CalendarDays, ClipboardList, LayoutList, KeyRound, Sun, Moon, AlertTriangle, ListChecks } from 'lucide-react'
import { clsx } from 'clsx'
import { useState, useEffect } from 'react'
import { useColaboradorStore } from '@/store'
import { Avatar } from './Avatar'
import { ModalAlterarPin } from './ModalAlterarPin'
import { BotaoNotificacoes } from './BotaoNotificacoes'
import { registarSW, limparBadge } from '@/lib/push'

// Mostra o header (logo) e a navegação. Só os esconde em telemóvel DEITADO
// (landscape pequeno) para não tapar conteúdo. No computador e no telemóvel
// em pé, ficam sempre visíveis.
const useMostrarChrome = () => {
  const isMobileDevice = () =>
    typeof window !== 'undefined' && window.innerWidth < 1024
  const calc = () => {
    if (typeof window === 'undefined') return true
    if (!isMobileDevice()) return true // desktop: mostrar sempre
    return !(window.innerWidth > window.innerHeight) // mobile: esconder em landscape
  }
  const [mostrar, setMostrar] = useState(calc)
  useEffect(() => {
    const fn = () => setMostrar(calc())
    window.addEventListener('resize', fn)
    window.addEventListener('orientationchange', () => setTimeout(fn, 100))
    return () => { window.removeEventListener('resize', fn); window.removeEventListener('orientationchange', fn) }
  }, [])
  return mostrar
}

const navItens = [
  { to: '/apoiot',          fim: true, rotulo: 'Início',  Icone: Home },
  { to: '/apoiot/agenda',              rotulo: 'Agenda',  Icone: LayoutList },
  { to: '/apoiot/eventos',             rotulo: 'Eventos', Icone: CalendarDays },
  { to: '/apoiot/tarefas',             rotulo: 'Tarefas',     Icone: ClipboardList },
  { to: '/apoiot/ocorrencias',         rotulo: 'Ocorrências', Icone: AlertTriangle },
]

function LogoXclusive() {
  return (
    <div className="flex items-center gap-2">
      <img src="/logo-apoiot.png" alt="Xclusive TS" className="w-8 h-8 object-contain" />
    </div>
  )
}

export function ColaboradorLayout() {
  const { colaborador, sair } = useColaboradorStore()
  const navigate  = useNavigate()
  const mostrarChrome = useMostrarChrome()
  const [modalPin, setModalPin] = useState(false)
  const [lightMode, setLightMode] = useState(() => localStorage.getItem('collab-theme') === 'light')

  const toggleTheme = () => {
    setLightMode(v => {
      const next = !v
      localStorage.setItem('collab-theme', next ? 'light' : 'dark')
      // aplica no root para que os fixed (modais) também herdem
      if (next) document.documentElement.classList.add('light-mode')
      else       document.documentElement.classList.remove('light-mode')
      return next
    })
  }

  // sincronizar tema no mount
  useEffect(() => {
    if (lightMode) document.documentElement.classList.add('light-mode')
    else           document.documentElement.classList.remove('light-mode')
    return () => document.documentElement.classList.remove('light-mode')
  }, [])

  // trocar manifest e apple-touch-icon para o ícone TS quando na área apoiot
  useEffect(() => {
    const manifestEl = document.querySelector('link[rel="manifest"]')
    const touchIconEl = document.querySelector('link[rel="apple-touch-icon"]')
    const prevManifest = manifestEl?.getAttribute('href')
    const prevIcon = touchIconEl?.getAttribute('href')
    if (manifestEl) manifestEl.setAttribute('href', '/manifest-apoiot.json')
    if (touchIconEl) touchIconEl.setAttribute('href', '/logo-apoiot.png')
    return () => {
      if (manifestEl) manifestEl.setAttribute('href', prevManifest || '/manifest.json')
      if (touchIconEl) touchIconEl.setAttribute('href', prevIcon || '/logo-x.png')
    }
  }, [])

  // registar o service worker e limpar o badge do ícone sempre que a app
  // ganha foco (o técnico "viu" as novidades)
  useEffect(() => {
    registarSW()
    limparBadge()
    const onFocus = () => { if (document.visibilityState === 'visible') limparBadge() }
    document.addEventListener('visibilitychange', onFocus)
    window.addEventListener('focus', onFocus)
    return () => {
      document.removeEventListener('visibilitychange', onFocus)
      window.removeEventListener('focus', onFocus)
    }
  }, [])

  const logout = () => {
    sair()
    navigate('/apoiot/login', { replace: true })
  }

  return (
    <div className={clsx(
      'bg-surface-0 text-accent flex flex-col',
      mostrarChrome ? 'min-h-screen' : 'h-dvh overflow-hidden'
    )}>

      {/* ── Header: logo + acções ── */}
      <header className={clsx(
        'sticky top-0 z-30 bg-surface-1/90 backdrop-blur border-b border-border',
        !mostrarChrome && 'hidden'
      )}>
        {/* Safe area top — espaço transparente acima do logo */}
        <div style={{ height: 'max(env(safe-area-inset-top, 0px), 6px)' }} />
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <NavLink to="/apoiot">
            <LogoXclusive />
          </NavLink>

          <div className="flex items-center gap-2">
            <div className="hidden sm:flex items-center gap-2 mr-1">
              <Avatar nome={colaborador?.nome} foto={colaborador?.foto_url} tamanho="sm" />
              <span className="text-xs text-accent-muted">{colaborador?.nome}</span>
            </div>
            <button onClick={toggleTheme} title={lightMode ? 'Modo escuro' : 'Modo claro'}
              className="flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-accent-subtle hover:text-amber-400 hover:border-amber-400/40 transition-colors">
              {lightMode ? <Moon size={13} /> : <Sun size={13} />}
              <span>{lightMode ? 'Noite' : 'Dia'}</span>
            </button>
            <button onClick={() => setModalPin(true)} title="Alterar PIN"
              className="flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-accent-subtle hover:text-amber-400 hover:border-amber-400/40 transition-colors">
              <KeyRound size={13} />
              <span>PIN</span>
            </button>
            <button onClick={logout} title="Sair"
              className="flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-accent-subtle hover:text-red-400 hover:border-red-400/40 transition-colors">
              <LogOut size={13} />
              <span>Sair</span>
            </button>
          </div>
        </div>
      </header>

      {/* ── Conteúdo ── */}
      <main className={clsx(
        'flex-1 max-w-5xl w-full mx-auto px-4 py-4',
        mostrarChrome ? 'pb-20' : 'pb-0 py-0 px-0 max-w-none'
      )}>
        <Outlet />
      </main>

      {/* ── Nav inferior ── */}
      <nav className={clsx(
        'fixed bottom-0 left-0 right-0 z-30 bg-surface-1/95 backdrop-blur border-t border-border',
        !mostrarChrome && 'hidden'
      )}>
        <div className="max-w-5xl mx-auto flex items-center justify-around px-2 py-1">
          {navItens.map(({ to, fim, rotulo, Icone }) => (
            <NavLink key={to} to={to} end={fim}
              className={({ isActive }) =>
                clsx(
                  'flex flex-col items-center gap-0.5 px-4 py-2 transition-colors',
                  isActive ? 'text-amber-400' : 'text-accent-subtle hover:text-accent',
                )
              }>
              <Icone size={24} />
              <span className="text-[10px] font-medium">{rotulo}</span>
            </NavLink>
          ))}
        </div>
        {/* Safe area bottom — espaço transparente abaixo do menu */}
        <div style={{ height: 'max(env(safe-area-inset-bottom, 0px), 6px)' }} />
      </nav>

      {modalPin && <ModalAlterarPin onFechar={() => setModalPin(false)} />}
    </div>
  )
}
