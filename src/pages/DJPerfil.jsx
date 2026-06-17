import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft, ArrowUp, ArrowDown, Printer,
  CalendarCheck, CalendarX, Plus, Trash2,
  Camera, Save, Check, Maximize2, Star,
  Copy, Mail, X, ExternalLink,
} from 'lucide-react'
import { useDJ, useDJs } from '@/hooks/useDJs'
import { useAgenda } from '@/hooks/useAgenda'
import { useConflitos } from '@/hooks/useConflitos'
import { useEspacos } from '@/hooks/useEspacos'
import {
  agendaApi, disponibilidadesApi,
  djsApi, djPreferenciasEspacoApi, espacoDjPreferenciasApi, categoriasDjApi, djCategoriasApi,
} from '@/lib/api'
import { supabase } from '@/lib/supabase'
import { useAppStore, useMesStore } from '@/store'
import { useUndo } from '@/contexts/UndoContext'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { LoadingPage } from '@/components/ui/LoadingSpinner'
import { Alerta } from '@/components/ui/Alerta'
import { EmptyState } from '@/components/ui/EmptyState'
import { FormSlot } from '@/components/agenda/FormSlot'
import { formatarData, formatarHora } from '@/utils/datas'
import { formatarEuro, labelEstadoDJ, corEstado } from '@/utils/formatacao'
import {
  format, addMonths, startOfMonth, endOfMonth, getDaysInMonth, parse, isValid,
} from 'date-fns'
import { pt } from 'date-fns/locale'
import { clsx } from 'clsx'

// ── Helpers ─────────────────────────────────────────────────────────────────

const ESTADOS_PRESENCA = [
  { value: 'presente',   label: 'Presente',   cor: 'text-status-confirmado' },
  { value: 'faltou',     label: 'Faltou',     cor: 'text-orange-400' },
  { value: 'confirmado', label: 'Confirmado', cor: 'text-status-confirmado' },
  { value: 'proposta',   label: 'Proposta',   cor: 'text-status-proposta' },
  { value: 'cancelado',  label: 'Cancelado',  cor: 'text-status-cancelado' },
]

const ESTADO_OPCOES = [
  { value: 'activo',     label: 'Activo' },
  { value: 'activo_ext', label: 'Activo EXT' },
  { value: 'inactivo',   label: 'Inactivo' },
  { value: 'banido',     label: 'Banido' },
]

const RATINGS = [
  { campo: 'qualidade_artistica', label: 'Qualidade Artística', sub: 'Musicalidade | Energia | Conexão' },
  { campo: 'assiduidade',         label: 'Assiduidade',         sub: 'Frequência | Pontualidade' },
  { campo: 'profissionalismo',    label: 'Profissionalismo',    sub: 'Imagem | Postura | Conduta' },
  { campo: 'adaptacao_espaco',    label: 'Adaptação ao Espaço', sub: 'Leitura | Progressão | Envolvência' },
]

const PREFS_OPCOES = [
  { value: 'prefere', label: 'Prefere', cor: 'bg-status-confirmado/20 text-status-confirmado border-status-confirmado/40' },
  { value: 'neutro',  label: 'Neutro',  cor: 'bg-surface-2 text-accent-muted border-border' },
  { value: 'recusa',  label: 'Recusa',  cor: 'bg-status-cancelado/20 text-status-cancelado border-status-cancelado/40' },
]

const HOJE = format(new Date(), 'yyyy-MM-dd')

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1)
const nomeMesAno = (anoMes) => {
  const [y, m] = anoMes.split('-')
  return cap(format(new Date(Number(y), Number(m) - 1, 1), 'MMMM yyyy', { locale: pt }))
}
const fmtDataCurta = (iso) => {
  try {
    const d = parse(iso, 'yyyy-MM-dd', new Date())
    return isValid(d) ? cap(format(d, "EEE d MMM yyyy", { locale: pt })) : iso
  } catch { return iso }
}

function gerarMeses() {
  const hoje = new Date()
  return Array.from({ length: 15 }, (_, i) => {
    const d = addMonths(startOfMonth(hoje), i - 3)
    return { value: format(d, 'yyyy-MM'), label: cap(format(d, 'MMMM yyyy', { locale: pt })) }
  })
}

const MESES_DISP = gerarMeses()

function slugify(str) {
  return (str ?? '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, '')
}

const APP_ABAS_OPCOES = [
  { id: 'agenda',           label: 'Agenda',           desc: 'Calendário de datas e actuações' },
  { id: 'dados',            label: 'Dados',             desc: 'Perfil e informação pessoal' },
  { id: 'disponibilidades', label: 'Disponibilidades',  desc: 'Gestão de disponibilidade (em breve)' },
  { id: 'learn',            label: 'Learn',             desc: 'Formação e conteúdos (em breve)' },
  { id: 'club',             label: 'Club',              desc: 'Secção Club (em breve)' },
]

// ── Contas helpers ───────────────────────────────────────────────────────────
const PAGAVEIS_C = new Set(['confirmado', 'presente', 'a_pedido'])
const CFG_C      = { horaExtraRate: 30, premioRate: 2, ivaRate: 0.23 }
function safeParseC(str, fb) { try { return str ? JSON.parse(str) : fb } catch { return fb } }
function isTransporteC(m) { return m ? /comporta|alcácer|grandola|grândola|melides|carvalhal|troia|tróia/i.test(m) : false }
function toMinC(t) { if (!t) return 0; const [h, mn] = t.split(':').map(Number); return h * 60 + mn }
function calcHorasExtraC(slot) {
  const padrao = slot.turnos_espaco?.hora_fim
  if (!padrao) return 0
  let diff = toMinC(slot.hora_fim) - toMinC(padrao)
  if (diff < 0) diff += 24 * 60
  return diff > 0 ? Math.round(diff / 30) * 0.5 : 0
}
function assStatusC(slot) {
  const p = slot.presencas_djs
  if (!p?.signed_at) return 'ausente'
  return new Date(p.signed_at) <= new Date(`${slot.data}T${slot.hora_inicio}`) ? 'a_tempo' : 'atrasada'
}

function BRow({ label, value, bold, accent }) {
  return (
    <div className="flex items-center justify-between px-4 py-2">
      <span className={clsx('text-xs', bold ? 'font-semibold text-accent' : 'text-accent-muted')}>{label}</span>
      <span className={clsx('text-xs tabular-nums font-semibold', accent ?? (bold ? 'text-accent' : 'text-accent-muted'))}>{value}</span>
    </div>
  )
}

// ── Shared small components ──────────────────────────────────────────────────

function RatingSelector({ label, sub, value, onChange }) {
  return (
    <div>
      <p className="text-xs font-medium text-accent-muted mb-0.5">
        {label}
        <span className="ml-1.5 text-accent-subtle font-normal">{value}/5</span>
      </p>
      {sub && <p className="text-[10px] text-accent-subtle/70 mb-1.5">{sub}</p>}
      <div className="flex gap-1">
        {[0, 1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" onClick={() => onChange(n)}
            className={clsx(
              'w-9 h-8 rounded text-xs font-semibold border transition-colors',
              value === n
                ? 'bg-white text-black border-white'
                : n <= value
                  ? 'bg-white/10 text-accent border-white/20'
                  : 'bg-surface-2 text-accent-subtle border-border hover:border-white/20 hover:text-accent-muted'
            )}>
            {n}
          </button>
        ))}
      </div>
    </div>
  )
}

function PrioridadeSelector({ value, onChange }) {
  return (
    <div>
      <p className="text-xs font-medium text-accent-muted mb-1.5">
        Prioridade admin
        <span className="ml-1.5 text-accent-subtle font-normal">{value}/10</span>
      </p>
      <div className="flex gap-1 flex-wrap">
        {[1,2,3,4,5,6,7,8,9,10].map((n) => (
          <button key={n} type="button" onClick={() => onChange(n)}
            className={clsx(
              'w-8 h-8 rounded text-xs font-semibold border transition-colors',
              value === n
                ? 'bg-accent text-black border-accent'
                : n <= value
                  ? 'bg-accent/20 text-accent border-accent/30'
                  : 'bg-surface-2 text-accent-subtle border-border hover:border-white/20 hover:text-accent-muted'
            )}>
            {n}
          </button>
        ))}
      </div>
      <p className="text-[11px] text-accent-subtle mt-1">1 = baixa prioridade · 10 = alta prioridade · padrão 5</p>
    </div>
  )
}

// ── Input style ──────────────────────────────────────────────────────────────
const iCls = 'w-full bg-surface-2 border border-border rounded px-3 py-2 text-xs text-accent placeholder:text-accent-subtle/40 focus:outline-none focus:border-white/30 focus:bg-surface-3 transition-colors'

function Field({ label, children, required }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[11px] font-medium text-accent-subtle uppercase tracking-wider">
        {label}{required && <span className="text-status-cancelado ml-0.5">*</span>}
      </label>
      {children}
    </div>
  )
}

// ── Main page ────────────────────────────────────────────────────────────────

export function DJPerfil() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { dj, loading: loadingDJ, erro: erroDJ, recarregar: recarregarDJ } = useDJ(id)
  const { agenda, loading: loadingAgenda, erro: erroAgenda, recarregar } = useAgenda({ djId: id })
  const { djs: todosDJs } = useDJs()

  // Lista ordenada alfabeticamente (igual à página /djs)
  const djsOrdenados = useMemo(() =>
    [...todosDJs].sort((a, b) =>
      (a.nome_artistico || a.nome).localeCompare(b.nome_artistico || b.nome)
    ), [todosDJs])
  const idxActual   = djsOrdenados.findIndex(d => d.id === id)
  const djAnterior  = idxActual > 0 ? djsOrdenados[idxActual - 1] : null
  const djProximo   = idxActual !== -1 && idxActual < djsOrdenados.length - 1 ? djsOrdenados[idxActual + 1] : null
  // Preferências podem existir para qualquer cliente activo (mesmo sem calendário semanal),
  // por isso usamos todos os espaços e filtramos apenas os inactivos.
  const { espacos: todosEspacos } = useEspacos({ todos: true })
  const espacos = todosEspacos.filter(e => e.activo !== false)

  // ── tabs ──
  const [aba, setAba] = useState('perfil')

  // ── agenda ──
  const [modalAberto, setModalAberto] = useState(false)
  const [slotSeleccionado, setSlotSeleccionado] = useState(null)
  const [filtroMes, setFiltroMes] = useState('todos')
  const [ordemDesc, setOrdemDesc] = useState(true)
  const [actualizando, setActualizando] = useState(null)

  // ── disponibilidade — dados ──
  const [disponibilidades, setDisponibilidades] = useState([])
  const [loadingDisp, setLoadingDisp] = useState(false)
  const [erroDisp, setErroDisp] = useState(null)

  // ── disponibilidade — formulário ──
  const [mesDisp, setMesDisp]             = useState(MESES_DISP[3].value)
  const [disponivelAdd, setDisponivelAdd] = useState(true)
  const [diasInput, setDiasInput]         = useState('')
  const [notasAdd, setNotasAdd]           = useState('')
  const [datasCarrinho, setDatasCarrinho] = useState([])
  const [guardandoDisp, setGuardandoDisp] = useState(false)
  const [erroAdd, setErroAdd]             = useState(null)
  const [sucessoAdd, setSucessoAdd]       = useState(false)
  const [filtroMesDisp, setFiltroMesDisp] = useState('todos')
  const { pushUndo } = useUndo()

  // ── perfil ──
  const [perfilForm, setPerfilForm]     = useState({})
  const [perfilLoading, setPerfilLoading] = useState(false)
  const [perfilErro, setPerfilErro]     = useState(null)
  const [perfilSucesso, setPerfilSucesso] = useState(false)
  const [prefsEspaco, setPrefsEspaco]   = useState({})
  const [prefsClienteDj, setPrefsClienteDj] = useState({}) // { [espaco_id]: 'preferido'|'excluido' }
  const [interesseCliente, setInteresseCliente] = useState({}) // { [espaco_id]: 1-5 } — estrelas do gestor via Operator
  const [avalManagers, setAvalManagers] = useState(null) // médias das avaliações dos gestores
  const [catsSel, setCatsSel]           = useState(['', '', ''])
  const [categorias, setCategorias]     = useState([])
  const [espacosAtribuidos, setEspacosAtribuidos] = useState(new Set())
  const [fotoFile, setFotoFile]         = useState(null)
  const [fotoPreview, setFotoPreview]   = useState(null)
  const fotoInputRef                    = useRef(null)
  const [bioModalAberto, setBioModalAberto] = useState(false)
  const [conviteAberto, setConviteAberto]   = useState(false)
  const [emailEditado, setEmailEditado]     = useState('')
  const [enviandoConvite, setEnviandoConvite] = useState(false)
  const [conviteEnviado, setConviteEnviado] = useState(false)
  const [conviteErro, setConviteErro]       = useState(null)
  const [copiado, setCopiado]               = useState(null)
  const [passLoading, setPassLoading]       = useState(false)
  const [passErro, setPassErro]             = useState(null)
  const [passSucesso, setPassSucesso]       = useState(false)

  // ── contas ──
  const { anoMes }      = useMesStore()
  const storeConfig     = useAppStore((s) => s.config)
  const [slotsContas, setSlotsContas]         = useState([])
  const [loadingContas, setLoadingContas]     = useState(false)
  const [docTipo, setDocTipo]                 = useState('recibo')
  const [comRetencao, setComRetencao]         = useState(false)
  const [retencaoPct, setRetencaoPct]         = useState(25)
  const [premioOverrideC, setPremioOverrideC] = useState(null)
  const [descontoOpC, setDescontoOpC]         = useState(2)
  const [contasSucesso, setContasSucesso]     = useState(false)

  // ── conflitos ──
  const { dataInicioRange, dataFimRange } = useMemo(() => {
    const datas = agenda.map(s => s.data).filter(Boolean).sort()
    return { dataInicioRange: datas[0] ?? null, dataFimRange: datas[datas.length - 1] ?? null }
  }, [agenda])
  const { conflictsIdx } = useConflitos({ agenda, dataInicio: dataInicioRange, dataFim: dataFimRange })

  const meses = useMemo(() => {
    const set = new Set(agenda.map(s => s.data?.slice(0, 7)).filter(Boolean))
    return [...set].sort()
  }, [agenda])

  const slotsFiltrados = useMemo(() => {
    let lista = filtroMes === 'todos' ? [...agenda] : agenda.filter(s => s.data?.startsWith(filtroMes))
    lista.sort((a, b) => { const c = a.data.localeCompare(b.data); return ordemDesc ? -c : c })
    return lista
  }, [agenda, filtroMes, ordemDesc])

  const totais = useMemo(() => ({
    total:      slotsFiltrados.length,
    presente:   slotsFiltrados.filter(s => s.estado === 'presente').length,
    faltou:     slotsFiltrados.filter(s => s.estado === 'faltou').length,
    confirmado: slotsFiltrados.filter(s => s.estado === 'confirmado').length,
    cancelado:  slotsFiltrados.filter(s => s.estado === 'cancelado').length,
    valor:      slotsFiltrados.reduce((acc, s) => acc + (s.valor ?? 0), 0),
  }), [slotsFiltrados])

  // ── carregar disponibilidades ──
  const carregarDisp = useCallback(async () => {
    if (!id) return
    setLoadingDisp(true)
    setErroDisp(null)
    try {
      const data = await disponibilidadesApi.listarPorDJ(id)
      setDisponibilidades(data ?? [])
    } catch (e) { setErroDisp(e.message) }
    finally { setLoadingDisp(false) }
  }, [id])

  useEffect(() => { if (aba === 'disponibilidade') carregarDisp() }, [aba, carregarDisp])

  // ── disponibilidades filtradas ──
  const dispFiltradas = useMemo(() => {
    let lista = filtroMesDisp === 'todos'
      ? [...disponibilidades]
      : disponibilidades.filter(d => d.data?.startsWith(filtroMesDisp))
    return lista.sort((a, b) => b.data.localeCompare(a.data))
  }, [disponibilidades, filtroMesDisp])

  const mesesDisp = useMemo(() => {
    const set = new Set(disponibilidades.map(d => d.data?.slice(0, 7)).filter(Boolean))
    return [...set].sort().reverse()
  }, [disponibilidades])

  // ── contas: config derivados ──
  const cfgTransportesCon = useMemo(() => safeParseC(storeConfig?.contas_transportes, [{ valor: 120 }]), [storeConfig])
  const cfgDescontosCon   = useMemo(() => safeParseC(storeConfig?.contas_descontos,   [{ valor: 2 }]),   [storeConfig])
  const transporteRateCon = cfgTransportesCon[0]?.valor ?? 120

  const { dataInicioCon, dataFimCon } = useMemo(() => {
    const [ano, mes] = anoMes.split('-').map(Number)
    const ref = new Date(ano, mes - 1, 1)
    return {
      dataInicioCon: format(startOfMonth(ref), 'yyyy-MM-dd'),
      dataFimCon:    format(endOfMonth(ref),   'yyyy-MM-dd'),
    }
  }, [anoMes])

  useEffect(() => {
    if (aba !== 'contas' || !id) return
    let cancelled = false
    setLoadingContas(true)
    supabase
      .from('agenda')
      .select(`
        id, dj_id, turno_id, data, hora_inicio, hora_fim, valor, estado,
        espacos(id, nome, morada),
        presencas_djs(agenda_id, signed_at, signed_by),
        turnos_espaco(hora_fim)
      `)
      .eq('dj_id', id)
      .gte('data', dataInicioCon)
      .lte('data', dataFimCon)
      .order('data')
      .then(({ data, error }) => {
        if (cancelled || error) return
        setSlotsContas(data ?? [])
      })
      .finally(() => { if (!cancelled) setLoadingContas(false) })
    return () => { cancelled = true }
  }, [aba, id, dataInicioCon, dataFimCon])

  const slotsRichCon = useMemo(() => {
    return slotsContas
      .filter(s => PAGAVEIS_C.has(s.estado))
      .map(s => ({
        ...s,
        horasExtra: calcHorasExtraC(s),
        transporte: isTransporteC(s.espacos?.morada),
        assStatus:  assStatusC(s),
      }))
  }, [slotsContas])

  const premioAutoC  = slotsRichCon.length > 0 && slotsRichCon.every(s => s.assStatus === 'a_tempo')
  const premioAtivoC = premioOverrideC !== null ? premioOverrideC : premioAutoC

  const calcCon = useMemo(() => {
    if (!slotsRichCon.length) return null
    const n             = slotsRichCon.length
    const valorAtuacoes = slotsRichCon.reduce((s, sl) => s + Number(sl.valor ?? 0), 0)
    const totalHExt     = slotsRichCon.reduce((s, sl) => s + sl.horasExtra, 0)
    const valorHExt     = totalHExt * CFG_C.horaExtraRate
    const nTransp       = slotsRichCon.filter(s => s.transporte).length
    const valorTransp   = nTransp * transporteRateCon
    const valorPremio   = premioAtivoC ? n * CFG_C.premioRate : 0
    const valorDesconto = descontoOpC * n
    const subtotal      = valorAtuacoes + valorHExt + valorTransp + valorPremio - valorDesconto
    const ajuste        = docTipo === 'fatura'
      ? subtotal * CFG_C.ivaRate
      : comRetencao ? -(subtotal * retencaoPct / 100) : 0
    const labelAjuste   = docTipo === 'fatura' ? 'IVA (23%)' : `Retenção (${retencaoPct}%)`
    return { n, valorAtuacoes, totalHExt, valorHExt, nTransp, valorTransp, valorPremio, valorDesconto, subtotal, ajuste, labelAjuste, total: subtotal + ajuste }
  }, [slotsRichCon, premioAtivoC, descontoOpC, docTipo, comRetencao, retencaoPct, transporteRateCon])

  // reset + carrega opções das contas por DJ (evita que opções de outro DJ persistam)
  useEffect(() => {
    if (!id) return
    setDocTipo('recibo')
    setComRetencao(false)
    setRetencaoPct(25)
    setDescontoOpC(2)
    setPremioOverrideC(null)
    setContasSucesso(false)
    setSlotsContas([])
    const raw = localStorage.getItem(`dj_contas_${id}`)
    if (!raw) return
    try {
      const s = JSON.parse(raw)
      if (s.docTipo)             setDocTipo(s.docTipo)
      if (s.comRetencao != null) setComRetencao(s.comRetencao)
      if (s.retencaoPct != null) setRetencaoPct(s.retencaoPct)
      if (s.descontoOpC != null) setDescontoOpC(s.descontoOpC)
    } catch {}
  }, [id])

  // ── carregar categorias globais (uma vez) ──
  useEffect(() => {
    categoriasDjApi.listar().then(setCategorias).catch(() => {})
  }, [])

  // ── carregar dados do perfil quando a aba abre ──
  useEffect(() => {
    if (aba !== 'perfil' || !dj) return
    setPerfilForm({
      nome:                 dj.nome                 ?? '',
      nome_artistico:       dj.nome_artistico        ?? '',
      whatsapp:             dj.whatsapp              ?? '',
      email:                dj.email                 ?? '',
      instagram_url:        dj.instagram_url          ?? '',
      rede_social_url:      dj.rede_social_url        ?? '',
      presskit_url:         dj.presskit_url           ?? '',
      estado:               dj.estado                ?? 'activo',
      notas:                dj.notas                 ?? '',
      valor_sessao:         dj.valor_sessao != null  ? String(dj.valor_sessao) : '',
      qualidade_artistica:  dj.qualidade_artistica   ?? 0,
      assiduidade:          dj.assiduidade           ?? 0,
      profissionalismo:     dj.profissionalismo      ?? 0,
      adaptacao_espaco:     dj.adaptacao_espaco      ?? 0,
      prioridade_admin:     dj.prioridade_admin      ?? 5,
      excluido_admin:       dj.excluido_admin        ?? false,
      bio:                  dj.bio                   ?? '',
      app_abas:             dj.app_abas              ?? null,
      password_app:         dj.password_app          ?? '',
    })
    setFotoFile(null)
    setFotoPreview(null)
    setPerfilErro(null)
    setPerfilSucesso(false)
    djCategoriasApi.listar(id)
      .then(ids => {
        const slots = ['', '', '']
        ids.forEach((cid, i) => { if (i < 3) slots[i] = String(cid) })
        setCatsSel(slots)
      }).catch(() => {})
    djPreferenciasEspacoApi.listar(id)
      .then(rows => {
        const map = {}
        rows.forEach(r => { map[r.espaco_id] = r.preferencia })
        setPrefsEspaco(map)
      }).catch(() => {})
    // Sentido inverso: o que os espaços marcaram sobre este DJ + interesse do gestor
    espacoDjPreferenciasApi.listarPorDj(id)
      .then(rows => {
        const mapPrefs = {}; const mapInteresse = {}
        ;(rows ?? []).forEach(r => {
          if (r.tipo === 'preferido' || r.tipo === 'excluido') mapPrefs[r.espaco_id] = r.tipo
          if (r.interesse != null) mapInteresse[r.espaco_id] = r.interesse
        })
        setPrefsClienteDj(mapPrefs)
        setInteresseCliente(mapInteresse)
      }).catch(() => {})

    supabase.from('dj_espacos_atribuidos').select('espaco_id').eq('dj_id', id)
      .then(({ data }) => setEspacosAtribuidos(new Set((data ?? []).map(r => r.espaco_id))))
      .catch(() => {})
    // Avaliações dos gestores via Operator (médias por dimensão, só gravadas)
    supabase.from('avaliacoes_djs').select(`
      nota_artistica, nota_assiduidade, nota_profissionalismo, nota_adaptacao,
      agenda!inner(dj_id)
    `).eq('agenda.dj_id', id).eq('gravado', true)
      .then(({ data }) => {
        const rows = (data ?? []).filter(r =>
          r.nota_artistica != null || r.nota_assiduidade != null ||
          r.nota_profissionalismo != null || r.nota_adaptacao != null
        )
        if (!rows.length) { setAvalManagers(null); return }
        const avg = (campo) => {
          const vals = rows.map(r => r[campo]).filter(v => v != null)
          return vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : null
        }
        setAvalManagers({
          artistica: avg('nota_artistica'),
          assiduidade: avg('nota_assiduidade'),
          profissionalismo: avg('nota_profissionalismo'),
          adaptacao: avg('nota_adaptacao'),
          total: rows.length,
        })
      }).catch(() => {})
  }, [aba, dj, id])

  // ── adicionar dias ao carrinho ──
  const adicionarAoCarrinho = useCallback(() => {
    if (!diasInput.trim()) return
    setErroAdd(null)
    const [ano, mNum] = mesDisp.split('-').map(Number)
    const maxDias = getDaysInMonth(new Date(ano, mNum - 1))
    const pad = (n) => String(n).padStart(2, '0')
    const partes = diasInput.split(/[\s,;]+/).map(s => s.trim()).filter(Boolean)
    const novas = []
    const invalidas = []
    for (const p of partes) {
      const n = parseInt(p, 10)
      if (isNaN(n) || n < 1 || n > maxDias) { invalidas.push(p); continue }
      const iso = `${ano}-${pad(mNum)}-${pad(n)}`
      if (!datasCarrinho.find(d => d.iso === iso) && !novas.find(d => d.iso === iso))
        novas.push({ iso, disponivel: disponivelAdd })
    }
    if (invalidas.length) setErroAdd(`Dias inválidos: ${invalidas.join(', ')}`)
    if (novas.length) {
      setDatasCarrinho(prev => [...prev, ...novas].sort((a, b) => a.iso.localeCompare(b.iso)))
      setDiasInput('')
    }
  }, [diasInput, mesDisp, datasCarrinho, disponivelAdd])

  // ── guardar disponibilidades ──
  const guardarDisp = async () => {
    if (datasCarrinho.length === 0) return
    setGuardandoDisp(true)
    setErroAdd(null)
    try {
      await Promise.all(datasCarrinho.map(d => disponibilidadesApi.registar(id, d.iso, d.disponivel, notasAdd)))
      setDatasCarrinho([])
      setDiasInput('')
      setNotasAdd('')
      setSucessoAdd(true)
      setTimeout(() => setSucessoAdd(false), 3000)
      carregarDisp()
    } catch (e) { setErroAdd(e.message) }
    finally { setGuardandoDisp(false) }
  }

  // ── apagar registo ──
  const apagarDisp = async (data) => {
    try {
      const backup = disponibilidades.find(d => d.data === data)
      await disponibilidadesApi.apagar(id, data)
      setDisponibilidades(prev => prev.filter(d => d.data !== data))
      pushUndo({
        label: `Data ${data} removida`,
        undo: async () => {
          await disponibilidadesApi.registar(id, data, backup?.disponivel ?? true, backup?.notas ?? '')
          carregarDisp()
        },
      })
    } catch (e) { setErroDisp(e.message) }
  }

  const alterarEstado = useCallback(async (slotId, estado) => {
    setActualizando(slotId)
    try { await agendaApi.actualizar(slotId, { estado }); recarregar() }
    catch { /* silencioso */ }
    finally { setActualizando(null) }
  }, [recarregar])

  const ciclarWpp = useCallback(async (slot) => {
    const proximo = slot.confirmacao_wpp == null ? 'confirmou'
      : slot.confirmacao_wpp === 'confirmou' ? 'nao_confirmou'
      : null
    setActualizando(slot.id)
    try { await agendaApi.mudarConfirmacaoWpp(slot.id, proximo); recarregar() }
    catch { /* silencioso */ }
    finally { setActualizando(null) }
  }, [recarregar])

  const abrirSlot = (slot) => { setSlotSeleccionado(slot); setModalAberto(true) }
  const fecharModal = () => { setModalAberto(false); setSlotSeleccionado(null) }

  // ── foto upload ──
  const handleFotoChange = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setFotoFile(file)
    setFotoPreview(URL.createObjectURL(file))
  }

  const uploadFoto = async (file) => {
    const path = `${id}` // fixed path per DJ, upsert replaces previous
    const { error } = await supabase.storage
      .from('dj-fotos')
      .upload(path, file, { upsert: true, contentType: file.type })
    if (error) throw error
    const { data: urlData } = supabase.storage.from('dj-fotos').getPublicUrl(path)
    // cache-bust so the browser reloads the new photo
    return `${urlData.publicUrl}?t=${Date.now()}`
  }

  // ── guardar password ──
  const guardarPassword = async () => {
    const pwd = perfilForm.password_app?.trim()
    if (!pwd) return
    setPassLoading(true)
    setPassErro(null)
    try {
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/update-dj-password`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ dj_id: id, password: pwd }),
        }
      )
      const json = await res.json()
      if (!res.ok || !json.ok) throw new Error(json.error ?? 'Erro desconhecido')
      recarregarDJ()
      setPassSucesso(true)
      setTimeout(() => setPassSucesso(false), 3500)
    } catch (e) {
      setPassErro(e.message)
    } finally {
      setPassLoading(false)
    }
  }

  // ── guardar perfil ──
  const guardarPerfil = async () => {
    if (!perfilForm.nome?.trim()) {
      setPerfilErro('Nome obrigatório.')
      return
    }
    setPerfilLoading(true)
    setPerfilErro(null)
    try {
      let foto_url = dj?.foto_url ?? null
      if (fotoFile) {
        foto_url = await uploadFoto(fotoFile)
      }
      const payload = {
        ...perfilForm,
        valor_sessao:    perfilForm.valor_sessao !== '' ? Number(perfilForm.valor_sessao) : null,
        prioridade_admin: Number(perfilForm.prioridade_admin),
        excluido_admin:  Boolean(perfilForm.excluido_admin),
        foto_url,
      }
      await djsApi.actualizar(id, payload)

      // Se a password mudou, sincronizar com auth.users via Edge Function
      const pwdAtual = perfilForm.password_app?.trim()
      if (pwdAtual && pwdAtual !== dj?.password_app) {
        await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/update-dj-password`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ dj_id: id, password: pwdAtual }),
          }
        )
      }

      const catsIds = catsSel.map(v => v === '' ? null : Number(v))
      await djCategoriasApi.guardar(id, catsIds)

      // As "Preferências do DJ" (dj_preferencias_espaco) são definidas pelo próprio DJ
      // e aqui apenas refletidas (read-only) — não são gravadas a partir do admin.

      // Sentido inverso: o que os espaços marcam sobre este DJ (preferido/excluido)
      const prefsClientes = Object.entries(prefsClienteDj)
        .filter(([, v]) => v === 'preferido' || v === 'excluido')
        .map(([espaco_id, tipo]) => ({ espaco_id, tipo }))
      await espacoDjPreferenciasApi.guardarPorDj(id, prefsClientes)

      // Espaços atribuídos para preferências do DJ
      await supabase.from('dj_espacos_atribuidos').delete().eq('dj_id', id)
      const atribRows = [...espacosAtribuidos].map(espaco_id => ({ dj_id: id, espaco_id }))
      if (atribRows.length) await supabase.from('dj_espacos_atribuidos').insert(atribRows)

      setFotoFile(null)
      recarregarDJ()
      setPerfilSucesso(true)
      setTimeout(() => setPerfilSucesso(false), 3500)
    } catch (e) {
      setPerfilErro(e.message)
    } finally {
      setPerfilLoading(false)
    }
  }

  if (loadingDJ) return <LoadingPage />
  if (erroDJ) return <Alerta tipo="erro" mensagem={erroDJ} className="m-6" />

  const tabCls = (t) => clsx(
    'px-4 py-2.5 text-xs font-medium border-b-2 transition-colors -mb-px',
    aba === t
      ? 'border-status-confirmado text-status-confirmado'
      : 'border-transparent text-accent-muted hover:text-accent'
  )

  // foto a mostrar no header (preview local tem prioridade)
  const fotoUrl = fotoPreview ?? dj?.foto_url ?? null

  return (
    <div className="flex flex-col h-full dj-perfil-wrap">
      <style>{`
        @media print {
          body, html { background: white !important; }
          .dj-perfil-wrap { background: white !important; color: #111 !important; height: auto !important; }
          .dj-perfil-wrap * { color: #111 !important; background: transparent !important; border-color: #ccc !important; box-shadow: none !important; }
          .no-print { display: none !important; }
          .dj-perfil-wrap table { border-collapse: collapse; width: 100%; }
          .dj-perfil-wrap th, .dj-perfil-wrap td { border-bottom: 1px solid #ddd; padding: 6px 10px; font-size: 11px; }
          .dj-perfil-wrap thead tr { border-bottom: 2px solid #999; }
          .dj-perfil-wrap .print-table-wrap { border: 1px solid #ccc; border-radius: 4px; overflow: visible; }
        }
      `}</style>

      {/* ── Header ── */}
      <div className="px-6 py-4 border-b border-border shrink-0">
        <div className="no-print flex items-center justify-between mb-3">
          <button onClick={() => navigate('/djs')}
            className="flex items-center gap-1.5 text-xs text-accent-muted hover:text-accent transition-colors">
            <ArrowLeft size={13} />Voltar aos DJs
          </button>
          <div className="flex items-center gap-1">
            <button
              onClick={() => djAnterior && navigate(`/djs/${djAnterior.id}`)}
              disabled={!djAnterior}
              title={djAnterior ? `← ${djAnterior.nome_artistico || djAnterior.nome}` : undefined}
              className="flex items-center gap-1 px-2.5 py-1 rounded border border-border bg-surface-2 text-xs text-accent-muted hover:text-accent hover:border-white/20 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ArrowUp size={12} className="-rotate-90" />
              {djAnterior ? (djAnterior.nome_artistico || djAnterior.nome) : 'Anterior'}
            </button>
            <button
              onClick={() => djProximo && navigate(`/djs/${djProximo.id}`)}
              disabled={!djProximo}
              title={djProximo ? `${djProximo.nome_artistico || djProximo.nome} →` : undefined}
              className="flex items-center gap-1 px-2.5 py-1 rounded border border-border bg-surface-2 text-xs text-accent-muted hover:text-accent hover:border-white/20 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              {djProximo ? (djProximo.nome_artistico || djProximo.nome) : 'Próximo'}
              <ArrowDown size={12} className="-rotate-90" />
            </button>
          </div>
        </div>
        {dj && (
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-3">
              {/* Miniatura foto */}
              {fotoUrl && (
                <img
                  src={fotoUrl}
                  alt={dj.nome_artistico || dj.nome}
                  className="w-10 h-10 rounded-lg object-cover shrink-0 border border-border"
                />
              )}
              <div>
                <div className="flex items-center gap-3 flex-wrap">
                  <h1 className="text-base font-semibold text-accent">{dj.nome_artistico || dj.nome}</h1>
                  {dj.nome_artistico && <span className="text-xs text-accent-muted">{dj.nome}</span>}
                  <Badge variante={dj.estado === 'activo' ? 'confirmado' : dj.estado === 'banido' ? 'ban' : 'default'}>
                    {labelEstadoDJ(dj.estado)}
                  </Badge>
                  {aba === 'perfil' && (
                    <>
                      <button onClick={guardarPerfil} disabled={perfilLoading}
                        className="flex items-center gap-1.5 px-2.5 py-1 rounded border border-border bg-surface-2 text-xs font-medium text-accent-muted hover:text-accent hover:border-white/20 transition-colors disabled:opacity-50">
                        {perfilLoading ? 'A guardar…' : <><Save size={11} />Guardar</>}
                      </button>
                      {perfilSucesso && (
                        <span className="text-[11px] text-status-confirmado flex items-center gap-1">
                          <Check size={11} />Guardado
                        </span>
                      )}
                    </>
                  )}
                  {aba === 'contas' && (
                    <>
                      <button
                        onClick={() => {
                          localStorage.setItem(`dj_contas_${id}`, JSON.stringify({ docTipo, comRetencao, retencaoPct, descontoOpC }))
                          setContasSucesso(true)
                          setTimeout(() => setContasSucesso(false), 2500)
                        }}
                        className="flex items-center gap-1.5 px-2.5 py-1 rounded border border-border bg-surface-2 text-xs font-medium text-accent-muted hover:text-accent hover:border-white/20 transition-colors">
                        <Save size={11} />Guardar
                      </button>
                      {contasSucesso && (
                        <span className="text-[11px] text-status-confirmado flex items-center gap-1">
                          <Check size={11} />Guardado
                        </span>
                      )}
                    </>
                  )}
                </div>
                <div className="flex items-center gap-4 mt-1.5 flex-wrap">
                  {dj.whatsapp && <span className="text-xs text-accent-muted">{dj.whatsapp}</span>}
                  {dj.email && <span className="text-xs text-accent-muted">{dj.email}</span>}
                  {dj.valor_sessao && <span className="text-xs text-accent-muted">{formatarEuro(dj.valor_sessao)} / sessão</span>}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-5 text-right flex-wrap">
              <div><p className="text-lg font-semibold text-accent tabular-nums">{totais.total}</p><p className="text-xs text-accent-muted">total</p></div>
              {totais.presente > 0 && <div><p className="text-lg font-semibold text-status-confirmado tabular-nums">{totais.presente}</p><p className="text-xs text-accent-muted">presente</p></div>}
              {totais.confirmado > 0 && <div><p className="text-lg font-semibold text-status-confirmado tabular-nums">{totais.confirmado}</p><p className="text-xs text-accent-muted">confirmado</p></div>}
              <div><p className="text-lg font-semibold text-orange-400 tabular-nums">{totais.faltou}</p><p className="text-xs text-accent-muted">faltou</p></div>
              {totais.cancelado > 0 && <div><p className="text-lg font-semibold text-status-cancelado tabular-nums">{totais.cancelado}</p><p className="text-xs text-accent-muted">cancelado</p></div>}
              {totais.valor > 0 && <div><p className="text-lg font-semibold text-accent tabular-nums">{formatarEuro(totais.valor)}</p><p className="text-xs text-accent-muted">valor total</p></div>}
            </div>
          </div>
        )}
      </div>

      {/* ── Tabs ── */}
      {(() => {
        return (
          <div className="no-print flex border-b border-border px-6 shrink-0">
            <button className={tabCls('perfil')} onClick={() => setAba('perfil')}>Dados</button>
            <button className={tabCls('agenda')} onClick={() => setAba('agenda')}>Agenda</button>
            <button className={tabCls('disponibilidade')} onClick={() => setAba('disponibilidade')}>
              Disponibilidades
              {disponibilidades.length > 0 && (
                <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full bg-surface-3 text-accent-subtle">{disponibilidades.length}</span>
              )}
            </button>
            <button className={tabCls('contas')} onClick={() => setAba('contas')}>Contas</button>
          </div>
        )
      })()}

      {/* ════ TAB PERFIL ════ */}
      {aba === 'perfil' && (
        <div className="flex-1 overflow-auto">
          <div className="p-6 flex flex-col gap-5 max-w-2xl">

            {perfilErro   && <Alerta tipo="erro" mensagem={perfilErro} />}
            {perfilSucesso && (
              <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-status-confirmado/30 bg-status-confirmado/10 text-status-confirmado text-xs font-medium">
                <Check size={13} />Alterações guardadas com sucesso.
              </div>
            )}

            {/* ── Foto + Info básica ── */}
            <div className="bg-surface-1 border border-border rounded-xl overflow-hidden">
              <div className="px-5 py-3.5 border-b border-border/50">
                <p className="text-xs font-semibold text-accent uppercase tracking-wider">Informação básica</p>
              </div>
              <div className="px-5 py-4 flex flex-col gap-4">

                {/* Foto */}
                <div className="flex items-center gap-4">
                  <div className="relative shrink-0">
                    {fotoPreview || dj?.foto_url ? (
                      <img
                        src={fotoPreview ?? dj.foto_url}
                        alt="Foto DJ"
                        className="w-20 h-20 rounded-xl object-cover border border-border"
                      />
                    ) : (
                      <div className="w-20 h-20 rounded-xl bg-surface-2 border border-border flex items-center justify-center">
                        <Camera size={20} className="text-accent-subtle/40" />
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col gap-2">
                    <input
                      ref={fotoInputRef}
                      type="file"
                      accept="image/jpeg,image/jpg,image/png,image/webp"
                      className="hidden"
                      onChange={handleFotoChange}
                    />
                    <button
                      type="button"
                      onClick={() => fotoInputRef.current?.click()}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-border bg-surface-2 text-xs text-accent-muted hover:text-accent hover:border-white/30 transition-colors"
                    >
                      <Camera size={12} />
                      {fotoPreview ? 'Trocar foto' : dj?.foto_url ? 'Substituir foto' : 'Adicionar foto'}
                    </button>
                    {fotoFile && (
                      <p className="text-[11px] text-accent-subtle">{fotoFile.name} · {(fotoFile.size / 1024).toFixed(0)} KB</p>
                    )}
                    <p className="text-[10px] text-accent-subtle/50">JPEG, PNG ou WebP · máx 5 MB</p>
                  </div>
                </div>

                {/* Nome + Nome artístico */}
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Nome" required>
                    <input
                      className={iCls}
                      value={perfilForm.nome ?? ''}
                      onChange={e => setPerfilForm(f => ({ ...f, nome: e.target.value }))}
                      placeholder="Nome completo"
                    />
                  </Field>
                  <Field label="Nome artístico">
                    <input
                      className={iCls}
                      value={perfilForm.nome_artistico ?? ''}
                      onChange={e => setPerfilForm(f => ({ ...f, nome_artistico: e.target.value }))}
                      placeholder="DJ Nome"
                    />
                  </Field>
                </div>

                {/* WhatsApp + Email */}
                <div className="grid grid-cols-2 gap-3">
                  <Field label="WhatsApp">
                    <input
                      type="tel"
                      className={iCls}
                      value={perfilForm.whatsapp ?? ''}
                      onChange={e => setPerfilForm(f => ({ ...f, whatsapp: e.target.value }))}
                      placeholder="+351 912 345 678"
                    />
                  </Field>
                  <Field label="Email">
                    <input
                      type="email"
                      className={iCls}
                      value={perfilForm.email ?? ''}
                      onChange={e => setPerfilForm(f => ({ ...f, email: e.target.value }))}
                      placeholder="dj@exemplo.com"
                    />
                  </Field>
                </div>

                {/* Instagram + Rede Social */}
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Instagram">
                    <input
                      type="url"
                      className={iCls}
                      value={perfilForm.instagram_url ?? ''}
                      onChange={e => setPerfilForm(f => ({ ...f, instagram_url: e.target.value }))}
                      placeholder="https://instagram.com/..."
                    />
                  </Field>
                  <Field label="Outra rede social">
                    <input
                      type="url"
                      className={iCls}
                      value={perfilForm.rede_social_url ?? ''}
                      onChange={e => setPerfilForm(f => ({ ...f, rede_social_url: e.target.value }))}
                      placeholder="TikTok, Facebook…"
                    />
                  </Field>
                </div>

                {/* Presskit */}
                <Field label="Link Presskit">
                  <input
                    type="url"
                    className={iCls}
                    value={perfilForm.presskit_url ?? ''}
                    onChange={e => setPerfilForm(f => ({ ...f, presskit_url: e.target.value }))}
                    placeholder="https://..."
                  />
                </Field>

                {/* Estado + Valor */}
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Estado">
                    <select
                      className={iCls}
                      value={perfilForm.estado ?? 'activo'}
                      onChange={e => setPerfilForm(f => ({ ...f, estado: e.target.value }))}
                    >
                      {ESTADO_OPCOES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </Field>
                  <Field label="Valor por sessão (€)">
                    <input
                      type="number"
                      min={0}
                      step={0.01}
                      className={iCls}
                      value={perfilForm.valor_sessao ?? ''}
                      onChange={e => setPerfilForm(f => ({ ...f, valor_sessao: e.target.value }))}
                      placeholder="150"
                    />
                  </Field>
                </div>
              </div>
            </div>

            {/* ── Acesso & Links ── */}
            {(() => {
              const slug     = slugify(dj.nome_artistico || dj.nome)
              const appUrl   = `https://xclusiveDJ.app/dj/${slug}`
              const kitUrl   = `https://mypresskitdj.com/${slug}`
              const copiar = (texto, key) => {
                navigator.clipboard.writeText(texto)
                setCopiado(key)
                setTimeout(() => setCopiado(null), 2000)
              }
              return (
                <div className="bg-surface-1 border border-border rounded-xl overflow-hidden">
                  <div className="px-5 py-3.5 border-b border-border/50 flex items-center justify-between">
                    <div>
                      <p className="text-xs font-semibold text-accent uppercase tracking-wider">Acesso & Links</p>
                      <p className="text-[11px] text-accent-subtle mt-0.5">Links do DJ para partilhar.</p>
                    </div>
                    <Button
                      variante="primary" tamanho="sm"
                      onClick={() => {
                        const s = slugify(dj.nome_artistico || dj.nome)
                        const url = `https://xclusiveDJ.app/dj/${s}`
                        const nome = (dj.nome_artistico || dj.nome || '').split(' ')[0]

                        // Datas futuras confirmadas/proposta
                        const proximas = agenda
                          .filter(sl => sl.data >= HOJE && (sl.estado === 'confirmado' || sl.estado === 'proposta'))
                          .sort((a, b) => a.data.localeCompare(b.data))

                        const secaoDatas = proximas.length > 0 ? `
———

DATAS ATRIBUÍDAS

${proximas.map(sl => {
  const dataFmt = cap(format(parse(sl.data, 'yyyy-MM-dd', new Date()), "EEEE, d 'de' MMMM yyyy", { locale: pt }))
  const horario = sl.hora_inicio ? `${formatarHora(sl.hora_inicio)}${sl.hora_fim ? `–${formatarHora(sl.hora_fim)}` : ''}` : ''
  return `📅 ${dataFmt}${sl.espaco_nome ? `\n📍 ${sl.espaco_nome}` : ''}${horario ? `\n🕙 ${horario}` : ''}${sl.evento ? `\n🎵 ${sl.evento}` : ''}`
}).join('\n\n')}

Assim que confirmares o teu perfil, as datas ficarão visíveis na tua agenda.` : ''

                        setEmailEditado(`Olá ${nome},

É com prazer que te damos as boas-vindas à XclusiveDJ — a plataforma que utilizamos para gerir toda a programação dos nossos espaços.

Criámos o teu perfil e está pronto para seres ativada.

———

O QUE É A XCLUSIVEDNJ.APP

A Xclusive DJ é a nossa plataforma de gestão de DJ's. É aqui que:
• Recebes as datas de atuação atribuídas
• Confirmas a tua disponibilidade
• Tens acesso ao detalhe de cada atuação (local, horário, valor)
• Manténs o teu perfil artístico atualizado (bio, links musicais, redes sociais)

———

O QUE PRECISAMOS DE TI

Acede à tua área pessoal através do link abaixo e completa o teu perfil:
• Nome artístico e bio
• Links musicais (Spotify, Soundcloud…)
• Foto de perfil
• Disponibilidades

👉 Aceder ao meu perfil: ${url}${secaoDatas}

———

Qualquer dúvida estou disponível.

Bem-vinda à equipa.

Paulo DiLight
LMD · XclusiveDJ`)
                        setConviteEnviado(false)
                        setConviteErro(null)
                        setConviteAberto(true)
                      }}
                    >
                      <Mail size={12} />Enviar convite
                    </Button>
                  </div>
                  <div className="px-5 py-4 flex flex-col gap-3">
                    {/* App */}
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-[11px] font-medium text-accent-muted uppercase tracking-wider mb-0.5">App Xclusive DJ</p>
                        <p className="text-xs text-accent font-mono truncate">{appUrl}</p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => copiar(appUrl, 'app')}
                          className="flex items-center gap-1 px-2.5 py-1.5 rounded border border-border bg-surface-2 text-xs text-accent-muted hover:text-accent transition-colors"
                          title="Copiar link"
                        >
                          {copiado === 'app' ? <><Check size={11} className="text-status-confirmado" /> Copiado</> : <><Copy size={11} /> Copiar</>}
                        </button>
                        <a href={appUrl} target="_blank" rel="noreferrer"
                          className="flex items-center justify-center w-7 h-7 rounded border border-border bg-surface-2 text-accent-muted hover:text-accent transition-colors">
                          <ExternalLink size={11} />
                        </a>
                      </div>
                    </div>
                    {/* Presskit */}
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-[11px] font-medium text-accent-muted uppercase tracking-wider mb-0.5">
                          Press Kit <span className="text-accent-subtle/60 normal-case font-normal">(em construção)</span>
                        </p>
                        <p className="text-xs text-accent font-mono truncate">{kitUrl}</p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => copiar(kitUrl, 'kit')}
                          className="flex items-center gap-1 px-2.5 py-1.5 rounded border border-border bg-surface-2 text-xs text-accent-muted hover:text-accent transition-colors"
                          title="Copiar link"
                        >
                          {copiado === 'kit' ? <><Check size={11} className="text-status-confirmado" /> Copiado</> : <><Copy size={11} /> Copiar</>}
                        </button>
                        <a href={kitUrl} target="_blank" rel="noreferrer"
                          className="flex items-center justify-center w-7 h-7 rounded border border-border bg-surface-2 text-xs text-accent-muted hover:text-accent/50 transition-colors opacity-40 cursor-not-allowed pointer-events-none">
                          <ExternalLink size={11} />
                        </a>
                      </div>
                    </div>
                  </div>
                </div>
              )
            })()}

            {/* ── App Xclusive DJ · abas visíveis ── */}
            <div className="bg-surface-1 border border-border rounded-xl overflow-hidden">
              <div className="px-5 py-3.5 border-b border-border/50">
                <p className="text-xs font-semibold text-accent uppercase tracking-wider">App Xclusive DJ</p>
                <p className="text-[11px] text-accent-subtle mt-0.5">Secções visíveis para este DJ na app.</p>
              </div>
              <div className="px-5 py-4 flex flex-col gap-3">
                {APP_ABAS_OPCOES.map(({ id, label, desc }) => {
                  const abas = perfilForm.app_abas ?? APP_ABAS_OPCOES.map(a => a.id)
                  const ativo = abas.includes(id)
                  const toggleAba = () => {
                    const atual = perfilForm.app_abas ?? APP_ABAS_OPCOES.map(a => a.id)
                    const nova = ativo ? atual.filter(a => a !== id) : [...atual, id]
                    setPerfilForm(f => ({ ...f, app_abas: nova.length === APP_ABAS_OPCOES.length ? null : nova }))
                  }
                  return (
                    <div key={id} className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-xs font-medium text-accent">{label}</p>
                        <p className="text-[11px] text-accent-subtle">{desc}</p>
                      </div>
                      <button
                        type="button"
                        onClick={toggleAba}
                        className={clsx(
                          'relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 transition-colors',
                          ativo
                            ? 'bg-status-confirmado/70 border-status-confirmado/50'
                            : 'bg-surface-3 border-border'
                        )}
                      >
                        <span className={clsx(
                          'inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform mt-[-1px]',
                          ativo ? 'translate-x-4' : 'translate-x-0.5'
                        )} />
                      </button>
                    </div>
                  )
                })}
                {perfilForm.app_abas !== null && perfilForm.app_abas?.length === 0 && (
                  <p className="text-[11px] text-status-cancelado/70">Atenção: sem nenhuma secção activa o DJ não vê nada na app.</p>
                )}

                {/* Password App */}
                <div className="flex flex-col gap-1.5 border border-border/60 rounded-lg p-3 bg-surface-2/40 mt-1">
                  <p className="text-[10px] font-bold text-accent-subtle/50 uppercase tracking-wider">Password App DJ</p>
                  {passErro && <p className="text-xs text-status-cancelado">{passErro}</p>}
                  {passSucesso && <p className="text-xs text-status-confirmado">Password actualizada.</p>}
                  <div className="flex gap-2 items-center">
                    <input
                      type="text"
                      className={clsx(iCls, 'flex-1 font-mono tracking-widest')}
                      value={perfilForm.password_app ?? ''}
                      onChange={e => setPerfilForm(f => ({ ...f, password_app: e.target.value }))}
                      placeholder="ex: 0000"
                    />
                    <button
                      type="button"
                      onClick={guardarPassword}
                      disabled={passLoading || !perfilForm.password_app?.trim()}
                      className="flex items-center gap-1.5 px-3 py-2 rounded border border-border bg-surface-2 text-xs font-medium text-accent-muted hover:text-accent hover:border-white/20 transition-colors disabled:opacity-40 whitespace-nowrap"
                    >
                      {passLoading ? 'A guardar…' : <><Save size={11} />Guardar</>}
                    </button>
                  </div>
                  <p className="text-[10px] text-accent-subtle/40">Actualiza a password no app do DJ e na conta Supabase Auth.</p>
                </div>
              </div>
            </div>

            {/* ── Bio ── */}
            <div className="bg-surface-1 border border-border rounded-xl overflow-hidden">
              <div className="px-5 py-3.5 border-b border-border/50 flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-accent uppercase tracking-wider">Bio</p>
                  <p className="text-[10px] text-accent-subtle/60 mt-0.5">Texto público sobre o DJ — aparece na área do marketing</p>
                </div>
                <button
                  onClick={() => setBioModalAberto(true)}
                  title="Editar em destaque"
                  className="p-1.5 rounded text-white/70 hover:text-white hover:bg-surface-2 transition-colors"
                >
                  <Maximize2 size={13} />
                </button>
              </div>
              <div className="px-5 py-4">
                <textarea
                  rows={4}
                  className={clsx(iCls, 'resize-none')}
                  value={perfilForm.bio ?? ''}
                  onChange={e => setPerfilForm(f => ({ ...f, bio: e.target.value }))}
                  placeholder="Breve descrição do DJ, estilo musical, experiência…"
                />
              </div>
            </div>

            {/* ── Bio modal expandido ── */}
            {bioModalAberto && (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm">
                <div className="bg-surface-1 border border-border rounded-2xl w-full max-w-2xl shadow-2xl flex flex-col overflow-hidden">
                  <div className="px-6 py-4 border-b border-border flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-accent">Bio</p>
                      <p className="text-[11px] text-accent-subtle/60 mt-0.5">Texto público sobre o DJ — aparece na área do marketing</p>
                    </div>
                    <button
                      onClick={() => setBioModalAberto(false)}
                      title="Fechar"
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-status-confirmado/15 text-status-confirmado border border-status-confirmado/25 hover:bg-status-confirmado/25 transition-colors text-xs font-semibold"
                    >
                      <Check size={13} />Fechar
                    </button>
                  </div>
                  <div className="p-6">
                    <textarea
                      autoFocus
                      rows={12}
                      className={clsx(iCls, 'resize-none text-sm leading-relaxed')}
                      value={perfilForm.bio ?? ''}
                      onChange={e => setPerfilForm(f => ({ ...f, bio: e.target.value }))}
                      placeholder="Breve descrição do DJ, estilo musical, experiência…"
                    />
                    <p className="text-[10px] text-accent-subtle/40 mt-2 text-right">
                      {(perfilForm.bio ?? '').length} caracteres
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* ── Categorias ── */}
            {categorias.length > 0 && (
              <div className="bg-surface-1 border border-border rounded-xl overflow-hidden">
                <div className="px-5 py-3.5 border-b border-border/50">
                  <p className="text-xs font-semibold text-accent uppercase tracking-wider">Categorias</p>
                </div>
                <div className="px-5 py-4">
                  <div className="grid grid-cols-3 gap-3">
                    {[0, 1, 2].map(i => (
                      <Field key={i} label={`Categoria ${i + 1}`}>
                        <select
                          className={iCls}
                          value={catsSel[i]}
                          onChange={e => {
                            const next = [...catsSel]
                            next[i] = e.target.value
                            setCatsSel(next)
                          }}
                        >
                          <option value="">—</option>
                          {categorias.map(c => (
                            <option
                              key={c.id}
                              value={String(c.id)}
                              disabled={catsSel.some((v, j) => j !== i && v === String(c.id))}
                            >
                              {c.nome}
                            </option>
                          ))}
                        </select>
                      </Field>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ── Scoring ── */}
            {(() => {
              // Admin: 4 × (val directo 0-5) = 0-20 (1 estrela = 1 ponto)
              const adminCampos = [
                { campo: 'qualidade_artistica',  label: 'Qualidade Artística' },
                { campo: 'assiduidade',           label: 'Assiduidade' },
                { campo: 'profissionalismo',      label: 'Profissionalismo' },
                { campo: 'adaptacao_espaco',      label: 'Adaptação ao Espaço' },
              ]
              const adminTotal = adminCampos.reduce((s, { campo }) =>
                s + (perfilForm[campo] ?? 0), 0) // 0–20

              // Manager: 4 × (avg/5 × 15) = 0–60
              const managerDims = avalManagers
                ? [
                    { key: 'artistica',       label: 'Qualidade Artística',  val: avalManagers.artistica },
                    { key: 'assiduidade',     label: 'Assiduidade',          val: avalManagers.assiduidade },
                    { key: 'profissionalismo', label: 'Profissionalismo',    val: avalManagers.profissionalismo },
                    { key: 'adaptacao',       label: 'Adaptação ao Espaço',  val: avalManagers.adaptacao },
                  ]
                : []
              const managerTotal = managerDims.reduce((s, { val }) =>
                s + ((val ?? 0) / 5) * 15, 0)

              const finalScore = Math.round(adminTotal + managerTotal)
              const pct = Math.min(100, finalScore)

              const scoreColor = finalScore >= 80 ? 'text-status-confirmado' :
                                 finalScore >= 60 ? 'text-yellow-400' :
                                 finalScore >= 40 ? 'text-orange-400' : 'text-status-cancelado'
              const barColor   = finalScore >= 80 ? 'bg-status-confirmado' :
                                 finalScore >= 60 ? 'bg-yellow-400' :
                                 finalScore >= 40 ? 'bg-orange-400' : 'bg-status-cancelado'

              return (
                <div className="bg-surface-1 border border-border rounded-xl overflow-hidden">
                  <div className="px-5 py-3.5 border-b border-border/50 flex items-center justify-between">
                    <p className="text-xs font-semibold text-accent uppercase tracking-wider">Scoring</p>
                    <div className="flex items-center gap-2">
                      <span className={`text-2xl font-black tabular-nums ${scoreColor}`}>{finalScore}</span>
                      <span className="text-sm text-accent-subtle">/ 100</span>
                    </div>
                  </div>

                  {/* Barra total */}
                  <div className="mx-5 mt-4 mb-2 h-2 rounded-full bg-surface-3 overflow-hidden">
                    <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${pct}%` }} />
                  </div>

                  {/* Admin — editável */}
                  <div className="px-5 pt-3 pb-4">
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-[11px] font-semibold text-accent-muted uppercase tracking-wider">Minha avaliação · 40%</p>
                      <span className="text-xs font-bold text-accent tabular-nums">{adminTotal.toFixed(1)} / 40</span>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      {adminCampos.map(({ campo, label }) => (
                        <div key={campo}>
                          <div className="flex items-center justify-between mb-1">
                            <p className="text-[11px] text-accent-muted">{label}</p>
                            <span className="text-[10px] text-accent-subtle tabular-nums">
                              {((perfilForm[campo] ?? 0) / 5 * 10).toFixed(0)} / 10
                            </span>
                          </div>
                          <div className="flex gap-1">
                            {[1,2,3,4,5].map(n => (
                              <button key={n} type="button"
                                onClick={() => setPerfilForm(f => ({ ...f, [campo]: n }))}
                                className="p-0.5 transition-transform active:scale-90"
                              >
                                <Star size={16}
                                  fill={n <= (perfilForm[campo] ?? 0) ? 'currentColor' : 'none'}
                                  className={n <= (perfilForm[campo] ?? 0) ? 'text-white' : 'text-accent-subtle/40'}
                                  strokeWidth={1.5}
                                />
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Manager — read-only */}
                  <div className="border-t border-border/50 px-5 pt-3 pb-4">
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-[11px] font-semibold text-accent-muted uppercase tracking-wider">
                        Gestores · 60%
                        {avalManagers && <span className="ml-1.5 font-normal normal-case">· {avalManagers.total} aval.</span>}
                      </p>
                      <span className="text-xs font-bold text-accent tabular-nums">{managerTotal.toFixed(1)} / 60</span>
                    </div>
                    {!avalManagers ? (
                      <p className="text-[11px] text-accent-subtle italic">Sem avaliações gravadas pelos gestores.</p>
                    ) : (
                      <div className="grid grid-cols-2 gap-3">
                        {managerDims.map(({ key, label, val }) => {
                          const avg = val != null ? Math.round(val * 10) / 10 : null
                          return (
                            <div key={key}>
                              <div className="flex items-center justify-between mb-1">
                                <p className="text-[11px] text-accent-muted">{label}</p>
                                <span className="text-[10px] text-accent-subtle tabular-nums">
                                  {avg != null ? `${avg} / 5` : '—'}
                                </span>
                              </div>
                              <div className="flex gap-0.5">
                                {[1,2,3,4,5].map(n => (
                                  <Star key={n} size={14}
                                    fill={avg != null && n <= Math.round(avg) ? 'currentColor' : 'none'}
                                    className={avg != null && n <= Math.round(avg) ? 'text-yellow-400' : 'text-accent-subtle/30'}
                                    strokeWidth={1.5}
                                  />
                                ))}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                </div>
              )
            })()}

            {/* ── Distribuição automática ── */}
            <div className="bg-surface-1 border border-border rounded-xl overflow-hidden">
              <div className="px-5 py-3.5 border-b border-border/50">
                <p className="text-xs font-semibold text-accent uppercase tracking-wider">Distribuição automática</p>
              </div>
              <div className="px-5 py-4 flex flex-col gap-4">
                <PrioridadeSelector
                  value={perfilForm.prioridade_admin ?? 5}
                  onChange={v => setPerfilForm(f => ({ ...f, prioridade_admin: v }))}
                />
                <div className="flex items-center justify-between py-2 px-3 rounded border border-border bg-surface-2/50">
                  <div>
                    <p className="text-xs font-medium text-accent">Excluir da distribuição automática</p>
                    <p className="text-[11px] text-accent-subtle mt-0.5">O WF2 nunca atribui este DJ a nenhum Cliente</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setPerfilForm(f => ({ ...f, excluido_admin: !f.excluido_admin }))}
                    className={clsx(
                      'relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 transition-colors',
                      perfilForm.excluido_admin
                        ? 'bg-status-cancelado/70 border-status-cancelado/50'
                        : 'bg-surface-3 border-border'
                    )}
                  >
                    <span className={clsx(
                      'inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform mt-[-1px]',
                      perfilForm.excluido_admin ? 'translate-x-4' : 'translate-x-0.5'
                    )} />
                  </button>
                </div>
              </div>
            </div>

            {/* ── Notas ── */}
            <div className="bg-surface-1 border border-border rounded-xl overflow-hidden">
              <div className="px-5 py-3.5 border-b border-border/50">
                <p className="text-xs font-semibold text-accent uppercase tracking-wider">Notas</p>
              </div>
              <div className="px-5 py-4">
                <textarea
                  rows={3}
                  className={clsx(iCls, 'resize-none')}
                  value={perfilForm.notas ?? ''}
                  onChange={e => setPerfilForm(f => ({ ...f, notas: e.target.value }))}
                  placeholder="Preferências para a distribuição, observações…"
                />
              </div>
            </div>

            {/* ── Preferências dos Clientes (sentido espaço → DJ, editável) ── */}
            {espacos.length > 0 && (
              <div className="bg-surface-1 border border-border rounded-xl overflow-hidden">
                <div className="px-5 py-3.5 border-b border-border/50">
                  <p className="text-xs font-semibold text-accent uppercase tracking-wider">Preferências dos Clientes</p>
                  <p className="text-[11px] text-accent-subtle mt-0.5">Como cada cliente classifica este DJ.</p>
                </div>
                <div className="px-5 py-4 flex flex-col gap-3">
                  {espacos.map(esp => {
                    const pref = prefsClienteDj[esp.id] ?? 'neutro'
                    const interesse = interesseCliente[esp.id] ?? null
                    return (
                      <div key={esp.id} className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <span className="text-xs text-accent-muted w-36 truncate shrink-0">{esp.nome}</span>
                          {/* Estrelas interesse do gestor */}
                          {interesse != null && (
                            <div className="flex items-center gap-0.5" title={`Interesse: ${interesse}/5`}>
                              {[1,2,3,4,5].map(n => (
                                <Star key={n} size={11}
                                  fill={n <= interesse ? 'currentColor' : 'none'}
                                  className={n <= interesse ? 'text-yellow-400' : 'text-accent-subtle/25'}
                                  strokeWidth={1.5}
                                />
                              ))}
                            </div>
                          )}
                        </div>
                        <div className="flex gap-1 shrink-0">
                          {[
                            { value: 'preferido', label: 'Preferido', cor: 'bg-status-confirmado/20 text-status-confirmado border-status-confirmado/40' },
                            { value: 'neutro',    label: 'Neutro',    cor: 'bg-surface-2 text-accent-muted border-border' },
                            { value: 'excluido',  label: 'Excluído',  cor: 'bg-status-cancelado/20 text-status-cancelado border-status-cancelado/40' },
                          ].map(op => (
                            <button
                              key={op.value}
                              type="button"
                              onClick={() => setPrefsClienteDj(p => ({ ...p, [esp.id]: op.value }))}
                              className={clsx(
                                'px-2.5 py-1 rounded border text-[11px] font-medium transition-colors',
                                pref === op.value
                                  ? op.cor
                                  : 'bg-surface-2 text-accent-subtle border-border hover:text-accent-muted'
                              )}
                            >
                              {op.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* ── Espaços visíveis para preferências (gestor define) ── */}
            {espacos.length > 0 && (
              <div className="bg-surface-1 border border-border rounded-xl overflow-hidden">
                <div className="px-5 py-3.5 border-b border-border/50">
                  <p className="text-xs font-semibold text-accent uppercase tracking-wider">Preferências Espaços Admin</p>
                  <p className="text-[11px] text-accent-subtle mt-0.5">Espaços que este DJ pode ver e avaliar preferências na sua app.</p>
                </div>
                <div className="px-5 py-4 flex flex-col gap-3">
                  {espacos.map(esp => {
                    const ativo = espacosAtribuidos.has(esp.id)
                    return (
                      <div key={esp.id} className="flex items-center justify-between gap-3">
                        <span className="text-xs text-accent-muted">{esp.nome}</span>
                        <button
                          type="button"
                          onClick={() => setEspacosAtribuidos(prev => {
                            const next = new Set(prev)
                            if (next.has(esp.id)) next.delete(esp.id)
                            else next.add(esp.id)
                            return next
                          })}
                          className={clsx(
                            'px-3 py-1 rounded border text-[11px] font-semibold transition-colors',
                            ativo
                              ? 'bg-status-confirmado/20 text-status-confirmado border-status-confirmado/40'
                              : 'bg-surface-2 text-accent-subtle border-border hover:border-white/20 hover:text-accent-muted'
                          )}
                        >
                          {ativo ? 'Visível' : 'Oculto'}
                        </button>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* ── Preferências do DJ (sentido DJ → espaço, read-only — definidas pelo próprio DJ) ── */}
            {espacos.length > 0 && (
              <div className="bg-surface-1 border border-border rounded-xl overflow-hidden">
                <div className="px-5 py-3.5 border-b border-border/50">
                  <p className="text-xs font-semibold text-accent uppercase tracking-wider">Preferências do DJ</p>
                  <p className="text-[11px] text-accent-subtle mt-0.5">As opções escolhidas pelo próprio DJ (só leitura).</p>
                </div>
                <div className="px-5 py-4 flex flex-col gap-3">
                  {espacos.map(esp => {
                    const pref = prefsEspaco[esp.id] ?? 'neutro'
                    const op = PREFS_OPCOES.find(o => o.value === pref) ?? PREFS_OPCOES[1]
                    return (
                      <div key={esp.id} className="flex items-center justify-between gap-3">
                        <span className="text-xs text-accent-muted w-36 truncate">{esp.nome}</span>
                        <span className={clsx('px-2.5 py-1 rounded border text-[11px] font-medium', op.cor)}>
                          {op.label}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}


          </div>
        </div>
      )}

      {/* ── Modal convite ── */}
      {conviteAberto && dj && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setConviteAberto(false)}>
          <div className="bg-surface-1 border border-border rounded-xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl" onClick={e => e.stopPropagation()}>

            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
              <div className="flex items-center gap-2">
                <Mail size={14} className="text-accent-muted" />
                <div>
                  <p className="text-sm font-semibold text-accent">Convite · {dj.nome_artistico || dj.nome}</p>
                  {dj.email && <p className="text-[11px] text-accent-subtle">Para: {dj.email}</p>}
                </div>
              </div>
              <button onClick={() => setConviteAberto(false)} className="text-accent-subtle hover:text-accent transition-colors">
                <X size={16} />
              </button>
            </div>

            {/* Subject */}
            <div className="px-5 pt-4 shrink-0">
              <p className="text-[10px] font-semibold text-accent-subtle uppercase tracking-wider mb-1">Assunto</p>
              <p className="text-xs text-accent bg-surface-2 border border-border rounded px-3 py-2">
                Bem-vinda à XclusiveDJ · O teu perfil está pronto
              </p>
            </div>

            {/* Body editável */}
            <div className="flex-1 overflow-auto px-5 py-3 min-h-0">
              <p className="text-[10px] font-semibold text-accent-subtle uppercase tracking-wider mb-1">Mensagem <span className="font-normal normal-case text-accent-subtle/60">(editável)</span></p>
              <textarea
                className="w-full h-full min-h-[320px] text-xs text-accent-muted font-mono leading-relaxed bg-surface-2 border border-border rounded-lg p-4 resize-none focus:outline-none focus:border-white/20 transition-colors"
                value={emailEditado}
                onChange={e => setEmailEditado(e.target.value)}
              />
            </div>

            {/* Feedback */}
            {conviteEnviado && (
              <div className="mx-5 mb-2 flex items-center gap-2 px-3 py-2 rounded border border-status-confirmado/30 bg-status-confirmado/10 text-status-confirmado text-xs">
                <Check size={12} />Email enviado com sucesso para {dj.email}
              </div>
            )}
            {conviteErro && (
              <div className="mx-5 mb-2 px-3 py-2 rounded border border-status-cancelado/30 bg-status-cancelado/10 text-status-cancelado text-xs">
                {conviteErro}
              </div>
            )}

            {/* Footer */}
            <div className="flex items-center justify-between gap-2 px-5 py-3 border-t border-border shrink-0">
              <button
                onClick={() => {
                  navigator.clipboard.writeText(emailEditado)
                  setCopiado('email')
                  setTimeout(() => setCopiado(null), 2500)
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-border bg-surface-2 text-xs text-accent-muted hover:text-accent transition-colors"
              >
                {copiado === 'email' ? <><Check size={11} className="text-status-confirmado" />Copiado</> : <><Copy size={11} />Copiar</>}
              </button>

              <div className="flex items-center gap-2">
                <button onClick={() => setConviteAberto(false)} className="px-3 py-1.5 text-xs text-accent-muted hover:text-accent transition-colors">
                  Fechar
                </button>
                {dj.email ? (
                  <Button
                    variante="primary" tamanho="sm"
                    loading={enviandoConvite}
                    onClick={async () => {
                      setEnviandoConvite(true)
                      setConviteErro(null)
                      try {
                        const res = await fetch('https://i4dj.app.n8n.cloud/webhook/enviar-convite-dj', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            to: dj.email,
                            subject: 'Bem-vinda à XclusiveDJ · O teu perfil está pronto',
                            body: emailEditado,
                          }),
                        })
                        if (!res.ok) throw new Error(`Erro ${res.status}`)
                        setConviteEnviado(true)
                        setTimeout(() => setConviteAberto(false), 2500)
                      } catch (e) {
                        setConviteErro('Não foi possível enviar o email. Verifica a ligação.')
                      } finally {
                        setEnviandoConvite(false)
                      }
                    }}
                  >
                    <Mail size={12} />Enviar para {dj.email}
                  </Button>
                ) : (
                  <span className="text-[11px] text-accent-subtle italic">Sem email registado — não é possível enviar.</span>
                )}
              </div>
            </div>

          </div>
        </div>
      )}

      {/* ════ TAB AGENDA ════ */}
      {aba === 'agenda' && (
        <>
          <div className="no-print px-6 py-3 border-b border-border flex items-center gap-3 shrink-0 flex-wrap">
            <select value={filtroMes} onChange={e => setFiltroMes(e.target.value)}
              className="bg-surface-2 border border-border rounded px-2 py-1.5 text-xs text-accent-muted focus:outline-none">
              <option value="todos">Todos os meses</option>
              {meses.map(m => <option key={m} value={m}>{nomeMesAno(m)}</option>)}
            </select>
            <button onClick={() => setOrdemDesc(v => !v)}
              className="flex items-center gap-1 text-xs text-accent-muted hover:text-accent transition-colors border border-border rounded px-2 py-1.5 bg-surface-2">
              {ordemDesc ? <ArrowDown size={12} /> : <ArrowUp size={12} />}
              {ordemDesc ? 'Mais recente' : 'Mais antigo'}
            </button>
            <span className="text-xs text-accent-subtle ml-auto">{slotsFiltrados.length} data{slotsFiltrados.length !== 1 ? 's' : ''}</span>
            <button onClick={() => window.print()}
              className="flex items-center gap-1.5 text-xs text-accent-muted hover:text-accent transition-colors border border-border rounded px-2 py-1.5 bg-surface-2">
              <Printer size={12} />Imprimir
            </button>
          </div>

          <div className="flex-1 overflow-auto px-6 py-4">
            {loadingAgenda && <LoadingPage />}
            {erroAgenda && <Alerta tipo="erro" mensagem={erroAgenda} />}
            {!loadingAgenda && !erroAgenda && slotsFiltrados.length === 0 && (
              <EmptyState titulo="Nenhuma data" descricao="Sem datas para os filtros seleccionados." />
            )}
            {!loadingAgenda && !erroAgenda && slotsFiltrados.length > 0 && (
              <div className="bg-surface-1 border border-border rounded-lg overflow-hidden print-table-wrap">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left px-4 py-2.5 text-xs font-medium text-accent-muted">Data</th>
                      <th className="text-left px-4 py-2.5 text-xs font-medium text-accent-muted">Cliente</th>
                      <th className="text-left px-4 py-2.5 text-xs font-medium text-accent-muted">Horário</th>
                      <th className="text-left px-4 py-2.5 text-xs font-medium text-accent-muted">Evento</th>
                      <th className="text-left px-4 py-2.5 text-xs font-medium text-accent-muted">Valor</th>
                      <th className="text-left px-4 py-2.5 text-xs font-medium text-accent-muted">Estado</th>
                      <th className="text-center px-4 py-2.5 text-xs font-medium text-accent-muted" title="Presença Confirmada por WhatsApp">PCW</th>
                      <th className="no-print px-4 py-2.5" />
                    </tr>
                  </thead>
                  <tbody>
                    {slotsFiltrados.map((slot, i) => {
                      const eHoje = slot.data === HOJE
                      const temConflito = conflictsIdx.has(slot.id)
                      return (
                        <tr key={slot.id} className={clsx(
                          i < slotsFiltrados.length - 1 && 'border-b border-border/50',
                          temConflito ? 'bg-red-500/[0.06] border-l-2 border-l-red-500/70'
                            : eHoje ? 'bg-status-confirmado/5 border-l-2 border-l-status-confirmado'
                            : 'hover:bg-surface-2/40 transition-colors'
                        )}>
                          <td className="px-4 py-3 tabular-nums">
                            <span className={clsx('font-medium', eHoje ? 'text-status-confirmado' : 'text-accent')}>{formatarData(slot.data)}</span>
                            {eHoje && <span className="ml-2 text-[10px] text-status-confirmado font-semibold uppercase tracking-wider">hoje</span>}
                          </td>
                          <td className="px-4 py-3 text-accent-muted">{slot.espaco_nome ?? '—'}</td>
                          <td className="px-4 py-3 text-accent-muted tabular-nums">{formatarHora(slot.hora_inicio)}–{formatarHora(slot.hora_fim)}</td>
                          <td className="px-4 py-3 text-accent-subtle text-xs max-w-[120px] truncate">{slot.evento ?? '—'}</td>
                          <td className="px-4 py-3 text-accent-muted tabular-nums">{formatarEuro(slot.valor)}</td>
                          <td className="px-4 py-3">
                            <select value={slot.estado ?? 'proposta'} disabled={actualizando === slot.id}
                              onChange={e => alterarEstado(slot.id, e.target.value)}
                              className={clsx('bg-surface-2 border border-border rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-white/20 cursor-pointer', corEstado(slot.estado))}>
                              {ESTADOS_PRESENCA.map(e => <option key={e.value} value={e.value}>{e.label}</option>)}
                            </select>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <button
                              disabled={actualizando === slot.id}
                              onClick={() => ciclarWpp(slot)}
                              title={slot.confirmacao_wpp == null ? 'Sem resposta — clica para registar' : slot.confirmacao_wpp === 'confirmou' ? 'Confirmou — clica para alternar' : 'Não confirmou — clica para limpar'}
                              className={clsx(
                                'text-[11px] font-medium px-1.5 py-0.5 rounded border transition-colors select-none',
                                slot.confirmacao_wpp == null
                                  ? 'text-accent-subtle/40 border-border/40 hover:border-border hover:text-accent-subtle bg-transparent'
                                  : slot.confirmacao_wpp === 'confirmou'
                                  ? 'text-status-confirmado border-status-confirmado/30 bg-status-confirmado/10 hover:bg-status-confirmado/20'
                                  : 'text-orange-400 border-orange-400/30 bg-orange-400/10 hover:bg-orange-400/20'
                              )}
                            >
                              {slot.confirmacao_wpp == null ? '—' : slot.confirmacao_wpp === 'confirmou' ? '✓' : '✗'}
                            </button>
                          </td>
                          <td className="no-print px-4 py-3 text-right">
                            <button onClick={() => abrirSlot(slot)} className="text-xs text-accent-subtle hover:text-accent transition-colors">Editar →</button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* ════ TAB DISPONIBILIDADE ════ */}
      {aba === 'disponibilidade' && (
        <div className="flex-1 overflow-auto">
          <div className="p-6 flex flex-col gap-5 max-w-2xl">

            {/* ── Adicionar datas ── */}
            <div className="bg-surface-1 border border-border rounded-xl overflow-hidden">
              <div className="px-5 py-3.5 border-b border-border/50">
                <p className="text-xs font-semibold text-accent uppercase tracking-wider">Adicionar datas</p>
              </div>
              <div className="px-5 py-4 flex flex-col gap-4">
                {erroAdd   && <Alerta tipo="erro" mensagem={erroAdd} />}
                {sucessoAdd && <Alerta tipo="sucesso" mensagem="Datas guardadas com sucesso." />}

                {/* Mês + Estado */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-medium text-accent-subtle uppercase tracking-wider mb-1.5">Mês</label>
                    <select value={mesDisp} onChange={e => setMesDisp(e.target.value)}
                      className="w-full bg-surface-2 border border-border rounded px-3 py-2 text-xs text-accent focus:outline-none focus:border-white/25">
                      {MESES_DISP.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-accent-subtle uppercase tracking-wider mb-1.5">Estado</label>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => setDisponivelAdd(true)}
                        className={clsx('flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded border text-xs font-medium transition-colors',
                          disponivelAdd ? 'bg-status-confirmado/15 text-status-confirmado border-status-confirmado/30' : 'bg-surface-2 text-accent-subtle border-border hover:text-accent')}>
                        <CalendarCheck size={12} />Disponível
                      </button>
                      <button type="button" onClick={() => setDisponivelAdd(false)}
                        className={clsx('flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded border text-xs font-medium transition-colors',
                          !disponivelAdd ? 'bg-status-cancelado/15 text-status-cancelado border-status-cancelado/30' : 'bg-surface-2 text-accent-subtle border-border hover:text-accent')}>
                        <CalendarX size={12} />Indisponível
                      </button>
                    </div>
                  </div>
                </div>

                {/* Dias */}
                <div>
                  <label className="block text-[11px] font-medium text-accent-subtle uppercase tracking-wider mb-1.5">
                    Dias do mês <span className="font-normal normal-case text-accent-subtle/60">— separa por vírgula: 1, 2, 5, 23</span>
                  </label>
                  <div className="flex gap-2">
                    <input type="text" value={diasInput} onChange={e => setDiasInput(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); adicionarAoCarrinho() } }}
                      placeholder="ex: 1, 2, 5, 23, 27"
                      className="flex-1 bg-surface-2 border border-border rounded px-3 py-2 text-xs text-accent placeholder:text-accent-subtle/40 focus:outline-none focus:border-white/25" />
                    <button type="button" onClick={adicionarAoCarrinho} disabled={!diasInput.trim()}
                      className="px-3 py-2 rounded border border-border bg-surface-2 text-accent-muted hover:text-accent hover:border-white/30 transition-colors disabled:opacity-40">
                      <Plus size={14} />
                    </button>
                  </div>
                  <p className="text-[10px] text-accent-subtle/50 mt-1">Enter ou + para adicionar ao carrinho</p>
                </div>

                {/* Carrinho */}
                {datasCarrinho.length > 0 && (
                  <div className="border border-border rounded-lg overflow-hidden">
                    <div className="px-3 py-2 bg-surface-2/50 border-b border-border/50 flex items-center justify-between">
                      <span className="text-[11px] font-semibold text-accent-muted uppercase tracking-wider">
                        {datasCarrinho.length} data{datasCarrinho.length !== 1 ? 's' : ''}
                      </span>
                      <button onClick={() => setDatasCarrinho([])} className="text-[10px] text-accent-subtle/60 hover:text-accent-subtle transition-colors">limpar</button>
                    </div>
                    <div className="divide-y divide-border/30 max-h-40 overflow-y-auto">
                      {datasCarrinho.map(({ iso, disponivel: disp }) => (
                        <div key={iso} className="flex items-center justify-between px-3 py-1.5 gap-2">
                          <span className="text-xs text-accent tabular-nums">{fmtDataCurta(iso)}</span>
                          <div className="flex items-center gap-2">
                            <button onClick={() => setDatasCarrinho(prev => prev.map(d => d.iso === iso ? { ...d, disponivel: !d.disponivel } : d))}
                              className={clsx('px-2 py-0.5 rounded text-[10px] font-medium border transition-colors',
                                disp ? 'bg-status-confirmado/15 text-status-confirmado border-status-confirmado/30'
                                     : 'bg-status-cancelado/15 text-status-cancelado border-status-cancelado/30')}>
                              {disp ? '✓ Disp.' : '✗ Indisp.'}
                            </button>
                            <button onClick={() => setDatasCarrinho(prev => prev.filter(d => d.iso !== iso))}
                              className="text-accent-subtle/50 hover:text-status-cancelado transition-colors">
                              <Trash2 size={11} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Notas + Guardar */}
                <div className="flex gap-3 items-end">
                  <div className="flex-1">
                    <label className="block text-[11px] font-medium text-accent-subtle uppercase tracking-wider mb-1.5">Notas (opcional)</label>
                    <input type="text" value={notasAdd} onChange={e => setNotasAdd(e.target.value)}
                      placeholder="Ex: férias, show fora, indisponível…"
                      className="w-full bg-surface-2 border border-border rounded px-3 py-2 text-xs text-accent placeholder:text-accent-subtle/40 focus:outline-none focus:border-white/25" />
                  </div>
                  <Button onClick={guardarDisp} disabled={datasCarrinho.length === 0 || guardandoDisp}>
                    {guardandoDisp ? 'A guardar…' : `Guardar${datasCarrinho.length > 0 ? ` (${datasCarrinho.length})` : ''}`}
                  </Button>
                </div>
              </div>
            </div>

            {/* ── Registos existentes ── */}
            <div className="bg-surface-1 border border-border rounded-xl overflow-hidden">
              <div className="px-5 py-3.5 border-b border-border/50 flex items-center justify-between">
                <p className="text-xs font-semibold text-accent uppercase tracking-wider">
                  Registos guardados
                  {disponibilidades.length > 0 && <span className="ml-2 text-accent-subtle font-normal normal-case">({disponibilidades.length})</span>}
                </p>
                {mesesDisp.length > 0 && (
                  <select value={filtroMesDisp} onChange={e => setFiltroMesDisp(e.target.value)}
                    className="bg-surface-2 border border-border rounded px-2 py-1 text-[11px] text-accent-muted focus:outline-none">
                    <option value="todos">Todos</option>
                    {mesesDisp.map(m => <option key={m} value={m}>{nomeMesAno(m)}</option>)}
                  </select>
                )}
              </div>

              {loadingDisp && <div className="px-5 py-8 text-center text-accent-subtle/40 text-xs">A carregar…</div>}
              {erroDisp && <div className="px-5 py-4"><Alerta tipo="erro" mensagem={erroDisp} /></div>}

              {!loadingDisp && dispFiltradas.length === 0 && (
                <div className="px-5 py-8 text-center text-accent-subtle/40 text-xs">Sem registos de disponibilidade.</div>
              )}

              {!loadingDisp && dispFiltradas.length > 0 && (
                <div className="divide-y divide-border/20">
                  {dispFiltradas.map(reg => (
                    <div key={reg.id ?? reg.data} className="flex items-center justify-between px-5 py-2.5 hover:bg-surface-2/20 transition-colors gap-3">
                      <div className="flex items-center gap-3">
                        {reg.disponivel
                          ? <CalendarCheck size={13} className="text-status-confirmado shrink-0" />
                          : <CalendarX size={13} className="text-status-cancelado shrink-0" />}
                        <div>
                          <p className="text-xs font-medium text-accent tabular-nums">{fmtDataCurta(reg.data)}</p>
                          {reg.notas && <p className="text-[11px] text-accent-subtle/70 mt-0.5">{reg.notas}</p>}
                        </div>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <span className={clsx('text-[10px] px-2 py-0.5 rounded-full border font-medium',
                          reg.disponivel
                            ? 'bg-status-confirmado/10 text-status-confirmado border-status-confirmado/20'
                            : 'bg-status-cancelado/10 text-status-cancelado border-status-cancelado/20')}>
                          {reg.disponivel ? 'Disponível' : 'Indisponível'}
                        </span>
                        <button onClick={() => apagarDisp(reg.data)}
                          className="text-accent-subtle/40 hover:text-status-cancelado transition-colors">
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>
        </div>
      )}

      {/* ════ TAB CONTAS ════ */}
      {aba === 'contas' && (
        <div className="flex-1 overflow-auto">
          <div className="p-6 flex flex-col gap-5">

            {loadingContas && (
              <div className="text-center py-12 text-accent-subtle/40 text-sm">A carregar…</div>
            )}

            {!loadingContas && slotsContas.length === 0 && (
              <div className="text-center py-12 text-accent-subtle/40 text-sm">
                Sem atuações em {nomeMesAno(anoMes)}.
              </div>
            )}

            {!loadingContas && slotsContas.length > 0 && (
              <div className="grid xl:grid-cols-[240px_1fr_220px] md:grid-cols-[210px_1fr] gap-5 items-start">

                {/* Card 2 — Opções (esquerda) */}
                <div className="bg-surface-1 border border-border rounded-xl overflow-hidden">
                  <div className="px-4 py-2.5 border-b border-border bg-surface-2">
                    <span className="text-[11px] font-semibold text-accent-muted uppercase tracking-widest">Opções</span>
                  </div>
                  <div className="p-4 flex flex-col gap-5">

                    {/* Documento */}
                    <div>
                      <p className="text-[10px] font-semibold text-accent-muted uppercase tracking-widest mb-2">Documento</p>
                      <div className="flex gap-1 p-1 bg-surface-0 rounded-lg border border-border">
                        {[['recibo', 'Recibo Verde'], ['fatura', 'Fatura']].map(([v, l]) => (
                          <button key={v} onClick={() => setDocTipo(v)}
                            className={clsx('flex-1 text-xs py-1.5 rounded-md transition-colors font-medium',
                              docTipo === v ? 'bg-surface-2 text-accent shadow-sm border border-border' : 'text-accent-muted hover:text-accent')}
                          >{l}</button>
                        ))}
                      </div>
                      {docTipo === 'fatura' && (
                        <p className="mt-2 text-[11px] text-status-proposta pl-1">+23% IVA aplicado ao total</p>
                      )}
                      {docTipo === 'recibo' && (
                        <div className="mt-2.5 flex flex-col gap-2">
                          <div className="flex gap-1 p-1 bg-surface-0 rounded-lg border border-border">
                            <button onClick={() => setComRetencao(false)}
                              className={clsx('flex-1 text-xs py-1.5 rounded-md transition-colors font-medium',
                                !comRetencao ? 'bg-surface-2 text-accent shadow-sm border border-border' : 'text-accent-muted hover:text-accent')}
                            >Sem retenção</button>
                            <button onClick={() => setComRetencao(true)}
                              className={clsx('flex-1 text-xs py-1.5 rounded-md transition-colors font-medium',
                                comRetencao ? 'bg-surface-2 text-accent shadow-sm border border-border' : 'text-accent-muted hover:text-accent')}
                            >Com retenção</button>
                          </div>
                          {comRetencao && (
                            <div className="flex items-center gap-2 pl-1">
                              <span className="text-xs text-accent-muted">Percentagem</span>
                              <input type="number" min={0} max={100} value={retencaoPct}
                                onChange={e => setRetencaoPct(Number(e.target.value))}
                                className="w-14 bg-surface-0 border border-border rounded-lg px-2 py-1 text-xs text-accent text-center focus:outline-none" />
                              <span className="text-xs text-accent-muted">%</span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Prémio assiduidade */}
                    <div>
                      <p className="text-[10px] font-semibold text-accent-muted uppercase tracking-widest mb-2">Prémio Assiduidade</p>
                      <div className="flex items-start justify-between gap-2">
                        <p className={clsx('text-[11px]', premioAtivoC ? 'text-status-confirmado' : 'text-accent-muted')}>
                          {premioOverrideC === null
                            ? premioAutoC ? 'Auto · elegível' : 'Auto · não elegível'
                            : premioOverrideC ? 'Ativado manualmente' : 'Desativado manualmente'}
                        </p>
                        <button onClick={() => setPremioOverrideC(premioOverrideC !== null ? null : !premioAutoC)}
                          className={clsx('text-[10px] px-2 py-0.5 rounded border flex-shrink-0 transition-colors',
                            premioOverrideC !== null ? 'border-accent/40 bg-accent/5 text-accent' : 'border-border text-accent-muted hover:border-accent/30')}
                        >{premioOverrideC !== null ? 'auto' : 'forçar'}</button>
                      </div>
                      {premioOverrideC !== null && (
                        <div className="mt-2 flex gap-2">
                          <button onClick={() => setPremioOverrideC(true)}
                            className={clsx('flex-1 text-[11px] py-1.5 rounded-lg border transition-colors',
                              premioOverrideC ? 'bg-status-confirmado/10 border-status-confirmado/40 text-status-confirmado font-medium' : 'border-border text-accent-muted')}
                          >Ativar</button>
                          <button onClick={() => setPremioOverrideC(false)}
                            className={clsx('flex-1 text-[11px] py-1.5 rounded-lg border transition-colors',
                              !premioOverrideC ? 'bg-status-cancelado/10 border-status-cancelado/40 text-status-cancelado font-medium' : 'border-border text-accent-muted')}
                          >Desativar</button>
                        </div>
                      )}
                    </div>

                    {/* Desconto */}
                    {cfgDescontosCon.length > 0 && (
                      <div>
                        <p className="text-[10px] font-semibold text-accent-muted uppercase tracking-widest mb-2">Desconto</p>
                        <div className="flex flex-wrap gap-1.5">
                          {cfgDescontosCon.map((d, i) => (
                            <button key={i} type="button" onClick={() => setDescontoOpC(d.valor)}
                              className={clsx('px-2.5 py-1 rounded-lg border text-xs font-medium transition-colors',
                                descontoOpC === d.valor ? 'bg-accent/10 border-accent/40 text-accent' : 'border-border text-accent-muted')}
                            >{d.label || `Desconto ${i + 1}`} — {d.valor}€</button>
                          ))}
                          <button type="button" onClick={() => setDescontoOpC(0)}
                            className={clsx('px-2.5 py-1 rounded-lg border text-xs font-medium transition-colors',
                              descontoOpC === 0 ? 'bg-accent/10 border-accent/40 text-accent' : 'border-border text-accent-muted')}
                          >Sem desconto</button>
                        </div>
                        {calcCon && descontoOpC > 0 && (
                          <span className="text-xs text-accent-subtle mt-1 block tabular-nums">= −{formatarEuro(calcCon.valorDesconto)}</span>
                        )}
                      </div>
                    )}

                    {/* Guardar opções */}
                    <div className="flex items-center justify-between pt-2 border-t border-border/30">
                      {contasSucesso && (
                        <span className="text-[11px] text-status-confirmado flex items-center gap-1">
                          <Check size={11} />Guardado
                        </span>
                      )}
                      <button
                        onClick={() => {
                          localStorage.setItem(`dj_contas_${id}`, JSON.stringify({ docTipo, comRetencao, retencaoPct, descontoOpC }))
                          setContasSucesso(true)
                          setTimeout(() => setContasSucesso(false), 2500)
                        }}
                        className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded border border-border bg-surface-2 text-xs font-medium text-accent-muted hover:text-accent hover:border-white/20 transition-colors"
                      ><Save size={11} />Guardar preferências</button>
                    </div>
                  </div>
                </div>

                {/* Card 1 — Lista de atuações (centro) */}
                <div className="bg-surface-1 border border-border rounded-xl overflow-hidden">
                  <div className="px-5 py-3 border-b border-border bg-surface-2 flex items-center justify-between">
                    <span className="text-sm font-semibold text-accent">{dj?.nome_artistico || dj?.nome}</span>
                    <span className="text-[11px] text-accent-muted">{slotsRichCon.length} atuações confirmadas · {nomeMesAno(anoMes)}</span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs border-collapse table-fixed">
                      <colgroup>
                        <col className="w-[92px]" />
                        <col className="w-[100px]" />
                        <col className="w-[84px]" />
                        <col className="w-[40px]" />
                        <col className="w-[40px]" />
                        <col className="w-[40px]" />
                        <col className="w-[64px]" />
                      </colgroup>
                      <thead>
                        <tr className="border-b border-border/50">
                          <th className="text-left px-4 py-2 font-medium text-accent-muted">Data</th>
                          <th className="text-left px-3 py-2 font-medium text-accent-muted">Espaço</th>
                          <th className="text-left px-3 py-2 font-medium text-accent-muted">Horário</th>
                          <th className="text-center px-2 py-2 font-medium text-accent-muted" title="Assinatura">Ass.</th>
                          <th className="text-center px-2 py-2 font-medium text-accent-muted" title="Horas extra">H+</th>
                          <th className="text-center px-2 py-2 font-medium text-accent-muted" title="Transporte">Trp.</th>
                          <th className="text-right px-4 py-2 font-medium text-accent-muted">Valor</th>
                        </tr>
                      </thead>
                      <tbody>
                        {slotsContas.map((s, i) => {
                          const isPag = PAGAVEIS_C.has(s.estado)
                          const rich  = slotsRichCon.find(r => r.id === s.id)
                          return (
                            <tr key={s.id} className={clsx(
                              'border-b border-border/20 last:border-0',
                              i % 2 !== 0 ? 'bg-surface-0/30' : '',
                              !isPag && 'opacity-40'
                            )}>
                              <td className="px-4 py-2.5 text-accent-muted tabular-nums whitespace-nowrap">
                                {format(new Date(s.data + 'T00:00:00'), 'EEE d MMM', { locale: pt })}
                              </td>
                              <td className="px-3 py-2.5 text-accent-muted truncate max-w-[120px]">
                                {s.espacos?.nome ?? '—'}
                              </td>
                              <td className="px-3 py-2.5 text-accent-muted tabular-nums whitespace-nowrap">
                                {s.hora_inicio?.slice(0,5)}–{s.hora_fim?.slice(0,5)}
                              </td>
                              <td className="px-2 py-2.5 text-center">
                                {!isPag ? <span className="text-border/40">—</span>
                                  : rich?.assStatus === 'a_tempo'  ? <span className="text-status-confirmado font-bold" title="Assinado a tempo">✓</span>
                                  : rich?.assStatus === 'atrasada' ? <span className="text-amber-500" title="Assinatura atrasada">!</span>
                                  : <span className="text-border/50" title="Sem assinatura">✗</span>}
                              </td>
                              <td className="px-2 py-2.5 text-center tabular-nums">
                                {rich?.horasExtra > 0
                                  ? <span className="text-status-proposta font-medium">+{rich.horasExtra}h</span>
                                  : <span className="text-border/40">—</span>}
                              </td>
                              <td className="px-2 py-2.5 text-center">
                                {rich?.transporte
                                  ? <span className="text-accent-muted" title="Transporte incluído">↗</span>
                                  : <span className="text-border/40">—</span>}
                              </td>
                              <td className={clsx('px-4 py-2.5 text-right tabular-nums font-semibold',
                                isPag ? 'text-accent' : 'text-accent-subtle line-through')}>
                                {s.valor != null ? formatarEuro(Number(s.valor)) : '—'}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                      {slotsRichCon.length > 0 && (
                        <tfoot>
                          <tr className="border-t border-border bg-surface-2/60">
                            <td colSpan={3} className="px-4 py-2 text-xs font-semibold text-accent-muted">Totais</td>
                            <td className="px-2 py-2 text-center text-[10px] text-accent-muted">
                              {slotsRichCon.filter(s => s.assStatus === 'a_tempo').length}/{slotsRichCon.length}
                            </td>
                            <td className="px-2 py-2 text-center text-xs font-medium text-status-proposta tabular-nums">
                              {slotsRichCon.reduce((s, r) => s + r.horasExtra, 0) > 0
                                ? `+${slotsRichCon.reduce((s, r) => s + r.horasExtra, 0)}h` : '—'}
                            </td>
                            <td className="px-2 py-2 text-center text-[10px] text-accent-muted">
                              {slotsRichCon.filter(s => s.transporte).length > 0
                                ? slotsRichCon.filter(s => s.transporte).length : '—'}
                            </td>
                            <td className="px-4 py-2 text-right font-bold text-accent tabular-nums">
                              {formatarEuro(slotsRichCon.reduce((s, r) => s + Number(r.valor ?? 0), 0))}
                            </td>
                          </tr>
                        </tfoot>
                      )}
                    </table>
                  </div>
                </div>

                {/* Card 3 — Resumo (direita) */}
                {calcCon && (
                  <div className="bg-surface-1 border border-border rounded-xl overflow-hidden">
                    <div className="px-4 py-2.5 border-b border-border bg-surface-2">
                      <span className="text-[11px] font-semibold text-accent-muted uppercase tracking-widest">Resumo</span>
                    </div>
                    <div className="divide-y divide-border/30">
                      <BRow label={`Valor atuações (${calcCon.n} data${calcCon.n !== 1 ? 's' : ''})`} value={formatarEuro(calcCon.valorAtuacoes)} />
                      {calcCon.valorHExt > 0 && (
                        <BRow label={`Horas extra (${calcCon.totalHExt}h × ${CFG_C.horaExtraRate}€)`} value={`+${formatarEuro(calcCon.valorHExt)}`} accent="text-status-proposta" />
                      )}
                      {calcCon.valorTransp > 0 && (
                        <BRow label={`Transporte (${calcCon.nTransp} × ${transporteRateCon}€)`} value={`+${formatarEuro(calcCon.valorTransp)}`} accent="text-status-proposta" />
                      )}
                      {premioAtivoC && (
                        <BRow label={`Prémio assiduidade (${calcCon.n} × ${CFG_C.premioRate}€)`} value={`+${formatarEuro(calcCon.valorPremio)}`} accent="text-status-proposta" />
                      )}
                      {calcCon.valorDesconto > 0 && (
                        <BRow label={`Desconto operação (${descontoOpC}€ × ${calcCon.n})`} value={`−${formatarEuro(calcCon.valorDesconto)}`} accent="text-status-cancelado" />
                      )}
                      <BRow label="Subtotal" value={formatarEuro(calcCon.subtotal)} bold />
                      {calcCon.ajuste !== 0 && (
                        <BRow label={calcCon.labelAjuste} value={`${calcCon.ajuste > 0 ? '+' : ''}${formatarEuro(calcCon.ajuste)}`} accent={calcCon.ajuste < 0 ? 'text-status-cancelado' : 'text-status-proposta'} />
                      )}
                      <div className="px-4 py-3.5 flex items-center justify-between bg-surface-2/40">
                        <span className="text-sm font-bold text-accent">Total a pagar</span>
                        <span className="text-lg font-bold text-status-confirmado tabular-nums">{formatarEuro(calcCon.total)}</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      <FormSlot
        aberto={modalAberto} slot={slotSeleccionado}
        onFechar={fecharModal} onGuardado={recarregar}
      />
    </div>
  )
}
