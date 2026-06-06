import { useState, useEffect, useCallback, useMemo } from 'react'
import { Trash2, CalendarCheck, CalendarX, Plus } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Input, Select, Textarea } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { Alerta } from '@/components/ui/Alerta'
import { djsApi, djPreferenciasEspacoApi, disponibilidadesApi, categoriasDjApi, djCategoriasApi } from '@/lib/api'
import { useUndo } from '@/contexts/UndoContext'
import { useEspacos } from '@/hooks/useEspacos'
import { format, parse, isValid, addMonths, startOfMonth, getDaysInMonth } from 'date-fns'
import { pt } from 'date-fns/locale'
import { clsx } from 'clsx'

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1)

function formatarDataCurta(iso) {
  try {
    const d = parse(iso, 'yyyy-MM-dd', new Date())
    return isValid(d) ? cap(format(d, "EEE d MMM yyyy", { locale: pt })) : iso
  } catch { return iso }
}

function agruparPorMes(disps) {
  const grupos = {}
  for (const d of disps) {
    const mes = d.data?.slice(0, 7) ?? ''
    if (!grupos[mes]) grupos[mes] = []
    grupos[mes].push(d)
  }
  return Object.entries(grupos).sort(([a], [b]) => b.localeCompare(a))
}

function tituloMes(anoMes) {
  const [ano, mes] = anoMes.split('-').map(Number)
  return cap(format(new Date(ano, mes - 1, 1), 'MMMM yyyy', { locale: pt }))
}

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
  { value: 'prefere', label: 'Prefere',  cor: 'bg-status-confirmado/20 text-status-confirmado border-status-confirmado/40' },
  { value: 'neutro',  label: 'Neutro',   cor: 'bg-surface-2 text-accent-muted border-border' },
  { value: 'recusa',  label: 'Recusa',   cor: 'bg-status-cancelado/20 text-status-cancelado border-status-cancelado/40' },
]

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
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            className={clsx(
              'w-9 h-8 rounded text-xs font-semibold border transition-colors',
              value === n
                ? 'bg-white text-black border-white'
                : n <= value
                  ? 'bg-white/10 text-accent border-white/20'
                  : 'bg-surface-2 text-accent-subtle border-border hover:border-white/20 hover:text-accent-muted'
            )}
          >
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
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            className={clsx(
              'w-8 h-8 rounded text-xs font-semibold border transition-colors',
              value === n
                ? 'bg-accent text-black border-accent'
                : n <= value
                  ? 'bg-accent/20 text-accent border-accent/30'
                  : 'bg-surface-2 text-accent-subtle border-border hover:border-white/20 hover:text-accent-muted'
            )}
          >
            {n}
          </button>
        ))}
      </div>
      <p className="text-[11px] text-accent-subtle mt-1">1 = baixa prioridade · 10 = alta prioridade · padrão 5</p>
    </div>
  )
}

const vazio = {
  nome: '', nome_artistico: '', whatsapp: '', email: '',
  presskit_url: '', instagram_url: '',
  valor_sessao: '', estado: 'activo', notas: '',
  qualidade_artistica: 0, assiduidade: 0, profissionalismo: 0, adaptacao_espaco: 0,
  prioridade_admin: 5, excluido_admin: false,
}

export function FormDJ({ aberto, dj, onFechar, onGuardado }) {
  const [form, setForm] = useState(vazio)
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState(null)
  const [prefsEspaco, setPrefsEspaco] = useState({})
  const [disps, setDisps] = useState([])
  const [apagarDisp, setApagarDisp] = useState(null)
  const { pushUndo } = useUndo()
  const [addMes, setAddMes] = useState('')
  const [addDisponivel, setAddDisponivel] = useState(true)
  const [addDiasInput, setAddDiasInput] = useState('')
  const [addNotas, setAddNotas] = useState('')
  const [addCarrinho, setAddCarrinho] = useState([])
  const [addGuardando, setAddGuardando] = useState(false)
  const [addErro, setAddErro] = useState(null)
  const [categorias, setCategorias] = useState([])
  const [catsSel, setCatsSel] = useState(['', '', ''])  // 3 slots de categoria
  const { espacos } = useEspacos()
  const editar = !!dj

  const MESES_ADD = useMemo(() => {
    const hoje = startOfMonth(new Date())
    return Array.from({ length: 14 }, (_, i) => {
      const d = addMonths(hoje, i - 1)
      return { value: format(d, 'yyyy-MM'), label: cap(format(d, 'MMMM yyyy', { locale: pt })) }
    })
  }, [])

  useEffect(() => {
    categoriasDjApi.listar().then(setCategorias).catch(() => {})
  }, [])

  const carregarDisps = useCallback(() => {
    if (!dj?.id) return
    disponibilidadesApi.listarPorDJ(dj.id)
      .then(setDisps)
      .catch(() => setDisps([]))
  }, [dj?.id])

  useEffect(() => {
    if (aberto) {
      setForm(dj ? {
        ...vazio, ...dj,
        valor_sessao: dj.valor_sessao ?? '',
        qualidade_artistica: dj.qualidade_artistica ?? 0,
        assiduidade: dj.assiduidade ?? 0,
        profissionalismo: dj.profissionalismo ?? 0,
        adaptacao_espaco: dj.adaptacao_espaco ?? 0,
        prioridade_admin: dj.prioridade_admin ?? 5,
        excluido_admin: dj.excluido_admin ?? false,
        categoria_id: dj.categoria_id ?? '',
      } : vazio)
      setErro(null)
      setPrefsEspaco({})
      setDisps([])
      setCatsSel(['', '', ''])
      setAddMes(format(new Date(), 'yyyy-MM'))
      setAddDisponivel(true)
      setAddDiasInput('')
      setAddNotas('')
      setAddCarrinho([])
      setAddErro(null)
      if (dj?.id) {
        djPreferenciasEspacoApi.listar(dj.id)
          .then((rows) => {
            const map = {}
            rows.forEach((r) => { map[r.espaco_id] = r.preferencia })
            setPrefsEspaco(map)
          })
          .catch(() => {})
        djCategoriasApi.listar(dj.id)
          .then((ids) => {
            const slots = ['', '', '']
            ids.forEach((id, i) => { if (i < 3) slots[i] = String(id) })
            setCatsSel(slots)
          })
          .catch(() => {})
        carregarDisps()
      }
    }
  }, [aberto, dj, carregarDisps])

  const removerDisp = async (iso) => {
    setApagarDisp(iso)
    try {
      const backup = disps.find(d => d.data === iso)
      await disponibilidadesApi.apagar(dj.id, iso)
      setDisps((prev) => prev.filter((d) => d.data !== iso))
      pushUndo({
        label: `Data ${iso} removida`,
        undo: async () => {
          await disponibilidadesApi.registar(dj.id, iso, backup?.disponivel ?? true, backup?.notas ?? '')
          carregarDisps()
        },
      })
    } catch { /* silencioso */ }
    finally { setApagarDisp(null) }
  }

  const adicionarAoCarrinho = () => {
    setAddErro(null)
    if (!addMes) return setAddErro('Seleciona um mês')
    if (!addDiasInput.trim()) return setAddErro('Indica os dias')
    const [ano, mes] = addMes.split('-').map(Number)
    const maxDias = getDaysInMonth(new Date(ano, mes - 1, 1))
    const dias = []
    for (const parte of addDiasInput.split(/[,\s]+/).filter(Boolean)) {
      if (parte.includes('-')) {
        const [de, ate] = parte.split('-').map(Number)
        if (isNaN(de) || isNaN(ate) || de > ate) return setAddErro(`Intervalo inválido: ${parte}`)
        for (let d = de; d <= ate; d++) dias.push(d)
      } else {
        const n = Number(parte)
        if (isNaN(n)) return setAddErro(`Dia inválido: ${parte}`)
        dias.push(n)
      }
    }
    const invalidos = dias.filter(d => d < 1 || d > maxDias)
    if (invalidos.length) return setAddErro(`Dias inválidos para este mês: ${invalidos.join(', ')}`)
    const novas = [...new Set(dias)].sort((a, b) => a - b).map(d => ({
      data: `${addMes}-${String(d).padStart(2, '0')}`,
      disponivel: addDisponivel,
      notas: addNotas.trim() || null,
    }))
    setAddCarrinho(prev => {
      const jaExistem = new Set(prev.map(x => x.data))
      return [...prev, ...novas.filter(n => !jaExistem.has(n.data))]
    })
    setAddDiasInput('')
  }

  const guardarDatasDisp = async () => {
    if (!addCarrinho.length) return
    setAddGuardando(true)
    setAddErro(null)
    try {
      for (const item of addCarrinho) {
        await disponibilidadesApi.registar(dj.id, item.data, item.disponivel, item.notas ?? '')
      }
      setAddCarrinho([])
      setAddDiasInput('')
      setAddNotas('')
      carregarDisps()
    } catch (e) {
      setAddErro(e.message)
    } finally {
      setAddGuardando(false)
    }
  }

  const set = (campo) => (e) => setForm((f) => ({ ...f, [campo]: e.target.value }))
  const setRating = (campo) => (val) => setForm((f) => ({ ...f, [campo]: val }))
  const setPref = (espacoId, val) => setPrefsEspaco((p) => ({ ...p, [espacoId]: val }))

  const guardar = async (e) => {
    e.preventDefault()
    setErro(null)
    setLoading(true)
    try {
      const payload = {
        ...form,
        valor_sessao: form.valor_sessao === '' ? null : Number(form.valor_sessao),
        prioridade_admin: Number(form.prioridade_admin),
        excluido_admin: Boolean(form.excluido_admin),
      }
      let djId = dj?.id
      if (editar) {
        await djsApi.actualizar(dj.id, payload)
      } else {
        const novo = await djsApi.criar(payload)
        djId = novo.id
      }
      // guardar preferências de Cliente
      if (djId) {
        const prefs = Object.entries(prefsEspaco)
          .filter(([, v]) => v && v !== 'neutro')
          .map(([espaco_id, preferencia]) => ({ espaco_id, preferencia }))
        await djPreferenciasEspacoApi.guardar(djId, prefs)

        // guardar categorias (3 slots)
        const catsIds = catsSel.map(v => v === '' ? null : Number(v))
        await djCategoriasApi.guardar(djId, catsIds)
      }
      onGuardado()
      onFechar()
    } catch (e) {
      setErro(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal aberto={aberto} onFechar={onFechar} titulo={editar ? 'Editar DJ' : 'Novo DJ'} largura="max-w-xl">
      <form onSubmit={guardar}>
        <div className="px-6 py-5 flex flex-col gap-5">
          {erro && <Alerta tipo="erro" mensagem={erro} />}

          <div className="grid grid-cols-2 gap-4">
            <Input label="Nome" value={form.nome} onChange={set('nome')} placeholder="Nome completo" required />
            <Input label="Nome artístico" value={form.nome_artistico} onChange={set('nome_artistico')} placeholder="DJ Nome" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Input label="WhatsApp" value={form.whatsapp} onChange={set('whatsapp')} placeholder="+351 912 345 678" type="tel" />
            <Input label="Email" value={form.email} onChange={set('email')} placeholder="dj@exemplo.com" type="email" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Input label="Link Presskit" value={form.presskit_url ?? ''} onChange={set('presskit_url')} placeholder="https://..." type="url" />
            <Input label="Instagram" value={form.instagram_url ?? ''} onChange={set('instagram_url')} placeholder="https://instagram.com/..." type="url" />
          </div>

          {/* Categorias */}
          <div className="flex flex-col gap-2">
            <p className="text-xs font-medium text-accent-muted">Categorias</p>
            <div className="grid grid-cols-3 gap-2">
              {[0, 1, 2].map((i) => (
                <Select
                  key={i}
                  label={`Categoria ${i + 1}`}
                  value={catsSel[i]}
                  onChange={(e) => {
                    const next = [...catsSel]
                    next[i] = e.target.value
                    setCatsSel(next)
                  }}
                >
                  <option value="">—</option>
                  {categorias.map((c) => (
                    <option
                      key={c.id}
                      value={String(c.id)}
                      disabled={catsSel.some((v, j) => j !== i && v === String(c.id))}
                    >
                      {c.nome}
                    </option>
                  ))}
                </Select>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Select label="Estado" value={form.estado} onChange={set('estado')}>
              {ESTADO_OPCOES.map((e) => <option key={e.value} value={e.value}>{e.label}</option>)}
            </Select>
            <Input label="Valor por sessão (€)" value={form.valor_sessao} onChange={set('valor_sessao')} placeholder="150" type="number" min={0} step={0.01} />
          </div>

          {/* Ratings */}
          <div className="border-t border-border pt-4 flex flex-col gap-4">
            <p className="text-xs font-semibold text-accent-muted uppercase tracking-wider">Scoring</p>
            <div className="grid grid-cols-2 gap-4">
              {RATINGS.map(({ campo, label, sub }) => (
                <RatingSelector
                  key={campo}
                  label={label}
                  sub={sub}
                  value={form[campo]}
                  onChange={setRating(campo)}
                />
              ))}
            </div>
          </div>

          {/* Distribuição automática */}
          <div className="border-t border-border pt-4 flex flex-col gap-4">
            <p className="text-xs font-semibold text-accent-muted uppercase tracking-wider">Distribuição automática</p>

            <PrioridadeSelector
              value={form.prioridade_admin}
              onChange={(v) => setForm((f) => ({ ...f, prioridade_admin: v }))}
            />

            <div className="flex items-center justify-between py-2 px-3 rounded border border-border bg-surface-2/50">
              <div>
                <p className="text-xs font-medium text-accent">Excluir da distribuição automática</p>
                <p className="text-[11px] text-accent-subtle mt-0.5">O WF2 nunca atribui este DJ a nenhum Cliente</p>
              </div>
              <button
                type="button"
                onClick={() => setForm((f) => ({ ...f, excluido_admin: !f.excluido_admin }))}
                className={clsx(
                  'relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 transition-colors',
                  form.excluido_admin
                    ? 'bg-status-cancelado/70 border-status-cancelado/50'
                    : 'bg-surface-3 border-border'
                )}
              >
                <span className={clsx(
                  'inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform mt-[-1px]',
                  form.excluido_admin ? 'translate-x-4' : 'translate-x-0.5'
                )} />
              </button>
            </div>
          </div>

          <Textarea
            label="Notas / preferências para a distribuição"
            value={form.notas}
            onChange={set('notas')}
            placeholder="Ex: prefere noites de fim-de-semana, não aceita restauração, disponível só depois das 22h..."
          />

          {/* Preferências de Clientes (só ao editar) */}
          {editar && espacos.length > 0 && (
            <div className="border-t border-border pt-4 flex flex-col gap-3">
              <p className="text-xs font-semibold text-accent-muted uppercase tracking-wider">Preferências por Cliente</p>
              {espacos.map((esp) => {
                const pref = prefsEspaco[esp.id] ?? 'neutro'
                return (
                  <div key={esp.id} className="flex items-center justify-between gap-3">
                    <span className="text-xs text-accent-muted w-32 truncate">{esp.nome}</span>
                    <div className="flex gap-1">
                      {PREFS_OPCOES.map((op) => (
                        <button
                          key={op.value}
                          type="button"
                          onClick={() => setPref(esp.id, op.value)}
                          className={clsx(
                            'px-2.5 py-1 rounded border text-[11px] font-medium transition-colors',
                            pref === op.value ? op.cor : 'bg-surface-2 text-accent-subtle border-border hover:text-accent-muted'
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

          {/* Disponibilidades (só ao editar) */}
          {editar && (
            <div className="border-t border-border pt-4 flex flex-col gap-3">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-xs font-semibold text-accent-muted uppercase tracking-wider">
                  Calendário de disponibilidade
                </p>
                {disps.length > 0 && (() => {
                  const nDisp   = disps.filter(d => d.disponivel).length
                  const nIndisp = disps.filter(d => !d.disponivel).length
                  return (
                    <span className="text-[11px] font-normal text-accent-subtle normal-case">
                      {nIndisp > 0 && (
                        <span className="text-status-cancelado font-medium">{nIndisp} indisponível{nIndisp !== 1 ? 'is' : ''}</span>
                      )}
                      {nIndisp > 0 && nDisp > 0 && <span className="mx-1 text-accent-subtle/40">·</span>}
                      {nDisp > 0 && (
                        <span className="text-status-confirmado font-medium">{nDisp} disponível{nDisp !== 1 ? 'is' : ''}</span>
                      )}
                    </span>
                  )
                })()}
              </div>

              {/* Formulário inline para adicionar datas */}
              <div className="bg-surface-2/40 rounded-lg border border-border/60 p-3 flex flex-col gap-2.5">
                {/* Linha 1: mês + disponível/indisponível */}
                <div className="flex gap-2 items-end">
                  <div className="flex-1">
                    <label className="text-[11px] text-accent-muted mb-1 block">Mês</label>
                    <select
                      value={addMes}
                      onChange={e => setAddMes(e.target.value)}
                      className="w-full bg-surface-1 border border-border rounded px-2 py-1.5 text-xs text-accent focus:outline-none focus:border-white/30"
                    >
                      {MESES_ADD.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                    </select>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button type="button" onClick={() => setAddDisponivel(true)}
                      className={clsx('flex items-center gap-1 px-2.5 py-1.5 rounded border text-[11px] font-medium transition-colors',
                        addDisponivel
                          ? 'bg-status-confirmado/20 text-status-confirmado border-status-confirmado/40'
                          : 'bg-surface-2 text-accent-subtle border-border hover:text-accent-muted'
                      )}>
                      <CalendarCheck size={11} />Disp.
                    </button>
                    <button type="button" onClick={() => setAddDisponivel(false)}
                      className={clsx('flex items-center gap-1 px-2.5 py-1.5 rounded border text-[11px] font-medium transition-colors',
                        !addDisponivel
                          ? 'bg-status-cancelado/20 text-status-cancelado border-status-cancelado/40'
                          : 'bg-surface-2 text-accent-subtle border-border hover:text-accent-muted'
                      )}>
                      <CalendarX size={11} />Indisp.
                    </button>
                  </div>
                </div>

                {/* Linha 2: dias + nota + botão */}
                <div className="flex gap-2 items-end">
                  <div className="flex-1">
                    <label className="text-[11px] text-accent-muted mb-1 block">
                      Dias <span className="text-accent-subtle/70 font-normal">ex: 1,5,10-15</span>
                    </label>
                    <input
                      value={addDiasInput}
                      onChange={e => setAddDiasInput(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); adicionarAoCarrinho() } }}
                      placeholder="1, 5, 10-15, 20"
                      className="w-full bg-surface-1 border border-border rounded px-2 py-1.5 text-xs text-accent placeholder:text-accent-subtle/40 focus:outline-none focus:border-white/30"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="text-[11px] text-accent-muted mb-1 block">
                      Nota <span className="text-accent-subtle/70 font-normal">(opcional)</span>
                    </label>
                    <input
                      value={addNotas}
                      onChange={e => setAddNotas(e.target.value)}
                      placeholder="Férias, compromisso…"
                      className="w-full bg-surface-1 border border-border rounded px-2 py-1.5 text-xs text-accent placeholder:text-accent-subtle/40 focus:outline-none focus:border-white/30"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={adicionarAoCarrinho}
                    className="shrink-0 flex items-center gap-1 px-3 py-1.5 rounded border bg-white/8 border-white/15 text-accent text-[11px] font-medium hover:bg-white/12 transition-colors"
                  >
                    <Plus size={12} />Adicionar
                  </button>
                </div>

                {addErro && <p className="text-[11px] text-status-cancelado">{addErro}</p>}

                {/* Carrinho */}
                {addCarrinho.length > 0 && (
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <p className="text-[11px] text-accent-subtle">
                        {addCarrinho.length} data{addCarrinho.length !== 1 ? 's' : ''} para guardar
                      </p>
                      <button
                        type="button"
                        onClick={guardarDatasDisp}
                        disabled={addGuardando}
                        className="px-3 py-1 rounded bg-accent text-black text-[11px] font-semibold hover:bg-accent/80 transition-colors disabled:opacity-50"
                      >
                        {addGuardando ? 'A guardar…' : 'Guardar datas'}
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {addCarrinho.map(item => (
                        <span key={item.data} className={clsx(
                          'inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] border',
                          item.disponivel
                            ? 'bg-status-confirmado/15 text-status-confirmado border-status-confirmado/30'
                            : 'bg-status-cancelado/15 text-status-cancelado border-status-cancelado/30'
                        )}>
                          {formatarDataCurta(item.data)}
                          <button
                            type="button"
                            onClick={() => setAddCarrinho(prev => prev.filter(x => x.data !== item.data))}
                            className="opacity-60 hover:opacity-100 leading-none"
                          >×</button>
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {disps.length === 0 ? (
                <p className="text-xs text-accent-subtle italic">Sem datas registadas.</p>
              ) : (
                <div className="flex flex-col gap-3">
                  {agruparPorMes(disps).map(([anoMes, grupo]) => (
                    <div key={anoMes}>
                      <p className="text-[11px] font-semibold text-accent-subtle uppercase tracking-wider mb-1.5">
                        {tituloMes(anoMes)}
                      </p>
                      <div className="border border-border rounded-lg overflow-hidden divide-y divide-border/30">
                        {grupo.map((d) => (
                          <div key={d.data} className="flex items-center gap-2 px-3 py-1.5">
                            <span className="text-xs text-accent flex-1 tabular-nums">
                              {formatarDataCurta(d.data)}
                            </span>
                            <span className={clsx(
                              'px-2 py-0.5 rounded text-[11px] font-medium border shrink-0',
                              d.disponivel
                                ? 'bg-status-confirmado/15 text-status-confirmado border-status-confirmado/30'
                                : 'bg-status-cancelado/15 text-status-cancelado border-status-cancelado/30'
                            )}>
                              {d.disponivel ? '✓ Disp.' : '✗ Indisp.'}
                            </span>
                            {d.notas && (
                              <span className="text-[11px] text-accent-subtle truncate max-w-[100px]" title={d.notas}>
                                {d.notas}
                              </span>
                            )}
                            <button
                              type="button"
                              onClick={() => removerDisp(d.data)}
                              disabled={apagarDisp === d.data}
                              className="text-accent-subtle hover:text-status-cancelado transition-colors disabled:opacity-40"
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-border flex justify-end gap-2">
          <Button type="button" variante="ghost" tamanho="sm" onClick={onFechar}>Cancelar</Button>
          <Button type="submit" variante="primary" tamanho="sm" loading={loading}>
            {editar ? 'Guardar alterações' : 'Criar DJ'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
