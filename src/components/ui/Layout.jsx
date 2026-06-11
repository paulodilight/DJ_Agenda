import { useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, Users, MapPin, CalendarDays, Zap, Ban,
  Settings, LogOut, Mic2, Bell, Music2, Scale, Send, Wallet,
  ChevronLeft, ChevronRight, PanelLeftClose, PanelLeftOpen, Star, Headphones, Guitar,
} from 'lucide-react'
import { useAuthStore, useMesStore } from '@/store'
import { UndoToast } from '@/components/ui/UndoToast'
import { clsx } from 'clsx'
import { format, addMonths } from 'date-fns'
import { pt } from 'date-fns/locale'

const ROTAS = [
  { path: '/',              label: 'Dashboard' },
  { path: '/distribuicao',  label: 'Distribuição' },
  { path: '/equilibrio',    label: 'Equilíbrio' },
  { path: '/agenda',        label: 'Agenda' },
  { path: '/eventos',       label: 'Eventos' },
  { path: '/atuacoes',      label: 'Atuações' },
  { path: '/comunicacao',   label: 'Comunicação' },
  { path: '/contas',        label: 'Contas' },
  { path: '/djs',           label: 'DJs' },
  { path: '/convidados',    label: 'DJ Convidados' },
  { path: '/artistas',      label: 'Artistas' },
  { path: '/espacos',       label: 'Clientes' },
  { path: '/bloqueios',     label: 'Bloqueios' },
  { path: '/apoio-tecnico', label: 'Apoio T.' },
  { path: '/configuracoes', label: 'Configurações' },
]

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1)
const tituloMes = (anoMes) => {
  const [ano, mes] = anoMes.split('-').map(Number)
  return cap(format(new Date(ano, mes - 1, 1), 'MMMM yyyy', { locale: pt }))
}


function labelContexto(anoMes) {
  const hoje = new Date()
  const corrente = format(hoje, 'yyyy-MM')
  const anterior = format(addMonths(hoje, -1), 'yyyy-MM')
  const seguinte = format(addMonths(hoje, 1), 'yyyy-MM')
  if (anoMes === corrente) return 'mês actual'
  if (anoMes === anterior) return 'mês anterior'
  if (anoMes === seguinte) return 'próximo mês'
  const diff = (Number(anoMes.replace('-','')) - Number(corrente.replace('-','')))
  return diff > 0 ? 'preparação' : 'histórico'
}

const navPrincipal = [
  { para: '/',              icone: LayoutDashboard, label: 'Dashboard' },
  { para: '/distribuicao',  icone: Zap,             label: 'Distribuição' },
  { para: '/equilibrio',    icone: Scale,           label: 'Equilíbrio' },
  { para: '/agenda',        icone: CalendarDays,    label: 'Agenda' },
  { para: '/eventos',       icone: Star,            label: 'Eventos' },
  { para: '/comunicacao',   icone: Send,            label: 'Comunicação' },
  { para: '/contas',        icone: Wallet,          label: 'Contas' },
  { para: '/apoio-tecnico', icone: Headphones,      label: 'Apoio T.' },
]

const navGestao = [
  { para: '/atuacoes',      icone: Mic2,    label: 'Atuações' },
  { para: '/djs',           icone: Users,   label: 'DJs' },
  { para: '/convidados',    icone: Star,    label: 'DJ Convidados' },
  { para: '/artistas',      icone: Guitar,  label: 'Artistas' },
  { para: '/espacos',       icone: MapPin,  label: 'Clientes' },
  { para: '/bloqueios',     icone: Ban,     label: 'Bloqueios' },
]

function NavItem({ para, icone: Icone, label, collapsed }) {
  return (
    <NavLink
      to={para}
      end={para === '/'}
      title={collapsed ? label : undefined}
      className={({ isActive }) => clsx(
        'flex items-center rounded text-xs tracking-wider transition-all',
        collapsed ? 'justify-center px-0 py-2' : 'gap-3 px-3 py-2',
        isActive
          ? 'bg-status-confirmado/15 text-status-confirmado font-semibold'
          : 'text-accent-muted hover:text-accent hover:bg-surface-2'
      )}
    >
      <Icone size={15} />
      {!collapsed && <span className="uppercase">{label}</span>}
    </NavLink>
  )
}

export function Layout() {
  const logout = useAuthStore((s) => s.logout)
  const { anoMes, navegar, setAnoMes } = useMesStore()
  const location = useLocation()
  const [collapsed, setCollapsed] = useState(false)

  const paginaLabel = ROTAS.find((r) =>
    r.path === '/' ? location.pathname === '/' : location.pathname.startsWith(r.path)
  )?.label ?? ''

  const mesCorrente = format(new Date(), 'yyyy-MM')
  const eCorrente = anoMes === mesCorrente
  const contexto = labelContexto(anoMes)

  return (
    <div className="flex h-screen bg-surface-0 text-accent overflow-hidden">

      {/* ── Sidebar ── */}
      <aside className={clsx(
        'shrink-0 flex flex-col border-r border-border bg-surface-1 transition-all duration-200',
        collapsed ? 'w-14' : 'w-60'
      )}>

        {/* Logo + botão colapsar */}
        <div className={clsx('border-b border-border', collapsed ? 'px-0 py-3' : 'px-5 py-5')}>
          {collapsed ? (
            <div className="flex flex-col items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-status-confirmado/20 flex items-center justify-center">
                <Music2 size={14} className="text-status-confirmado" />
              </div>
              <button
                onClick={() => setCollapsed(false)}
                title="Expandir menu"
                className="p-1 rounded text-accent-subtle hover:text-accent hover:bg-surface-2 transition-colors"
              >
                <PanelLeftOpen size={13} />
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-status-confirmado/20 flex items-center justify-center shrink-0">
                  <Music2 size={16} className="text-status-confirmado" />
                </div>
                <div>
                  <p className="text-sm font-bold tracking-tight text-accent leading-none">LMD DJ Schedule</p>
                  <p className="text-[10px] text-accent-subtle mt-0.5">Gestão de eventos</p>
                </div>
              </div>
              <button
                onClick={() => setCollapsed(true)}
                title="Ocultar menu"
                className="p-1 rounded text-accent-subtle hover:text-accent hover:bg-surface-2 transition-colors shrink-0"
              >
                <PanelLeftClose size={13} />
              </button>
            </div>
          )}
        </div>

        {/* User */}
        <div className={clsx('border-b border-border/50', collapsed ? 'px-0 py-3 flex justify-center' : 'px-4 py-4')}>
          {collapsed ? (
            <div className="w-8 h-8 rounded-full bg-surface-3 flex items-center justify-center text-xs font-bold text-accent border border-border" title="Admin">
              A
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-surface-3 flex items-center justify-center text-sm font-bold text-accent border border-border shrink-0">
                A
              </div>
              <div>
                <p className="text-xs font-semibold text-accent leading-none">Admin</p>
                <div className="flex items-center gap-1.5 mt-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-status-confirmado inline-block" />
                  <p className="text-[10px] text-accent-subtle">Online</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Nav */}
        <nav className={clsx('flex-1 py-4 flex flex-col gap-5 overflow-y-auto', collapsed ? 'px-1' : 'px-2')}>
          <div>
            {!collapsed && (
              <p className="px-3 mb-2 text-[10px] font-semibold text-accent-subtle uppercase tracking-widest">
                Principal
              </p>
            )}
            <div className="flex flex-col gap-0.5">
              {navPrincipal.map((item) => <NavItem key={item.para} {...item} collapsed={collapsed} />)}
            </div>
          </div>
          <div>
            {!collapsed && (
              <p className="px-3 mb-2 text-[10px] font-semibold text-accent-subtle uppercase tracking-widest">
                Gestão
              </p>
            )}
            {collapsed && <div className="border-t border-border/30 mx-2 mb-2" />}
            <div className="flex flex-col gap-0.5">
              {navGestao.map((item) => <NavItem key={item.para} {...item} collapsed={collapsed} />)}
            </div>
          </div>
        </nav>

        {/* Bottom */}
        <div className={clsx('py-3 border-t border-border flex flex-col gap-0.5', collapsed ? 'px-1' : 'px-2')}>
          <NavLink
            to="/configuracoes"
            title={collapsed ? 'Configurações' : undefined}
            className={({ isActive }) => clsx(
              'flex items-center rounded text-xs tracking-wider transition-all',
              collapsed ? 'justify-center px-0 py-2' : 'gap-3 px-3 py-2',
              isActive
                ? 'bg-status-confirmado/15 text-status-confirmado font-semibold'
                : 'text-accent-muted hover:text-accent hover:bg-surface-2'
            )}
          >
            <Settings size={15} />
            {!collapsed && <span className="uppercase">Configurações</span>}
          </NavLink>
          <button
            onClick={logout}
            title={collapsed ? 'Sair' : undefined}
            className={clsx(
              'flex items-center rounded text-xs tracking-wider text-accent-muted hover:text-accent hover:bg-surface-2 transition-colors w-full',
              collapsed ? 'justify-center px-0 py-2' : 'gap-3 px-3 py-2 text-left'
            )}
          >
            <LogOut size={15} />
            {!collapsed && <span className="uppercase">Sair</span>}
          </button>
        </div>
      </aside>

      {/* ── Right side ── */}
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* 1. Topo — título da página + seletor de mês (nas páginas relevantes) */}
        <header className="shrink-0 border-b border-border bg-surface-1 px-6 py-3 flex items-center justify-between gap-3">
          <h1 className="text-base font-bold text-accent uppercase tracking-widest">{paginaLabel}</h1>

          {/* Seletor de mês — apenas nas páginas que trabalham com mês */}
          {['/', '/distribuicao', '/equilibrio', '/agenda', '/eventos', '/comunicacao', '/contas', '/apoio-tecnico'].some(p =>
            p === '/' ? location.pathname === '/' : location.pathname.startsWith(p)
          ) && (
            <div className={clsx(
              'flex items-center gap-1 px-2 py-1 rounded-lg border transition-colors',
              eCorrente
                ? 'border-status-confirmado/30 bg-status-confirmado/8'
                : 'border-border bg-surface-2'
            )}>
              <button
                onClick={() => navegar(-1)}
                className="p-1 rounded text-accent-subtle hover:text-accent hover:bg-surface-2 transition-colors"
              >
                <ChevronLeft size={14} />
              </button>
              <span className={clsx(
                'text-base font-bold min-w-[140px] text-center capitalize tracking-wide',
                eCorrente ? 'text-status-confirmado' : 'text-accent'
              )}>
                {tituloMes(anoMes)}
              </span>
              <button
                onClick={() => navegar(1)}
                className="p-1 rounded text-accent-subtle hover:text-accent hover:bg-surface-2 transition-colors"
              >
                <ChevronRight size={14} />
              </button>
              {!eCorrente && (
                <button
                  onClick={() => setAnoMes(mesCorrente)}
                  className="ml-1 px-2 py-1 rounded border border-border bg-surface-3 text-accent-subtle hover:text-accent hover:border-white/20 transition-colors text-[11px] font-medium"
                >
                  Hoje
                </button>
              )}
            </div>
          )}

          {/* Bell + avatar */}
          <div className="flex items-center gap-3">
            <button className="relative p-1.5 rounded hover:bg-surface-2 text-accent-muted hover:text-accent transition-colors">
              <Bell size={14} />
              <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-status-cancelado" />
            </button>
            <div className="w-7 h-7 rounded-full bg-status-confirmado/20 flex items-center justify-center text-xs font-bold text-status-confirmado border border-status-confirmado/30 select-none">
              A
            </div>
          </div>
        </header>

        {/* Conteúdo */}
        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>

      {/* Undo global — visível em todas as páginas e modais */}
      <UndoToast />
    </div>
  )
}
