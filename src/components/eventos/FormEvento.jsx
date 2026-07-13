import { useState, useEffect } from 'react'
import { X, Database, Star, Plus, Check, Trash2, ListChecks, Send } from 'lucide-react'
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
  tecnico_id:        '',
  tecnico2_id:       '',
  todos_tecnicos:    false,
  rider_url:         '',
  data_preparacao:   '',
  hora_preparacao:   '',
  notas_preparacao:  '',
  fase:              '',
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

function Field({ label, children, required, action }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between min-h-[14px]">
        <label className="text-[11px] font-medium text-accent-subtle uppercase tracking-wider">
          {label}{required && <span className="text-status-cancelado ml-0.5">*</span>}
        </label>
        {action}
      </div>
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
  const [eventoChecklists, setEventoChecklists] = useState([]) // [{ _key, ecId, clId, nome, tipo_evento_id, itens, removed, _deletedItemIds }]
  const [allChecklists,    setAllChecklists]    = useState([]) // templates disponíveis
  // Estado billing (itens de faturação ligados ao evento)
  const [billing, setBilling] = useState({
    equipamentos_alugado: [],
    equipamentos_comprado: [],
    extras: [],
  })
  // Equipamentos do evento (evento_equipamentos)
  const [equipRows, setEquipRows] = useState({ proprio: [], alugado: [], comprado: [], extra: [] })
  const [equipamentosList, setEquipamentosList] = useState([])
  const [carros, setCarros] = useState([])
  const [eventoCarros, setEventoCarros] = useState({ carro_id: '', condutor_id: '', km_saida: '', km_chegada: '' })
  const [checksByItem, setChecksByItem] = useState({})
  const [checkSubs, setCheckSubs] = useState({})
  const [tecnicosNotas, setTecnicosNotas] = useState([])
  const [feedbackTecnico, setFeedbackTecnico] = useState([])

  useEffect(() => {
    supabase.from('tipo_eventos').select('id, nome, tem_artista').order('nome')
      .then(({ data }) => setTipos(data ?? []))
      .catch(console.error)
    supaEventosApi.listarEspacos().then(setEspacos).catch(console.error)
    supabase.from('tecnicos').select('id, nome, telefone').eq('ativo', true).order('nome')
      .then(({ data }) => setTecnicos(data ?? []))
      .catch(console.error)
    artistasApi.listar().then(setArtistas).catch(console.error)
    supabase.from('equipamentos').select('id, nome, valor_custo').eq('ativo', true).order('nome')
      .then(({ data }) => setEquipamentosList(data ?? [])).catch(console.error)
    supabase.from('carros').select('id, marca, modelo, matricula').eq('ativo', true).order('marca')
      .then(({ data }) => setCarros(data ?? [])).catch(console.error)
    supabase.from('checklists')
      .select('id, nome, tipo_evento_id, checklist_itens(id, texto, ordem)')
      .order('nome')
      .then(({ data }) => setAllChecklists(data ?? []))
      .catch(console.error)
  }, [])

  useEffect(() => {
    if (!aberto) return
    setErro(null)
    setAba('geral')
    setBilling({ equipamentos_alugado: [], equipamentos_comprado: [], extras: [] })
    setEquipRows({ proprio: [], alugado: [], comprado: [], extra: [] })
    setEventoCarros({ carro_id: '', condutor_id: '', km_saida: '', km_chegada: '' })
    setChecksByItem({})
    setCheckSubs({})
    setTecnicosNotas([])
    setFeedbackTecnico([])
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
        tecnico_id:      evento.todos_tecnicos ? 'todos' : (evento.tecnico_id ?? ''),
        tecnico2_id:     evento.tecnico2_id ?? '',
        rider_url:       evento.rider_url   ?? '',
        hora_inicio:     evento.hora_inicio?.slice(0, 5)     ?? '',
        hora_fim:        evento.hora_fim?.slice(0, 5)        ?? '',
        hora_instalacao: evento.hora_instalacao?.slice(0, 5) ?? '',
        data_preparacao:  evento.data_preparacao             ?? '',
        hora_preparacao:  evento.hora_preparacao?.slice(0,5)  ?? '',
        notas_preparacao: evento.notas_preparacao             ?? '',
        fase:             evento.fase                         ?? 'criacao',
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
      // Carregar equipamentos do evento
      supabase.from('evento_equipamentos')
        .select('id, equipamento_id, descricao_manual, tipo, quantidade, valor_custo, margem')
        .eq('evento_id', evento.id)
        .then(({ data }) => {
          const byTipo = { proprio: [], alugado: [], comprado: [], extra: [] }
          ;(data ?? []).forEach(r => {
            const tipo = r.tipo || 'proprio'
            if (byTipo[tipo]) {
              byTipo[tipo].push({
                _key: uidF(), id: r.id,
                equipamento_id: r.equipamento_id ?? null,
                descricao: r.descricao_manual ?? '',
                valor_custo: r.valor_custo != null ? String(r.valor_custo) : '',
                margem: r.margem != null ? String(r.margem) : '',
                unidades: r.quantidade ?? 1,
              })
            }
          })
          setEquipRows(byTipo)
        })
        .catch(console.error)
      // Carregar evento_carros
      supabase.from('evento_carros').select('carro_id, condutor_id, km_saida, km_chegada')
        .eq('evento_id', evento.id).maybeSingle()
        .then(({ data }) => { if (data) setEventoCarros({ carro_id: data.carro_id ?? '', condutor_id: data.condutor_id ?? '', km_saida: data.km_saida != null ? String(data.km_saida) : '', km_chegada: data.km_chegada != null ? String(data.km_chegada) : '' }) })
        .catch(console.error)
      // Carregar estado das checklists (por item e por submissão)
      supabase.from('checklist_checks').select('checklist_item_id, tecnico_id, checked_at').eq('evento_id', evento.id)
        .then(({ data }) => {
          const byItem = {}
          ;(data ?? []).forEach(c => {
            if (!byItem[c.checklist_item_id]) byItem[c.checklist_item_id] = []
            byItem[c.checklist_item_id].push({ tecnico_id: c.tecnico_id, checked_at: c.checked_at })
          })
          setChecksByItem(byItem)
        }).catch(console.error)
      supabase.from('checklist_submissoes').select('checklist_id, tecnico_id').eq('evento_id', evento.id)
        .then(({ data }) => {
          const byCl = {}
          ;(data ?? []).forEach(s => { if (!byCl[s.checklist_id]) byCl[s.checklist_id] = []; byCl[s.checklist_id].push(s.tecnico_id) })
          setCheckSubs(byCl)
        }).catch(console.error)
      // Carregar notas dos técnicos (evento_tecnicos)
      supabase.from('evento_tecnicos').select('tecnico_id, notas').eq('evento_id', evento.id)
        .then(({ data }) => setTecnicosNotas((data ?? []).filter(r => r.notas?.trim())))
        .catch(console.error)
      // Carregar feedback dos técnicos (evento_feedback)
      supabase.from('evento_feedback').select('tecnico_id, texto').eq('evento_id', evento.id)
        .then(({ data }) => setFeedbackTecnico((data ?? []).filter(r => r.texto?.trim())))
        .catch(console.error)
      // Carregar checklists do evento
      supabase.from('evento_checklists')
        .select('id, checklist_id, checklists(id, nome, tipo_evento_id, checklist_itens(id, texto, ordem))')
        .eq('evento_id', evento.id)
        .then(({ data }) => {
          setEventoChecklists((data ?? []).map(ec => ({
            _key: uidF(), ecId: ec.id, clId: ec.checklist_id,
            nome: ec.checklists.nome, tipo_evento_id: ec.checklists.tipo_evento_id,
            itens: (ec.checklists.checklist_itens ?? [])
              .sort((a, b) => a.ordem - b.ordem)
              .map(it => ({ _key: uidF(), id: it.id, texto: it.texto })),
            removed: false, _deletedItemIds: [],
          })))
        })
        .catch(console.error)
    } else {
      setForm({
        ...VAZIO,
        data_evento: dataInicial || evento?.data_evento || '',
        espaco_id:   evento?.espaco_id || '',
        tipo:        evento?.tipo      || '',
      })
      setEventoChecklists([])
    }
  }, [aberto, evento, dataInicial])

  const [notifState, setNotifState] = useState({}) // { 1: 'loading'|'ok', 2: 'loading'|'ok' }

  const set = (campo, valor) => setForm((f) => ({ ...f, [campo]: valor }))

  async function dispararNotificacao(num) {
    const tecId = num === 1
      ? (form.tecnico_id === 'todos' ? null : form.tecnico_id)
      : form.tecnico2_id
    if (!tecId) return
    const tec = tecnicos.find(t => t.id === tecId)
    if (!tec?.telefone) return
    const digits = tec.telefone.replace(/[^0-9]/g, '')
    const wa_id = digits.length === 9 ? '351' + digits : digits
    if (!wa_id) return
    const espaco = espacos.find(e => e.id === form.espaco_id)
    setNotifState(s => ({ ...s, [num]: 'loading' }))
    try {
      await fetch('https://i4dj.app.n8n.cloud/webhook/evento-criado-wa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'MANUAL',
          table: 'supa_eventos',
          record: {
            evento:          form.evento || '',
            responsavel:     tec.nome || '',
            cliente:         espaco?.nome || '',
            data_evento:     form.data_evento   || null,
            hora_inicio:     form.hora_inicio   || null,
            dia_instalacao:  form.dia_instalacao  || null,
            hora_instalacao: form.hora_instalacao || null,
            wa_id,
            wa_id_tecnico2: '',
          },
        }),
      })
      setNotifState(s => ({ ...s, [num]: 'ok' }))
      setTimeout(() => setNotifState(s => { const n = { ...s }; delete n[num]; return n }), 3000)
    } catch {
      setNotifState(s => { const n = { ...s }; delete n[num]; return n })
    }
  }

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
        tecnico_id:      form.tecnico_id === 'todos' ? null : (form.tecnico_id || null),
        tecnico2_id:     form.tecnico2_id     || null,
        todos_tecnicos:  form.tecnico_id === 'todos',
        hora_inicio:     form.hora_inicio     || null,
        hora_fim:        form.hora_fim        || null,
        hora_instalacao: form.hora_instalacao || null,
        dia_instalacao:  form.dia_instalacao  || null,
        data_preparacao:  form.data_preparacao  || null,
        hora_preparacao:  form.hora_preparacao  || null,
        notas_preparacao: form.notas_preparacao?.trim() || null,
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

      // Guardar evento_equipamentos
      if (savedId) {
        await supabase.from('evento_equipamentos').delete().eq('evento_id', savedId)
        const equipInserts = []
        Object.entries(equipRows).forEach(([tipo, rows]) => {
          rows.forEach(r => {
            if (!r.descricao.trim() && !r.equipamento_id) return
            equipInserts.push({
              evento_id: savedId,
              equipamento_id: r.equipamento_id || null,
              descricao_manual: r.descricao.trim() || null,
              tipo,
              quantidade: Number(r.unidades) || 1,
              valor_custo: r.valor_custo !== '' ? Number(r.valor_custo) : null,
              margem: r.margem !== '' ? Number(r.margem) : null,
            })
          })
        })
        if (equipInserts.length > 0) await supabase.from('evento_equipamentos').insert(equipInserts)
      }

      // Guardar evento_carros
      if (savedId && (eventoCarros.carro_id || eventoCarros.condutor_id || eventoCarros.km_saida || eventoCarros.km_chegada)) {
        await supabase.from('evento_carros').delete().eq('evento_id', savedId)
        await supabase.from('evento_carros').insert({
          evento_id:   savedId,
          carro_id:    eventoCarros.carro_id    || null,
          condutor_id: eventoCarros.condutor_id || null,
          km_saida:    eventoCarros.km_saida    !== '' ? Number(eventoCarros.km_saida)    : null,
          km_chegada:  eventoCarros.km_chegada  !== '' ? Number(eventoCarros.km_chegada)  : null,
        })
      }

      // Guardar checklists
      if (savedId) {
        for (const ec of eventoChecklists) {
          if (ec.removed) {
            if (ec.ecId) await supabase.from('evento_checklists').delete().eq('id', ec.ecId)
            continue
          }
          let clId = ec.clId
          if (!clId) {
            const { data: newCl } = await supabase.from('checklists')
              .insert({ nome: ec.nome, tipo_evento_id: ec.tipo_evento_id ?? null })
              .select('id').single()
            clId = newCl?.id
          }
          if (!clId) continue
          // Apagar itens removidos
          for (const itemId of (ec._deletedItemIds || [])) {
            await supabase.from('checklist_itens').delete().eq('id', itemId)
          }
          // Upsert itens actuais
          for (let i = 0; i < ec.itens.length; i++) {
            const item = ec.itens[i]
            if (!item.texto.trim()) continue
            if (!item.id) {
              await supabase.from('checklist_itens').insert({ checklist_id: clId, texto: item.texto, ordem: i })
            } else {
              await supabase.from('checklist_itens').update({ texto: item.texto, ordem: i }).eq('id', item.id)
            }
          }
          // Associar ao evento
          if (!ec.ecId) {
            await supabase.from('evento_checklists').upsert(
              { evento_id: savedId, checklist_id: clId },
              { onConflict: 'evento_id,checklist_id' }
            )
          }
        }
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
          <div className="flex items-center gap-2">
            {evento?.id && (
              <button
                onClick={() => window.open(`/apoiot/checklist/${evento.id}`, '_blank')}
                title="Ver checklists deste evento"
                className="text-accent-subtle hover:text-status-confirmado transition-colors"
              >
                <ListChecks size={16} />
              </button>
            )}
            <button onClick={onFechar} className="text-accent-subtle hover:text-accent transition-colors">
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Abas */}
        <div className="flex border-b border-border px-6 overflow-x-auto">
          {[
            { id: 'geral',        label: 'Geral' },
            { id: 'equipamentos', label: 'Equipamentos' },
            { id: 'preparacao',   label: 'Preparação' },
            { id: 'execucao',     label: 'Execução' },
            { id: 'financeiro',   label: 'Financeiro' },
          ].map((aba) => (
            <button
              key={aba.id}
              onClick={() => setAba(aba.id)}
              className={clsx(
                'px-4 py-2.5 text-xs font-medium border-b-2 transition-colors -mb-px whitespace-nowrap',
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
              {/* Fase do evento */}
              {evento?.id && (
                <div className="flex items-center gap-1.5 p-2.5 bg-surface-2/50 rounded-lg border border-border/40 overflow-x-auto">
                  {[
                    { id: 'criacao',    label: 'Criação' },
                    { id: 'preparacao', label: 'Preparação' },
                    { id: 'execucao',   label: 'Execução' },
                    { id: 'concluido',  label: 'Concluído' },
                    { id: 'faturado',   label: 'Faturado' },
                  ].map(({ id, label }, i, arr) => {
                    const fases = ['criacao', 'preparacao', 'execucao', 'concluido', 'faturado']
                    const idxAtual = fases.indexOf(form.fase || 'criacao')
                    const done = i <= idxAtual
                    return (
                      <div key={id} className="flex items-center gap-1.5 shrink-0">
                        <div className={clsx('w-1.5 h-1.5 rounded-full shrink-0', done ? 'bg-status-confirmado' : 'bg-border')} />
                        <span className={clsx('text-[10px]', done ? 'text-status-confirmado font-medium' : 'text-accent-subtle/40')}>{label}</span>
                        {i < arr.length - 1 && <div className={clsx('w-6 h-px shrink-0', i < idxAtual ? 'bg-status-confirmado/40' : 'bg-border/40')} />}
                      </div>
                    )
                  })}
                </div>
              )}

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
                    onChange={(e) => {
                      const nome = e.target.value
                      set('tipo', nome)
                      const tipoObj = tipos.find(t => t.nome === nome)
                      if (tipoObj) {
                        const matching = allChecklists.filter(c => c.tipo_evento_id === tipoObj.id)
                        if (matching.length > 0) {
                          setEventoChecklists(prev => {
                            let next = [...prev]
                            matching.forEach(cl => {
                              if (!next.some(ec => ec.clId === cl.id && !ec.removed)) {
                                next = [...next, {
                                  _key: uidF(), ecId: null, clId: cl.id,
                                  nome: cl.nome, tipo_evento_id: cl.tipo_evento_id,
                                  itens: (cl.checklist_itens ?? [])
                                    .sort((a, b) => a.ordem - b.ordem)
                                    .map(it => ({ _key: uidF(), id: it.id, texto: it.texto })),
                                  removed: false, _deletedItemIds: [],
                                }]
                              }
                            })
                            return next
                          })
                        }
                      }
                    }}
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

              {/* Técnico Responsável + 2º Técnico */}
              <div className="grid grid-cols-2 gap-3">
                <Field label="Técnico Responsável" action={
                  form.tecnico_id && form.tecnico_id !== 'todos' ? (
                    <button type="button" onClick={() => dispararNotificacao(1)}
                      disabled={notifState[1] === 'loading'}
                      title="Enviar notificação WhatsApp"
                      className={clsx(
                        'flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border transition-colors disabled:opacity-50',
                        notifState[1] === 'ok'
                          ? 'border-status-confirmado/40 bg-status-confirmado/10 text-status-confirmado'
                          : 'border-blue-500/30 bg-blue-500/10 text-blue-300 hover:bg-blue-500/20'
                      )}>
                      <Send size={9} />
                      {notifState[1] === 'loading' ? '...' : notifState[1] === 'ok' ? 'Enviado' : 'Notificar'}
                    </button>
                  ) : null
                }>
                  <select
                    className={inputCls}
                    value={form.tecnico_id}
                    onChange={(e) => set('tecnico_id', e.target.value)}
                  >
                    <option value="">— Não atribuído —</option>
                    <option value="todos">Todos os técnicos</option>
                    {tecnicos.map(t => (
                      <option key={t.id} value={t.id}>{t.nome}</option>
                    ))}
                  </select>
                </Field>
                <Field label="2º Técnico de Apoio" action={
                  form.tecnico2_id ? (
                    <button type="button" onClick={() => dispararNotificacao(2)}
                      disabled={notifState[2] === 'loading'}
                      title="Enviar notificação WhatsApp"
                      className={clsx(
                        'flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border transition-colors disabled:opacity-50',
                        notifState[2] === 'ok'
                          ? 'border-status-confirmado/40 bg-status-confirmado/10 text-status-confirmado'
                          : 'border-blue-500/30 bg-blue-500/10 text-blue-300 hover:bg-blue-500/20'
                      )}>
                      <Send size={9} />
                      {notifState[2] === 'loading' ? '...' : notifState[2] === 'ok' ? 'Enviado' : 'Notificar'}
                    </button>
                  ) : null
                }>
                  <select
                    className={inputCls}
                    value={form.tecnico2_id}
                    onChange={(e) => set('tecnico2_id', e.target.value)}
                  >
                    <option value="">— Não atribuído —</option>
                    {tecnicos.map(t => (
                      <option key={t.id} value={t.id}>{t.nome}</option>
                    ))}
                  </select>
                </Field>
              </div>

              {/* Contacto */}
              <div className="grid grid-cols-1 gap-3">
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
                    onChange={(e) => {
                      set('data_evento', e.target.value)
                      if (!form.dia_instalacao) set('dia_instalacao', e.target.value)
                    }}
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

              {/* Preparação */}
              <div className="border-t border-border/40 pt-4 flex flex-col gap-3">
                <p className="text-[10px] font-bold uppercase tracking-wider text-accent-subtle/60">Preparação</p>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Data de preparação">
                    <input type="date" className={inputCls} value={form.data_preparacao}
                      onChange={e => set('data_preparacao', e.target.value)} />
                  </Field>
                  <Field label="Hora de preparação">
                    <input type="time" className={inputCls} value={form.hora_preparacao}
                      onChange={e => set('hora_preparacao', e.target.value)} />
                  </Field>
                </div>
                <Field label="Notas de preparação">
                  <textarea className={textareaCls} rows={3} value={form.notas_preparacao}
                    onChange={e => set('notas_preparacao', e.target.value)}
                    placeholder="O que é para preparar…" />
                </Field>
              </div>
            </>
          )}

          {/* ── Aba Equipamentos ── */}
          {abaActiva === 'equipamentos' && (() => {
            const emptyEquipRow = () => ({ _key: uidF(), id: null, equipamento_id: null, descricao: '', valor_custo: '', margem: '', unidades: 1 })
            const SECOES = [
              { key: 'proprio',  label: 'Equipamentos para o evento', hasDbPicker: true },
              { key: 'alugado',  label: 'Equipamentos Alugados',       hasDbPicker: false },
              { key: 'comprado', label: 'Equipamentos Comprados',      hasDbPicker: false },
              { key: 'extra',    label: 'Extras',                       hasDbPicker: false },
            ]
            const updRow = (secKey, rowKey, field, val) => setEquipRows(prev => ({
              ...prev,
              [secKey]: prev[secKey].map(r => r._key === rowKey ? { ...r, [field]: val } : r),
            }))
            const remRow = (secKey, rowKey) => setEquipRows(prev => ({
              ...prev, [secKey]: prev[secKey].filter(r => r._key !== rowKey),
            }))
            const addRow = (secKey, fromEquip = null) => {
              const row = { _key: uidF(), id: null, equipamento_id: null, descricao: '', valor_custo: '', margem: '', unidades: 1 }
              if (fromEquip) {
                row.equipamento_id = fromEquip.id
                row.descricao = fromEquip.nome
                row.valor_custo = fromEquip.valor_custo != null ? String(fromEquip.valor_custo) : ''
              }
              setEquipRows(prev => ({ ...prev, [secKey]: [...prev[secKey], row] }))
            }
            const cellCls = 'px-2 py-1.5 text-xs text-accent bg-transparent border-r border-border/20 focus:outline-none focus:bg-surface-3/20'
            return (
              <>
                {SECOES.map(({ key, label, hasDbPicker }) => {
                  const rows = equipRows[key]
                  return (
                    <div key={key} className="flex flex-col gap-1.5">
                      <div className="flex items-center justify-between min-h-[22px]">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-accent-subtle/60">{label}</p>
                        <div className="flex items-center gap-2">
                          {hasDbPicker && equipamentosList.length > 0 && (
                            <select
                              className={inputCls + ' text-[11px] py-0.5 px-2 w-44 h-7'}
                              value=""
                              onChange={e => {
                                const eq = equipamentosList.find(x => x.id === e.target.value)
                                if (eq) addRow(key, eq)
                              }}
                            >
                              <option value="">+ Adicionar da BD…</option>
                              {equipamentosList.map(eq => (
                                <option key={eq.id} value={eq.id}>{eq.nome}</option>
                              ))}
                            </select>
                          )}
                          <button type="button" onClick={() => addRow(key)}
                            className="flex items-center gap-1 text-[11px] text-accent-subtle/50 hover:text-status-confirmado/70 transition-colors whitespace-nowrap">
                            <Plus size={11} />Linha
                          </button>
                        </div>
                      </div>

                      {rows.length > 0 ? (
                        <div className="border border-border rounded-lg overflow-hidden">
                          <div className="grid grid-cols-[1fr_68px_68px_44px_68px_22px] bg-surface-2/60 border-b border-border/40">
                            {['Descrição', 'Custo €', 'Margem €', 'Un.', 'Valor', ''].map((h, i) => (
                              <div key={i} className="px-2 py-1 text-[9px] font-bold uppercase tracking-wider text-accent-subtle/50 border-r border-border/20 last:border-0">{h}</div>
                            ))}
                          </div>
                          {rows.map(r => {
                            const custo = r.valor_custo !== '' ? Number(r.valor_custo) : 0
                            const marg  = r.margem      !== '' ? Number(r.margem)      : 0
                            const valor = (Number(r.unidades) || 1) * (custo + marg)
                            return (
                              <div key={r._key} className="grid grid-cols-[1fr_68px_68px_44px_68px_22px] border-b border-border/15 last:border-0 hover:bg-surface-3/20">
                                <input value={r.descricao} onChange={e => updRow(key, r._key, 'descricao', e.target.value)}
                                  placeholder="Descrição…" className={cellCls} />
                                <input type="number" min="0" step="0.01" value={r.valor_custo} onChange={e => updRow(key, r._key, 'valor_custo', e.target.value)}
                                  placeholder="0" className={cellCls + ' text-right'} />
                                <input type="number" min="0" step="0.01" value={r.margem} onChange={e => updRow(key, r._key, 'margem', e.target.value)}
                                  placeholder="0" className={cellCls + ' text-right'} />
                                <input type="number" min="1" step="1" value={r.unidades} onChange={e => updRow(key, r._key, 'unidades', e.target.value)}
                                  className={cellCls + ' text-center'} />
                                <div className={cellCls + ' text-right text-accent-muted tabular-nums select-none'}>
                                  {valor > 0 ? valor.toFixed(2) : '—'}
                                </div>
                                <button type="button" onClick={() => remRow(key, r._key)}
                                  className="flex items-center justify-center text-border/30 hover:text-red-400/60 transition-colors">
                                  <Trash2 size={11} />
                                </button>
                              </div>
                            )
                          })}
                        </div>
                      ) : (
                        <p className="text-[11px] text-accent-subtle/25 italic pl-1">Sem itens — clique em + Linha para adicionar</p>
                      )}
                    </div>
                  )
                })}

                <div className="border-t border-border/40 pt-4 flex flex-col gap-4">
                  <Field label="Notas Operacionais">
                    <textarea className={textareaCls} rows={4}
                      value={form.notas_operacionais}
                      onChange={(e) => set('notas_operacionais', e.target.value)}
                      placeholder="Informações operacionais do evento…" />
                  </Field>

                  <Field label="Rider Técnico">
                    <div className="flex flex-col gap-2">
                      {form.rider_url ? (
                        <div className="flex items-center gap-2">
                          <a href={form.rider_url} target="_blank" rel="noopener noreferrer"
                            className="text-xs text-accent underline truncate flex-1">
                            {form.rider_url.split('/').pop()}
                          </a>
                          <button type="button" onClick={() => set('rider_url', '')}
                            className="text-xs text-status-cancelado hover:opacity-70 flex-shrink-0">
                            Remover
                          </button>
                        </div>
                      ) : null}
                      <label className="flex items-center gap-2 cursor-pointer">
                        <span className={`${inputCls} flex items-center gap-2 cursor-pointer text-accent-muted`}>
                          <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                          {form.rider_url ? 'Substituir ficheiro' : 'Carregar ficheiro (PDF, Word…)'}
                        </span>
                        <input type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.txt,.zip" className="hidden"
                          onChange={async (e) => {
                            const file = e.target.files?.[0]
                            if (!file) return
                            const ext = file.name.split('.').pop()
                            const path = `riders/${crypto.randomUUID()}.${ext}`
                            const { error } = await supabase.storage.from('eventos-riders').upload(path, file)
                            if (error) { alert('Erro ao carregar ficheiro: ' + error.message); return }
                            const { data: pub } = supabase.storage.from('eventos-riders').getPublicUrl(path)
                            set('rider_url', pub.publicUrl)
                            e.target.value = ''
                          }} />
                      </label>
                    </div>
                  </Field>

                  <details>
                    <summary className="flex items-center gap-2 cursor-pointer list-none select-none">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-accent-subtle/40">Notas de Faturação</span>
                      <span className="text-[10px] text-accent-subtle/25 italic">(Folha de Contas)</span>
                    </summary>
                    <div className="mt-2">
                      <textarea className={textareaCls} rows={3}
                        value={form.notas_faturacao}
                        onChange={(e) => set('notas_faturacao', e.target.value)}
                        placeholder="Notas que aparecem na fatura / documento de contas…" />
                    </div>
                  </details>
                </div>
              </>
            )
          })()}

          {/* ── Aba Preparação ── */}
          {abaActiva === 'preparacao' && (
            <div className="flex flex-col gap-5">

              {/* Checklists (movidas da antiga aba Checklist) */}
              <div className="border-t border-border/40 pt-4 flex flex-col gap-4">
                <p className="text-[10px] font-bold uppercase tracking-wider text-accent-subtle/60">Checklists</p>
                {eventoChecklists.filter(ec => !ec.removed).map((ec) => (
                  <div key={ec._key} className="border border-border rounded-xl overflow-hidden">
                    <div className="flex items-center justify-between px-3 py-2 bg-surface-2 border-b border-border/50">
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <ListChecks size={13} className="text-accent-subtle shrink-0" />
                        <input
                          className="flex-1 text-[13px] font-semibold text-accent bg-transparent outline-none min-w-0"
                          value={ec.nome}
                          onChange={e => setEventoChecklists(prev => prev.map(x => x._key === ec._key ? { ...x, nome: e.target.value } : x))}
                        />
                      </div>
                      <button
                        onClick={() => setEventoChecklists(prev => prev.map(x => x._key === ec._key ? { ...x, removed: true } : x))}
                        className="text-accent-subtle/30 hover:text-status-cancelado transition-colors ml-2 shrink-0"
                      >
                        <X size={13} />
                      </button>
                    </div>
                    <div className="px-3 py-2.5 flex flex-col gap-1.5">
                      {ec.itens.map((item, idx) => (
                        <div key={item._key} className="flex items-center gap-2">
                          <span className="text-accent-subtle/30 text-[11px] w-4 text-right shrink-0">{idx + 1}.</span>
                          <input
                            className="flex-1 text-[12px] text-accent bg-transparent border-b border-border/30 focus:border-accent/40 outline-none py-0.5"
                            value={item.texto}
                            placeholder={`Item ${idx + 1}…`}
                            onChange={e => setEventoChecklists(prev => prev.map(x => x._key === ec._key ? {
                              ...x, itens: x.itens.map(it => it._key === item._key ? { ...it, texto: e.target.value } : it)
                            } : x))}
                          />
                          <button
                            onClick={() => setEventoChecklists(prev => prev.map(x => x._key === ec._key ? {
                              ...x,
                              itens: x.itens.filter(it => it._key !== item._key),
                              _deletedItemIds: item.id ? [...(x._deletedItemIds || []), item.id] : (x._deletedItemIds || []),
                            } : x))}
                            className="text-accent-subtle/25 hover:text-status-cancelado transition-colors shrink-0"
                          >
                            <X size={11} />
                          </button>
                        </div>
                      ))}
                      <button
                        onClick={() => setEventoChecklists(prev => prev.map(x => x._key === ec._key ? {
                          ...x, itens: [...x.itens, { _key: uidF(), id: null, texto: '' }]
                        } : x))}
                        className="flex items-center gap-1 text-[11px] text-accent-subtle/40 hover:text-status-confirmado/70 transition-colors mt-1"
                      >
                        <Plus size={11} />Adicionar item
                      </button>
                    </div>
                  </div>
                ))}
                <div className="flex flex-col gap-2">
                  <select className={inputCls} value=""
                    onChange={e => {
                      const clId = e.target.value
                      if (!clId) return
                      const cl = allChecklists.find(c => String(c.id) === clId)
                      if (!cl) return
                      setEventoChecklists(prev => [...prev, {
                        _key: uidF(), ecId: null, clId: cl.id,
                        nome: cl.nome, tipo_evento_id: cl.tipo_evento_id,
                        itens: (cl.checklist_itens ?? []).sort((a, b) => a.ordem - b.ordem).map(it => ({ _key: uidF(), id: it.id, texto: it.texto })),
                        removed: false, _deletedItemIds: [],
                      }])
                    }}>
                    <option value="">— Adicionar template de checklist —</option>
                    {allChecklists
                      .filter(cl => !eventoChecklists.some(ec => ec.clId === cl.id && !ec.removed))
                      .map(cl => <option key={cl.id} value={cl.id}>{cl.nome}</option>)
                    }
                  </select>
                  <button
                    onClick={() => setEventoChecklists(prev => [...prev, {
                      _key: uidF(), ecId: null, clId: null,
                      nome: 'Nova Checklist', tipo_evento_id: null,
                      itens: [], removed: false, _deletedItemIds: [],
                    }])}
                    className="flex items-center gap-1 text-[11px] text-accent-subtle/40 hover:text-status-confirmado/70 transition-colors"
                  >
                    <Plus size={11} />Criar nova checklist
                  </button>
                </div>
              </div>

              {/* Apoio T — read-only (só aparece se evento guardado e houver dados) */}
              {evento?.id && (tecnicosNotas.length > 0 || Object.keys(checksByItem).length > 0) && (
                <div className="border-t border-border/40 pt-4 flex flex-col gap-4">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-accent-subtle/60">
                    Apoio T <span className="font-normal normal-case tracking-normal text-accent-subtle/40">— só leitura</span>
                  </p>
                  {tecnicosNotas.map(r => (
                    <div key={r.tecnico_id} className="rounded-lg border border-border/40 bg-surface-2/40 px-3 py-2.5">
                      <p className="text-[10px] font-semibold text-accent-subtle/60 uppercase tracking-wider mb-1.5">
                        Notas de {tecnicos.find(t => t.id === r.tecnico_id)?.nome ?? '—'}
                      </p>
                      <p className="text-xs text-accent-muted whitespace-pre-wrap">{r.notas}</p>
                    </div>
                  ))}
                  {eventoChecklists.filter(ec => !ec.removed && ec.itens.length > 0).map(ec => {
                    const totalMarcados = ec.itens.filter(it => (checksByItem[it.id] ?? []).length > 0).length
                    if (totalMarcados === 0) return null
                    return (
                      <div key={ec._key + '_apoiot'} className="rounded-lg border border-border/40 overflow-hidden">
                        <div className="flex items-center justify-between px-3 py-1.5 bg-surface-2/60 border-b border-border/30">
                          <p className="text-[11px] font-semibold text-accent">{ec.nome}</p>
                          <p className="text-[10px] text-accent-subtle/50">{totalMarcados}/{ec.itens.length}</p>
                        </div>
                        {ec.itens.map(item => {
                          const checks = checksByItem[item.id] ?? []
                          if (checks.length === 0) return null
                          return (
                            <div key={item._key} className="flex items-start gap-2.5 px-3 py-2 border-b border-border/15 last:border-0 bg-status-confirmado/5">
                              <div className="w-4 h-4 rounded border flex items-center justify-center shrink-0 mt-0.5 bg-status-confirmado/20 border-status-confirmado/40">
                                <Check size={10} className="text-status-confirmado" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-xs text-accent-muted line-through">{item.texto}</p>
                                {checks.map(c => (
                                  <p key={c.tecnico_id} className="text-[10px] text-accent-subtle/50 mt-0.5">
                                    {tecnicos.find(t => t.id === c.tecnico_id)?.nome ?? '—'} · {new Date(c.checked_at).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })}
                                  </p>
                                ))}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* ── Aba Execução ── */}
          {abaActiva === 'execucao' && (
            <div className="flex flex-col gap-5">

              {/* Checklists com estado — via Apoio T */}
              {eventoChecklists.filter(ec => !ec.removed && ec.itens.length > 0).length > 0 && (
                <div className="flex flex-col gap-3">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-accent-subtle/60">
                    Checklist de Preparação <span className="font-normal normal-case tracking-normal text-accent-subtle/40">— via Apoio T</span>
                  </p>
                  {eventoChecklists.filter(ec => !ec.removed && ec.itens.length > 0).map(ec => {
                    const submittedBy = checkSubs[ec.clId] ?? []
                    const totalMarcados = ec.itens.filter(it => (checksByItem[it.id] ?? []).length > 0).length
                    return (
                      <div key={ec._key} className="rounded-lg border border-border/40 overflow-hidden">
                        <div className="flex items-center justify-between px-3 py-1.5 bg-surface-2/60 border-b border-border/30">
                          <p className="text-[11px] font-semibold text-accent">{ec.nome}</p>
                          <div className="flex items-center gap-2">
                            <p className="text-[10px] text-accent-subtle/50">{totalMarcados}/{ec.itens.length}</p>
                            {submittedBy.length > 0 && (
                              <span className="inline-flex items-center gap-1 text-[10px] text-status-confirmado">
                                <Check size={10} />{submittedBy.map(tid => tecnicos.find(t => t.id === tid)?.nome ?? '—').join(', ')}
                              </span>
                            )}
                          </div>
                        </div>
                        {ec.itens.map(item => {
                          const checks = checksByItem[item.id] ?? []
                          const checked = checks.length > 0
                          return (
                            <div key={item._key} className={clsx(
                              'flex items-center gap-2.5 px-3 py-2 border-b border-border/15 last:border-0',
                              checked ? 'bg-status-confirmado/5' : ''
                            )}>
                              {checked ? (
                                <Check size={11} className="text-status-confirmado shrink-0" />
                              ) : (
                                <span className="text-[9px] font-bold uppercase tracking-wider text-accent-subtle/35 shrink-0 border border-border/30 rounded px-1.5 py-0.5 whitespace-nowrap">Técnico</span>
                              )}
                              <div className="flex-1 min-w-0">
                                <p className={clsx('text-xs', checked ? 'text-accent-muted/70 line-through' : 'text-accent')}>{item.texto}</p>
                                {checked && checks.map(c => (
                                  <p key={c.tecnico_id} className="text-[10px] text-accent-subtle/50 mt-0.5">
                                    {tecnicos.find(t => t.id === c.tecnico_id)?.nome ?? '—'} · {new Date(c.checked_at).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })}
                                  </p>
                                ))}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )
                  })}
                </div>
              )}

              {/* Veículo */}
              <div className="flex flex-col gap-3">
                <p className="text-[10px] font-bold uppercase tracking-wider text-accent-subtle/60">Veículo</p>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Carro">
                    <select className={inputCls} value={eventoCarros.carro_id}
                      onChange={e => setEventoCarros(p => ({ ...p, carro_id: e.target.value }))}>
                      <option value="">— Selecionar —</option>
                      {carros.map(c => <option key={c.id} value={c.id}>{c.marca} {c.modelo} · {c.matricula}</option>)}
                    </select>
                  </Field>
                  <Field label="Condutor">
                    <select className={inputCls} value={eventoCarros.condutor_id}
                      onChange={e => setEventoCarros(p => ({ ...p, condutor_id: e.target.value }))}>
                      <option value="">— Selecionar —</option>
                      {tecnicos.map(t => <option key={t.id} value={t.id}>{t.nome}</option>)}
                    </select>
                  </Field>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Km saída">
                    <input type="number" min="0" step="1" className={inputCls}
                      value={eventoCarros.km_saida}
                      onChange={e => setEventoCarros(p => ({ ...p, km_saida: e.target.value }))}
                      placeholder="—" />
                  </Field>
                  <Field label="Km chegada">
                    <input type="number" min="0" step="1" className={inputCls}
                      value={eventoCarros.km_chegada}
                      onChange={e => setEventoCarros(p => ({ ...p, km_chegada: e.target.value }))}
                      placeholder="—" />
                  </Field>
                </div>
              </div>

              {/* Notas do técnico — via Apoio T */}
              <div className="flex flex-col gap-2">
                <p className="text-[10px] font-bold uppercase tracking-wider text-accent-subtle/60">
                  Notas do técnico <span className="font-normal normal-case tracking-normal text-accent-subtle/40">via Apoio T</span>
                </p>
                {feedbackTecnico.length > 0 ? feedbackTecnico.map(r => (
                  <div key={r.tecnico_id} className="rounded-lg border border-border/40 bg-surface-2/40 px-3 py-2.5">
                    <p className="text-[10px] font-semibold text-accent-subtle/60 uppercase tracking-wider mb-1">
                      {tecnicos.find(t => t.id === r.tecnico_id)?.nome ?? '—'}
                    </p>
                    <p className="text-xs text-accent-muted whitespace-pre-wrap">{r.texto}</p>
                  </div>
                )) : (
                  <p className="text-[11px] text-accent-subtle/30 italic px-1">Aguarda input do técnico via Apoio T…</p>
                )}
              </div>

              {/* Assinaturas / Fases */}
              <div className="flex flex-col gap-3">
                <p className="text-[10px] font-bold uppercase tracking-wider text-accent-subtle/60">
                  Assinaturas / Fases <span className="font-normal normal-case tracking-normal text-accent-subtle/40">recolhidas in-loco via Apoio T</span>
                </p>
                <div className="flex flex-col gap-2">
                  {[
                    { label: 'Saída LMD',             key: 'assinatura_lmd_at' },
                    { label: 'IN — Chegada ao evento', key: 'assinatura_in_at' },
                    { label: 'OUT — Fim do evento',    key: 'assinatura_out_at' },
                  ].map(({ label, key }) => {
                    const val = evento?.[key]
                    return (
                      <div key={key} className="flex items-center gap-3 p-3 rounded-lg bg-surface-2/50 border border-border/40">
                        <div className={clsx('w-2 h-2 rounded-full shrink-0', val ? 'bg-status-confirmado' : 'bg-border')} />
                        <div className="flex-1 min-w-0">
                          <p className="text-[11px] font-medium text-accent">{label}</p>
                          <p className="text-[10px] text-accent-subtle/60 mt-0.5">
                            {val ? new Date(val).toLocaleString('pt-PT') : 'Pendente — registo via Apoio T'}
                          </p>
                        </div>
                      </div>
                    )
                  })}
                </div>
                <div className="p-3 bg-surface-2/50 border border-border/40 rounded-lg flex items-center gap-3">
                  <span className={clsx(
                    'text-xs font-semibold px-2.5 py-1 rounded-full',
                    (form.fase === 'concluido' || form.fase === 'faturado')
                      ? 'bg-status-confirmado/15 text-status-confirmado'
                      : 'bg-surface-3 text-accent-muted'
                  )}>
                    {({ criacao: 'Criação', preparacao: 'Preparação', execucao: 'Execução', concluido: 'Concluído', faturado: 'Faturado' })[form.fase || 'criacao'] || 'Criação'}
                  </span>
                  <p className="text-[10px] text-accent-subtle/50">Fase actualizada pelo Apoio T.</p>
                </div>
              </div>

            </div>
          )}


          {/* ── Aba Financeiro ── */}
          {abaActiva === 'financeiro' && (() => {
            const vApoio  = form.valor_apoio_tecnico === '' ? 0 : Number(form.valor_apoio_tecnico) || 0
            const vMargem = form.margem       === '' ? 0 : Number(form.margem)       || 0
            const vTransp = form.transporte   === '' ? 0 : Number(form.transporte)   || 0
            const vExtras = form.extras_contas === '' ? 0 : Number(form.extras_contas) || 0
            const totalCli = vApoio + vMargem + vTransp + vExtras
            const fmt = (v) => new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(v)
            const tec1 = form.tecnico_id === 'todos' ? 'Todos os técnicos' : tecnicos.find(t => t.id === form.tecnico_id)?.nome
            const tec2 = tecnicos.find(t => t.id === form.tecnico2_id)?.nome
            return (
              <div className="flex flex-col gap-5">
                {(tec1 || tec2) && (
                  <div className="flex flex-col gap-2">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-accent-subtle">Técnicos</p>
                    <div className="flex gap-2 flex-wrap">
                      {tec1 && <span className="px-2.5 py-1 rounded-full bg-surface-2 border border-border text-xs text-accent">{tec1}</span>}
                      {tec2 && <span className="px-2.5 py-1 rounded-full bg-surface-2 border border-border text-xs text-accent-muted">{tec2} <span className="text-accent-subtle/40">(apoio)</span></span>}
                    </div>
                  </div>
                )}

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

                <Field label="Notas de faturação">
                  <textarea className={textareaCls} rows={3}
                    value={form.notas_faturacao}
                    onChange={(e) => set('notas_faturacao', e.target.value)}
                    placeholder="Notas que aparecem na fatura / documento de contas…" />
                </Field>

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
