import { useEffect, useRef, useState } from 'react'
import { X, Send, MessageSquare, ChevronDown } from 'lucide-react'
import { clsx } from 'clsx'
import { format } from 'date-fns'
import { pt } from 'date-fns/locale'
import { useNotasGeraisAdmin } from '@/hooks/useNotasGeraisAdmin'

/**
 * @param {{
 *   aberto: boolean,
 *   onFechar: () => void,
 *   espacos: Array<{id: string, nome: string}>,
 *   defaultEspacoId: string,
 *   anoMes: string,
 *   naoLidasPorEspaco: Record<string, number>
 * }} props
 */
export function NotasGeraisAdminModal({ aberto, onFechar, espacos, defaultEspacoId, anoMes, naoLidasPorEspaco }) {
  const [espacoId, setEspacoId] = useState(defaultEspacoId || '')
  const [texto, setTexto] = useState('')
  const [enviando, setEnviando] = useState(false)
  const bottomRef = useRef(null)

  const { notas, loading, enviar, marcarLidas } = useNotasGeraisAdmin(espacoId, anoMes)

  // Quando o modal abre, sincroniza o espaço default
  useEffect(() => {
    if (aberto) setEspacoId(defaultEspacoId || '')
  }, [aberto, defaultEspacoId])

  // Marca como lidas ao abrir ou ao mudar de espaço
  useEffect(() => {
    if (aberto && espacoId) marcarLidas()
  }, [aberto, espacoId, notas.length]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [notas])

  useEffect(() => {
    if (!aberto) return
    const onKey = (e) => { if (e.key === 'Escape') onFechar() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [aberto, onFechar])

  async function handleEnviar() {
    if (!texto.trim() || !espacoId || enviando) return
    setEnviando(true)
    try { await enviar(texto.trim()); setTexto('') }
    finally { setEnviando(false) }
  }

  if (!aberto) return null

  const espacoNome = espacos.find(e => e.id === espacoId)?.nome?.trim() ?? ''
  const mesLabel = (() => {
    const [ano, mes] = anoMes.split('-').map(Number)
    return format(new Date(ano, mes - 1, 1), 'MMMM yyyy', { locale: pt })
  })()

  const totalNaoLidas = Object.values(naoLidasPorEspaco).reduce((a, b) => a + b, 0)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onFechar} />
      <div className="relative bg-surface-1 border border-border rounded-xl shadow-2xl w-full max-w-md flex flex-col"
        style={{ maxHeight: '80vh' }}>

        {/* Cabeçalho */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border shrink-0">
          <div className="flex items-center gap-2">
            <MessageSquare size={14} className="text-accent-subtle" />
            <span className="text-sm font-semibold text-accent">Notas Gerais</span>
            {totalNaoLidas > 0 && (
              <span className="inline-flex items-center justify-center h-4 min-w-[16px] rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                {totalNaoLidas}
              </span>
            )}
          </div>
          <button onClick={onFechar} className="text-accent-subtle hover:text-accent transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Selector de espaço */}
        <div className="px-4 pt-3 pb-2 shrink-0 border-b border-border/50">
          <div className="relative">
            <select
              value={espacoId}
              onChange={(e) => setEspacoId(e.target.value)}
              className="w-full appearance-none bg-surface-2 border border-border rounded-lg px-3 py-2 pr-8 text-sm text-accent outline-none focus:border-accent/40 transition-colors cursor-pointer"
            >
              <option value="">— Selecciona um cliente —</option>
              {espacos.map((e) => {
                const n = naoLidasPorEspaco[e.id] ?? 0
                return (
                  <option key={e.id} value={e.id}>
                    {e.nome.trim()}{n > 0 ? ` (${n} nova${n !== 1 ? 's' : ''})` : ''}
                  </option>
                )
              })}
            </select>
            <ChevronDown size={13} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-accent-subtle" />
          </div>
          {espacoId && (
            <p className="mt-1.5 text-[11px] text-accent-subtle capitalize">{mesLabel}</p>
          )}
        </div>

        {/* Mensagens */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0">
          {!espacoId && (
            <p className="text-center text-xs text-accent-subtle py-8">
              Selecciona um cliente para ver as mensagens.
            </p>
          )}
          {espacoId && loading && (
            <p className="text-center text-xs text-accent-subtle py-4">A carregar…</p>
          )}
          {espacoId && !loading && notas.length === 0 && (
            <p className="text-center text-xs text-accent-subtle py-8">
              Sem mensagens de {espacoNome} em {mesLabel}.
            </p>
          )}
          {notas.map((n) => {
            const isAdmin = n.autor === 'admin'
            return (
              <div key={n.id} className={clsx('flex', isAdmin ? 'justify-end' : 'justify-start')}>
                <div className={clsx(
                  'max-w-[80%] rounded-2xl px-4 py-2.5',
                  isAdmin
                    ? 'bg-accent/10 border border-accent/20 rounded-br-sm'
                    : 'bg-surface-3 border border-border rounded-bl-sm'
                )}>
                  <p className="text-sm leading-relaxed text-accent">{n.texto}</p>
                  <p className={clsx('text-[10px] mt-1 text-accent-subtle', isAdmin && 'text-right')}>
                    {format(new Date(n.created_at), 'dd MMM · HH:mm', { locale: pt })}
                    {!isAdmin && <span className="ml-1 font-semibold">· {espacoNome}</span>}
                  </p>
                </div>
              </div>
            )
          })}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="border-t border-border p-4 shrink-0">
          {!espacoId ? (
            <p className="text-center text-xs text-accent-subtle">Selecciona um cliente para responder.</p>
          ) : (
            <>
              <div className="flex gap-2">
                <textarea
                  value={texto}
                  onChange={(e) => setTexto(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleEnviar() }
                  }}
                  placeholder={`Responder a ${espacoNome}…`}
                  rows={2}
                  className="flex-1 resize-none rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-accent placeholder:text-accent-subtle outline-none focus:border-accent/40 transition-colors leading-relaxed"
                />
                <button onClick={handleEnviar} disabled={!texto.trim() || enviando}
                  className="self-end flex h-9 w-9 items-center justify-center rounded-lg bg-accent text-surface-0 transition-all hover:opacity-80 active:scale-95 disabled:opacity-30">
                  <Send size={14} />
                </button>
              </div>
              <p className="mt-1.5 text-[10px] text-accent-subtle">Enter envia · Shift+Enter nova linha</p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
