import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X, Printer } from 'lucide-react'

export function PrintModal({ aberto, onFechar, titulo, children }) {
  useEffect(() => {
    if (!aberto) return
    const s = document.createElement('style')
    s.id = 'pm-print'
    s.textContent = `@media print {
      body > *:not([data-pm]) { display:none!important; }
      [data-pm] { position:static!important; height:auto!important; overflow:visible!important; }
      [data-pm] > .pm-scroll { position:static!important; overflow:visible!important; padding:0!important; display:block!important; }
      [data-pm] > .pm-scroll > div { width:100%!important; max-width:none!important; }
    }`
    document.head.appendChild(s)
    return () => document.getElementById('pm-print')?.remove()
  }, [aberto])

  if (!aberto) return null

  return createPortal(
    <div data-pm="1" className="fixed inset-0 z-[200]">
      {/* Backdrop */}
      <div className="print:hidden absolute inset-0 bg-black/70" onClick={onFechar} />

      {/* Control bar */}
      <div className="print:hidden absolute top-4 inset-x-0 flex justify-center z-10">
        <div className="flex items-center gap-3 bg-zinc-900 border border-white/15 rounded-2xl shadow-2xl px-4 py-2.5">
          <span className="text-sm font-semibold text-white truncate max-w-[200px]">{titulo}</span>
          <button
            onClick={() => window.print()}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-white text-zinc-900 text-xs font-bold hover:bg-zinc-100 transition-colors"
          >
            <Printer size={13} /> Imprimir
          </button>
          <button
            onClick={onFechar}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X size={15} />
          </button>
        </div>
      </div>

      {/* Scrollable preview */}
      <div className="pm-scroll absolute inset-0 mt-16 overflow-auto flex justify-center py-6 bg-gray-400/20">
        <div className="w-[794px] max-w-full">
          {children}
        </div>
      </div>
    </div>,
    document.body
  )
}
