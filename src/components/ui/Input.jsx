import { clsx } from 'clsx'

/**
 * @param {{ label?: string, erro?: string } & React.InputHTMLAttributes<HTMLInputElement>} props
 */
export function Input({ label, erro, className, id, ...props }) {
  const inputId = id ?? label?.toLowerCase().replace(/\s+/g, '-')
  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={inputId} className="text-xs font-medium text-accent-muted">
          {label}
        </label>
      )}
      <input
        id={inputId}
        className={clsx(
          'bg-surface-2 border rounded px-3 py-2 text-sm text-accent placeholder:text-accent-subtle',
          'focus:outline-none focus:ring-1 focus:ring-white/20 focus:border-white/20 transition-colors',
          erro ? 'border-status-cancelado/50' : 'border-border',
          className
        )}
        {...props}
      />
      {erro && <p className="text-xs text-status-cancelado">{erro}</p>}
    </div>
  )
}

/**
 * @param {{ label?: string, erro?: string } & React.SelectHTMLAttributes<HTMLSelectElement>} props
 */
export function Select({ label, erro, className, id, children, ...props }) {
  const inputId = id ?? label?.toLowerCase().replace(/\s+/g, '-')
  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={inputId} className="text-xs font-medium text-accent-muted">
          {label}
        </label>
      )}
      <select
        id={inputId}
        className={clsx(
          'bg-surface-2 border rounded px-3 py-2 text-sm text-accent',
          'focus:outline-none focus:ring-1 focus:ring-white/20 focus:border-white/20 transition-colors',
          'appearance-none cursor-pointer',
          erro ? 'border-status-cancelado/50' : 'border-border',
          className
        )}
        {...props}
      >
        {children}
      </select>
      {erro && <p className="text-xs text-status-cancelado">{erro}</p>}
    </div>
  )
}

/**
 * @param {{ label?: string, erro?: string } & React.TextareaHTMLAttributes<HTMLTextAreaElement>} props
 */
export function Textarea({ label, erro, className, id, ...props }) {
  const inputId = id ?? label?.toLowerCase().replace(/\s+/g, '-')
  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={inputId} className="text-xs font-medium text-accent-muted">
          {label}
        </label>
      )}
      <textarea
        id={inputId}
        rows={3}
        className={clsx(
          'bg-surface-2 border rounded px-3 py-2 text-sm text-accent placeholder:text-accent-subtle resize-none',
          'focus:outline-none focus:ring-1 focus:ring-white/20 focus:border-white/20 transition-colors',
          erro ? 'border-status-cancelado/50' : 'border-border',
          className
        )}
        {...props}
      />
      {erro && <p className="text-xs text-status-cancelado">{erro}</p>}
    </div>
  )
}
