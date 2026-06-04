import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { LogOut, Home, CalendarDays, ClipboardList, LayoutList, KeyRound } from 'lucide-react'
import { clsx } from 'clsx'
import { useState } from 'react'
import { useColaboradorStore } from '@/store'
import { Avatar } from './Avatar'
import { ModalAlterarPin } from './ModalAlterarPin'

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
  const navigate = useNavigate()
  const [modalPin, setModalPin] = useState(false)

  const logout = () => {
    sair()
    navigate('/colaborador/login', { replace: true })
  }

  return (
    <div className="min-h-screen bg-surface-0 text-accent flex flex-col">

      {/* ── Header: logo + acções ── */}
      <header className="sticky top-0 z-30 bg-surface-1/90 backdrop-blur border-b border-border">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <NavLink to="/colaborador">
            <LogoXclusive />
          </NavLink>

          <div className="flex items-center gap-5">
            <div className="hidden sm:flex items-center gap-2">
              <Avatar nome={colaborador?.nome} foto={colaborador?.foto_url} tamanho="sm" />
              <span className="text-xs text-accent-muted">{colaborador?.nome}</span>
            </div>
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
      <main className="flex-1 max-w-5xl w-full mx-auto px-4 py-4 pb-20">
        <Outlet />
      </main>

      {/* ── Nav inferior ── */}
      <nav className="fixed bottom-0 left-0 right-0 z-30 bg-surface-1/95 backdrop-blur border-t border-border">
        <div className="max-w-5xl mx-auto flex items-center justify-around px-2 py-1">
          {navItens.map(({ to, fim, rotulo, Icone }) => (
            <NavLink key={to} to={to} end={fim}
              className={({ isActive }) =>
                clsx(
                  'flex flex-col items-center gap-0.5 px-4 py-2 transition-colors',
                  isActive ? 'text-amber-400' : 'text-accent-subtle hover:text-accent',
                )
              }>
              <Icone size={20} />
              <span className="text-[10px] font-medium">{rotulo}</span>
            </NavLink>
          ))}
        </div>
      </nav>

      {modalPin && <ModalAlterarPin onFechar={() => setModalPin(false)} />}
    </div>
  )
}
