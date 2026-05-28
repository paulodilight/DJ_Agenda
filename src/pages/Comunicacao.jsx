import { useState, useMemo, useEffect, useCallback } from 'react'
import { format, startOfMonth, endOfMonth, parseISO } from 'date-fns'
import { pt } from 'date-fns/locale'
import { useMesStore } from '@/store'
import { useDJs } from '@/hooks/useDJs'
import { supabase } from '@/lib/supabase'
import { formatarHora, formatarData } from '@/utils/datas'
import { formatarEuro } from '@/utils/formatacao'
import { Printer, MessageCircle, Copy, Check } from 'lucide-react'
import { clsx } from 'clsx'
import { LoadingPage } from '@/components/ui/LoadingSpinner'
import html2canvas from 'html2canvas'

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1)

const TEMPLATE_KEY = 'comunicacao_template'

const TEMPLATE_DEFAULT =
`Olá [nome]! 👋

Aqui está a tua Agenda para [mes]:

[datas]

Qualquer questão estamos disponíveis. 🙏`

// ── Gera mensagem WhatsApp ─────────────────────────────────────────────────────
function gerarLinhasDatas(slots) {
  return slots.map(slot => {
    const data   = parseISO(slot.data)
    const dia    = cap(format(data, 'EEE', { locale: pt }))
    const dataF  = format(data, 'dd/MM')
    const espaco = slot.espacos?.nome ?? '—'
    const horario = `${formatarHora(slot.hora_inicio)}–${formatarHora(slot.hora_fim)}`
    const valor  = slot.valor != null ? formatarEuro(Number(slot.valor)) : '—'
    return `• ${dia}, ${dataF} — ${espaco} | ${horario} | ${valor}`
  }).join('\n')
}

function gerarMensagemWhatsApp(template, djNome, djPrimeiroNome, tituloMes, slots) {
  const datas = gerarLinhasDatas(slots)
  return template
    .replace(/\[nome\]/gi, djNome)
    .replace(/\[primeiro_nome\]/gi, djPrimeiroNome)
    .replace(/\[mes\]/gi, tituloMes)
    .replace(/\[datas\]/gi, datas)
}

function abrirWhatsApp(whatsapp, mensagem) {
  // Limpa o número: remove tudo excepto dígitos
  const numero = (whatsapp ?? '').replace(/\D/g, '')
  const texto  = encodeURIComponent(mensagem)
  const url    = numero
    ? `https://wa.me/${numero}?text=${texto}`
    : `https://wa.me/?text=${texto}`
  window.open(url, '_blank')
}

// ── Documento imprimível ───────────────────────────────────────────────────────
function Documento({ slots, djNome, tituloMes, disponibilidades = [] }) {
  const totalValor = slots.reduce((s, slot) => s + (Number(slot.valor) ?? 0), 0)
  const totalComValor = slots.filter(s => s.valor != null).length

  // Índices de disponibilidade para detecção rápida de choques
  const indispDates = new Set(disponibilidades.filter(d => !d.disponivel).map(d => d.data))
  const dispDates   = new Set(disponibilidades.filter(d =>  d.disponivel).map(d => d.data))
  const slotDates   = new Set(slots.map(s => s.data))

  // Choques: datas na agenda onde o DJ disse estar indisponível
  const choques = slots.filter(s => indispDates.has(s.data))

  // Disponibilidades declaradas que NÃO têm slot (apenas informativo)
  const dispSemSlot   = [...dispDates].filter(d => !slotDates.has(d)).sort()
  const indispSemSlot = [...indispDates].filter(d => !slotDates.has(d)).sort()

  return (
    <div
      id="documento-comunicacao"
      className="bg-white text-gray-900 w-full max-w-[720px] mx-auto rounded-lg shadow-xl overflow-hidden"
    >
      {/* Cabeçalho do documento */}
      <div className="bg-gray-900 text-white px-5 py-6">
        <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-1">
          Programa de Actuações
        </p>
        <h1 className="text-2xl font-bold tracking-tight">{tituloMes}</h1>
        <p className="text-base text-gray-300 mt-1 font-medium">{djNome || <span className="italic text-gray-500">— selecciona um DJ —</span>}</p>
      </div>

      {/* Alerta de choques — destaque vermelho */}
      {choques.length > 0 && (
        <div className="px-5 py-3 bg-red-50 border-b-2 border-red-200 flex items-start gap-2">
          <span className="text-red-500 text-base mt-0.5">⚠️</span>
          <div>
            <p className="text-xs font-bold text-red-700 uppercase tracking-wide">
              {choques.length} choque{choques.length !== 1 ? 's' : ''} detectado{choques.length !== 1 ? 's' : ''}
            </p>
            <p className="text-[11px] text-red-600 mt-0.5">
              {choques.map(s => format(parseISO(s.data), "d 'de' MMMM", { locale: pt })).join(' · ')}
            </p>
          </div>
        </div>
      )}

      {/* Corpo */}
      <div className="px-5 py-6">
        {slots.length === 0 ? (
          <p className="text-gray-400 italic text-sm py-8 text-center">
            {djNome ? 'Sem datas atribuídas neste mês.' : 'Selecciona um DJ para ver o programa.'}
          </p>
        ) : (
          <>
            <table className="w-full text-xs border-collapse table-fixed">
              <colgroup>
                <col style={{ width: '17%' }} />
                <col style={{ width: '13%' }} />
                <col style={{ width: '20%' }} />
                <col style={{ width: '13%' }} />
                <col style={{ width: '17%' }} />
                <col style={{ width: '20%' }} />
              </colgroup>
              <thead>
                <tr className="border-b-2 border-gray-200">
                  <th className="text-left py-2.5 pr-4 font-semibold text-gray-600 uppercase text-[11px] tracking-wider whitespace-nowrap">Dia da Semana</th>
                  <th className="text-left py-2.5 pr-4 font-semibold text-gray-600 uppercase text-[11px] tracking-wider">Data</th>
                  <th className="text-left py-2.5 pr-4 font-semibold text-gray-600 uppercase text-[11px] tracking-wider">Espaço</th>
                  <th className="text-left py-2.5 pr-4 font-semibold text-gray-600 uppercase text-[11px] tracking-wider whitespace-nowrap">Horário</th>
                  <th className="text-right py-2.5 pr-4 font-semibold text-gray-600 uppercase text-[11px] tracking-wider">Valor</th>
                  <th className="text-left py-2.5 font-semibold text-gray-600 uppercase text-[11px] tracking-wider">Evento</th>
                </tr>
              </thead>
              <tbody>
                {slots.map((slot, i) => {
                  const data = parseISO(slot.data)
                  const diaSemana = cap(format(data, 'EEEE', { locale: pt }))
                  const dataFormatada = format(data, 'dd/MM/yyyy')
                  const espacoNome = slot.espacos?.nome ?? slot.espaco_nome ?? '—'
                  const horario = `${formatarHora(slot.hora_inicio)}–${formatarHora(slot.hora_fim)}`
                  const isUltima = i === slots.length - 1
                  const isChoque = indispDates.has(slot.data)
                  const isDisp   = dispDates.has(slot.data)

                  return (
                    <tr
                      key={`${slot.data}-${slot.hora_inicio}-${i}`}
                      className={clsx(
                        'transition-colors',
                        !isUltima && 'border-b border-gray-100',
                        isChoque ? 'bg-red-50' : isDisp ? 'bg-green-50/60' : i % 2 === 0 ? 'bg-white' : 'bg-gray-50/60'
                      )}
                    >
                      <td className={clsx('py-2.5 pr-4 whitespace-nowrap font-medium', isChoque ? 'text-red-700' : 'text-gray-700')}>
                        {diaSemana}
                        {isChoque && <span className="ml-1.5 text-[10px] text-red-500 font-bold">⚠ INDISPONÍVEL</span>}
                        {isDisp   && <span className="ml-1.5 text-[10px] text-green-600 font-semibold">✓ disp.</span>}
                      </td>
                      <td className={clsx('py-2.5 pr-4 font-mono text-sm tabular-nums', isChoque ? 'text-red-700 font-bold' : 'text-gray-700')}>{dataFormatada}</td>
                      <td className="py-2.5 pr-4 font-medium text-gray-900 whitespace-nowrap">{espacoNome}</td>
                      <td className="py-2.5 pr-4 font-mono text-sm tabular-nums text-gray-600 whitespace-nowrap">{horario}</td>
                      <td className="py-2.5 pr-4 text-right tabular-nums font-medium text-gray-900">
                        {slot.valor != null ? formatarEuro(Number(slot.valor)) : <span className="text-gray-400">—</span>}
                      </td>
                      <td className="py-2.5 text-gray-600 text-sm">
                        {slot.evento || <span className="text-gray-300">—</span>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>

            {/* Totais */}
            <div className="mt-5 pt-4 border-t-2 border-gray-200 flex items-center justify-between">
              <div className="flex items-center gap-6">
                <div>
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Total de datas</span>
                  <p className="text-xl font-bold text-gray-900 mt-0.5">{slots.length}</p>
                </div>
                {totalComValor > 0 && (
                  <div>
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Total €</span>
                    <p className="text-xl font-bold text-gray-900 mt-0.5">{formatarEuro(totalValor)}</p>
                  </div>
                )}
              </div>
              <p className="text-[10px] text-gray-300 italic">gerado em {format(new Date(), 'dd/MM/yyyy HH:mm')}</p>
            </div>
          </>
        )}

        {/* ── Secção de disponibilidade declarada ── */}
        {djNome && (
          <div className="mt-6 pt-5 border-t border-gray-200">
            <p className="text-[11px] font-bold text-gray-500 uppercase tracking-widest mb-3">
              Disponibilidade declarada pelo DJ
            </p>
            {disponibilidades.length === 0 ? (
              <p className="text-[11px] text-gray-400 italic">Sem disponibilidade declarada para este mês.</p>
            ) : (
              <div className="flex gap-8 flex-wrap">
                {/* Indisponível */}
                {indispDates.size > 0 && (
                  <div>
                    <p className="text-[10px] font-semibold text-red-500 uppercase tracking-wider mb-1.5">
                      ✗ Indisponível ({indispDates.size})
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {[...indispDates].sort().map(d => {
                        const isSlot = slotDates.has(d)
                        return (
                          <span
                            key={d}
                            className={clsx(
                              'text-[11px] px-2 py-0.5 rounded font-mono',
                              isSlot
                                ? 'bg-red-100 text-red-700 font-bold ring-1 ring-red-400'
                                : 'bg-red-50 text-red-600'
                            )}
                          >
                            {format(parseISO(d), "d MMM", { locale: pt })}
                            {isSlot && ' ⚠'}
                          </span>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* Disponível */}
                {dispDates.size > 0 && (
                  <div>
                    <p className="text-[10px] font-semibold text-green-600 uppercase tracking-wider mb-1.5">
                      ✓ Disponível ({dispDates.size})
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {[...dispDates].sort().map(d => (
                        <span
                          key={d}
                          className="text-[11px] px-2 py-0.5 rounded font-mono bg-green-50 text-green-700"
                        >
                          {format(parseISO(d), "d MMM", { locale: pt })}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Página principal ───────────────────────────────────────────────────────────
export function Comunicacao() {
  const { anoMes } = useMesStore()
  const { djs } = useDJs()
  const [djId, setDjId] = useState('')
  const [slots, setSlots] = useState([])
  const [disponibilidades, setDisponibilidades] = useState([])
  const [loading, setLoading] = useState(false)
  const [template, setTemplate] = useState(
    () => localStorage.getItem(TEMPLATE_KEY) ?? TEMPLATE_DEFAULT
  )

  const guardarTemplate = (val) => {
    setTemplate(val)
    localStorage.setItem(TEMPLATE_KEY, val)
  }

  const djActual = djs.find(d => d.id === djId)
  const djNome = djActual?.nome_artistico || djActual?.nome || ''
  const djPrimeiroNome = (djActual?.nome || '').trim().split(/\s+/)[0] || djNome

  const { dataInicio, dataFim, tituloMes } = useMemo(() => {
    const [ano, mes] = anoMes.split('-').map(Number)
    const ref = new Date(ano, mes - 1, 1)
    return {
      dataInicio: format(startOfMonth(ref), 'yyyy-MM-dd'),
      dataFim:    format(endOfMonth(ref),   'yyyy-MM-dd'),
      tituloMes:  cap(format(ref, 'MMMM yyyy', { locale: pt })),
    }
  }, [anoMes])

  const carregar = useCallback(async (id, inicio, fim) => {
    if (!id) { setSlots([]); setDisponibilidades([]); return }
    setLoading(true)
    try {
      const [slotsRes, dispRes] = await Promise.all([
        supabase
          .from('agenda')
          .select(`
            data, hora_inicio, hora_fim, valor, evento,
            espacos!agenda_espaco_id_fkey ( nome )
          `)
          .eq('dj_id', id)
          .gte('data', inicio)
          .lte('data', fim)
          .neq('estado', 'cancelado')
          .order('data')
          .order('hora_inicio'),
        supabase
          .from('disponibilidades')
          .select('data, disponivel, notas')
          .eq('dj_id', id)
          .gte('data', inicio)
          .lte('data', fim),
      ])
      if (slotsRes.error) throw slotsRes.error
      if (dispRes.error) console.error('Erro disponibilidades:', dispRes.error)
      setSlots(slotsRes.data ?? [])
      setDisponibilidades(dispRes.data ?? [])
    } catch (e) {
      console.error('Erro ao carregar slots:', e)
      setSlots([])
      setDisponibilidades([])
    } finally {
      setLoading(false)
    }
  }, [])

  // Recarrega quando muda o mês (mantendo o DJ seleccionado)
  useEffect(() => {
    if (djId) carregar(djId, dataInicio, dataFim)
  }, [djId, dataInicio, dataFim, carregar])


  const [copiando,    setCopiando]    = useState(false)
  const [copiado,     setCopiado]     = useState(false)
  const [addImagem,   setAddImagem]   = useState(false)
  const [avisoImagem, setAvisoImagem] = useState(false)  // toast "cola no WhatsApp"
  const [waLoading,   setWaLoading]   = useState(false)

  const copiarImagem = useCallback(async () => {
    const el = document.getElementById('documento-comunicacao')
    if (!el) return
    setCopiando(true)
    try {
      const canvas = await html2canvas(el, { scale: 2, useCORS: true, backgroundColor: '#ffffff' })
      const blob   = await new Promise(res => canvas.toBlob(res, 'image/png'))
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2500)
    } catch (e) {
      console.error('Erro ao copiar imagem:', e)
    } finally {
      setCopiando(false)
    }
  }, [])

  const handleWhatsApp = useCallback(async () => {
    const mensagem = gerarMensagemWhatsApp(template, djNome, djPrimeiroNome, tituloMes, slots)
    if (addImagem) {
      setWaLoading(true)
      try {
        const el = document.getElementById('documento-comunicacao')
        if (el) {
          const canvas = await html2canvas(el, { scale: 2, useCORS: true, backgroundColor: '#ffffff' })
          const blob   = await new Promise(res => canvas.toBlob(res, 'image/png'))
          await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
        }
      } catch (e) {
        console.error('Erro ao copiar imagem para WhatsApp:', e)
      } finally {
        setWaLoading(false)
      }
      // Abre WhatsApp e mostra aviso para colar
      abrirWhatsApp(djActual?.whatsapp, mensagem)
      setAvisoImagem(true)
      setTimeout(() => setAvisoImagem(false), 5000)
    } else {
      abrirWhatsApp(djActual?.whatsapp, mensagem)
    }
  }, [addImagem, template, djNome, djPrimeiroNome, tituloMes, slots, djActual])

  const djsActivos = djs.filter(d => d.estado === 'activo')
    .sort((a, b) => (a.nome_artistico || a.nome).localeCompare(b.nome_artistico || b.nome))

  return (
    <div className="flex flex-col h-full">

      {/* Controlos — escondidos na impressão */}
      <div className="print:hidden px-6 py-4 border-b border-border shrink-0 flex items-center gap-4 flex-wrap">
        <div className="flex-1 min-w-[200px] max-w-xs">
          <select
            value={djId}
            onChange={e => setDjId(e.target.value)}
            className="w-full bg-surface-2 border border-border rounded px-3 py-2 text-sm text-accent focus:outline-none focus:ring-1 focus:ring-accent/50"
          >
            <option value="">Seleccionar DJ…</option>
            {djsActivos.map(d => (
              <option key={d.id} value={d.id}>{d.nome_artistico || d.nome}</option>
            ))}
          </select>
        </div>

        <button
          onClick={() => window.print()}
          disabled={!djId || slots.length === 0}
          className={clsx(
            'flex items-center gap-2 px-4 py-2 rounded border font-semibold text-xs tracking-widest uppercase transition-colors',
            djId && slots.length > 0
              ? 'bg-accent text-black border-accent hover:bg-accent/80'
              : 'bg-surface-2 text-accent-subtle border-border opacity-50 cursor-not-allowed'
          )}
        >
          <Printer size={13} />
          Imprimir / PDF
        </button>

        <button
          onClick={copiarImagem}
          disabled={!djId || slots.length === 0 || copiando}
          className={clsx(
            'flex items-center gap-2 px-4 py-2 rounded border font-semibold text-xs tracking-widest uppercase transition-colors',
            copiado
              ? 'bg-status-confirmado/20 text-status-confirmado border-status-confirmado/40'
              : djId && slots.length > 0 && !copiando
                ? 'bg-surface-2 text-accent-muted border-border hover:text-accent hover:border-white/20'
                : 'bg-surface-2 text-accent-subtle border-border opacity-50 cursor-not-allowed'
          )}
        >
          {copiado ? <Check size={13} /> : <Copy size={13} />}
          {copiando ? 'A gerar…' : copiado ? 'Copiado!' : 'Copiar Imagem'}
        </button>

        {/* WhatsApp + checkbox "incluir imagem" */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleWhatsApp}
            disabled={!djId || slots.length === 0 || waLoading}
            className={clsx(
              'flex items-center gap-2 px-4 py-2 rounded border font-semibold text-xs tracking-widest uppercase transition-colors',
              djId && slots.length > 0 && !waLoading
                ? 'bg-green-600 text-white border-green-600 hover:bg-green-500'
                : 'bg-surface-2 text-accent-subtle border-border opacity-50 cursor-not-allowed'
            )}
          >
            <MessageCircle size={13} />
            {waLoading ? 'A preparar…' : 'WhatsApp'}
          </button>

          <label className="flex items-center gap-1.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={addImagem}
              onChange={e => setAddImagem(e.target.checked)}
              className="w-3.5 h-3.5 rounded accent-green-500 cursor-pointer"
            />
            <span className="text-[11px] text-accent-muted whitespace-nowrap">Incluir imagem</span>
          </label>
        </div>

        {djId && !loading && (
          <p className="text-xs text-accent-muted">
            {slots.length} data{slots.length !== 1 ? 's' : ''} em {tituloMes}
          </p>
        )}
      </div>

      {/* Aviso "cola imagem" — aparece após envio com imagem */}
      {avisoImagem && (
        <div className="print:hidden px-6 py-2 shrink-0 flex items-center gap-2 bg-green-600/10 border-b border-green-600/20">
          <span className="text-green-400 text-sm">📋</span>
          <p className="text-xs text-green-400 font-medium">
            Imagem copiada para o clipboard — cola no WhatsApp com <kbd className="bg-green-900/40 px-1 py-0.5 rounded text-[10px] font-mono">Ctrl+V</kbd>
          </p>
        </div>
      )}

      {/* Layout 2 colunas: editor de template | documento */}
      <div className="flex-1 flex overflow-hidden print:block print:overflow-visible">

        {/* Painel esquerdo — editor de template (escondido na impressão) */}
        <div className="print:hidden w-72 shrink-0 border-r border-border flex flex-col bg-surface-1">
          <div className="px-4 py-3 border-b border-border/50 shrink-0">
            <p className="text-xs font-semibold text-accent uppercase tracking-wider">Modelo de mensagem</p>
            <p className="text-[10px] text-accent-subtle mt-1 leading-relaxed">
              <span className="font-mono bg-surface-3 px-1 rounded">[nome]</span>{' '}nome artístico
              {' · '}
              <span className="font-mono bg-surface-3 px-1 rounded">[primeiro_nome]</span>{' '}nome próprio
              {' · '}
              <span className="font-mono bg-surface-3 px-1 rounded">[mes]</span>{' '}
              <span className="font-mono bg-surface-3 px-1 rounded">[datas]</span>
            </p>
          </div>
          <textarea
            value={template}
            onChange={e => guardarTemplate(e.target.value)}
            className="flex-1 w-full bg-surface-1 text-accent text-xs font-mono p-4 resize-none focus:outline-none focus:ring-1 focus:ring-accent/30 leading-relaxed"
            placeholder={TEMPLATE_DEFAULT}
            spellCheck={false}
          />
          <div className="px-4 py-2 border-t border-border/50 shrink-0">
            <button
              onClick={() => guardarTemplate(TEMPLATE_DEFAULT)}
              className="text-[10px] text-accent-subtle hover:text-accent transition-colors"
            >
              ↺ Repor modelo original
            </button>
          </div>
        </div>

        {/* Painel direito — documento */}
        <div className="flex-1 overflow-auto bg-surface-0 print:bg-white p-6 print:p-0">
          {loading ? (
            <LoadingPage />
          ) : (
            <Documento slots={slots} djNome={djNome} tituloMes={tituloMes} disponibilidades={disponibilidades} />
          )}
        </div>

      </div>
    </div>
  )
}
