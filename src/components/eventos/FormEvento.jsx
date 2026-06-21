import { useState, useEffect } from 'react'
import { X, Database, Star, Plus, Check, Trash2 } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Alerta } from '@/components/ui/Alerta'
import { supabase } from '@/lib/supabase'
import { supaEventosApi } from '@/lib/supaEventosApi'
import { artistasApi } from '@/lib/api'
import { useUndo } from '@/contexts/UndoContext'
import { clsx } from 'clsx'

const STATUS_OPTS = [
  { value: 'proposta',         label: 'Proposta' },
  { value: 'aceitação',        label: 'Aceitação' },
  { value: 'validação',        label: 'Validação' },
  { value: 'pré-confirmado',   label: 'Pré-confirmado' },
  { value: 'confirmado',       label: 'Confirmado' },
  { value: 'trocado',          label: 'Trocado' },
  { value: 'preview_man',      label: 'Preview Manager' },
  { value: 'cancelado',        label: 'Cancelado' },
  { value: 'a_pedido',         label: 'A pedido' },
]

const VAZIO = {
  evento: '',
  tipo: '',
  espaco_id: '',
  responsavel: '',
  morada: '',
  contacto_pelo_evento: '',
  status: 'proposta',
  xclusive: false,
  artista_id: '',
  data_evento: '',
  hora_inicio: '',
  hora_fim: '',
  dia_instalacao: '',
  hora_instalacao: '',
  notas_operacionais: '',
  notas_faturacao: '',
  Equipamentos: '',
  valor: '',
  valor_artistico: '',
  valor_apoio_tecnico: '',
  margem: '',
  transporte: '',
  extras_contas: '',
  estado_pagamento: '',
  forma_pagamento: '',
  notas_contas: '',
  tecnico_id: '',
}

const ESTADO_PAG_OPCOES = [
  { value: 'pendente', label: 'Pendente' },
  { value: 'parcial',  label: 'Parcial' },
  { value: 'pago',     label: 'Pago' },
]
const FORMA_PAG_OPCOES = [
  { value: 'transferencia', label: 'Transferência' },
  { value: 'dinheiro',      label: 'Dinheiro' },
]

const uidF = () => Math.random().toString(36).slice(2)
const emptyItem = () => ({ _key: uidF(), descricao: '', unidades: 1, valor_unitario: '' })

const BILLING_CAMPOS = [
  { key: 'equipamentos_alugado',  tipo: 'equipamento_alugado',  label: 'Equipamentos Alugados' },
  { key: 'equipamentos_comprado', tipo: 'equipamento_comprado', label: 'Equipamentos Comprados' },
  { key: 'extras',                tipo: 'extra',                label: 'Extras' },
]

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

const inputCls = 'w-full bg-surface-2 border border-border rounded px-3 py-2 text-xs text-accent placeholder:text-accent-subtle/40 focus:outline-none focus:border-white/30 focus:bg-surface-3 transition-colors'
const textareaCls = `${inputCls} resize-none`

// ── Picker de artista: selecionar da lista ou criar novo ─────────────────────
function ArtistaPicker({ artistas, value, onChange, onNovoArtista }) {
  const [modo, setModo]     = useState('lista') // 'lista' | 'novo'
  const [nome, setNome]     = useState('')
  const [tipo, setTipo]     = useState('')
  const [salvando, setSalv] = useState(false)
  const [erro, setErro]     = useState(null)

  const criarArtista = async () => {
    if (!nome.trim()) { setErro('Nome obrigatório.'); return }
    setSalv(true); setErro(null)
    try {
      const novo = await artistasApi.criar({ nome: nome.trim(), tipo: tipo || null })
      onNovoArtista(novo)
      setModo('lista'); setNome(''); setTipo('')
    } catch (e) { setErro(e.message) }
    finally { setSalv(false) }
  }

  const cancelar = () => { setModo('lista'); setNome(''); setTipo(''); setErro(null) }

  return (
    <Field label="Artista">
      {modo === 'lista' ? (
        <div className="flex gap-2">
          <select
            className={inputCls}
            value={value}
            onChange={(e) => onChange(e.target.value)}
          >
            <option value="">— Seleccionar artista —</option>
            {artistas.map(a => (
              <option key={a.id} value={a.id}>{a.nome}{a.tipo ? ` · ${a.tipo}` : ''}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setModo('novo')}
            title="Novo artista"
            className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded border border-border bg-surface-2 text-xs text-accent-muted hover:text-accent hover:border-white/25 transition-colors whitespace-nowrap"
          >
            <Plus size={12} />Novo
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-2 p-3 bg-surface-2/60 rounded-lg border border-white/15">
          <p className="text-[10px] font-bold text-accent-subtle uppercase tracking-wider">Adicionar artista</p>
          {erro && <p className="text-[11px] text-status-cancelado">{erro}</p>}
          <div className="grid grid-cols-2 gap-2">
            <input
              autoFocus
              className={inputCls}
              value={nome}
              onChange={e => setNome(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && criarArtista()}
              placeholder="Nome do artista *"
            />
            <input
              className={inputCls}
              value={tipo}
              onChange={e => setTipo(e.target.value)}
              placeholder="Tipo (Músico, Banda…)"
            />
          </div>
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={cancelar}
              className="px-3 py-1.5 rounded border border-border text-xs text-accent-muted hover:text-accent transition-colors">
              Cancelar
            </button>
            <button type="button" onClick={criarArtista} disabled={salvando}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-status-confirmado/40 bg-status-confirmado/10 text-status-confirmado text-xs font-semibold hover:bg-status-confirmado/20 transition-colors disabled:opacity-40">
              <Check size={12} />{salvando ? 'A criar…' : 'Criar artista'}
            </button>
          </div>
        </div>
      )}
    </Field>
  )
}

export function FormEvento({ aberto, evento, dataInicial = '', onFechar, onGuardado }) {
  const [form, setForm]       = useState(VAZIO)
  const [loading, setLoading] = useState(false)
  const [erro, setErro]       = useState(null)
  const { pushUndo } = useUndo()
  const [abaActiva, setAba]   = useState('geral')
  const [tipos, setTipos]       = useState([])
  const [espacos, setEspacos]   = useState([])
  const [tecnicos, setTecnicos] = useState([])
  const [artistas, setArtistas] = useState([])
  // Estado billing (itens de faturação ligados ao evento)
  const [billing, setBilling] = useState({
    equipamentos_alugado: [],
    equipamentos_comprado: [],
    extras: [],
  })

  useEffect(() => {
    supabase.from('tipo_eventos').select('id, nome, tem_artista').order('nome')
      .then(({ data }) => setTipos(data ?? []))
      .catch(console.error)
    supaEventosApi.listarEspacos().then(setEspacos).catch(console.error)
    supabase.from('tecnicos').select('id, nome').eq('ativo', true).order('nome')
      .then(({ data }) => setTecnicos(data ?? []))
      .catch(console.error)
    artistasApi.listar().then(setArtistas).catch(console.error)
  }, [])

  useEffect(() => {
    if (!aberto) return
    setErro(null)
    setAba('geral')
    setBilling({ equipamentos_alugado: [], equipamentos_comprado: [], extras: [] })
    if (evento?.id) {
      setForm({
        ...VAZIO,
        ...evento,
        valor:               evento.valor               != null ? String(evento.valor)               : '',
        valor_artistico:     evento.valor_artistico     != null ? String(evento.valor_artistico)     : '',
        valor_apoio_tecnico: evento.valor_apoio_tecnico != null ? String(evento.valor_apoio_tecnico) : '',
        margem:          evento.margem          != null ? String(evento.margem)          : '',
        transporte:      evento.transporte      != null ? String(evento.transporte)      : '',
        extras_contas:   evento.extras_contas   != null ? String(evento.extras_contas)   : '',
        estado_pagamento: evento.estado_pagamento ?? '',
        forma_pagamento:  evento.forma_pagamento  ?? '',
        notas_contas:     evento.notas_contas     ?? '',
        notas_faturacao:  evento.notas_faturacao  ?? '',
        xclusive:    evento.xclusive    ?? false,
        artista_id:  evento.artista_id  ?? '',
        tecnico_id:      evento.tecnico_id ?? '',
        hora_inicio:     evento.hora_inicio?.slice(0, 5)     ?? '',
        hora_fim:        evento.hora_fim?.slice(0, 5)        ?? '',
        hora_instalacao: evento.hora_instalacao?.slice(0, 5) ?? '',
      })
      // Carregar itens de billing existentes para este evento
      supabase.from('contas_clientes').select('*').eq('evento_id', evento.id)
        .then(({ data }) => {
          if (!data) return
          const toItem = r => ({ _key: uidF(), id: r.id, descricao: r.descricao ?? '', unidades: r.unidades ?? 1, valor_unitario: r.valor_unitario != null ? String(r.valor_unitario) : '' })
          setBilling({
            equipamentos_alugado:  data.filter(r => r.tipo === 'equipamento_alugado').map(toItem),
            equipamentos_comprado: data.filter(r => r.tipo === 'equipamento_comprado').map(toItem),
            extras:                data.filter(r => r.tipo === 'extra').map(toItem),
          })
        })
    } else {
      setForm({
        ...VAZIO,
        data_evento: dataInicial || evento?.data_evento || '',
        espaco_id:   evento?.espaco_id || '',
        tipo:        evento?.tipo      || '',
      })
    }
  }, [aberto, evento, dataInicial])

  const set = (campo, valor) => setForm((f) => ({ ...f, [campo]: valor }))

  const guardar = async () => {
    if (!form.evento.trim()) { setErro('Nome do evento obrigatório.'); return }
    if (!form.data_evento)   { setErro('Data obrigatória.'); return }
    if (!form.espaco_id)     { setErro('Cliente/Espaço obrigatório.'); return }

    setLoading(true)
    setErro(null)
    try {
      const dados = {
        ...form,
        valor:               form.valor               !== '' ? Number(form.valor)               : null,
        valor_artistico:     form.valor_artistico     !== '' ? Number(form.valor_artistico)     : null,
        valor_apoio_tecnico: form.valor_apoio_tecnico !== '' ? Number(form.valor_apoio_tecnico) : null,
        margem:        form.margem        !== '' ? Number(form.margem)        : null,
        transporte:    form.transporte    !== '' ? Number(form.transporte)    : null,
        extras_contas: form.extras_contas !== '' ? Number(form.extras_contas) : null,
        estado_pagamento: form.estado_pagamento || null,
        forma_pagamento:  form.forma_pagamento  || null,
        notas_contas:     form.notas_contas?.trim() || null,
        notas_faturacao:  form.notas_faturacao?.trim() || null,
        espaco_id:       form.espaco_id       || null,
        artista_id:      form.artista_id      || null,
        tecnico_id:      form.tecnico_id      || null,
        hora_inicio:     form.hora_inicio     || null,
        hora_fim:        form.hora_fim        || null,
        hora_instalacao: form.hora_instalacao || null,
        dia_instalacao:  form.dia_instalacao  || null,
      }
      let savedId = evento?.id
      if (evento?.id) {
        await supaEventosApi.actualizar(evento.id, dados)
      } else {
        const criado = await supaEventosApi.criar(dados)
        savedId = criado?.id ?? criado?.[0]?.id
      }

      // Guardar itens de billing (apagar os existentes e reinserir)
      if (savedId && form.espaco_id && form.data_evento) {
        await supabase.from('contas_clientes').delete().eq('evento_id', savedId)
        const mes = form.data_evento.slice(0, 7)
        const inserts = []
        BILLING_CAMPOS.forEach(({ key, tipo }) => {
          billing[key].forEach(r => {
            const val = (Number(r.unidades) || 1) * (parseFloat(String(r.valor_unitario).replace(',', '.')) || 0)
            if (val > 0 || r.descricao?.trim()) {
              inserts.push({
                espaco_id: form.espaco_id,
                mes,
                tipo,
                evento_id: savedId,
                descricao: r.descricao || null,
                unidades: Number(r.unidades) || 1,
                valor_unitario: parseFloat(String(r.valor_unitario).replace(',', '.')) || 0,
                valor: val,
              })
            }
          })
        })
        if (inserts.length > 0) await supabase.from('contas_clientes').insert(inserts)
      }

      onGuardado?.()
      onFechar()
    } catch (e) {
      setErro(e.message)
    } finally {
      setLoading(false)
    }
  }

  const apagar = async () => {
    if (!evento?.id) return
    if (!window.confirm('Apagar este evento?')) return
    setLoading(true)
    try {
      const backup = { ...evento }
      await supaEventosApi.apagar(evento.id)
      pushUndo({
        label: `Evento "${evento.evento || evento.id}" apagado`,
        undo: async () => { await supaEventosApi.criar(backup); onGuardado?.() },
      })
      onGuardado?.()
      onFechar()
    } catch (e) {
      setErro(e.message)
    } finally {
      setLoading(false)
    }
  }

  const titulo = evento?.id ? 'Editar Evento' : 'Novo Evento'

  return (
    <Modal aberto={aberto} onFechar={onFechar} largura="max-w-2xl">
      <div className="flex flex-col">

        {/* Cabeçalho */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-semibold text-accent">{titulo}</h2>
            <div className="flex items-center gap-1 px-2 py-0.5 rounded bg-violet-500/10 border border-violet-500/25">
              <Database size={9} className="text-violet-400 shrink-0" />
              <span className="text-[10px] font-mono text-violet-400 tracking-tight">supa_eventos</span>
            </div>
          </div>
          <button onClick={onFechar} className="text-accent-subtle hover:text-accent transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Abas */}
        <div className="flex border-b border-border px-6">
          {[
            { id: 'geral',      label: 'Geral' },
            { id: 'tecnico',    label: 'Técnico & Notas' },
            { id: 'faturacao',  label: 'Faturação' },
            { id: 'contas',     label: 'Contas' },
          ].map((aba) => (
            <button
              key={aba.id}
              onClick={() => setAba(aba.id)}
              className={clsx(
                'px-4 py-2.5 text-xs font-medium border-b-2 transition-colors -mb-px',
                abaActiva === aba.id
                  ? 'border-status-confirmado text-status-confirmado'
                  : 'border-transparent text-accent-muted hover:text-accent'
              )}
            >
              {aba.label}
            </button>
          ))}
        </div>

        <div className="px-6 py-5 flex flex-col gap-4 overflow-y-auto max-h-[65vh]">
          {erro && <Alerta tipo="erro" mensagem={erro} />}

          {/* ── Aba Geral ── */}
          {abaActiva === 'geral' && (
            <>
              {/* Nome + Tipo */}
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <Field label="Nome do evento" required>
                    <input
                      className={inputCls}
                      value={form.evento}
                      onChange={(e) => set('evento', e.target.value)}
                      placeholder="Ex: Noite de Fado, DJ Set Especial…"
                      autoFocus
                    />
                  </Field>
                </div>
                <Field label="Tipo">
                  <select
                    className={inputCls}
                    value={form.tipo}
                    onChange={(e) => set('tipo', e.target.value)}
                  >
                    <option value="">— Seleccionar —</option>
                    {tipos.map((t) => (
                      <option key={t.id} value={t.nome}>{t.nome}</option>
                    ))}
                  </select>
                </Field>
              </div>

              {/* Cliente */}
              <Field label="Cliente">
                <select
                  className={inputCls}
                  value={form.espaco_id}
                  onChange={(e) => set('espaco_id', e.target.value)}
                >
                  <option value="">— Seleccionar —</option>
                  {espacos.map((e) => (
                    <option key={e.id} value={e.id}>{e.nome}</option>
                  ))}
                </select>
              </Field>

              {/* Status + Xclusive */}
              <div className="grid grid-cols-2 gap-3 items-end">
                <Field label="Status">
                  <select
                    className={inputCls}
                    value={form.status}
                    onChange={(e) => set('status', e.target.value)}
                  >
                    {STATUS_OPTS.map((s) => (
                      <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                  </select>
                </Field>
                <div className="pb-1">
                  <button
                    type="button"
                    onClick={() => set('xclusive', !form.xclusive)}
                    className={clsx(
                      'w-full flex items-center justify-center gap-2 px-3 py-2 rounded border text-xs font-semibold transition-colors',
                      form.xclusive
                        ? 'bg-violet-500/15 border-violet-500/40 text-violet-300'
                        : 'bg-surface-2 border-border text-accent-muted hover:text-accent hover:border-white/20'
                    )}
                  >
                    <Star size={12} className={form.xclusive ? 'fill-violet-400 text-violet-400' : ''} />
                    Xclusive
                  </button>
                </div>
              </div>

              {/* Artista — só aparece quando Xclusive está activo */}
              {form.xclusive && (
                <ArtistaPicker
                  artistas={artistas}
                  value={form.artista_id}
                  onChange={(id) => set('artista_id', id)}
                  onNovoArtista={(novoArtista) => {
                    setArtistas(prev => [...prev, novoArtista].sort((a, b) => a.nome.localeCompare(b.nome)))
                    set('artista_id', novoArtista.id)
                  }}
                />
              )}

              {/* Valor artístico — só para tipos com artista */}
              {(() => {
                const tipoSel    = tipos.find(t => t.nome === form.tipo)
                const temArtista = tipoSel?.tem_artista ?? false
                const labelArt   = form.tipo ? `Valor ${form.tipo} (€)` : 'Valor Artístico (€)'
                return temArtista ? (
                  <div className="grid grid-cols-1 max-w-xs gap-3 p-3 bg-surface-2/60 rounded-lg border border-border/50">
                    <Field label={labelArt}>
                      <input
                        type="number" min="0" step="0.01"
                        className={inputCls}
                        value={form.valor_artistico}
                        onChange={(e) => set('valor_artistico', e.target.value)}
                        placeholder="0,00"
                      />
                    </Field>
                  </div>
                ) : null
              })()}

              {/* Técnico Responsável + Contacto */}
              <div className="grid grid-cols-2 gap-3">
                <Field label="Técnico Responsável">
                  <select
                    className={inputCls}
                    value={form.tecnico_id}
                    onChange={(e) => set('tecnico_id', e.target.value)}
                  >
                    <option value="">— Não atribuído —</option>
                    {tecnicos.map(t => (
                      <option key={t.id} value={t.id}>{t.nome}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Contacto pelo evento">
                  <input
                    className={inputCls}
                    value={form.contacto_pelo_evento}
                    onChange={(e) => set('contacto_pelo_evento', e.target.value)}
                    placeholder="Telefone / email…"
                  />
                </Field>
              </div>

              {/* Morada */}
              <Field label="Morada">
                <input
                  className={inputCls}
                  value={form.morada}
                  onChange={(e) => set('morada', e.target.value)}
                  placeholder="Local do evento…"
                />
              </Field>

              {/* Data + Horário */}
              <div className="grid grid-cols-3 gap-3">
                <Field label="Data do evento" required>
                  <input
                    type="date"
                    className={inputCls}
                    value={form.data_evento}
                    onChange={(e) => set('data_evento', e.target.value)}
                  />
                </Field>
                <Field label="Hora início">
                  <input
                    type="time"
                    className={inputCls}
                    value={form.hora_inicio}
                    onChange={(e) => set('hora_inicio', e.target.value)}
                  />
                </Field>
                <Field label="Hora fim">
                  <input
                    type="time"
                    className={inputCls}
                    value={form.hora_fim}
                    onChange={(e) => set('hora_fim', e.target.value)}
                  />
                </Field>
              </div>

              {/* Instalação */}
              <div className="grid grid-cols-2 gap-3">
                <Field label="Dia de instalação">
                  <input
                    type="date"
                    className={inputCls}
                    value={form.dia_instalacao}
                    onChange={(e) => set('dia_instalacao', e.target.value)}
                  />
                </Field>
                <Field label="Hora de instalação">
                  <input
                    type="time"
                    className={inputCls}
                    value={form.hora_instalacao}
                    onChange={(e) => set('hora_instalacao', e.target.value)}
                  />
                </Field>
              </div>
            </>
          )}

          {/* ── Aba Técnico & Notas ── */}
          {abaActiva === 'tecnico' && (
            <>
              <Field label="Equipamentos">
                <textarea
                  className={textareaCls}
                  rows={4}
                  value={form.Equipamentos}
                  onChange={(e) => set('Equipamentos', e.target.value)}
                  placeholder="Lista de equipamentos necessários…"
                />
              </Field>

              <Field label="Notas operacionais">
                <textarea
                  className={textareaCls}
                  rows={4}
                  value={form.notas_operacionais}
                  onChange={(e) => set('notas_operacionais', e.target.value)}
                  placeholder="Informações operacionais do evento…"
                />
              </Field>
            </>
          )}

          {/* ── Aba Faturação ── */}
          {abaActiva === 'faturacao' && (
            <>
              <Field label="Notas de faturação">
                <textarea
                  className={textareaCls}
                  rows={3}
                  value={form.notas_faturacao}
                  onChange={(e) => set('notas_faturacao', e.target.value)}
                  placeholder="Notas que aparecem na fatura / documento de contas…"
                />
              </Field>

              {BILLING_CAMPOS.map(({ key, label }) => {
                const items = billing[key]
                const addItem = () => setBilling(b => ({ ...b, [key]: [...b[key], emptyItem()] }))
                const updItem = (k, field, val) => setBilling(b => ({
                  ...b,
                  [key]: b[key].map(it => it._key === k ? { ...it, [field]: val } : it),
                }))
                const remItem = (k) => setBilling(b => ({ ...b, [key]: b[key].filter(it => it._key !== k) }))
                return (
                  <div key={key} className="flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <label className="text-[11px] font-medium text-accent-subtle uppercase tracking-wider">{label}</label>
                      <button type="button" onClick={addItem}
                        className="flex items-center gap-1 text-[11px] text-accent-subtle/50 hover:text-status-confirmado/70 transition-colors">
                        <Plus size={11} />Adicionar
                      </button>
                    </div>
                    {items.length === 0 && (
                      <p className="text-[11px] text-accent-subtle/25 italic pl-1">Sem itens</p>
                    )}
                    {items.map(it => (
                      <div key={it._key} className="grid grid-cols-[1fr_52px_76px_24px] gap-1.5 items-center">
                        <input type="text" value={it.descricao}
                          onChange={e => updItem(it._key, 'descricao', e.target.value)}
                          placeholder="Descrição…"
                          className={inputCls} />
                        <input type="number" min="0" step="1" value={it.unidades}
                          onChange={e => updItem(it._key, 'unidades', e.target.value)}
                          className={inputCls + ' text-center px-1'} />
                        <input type="number" min="0" step="0.01" value={it.valor_unitario}
                          onChange={e => updItem(it._key, 'valor_unitario', e.target.value)}
                          placeholder="€/un"
                          className={inputCls + ' text-right px-2'} />
                        <button type="button" onClick={() => remItem(it._key)}
                          className="flex items-center justify-center text-border/30 hover:text-red-400/60 transition-colors">
                          <Trash2 size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                )
              })}
            </>
          )}

          {/* ── Aba Contas ── */}
          {abaActiva === 'contas' && (() => {
            const vApoio  = form.valor_apoio_tecnico === '' ? 0 : Number(form.valor_apoio_tecnico) || 0
            const vMargem = form.margem       === '' ? 0 : Number(form.margem)       || 0
            const vTransp = form.transporte   === '' ? 0 : Number(form.transporte)   || 0
            const vExtras = form.extras_contas === '' ? 0 : Number(form.extras_contas) || 0
            const totalCli = vApoio + vMargem + vTransp + vExtras
            const fmt = (v) => new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(v)
            return (
              <div className="flex flex-col gap-5">
                <div className="flex flex-col gap-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-accent-subtle">Valores</p>
                  <div className="grid grid-cols-4 gap-3">
                    <Field label="Apoio Técnico (€)">
                      <input type="number" min="0" step="0.01" className={inputCls}
                        value={form.valor_apoio_tecnico}
                        onChange={(e) => set('valor_apoio_tecnico', e.target.value)}
                        placeholder="0" />
                    </Field>
                    <Field label="Margem (€)">
                      <input type="number" min="0" step="0.01" className={inputCls}
                        value={form.margem}
                        onChange={(e) => set('margem', e.target.value)}
                        placeholder="0" />
                    </Field>
                    <Field label="Transporte (€)">
                      <input type="number" min="0" step="0.01" className={inputCls}
                        value={form.transporte}
                        onChange={(e) => set('transporte', e.target.value)}
                        placeholder="0" />
                    </Field>
                    <Field label="Extras (€)">
                      <input type="number" min="0" step="0.01" className={inputCls}
                        value={form.extras_contas}
                        onChange={(e) => set('extras_contas', e.target.value)}
                        placeholder="0" />
                    </Field>
                  </div>
                </div>

                <div className="p-3 bg-surface-3/40 border border-border/60 rounded-lg flex flex-col gap-1.5">
                  {[
                    { label: 'Apoio Técnico', v: vApoio },
                    { label: 'Margem',        v: vMargem },
                    { label: 'Transporte',    v: vTransp },
                    { label: 'Extras',        v: vExtras },
                  ].filter(r => r.v > 0).map(({ label, v }) => (
                    <div key={label} className="flex justify-between text-xs text-accent-muted">
                      <span>{label}</span><span className="tabular-nums">{fmt(v)}</span>
                    </div>
                  ))}
                  <div className="flex justify-between text-xs font-semibold text-accent border-t border-border/40 pt-1.5 mt-0.5">
                    <span>Total cliente</span>
                    <span className="tabular-nums">{fmt(totalCli)}</span>
                  </div>
                </div>

                <div className="flex flex-col gap-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-accent-subtle">Pagamento</p>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Estado">
                      <select className={inputCls} value={form.estado_pagamento}
                        onChange={(e) => set('estado_pagamento', e.target.value)}>
                        {ESTADO_PAG_OPCOES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    </Field>
                    <Field label="Forma">
                      <select className={inputCls} value={form.forma_pagamento}
                        onChange={(e) => set('forma_pagamento', e.target.value)}>
                        <option value="">—</option>
                        {FORMA_PAG_OPCOES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    </Field>
                  </div>
                </div>

                <Field label="Notas de contas">
                  <textarea className={textareaCls} rows={3}
                    value={form.notas_contas}
                    onChange={(e) => set('notas_contas', e.target.value)}
                    placeholder="Notas internas sobre pagamento, acordos, condições…" />
                </Field>
              </div>
            )
          })()}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border flex items-center justify-between gap-3">
          <div>
            {evento?.id && (
              <button
                onClick={apagar}
                disabled={loading}
                className="text-xs text-status-cancelado hover:text-status-cancelado/80 transition-colors disabled:opacity-40"
              >
                Apagar evento
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variante="secundario" onClick={onFechar} disabled={loading}>
              Cancelar
            </Button>
            <Button onClick={guardar} disabled={loading}>
              {loading ? 'A guardar…' : evento?.id ? 'Guardar alterações' : 'Criar evento'}
            </Button>
          </div>
        </div>

      </div>
    </Modal>
  )
}
