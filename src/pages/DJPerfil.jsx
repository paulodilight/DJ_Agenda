import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft, ArrowUp, ArrowDown, Printer,
  CalendarCheck, CalendarX, Plus, Trash2,
  Camera, Save, Check, Maximize2,
} from 'lucide-react'
import { useDJ } from '@/hooks/useDJs'
import { useAgenda } from '@/hooks/useAgenda'
import { useConflitos } from '@/hooks/useConflitos'
import { useEspacos } from '@/hooks/useEspacos'
import {
  agendaApi, disponibilidadesApi,
  djsApi, djPreferenciasEspacoApi, categoriasDjApi, djCategoriasApi,
} from '@/lib/api'
import { supabase } from '@/lib/supabase'
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
  format, addMonths, startOfMonth, getDaysInMonth, parse, isValid,
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
  { campo: 'qualidade_artistica', label: 'Qualidade Artística' },
  { campo: 'assiduidade',         label: 'Assiduidade' },
  { campo: 'profissionalismo',    label: 'Profissionalismo' },
  { campo: 'adaptacao_espaco',    label: 'Adaptação ao Cliente' },
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

// ── Shared small components ──────────────────────────────────────────────────

function RatingSelector({ label, value, onChange }) {
  return (
    <div>
      <p className="text-xs font-medium text-accent-muted mb-1.5">
        {label}
        <span className="ml-1.5 text-accent-subtle font-normal">{value}/5</span>
      </p>
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
  const { espacos } = useEspacos()

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
  const [catsSel, setCatsSel]           = useState(['', '', ''])
  const [categorias, setCategorias]     = useState([])
  const [fotoFile, setFotoFile]         = useState(null)
  const [fotoPreview, setFotoPreview]   = useState(null)
  const fotoInputRef                    = useRef(null)
  const [bioModalAberto, setBioModalAberto] = useState(false)

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

      const catsIds = catsSel.map(v => v === '' ? null : Number(v))
      await djCategoriasApi.guardar(id, catsIds)

      const prefs = Object.entries(prefsEspaco)
        .filter(([, v]) => v && v !== 'neutro')
        .map(([espaco_id, preferencia]) => ({ espaco_id, preferencia }))
      await djPreferenciasEspacoApi.guardar(id, prefs)

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
        <button onClick={() => navigate('/djs')}
          className="no-print flex items-center gap-1.5 text-xs text-accent-muted hover:text-accent mb-3 transition-colors">
          <ArrowLeft size={13} />Voltar aos DJs
        </button>
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
      <div className="no-print flex border-b border-border px-6 shrink-0">
        <button className={tabCls('perfil')} onClick={() => setAba('perfil')}>Dados</button>
        <button className={tabCls('agenda')} onClick={() => setAba('agenda')}>Agenda</button>
        <button className={tabCls('disponibilidade')} onClick={() => setAba('disponibilidade')}>
          Disponibilidades
          {disponibilidades.length > 0 && (
            <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full bg-surface-3 text-accent-subtle">{disponibilidades.length}</span>
          )}
        </button>
      </div>

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

            {/* ── Avaliação ── */}
            <div className="bg-surface-1 border border-border rounded-xl overflow-hidden">
              <div className="px-5 py-3.5 border-b border-border/50">
                <p className="text-xs font-semibold text-accent uppercase tracking-wider">Avaliação</p>
              </div>
              <div className="px-5 py-4">
                <div className="grid grid-cols-2 gap-5">
                  {RATINGS.map(({ campo, label }) => (
                    <RatingSelector
                      key={campo}
                      label={label}
                      value={perfilForm[campo] ?? 0}
                      onChange={val => setPerfilForm(f => ({ ...f, [campo]: val }))}
                    />
                  ))}
                </div>
              </div>
            </div>

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

            {/* ── Preferências por Cliente ── */}
            {espacos.length > 0 && (
              <div className="bg-surface-1 border border-border rounded-xl overflow-hidden">
                <div className="px-5 py-3.5 border-b border-border/50">
                  <p className="text-xs font-semibold text-accent uppercase tracking-wider">Preferências por Cliente</p>
                </div>
                <div className="px-5 py-4 flex flex-col gap-3">
                  {espacos.map(esp => {
                    const pref = prefsEspaco[esp.id] ?? 'neutro'
                    return (
                      <div key={esp.id} className="flex items-center justify-between gap-3">
                        <span className="text-xs text-accent-muted w-36 truncate">{esp.nome}</span>
                        <div className="flex gap-1">
                          {PREFS_OPCOES.map(op => (
                            <button
                              key={op.value}
                              type="button"
                              onClick={() => setPrefsEspaco(p => ({ ...p, [esp.id]: op.value }))}
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

            {/* ── Guardar ── */}
            <div className="flex justify-end pb-2">
              <Button onClick={guardarPerfil} disabled={perfilLoading}>
                {perfilLoading
                  ? 'A guardar…'
                  : <span className="flex items-center gap-1.5"><Save size={12} />Guardar alterações</span>
                }
              </Button>
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

      <FormSlot
        aberto={modalAberto} slot={slotSeleccionado}
        onFechar={fecharModal} onGuardado={recarregar}
      />
    </div>
  )
}
