import { clsx } from 'clsx'

const variantes = {
  primary: 'bg-white text-black hover:bg-white/90 font-medium',
  secondary: 'bg-surface-3 text-accent border border-border hover:bg-surface-4',
  ghost: 'text-accent-muted hover:text-accent hover:bg-surface-2',
  danger: 'bg-status-cancelado/10 text-status-cancelado border border-status-cancelado/30 hover:bg-status-cancelado/20',
}

const tamanhos = {
  sm: 'px-3 py-1.5 text-xs',
  md: 'px-4 py-2 text-sm',
  lg: 'px-5 py-2.5 text-sm',
}

/**
 * @param {{ variante?: keyof variantes, tamanho?: keyof tamanhos, loading?: boolean } & React.ButtonHTMLAttributes<HTMLButtonElement>} props
 */
export function Button({ variante = 'secondary', tamanho = 'md', loading, children, className, disabled, ...props }) {
  return (
    <button
      className={clsx(
        'inline-flex items-center gap-2 rounded transition-colors duration-150 disabled:opacity-40 disabled:cursor-not-allowed',
        variantes[variante],
        tamanhos[tamanho],
        className
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading && (
        <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
        </svg>
      )}
      {children}
    </button>
  )
}
