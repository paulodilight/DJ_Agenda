import { clsx } from 'clsx'

const variantes = {
  confirmado: 'bg-status-confirmado/10 text-status-confirmado border-status-confirmado/20',
  proposta:   'bg-status-proposta/10 text-status-proposta border-status-proposta/20',
  cancelado:  'bg-status-cancelado/10 text-status-cancelado border-status-cancelado/20',
  lock:       'bg-status-lock/10 text-status-lock border-status-lock/20',
  ban:        'bg-status-cancelado/10 text-status-cancelado border-status-cancelado/20',
  swap:       'bg-purple-500/10 text-purple-400 border-purple-500/20',
  tier1:      'bg-surface-4 text-accent-muted border-border',
  tier2:      'bg-sky-500/10 text-sky-400 border-sky-500/20',
  tier3:      'bg-violet-500/10 text-violet-400 border-violet-500/20',
  tier4:      'bg-amber-500/10 text-amber-400 border-amber-500/20',
  tier5:      'bg-rose-500/10 text-rose-400 border-rose-500/20',
  default:    'bg-surface-3 text-accent-muted border-border',
}

/**
 * @param {{ variante?: keyof variantes } & React.HTMLAttributes<HTMLSpanElement>} props
 */
export function Badge({ variante = 'default', children, className }) {
  return (
    <span className={clsx(
      'inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border',
      variantes[variante] ?? variantes.default,
      className
    )}>
      {children}
    </span>
  )
}
