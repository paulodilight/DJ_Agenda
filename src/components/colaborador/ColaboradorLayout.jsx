import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { LogOut, Home, CalendarDays, ClipboardList, LayoutList, KeyRound, Sun, Moon } from 'lucide-react'
import { clsx } from 'clsx'
import { useState, useEffect } from 'react'
import { useColaboradorStore } from '@/store'
import { Avatar } from './Avatar'
import { ModalAlterarPin } from './ModalAlterarPin'

const usePortrait = () => {
  const [portrait, setPortrait] = useState(
    () => typeof window === 'undefined' || window.innerWidth <= window.innerHeight
  )
  useEffect(() => {
    const fn = () => setPortrait(window.innerWidth <= window.innerHeight)
    window.addEventListener('resize', fn)
    window.addEventListener('orientationchange', fn)
    return () => { window.removeEventListener('resize', fn); window.removeEventListener('orientationchange', fn) }
  }, [])
  return portrait
}

const navItens = [
  { to: '/colaborador',          fim: true, rotulo: 'Início',  Icone: Home },
  { to: '/colaborador/agenda',              rotulo: 'Agenda',  Icone: LayoutList },
  { to: '/colaborador/eventos',             rotulo: 'Eventos', Icone: CalendarDays },
  { to: '/colaborador/tarefas',             rotulo: 'Tarefas', Icone: ClipboardList },
]

function LogoXclusive() {
  return (
    <div className="flex items-center gap-2">
      <img src="https://xclusive-dj-app.vercel.app/logo-x.png" alt="Xclusive" className="w-8 h-8 object-contain" />
      <span className="text-sm font-bold tracking-widest text-accent uppercase">Clusive</span>
    </div>
  )
}

export function ColaboradorLayout() {
  const { colaborador, sair } = useColaboradorStore()
  const navigate  = useNavigate()
  const portrait  = usePortrait()
  const [modalPin, setModalPin] = useState(false)
  const [lightMode, setLightMode] = useState(() => localStorage.getItem('collab-theme') === 'light')

  const toggleTheme = () => {
    setLightMode(v => {
      const next = !v
      localStorage.setItem('collab-theme', next ? 'light' : 'dark')
      return next
    })
  }

  const logout = () => {
    sair()
    navigate('/colaborador/login', { replace: true })
  }

  return (
    <div className={clsx('min-h-screen bg-surface-0 text-accent flex flex-col', lightMode && 'light-mode')}>

      {/* ── Header: logo + acções ── */}
      <header className={clsx(
        'sticky top-0 z-30 bg-surface-1/90 backdrop-blur border-b border-border transition-transform duration-300',
        !portrait && '-translate-y-full pointer-events-none'
      )}>
        {/* Safe area top — espaço transparente acima do logo */}
        <div style={{ height: 'max(env(safe-area-inset-top, 0px), 6px)' }} />
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <NavLink to="/colaborador">
            <LogoXclusive />
          </NavLink>

          <div className="flex items-center gap-5">
            <div className="hidden sm:flex items-center gap-2">
              <Avatar nome={colaborador?.nome} foto={colaborador?.foto_url} tamanho="sm" />
              <span className="text-xs text-accent-muted">{colaborador?.nome}</span>
            </div>
            <button onClick={toggleTheme} title={lightMode ? 'Modo escuro' : 'Modo claro'}
              className="text-accent-subtle hover:text-amber-400 transition-colors p-1.5 rounded hover:bg-surface-2">
              {lightMode ? <Moon size={17} /> : <Sun size={17} />}
            </button>
            <button onClick={() => setModalPin(true)} title="Alterar PIN"
              className="text-accent-subtle hover:text-amber-400 transition-colors p-1.5 rounded hover:bg-surface-2">
              <KeyRound size={17} />
            </button>
            <button onClick={logout} title="Sair"
              className="text-accent-subtle hover:text-accent transition-colors p-1.5 rounded hover:bg-surface-2">
              <LogOut size={17} />
            </button>
          </div>
        </div>
      </header>

      {/* ── Conteúdo ── */}
      <main className={clsx(
        'flex-1 max-w-5xl w-full mx-auto px-4 py-4 transition-all duration-300',
        portrait ? 'pb-20' : 'pb-4'
      )}>
        <Outlet />
      </main>

      {/* ── Nav inferior ── */}
      <nav className={clsx(
        'fixed bottom-0 left-0 right-0 z-30 bg-surface-1/95 backdrop-blur border-t border-border transition-transform duration-300',
        !portrait && 'translate-y-full pointer-events-none'
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
