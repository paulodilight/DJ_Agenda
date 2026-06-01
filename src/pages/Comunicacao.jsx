import { useState, useMemo, useEffect, useCallback } from 'react'
import { format, startOfMonth, endOfMonth, parseISO, startOfWeek, endOfWeek, addDays, addWeeks, addMonths } from 'date-fns'
import { pt } from 'date-fns/locale'
import { useMesStore } from '@/store'
import { useDJs } from '@/hooks/useDJs'
import { useEspacos } from '@/hooks/useEspacos'
import { supabase } from '@/lib/supabase'
import { formatarHora } from '@/utils/datas'
import { formatarEuro } from '@/utils/formatacao'
import {
  Printer, MessageCircle, Copy, Check,
  Download, ExternalLink, Instagram, Star, FileText,
  CalendarDays, LayoutDashboard,
} from 'lucide-react'
import { clsx } from 'clsx'
import { LoadingPage } from '@/components/ui/LoadingSpinner'
import html2canvas from 'html2canvas'

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1)

const HOJE = format(new Date(), 'yyyy-MM-dd')

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
  const numero = (whatsapp ?? '').replace(/\D/g, '')
  const texto  = encodeURIComponent(mensagem)
  const url    = numero
    ? `https://wa.me/${numero}?text=${texto}`
    : `https://wa.me/?text=${texto}`
  window.open(url, '_blank')
}

// ── Documento imprimível (aba DJs) ─────────────────────────────────────────────
function Documento({ slots, djNome, tituloMes, disponibilidades = [] }) {
  const totalValor = slots.reduce((s, slot) => s + (Number(slot.valor) ?? 0), 0)
  const totalComValor = slots.filter(s => s.valor != null).length

  const indispDates = new Set(disponibilidades.filter(d => !d.disponivel).map(d => d.data))
  const dispDates   = new Set(disponibilidades.filter(d =>  d.disponivel).map(d => d.data))
  const slotDates   = new Set(slots.map(s => s.data))

  const choques = slots.filter(s => indispDates.has(s.data))
  const dispSemSlot   = [...dispDates].filter(d => !slotDates.has(d)).sort()
  const indispSemSlot = [...indispDates].filter(d => !slotDates.has(d)).sort()

  return (
    <div
      id="documento-comunicacao"
      className="bg-white text-gray-900 w-full max-w-[720px] mx-auto rounded-lg shadow-xl overflow-hidden"
    >
      <div className="bg-gray-900 text-white px-5 py-6">
        <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-1">
          Programa de Actuações
        </p>
        <h1 className="text-2xl font-bold tracking-tight">{tituloMes}</h1>
        <p className="text-base text-gray-300 mt-1 font-medium">{djNome || <span className="italic text-gray-500">— selecciona um DJ —</span>}</p>
      </div>

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
                  <th className="text-left py-2.5 pr-4 font-semibold text-gray-600 uppercase text-[11px] tracking-wider">Cliente</th>
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
                        isChoque ? 'bg-red-50' : i % 2 === 0 ? 'bg-white' : 'bg-gray-50/60'
                      )}
                    >
                      <td className={clsx('py-2.5 pr-4 whitespace-nowrap font-medium', isChoque ? 'text-red-700' : 'text-gray-700')}>
                        {diaSemana}
                        {isChoque && <span className="ml-1.5 text-[10px] text-red-500 font-bold">⚠</span>}
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

        {djNome && (
          <div className="mt-6 pt-5 border-t border-gray-200">
            <p className="text-[11px] font-bold text-gray-500 uppercase tracking-widest mb-3">
              Disponibilidade declarada pelo DJ
            </p>
            {disponibilidades.length === 0 ? (
              <p className="text-[11px] text-gray-400 italic">Sem disponibilidade declarada para este mês.</p>
            ) : (
              <div className="flex gap-8 flex-wrap">
                {indispDates.size > 0 && (
                  <div>
                    <p className="text-[10px] font-semibold text-red-500 uppercase tracking-wider mb-1.5">
                      ✗ Indisponível ({indispDates.size})
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {[...indispDates].sort().map(d => {
                        const isSlot = slotDates.has(d)
                        return (
                          <span key={d} className={clsx(
                            'text-[11px] px-2 py-0.5 rounded font-mono',
                            isSlot ? 'bg-red-100 text-red-700 font-bold ring-1 ring-red-400' : 'bg-red-50 text-red-600'
                          )}>
                            {format(parseISO(d), "d MMM", { locale: pt })}
                            {isSlot && ' ⚠'}
                          </span>
                        )
                      })}
                    </div>
                  </div>
                )}
                {dispDates.size > 0 && (
                  <div>
                    <p className="text-[10px] font-semibold text-green-600 uppercase tracking-wider mb-1.5">
                      ✓ Disponível ({dispDates.size})
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {[...dispDates].sort().map(d => (
                        <span key={d} className="text-[11px] px-2 py-0.5 rounded font-mono bg-green-50 text-green-700">
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

// ── Helpers Marketing ──────────────────────────────────────────────────────────

function corEstadoMkt(estado) {
  switch (estado) {
    case 'presente':   return 'text-emerald-400 font-semibold'
    case 'confirmado': return 'text-status-confirmado'
    case 'proposta':   return 'text-amber-400'
    case 'faltou':     return 'text-orange-400 font-medium'
    case 'cancelado':  return 'text-status-cancelado/50'
    default:           return 'text-accent-subtle'
  }
}

function labelEstadoMkt(estado) {
  const map = { presente: 'Presente', confirmado: 'Confirmado', proposta: 'Proposta', faltou: 'Faltou', cancelado: 'Cancelado' }
  return map[estado] ?? estado
}

function DJAvatar({ nome, fotoUrl, size = 8 }) {
  const initials = (nome ?? '?').split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase()
  if (fotoUrl) {
    return (
      <img
        src={fotoUrl}
        alt={nome}
        className={clsx(`w-${size} h-${size} rounded-lg object-cover border border-border shrink-0`)}
      />
    )
  }
  return (
    <div className={clsx(
      `w-${size} h-${size} rounded-lg bg-surface-3 border border-border flex items-center justify-center shrink-0`,
      'text-[10px] font-bold text-accent-subtle'
    )}>
      {initials}
    </div>
  )
}

function LinksDJ({ slot }) {
  const dj = slot.djs
  if (!dj) return null
  return (
    <div className="flex items-center gap-1.5">
      {dj.instagram_url && (
        <a href={dj.instagram_url} target="_blank" rel="noopener noreferrer"
           className="text-pink-400/70 hover:text-pink-400 transition-colors" title="Instagram">
          <Instagram size={12} />
        </a>
      )}
      {dj.rede_social_url && (
        <a href={dj.rede_social_url} target="_blank" rel="noopener noreferrer"
           className="text-blue-400/70 hover:text-blue-400 transition-colors" title="Rede Social">
          <ExternalLink size={12} />
        </a>
      )}
      {dj.presskit_url && (
        <a href={dj.presskit_url} target="_blank" rel="noopener noreferrer"
           className="text-accent-subtle/60 hover:text-accent-muted transition-colors" title="Presskit">
          <Download size={12} />
        </a>
      )}
    </div>
  )
}

// ── Página principal ───────────────────────────────────────────────────────────
export function Comunicacao() {
  const { anoMes } = useMesStore()
  const { djs } = useDJs()
  const { espacos } = useEspacos()

  // ── Tabs principais ──
  const [abaGlobal, setAbaGlobal] = useState('djs') // 'djs' | 'marketing'

  // ── Aba DJs ──
  const [djId, setDjId] = useState('')
  const [slots, setSlots] = useState([])
  const [disponibilidades, setDisponibilidades] = useState([])
  const [loading, setLoading] = useState(false)
  const [template, setTemplate] = useState(
    () => localStorage.getItem(TEMPLATE_KEY) ?? TEMPLATE_DEFAULT
  )
  const [copiando,    setCopiando]    = useState(false)
  const [copiado,     setCopiado]     = useState(false)
  const [addImagem,   setAddImagem]   = useState(false)
  const [avisoImagem, setAvisoImagem] = useState(false)
  const [waLoading,   setWaLoading]   = useState(false)

  // ── Foto modal ──
  const [fotoModal, setFotoModal] = useState(null) // { nome, url } | null

  // ── Bio modal ──
  const [bioModal, setBioModal] = useState(null) // { nome, bio } | null
  const [bioCopied, setBioCopied] = useState(false)
  const copiarBio = async (bio) => {
    try { await navigator.clipboard.writeText(bio); setBioCopied(true); setTimeout(() => setBioCopied(false), 2000) }
    catch { /* silencioso */ }
  }

  // ── Aba Marketing ──
  const [mktSubTab,      setMktSubTab]      = useState('dashboard')
  const [mktSlots,       setMktSlots]       = useState([])
  const [mktEventos,     setMktEventos]     = useState([])
  const [mktLoading,     setMktLoading]     = useState(false)
  const [mktFiltroTempo, setMktFiltroTempo] = useState('mes') // 'hoje' | 'semana' | 'mes'
  const [mktNavDate,     setMktNavDate]     = useState(new Date()) // data de referência para navegação

  // Mês a carregar do Supabase (sempre o mês completo da data de referência)
  const mktMesInicio = useMemo(() => format(startOfMonth(mktNavDate), 'yyyy-MM-dd'), [mktNavDate])
  const mktMesFim    = useMemo(() => format(endOfMonth(mktNavDate),   'yyyy-MM-dd'), [mktNavDate])

  // Período activo (dentro do mês carregado) para filtrar a tabela
  const mktPeriodo = useMemo(() => {
    if (mktFiltroTempo === 'hoje') {
      const d = format(mktNavDate, 'yyyy-MM-dd')
      return { inicio: d, fim: d }
    }
    if (mktFiltroTempo === 'semana') {
      return {
        inicio: format(startOfWeek(mktNavDate, { weekStartsOn: 1 }), 'yyyy-MM-dd'),
        fim:    format(endOfWeek(mktNavDate,   { weekStartsOn: 1 }), 'yyyy-MM-dd'),
      }
    }
    return { inicio: mktMesInicio, fim: mktMesFim }
  }, [mktFiltroTempo, mktNavDate, mktMesInicio, mktMesFim])

  // Label legível do período activo
  const mktPeriodoLabel = useMemo(() => {
    if (mktFiltroTempo === 'hoje')
      return cap(format(mktNavDate, "EEE d 'de' MMMM yyyy", { locale: pt }))
    if (mktFiltroTempo === 'semana') {
      const ini = startOfWeek(mktNavDate, { weekStartsOn: 1 })
      const fim = endOfWeek(mktNavDate,   { weekStartsOn: 1 })
      return `${cap(format(ini, "d MMM", { locale: pt }))} – ${format(fim, "d MMM yyyy", { locale: pt })}`
    }
    return cap(format(mktNavDate, 'MMMM yyyy', { locale: pt }))
  }, [mktFiltroTempo, mktNavDate])

  // Navegação ← →
  const navAnterior = useCallback(() => setMktNavDate(d =>
    mktFiltroTempo === 'hoje'   ? addDays(d, -1)    :
    mktFiltroTempo === 'semana' ? addWeeks(d, -1)   :
    addMonths(d, -1)
  ), [mktFiltroTempo])

  const navSeguinte = useCallback(() => setMktNavDate(d =>
    mktFiltroTempo === 'hoje'   ? addDays(d, 1)     :
    mktFiltroTempo === 'semana' ? addWeeks(d, 1)    :
    addMonths(d, 1)
  ), [mktFiltroTempo])

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

  // ── Carregar dados DJ ──
  const carregar = useCallback(async (id, inicio, fim) => {
    if (!id) { setSlots([]); setDisponibilidades([]); return }
    setLoading(true)
    try {
      const [slotsRes, dispRes] = await Promise.all([
        supabase
          .from('agenda')
          .select(`data, hora_inicio, hora_fim, valor, evento, espacos!agenda_espaco_id_fkey ( nome )`)
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

  useEffect(() => {
    if (djId) carregar(djId, dataInicio, dataFim)
  }, [djId, dataInicio, dataFim, carregar])

  // ── Carregar dados Marketing ──
  const carregarMarketing = useCallback(async () => {
    setMktLoading(true)
    try {
      const [slotsRes, eventosRes] = await Promise.all([
        supabase
          .from('agenda')
          .select(`
            id, data, hora_inicio, hora_fim, valor, estado, evento, espaco_id, dj_nome,
            djs!agenda_dj_id_fkey ( id, nome_artistico, bio, foto_url, instagram_url, rede_social_url, presskit_url ),
            espacos!agenda_espaco_id_fkey ( id, nome )
          `)
          .gte('data', mktMesInicio)
          .lte('data', mktMesFim)
          .order('data')
          .order('hora_inicio'),
        supabase
          .from('supa_eventos')
          .select('id, data_evento, hora_inicio, hora_fim, evento, status, espaco_id, tipo, xclusive, artista_id, espacos(id, nome), artistas(id, nome, foto_url, bio, instagram_url, rede_social_url, presskit_url)')
          .gte('data_evento', mktMesInicio)
          .lte('data_evento', mktMesFim)
          .order('data_evento')
          .order('hora_inicio'),
      ])
      if (slotsRes.error) throw slotsRes.error
      setMktSlots(slotsRes.data ?? [])
      setMktEventos(eventosRes.data ?? [])
    } catch (e) {
      console.error('Erro Marketing:', e)
    } finally {
      setMktLoading(false)
    }
  }, [mktMesInicio, mktMesFim])

  useEffect(() => {
    if (abaGlobal === 'marketing') carregarMarketing()
  }, [abaGlobal, carregarMarketing])

  // ── Marketing: dados filtrados ──
  // Dashboard: hoje (sempre data real)
  const hojeNaMes   = HOJE >= mktMesInicio && HOJE <= mktMesFim
  const dashSlots   = useMemo(() => mktSlots.filter(s => s.data === HOJE), [mktSlots])
  const dashEventos = useMemo(() => mktEventos.filter(e => e.data_evento === HOJE), [mktEventos])

  // Por Cliente: filtrado por Cliente + período activo
  const slotsDoEspaco = useMemo(() => {
    if (mktSubTab === 'dashboard') return []
    return mktSlots
      .filter(s => s.espaco_id === mktSubTab)
      .filter(s => s.data >= mktPeriodo.inicio && s.data <= mktPeriodo.fim)
  }, [mktSlots, mktSubTab, mktPeriodo])

  const eventosDoEspaco = useMemo(() => {
    if (mktSubTab === 'dashboard') return []
    return mktEventos
      .filter(e => e.espaco_id === mktSubTab)
      .filter(e => e.data_evento >= mktPeriodo.inicio && e.data_evento <= mktPeriodo.fim)
  }, [mktEventos, mktSubTab, mktPeriodo])

  const xclusiveDoEspaco = useMemo(() => {
    if (mktSubTab === 'dashboard') return []
    return mktEventos
      .filter(e => e.xclusive && e.espaco_id === mktSubTab)
      .filter(e => e.data_evento >= mktPeriodo.inicio && e.data_evento <= mktPeriodo.fim)
  }, [mktEventos, mktSubTab, mktPeriodo])

  // ── DJs tab: copiar imagem / WhatsApp ──
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
    } catch (e) { console.error('Erro ao copiar imagem:', e) }
    finally { setCopiando(false) }
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
      } catch (e) { console.error('Erro ao copiar imagem para WhatsApp:', e) }
      finally { setWaLoading(false) }
      abrirWhatsApp(djActual?.whatsapp, mensagem)
      setAvisoImagem(true)
      setTimeout(() => setAvisoImagem(false), 5000)
    } else {
      abrirWhatsApp(djActual?.whatsapp, mensagem)
    }
  }, [addImagem, template, djNome, djPrimeiroNome, tituloMes, slots, djActual])

  const djsActivos = djs.filter(d => d.estado === 'activo')
    .sort((a, b) => (a.nome_artistico || a.nome).localeCompare(b.nome_artistico || b.nome))

  const tabMainCls = (t) => clsx(
    'px-5 py-2.5 text-xs font-medium border-b-2 transition-colors -mb-px',
    abaGlobal === t
      ? 'border-status-confirmado text-status-confirmado'
      : 'border-transparent text-accent-muted hover:text-accent'
  )

  const tabMktCls = (t) => clsx(
    'px-4 py-2 text-xs font-medium border-b-2 transition-colors -mb-px whitespace-nowrap',
    mktSubTab === t
      ? 'border-violet-400 text-violet-300'
      : 'border-transparent text-accent-muted hover:text-accent'
  )

  // ── Render Cliente selecionado (nome) ──
  const espacoAtual = espacos.find(e => e.id === mktSubTab)

  return (
    <div className="flex flex-col h-full">

      {/* ── Tabs principais ── */}
      <div className="print:hidden flex border-b border-border px-6 shrink-0 bg-surface-1">
        <button className={tabMainCls('djs')} onClick={() => setAbaGlobal('djs')}>DJs</button>
        <button className={tabMainCls('marketing')} onClick={() => setAbaGlobal('marketing')}>Marketing</button>
      </div>

      {/* ════════════════════════════════════════════
          TAB DJs — conteúdo original
      ════════════════════════════════════════════ */}
      {abaGlobal === 'djs' && (
        <>
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
              <Printer size={13} />Imprimir / PDF
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

          {avisoImagem && (
            <div className="print:hidden px-6 py-2 shrink-0 flex items-center gap-2 bg-green-600/10 border-b border-green-600/20">
              <span className="text-green-400 text-sm">📋</span>
              <p className="text-xs text-green-400 font-medium">
                Imagem copiada para o clipboard — cola no WhatsApp com <kbd className="bg-green-900/40 px-1 py-0.5 rounded text-[10px] font-mono">Ctrl+V</kbd>
              </p>
            </div>
          )}

          <div className="flex-1 flex overflow-hidden print:block print:overflow-visible">
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

            <div className="flex-1 overflow-auto bg-surface-0 print:bg-white p-6 print:p-0">
              {loading ? (
                <LoadingPage />
              ) : (
                <Documento slots={slots} djNome={djNome} tituloMes={tituloMes} disponibilidades={disponibilidades} />
              )}
            </div>
          </div>
        </>
      )}

      {/* ════════════════════════════════════════════
          TAB MARKETING
      ════════════════════════════════════════════ */}
      {abaGlobal === 'marketing' && (
        <div className="flex flex-col flex-1 overflow-hidden">

          {/* Sub-tabs Marketing */}
          <div className="flex border-b border-border px-6 shrink-0 overflow-x-auto bg-surface-1 gap-1">
            <button className={tabMktCls('dashboard')} onClick={() => { setMktSubTab('dashboard'); setMktFiltroTempo('mes') }}>
              <span className="flex items-center gap-1.5"><LayoutDashboard size={11} />Dashboard</span>
            </button>
            {espacos.map(e => (
              <button key={e.id} className={tabMktCls(e.id)} onClick={() => { setMktSubTab(e.id); setMktFiltroTempo('mes') }}>
                {e.nome}
              </button>
            ))}
          </div>

          {/* Header info + filtros + navegação + print */}
          <div className="px-6 py-2.5 border-b border-border/50 shrink-0 flex items-center justify-between gap-4 flex-wrap">
            {/* Info Cliente/dashboard */}
            <div className="flex items-center gap-2 text-xs text-accent-muted">
              <CalendarDays size={12} />
              {mktSubTab !== 'dashboard' && espacoAtual && (
                <span className="font-medium text-accent">{espacoAtual.nome}</span>
              )}
              {mktSubTab === 'dashboard' && (
                <span>Hoje: {cap(format(new Date(), "EEE d 'de' MMMM yyyy", { locale: pt }))}</span>
              )}
              {mktSubTab !== 'dashboard' && (
                <>
                  <span className="text-border">·</span>
                  <span>{slotsDoEspaco.length} slot{slotsDoEspaco.length !== 1 ? 's' : ''}</span>
                </>
              )}
            </div>

            {mktSubTab !== 'dashboard' && (
              <div className="flex items-center gap-2">

                {/* Tipo de filtro: Hoje | Semana | Mês */}
                <div className="flex rounded-md border border-border overflow-hidden">
                  {[
                    { key: 'hoje',   label: 'Hoje' },
                    { key: 'semana', label: 'Semana' },
                    { key: 'mes',    label: 'Mês' },
                  ].map(({ key, label }, i) => (
                    <button
                      key={key}
                      onClick={() => { setMktFiltroTempo(key); setMktNavDate(new Date()) }}
                      className={clsx(
                        'px-3 py-1.5 text-[11px] font-medium transition-colors',
                        i > 0 && 'border-l border-border',
                        mktFiltroTempo === key
                          ? 'bg-violet-500/25 text-violet-300'
                          : 'bg-surface-2 text-accent-muted hover:text-accent hover:bg-surface-3'
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {/* Navegação ← período → */}
                <div className="flex items-center rounded-md border border-border overflow-hidden">
                  <button
                    onClick={navAnterior}
                    className="px-2.5 py-1.5 bg-surface-2 text-accent-muted hover:text-accent hover:bg-surface-3 transition-colors border-r border-border text-sm leading-none"
                    title="Anterior"
                  >
                    ‹
                  </button>
                  <span className="px-3 py-1.5 text-[11px] font-medium text-accent bg-surface-2 min-w-[140px] text-center whitespace-nowrap">
                    {mktPeriodoLabel}
                  </span>
                  <button
                    onClick={navSeguinte}
                    className="px-2.5 py-1.5 bg-surface-2 text-accent-muted hover:text-accent hover:bg-surface-3 transition-colors border-l border-border text-sm leading-none"
                    title="Seguinte"
                  >
                    ›
                  </button>
                </div>

                <button
                  onClick={() => window.print()}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-border bg-surface-2 text-xs text-accent-muted hover:text-accent hover:border-white/20 transition-colors"
                >
                  <Printer size={11} />Imprimir
                </button>
              </div>
            )}
          </div>

          {/* Conteúdo */}
          <div className="flex-1 overflow-auto">
            {mktLoading ? (
              <LoadingPage />
            ) : mktSubTab === 'dashboard' ? (

              /* ── Dashboard (Hoje) ── */
              <div className="p-6">
                {!hojeNaMes && (
                  <div className="mb-5 px-4 py-3 rounded-lg border border-amber-500/25 bg-amber-500/10 text-amber-300 text-sm">
                    Hoje ({HOJE}) não está no mês seleccionado. A mostrar actividade de hoje a partir dos dados carregados.
                  </div>
                )}

                {dashSlots.length === 0 && dashEventos.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-24 text-accent-subtle/40">
                    <CalendarDays size={48} className="mb-4 opacity-25" />
                    <p className="text-lg font-medium">Sem actividade hoje</p>
                    <p className="text-sm mt-1.5">Nenhum slot ou evento para {cap(format(new Date(), "d 'de' MMMM", { locale: pt }))}</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3 gap-5">
                    {espacos.map(esp => {
                      const slotsHoje   = dashSlots.filter(s => s.espaco_id === esp.id)
                      const eventosHoje = dashEventos.filter(e => e.espaco_id === esp.id)
                      if (slotsHoje.length === 0 && eventosHoje.length === 0) return null
                      return (
                        <div key={esp.id} className="bg-surface-1 border border-border rounded-2xl overflow-hidden">

                          {/* Cabeçalho do Cliente */}
                          <div className="px-5 py-4 border-b border-border/60 bg-surface-2/60">
                            <p className="text-sm font-bold text-accent uppercase tracking-widest">{esp.nome}</p>
                          </div>

                          <div className="px-5 py-4 flex flex-col gap-5">

                            {/* ── Slots DJ ── */}
                            {slotsHoje.map(s => {
                              const djNomeDisplay = s.djs?.nome_artistico ?? s.dj_nome ?? '—'
                              const fotoUrl = s.djs?.foto_url ?? null
                              const isCancelado = s.estado === 'cancelado'
                              return (
                                <div key={s.id} className={clsx(
                                  'flex items-start gap-4',
                                  isCancelado && 'opacity-40'
                                )}>
                                  {/* Foto grande */}
                                  {fotoUrl ? (
                                    <a href={fotoUrl} target="_blank" rel="noopener noreferrer" title="Ver / descarregar foto" className="shrink-0">
                                      <img
                                        src={fotoUrl}
                                        alt={djNomeDisplay}
                                        className="w-20 h-20 rounded-xl object-cover border border-border hover:border-white/30 transition-colors"
                                      />
                                    </a>
                                  ) : (
                                    <div className="w-20 h-20 rounded-xl bg-surface-3 border border-border flex items-center justify-center shrink-0">
                                      <span className="text-xl font-bold text-accent-subtle/40">
                                        {(djNomeDisplay).split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase()}
                                      </span>
                                    </div>
                                  )}

                                  {/* Info DJ */}
                                  <div className="flex-1 min-w-0">
                                    <p className={clsx(
                                      'text-base font-bold leading-tight',
                                      isCancelado ? 'line-through text-accent-muted' : 'text-accent'
                                    )}>
                                      {djNomeDisplay}
                                    </p>

                                    <p className="text-sm text-accent-muted mt-1 font-mono tabular-nums">
                                      {formatarHora(s.hora_inicio)} – {formatarHora(s.hora_fim)}
                                    </p>

                                    {s.evento && (
                                      <p className="text-sm text-accent-subtle mt-0.5">{s.evento}</p>
                                    )}

                                    {s.djs?.bio && (
                                      <p className="text-xs text-accent-subtle/70 mt-1 leading-relaxed line-clamp-2">{s.djs.bio}</p>
                                    )}

                                    <span className={clsx('inline-block text-xs font-semibold mt-1.5', corEstadoMkt(s.estado))}>
                                      {labelEstadoMkt(s.estado)}
                                    </span>

                                    {/* Links sociais — todos com o mesmo estilo de botão */}
                                    {s.djs && (
                                      <div className="flex items-center gap-2 mt-2 flex-wrap">
                                        {s.djs.instagram_url && (
                                          <a href={s.djs.instagram_url} target="_blank" rel="noopener noreferrer"
                                             className="flex items-center gap-1 px-2.5 py-1 rounded border border-border/60 bg-surface-2 text-pink-400/80 hover:text-pink-400 hover:border-pink-400/30 transition-colors text-xs font-medium"
                                             title="Instagram">
                                            <Instagram size={12} />IG
                                          </a>
                                        )}
                                        {s.djs.rede_social_url && (
                                          <a href={s.djs.rede_social_url} target="_blank" rel="noopener noreferrer"
                                             className="flex items-center gap-1 px-2.5 py-1 rounded border border-border/60 bg-surface-2 text-blue-400/80 hover:text-blue-400 hover:border-blue-400/30 transition-colors text-xs font-medium"
                                             title="Rede Social">
                                            <ExternalLink size={12} />RS
                                          </a>
                                        )}
                                        {s.djs.presskit_url && (
                                          <a href={s.djs.presskit_url} target="_blank" rel="noopener noreferrer"
                                             className="flex items-center gap-1 px-2.5 py-1 rounded border border-border/60 bg-surface-2 text-accent-subtle hover:text-accent hover:border-white/20 transition-colors text-xs font-medium"
                                             title="Presskit">
                                            <ExternalLink size={12} />PK
                                          </a>
                                        )}
                                        {fotoUrl && (
                                          <a href={fotoUrl} target="_blank" rel="noopener noreferrer"
                                             className="flex items-center gap-1 px-2.5 py-1 rounded border border-border/60 bg-surface-2 text-accent-subtle hover:text-accent hover:border-white/20 transition-colors text-xs font-medium"
                                             title="Descarregar foto">
                                            <Download size={12} />Foto
                                          </a>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              )
                            })}

                            {/* ── Eventos ── */}
                            {eventosHoje.map(ev => (
                              <div key={ev.id} className="flex items-start gap-4">
                                <div className="w-20 h-20 rounded-xl bg-violet-500/10 border border-violet-500/25 flex flex-col items-center justify-center shrink-0 gap-1">
                                  <CalendarDays size={22} className="text-violet-400" />
                                  {ev.tipo && (
                                    <span className="text-[10px] text-violet-400/70 font-medium text-center px-1 leading-tight">{ev.tipo}</span>
                                  )}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className={clsx(
                                    'text-base font-bold text-accent leading-tight',
                                    ev.status === 'cancelado' && 'line-through text-accent-muted'
                                  )}>
                                    {ev.evento ?? '—'}
                                  </p>
                                  <p className="text-sm text-accent-muted mt-1 font-mono tabular-nums">
                                    {formatarHora(ev.hora_inicio)} – {formatarHora(ev.hora_fim)}
                                  </p>
                                  {ev.status === 'cancelado' && (
                                    <span className="inline-block text-xs font-semibold mt-1.5 text-status-cancelado">Cancelado</span>
                                  )}
                                  {ev.status === 'confirmado' && (
                                    <span className="inline-block text-xs font-semibold mt-1.5 text-status-confirmado">Confirmado</span>
                                  )}
                                  {ev.status === 'proposta' && (
                                    <span className="inline-block text-xs font-semibold mt-1.5 text-amber-400">Proposta</span>
                                  )}
                                </div>
                              </div>
                            ))}

                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

            ) : (

              /* ── Tabela por Cliente ── */
              <div className="p-6">
                {slotsDoEspaco.length === 0 && eventosDoEspaco.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-accent-subtle/40">
                    <CalendarDays size={32} className="mb-3 opacity-30" />
                    <p className="text-sm font-medium">Sem actividade em {tituloMes}</p>
                  </div>
                ) : (
                  <div className="flex flex-col gap-6">

                    {/* ── Slots (atuações DJ) ── */}
                    {slotsDoEspaco.length > 0 && (
                      <div className="bg-surface-1 border border-border rounded-xl overflow-hidden">
                        <div className="px-5 py-3.5 border-b border-border/50 flex items-center justify-between">
                          <p className="text-xs font-semibold text-accent uppercase tracking-wider">
                            Atuações DJ — {tituloMes}
                            <span className="ml-2 font-normal normal-case text-accent-subtle">({slotsDoEspaco.length})</span>
                          </p>
                          <p className="text-[10px] text-accent-subtle/50 italic">
                            Gerado em {format(new Date(), 'dd/MM/yyyy HH:mm')}
                          </p>
                        </div>
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="border-b border-border bg-surface-2/40">
                                <th className="text-left px-4 py-2.5 text-xs font-medium text-accent-subtle uppercase tracking-wider whitespace-nowrap">Data</th>
                                <th className="text-left px-4 py-2.5 text-xs font-medium text-accent-subtle uppercase tracking-wider whitespace-nowrap">Dia</th>
                                <th className="text-left px-4 py-2.5 text-xs font-medium text-accent-subtle uppercase tracking-wider whitespace-nowrap">Horário</th>
                                <th className="text-center px-3 py-2.5 text-xs font-medium text-accent-subtle uppercase tracking-wider">Foto</th>
                                <th className="text-left px-4 py-2.5 text-xs font-medium text-accent-subtle uppercase tracking-wider">DJ</th>
                                <th className="text-left px-4 py-2.5 text-xs font-medium text-accent-subtle uppercase tracking-wider">Bio</th>
                                <th className="text-center px-3 py-2.5 text-xs font-medium text-accent-subtle uppercase tracking-wider">Redes</th>
                                <th className="text-center px-3 py-2.5 text-xs font-medium text-accent-subtle uppercase tracking-wider">Presskit</th>
                                <th className="text-left px-4 py-2.5 text-xs font-medium text-accent-subtle uppercase tracking-wider">Estado</th>
                              </tr>
                            </thead>
                            <tbody>
                              {slotsDoEspaco.map((s, i) => {
                                const djNomeDisplay = s.djs?.nome_artistico ?? s.dj_nome ?? '—'
                                const fotoUrl = s.djs?.foto_url ?? null
                                const isCancelado = s.estado === 'cancelado'
                                const dataFmt = format(parseISO(s.data), 'dd/MM/yyyy')
                                const diaFmt  = cap(format(parseISO(s.data), 'EEE', { locale: pt }))
                                const isHoje  = s.data === HOJE

                                return (
                                  <tr key={s.id} className={clsx(
                                    i < slotsDoEspaco.length - 1 && 'border-b border-border/30',
                                    isCancelado
                                      ? 'opacity-35 bg-surface-2/20'
                                      : isHoje
                                        ? 'bg-status-confirmado/5 border-l-2 border-l-status-confirmado'
                                        : 'hover:bg-surface-2/30 transition-colors'
                                  )}>
                                    {/* Data */}
                                    <td className="px-4 py-3 font-mono tabular-nums text-accent-muted whitespace-nowrap">
                                      {dataFmt}
                                      {isHoje && <span className="ml-1.5 text-[9px] text-status-confirmado font-bold uppercase tracking-wider">hoje</span>}
                                    </td>
                                    {/* Dia */}
                                    <td className="px-4 py-3 text-accent-subtle whitespace-nowrap">{diaFmt}</td>
                                    {/* Horário */}
                                    <td className="px-4 py-3 font-mono tabular-nums text-accent-muted whitespace-nowrap">
                                      {formatarHora(s.hora_inicio)}–{formatarHora(s.hora_fim)}
                                    </td>
                                    {/* Foto — antes do nome */}
                                    <td className="px-3 py-3 text-center">
                                      {fotoUrl ? (
                                        <button onClick={() => setFotoModal({ nome: djNomeDisplay, url: fotoUrl })} title="Ver foto">
                                          <img src={fotoUrl} alt={djNomeDisplay}
                                            className="w-10 h-10 rounded-md object-cover border border-border hover:border-white/30 transition-colors cursor-zoom-in" />
                                        </button>
                                      ) : (
                                        <span className="text-border/30 text-[10px]">—</span>
                                      )}
                                    </td>
                                    {/* DJ Nome */}
                                    <td className="px-4 py-3">
                                      <span className={clsx('font-medium', isCancelado ? 'line-through text-accent-muted' : 'text-accent')}>
                                        {djNomeDisplay}
                                      </span>
                                    </td>
                                    {/* Bio */}
                                    <td className="px-4 py-3 text-center">
                                      {s.djs?.bio
                                        ? <button
                                            onClick={() => { setBioCopied(false); setBioModal({ nome: djNomeDisplay, bio: s.djs.bio }) }}
                                            title="Ver bio"
                                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-border/60 bg-surface-2 text-accent-muted hover:text-accent hover:border-white/25 hover:bg-surface-3 transition-colors text-[11px] font-medium"
                                          ><FileText size={12} />Bio</button>
                                        : <span className="text-border/30 text-[10px]">—</span>
                                      }
                                    </td>
                                    {/* Redes Sociais (Instagram + rede_social_url) */}
                                    <td className="px-3 py-3">
                                      <div className="flex items-center justify-center gap-2">
                                        {s.djs?.instagram_url ? (
                                          <a href={s.djs.instagram_url} target="_blank" rel="noopener noreferrer"
                                             className="text-pink-400/70 hover:text-pink-400 transition-colors" title="Instagram">
                                            <Instagram size={15} />
                                          </a>
                                        ) : <span className="w-[15px]" />}
                                        {s.djs?.rede_social_url ? (
                                          <a href={s.djs.rede_social_url} target="_blank" rel="noopener noreferrer"
                                             className="text-blue-400/70 hover:text-blue-400 transition-colors" title="Rede Social (TikTok/Facebook…)">
                                            <ExternalLink size={15} />
                                          </a>
                                        ) : <span className="w-[15px]" />}
                                      </div>
                                    </td>
                                    {/* Presskit — coluna separada */}
                                    <td className="px-3 py-3 text-center">
                                      {s.djs?.presskit_url ? (
                                        <a href={s.djs.presskit_url} target="_blank" rel="noopener noreferrer"
                                           className="inline-flex items-center gap-1 px-2 py-1 rounded border border-border/50 bg-surface-2/50 text-white/80 hover:text-white hover:border-white/30 transition-colors text-[10px] font-medium"
                                           title="Abrir Presskit">
                                          <ExternalLink size={10} />PK
                                        </a>
                                      ) : (
                                        <span className="text-border/30 text-[10px]">—</span>
                                      )}
                                    </td>
                                    {/* Estado */}
                                    <td className="px-4 py-3 whitespace-nowrap">
                                      <span className={clsx('text-[11px]', corEstadoMkt(s.estado))}>
                                        {labelEstadoMkt(s.estado)}
                                      </span>
                                    </td>
                                  </tr>
                                )
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {/* ── Xclusive ── */}
                    {xclusiveDoEspaco.length > 0 && (
                      <div className="bg-surface-1 border border-violet-500/20 rounded-xl overflow-hidden">
                        <div className="px-5 py-3.5 border-b border-violet-500/20 flex items-center justify-between bg-violet-500/5">
                          <p className="text-xs font-semibold text-violet-300 uppercase tracking-wider flex items-center gap-2">
                            <Star size={12} className="fill-violet-400 text-violet-400" />
                            Xclusive — {tituloMes}
                            <span className="ml-1 font-normal normal-case text-violet-400/60">({xclusiveDoEspaco.length})</span>
                          </p>
                        </div>
                        <div className="overflow-x-auto">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="border-b border-violet-500/15 bg-violet-500/5">
                                <th className="text-left px-4 py-2.5 text-[11px] font-medium text-violet-400/70 uppercase tracking-wider whitespace-nowrap">Data</th>
                                <th className="text-left px-4 py-2.5 text-[11px] font-medium text-violet-400/70 uppercase tracking-wider whitespace-nowrap">Dia</th>
                                <th className="text-left px-4 py-2.5 text-[11px] font-medium text-violet-400/70 uppercase tracking-wider whitespace-nowrap">Horário</th>
                                <th className="text-center px-3 py-2.5 text-[11px] font-medium text-violet-400/70 uppercase tracking-wider">Foto</th>
                                <th className="text-left px-4 py-2.5 text-[11px] font-medium text-violet-400/70 uppercase tracking-wider">Artista</th>
                                <th className="text-center px-3 py-2.5 text-[11px] font-medium text-violet-400/70 uppercase tracking-wider">Redes</th>
                                <th className="text-center px-3 py-2.5 text-[11px] font-medium text-violet-400/70 uppercase tracking-wider">Presskit</th>
                                <th className="text-left px-4 py-2.5 text-[11px] font-medium text-violet-400/70 uppercase tracking-wider">Estado</th>
                              </tr>
                            </thead>
                            <tbody>
                              {xclusiveDoEspaco.map((ev, i) => {
                                const artista   = ev.artistas ?? null
                                const nomeDisp  = artista?.nome ?? ev.evento ?? '—'
                                const fotoUrl   = artista?.foto_url ?? null
                                const dataFmt   = format(parseISO(ev.data_evento), 'dd/MM/yyyy')
                                const diaFmt    = cap(format(parseISO(ev.data_evento), 'EEE', { locale: pt }))
                                const isHoje    = ev.data_evento === HOJE
                                const isCancelado = ev.status === 'cancelado'
                                return (
                                  <tr key={ev.id} className={clsx(
                                    i < xclusiveDoEspaco.length - 1 && 'border-b border-violet-500/10',
                                    isCancelado ? 'opacity-35 bg-surface-2/20'
                                      : isHoje  ? 'bg-violet-500/8 border-l-2 border-l-violet-500'
                                      : 'hover:bg-violet-500/5 transition-colors'
                                  )}>
                                    <td className="px-4 py-3 font-mono tabular-nums text-accent-muted whitespace-nowrap">
                                      {dataFmt}
                                      {isHoje && <span className="ml-1.5 text-[9px] text-violet-400 font-bold uppercase tracking-wider">hoje</span>}
                                    </td>
                                    <td className="px-4 py-3 text-accent-subtle whitespace-nowrap">{diaFmt}</td>
                                    <td className="px-4 py-3 font-mono tabular-nums text-accent-muted whitespace-nowrap">
                                      {formatarHora(ev.hora_inicio)}–{formatarHora(ev.hora_fim)}
                                    </td>
                                    <td className="px-3 py-3 text-center">
                                      {fotoUrl ? (
                                        <div className="flex items-center justify-center gap-1">
                                          <a href={fotoUrl} target="_blank" rel="noopener noreferrer" title="Ver foto">
                                            <img src={fotoUrl} alt={nomeDisp}
                                              className="w-8 h-8 rounded-md object-cover border border-violet-500/30 hover:border-violet-400/60 transition-colors" />
                                          </a>
                                          <a href={fotoUrl} target="_blank" rel="noopener noreferrer"
                                             className="text-accent-subtle/40 hover:text-accent-muted transition-colors" title="Descarregar foto">
                                            <Download size={10} />
                                          </a>
                                        </div>
                                      ) : (
                                        <span className="text-border/30 text-[10px]">—</span>
                                      )}
                                    </td>
                                    <td className="px-4 py-3">
                                      <div className="flex items-center gap-1.5">
                                        <span className={clsx('font-medium', isCancelado ? 'line-through text-accent-muted' : 'text-accent')}>{nomeDisp}</span>
                                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-violet-500/15 text-violet-400 border border-violet-500/20 font-semibold uppercase tracking-wider">Xclusive</span>
                                      </div>
                                    </td>
                                    <td className="px-3 py-3">
                                      <div className="flex items-center justify-center gap-2">
                                        {artista?.instagram_url ? (
                                          <a href={artista.instagram_url} target="_blank" rel="noopener noreferrer"
                                             className="text-pink-400/70 hover:text-pink-400 transition-colors" title="Instagram">
                                            <Instagram size={13} />
                                          </a>
                                        ) : <span className="w-[13px]" />}
                                        {artista?.rede_social_url ? (
                                          <a href={artista.rede_social_url} target="_blank" rel="noopener noreferrer"
                                             className="text-blue-400/70 hover:text-blue-400 transition-colors" title="Rede Social">
                                            <ExternalLink size={13} />
                                          </a>
                                        ) : <span className="w-[13px]" />}
                                      </div>
                                    </td>
                                    <td className="px-3 py-3 text-center">
                                      {artista?.presskit_url ? (
                                        <a href={artista.presskit_url} target="_blank" rel="noopener noreferrer"
                                           className="inline-flex items-center gap-1 px-2 py-1 rounded border border-border/50 bg-surface-2/50 text-white/80 hover:text-white hover:border-white/30 transition-colors text-[10px] font-medium"
                                           title="Abrir Presskit">
                                          <ExternalLink size={10} />PK
                                        </a>
                                      ) : <span className="text-border/30 text-[10px]">—</span>}
                                    </td>
                                    <td className="px-4 py-3 whitespace-nowrap">
                                      <span className={clsx('text-[11px]', corEstadoMkt(ev.status))}>
                                        {labelEstadoMkt(ev.status)}
                                      </span>
                                    </td>
                                  </tr>
                                )
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Modal Foto ── */}
      {fotoModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/80 backdrop-blur-sm" onClick={() => setFotoModal(null)}>
          <div className="flex flex-col items-center gap-4 max-w-lg w-full" onClick={e => e.stopPropagation()}>
            <img
              src={fotoModal.url}
              alt={fotoModal.nome}
              className="w-full max-h-[70vh] object-contain rounded-2xl shadow-2xl border border-white/10"
            />
            <div className="flex items-center justify-between w-full">
              <p className="text-sm font-semibold text-white">{fotoModal.nome}</p>
              <div className="flex items-center gap-2">
                <a href={fotoModal.url} download target="_blank" rel="noopener noreferrer"
                   className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/20 bg-white/10 text-white/80 hover:text-white hover:bg-white/20 transition-colors text-xs font-medium">
                  <Download size={13} />Descarregar
                </a>
                <button onClick={() => setFotoModal(null)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/20 bg-white/10 text-white/80 hover:text-white hover:bg-white/20 transition-colors text-xs font-medium">
                  <Check size={13} />Fechar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal Bio ── */}
      {bioModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm" onClick={() => setBioModal(null)}>
          <div className="bg-surface-1 border border-border rounded-2xl w-full max-w-lg shadow-2xl flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-border flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-accent">{bioModal.nome}</p>
                <p className="text-[11px] text-accent-subtle/60 mt-0.5">Bio</p>
              </div>
              <button onClick={() => setBioModal(null)} className="text-accent-subtle hover:text-accent transition-colors p-1">
                <Check size={15} />
              </button>
            </div>
            <div className="px-6 py-5">
              <p className="text-sm text-accent leading-relaxed whitespace-pre-wrap">{bioModal.bio}</p>
            </div>
            <div className="px-6 py-4 border-t border-border flex justify-end">
              <button
                onClick={() => copiarBio(bioModal.bio)}
                className={clsx(
                  'flex items-center gap-2 px-4 py-2 rounded-lg border text-xs font-semibold transition-colors',
                  bioCopied
                    ? 'bg-status-confirmado/15 border-status-confirmado/30 text-status-confirmado'
                    : 'bg-surface-2 border-border text-accent-muted hover:text-accent hover:border-white/20'
                )}
              >
                {bioCopied ? <><Check size={13} />Copiado!</> : <><Copy size={13} />Copiar</>}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
