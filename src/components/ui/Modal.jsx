import { useEffect } from 'react'
import { X } from 'lucide-react'
import { clsx } from 'clsx'

/**
 * @param {{ aberto: boolean, onFechar: () => void, titulo?: string, largura?: string, children: React.ReactNode }} props
 */
export function Modal({ aberto, onFechar, titulo, largura = 'max-w-lg', children }) {
  useEffect(() => {
    if (!aberto) return
    const onKey = (e) => { if (e.key === 'Escape') onFechar() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [aberto, onFechar])

  if (!aberto) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onFechar} />
      <div className={clsx('relative bg-surface-1 border border-border rounded-lg shadow-2xl w-full flex flex-col max-h-[90vh]', largura)}>
        {titulo && (
          <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
            <h2 className="text-sm font-semibold text-accent">{titulo}</h2>
            <button onClick={onFechar} className="text-accent-subtle hover:text-accent transition-colors">
              <X size={16} />
            </button>
          </div>
        )}
        <div className="flex-1 overflow-y-auto min-h-0">
          {children}
        </div>
      </div>
    </div>
  )
}
