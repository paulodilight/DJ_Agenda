import { NavLink, Outlet } from 'react-router-dom'
import { LayoutDashboard, Users, Building2, Wrench, TrendingUp } from 'lucide-react'
import { clsx } from 'clsx'

const TABS = [
  { para: '/contas',               label: 'Dashboard',     icone: LayoutDashboard, end: true },
  { para: '/contas/djs',           label: 'DJs',           icone: Users },
  { para: '/contas/clientes',      label: 'Clientes',      icone: Building2 },
  { para: '/contas/colaboradores', label: 'Colaboradores', icone: Wrench },
  { para: '/contas/margens',       label: 'Margens',       icone: TrendingUp },
]

export function Contas() {
  return (
    <div className="flex flex-col h-full">

      {/* Tabs de navegação */}
      <div className="shrink-0 border-b border-border px-6 bg-surface-1">
        <div className="flex items-center gap-1">
          {TABS.map(tab => (
            <NavLink
              key={tab.para}
              to={tab.para}
              end={tab.end}
              className={({ isActive }) => clsx(
                'flex items-center gap-2 px-4 py-3 text-xs font-semibold uppercase tracking-wider border-b-2 transition-colors',
                isActive
                  ? 'border-status-confirmado text-status-confirmado'
                  : 'border-transparent text-accent-muted hover:text-accent hover:border-border'
              )}
            >
              <tab.icone size={13} />
              {tab.label}
            </NavLink>
          ))}
        </div>
      </div>

      {/* Conteúdo da sub-página */}
      <div className="flex-1 overflow-y-auto">
        <Outlet />
      </div>
    </div>
  )
}
