import { useState, useEffect, useCallback } from 'react'
import { Settings, AlertTriangle, Ban, ScrollText, Car, Tag, Percent, Clock, Receipt, Bell } from 'lucide-react'
import { configuracoesApi, regrasAtuacaoApi } from '@/lib/api'
import { supabase } from '@/lib/supabase'
import { Card, CardHeader, CardBody } from '@/components/ui/Card'
import { Input, Textarea } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { Alerta } from '@/components/ui/Alerta'
import { LoadingPage } from '@/components/ui/LoadingSpinner'
import { useAppStore } from '@/store'
import { NovidadeImageUpload } from '@/components/NovidadeImageUpload'
import { clsx } from 'clsx'

const CAT_DEFAULTS = [
  { key: 'residente_anl', label: 'Residente ANL', valor: null, valorCliente: null, semTransporte: false, horas: '6h' },
  { key: 'residente',     label: 'Residente',     valor: 140,  valorCliente: null, semTransporte: false, horas: '5h' },
  { key: 'residente_st',  label: 'Residente ST',  valor: 140,  valorCliente: null, semTransporte: true,  horas: '5h' },
  { key: 'convidado_int', label: 'Convidado INT', valor: null, valorCliente: null, semTransporte: false, horas: '4h' },
  { key: 'convidado_ext', label: 'Convidado EXT', valor: null, valorCliente: null, semTransporte: false, horas: 'Variável' },
  { key: 'premium',       label: 'Premium',       valor: null, valorCliente: null, semTransporte: false, horas: 'Variável' },
]

// Dom=0 Seg=1 Ter=2 Qua=3 Qui=4 Sex=5 Sáb=6
const DAY_SEMANA = [0, 1, 2, 3]
const DAY_FDS    = [4, 5, 6]
const DAY_LABELS = ['Do', 'Se', 'Te', 'Qa', 'Qi', 'Sx', 'Sa']

const INFO_TIPOS = [
  { catKey: 'residente_anl', tipo: 'Residente ANL', efeito: 'DJ que atua durante a noite toda' },
  { catKey: 'residente',     tipo: 'Residente',     efeito: 'DJ do coletivo regular com condições para adaptação ao espaço' },
  { catKey: 'convidado_int', tipo: 'Convidado INT', efeito: 'DJ do coletivo regular com condições específicas' },
  { catKey: 'convidado_ext', tipo: 'Convidado EXT', efeito: 'Escolhido e negociado com o DJ' },
  { catKey: 'premium',       tipo: 'Premium',       efeito: 'Escolhido e negociado com o DJ' },
]

const SUBTIPO_DEFAULTS = [
  { key: 'res_anl_1_sem',   label: 'Residente ANL (Semana)',           tipo: 'residente_anl', variante: 1, custo: 0,   margem: 0, dias: DAY_SEMANA, semTransporte: false },
  { key: 'res_anl_2_sem',   label: 'Residente ANL 2 (Semana)',         tipo: 'residente_anl', variante: 2, custo: 0,   margem: 0, dias: DAY_SEMANA, semTransporte: false },
  { key: 'res_anl_1_fds',   label: 'Residente ANL (Fim de Semana)',    tipo: 'residente_anl', variante: 1, custo: 150, margem: 0, dias: DAY_FDS,    semTransporte: false },
  { key: 'res_anl_2_fds',   label: 'Residente ANL 2 (Fim de Semana)', tipo: 'residente_anl', variante: 2, custo: 0,   margem: 0, dias: DAY_FDS,    semTransporte: false },
  { key: 'res_1_sem',       label: 'Residente (Semana)',               tipo: 'residente',     variante: 1, custo: 130, margem: 0, dias: DAY_SEMANA, semTransporte: false },
  { key: 'res_2_sem',       label: 'Residente 2 (Semana)',             tipo: 'residente',     variante: 2, custo: 130, margem: 0, dias: DAY_SEMANA, semTransporte: false },
  { key: 'res_1_fds',       label: 'Residente (Fim de Semana)',        tipo: 'residente',     variante: 1, custo: 150, margem: 0, dias: DAY_FDS,    semTransporte: false },
  { key: 'res_2_fds',       label: 'Residente 2 (Fim de Semana)',      tipo: 'residente',     variante: 2, custo: 150, margem: 0, dias: DAY_FDS,    semTransporte: false },
  { key: 'conv_int_1_sem',  label: 'Convidado INT (Semana)',           tipo: 'convidado_int', variante: 1, custo: 130, margem: 0, dias: DAY_SEMANA, semTransporte: false },
  { key: 'conv_int_2_sem',  label: 'Convidado INT 2 (Semana)',         tipo: 'convidado_int', variante: 2, custo: 130, margem: 0, dias: DAY_SEMANA, semTransporte: false },
  { key: 'conv_int_1_fds',  label: 'Convidado INT (Fim de Semana)',    tipo: 'convidado_int', variante: 1, custo: 150, margem: 0, dias: DAY_FDS,    semTransporte: false },
  { key: 'conv_int_2_fds',  label: 'Convidado INT 2 (Fim de Semana)', tipo: 'convidado_int', variante: 2, custo: 150, margem: 0, dias: DAY_FDS,    semTransporte: false },
]

const SUBTIPO_GRUPOS = [
  { tipo: 'residente_anl',  label: 'Residente ANL' },
  { tipo: 'residente',      label: 'Residente' },
  { tipo: 'convidado_int',  label: 'Convidado INT' },
]
const TRANSP_DEFAULTS = [
  { label: 'Comporta / Alentejo', valor: 120 },
  { label: '', valor: 80 },
  { label: '', valor: 60 },
]
const DESC_DEFAULTS = [
  { label: 'Operação', valor: 2 },
  { label: '', valor: 5 },
  { label: '', valor: 10 },
]

function safeParse(str, fallback) {
  try { return str ? JSON.parse(str) : fallback } catch { return fallback }
}

function Toggle({ checked, onChange, label, descricao }) {
  return (
    <label className="flex items-start gap-3 cursor-pointer group">
      <div className="mt-0.5 shrink-0">
        <div
          onClick={onChange}
          className={clsx(
            'w-9 h-5 rounded-full transition-colors relative cursor-pointer',
            checked ? 'bg-status-confirmado' : 'bg-surface-3'
          )}
        >
          <div className={clsx(
            'absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform shadow-sm',
            checked ? 'left-[18px]' : 'left-0.5'
          )} />
        </div>
      </div>
      <div>
        <p className="text-sm text-accent">{label}</p>
        {descricao && <p className="text-xs text-accent-subtle mt-0.5">{descricao}</p>}
      </div>
    </label>
  )
}

function BoolToggle({ checked, onChange, label }) {
  return (
    <button
      type="button"
      onClick={onChange}
      className={clsx(
        'w-8 h-4 rounded-full transition-colors relative shrink-0',
        checked ? 'bg-status-confirmado' : 'bg-surface-3'
      )}
    >
      <div className={clsx(
        'absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform shadow-sm',
        checked ? 'left-[18px]' : 'left-0.5'
      )} />
      <span className="sr-only">{label}</span>
    </button>
  )
}

function DayPicker({ dias, onChange }) {
  return (
    <div className="flex items-center gap-0.5">
      {DAY_LABELS.map((label, day) => (
        <button
          key={day}
          type="button"
          onClick={() => onChange(day)}
          title={['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'][day]}
          className={clsx(
            'w-[22px] h-[22px] rounded text-[9px] font-bold transition-colors',
            day === 4 && 'ml-1.5',
            dias.includes(day)
              ? 'bg-status-confirmado/25 text-status-confirmado border border-status-confirmado/40'
              : 'bg-surface-2 text-accent-subtle/50 border border-border/30 hover:text-accent-muted'
          )}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

function BRow({ label, value, bold, accent }) {
  return (
    <div className="flex items-center justify-between px-4 py-2">
      <span className={clsx('text-xs', bold ? 'font-semibold text-accent' : 'text-accent-muted')}>{label}</span>
      <span className={clsx('text-xs tabular-nums font-semibold', accent ?? (bold ? 'text-accent' : 'text-accent-muted'))}>{value}</span>
    </div>
  )
}

export function Configuracoes() {
  const setConfig = useAppStore((s) => s.setConfig)
  const setHeaderAction = useAppStore((s) => s.setHeaderAction)
  const [config, setConfigLocal] = useState({})
  const [regras, setRegras] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [erro, setErro] = useState(null)
  const [sucesso, setSucesso] = useState(false)

  const [pagEmpresa,    setPagEmpresa]    = useState('')
  const [pagMorada,     setPagMorada]     = useState('')
  const [pagNif,        setPagNif]        = useState('')
  const [pagCentroUrl,  setPagCentroUrl]  = useState('')
  const [pagInstrucoes, setPagInstrucoes] = useState('')

  const APOIO_KEY = 'apoio_tecnico_rates'
  const [apoioRates, setApoioRates] = useState(() => {
    try { return JSON.parse(localStorage.getItem(APOIO_KEY) ?? 'null') ?? { ate5h: 90, ate8h: 125, mais8h: 150 } }
    catch { return { ate5h: 90, ate8h: 125, mais8h: 150 } }
  })
  const saveApoioRates = (rates) => {
    setApoioRates(rates)
    localStorage.setItem(APOIO_KEY, JSON.stringify(rates))
  }

  // Contas — estados locais
  const [categorias, setCategorias]   = useState(CAT_DEFAULTS)
  const [subtipos, setSubtipos]       = useState(SUBTIPO_DEFAULTS)
  const [transportes, setTransportes] = useState(TRANSP_DEFAULTS)
  const [descontos, setDescontos]           = useState(DESC_DEFAULTS)
  const [descontoPct, setDescontoPct]       = useState('25')
  const [valorQualidade, setValorQualidade] = useState('2')
  const [ativarValorQualidade, setAtivarValorQualidade] = useState(true)
  const [novidadeGeral, setNovidadeGeral] = useState({ id: null, titulo: '', texto: '', imagem_url: '', ativo: false })
  const [novidadeGeralSaving, setNovidadeGeralSaving] = useState(false)

  useEffect(() => {
    supabase.from('novidades').select('*').eq('tipo', 'geral').maybeSingle()
      .then(({ data }) => {
        if (data) setNovidadeGeral({ id: data.id, titulo: data.titulo ?? '', texto: data.texto ?? '', imagem_url: data.imagem_url ?? '', ativo: data.ativo })
      })
  }, [])

  useEffect(() => {
    Promise.all([configuracoesApi.listar(), regrasAtuacaoApi.obter()])
      .then(([c, r]) => {
        setConfigLocal(c)
        setConfig(c)
        setRegras(r)
        const loadedCats = safeParse(c.contas_categorias, CAT_DEFAULTS)
        setCategorias(CAT_DEFAULTS.map(def => ({ ...def, ...(loadedCats.find(l => l.key === def.key) ?? {}) })))
        const loadedSubs = safeParse(c.contas_subtipos, SUBTIPO_DEFAULTS)
        setSubtipos(SUBTIPO_DEFAULTS.map(def => ({ ...def, ...(loadedSubs.find(l => l.key === def.key) ?? {}) })))
        setTransportes(safeParse(c.contas_transportes, TRANSP_DEFAULTS))
        setDescontos(safeParse(c.contas_descontos, DESC_DEFAULTS))
        setDescontoPct(c.contas_desconto_pct ?? '25')
        setValorQualidade(c.contas_valor_qualidade ?? '2')
        setAtivarValorQualidade(c.contas_valor_qualidade_ativo !== false)
        setPagEmpresa(c.pagamento_empresa    ?? 'LMD Laboratório de Música Digital, Unipessoal Lda')
        setPagMorada(c.pagamento_morada      ?? 'Praceta Maestro Ivo Cruz 12 C, 1500-501 Lisboa')
        setPagNif(c.pagamento_nif            ?? '516233726')
        setPagCentroUrl(c.pagamento_centro_url ?? 'https://maps.app.goo.gl/nTA4wXn5UzAGMk7s7')
        setPagInstrucoes(c.pagamento_instrucoes ?? 'Confirma os valores para o recibo. O recibo deve ser enviado para financeiro@prolabdj.com, com o assunto: Recibo Atuação DJ + o teu nome + data\n\nNo corpo do email o respetivo NIB.\n\nAlguma outra questão não hesite em contactar.')
      })
      .catch((e) => setErro(e.message))
      .finally(() => setLoading(false))
  }, [setConfig])

  const set = (chave) => (e) =>
    setConfigLocal((c) => ({ ...c, [chave]: e.target.value }))

  const setToggle = (chave) => () =>
    setConfigLocal((c) => ({ ...c, [chave]: c[chave] === 'true' ? 'false' : 'true' }))

  const setCat = (i, field, val) =>
    setCategorias(prev => prev.map((c, idx) => idx === i ? { ...c, [field]: val } : c))

  const setSubtipo = (i, field, val) =>
    setSubtipos(prev => prev.map((s, idx) => idx === i ? { ...s, [field]: val } : s))

  const toggleSubtipoDay = (i, day) =>
    setSubtipos(prev => prev.map((s, idx) => {
      if (idx !== i) return s
      const hasDia = s.dias.includes(day)
      return { ...s, dias: hasDia ? s.dias.filter(d => d !== day) : [...s.dias, day].sort((a, b) => a - b) }
    }))

  const setTransp = (i, field, val) =>
    setTransportes(prev => prev.map((t, idx) => idx === i ? { ...t, [field]: val } : t))

  const setDesc = (i, field, val) =>
    setDescontos(prev => prev.map((d, idx) => idx === i ? { ...d, [field]: val } : d))

  const guardarNovidadeGeral = async () => {
    setNovidadeGeralSaving(true)
    try {
      const payload = { tipo: 'geral', espaco_id: null, titulo: novidadeGeral.titulo || null, texto: novidadeGeral.texto || null, imagem_url: novidadeGeral.imagem_url || null, ativo: novidadeGeral.ativo }
      if (novidadeGeral.id) {
        await supabase.from('novidades').update(payload).eq('id', novidadeGeral.id)
        await supabase.from('novidades_vistas').delete().eq('novidade_id', novidadeGeral.id)
      } else {
        const { data } = await supabase.from('novidades').insert(payload).select().single()
        if (data) setNovidadeGeral(n => ({ ...n, id: data.id }))
      }
    } finally {
      setNovidadeGeralSaving(false)
    }
  }

  const guardar = useCallback(async () => {
    setSaving(true); setErro(null); setSucesso(false)
    try {
      const full = {
        ...config,
        contas_categorias:    JSON.stringify(categorias),
        contas_subtipos:      JSON.stringify(subtipos),
        contas_transportes:   JSON.stringify(transportes),
        contas_descontos:        JSON.stringify(descontos),
        contas_desconto_pct:     descontoPct,
        contas_valor_qualidade:       valorQualidade,
        contas_valor_qualidade_ativo: ativarValorQualidade,
        pagamento_empresa:    pagEmpresa,
        pagamento_morada:     pagMorada,
        pagamento_nif:        pagNif,
        pagamento_centro_url: pagCentroUrl,
        pagamento_instrucoes: pagInstrucoes,
      }
      for (const [chave, valor] of Object.entries(full)) {
        await configuracoesApi.actualizar(chave, valor)
      }
      await regrasAtuacaoApi.guardar(regras)
      setConfig(full)
      setSucesso(true)
      setTimeout(() => setSucesso(false), 3000)
    } catch (e) {
      setErro(e.message)
    } finally {
      setSaving(false)
    }
  }, [config, categorias, subtipos, transportes, descontos, descontoPct, regras, setConfig])

  useEffect(() => {
    setHeaderAction({ label: 'Guardar', onClick: guardar, loading: saving })
    return () => setHeaderAction(null)
  }, [guardar, saving, setHeaderAction])

  if (loading) return <LoadingPage />

  return (
    <div className="p-6 max-w-4xl">
      <div className="flex items-center gap-2 mb-6">
        <Settings size={16} className="text-accent-muted" />
        <div>
          <h1 className="text-base font-semibold text-accent">Configurações</h1>
          <p className="text-xs text-accent-muted mt-0.5">Regras globais de distribuição</p>
        </div>
      </div>

      {erro && <Alerta tipo="erro" mensagem={erro} className="mb-4" />}
      {sucesso && <Alerta tipo="sucesso" mensagem="Configurações guardadas com sucesso." className="mb-4" />}

      {/* ── Novidade Geral ── */}
      <Card className="mb-4">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Bell size={13} className="text-amber-400" />
              <p className="text-xs font-semibold text-accent-muted uppercase tracking-wider">Novidade Geral — visível a todos os DJs</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-accent-subtle">{novidadeGeral.ativo ? 'Activa' : 'Inactiva'}</span>
              <button type="button" onClick={() => setNovidadeGeral(n => ({ ...n, ativo: !n.ativo }))}
                className={clsx('w-9 h-5 rounded-full transition-colors relative', novidadeGeral.ativo ? 'bg-amber-500' : 'bg-surface-3')}>
                <div className={clsx('absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform shadow-sm', novidadeGeral.ativo ? 'left-[18px]' : 'left-0.5')} />
              </button>
            </div>
          </div>
        </CardHeader>
        <CardBody className="flex flex-col gap-3">
          <p className="text-xs text-accent-subtle">Aparece como notificação em todos os slots da app DJ, quando activa e ainda não vista pelo DJ.</p>
          <Input label="Título" value={novidadeGeral.titulo} onChange={e => setNovidadeGeral(n => ({ ...n, titulo: e.target.value }))} placeholder="ex: Nova política de pontualidade" />
          <Textarea label="Texto" value={novidadeGeral.texto} onChange={e => setNovidadeGeral(n => ({ ...n, texto: e.target.value }))} placeholder="Descreve a novidade..." rows={3} />
          <NovidadeImageUpload value={novidadeGeral.imagem_url} onChange={url => setNovidadeGeral(n => ({ ...n, imagem_url: url }))} />
          <div className="flex justify-end">
            <Button type="button" onClick={guardarNovidadeGeral} loading={novidadeGeralSaving} size="sm">
              Guardar Novidade
            </Button>
          </div>
        </CardBody>
      </Card>

      {/* ── Regras de atuação ── */}
      <Card className="mb-4">
        <CardHeader>
          <div className="flex items-center gap-2">
            <ScrollText size={13} className="text-accent-muted" />
            <p className="text-xs font-semibold text-accent-muted uppercase tracking-wider">Regras de atuação — visíveis aos DJs</p>
          </div>
        </CardHeader>
        <CardBody className="flex flex-col gap-2">
          <p className="text-xs text-accent-subtle">
            Este texto aparece no modal de <span className="text-accent-muted font-medium">todas as datas</span> e para <span className="text-accent-muted font-medium">todos os DJs</span> na app deles.
          </p>
          <textarea
            value={regras}
            onChange={(e) => setRegras(e.target.value)}
            rows={8}
            placeholder={'Ex:\n• Chegar 30 min antes do início.\n• Dress code: preto.\n• Confirmar presença por WhatsApp até 48h antes.'}
            className="w-full bg-surface-2 border border-border rounded-lg px-3.5 py-2.5 text-sm text-accent placeholder:text-accent-subtle/50 focus:outline-none focus:border-accent/30 transition-colors resize-y leading-relaxed"
          />
        </CardBody>
      </Card>

      {/* ── Valor Categorias DJ ── */}
      <Card className="mb-4">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Tag size={13} className="text-accent-muted" />
            <p className="text-xs font-semibold text-accent-muted uppercase tracking-wider">Valor Categorias DJ</p>
          </div>
        </CardHeader>
        <CardBody>

          {/* Tabela informativa de tipos */}
          <div className="mb-5 border border-border/40 rounded-lg overflow-hidden">
            <div className="grid grid-cols-[130px_70px_1fr] bg-surface-2 border-b border-border/40">
              {['Tipo', 'Horas', 'Efeito'].map(h => (
                <div key={h} className="px-3 py-2 text-[10px] font-bold text-accent-muted uppercase tracking-wider">{h}</div>
              ))}
            </div>
            {INFO_TIPOS.map((t, i) => {
              const catIdx = categorias.findIndex(c => c.key === t.catKey)
              const cat = categorias[catIdx]
              return (
                <div key={i} className={clsx('grid grid-cols-[130px_70px_1fr] divide-x divide-border/20', i % 2 !== 0 && 'bg-surface-0/20')}>
                  <div className="px-3 py-1.5 text-xs font-medium text-accent flex items-center gap-1.5">
                    <Clock size={10} className="text-accent-subtle shrink-0" />
                    {t.tipo}
                  </div>
                  <div className="px-1.5 py-1">
                    <input
                      type="text"
                      value={cat?.horas ?? ''}
                      onChange={e => setCat(catIdx, 'horas', e.target.value)}
                      className="w-full bg-surface-2 border border-border/40 rounded px-2 py-0.5 text-xs text-accent-muted tabular-nums focus:outline-none focus:border-accent/40"
                    />
                  </div>
                  <div className="px-3 py-1.5 text-xs text-accent-subtle">{t.efeito}</div>
                </div>
              )
            })}
          </div>

          {/* Tabela de subtipos */}
          <div className="text-[10px] text-accent-subtle mb-2 px-1">
            Dom–Qua = <span className="text-accent-muted font-medium">Semana</span> &nbsp;|&nbsp;
            Qui–Sáb = <span className="text-accent-muted font-medium">Fim de Semana</span>
            &nbsp;— clica nos dias para alterar por linha
          </div>
          <div className="flex flex-col divide-y divide-border/30 border border-border/40 rounded-lg overflow-hidden">
            {/* cabeçalho */}
            <div className="grid grid-cols-[minmax(160px,1fr)_65px_178px_65px_96px_60px] gap-2 px-2 py-2 bg-surface-2 items-center">
              <span className="text-[10px] font-bold text-accent-muted uppercase tracking-wider">SubTipo</span>
              <span className="text-[10px] font-bold text-accent-muted uppercase tracking-wider text-right">Custo</span>
              <span className="text-[10px] font-bold text-accent-muted uppercase tracking-wider text-center">Dias da Semana</span>
              <span className="text-[10px] font-bold text-accent-muted uppercase tracking-wider text-right">Margem</span>
              <span className="text-[10px] font-bold text-accent-muted uppercase tracking-wider text-center">Transporte</span>
              <span className="text-[10px] font-bold text-accent-muted uppercase tracking-wider text-right">Total</span>
            </div>

            {SUBTIPO_GRUPOS.map(grupo => {
              const rows = subtipos.filter(s => s.tipo === grupo.tipo)
              return (
                <div key={grupo.tipo}>
                  {/* cabeçalho do grupo */}
                  <div className="px-2 py-1 text-[9px] font-bold text-accent-subtle/60 uppercase tracking-widest bg-surface-0/40 border-y border-border/20">
                    {grupo.label}
                  </div>
                  {rows.map(s => {
                    const i = subtipos.findIndex(x => x.key === s.key)
                    const transpDefault = transportes[0]?.valor ?? 0
                    const transpVal = s.semTransporte ? 0 : transpDefault
                    const total = s.custo + s.margem + transpVal
                    return (
                      <div key={s.key} className="grid grid-cols-[minmax(160px,1fr)_65px_178px_65px_96px_60px] gap-2 px-2 py-2 items-center border-b border-border/15 last:border-0 hover:bg-surface-0/20">
                        <span className="text-xs text-accent">{s.label}</span>
                        <input
                          type="number" min={0} step={5} value={s.custo}
                          onChange={e => setSubtipo(i, 'custo', Number(e.target.value) || 0)}
                          className="w-full bg-surface-2 border border-border rounded px-2 py-1 text-xs text-right text-accent tabular-nums focus:outline-none focus:border-accent/40"
                        />
                        <div className="flex justify-center">
                          <DayPicker dias={s.dias} onChange={day => toggleSubtipoDay(i, day)} />
                        </div>
                        <input
                          type="number" step={5} value={s.margem}
                          onChange={e => setSubtipo(i, 'margem', Number(e.target.value) || 0)}
                          className={clsx(
                            'w-full bg-surface-2 border border-border rounded px-2 py-1 text-xs text-right tabular-nums focus:outline-none focus:border-accent/40',
                            s.margem > 0 ? 'text-status-confirmado' : s.margem < 0 ? 'text-status-cancelado' : 'text-accent-subtle'
                          )}
                        />
                        <div className="flex items-center justify-center gap-1">
                          <BoolToggle
                            checked={!s.semTransporte}
                            onChange={() => setSubtipo(i, 'semTransporte', !s.semTransporte)}
                            label="Transporte"
                          />
                          <span className="text-[10px] tabular-nums text-accent-subtle w-9 text-right">
                            {s.semTransporte ? '0€' : `${transpDefault}€`}
                          </span>
                        </div>
                        <span className="text-xs tabular-nums text-right font-semibold text-accent">
                          {total}€
                        </span>
                      </div>
                    )
                  })}
                </div>
              )
            })}
          </div>

        </CardBody>
      </Card>

      {/* ── Transporte ── */}
      <Card className="mb-4">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Car size={13} className="text-accent-muted" />
            <p className="text-xs font-semibold text-accent-muted uppercase tracking-wider">Transporte</p>
          </div>
        </CardHeader>
        <CardBody>
          <p className="text-xs text-accent-subtle mb-3">
            Valores de transporte disponíveis nas contas. O primeiro é aplicado por defeito.
          </p>
          <div className="flex flex-col divide-y divide-border/40">
            <div className="grid grid-cols-[1fr_100px] gap-3 pb-2 px-1">
              <span className="text-[10px] font-bold text-accent-muted uppercase tracking-wider">Zona / Descrição</span>
              <span className="text-[10px] font-bold text-accent-muted uppercase tracking-wider text-right">Valor (€)</span>
            </div>
            {transportes.map((t, i) => (
              <div key={i} className="grid grid-cols-[1fr_100px] gap-3 items-center py-2.5 px-1">
                <div className="flex items-center gap-2">
                  {i === 0 && (
                    <span className="text-[9px] font-bold text-accent bg-accent/10 border border-accent/20 rounded px-1.5 py-0.5 shrink-0 uppercase tracking-wider">default</span>
                  )}
                  <input
                    type="text"
                    value={t.label}
                    onChange={e => setTransp(i, 'label', e.target.value)}
                    placeholder={`Zona ${i + 1}`}
                    className="w-full bg-surface-2 border border-border rounded-md px-2 py-1.5 text-xs text-accent placeholder:text-accent-subtle/50 focus:outline-none focus:border-accent/40"
                  />
                </div>
                <input
                  type="number"
                  min={0}
                  step={5}
                  value={t.valor}
                  onChange={e => setTransp(i, 'valor', Number(e.target.value))}
                  className="w-full bg-surface-2 border border-border rounded-md px-2 py-1.5 text-xs text-right text-accent tabular-nums focus:outline-none focus:border-accent/40"
                />
              </div>
            ))}
          </div>
        </CardBody>
      </Card>

      {/* ── Descontos ── */}
      <Card className="mb-4">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Percent size={13} className="text-accent-muted" />
            <p className="text-xs font-semibold text-accent-muted uppercase tracking-wider">Descontos</p>
          </div>
        </CardHeader>
        <CardBody>
          <p className="text-xs text-accent-subtle mb-3">
            Valores de desconto por data disponíveis nas contas. O primeiro é aplicado por defeito.
          </p>
          <div className="flex flex-col divide-y divide-border/40 mb-4">
            <div className="grid grid-cols-[1fr_100px] gap-3 pb-2 px-1">
              <span className="text-[10px] font-bold text-accent-muted uppercase tracking-wider">Descrição</span>
              <span className="text-[10px] font-bold text-accent-muted uppercase tracking-wider text-right">Valor (€)</span>
            </div>
            {descontos.map((d, i) => (
              <div key={i} className="grid grid-cols-[1fr_100px] gap-3 items-center py-2.5 px-1">
                <div className="flex items-center gap-2">
                  {i === 0 && (
                    <span className="text-[9px] font-bold text-accent bg-accent/10 border border-accent/20 rounded px-1.5 py-0.5 shrink-0 uppercase tracking-wider">default</span>
                  )}
                  <input
                    type="text"
                    value={d.label}
                    onChange={e => setDesc(i, 'label', e.target.value)}
                    placeholder={`Desconto ${i + 1}`}
                    className="w-full bg-surface-2 border border-border rounded-md px-2 py-1.5 text-xs text-accent placeholder:text-accent-subtle/50 focus:outline-none focus:border-accent/40"
                  />
                </div>
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={d.valor}
                  onChange={e => setDesc(i, 'valor', Number(e.target.value))}
                  className="w-full bg-surface-2 border border-border rounded-md px-2 py-1.5 text-xs text-right text-accent tabular-nums focus:outline-none focus:border-accent/40"
                />
              </div>
            ))}
          </div>
          <div className="flex items-center gap-3 border-t border-border/40 pt-4 px-1">
            <span className="text-xs text-accent flex-1">Retenção padrão (%)</span>
            <input
              type="number"
              min={0}
              max={100}
              step={1}
              value={descontoPct}
              onChange={e => setDescontoPct(e.target.value)}
              className="w-24 bg-surface-2 border border-border rounded-md px-2 py-1.5 text-xs text-right text-accent tabular-nums focus:outline-none focus:border-accent/40"
            />
            <span className="text-xs text-accent-muted">%</span>
          </div>
          <div className="flex items-center gap-3 border-t border-border/40 pt-4 px-1">
            <span className="text-xs text-accent flex-1">Valor Qualidade (€ / atuação)</span>
            <input
              type="number"
              min={0}
              step={0.5}
              value={valorQualidade}
              onChange={e => setValorQualidade(e.target.value)}
              className="w-24 bg-surface-2 border border-border rounded-md px-2 py-1.5 text-xs text-right text-accent tabular-nums focus:outline-none focus:border-accent/40"
            />
            <span className="text-xs text-accent-muted">€</span>
            <button
              type="button"
              onClick={() => setAtivarValorQualidade(v => !v)}
              className={`w-8 h-4 rounded-full transition-colors relative flex-shrink-0 ${ativarValorQualidade ? 'bg-status-confirmado' : 'bg-surface-3'}`}
            >
              <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform shadow-sm ${ativarValorQualidade ? 'left-[18px]' : 'left-0.5'}`} />
            </button>
          </div>
          <div className="flex items-center gap-3 border-t border-border/40 pt-4 px-1">
            <span className="text-xs text-accent flex-1">Valor hora extra (€/h)</span>
            <input
              type="number"
              min={0}
              step={1}
              value={config.contas_valor_hora_extra ?? '30'}
              onChange={set('contas_valor_hora_extra')}
              className="w-24 bg-surface-2 border border-border rounded-md px-2 py-1.5 text-xs text-right text-accent tabular-nums focus:outline-none focus:border-accent/40"
            />
            <span className="text-xs text-accent-muted">€/h</span>
          </div>
        </CardBody>
      </Card>

      {/* ── Espaçamentos ── */}
      <Card className="mb-4">
        <CardHeader>
          <p className="text-xs font-semibold text-accent-muted uppercase tracking-wider">Espaçamentos</p>
        </CardHeader>
        <CardBody className="flex flex-col gap-4">
          <Input
            label="Espaçamento mínimo global (dias)"
            type="number" min={1} max={90}
            value={config.dias_espacamento_global ?? ''}
            onChange={set('dias_espacamento_global')}
            descricao="Número mínimo de dias entre atuações do mesmo DJ em qualquer Cliente."
          />
          <Input
            label="Dias sem repetir DJ no mesmo Cliente (default)"
            type="number" min={1} max={180}
            value={config.dias_sem_repeticao_global ?? ''}
            onChange={set('dias_sem_repeticao_global')}
            descricao="Cada Cliente pode sobrepor este valor nas suas configurações."
          />
        </CardBody>
      </Card>

      {/* ── Regra 1: Sem repetição entre Clientes ── */}
      <Card className="mb-4">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Ban size={13} className="text-accent-muted" />
            <p className="text-xs font-semibold text-accent-muted uppercase tracking-wider">Regra 1 — Sem repetição entre Clientes</p>
          </div>
        </CardHeader>
        <CardBody className="flex flex-col gap-4">
          <Toggle
            checked={config.regra_sem_repeticao_espacos === 'true'}
            onChange={setToggle('regra_sem_repeticao_espacos')}
            label="Activar regra de não repetição entre Clientes no mesmo dia"
            descricao="Um DJ não pode estar agendado em mais do que um Cliente no mesmo dia e turno."
          />
          {config.regra_sem_repeticao_espacos === 'true' && (
            <div className="bg-surface-2 border border-border/50 rounded-lg px-4 py-3 text-xs text-accent-subtle leading-relaxed">
              <p className="font-semibold text-accent-muted mb-1">Como funciona</p>
              <p>Ao atribuir um DJ a um slot, o motor verifica se esse DJ já tem uma atuação confirmada ou proposta noutro Cliente no mesmo dia.</p>
            </div>
          )}
        </CardBody>
      </Card>

      {/* ── Regra 2: Penalização por faltas ── */}
      <Card className="mb-4">
        <CardHeader>
          <div className="flex items-center gap-2">
            <AlertTriangle size={13} className="text-accent-muted" />
            <p className="text-xs font-semibold text-accent-muted uppercase tracking-wider">Regra 2 — Penalização por faltas</p>
          </div>
        </CardHeader>
        <CardBody className="flex flex-col gap-4">
          <Toggle
            checked={config.penalizacao_faltas_ativa === 'true'}
            onChange={setToggle('penalizacao_faltas_ativa')}
            label="Activar penalização automática por excesso de faltas"
            descricao="DJs que ultrapassem o limite de faltas num mês ficam penalizados no mês seguinte."
          />
          {config.penalizacao_faltas_ativa === 'true' && (
            <>
              <Input
                label="Limite de faltas por mês"
                type="number" min={1} max={10}
                value={config.penalizacao_faltas_limite ?? '2'}
                onChange={set('penalizacao_faltas_limite')}
                descricao={`DJs com mais de ${config.penalizacao_faltas_limite ?? 2} falta(s) num mês são penalizados no mês seguinte.`}
              />
              <div className="bg-surface-2 border border-border/50 rounded-lg px-4 py-3 text-xs text-accent-subtle leading-relaxed">
                <p className="font-semibold text-accent-muted mb-1">Como funciona</p>
                <p>No início de cada mês, o motor verifica as faltas do mês anterior. DJs que excedam o limite ficam marcados como penalizados.</p>
              </div>
            </>
          )}
        </CardBody>
      </Card>

      {/* ── Apoio Técnico ── */}
          <Card className="mb-4">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Settings size={16} className="text-status-confirmado" />
                <span className="text-sm font-semibold text-accent">Tarifas Apoio Técnico</span>
              </div>
            </CardHeader>
            <CardBody>
              <p className="text-xs text-accent-subtle mb-4">Valores de referência para cálculo do apoio técnico por evento.</p>
              <div className="flex flex-col gap-3">
                {[
                  { label: 'Apoio até 5 horas', key: 'ate5h' },
                  { label: 'Apoio até 8 horas', key: 'ate8h' },
                  { label: 'Apoio mais de 8 horas', key: 'mais8h' },
                ].map(item => (
                  <div key={item.key} className="flex items-center justify-between gap-4">
                    <span className="text-sm text-accent flex-1">{item.label}</span>
                    <div className="flex items-center gap-1.5">
                      <Input
                        type="number"
                        min="0"
                        step="1"
                        value={apoioRates[item.key]}
                        onChange={e => saveApoioRates({ ...apoioRates, [item.key]: Number(e.target.value) })}
                        className="w-24 text-right"
                      />
                      <span className="text-xs text-accent-subtle">€</span>
                    </div>
                  </div>
                ))}
              </div>
            </CardBody>
          </Card>

      {/* ── Informações para Pagamentos ── */}
      <Card className="mb-6">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Receipt size={14} className="text-accent-muted" />
            <p className="text-xs font-semibold text-accent-muted uppercase tracking-wider">Informações para Pagamentos</p>
          </div>
          <p className="text-[10px] text-accent-subtle mt-1">Dados visíveis aos DJs no card de Faturação da app.</p>
        </CardHeader>
        <CardBody>
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-semibold text-accent-subtle uppercase tracking-wider">Empresa</label>
                <Input value={pagEmpresa} onChange={e => setPagEmpresa(e.target.value)} placeholder="Nome da empresa" />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-semibold text-accent-subtle uppercase tracking-wider">NIF</label>
                <Input value={pagNif} onChange={e => setPagNif(e.target.value)} placeholder="000000000" />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-semibold text-accent-subtle uppercase tracking-wider">Morada</label>
              <Input value={pagMorada} onChange={e => setPagMorada(e.target.value)} placeholder="Rua, nº, código postal" />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-semibold text-accent-subtle uppercase tracking-wider">Link Centro (Google Maps)</label>
              <Input type="url" value={pagCentroUrl} onChange={e => setPagCentroUrl(e.target.value)} placeholder="https://maps.app.goo.gl/..." />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-semibold text-accent-subtle uppercase tracking-wider">Instruções (campo editável)</label>
              <textarea
                rows={5}
                value={pagInstrucoes}
                onChange={e => setPagInstrucoes(e.target.value)}
                placeholder="Texto de instruções para envio do recibo…"
                className="w-full bg-surface-2 border border-border rounded-xl px-3 py-2 text-sm text-accent placeholder:text-accent-subtle/40 focus:outline-none focus:border-gold-500/40 resize-none transition-colors"
              />
            </div>
          </div>
        </CardBody>
      </Card>

      {/* ── Notificações ── */}
      <Card className="mb-6">
        <CardHeader>
          <p className="text-xs font-semibold text-accent-muted uppercase tracking-wider">Notificações</p>
        </CardHeader>
        <CardBody>
          <Toggle
            checked={config.notificacoes_ativas === 'true'}
            onChange={setToggle('notificacoes_ativas')}
            label="Notificações WhatsApp activas"
            descricao="Envia confirmações e lembretes de atuação via WhatsApp através do n8n."
          />
        </CardBody>
      </Card>

    </div>
  )
}
