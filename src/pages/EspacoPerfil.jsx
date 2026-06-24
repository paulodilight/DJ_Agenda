import { useState, useEffect, useCallback, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Plus, Trash2, Save, ChevronLeft, ChevronRight, ImageIcon, X, ExternalLink, Zap } from 'lucide-react'
import { espacosApi, turnosApi, djsFixosApi, espacoDjPreferenciasApi, turnoValoresDiaApi, categoriasDjApi, turnoCategoriaApi } from '@/lib/api'
import { supabase } from '@/lib/supabase'
import { useDJs } from '@/hooks/useDJs'
import { Input, Select, Textarea } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { Alerta } from '@/components/ui/Alerta'
import { LoadingPage } from '@/components/ui/LoadingSpinner'
import { Card, CardHeader, CardBody } from '@/components/ui/Card'
import { formatarEuro } from '@/utils/formatacao'
import { useAppStore } from '@/store'
import { clsx } from 'clsx'

const safeParse = (s, fb) => { try { return s ? JSON.parse(s) : fb } catch { return fb } }

const DIAS = [
  { idx: 1, curto: 'Seg', longo: 'Segunda' },
  { idx: 2, curto: 'Ter', longo: 'Terça' },
  { idx: 3, curto: 'Qua', longo: 'Quarta' },
  { idx: 4, curto: 'Qui', longo: 'Quinta' },
  { idx: 5, curto: 'Sex', longo: 'Sexta' },
  { idx: 6, curto: 'Sáb', longo: 'Sábado' },
  { idx: 0, curto: 'Dom', longo: 'Domingo' },
]

const TIPO_OPCOES = ['club', 'bar', 'hotel', 'restaurante']

const CAT_NOMES_RESIDENTES = ['DJ Residente', 'DJ Residente ANL', 'DJ Convidado INT']

const novoTurno = () => ({
  _key: crypto.randomUUID(),
  nome: '',
  dias_semana: [],
})

// djsFixos: { [turnoKey]: { [diaIdx]: dj_id | null } }
const fixosVazioParaTurno = () =>
  Object.fromEntries(DIAS.map((d) => [d.idx, null]))

export function EspacoPerfil() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { djs } = useDJs()
  const config = useAppStore((s) => s.config)

  const subtiposDisp = useMemo(() => {
    const transps = safeParse(config.contas_transportes, [])
    const transpDefault = transps[0]?.valor ?? 0
    const subs = safeParse(config.contas_subtipos, [])
    return subs.map(s => ({
      ...s,
      custo: s.custo ?? 0,
      total: (s.custo ?? 0) + (s.margem ?? 0) + (s.semTransporte ? 0 : transpDefault),
    }))
  }, [config])

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [erro, setErro] = useState(null)
  const [sucesso, setSucesso] = useState(false)

  const [form, setForm] = useState({
    nome: '', tipo: 'club', budget_max: '',
    dias_sem_repeticao: 14, dias_espacamento: 7, notas: '', notas_gerais: '',
    ordem_distribuicao: '', logo_url: '', grupo: '',
    pin_operator_admin: '', pin_operator_user: '',
    pin_manager_admin: '', pin_manager_user: '',
    pin_marketing_admin: '', pin_marketing_user: '',
    modo_livre: false,
    setup_slot_1: '', setup_slot_2: '', setup_slot_3: '',
  })
  const [logoUploading, setLogoUploading] = useState(false)

  const [turnos, setTurnos] = useState([novoTurno()])

  // { [turnoKey]: { [diaIdx]: dj_id | null } }
  const [djsFixos, setDjsFixos] = useState({})

  // { [turnoKey]: { [diaIdx]: { valor: '', hora_inicio: '', hora_fim: '' } } }
  const [configDia, setConfigDia] = useState({})

  // { [dj_id]: 'preferido' | 'excluido' | 'neutro' }
  const [djsPrefs, setDjsPrefs] = useState({})
  // { [dj_id]: 1-5 } — interesse do gestor via Operator app
  const [djsInteresse, setDjsInteresse] = useState({})
  // { [dj_id]: { [turno_key]: peso 0-10 } }
  const [adminTurnoPref, setAdminTurnoPref] = useState({})
  // { [dj_id]: { [dia_semana 0-6]: peso 0-10 } }
  const [adminDiaSemPref, setAdminDiaSemPref] = useState({})
  // { [dj_id]: { [turno_key]: quantidade_ideal } }
  const [turnoQtdPref, setTurnoQtdPref] = useState({})
  // { [dj_id]: [categoria_id_str, ...] }
  const [djCatsMap, setDjCatsMap] = useState({})

  const [categorias, setCategorias] = useState([])
  const [turnoCats, setTurnoCats] = useState({})        // { turnoKey: [categoria_id, ...] }
  const [turnoActivoIdx, setTurnoActivoIdx] = useState(0)
  const [grupos, setGrupos] = useState([])              // lista da tabela grupos
  const [novoGrupoNome, setNovoGrupoNome] = useState('')
  const [novoGrupoSlug, setNovoGrupoSlug] = useState('')
  const [mostrarFormGrupo, setMostrarFormGrupo] = useState(false)
  const [criandoGrupo, setCriandoGrupo] = useState(false)
  const [setupEquipamentos, setSetupEquipamentos] = useState([])

  useEffect(() => {
    supabase.from('setup_equipamentos').select('id, nome').eq('ativo', true).order('ordem')
      .then(({ data }) => setSetupEquipamentos(data ?? []))
  }, [])

  const carregar = useCallback(async () => {
    setLoading(true); setErro(null)
    try {
      const data = await espacosApi.buscarCompleto(id)
      setForm({
        nome: data.nome ?? '',
        tipo: data.tipo ?? 'club',
        budget_max: data.budget_max ?? '',
        dias_sem_repeticao: data.dias_sem_repeticao ?? 14,
        dias_espacamento: data.dias_espacamento ?? 7,
        notas: data.notas ?? '',
        notas_gerais: data.notas_gerais ?? '',
        ordem_distribuicao: data.ordem_distribuicao ?? '',
        logo_url: data.logo_url ?? '',
        grupo: data.grupo ?? '',
        pin_operator_admin: data.pin_operator_admin ?? '',
        pin_operator_user: data.pin_operator_user ?? '',
        pin_manager_admin: data.pin_manager_admin ?? '',
        pin_manager_user: data.pin_manager_user ?? '',
        pin_marketing_admin: data.pin_marketing_admin ?? '',
        pin_marketing_user: data.pin_marketing_user ?? '',
        modo_livre: data.modo_livre ?? false,
        setup_slot_1: data.setup_slot_1 ?? '',
        setup_slot_2: data.setup_slot_2 ?? '',
        setup_slot_3: data.setup_slot_3 ?? '',
      })

      const turnosCarregados = data.turnos?.length > 0
        ? data.turnos.map((t) => ({ ...t, _key: t.id, valor: t.valor ?? '' }))
        : [novoTurno()]
      setTurnos(turnosCarregados)

      // Indexar fixos por turno_id → dia_semana → dj_id
      const fixosIdx = {}
      data.djs_fixos?.forEach((f) => {
        if (!f.turno_id) return
        if (!fixosIdx[f.turno_id]) fixosIdx[f.turno_id] = {}
        fixosIdx[f.turno_id][f.dia_semana] = f.dj_id
      })

      const novoFixos = {}
      turnosCarregados.forEach((t) => {
        novoFixos[t._key] = { ...fixosVazioParaTurno(), ...(fixosIdx[t.id] ?? {}) }
      })
      setDjsFixos(novoFixos)

      // Carregar categorias permitidas por turno
      try {
        const catMap = await turnoCategoriaApi.listarPorEspaco(id)
        const novasTurnoCats = {}
        turnosCarregados.forEach((t) => {
          novasTurnoCats[t._key] = catMap[t.id] ?? []
        })
        setTurnoCats(novasTurnoCats)
      } catch { /* silencioso */ }

      // Carregar config por dia por turno (valor + horas)
      try {
        const valoresData = await turnoValoresDiaApi.listarPorEspaco(id)
        const valoresIdx = {}
        valoresData.forEach(({ turno_id, dia_semana, valor, hora_inicio, hora_fim, subtipo_key }) => {
          if (!valoresIdx[turno_id]) valoresIdx[turno_id] = {}
          valoresIdx[turno_id][dia_semana] = {
            valor:       valor != null ? String(valor) : '',
            hora_inicio: hora_inicio ? hora_inicio.slice(0, 5) : '',
            hora_fim:    hora_fim    ? hora_fim.slice(0, 5)    : '',
            subtipo_key: subtipo_key ?? '',
          }
        })
        const novaConfig = {}
        turnosCarregados.forEach((t) => {
          novaConfig[t._key] = valoresIdx[t.id] ?? {}
        })
        setConfigDia(novaConfig)
      } catch { /* silencioso */ }

      // Carregar preferências de DJs para este Cliente
      const prefsData = await espacoDjPreferenciasApi.listar(id)
      const prefsMap = {}
      const interesseMap = {}
      prefsData.forEach((p) => {
        if (p.tipo === 'preferido' || p.tipo === 'excluido') prefsMap[p.dj_id] = p.tipo
        if (p.interesse != null) interesseMap[p.dj_id] = p.interesse
      })
      setDjsPrefs(prefsMap)
      setDjsInteresse(interesseMap)

      // Carregar preferências admin (peso por turno, peso por dia, quantidade por turno)
      try {
        const turnoIdParaKey = {}
        turnosCarregados.forEach(t => { turnoIdParaKey[t.id] = t._key })

        const [adminTurnoData, adminDiaSemData, turnoQtdData] = await Promise.all([
          supabase.from('admin_dj_turno_pref').select('dj_id, turno_id, peso').eq('espaco_id', id),
          supabase.from('admin_dj_dia_semana_pref').select('dj_id, dia_semana, peso').eq('espaco_id', id),
          supabase.from('admin_turno_quantidade_pref').select('turno_id, dj_id, quantidade_ideal').eq('espaco_id', id),
        ])

        const adminTurnoMap = {}
        ;(adminTurnoData.data ?? []).forEach(({ dj_id, turno_id, peso }) => {
          const key = turnoIdParaKey[turno_id] ?? turno_id
          if (!adminTurnoMap[dj_id]) adminTurnoMap[dj_id] = {}
          adminTurnoMap[dj_id][key] = peso
        })
        setAdminTurnoPref(adminTurnoMap)

        const adminDiaSemMap = {}
        ;(adminDiaSemData.data ?? []).forEach(({ dj_id, dia_semana, peso }) => {
          if (!adminDiaSemMap[dj_id]) adminDiaSemMap[dj_id] = {}
          adminDiaSemMap[dj_id][dia_semana] = peso
        })
        setAdminDiaSemPref(adminDiaSemMap)

        const turnoQtdMap = {}
        ;(turnoQtdData.data ?? []).forEach(({ turno_id, dj_id, quantidade_ideal }) => {
          const key = turnoIdParaKey[turno_id] ?? turno_id
          if (!turnoQtdMap[dj_id]) turnoQtdMap[dj_id] = {}
          turnoQtdMap[dj_id][key] = quantidade_ideal
        })
        setTurnoQtdPref(turnoQtdMap)
      } catch { /* silencioso */ }
    } catch (e) {
      setErro(e.message)
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => { carregar() }, [carregar])

  useEffect(() => {
    categoriasDjApi.listar().then(setCategorias).catch(() => {})
    supabase.from('grupos').select('id, nome, slug').order('nome')
      .then(({ data }) => setGrupos(data ?? [])).catch(() => {})
  }, [])

  useEffect(() => {
    const ids = djs.filter(d => d.estado === 'activo' || d.estado === 'activo_ext').map(d => d.id)
    if (!ids.length) return
    supabase.from('dj_categorias').select('dj_id, categoria_id').in('dj_id', ids)
      .then(({ data }) => {
        const map = {}
        ;(data ?? []).forEach(({ dj_id, categoria_id }) => {
          if (!map[dj_id]) map[dj_id] = []
          map[dj_id].push(String(categoria_id))
        })
        setDjCatsMap(map)
      })
      .catch(() => {})
  }, [djs])

  const setField = (campo) => (e) => setForm((f) => ({ ...f, [campo]: e.target.value }))

  const handleLogoUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setLogoUploading(true)
    setErro(null)
    try {
      const ext = file.name.split('.').pop().toLowerCase()
      const path = `espaco-${id}.${ext}`
      const { error: upErr } = await supabase.storage
        .from('logos')
        .upload(path, file, { upsert: true, contentType: file.type })
      if (upErr) throw upErr
      const { data: { publicUrl } } = supabase.storage.from('logos').getPublicUrl(path)
      setForm((f) => ({ ...f, logo_url: publicUrl }))
    } catch (e) {
      setErro('Erro ao carregar logo: ' + e.message)
    } finally {
      setLogoUploading(false)
    }
  }

  // ── Turnos ──────────────────────────────────────────────────────────────────

  const adicionarTurno = () => {
    const nt = novoTurno()
    setTurnos((t) => {
      setTurnoActivoIdx(t.length) // navega para o novo turno
      return [...t, nt]
    })
    setDjsFixos((f) => ({ ...f, [nt._key]: fixosVazioParaTurno() }))
    setConfigDia((v) => ({ ...v, [nt._key]: {} }))
    setTurnoCats((c) => ({ ...c, [nt._key]: [] }))
  }

  const removerTurno = (key) => {
    setTurnos((t) => {
      const nova = t.filter((x) => x._key !== key)
      setTurnoActivoIdx((i) => Math.min(i, Math.max(nova.length - 1, 0)))
      return nova
    })
    setDjsFixos((f) => { const n = { ...f }; delete n[key]; return n })
    setConfigDia((v) => { const n = { ...v }; delete n[key]; return n })
    setTurnoCats((c) => { const n = { ...c }; delete n[key]; return n })
  }

  const setTurnoField = (key, campo) => (e) =>
    setTurnos((prev) => prev.map((t) => t._key === key ? { ...t, [campo]: e.target.value } : t))

  const toggleDiaTurno = (key, diaIdx) =>
    setTurnos((prev) => prev.map((t) => {
      if (t._key !== key) return t
      const dias = t.dias_semana.includes(diaIdx)
        ? t.dias_semana.filter((d) => d !== diaIdx)
        : [...t.dias_semana, diaIdx].sort()
      return { ...t, dias_semana: dias }
    }))

  // ── DJs fixos ──────────────────────────────────────────────────────────────

  const setDjFixo = (turnoKey, diaIdx, djId) =>
    setDjsFixos((f) => ({
      ...f,
      [turnoKey]: { ...f[turnoKey], [diaIdx]: djId || null },
    }))

  // ── Guardar ─────────────────────────────────────────────────────────────────

  const guardar = async (e) => {
    e.preventDefault()
    setSaving(true); setErro(null); setSucesso(false)
    try {
      await espacosApi.actualizar(id, {
        ...form,
        budget_max: form.budget_max === '' ? null : Number(form.budget_max),
        setup_slot_1: form.setup_slot_1 || null,
        setup_slot_2: form.setup_slot_2 || null,
        setup_slot_3: form.setup_slot_3 || null,
        dias_sem_repeticao: Number(form.dias_sem_repeticao),
        dias_espacamento: Number(form.dias_espacamento),
        ordem_distribuicao: form.ordem_distribuicao === '' ? null : Number(form.ordem_distribuicao),
      })

      const turnosValidos = turnos.filter((t) => t.nome.trim())
      const novosTurnos = await turnosApi.guardar(id, turnosValidos)

      // Mapear _key → novo ID (os turnos são reinseridos em ordem)
      const keyParaId = {}
      turnosValidos.forEach((t, i) => { keyParaId[t._key] = novosTurnos[i]?.id })

      const fixosLista = []
      turnosValidos.forEach((t) => {
        const turnoId = keyParaId[t._key]
        if (!turnoId) return
        DIAS.forEach((d) => {
          fixosLista.push({
            turno_id: turnoId,
            dia_semana: d.idx,
            dj_id: djsFixos[t._key]?.[d.idx] || null,
          })
        })
      })
      await djsFixosApi.guardar(id, fixosLista)

      // Guardar categorias e valores por dia por turno
      await Promise.all([
        ...turnosValidos.map((t) => {
          const turnoId = keyParaId[t._key]
          if (!turnoId) return Promise.resolve()
          return turnoCategoriaApi.guardar(turnoId, turnoCats[t._key] ?? [])
        }),
        ...turnosValidos.map((t) => {
          const turnoId = keyParaId[t._key]
          if (!turnoId) return Promise.resolve()
          return turnoValoresDiaApi.guardar(turnoId, configDia[t._key] ?? {})
        }),
      ])

      // Guardar preferências de DJs (apenas preferido/excluido)
      const prefsList = Object.entries(djsPrefs)
        .filter(([, tipo]) => tipo === 'preferido' || tipo === 'excluido')
        .map(([dj_id, tipo]) => ({ dj_id, tipo }))
      await espacoDjPreferenciasApi.guardar(id, prefsList)

      // Guardar preferências admin × turno
      const turnoPrefs = []
      turnosValidos.forEach((t) => {
        const turnoId = keyParaId[t._key]
        if (!turnoId) return
        Object.entries(adminTurnoPref).forEach(([djId, pesos]) => {
          const peso = pesos[t._key]
          if (peso != null && peso !== '') {
            turnoPrefs.push({ espaco_id: id, dj_id: djId, turno_id: turnoId, peso: Number(peso) })
          }
        })
      })
      if (turnoPrefs.length > 0) {
        await supabase.from('admin_dj_turno_pref')
          .upsert(turnoPrefs, { onConflict: 'espaco_id,dj_id,turno_id' })
      }

      // Guardar preferências admin × dia da semana
      const diaSemPrefs = []
      Object.entries(adminDiaSemPref).forEach(([djId, dias]) => {
        DIAS.forEach((dia) => {
          const peso = dias[dia.idx]
          if (peso != null && peso !== '') {
            diaSemPrefs.push({ espaco_id: id, dj_id: djId, dia_semana: dia.idx, peso: Number(peso) })
          }
        })
      })
      if (diaSemPrefs.length > 0) {
        await supabase.from('admin_dj_dia_semana_pref')
          .upsert(diaSemPrefs, { onConflict: 'espaco_id,dj_id,dia_semana' })
      }

      // Guardar quantidade ideal por turno × DJ
      const qtdPrefs = []
      turnosValidos.forEach((t) => {
        const turnoId = keyParaId[t._key]
        if (!turnoId) return
        Object.entries(turnoQtdPref).forEach(([djId, qtds]) => {
          const qtd = qtds[t._key]
          if (qtd != null && qtd !== '') {
            qtdPrefs.push({ espaco_id: id, turno_id: turnoId, dj_id: djId, quantidade_ideal: Number(qtd) })
          }
        })
      })
      if (qtdPrefs.length > 0) {
        await supabase.from('admin_turno_quantidade_pref')
          .upsert(qtdPrefs, { onConflict: 'espaco_id,turno_id,dj_id' })
      }

      setSucesso(true)
      setTimeout(() => setSucesso(false), 3000)
      carregar()
    } catch (e) {
      setErro(e.message)
    } finally {
      setSaving(false)
    }
  }

  const djsActivos = djs.filter((d) => d.estado === 'activo' || d.estado === 'activo_ext')

  const catIdsResidentes = new Set(
    categorias.filter(c => CAT_NOMES_RESIDENTES.includes(c.nome)).map(c => String(c.id))
  )
  const djsActivosResidentes = catIdsResidentes.size === 0
    ? djsActivos
    : djsActivos.filter(d => (djCatsMap[d.id] ?? []).some(id => catIdsResidentes.has(id)))

  if (loading) return <LoadingPage />

  return (
    <form onSubmit={guardar} className="flex flex-col h-full">
      {/* Header */}
      <div className="px-6 py-4 border-b border-border shrink-0 flex items-center justify-between">
        <div>
          <button
            type="button"
            onClick={() => navigate('/espacos')}
            className="flex items-center gap-1.5 text-xs text-accent-muted hover:text-accent mb-2 transition-colors"
          >
            <ArrowLeft size={13} />
            Voltar aos Clientes
          </button>
          <h1 className="text-base font-semibold text-accent">{form.nome || 'Cliente'}</h1>
        </div>
        <Button type="submit" variante="primary" tamanho="sm" loading={saving}>
          <Save size={14} />
          Guardar alterações
        </Button>
      </div>

      <div className="flex-1 overflow-auto px-6 py-6 flex flex-col gap-6 max-w-4xl">
        {erro && <Alerta tipo="erro" mensagem={erro} />}
        {sucesso && <Alerta tipo="sucesso" mensagem="Alterações guardadas com sucesso." />}

        {/* ── Informação base ── */}
        <Card>
          <CardHeader>
            <p className="text-xs font-semibold text-accent-muted uppercase tracking-wider">Informação</p>
          </CardHeader>
          <CardBody className="flex flex-col gap-4">
            {/* Logo */}
            <div className="flex items-center gap-4">
              <div className={clsx(
                'w-16 h-16 rounded-lg border overflow-hidden flex items-center justify-center shrink-0',
                form.logo_url ? 'border-border bg-white' : 'border-dashed border-border bg-surface-2'
              )}>
                {form.logo_url
                  ? <img src={form.logo_url} alt="Logo" className="w-full h-full object-contain p-1" />
                  : <ImageIcon size={20} className="text-accent-subtle" />
                }
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="cursor-pointer">
                  <span className={clsx(
                    'text-xs px-3 py-1.5 rounded border transition-colors',
                    logoUploading
                      ? 'border-border text-accent-subtle cursor-not-allowed'
                      : 'border-border bg-surface-2 text-accent-muted hover:text-accent'
                  )}>
                    {logoUploading ? 'A carregar…' : form.logo_url ? 'Alterar logo' : 'Carregar logo'}
                  </span>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/svg+xml"
                    className="hidden"
                    disabled={logoUploading}
                    onChange={handleLogoUpload}
                  />
                </label>
                {form.logo_url && !logoUploading && (
                  <button
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, logo_url: '' }))}
                    className="text-[11px] text-accent-subtle hover:text-status-cancelado transition-colors text-left flex items-center gap-1"
                  >
                    <X size={10} /> Remover logo
                  </button>
                )}
                <p className="text-[10px] text-accent-subtle">PNG, JPG, SVG · máx. 2 MB</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Input label="Nome" value={form.nome} onChange={setField('nome')} required />
              <Select label="Tipo" value={form.tipo} onChange={setField('tipo')}>
                {TIPO_OPCOES.map((t) => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
              </Select>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <Input label="Budget máximo (€)" value={form.budget_max} onChange={setField('budget_max')} type="number" min={0} placeholder="—" />
              <Input label="Dias sem repetir" value={form.dias_sem_repeticao} onChange={setField('dias_sem_repeticao')} type="number" min={1} />
              <div>
                <Input
                  label="Ordem de distribuição"
                  value={form.ordem_distribuicao}
                  onChange={setField('ordem_distribuicao')}
                  type="number" min={1} placeholder="Auto"
                />
                <p className="text-[10px] text-accent-subtle mt-1">1 = primeiro · vazio = automático</p>
              </div>
            </div>
            <Textarea label="Notas / regras do Cliente" value={form.notas} onChange={setField('notas')} placeholder="Regras específicas, preferências..." />
            <Textarea label="Notas Gerais para o DJ" value={form.notas_gerais} onChange={setField('notas_gerais')} placeholder="Informações que o DJ vê na sua app: rider, parqueamento, contactos, regras do espaço…" rows={5} />

            {/* ── Setup DJ padrão ── */}
            {setupEquipamentos.length > 0 && (
              <div className="flex flex-col gap-2">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-accent-subtle">Setup DJ padrão</p>
                <div className="grid grid-cols-3 gap-3">
                  {(['setup_slot_1', 'setup_slot_2', 'setup_slot_3']).map((campo, i) => (
                    <Select key={campo} label={`Slot ${i + 1}`} value={form[campo]} onChange={setField(campo)}>
                      <option value="">—</option>
                      {setupEquipamentos.map(e => <option key={e.id} value={e.id}>{e.nome}</option>)}
                    </Select>
                  ))}
                </div>
              </div>
            )}

            {/* ── Modo livre (sem turnos) ── */}
            <div className="flex items-center justify-between rounded-xl border border-border bg-surface-1 px-4 py-3">
              <div>
                <p className="text-xs font-medium text-accent">Modo livre · sem turnos</p>
                <p className="text-[11px] text-accent-subtle mt-0.5">
                  {form.modo_livre
                    ? 'Este espaço aparece na Agenda e Contas sem necessitar de turnos configurados.'
                    : 'Activa para espaços sem calendário semanal fixo (ex: Xclusive).'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setForm(f => ({ ...f, modo_livre: !f.modo_livre }))}
                className={clsx(
                  'flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[11px] font-semibold transition-colors',
                  form.modo_livre
                    ? 'border-gold-500/40 bg-gold-500/10 text-gold-400 hover:bg-gold-500/20'
                    : 'border-border bg-surface-2 text-accent-muted hover:text-accent'
                )}
              >
                <Zap size={11} />
                {form.modo_livre ? 'Activo' : 'Inactivo'}
              </button>
            </div>
          </CardBody>
        </Card>

        {/* ── Turnos ── */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <p className="text-xs font-semibold text-accent-muted uppercase tracking-wider">Turnos de actuação</p>
                {/* Navegação entre turnos */}
                {turnos.length > 1 && (
                  <div className="flex items-center gap-1 flex-wrap">
                    <button
                      type="button"
                      onClick={() => setTurnoActivoIdx((i) => Math.max(0, i - 1))}
                      disabled={turnoActivoIdx === 0}
                      className="p-1 rounded text-accent-subtle hover:text-accent hover:bg-surface-2 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      <ChevronLeft size={13} />
                    </button>
                    {turnos.map((t, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => setTurnoActivoIdx(i)}
                        title={t.nome || `Turno ${i + 1}`}
                        className={clsx(
                          'px-2 py-1 rounded text-[10px] font-semibold transition-colors border max-w-[120px] truncate',
                          turnoActivoIdx === i
                            ? 'bg-accent/20 text-accent border-accent/40'
                            : 'text-accent-subtle border-transparent hover:text-accent hover:bg-surface-2'
                        )}
                      >
                        {t.nome || `Turno ${i + 1}`}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => setTurnoActivoIdx((i) => Math.min(turnos.length - 1, i + 1))}
                      disabled={turnoActivoIdx === turnos.length - 1}
                      className="p-1 rounded text-accent-subtle hover:text-accent hover:bg-surface-2 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      <ChevronRight size={13} />
                    </button>
                  </div>
                )}
              </div>
              <Button type="button" variante="ghost" tamanho="sm" onClick={adicionarTurno}>
                <Plus size={13} />
                Adicionar turno
              </Button>
            </div>
          </CardHeader>
          <CardBody className="flex flex-col gap-5">
            {turnos.filter((_, idx) => idx === turnoActivoIdx).map((turno) => (
              <div key={turno._key} className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-accent-muted">Turno {turnoActivoIdx + 1}</span>
                    {turno.dias_semana.length === 0 && (
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-status-cancelado/10 text-status-cancelado border border-status-cancelado/20">
                        Desativado — seleciona pelo menos um dia
                      </span>
                    )}
                  </div>
                  {turnos.length > 1 && (
                    <button type="button" onClick={() => removerTurno(turno._key)}
                      className="text-accent-subtle hover:text-status-cancelado transition-colors">
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>

                <Input
                  label="Nome do turno"
                  value={turno.nome}
                  onChange={setTurnoField(turno._key, 'nome')}
                  placeholder="1º Turno"
                />

                {/* Dias da semana + config por dia */}
                <div>
                  <p className="text-xs font-medium text-accent-muted mb-3">Dias da semana</p>
                  <div className="grid grid-cols-7 gap-1.5">
                    {DIAS.map((dia) => {
                      const activo = turno.dias_semana.includes(dia.idx)
                      const cfg = configDia[turno._key]?.[dia.idx] ?? { valor: '', hora_inicio: '', hora_fim: '' }
                      return (
                        <div key={dia.idx} className="flex flex-col gap-1.5">
                          {/* Botão dia */}
                          <button
                            type="button"
                            onClick={() => toggleDiaTurno(turno._key, dia.idx)}
                            className={clsx(
                              'w-full py-1.5 rounded text-xs font-medium border transition-colors select-none',
                              activo
                                ? 'bg-white text-black border-white'
                                : 'bg-surface-2 text-accent-muted border-border hover:border-white/30 hover:text-accent'
                            )}
                          >
                            {dia.curto}
                          </button>
                          {/* Subtipo → auto-preenche valor */}
                          {subtiposDisp.length > 0 && (
                            <select
                              disabled={!activo}
                              value={cfg.subtipo_key ?? ''}
                              onChange={(e) => {
                                const sub = subtiposDisp.find(s => s.key === e.target.value)
                                setConfigDia((prev) => ({
                                  ...prev,
                                  [turno._key]: {
                                    ...prev[turno._key],
                                    [dia.idx]: {
                                      ...(prev[turno._key]?.[dia.idx] ?? {}),
                                      subtipo_key: e.target.value,
                                      valor: sub?.custo > 0 ? String(sub.custo) : (prev[turno._key]?.[dia.idx]?.valor ?? ''),
                                    },
                                  },
                                }))
                              }}
                              className={clsx(
                                'w-full bg-surface-2 border rounded px-1 py-0.5 text-[10px] text-center text-accent-subtle focus:outline-none focus:border-white/20 transition-colors',
                                activo ? 'border-border' : 'border-border/20 opacity-20 cursor-not-allowed'
                              )}
                            >
                              <option value="">—</option>
                              {subtiposDisp.map(s => (
                                <option key={s.key} value={s.key}>{s.label}{s.custo > 0 ? ` · ${s.custo}€` : ''}</option>
                              ))}
                            </select>
                          )}
                          {/* Valor editável */}
                          <input
                            type="number" min={0} step={0.01}
                            disabled={!activo}
                            value={cfg.valor}
                            onChange={(e) => setConfigDia((prev) => ({
                              ...prev,
                              [turno._key]: {
                                ...prev[turno._key],
                                [dia.idx]: { ...(prev[turno._key]?.[dia.idx] ?? {}), valor: e.target.value },
                              },
                            }))}
                            placeholder="€"
                            className={clsx(
                              'w-full bg-surface-2 border rounded px-1 py-1 text-xs text-center text-accent focus:outline-none focus:border-white/20 transition-colors',
                              activo ? 'border-border' : 'border-border/20 opacity-30 cursor-not-allowed'
                            )}
                          />
                          {/* Hora início */}
                          <input
                            type="time"
                            disabled={!activo}
                            value={cfg.hora_inicio}
                            onChange={(e) => setConfigDia((prev) => ({
                              ...prev,
                              [turno._key]: {
                                ...prev[turno._key],
                                [dia.idx]: { ...(prev[turno._key]?.[dia.idx] ?? {}), hora_inicio: e.target.value },
                              },
                            }))}
                            className={clsx(
                              'w-full bg-surface-2 border rounded px-1 py-1 text-xs text-center text-accent focus:outline-none focus:border-white/20 transition-colors',
                              activo ? 'border-border' : 'border-border/20 opacity-30 cursor-not-allowed'
                            )}
                          />
                          {/* Hora fim */}
                          <input
                            type="time"
                            disabled={!activo}
                            value={cfg.hora_fim}
                            onChange={(e) => setConfigDia((prev) => ({
                              ...prev,
                              [turno._key]: {
                                ...prev[turno._key],
                                [dia.idx]: { ...(prev[turno._key]?.[dia.idx] ?? {}), hora_fim: e.target.value },
                              },
                            }))}
                            className={clsx(
                              'w-full bg-surface-2 border rounded px-1 py-1 text-xs text-center text-accent focus:outline-none focus:border-white/20 transition-colors',
                              activo ? 'border-border' : 'border-border/20 opacity-30 cursor-not-allowed'
                            )}
                          />
                        </div>
                      )
                    })}
                  </div>
                </div>

                {/* Categorias de DJ permitidas neste turno */}
                {categorias.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-accent-muted mb-2">
                      Categorias permitidas
                      <span className="ml-1.5 font-normal text-accent-subtle">— vazio = todas</span>
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {categorias.map((cat) => {
                        const checked = (turnoCats[turno._key] ?? []).includes(cat.id)
                        return (
                          <label
                            key={cat.id}
                            className={clsx(
                              'flex items-center gap-1.5 px-2.5 py-1.5 rounded border text-xs font-medium cursor-pointer select-none transition-colors',
                              checked
                                ? 'bg-white/10 text-accent border-white/30'
                                : 'bg-surface-2 text-accent-subtle border-border hover:text-accent-muted hover:border-white/20'
                            )}
                          >
                            <input
                              type="checkbox"
                              className="accent-white w-3 h-3"
                              checked={checked}
                              onChange={(e) => {
                                setTurnoCats((prev) => {
                                  const actual = prev[turno._key] ?? []
                                  return {
                                    ...prev,
                                    [turno._key]: e.target.checked
                                      ? [...actual, cat.id]
                                      : actual.filter(id => id !== cat.id),
                                  }
                                })
                              }}
                            />
                            {cat.nome}
                          </label>
                        )
                      })}
                    </div>
                  </div>
                )}

                {turno.nome && (
                  <p className="text-xs text-accent-subtle">
                    {turno.nome}
                    {turno.dias_semana.length > 0
                      ? ` · ${turno.dias_semana.map((d) => DIAS.find(x => x.idx === d)?.curto).join(', ')}`
                      : ''}
                  </p>
                )}
              </div>
            ))}
          </CardBody>
        </Card>

        {/* ── DJs fixos por turno × dia ── */}
        {(() => {
          const turnoActivo = turnos[turnoActivoIdx] ?? turnos[0]
          const turnoTemNome = turnoActivo?.nome?.trim()
          const turnoDesativado = turnoActivo?.dias_semana?.length === 0
          return (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold text-accent-muted uppercase tracking-wider">
                      DJs fixos
                      {turnoTemNome && (
                        <span className="ml-2 normal-case font-medium text-accent">— {turnoActivo.nome}</span>
                      )}
                    </p>
                    <p className="text-xs text-accent-subtle mt-1">
                      "Auto" = distribuição automática. DJ fixo tem sempre prioridade.
                    </p>
                  </div>
                </div>
              </CardHeader>
              <CardBody>
                {!turnoTemNome ? (
                  <p className="text-xs text-accent-subtle italic">Define o nome do turno acima para configurar DJs fixos.</p>
                ) : turnoDesativado ? (
                  <p className="text-xs text-status-cancelado/70 italic">Este turno está desativado — seleciona pelo menos um dia.</p>
                ) : (
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left py-2 pr-4 font-medium text-accent-muted w-28">Dia</th>
                        <th className="text-left px-3 py-2 font-medium text-accent-muted border-l border-border/40">
                          DJ fixo <span className="font-normal text-accent-subtle">— vazio = Auto</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {DIAS.map((dia) => {
                        const val = djsFixos[turnoActivo._key]?.[dia.idx] ?? ''
                        const diaInactivo = !turnoActivo.dias_semana.includes(dia.idx)
                        return (
                          <tr key={dia.idx} className={clsx(
                            'border-b border-border/30 last:border-0 transition-colors',
                            diaInactivo ? 'opacity-25' : 'hover:bg-surface-2/30'
                          )}>
                            <td className="py-2 pr-4 font-medium text-accent-muted whitespace-nowrap">{dia.longo}</td>
                            <td className="px-3 py-1.5 border-l border-border/40">
                              <select
                                value={val}
                                disabled={diaInactivo}
                                onChange={(e) => setDjFixo(turnoActivo._key, dia.idx, e.target.value)}
                                className={clsx(
                                  'w-full bg-surface-2 border border-border rounded px-2 py-1.5 text-xs text-accent focus:outline-none focus:ring-1 focus:ring-white/20',
                                  diaInactivo && 'cursor-not-allowed'
                                )}
                              >
                                <option value="">— Auto</option>
                                {djsActivos.map((d) => (
                                  <option key={d.id} value={d.id}>
                                    {d.nome_artistico || d.nome}
                                  </option>
                                ))}
                              </select>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                )}
              </CardBody>
            </Card>
          )
        })()}
        {/* ── Gest Login ── */}
        <Card>
          <CardHeader>
            <div>
              <p className="text-xs font-semibold text-accent-muted uppercase tracking-wider">Gest Login</p>
              <p className="text-xs text-accent-subtle mt-1">
                PIN de acesso (admin e user) por área — Operator, Manager e Marketing · o grupo define o link Vercel deste espaço
              </p>
            </div>
          </CardHeader>
          <CardBody>
            {/* Links Vercel */}
            {(() => {
              const sufixo = form.grupo ? `/${form.grupo}` : ''
              return (
                <div className="mb-4 flex items-center gap-3 flex-wrap">
                  <span className="text-[11px] text-accent-subtle uppercase tracking-wider">
                    Links{form.grupo ? '' : ' (LMD)'}:
                  </span>
                  {[
                    { label: 'Operator',  base: 'https://operator.xclusivedj.app' },
                    { label: 'Manager',   base: 'https://manager.xclusivedj.app' },
                    { label: 'Marketing', base: 'https://marketing.xclusivedj.app' },
                  ].map((l) => (
                    <a key={l.label} href={`${l.base}${sufixo}`} target="_blank" rel="noreferrer"
                      className="flex items-center gap-1.5 rounded border border-border bg-surface-2 px-3 py-1.5 text-xs text-accent-muted hover:text-accent hover:border-white/20 transition-colors">
                      <ExternalLink size={11} /> {l.label}
                    </a>
                  ))}
                </div>
              )
            })()}

            <div className="mb-5 max-w-sm">
              <div>
                <label className="text-[11px] font-semibold text-accent-muted uppercase tracking-wider">Grupo</label>
                <p className="text-[10px] text-accent-subtle mb-1">deployment Vercel associado</p>
                <select
                  value={form.grupo}
                  onChange={(e) => {
                    if (e.target.value === '__novo__') { setMostrarFormGrupo(true); return }
                    setForm((f) => ({ ...f, grupo: e.target.value }))
                  }}
                  className="w-full rounded border border-border bg-surface-2 px-3 py-2 text-sm text-accent focus:outline-none focus:border-white/20"
                >
                  <option value="">— sem grupo —</option>
                  {grupos.map((g) => (
                    <option key={g.id} value={g.slug}>{g.nome}</option>
                  ))}
                  <option value="__novo__">＋ Novo grupo…</option>
                </select>

                {/* Form inline para criar novo grupo */}
                {mostrarFormGrupo && (
                  <div className="mt-2 flex flex-col gap-1.5 rounded border border-border bg-surface-2 p-3">
                    <p className="text-[10px] font-semibold text-accent-muted uppercase tracking-wider">Novo grupo</p>
                    <input
                      type="text"
                      value={novoGrupoNome}
                      onChange={(e) => {
                        setNovoGrupoNome(e.target.value)
                        setNovoGrupoSlug(e.target.value.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, ''))
                      }}
                      placeholder="Nome (ex: Golf D'Água)"
                      className="w-full rounded border border-border bg-surface-0 px-2 py-1.5 text-sm text-accent focus:outline-none"
                    />
                    <input
                      type="text"
                      value={novoGrupoSlug}
                      onChange={(e) => setNovoGrupoSlug(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, ''))}
                      placeholder="slug (ex: golfdagua)"
                      className="w-full rounded border border-border bg-surface-0 px-2 py-1.5 text-sm text-accent font-mono focus:outline-none"
                    />
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={criandoGrupo || !novoGrupoNome.trim() || !novoGrupoSlug.trim()}
                        onClick={async () => {
                          setCriandoGrupo(true)
                          try {
                            const { data, error } = await supabase.from('grupos')
                              .insert({ nome: novoGrupoNome.trim(), slug: novoGrupoSlug.trim() })
                              .select().single()
                            if (error) throw error
                            setGrupos((g) => [...g, data].sort((a, b) => a.nome.localeCompare(b.nome)))
                            setForm((f) => ({ ...f, grupo: data.slug }))
                            setMostrarFormGrupo(false)
                            setNovoGrupoNome(''); setNovoGrupoSlug('')
                          } catch (e) { alert('Erro: ' + e.message) }
                          finally { setCriandoGrupo(false) }
                        }}
                        className="flex-1 rounded border border-status-confirmado/40 bg-status-confirmado/15 text-status-confirmado text-xs py-1.5 hover:bg-status-confirmado/25 transition-colors disabled:opacity-40"
                      >
                        {criandoGrupo ? 'A criar…' : 'Criar grupo'}
                      </button>
                      <button type="button" onClick={() => { setMostrarFormGrupo(false); setNovoGrupoNome(''); setNovoGrupoSlug('') }}
                        className="rounded border border-border bg-surface-0 text-accent-muted text-xs px-3 py-1.5 hover:text-accent transition-colors">
                        Cancelar
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* PIN admin + user por área */}
            <div className="grid grid-cols-3 gap-4">
              {[
                { area: 'operator', label: 'Operator' },
                { area: 'manager', label: 'Manager' },
                { area: 'marketing', label: 'Marketing' },
              ].map(({ area, label }) => (
                <div key={area} className="rounded border border-border/60 bg-surface-2/40 p-3">
                  <p className="text-[11px] font-bold text-accent uppercase tracking-wider mb-2.5">{label}</p>
                  <label className="text-[10px] font-semibold text-accent-subtle uppercase tracking-wider">PIN Admin</label>
                  <input
                    type="text" inputMode="numeric" maxLength={4} placeholder="••••"
                    value={form[`pin_${area}_admin`] ?? ''}
                    onChange={(e) => setForm((f) => ({ ...f, [`pin_${area}_admin`]: e.target.value.replace(/\D/g, '').slice(0, 4) }))}
                    className="mb-2 w-full rounded border border-border bg-surface-0 px-3 py-2 text-sm text-accent font-mono tracking-[0.3em] placeholder:text-accent-subtle focus:outline-none focus:border-white/20"
                  />
                  <label className="text-[10px] font-semibold text-accent-subtle uppercase tracking-wider">PIN User</label>
                  <input
                    type="text" inputMode="numeric" maxLength={4} placeholder="••••"
                    value={form[`pin_${area}_user`] ?? ''}
                    onChange={(e) => setForm((f) => ({ ...f, [`pin_${area}_user`]: e.target.value.replace(/\D/g, '').slice(0, 4) }))}
                    className="w-full rounded border border-border bg-surface-0 px-3 py-2 text-sm text-accent font-mono tracking-[0.3em] placeholder:text-accent-subtle focus:outline-none focus:border-white/20"
                  />
                </div>
              ))}
            </div>
          </CardBody>
        </Card>

        {/* ── Interesse dos Gestores (via Operator app) ── */}
        {Object.keys(djsInteresse).length > 0 && (
          <Card>
            <CardHeader>
              <p className="text-xs font-semibold text-accent-muted uppercase tracking-wider">Interesse dos Gestores</p>
              <p className="text-xs text-accent-subtle mt-1">
                Avaliação do gestor do espaço sobre o interesse em ter cada DJ novamente · via Operator
              </p>
            </CardHeader>
            <CardBody>
              <div className="flex flex-col gap-0">
                {djsActivos
                  .filter((dj) => djsInteresse[dj.id] != null)
                  .sort((a, b) => (djsInteresse[b.id] ?? 0) - (djsInteresse[a.id] ?? 0))
                  .map((dj) => {
                    const val = djsInteresse[dj.id] ?? 0
                    return (
                      <div key={dj.id} className="flex items-center justify-between gap-3 py-2 border-b border-border/30 last:border-0">
                        <span className="text-xs text-accent-muted truncate min-w-[120px]">
                          {dj.nome_artistico || dj.nome}
                        </span>
                        <div className="flex items-center gap-2 shrink-0">
                          <div className="flex gap-0.5">
                            {[1,2,3,4,5].map((n) => (
                              <span key={n} className={n <= val ? 'text-yellow-400' : 'text-accent-subtle'} style={{fontSize:14}}>★</span>
                            ))}
                          </div>
                          <span className="text-[11px] text-accent-subtle tabular-nums">{val}/5</span>
                        </div>
                      </div>
                    )
                  })}
              </div>
            </CardBody>
          </Card>
        )}

        {/* ── Preferências de DJs ── */}
        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <p className="text-xs font-semibold text-accent-muted uppercase tracking-wider">Preferências de DJs para este Cliente</p>
                <p className="text-xs text-accent-subtle mt-1">
                  Preferido = o motor favorece este DJ · Excluído = nunca atribui · Neutro = sem preferência
                </p>
              </div>
              {djsActivosResidentes.length > 0 && (
                <div className="flex items-center gap-1 shrink-0">
                  <span className="text-[10px] text-accent-subtle mr-1">Todos:</span>
                  {[
                    { value: 'preferido', label: 'Preferido', cor: 'bg-status-confirmado/15 text-status-confirmado border-status-confirmado/30 hover:bg-status-confirmado/25' },
                    { value: 'neutro',    label: 'Neutro',    cor: 'bg-surface-2 text-accent-muted border-border hover:text-accent' },
                    { value: 'excluido',  label: 'Excluído',  cor: 'bg-status-cancelado/15 text-status-cancelado border-status-cancelado/30 hover:bg-status-cancelado/25' },
                  ].map((op) => (
                    <button
                      key={op.value}
                      type="button"
                      onClick={() => setDjsPrefs(() =>
                        Object.fromEntries(djsActivosResidentes.map((d) => [d.id, op.value]))
                      )}
                      className={clsx('px-2.5 py-1 rounded border text-[10px] font-semibold transition-colors', op.cor)}
                    >
                      {op.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </CardHeader>
          <CardBody>
            {djsActivosResidentes.length === 0 ? (
              <p className="text-xs text-accent-subtle italic">Sem DJs activos.</p>
            ) : (
              <div className="flex flex-col gap-0">
                {djsActivosResidentes.map((dj) => {
                    const pref = djsPrefs[dj.id] ?? 'neutro'
                    return (
                      <div key={dj.id} className="flex items-center justify-between gap-3 py-2 border-b border-border/30 last:border-0">
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <span className="text-xs text-accent-muted truncate min-w-[120px]">
                            {dj.nome_artistico || dj.nome}
                          </span>
                          {/* Interesse do gestor via Operator */}
                          {djsInteresse[dj.id] != null && (
                            <div className="flex items-center gap-0.5 shrink-0" title={`Interesse do gestor: ${djsInteresse[dj.id]}/5`}>
                              {[1,2,3,4,5].map(n => (
                                <span key={n} style={{ fontSize: 12 }}
                                  className={n <= djsInteresse[dj.id] ? 'text-yellow-400' : 'text-accent-subtle/30'}>
                                  {'★'}
                                </span>
                              ))}
                              <span className="ml-1 text-[10px] text-accent-subtle">{djsInteresse[dj.id]}/5</span>
                            </div>
                          )}
                        </div>
                        <div className="flex gap-1 shrink-0">
                          {[
                            { value: 'preferido', label: 'Preferido', cor: 'bg-status-confirmado/20 text-status-confirmado border-status-confirmado/40' },
                            { value: 'neutro',    label: 'Neutro',    cor: 'bg-surface-2 text-accent-muted border-border' },
                            { value: 'excluido',  label: 'Excluído',  cor: 'bg-status-cancelado/20 text-status-cancelado border-status-cancelado/40' },
                          ].map((op) => (
                            <button
                              key={op.value}
                              type="button"
                              onClick={() => setDjsPrefs((p) => ({ ...p, [dj.id]: op.value }))}
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
            )}
          </CardBody>
        </Card>

        {/* ── Admin: Peso × Turno + Quantidade × Turno ── */}
        {(() => {
          const turnoActivo = turnos[turnoActivoIdx] ?? turnos[0]
          if (!turnoActivo?.nome?.trim() || djsActivosResidentes.length === 0) return null
          return (
            <Card>
              <CardHeader>
                <div>
                  <p className="text-xs font-semibold text-accent-muted uppercase tracking-wider">
                    Admin: Prioridade por Turno
                    <span className="ml-2 normal-case font-medium text-accent">— {turnoActivo.nome}</span>
                  </p>
                  <p className="text-xs text-accent-subtle mt-1">
                    Peso (0–10) favorece o DJ neste turno · Qtd/mês = vezes ideais que o DJ actua neste turno por mês
                  </p>
                </div>
              </CardHeader>
              <CardBody>
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-2 pr-4 font-medium text-accent-muted">DJ</th>
                      <th className="text-center px-3 py-2 font-medium text-accent-muted border-l border-border/40 w-28">Peso (0–10)</th>
                      <th className="text-center px-3 py-2 font-medium text-accent-muted border-l border-border/40 w-28">Qtd / mês</th>
                    </tr>
                  </thead>
                  <tbody>
                    {djsActivosResidentes.map((dj) => {
                      const peso = adminTurnoPref[dj.id]?.[turnoActivo._key] ?? ''
                      const qtd  = turnoQtdPref[dj.id]?.[turnoActivo._key] ?? ''
                      return (
                        <tr key={dj.id} className="border-b border-border/30 last:border-0 hover:bg-surface-2/30 transition-colors">
                          <td className="py-2 pr-4 text-accent-muted">{dj.nome_artistico || dj.nome}</td>
                          <td className="px-3 py-1.5 border-l border-border/40">
                            <input
                              type="number" min={0} max={10} step={1}
                              value={peso}
                              onChange={(e) => setAdminTurnoPref(prev => ({
                                ...prev,
                                [dj.id]: { ...(prev[dj.id] ?? {}), [turnoActivo._key]: e.target.value },
                              }))}
                              placeholder="—"
                              className="w-full bg-surface-2 border border-border rounded px-2 py-1 text-xs text-center text-accent focus:outline-none focus:border-white/20"
                            />
                          </td>
                          <td className="px-3 py-1.5 border-l border-border/40">
                            <input
                              type="number" min={0} step={1}
                              value={qtd}
                              onChange={(e) => setTurnoQtdPref(prev => ({
                                ...prev,
                                [dj.id]: { ...(prev[dj.id] ?? {}), [turnoActivo._key]: e.target.value },
                              }))}
                              placeholder="—"
                              className="w-full bg-surface-2 border border-border rounded px-2 py-1 text-xs text-center text-accent focus:outline-none focus:border-white/20"
                            />
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </CardBody>
            </Card>
          )
        })()}

        {/* ── Admin: Peso × Dia da Semana ── */}
        {djsActivos.length > 0 && (
          <Card>
            <CardHeader>
              <div>
                <p className="text-xs font-semibold text-accent-muted uppercase tracking-wider">Admin: Prioridade por Dia da Semana</p>
                <p className="text-xs text-accent-subtle mt-1">
                  Peso (0–10) por dia da semana · aplica-se independentemente do turno
                </p>
              </div>
            </CardHeader>
            <CardBody>
              <div className="overflow-x-auto">
                <table className="w-full text-xs border-collapse min-w-[520px]">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-2 pr-4 font-medium text-accent-muted min-w-[130px]">DJ</th>
                      {DIAS.map((dia) => (
                        <th key={dia.idx} className="text-center px-1 py-2 font-medium text-accent-muted border-l border-border/40 w-14">
                          {dia.curto}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {djsActivosResidentes.map((dj) => (
                      <tr key={dj.id} className="border-b border-border/30 last:border-0 hover:bg-surface-2/30 transition-colors">
                        <td className="py-2 pr-4 text-accent-muted truncate max-w-[160px]">{dj.nome_artistico || dj.nome}</td>
                        {DIAS.map((dia) => {
                          const val = adminDiaSemPref[dj.id]?.[dia.idx] ?? ''
                          return (
                            <td key={dia.idx} className="px-1 py-1.5 border-l border-border/40">
                              <input
                                type="number" min={0} max={10} step={1}
                                value={val}
                                onChange={(e) => setAdminDiaSemPref(prev => ({
                                  ...prev,
                                  [dj.id]: { ...(prev[dj.id] ?? {}), [dia.idx]: e.target.value },
                                }))}
                                placeholder="—"
                                className="w-12 bg-surface-2 border border-border rounded px-1 py-1 text-xs text-center text-accent focus:outline-none focus:border-white/20"
                              />
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardBody>
          </Card>
        )}
      </div>
    </form>
  )
}
