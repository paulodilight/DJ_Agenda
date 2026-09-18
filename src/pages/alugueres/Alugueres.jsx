import { useState, useEffect, useCallback, useRef, Fragment } from 'react'
import { Handshake, Plus, Search, X, QrCode, Pencil, LogIn, LogOut,
         RefreshCw, ChevronDown, ChevronUp, Printer, UserPlus, Trash2, Check } from 'lucide-react'
import { clsx } from 'clsx'
import { format } from 'date-fns'
import { pt } from 'date-fns/locale'
import jsQR from 'jsqr'
import { alugueresApi } from '@/lib/alugueresApi'
import { ContratoAluguer } from './ContratoAluguer'

// ── helpers ──────────────────────────────────────────────────────
const inpCls = 'w-full bg-surface-2 border border-border rounded-lg px-3 py-1.5 text-xs text-accent placeholder-accent-subtle focus:outline-none focus:border-white/20'
const lbl    = 'block text-[10px] font-semibold text-accent-subtle uppercase tracking-wider mb-1'

function fmtDia(iso) {
  if (!iso) return '—'
  return format(new Date(iso), 'dd/MM/yyyy', { locale: pt })
}

const ESTADO_INFO = {
  reserva:   { label: 'Reserva',   cls: 'bg-blue-500/10 text-blue-300 border-blue-500/20' },
  em_curso:  { label: 'Em curso',  cls: 'bg-amber-500/10 text-amber-300 border-amber-500/20' },
  concluido: { label: 'Concluído', cls: 'bg-status-confirmado/10 text-status-confirmado border-status-confirmado/20' },
  cancelado: { label: 'Cancelado', cls: 'bg-red-500/10 text-red-400 border-red-500/20' },
}

function EstadoBadge({ estado }) {
  const info = ESTADO_INFO[estado] ?? { label: estado, cls: 'bg-surface-3 text-accent-muted border-border' }
  return <span className={clsx('px-1.5 py-0.5 rounded text-[10px] font-semibold border', info.cls)}>{info.label}</span>
}

const FORM_VAZIO = {
  numero: '',
  cliente_id: '',
  _clienteBusca: '',
  _novoCliente: false,
  _novoCli: { nome: '', telefone: '', email: '', nif: '', morada: '' },
  atendido_por: '',
  atendido_por_tel: '',
  atendido_por_email: '',
  data_saida_prevista: '',
  data_entrada_prevista: '',
  local_levantamento: 'Praceta Mto Ivo Cruz 12, 1500-401 Lisboa, Portugal',
  local_devolucao: 'Praceta Mto Ivo Cruz 12, 1500-401 Lisboa, Portugal',
  local_utilizacao: '',
  matricula: '',
  caucao_valor: '',
  caucao_metodo: '',
  valor_total: '',
  notas: '',
}

// ── QR scanner inline ─────────────────────────────────────────────
function QrPickerModal({ onFound, onClose }) {
  const videoRef = useRef(null), canvasRef = useRef(null)
  const animRef  = useRef(null), streamRef = useRef(null)
  const locked   = useRef(false)
  const [camErr, setCamErr] = useState(false)

  const stop = useCallback(() => {
    if (animRef.current)  { cancelAnimationFrame(animRef.current); animRef.current = null }
    if (streamRef.current){ streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null }
  }, [])

  useEffect(() => {
    locked.current = false
    let active = true
    function tick() {
      if (!active || locked.current) return
      const v = videoRef.current, c = canvasRef.current
      if (!v || !c || v.readyState < 2) { animRef.current = requestAnimationFrame(tick); return }
      c.width = v.videoWidth; c.height = v.videoHeight
      const ctx = c.getContext('2d', { willReadFrequently: true })
      ctx.drawImage(v, 0, 0)
      const img  = ctx.getImageData(0, 0, c.width, c.height)
      const code = jsQR(img.data, img.width, img.height, { inversionAttempts: 'attemptBoth' })
      if (code && !locked.current) { locked.current = true; stop(); onFound(code.data); return }
      animRef.current = requestAnimationFrame(tick)
    }
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } } })
      .then(stream => {
        if (!active) { stream.getTracks().forEach(t => t.stop()); return }
        streamRef.current = stream
        const v = videoRef.current
        if (v) { v.srcObject = stream; v.play().then(() => { if (active) animRef.current = requestAnimationFrame(tick) }).catch(() => {}) }
      })
      .catch(() => { if (active) setCamErr(true) })
    return () => { active = false; stop() }
  }, [stop, onFound])

  return (
    <div className="fixed inset-0 z-[70] bg-black flex flex-col">
      <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between px-4 py-3 bg-gradient-to-b from-black/70 to-transparent">
        <div className="flex items-center gap-2 text-white/80"><QrCode size={15} /><span className="text-sm font-semibold">Scan QR — Adicionar ao aluguer</span></div>
        <button onClick={() => { stop(); onClose() }} className="p-1.5 rounded-full bg-black/30 text-white/70 hover:text-white"><X size={16} /></button>
      </div>
      {camErr ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 text-white/60 text-sm">
          <p>Sem acesso à câmara. Verifica as permissões do browser.</p>
          <button onClick={() => { stop(); onClose() }} className="px-5 py-2 rounded-xl bg-white/10 text-white">Fechar</button>
        </div>
      ) : (
        <div className="relative flex-1 flex items-center justify-center overflow-hidden">
          <video ref={videoRef} className="absolute inset-0 w-full h-full object-cover" muted playsInline autoPlay />
          <canvas ref={canvasRef} className="hidden" />
          <div className="relative w-56 h-56 z-10">
            {[['top-0 left-0','border-t-[3px] border-l-[3px] rounded-tl-xl'],['top-0 right-0','border-t-[3px] border-r-[3px] rounded-tr-xl'],['bottom-0 left-0','border-b-[3px] border-l-[3px] rounded-bl-xl'],['bottom-0 right-0','border-b-[3px] border-r-[3px] rounded-br-xl']].map(([pos, b], i) => (
              <span key={i} className={`absolute ${pos} block w-10 h-10 ${b} border-green-400`} />
            ))}
          </div>
          <p className="absolute bottom-10 left-0 right-0 text-center text-white/60 text-sm">Aponta a câmara para o QR code do equipamento</p>
        </div>
      )}
    </div>
  )
}

// ── Página principal ──────────────────────────────────────────────
export function Alugueres() {
  const [alugueres,    setAlugueres]    = useState([])
  const [colaboradores, setColaboradores] = useState([])
  const [loading,      setLoading]      = useState(true)
  const [filtroEstado, setFiltroEstado] = useState('todos')
  const [busca,        setBusca]        = useState('')

  // Drawer form
  const [drawer,    setDrawer]    = useState(null)   // null | 'criar' | aluguer
  const [form,      setForm]      = useState(FORM_VAZIO)
  const [formItens, setFormItens] = useState([])     // items a criar
  const [aGuardar,  setAGuardar]  = useState(false)
  const [erro,      setErro]      = useState(null)

  // Cliente search
  const [cliBusca,     setCliBusca]     = useState('')
  const [cliResultados, setCLiResultados] = useState([])
  const [cliLoading,   setCLiLoading]   = useState(false)
  const cliTimer = useRef(null)

  // Equipamento search no form
  const [equipBusca,   setEquipBusca]   = useState('')
  const [equipResultados, setEquipResultados] = useState([])
  const [equipQrScan,  setEquipQrScan]  = useState(false)

  // Ações
  const [aConfirmando, setAConfirmando] = useState(null)
  const [aEntrada,     setAEntrada]     = useState(null)

  // Contrato
  const [contrato,  setContrato]  = useState(null)

  // Expande notas aluguer
  const [expandido, setExpandido] = useState(null)

  const carregar = useCallback(async () => {
    setLoading(true)
    try {
      const [als, cols] = await Promise.all([
        alugueresApi.listar(),
        alugueresApi.listarColaboradores(),
      ])
      setAlugueres(als)
      setColaboradores(cols)
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { carregar() }, [carregar])

  // Pesquisa de clientes com debounce
  useEffect(() => {
    clearTimeout(cliTimer.current)
    if (!cliBusca.trim()) { setCLiResultados([]); return }
    cliTimer.current = setTimeout(async () => {
      setCLiLoading(true)
      try { setCLiResultados(await alugueresApi.listarClientes(cliBusca)) }
      catch (e) { console.error(e) }
      finally { setCLiLoading(false) }
    }, 300)
    return () => clearTimeout(cliTimer.current)
  }, [cliBusca])

  // Pesquisa de equipamentos
  useEffect(() => {
    if (!equipBusca.trim()) { setEquipResultados([]); return }
    const t = setTimeout(async () => {
      try { setEquipResultados(await alugueresApi.buscarEquip(equipBusca)) }
      catch (e) { console.error(e) }
    }, 250)
    return () => clearTimeout(t)
  }, [equipBusca])

  // ── Abrir drawer criar ──────────────────────────────────────────
  const abrirCriar = async () => {
    const numero = await alugueresApi.gerarNumero()
    setForm({ ...FORM_VAZIO, numero })
    setFormItens([])
    setCliBusca(''); setCLiResultados([])
    setEquipBusca(''); setEquipResultados([])
    setErro(null)
    setDrawer('criar')
  }

  const abrirEditar = (al) => {
    setForm({
      numero: al.numero,
      cliente_id: al.cliente_id ?? '',
      _clienteBusca: al.aluguer_clientes?.nome ?? '',
      _novoCliente: false,
      _novoCli: { nome: '', telefone: '', email: '', nif: '', morada: '' },
      atendido_por:       al.atendido_por ?? '',
      atendido_por_tel:   al.atendido_por_tel ?? '',
      atendido_por_email: al.atendido_por_email ?? '',
      data_saida_prevista:  al.data_saida_prevista ?? '',
      data_entrada_prevista: al.data_entrada_prevista ?? '',
      local_levantamento: al.local_levantamento ?? 'Praceta Mto Ivo Cruz 12, 1500-401 Lisboa, Portugal',
      local_devolucao:    al.local_devolucao ?? 'Praceta Mto Ivo Cruz 12, 1500-401 Lisboa, Portugal',
      local_utilizacao: al.local_utilizacao ?? '',
      matricula:    al.matricula ?? '',
      caucao_valor: al.caucao_valor ?? '',
      caucao_metodo: al.caucao_metodo ?? '',
      valor_total:  al.valor_total ?? '',
      notas: al.notas ?? '',
    })
    setFormItens((al.aluguer_itens ?? []).map(i => ({
      id: i.id,
      equipamento_id: i.equipamento_id,
      nome: i.equipamentos?.nome ?? '',
      quantidade: i.quantidade ?? 1,
      preco_aplicado: i.preco_aplicado ?? '',
    })))
    setErro(null)
    setDrawer(al)
  }

  const fecharDrawer = () => setDrawer(null)

  // ── Selecionar colaborador → auto-fill tel ──────────────────────
  const selecionarColaborador = (col) => {
    setForm(f => ({
      ...f,
      atendido_por: col.nome,
      atendido_por_tel: col.telefone ?? '',
    }))
  }

  // ── Adicionar item ao form ──────────────────────────────────────
  const adicionarItemForm = (equip) => {
    setFormItens(its => {
      const existe = its.find(i => i.equipamento_id === equip.id)
      if (existe) return its.map(i => i.equipamento_id === equip.id ? { ...i, quantidade: i.quantidade + 1 } : i)
      return [...its, { equipamento_id: equip.id, nome: equip.nome, quantidade: 1, preco_aplicado: equip.valor_aluguer_dia ?? '' }]
    })
    setEquipBusca(''); setEquipResultados([])
  }

  const removerItemForm = (idx) => setFormItens(its => its.filter((_, i) => i !== idx))

  const actualizarItemForm = (idx, campo, val) =>
    setFormItens(its => its.map((it, i) => i === idx ? { ...it, [campo]: val } : it))

  // Auto-calc valor_total
  const valorAutoCalc = formItens.reduce((s, i) => s + (parseFloat(i.preco_aplicado) || 0) * (parseInt(i.quantidade) || 1), 0)

  // ── Guardar aluguer ────────────────────────────────────────────
  const guardar = async () => {
    if (!form.data_saida_prevista) { setErro('Data de saída obrigatória.'); return }
    if (!form.data_entrada_prevista) { setErro('Data de entrada obrigatória.'); return }
    setAGuardar(true); setErro(null)
    try {
      let clienteId = form.cliente_id
      // Criar cliente novo se necessário
      if (form._novoCliente && form._novoCli.nome.trim()) {
        const nc = await alugueresApi.criarCliente({
          nome: form._novoCli.nome.trim(),
          telefone: form._novoCli.telefone || null,
          email: form._novoCli.email || null,
          nif: form._novoCli.nif || null,
          morada: form._novoCli.morada || null,
        })
        clienteId = nc.id
      }
      const dados = {
        numero: form.numero,
        cliente_id: clienteId || null,
        atendido_por: form.atendido_por || null,
        atendido_por_tel: form.atendido_por_tel || null,
        atendido_por_email: form.atendido_por_email || null,
        data_saida_prevista: form.data_saida_prevista,
        data_entrada_prevista: form.data_entrada_prevista,
        local_levantamento: form.local_levantamento || null,
        local_devolucao: form.local_devolucao || null,
        local_utilizacao: form.local_utilizacao || null,
        matricula: form.matricula || null,
        caucao_valor: form.caucao_valor ? parseFloat(form.caucao_valor) : null,
        caucao_metodo: form.caucao_metodo || null,
        valor_total: form.valor_total ? parseFloat(form.valor_total) : (valorAutoCalc || null),
        notas: form.notas || null,
        estado: 'reserva',
      }
      if (drawer === 'criar') {
        const al = await alugueresApi.criar(dados)
        // Criar itens
        for (const item of formItens) {
          await alugueresApi.adicionarItem(al.id, item.equipamento_id, item.quantidade, item.preco_aplicado)
        }
      } else {
        await alugueresApi.actualizar(drawer.id, dados)
        // Gerir itens: remove os que já não estão, adiciona novos
        const idsExistentes = (drawer.aluguer_itens ?? []).map(i => i.id)
        const idsForm = formItens.filter(i => i.id).map(i => i.id)
        for (const id of idsExistentes) {
          if (!idsForm.includes(id)) await alugueresApi.removerItem(id)
        }
        for (const item of formItens.filter(i => !i.id)) {
          await alugueresApi.adicionarItem(drawer.id, item.equipamento_id, item.quantidade, item.preco_aplicado)
        }
        for (const item of formItens.filter(i => i.id)) {
          await alugueresApi.actualizarItem(item.id, { quantidade: item.quantidade, preco_aplicado: item.preco_aplicado })
        }
      }
      fecharDrawer(); await carregar()
    } catch (e) { setErro(e.message ?? 'Erro ao guardar.') }
    finally { setAGuardar(false) }
  }

  // ── Confirmar saída ────────────────────────────────────────────
  const confirmarSaida = async (al) => {
    setAConfirmando(al.id)
    try { await alugueresApi.confirmarSaida(al.id, al.atendido_por); await carregar() }
    catch (e) { alert(e.message ?? 'Erro ao confirmar saída.') }
    finally { setAConfirmando(null) }
  }

  // ── Registar entrada ───────────────────────────────────────────
  const registarEntrada = async (al) => {
    setAEntrada(al.id)
    try { await alugueresApi.registarEntrada(al.id, al.atendido_por); await carregar() }
    catch (e) { alert(e.message ?? 'Erro ao registar entrada.') }
    finally { setAEntrada(null) }
  }

  // ── Cancelar ───────────────────────────────────────────────────
  const cancelar = async (al) => {
    if (!window.confirm(`Cancelar aluguer ${al.numero}?`)) return
    try { await alugueresApi.cancelar(al.id); await carregar() }
    catch (e) { alert(e.message ?? 'Erro.') }
  }

  // ── Filtros ────────────────────────────────────────────────────
  const filtrados = alugueres.filter(al => {
    const matchEstado = filtroEstado === 'todos' || al.estado === filtroEstado
    const matchBusca  = !busca || [al.numero, al.aluguer_clientes?.nome, al.atendido_por]
      .some(s => s?.toLowerCase().includes(busca.toLowerCase()))
    return matchEstado && matchBusca
  })

  const stats = {
    total:    alugueres.length,
    em_curso: alugueres.filter(a => a.estado === 'em_curso').length,
    reserva:  alugueres.filter(a => a.estado === 'reserva').length,
    valor:    alugueres.filter(a => a.estado === 'em_curso')
                .reduce((s, a) => s + (parseFloat(a.valor_total) || 0), 0),
  }

  const FILTROS = [
    { key: 'todos',    label: 'Todos' },
    { key: 'reserva',  label: 'Reserva' },
    { key: 'em_curso', label: 'Em curso' },
    { key: 'concluido',label: 'Concluído' },
    { key: 'cancelado',label: 'Cancelado' },
  ]

  return (
    <div className="p-6 max-w-6xl mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between mb-5 gap-3">
        <h2 className="text-lg font-bold text-accent tracking-wide flex items-center gap-2">
          <Handshake size={18} className="text-status-confirmado" />
          Alugueres
        </h2>
        <div className="flex items-center gap-2">
          <button onClick={carregar} className="p-1.5 rounded hover:bg-surface-2 text-accent-subtle hover:text-accent transition-colors"><RefreshCw size={13} /></button>
          <button onClick={abrirCriar}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-status-confirmado/15 border border-status-confirmado/30 text-status-confirmado text-xs font-semibold hover:bg-status-confirmado/25 transition-colors">
            <Plus size={13} /> Novo aluguer
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        {[
          { label: 'Total',    val: stats.total,    cor: 'text-accent' },
          { label: 'Reservas', val: stats.reserva,  cor: 'text-blue-300' },
          { label: 'Em curso', val: stats.em_curso, cor: 'text-amber-400' },
          { label: 'Valor em curso', val: `${stats.valor.toFixed(2)} €`, cor: 'text-status-confirmado' },
        ].map(s => (
          <div key={s.label} className="bg-surface-1 border border-border rounded-xl px-4 py-3">
            <p className="text-[10px] font-semibold text-accent-subtle uppercase tracking-widest mb-1">{s.label}</p>
            <p className={clsx('text-xl font-bold tabular-nums', s.cor)}>{loading ? '—' : s.val}</p>
          </div>
        ))}
      </div>

      {/* Filtros e busca */}
      <div className="flex items-center gap-3 mb-5 flex-wrap">
        <div className="flex gap-1 flex-wrap">
          {FILTROS.map(f => (
            <button key={f.key} onClick={() => setFiltroEstado(f.key)}
              className={clsx('px-3 py-1 rounded-md text-xs font-medium border transition-colors',
                filtroEstado === f.key
                  ? 'bg-status-confirmado/15 border-status-confirmado/40 text-status-confirmado'
                  : 'border-border text-accent-muted hover:text-accent hover:bg-surface-2')}>
              {f.label}
              {f.key !== 'todos' && (
                <span className="ml-1.5 text-[10px] opacity-60">
                  {alugueres.filter(a => a.estado === f.key).length}
                </span>
              )}
            </button>
          ))}
        </div>
        <div className="relative ml-auto">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-accent-subtle" />
          <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Nº, cliente, atendido por…"
            className="pl-8 pr-3 py-1.5 bg-surface-1 border border-border rounded-lg text-xs text-accent placeholder-accent-subtle focus:outline-none focus:border-white/20 w-52" />
        </div>
      </div>

      {/* Lista */}
      {loading ? (
        <div className="text-center py-16 text-accent-subtle text-sm">A carregar…</div>
      ) : filtrados.length === 0 ? (
        <div className="text-center py-16 text-accent-subtle">
          <Handshake size={32} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">Nenhum aluguer encontrado.</p>
          <button onClick={abrirCriar} className="mt-3 text-xs text-status-confirmado hover:underline">+ Novo aluguer</button>
        </div>
      ) : (
        <div className="rounded-xl overflow-hidden border border-border">
          {/* Desktop table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-xs border-collapse min-w-[760px]">
              <thead>
                <tr className="border-b border-border bg-surface-0">
                  <th className="text-left px-4 py-2.5 font-semibold uppercase tracking-wider text-[10px] text-accent-subtle">Nº</th>
                  <th className="text-left px-3 py-2.5 font-semibold uppercase tracking-wider text-[10px] text-accent-subtle">Cliente</th>
                  <th className="text-left px-3 py-2.5 font-semibold uppercase tracking-wider text-[10px] text-accent-subtle">Saída prevista</th>
                  <th className="text-left px-3 py-2.5 font-semibold uppercase tracking-wider text-[10px] text-accent-subtle">Entrada prevista</th>
                  <th className="text-left px-3 py-2.5 font-semibold uppercase tracking-wider text-[10px] text-accent-subtle">Estado</th>
                  <th className="text-right px-3 py-2.5 font-semibold uppercase tracking-wider text-[10px] text-accent-subtle">Valor</th>
                  <th className="px-3 py-2.5 w-44" />
                </tr>
              </thead>
              <tbody>
                {filtrados.map(al => (
                  <Fragment key={al.id}>
                    <tr className="border-b border-border/40 hover:bg-surface-2 transition-colors group">
                      <td className="px-4 py-2.5 font-mono text-[10px] text-accent-muted">{al.numero}</td>
                      <td className="px-3 py-2.5">
                        <div className="font-semibold text-accent">{al.aluguer_clientes?.nome ?? <span className="text-accent-subtle italic">—</span>}</div>
                        {al.aluguer_clientes?.telefone && <div className="text-[10px] text-accent-muted">{al.aluguer_clientes.telefone}</div>}
                      </td>
                      <td className="px-3 py-2.5 tabular-nums text-accent-muted">{fmtDia(al.data_saida_prevista)}</td>
                      <td className="px-3 py-2.5 tabular-nums text-accent-muted">{fmtDia(al.data_entrada_prevista)}</td>
                      <td className="px-3 py-2.5"><EstadoBadge estado={al.estado} /></td>
                      <td className="px-3 py-2.5 text-right tabular-nums font-semibold text-accent">
                        {al.valor_total ? `${parseFloat(al.valor_total).toFixed(2)} €` : '—'}
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-1 justify-end">
                          <button onClick={() => setContrato(al)} title="Ver contrato"
                            className="p-1.5 rounded hover:bg-surface-3 text-accent-subtle hover:text-accent transition-colors">
                            <Printer size={12} />
                          </button>
                          {al.estado === 'reserva' && (
                            <>
                              <button onClick={() => confirmarSaida(al)} disabled={aConfirmando === al.id}
                                title="Confirmar saída"
                                className="flex items-center gap-1 px-2 py-1 rounded border text-[10px] font-semibold bg-amber-500/10 border-amber-500/30 text-amber-400 hover:bg-amber-500/20 disabled:opacity-40 transition-colors">
                                <LogOut size={10} /> Saída
                              </button>
                              <button onClick={() => abrirEditar(al)} title="Editar"
                                className="p-1.5 rounded hover:bg-surface-3 text-accent-subtle hover:text-accent transition-colors">
                                <Pencil size={12} />
                              </button>
                              <button onClick={() => cancelar(al)} title="Cancelar aluguer"
                                className="p-1.5 rounded hover:bg-surface-3 text-accent-subtle hover:text-red-400 transition-colors">
                                <X size={12} />
                              </button>
                            </>
                          )}
                          {al.estado === 'em_curso' && (
                            <button onClick={() => registarEntrada(al)} disabled={aEntrada === al.id}
                              title="Registar entrada"
                              className="flex items-center gap-1 px-2 py-1 rounded border text-[10px] font-semibold bg-blue-500/10 border-blue-500/30 text-blue-400 hover:bg-blue-500/20 disabled:opacity-40 transition-colors">
                              <LogIn size={10} /> Entrada
                            </button>
                          )}
                          <button onClick={() => setExpandido(expandido === al.id ? null : al.id)}
                            className="p-1.5 rounded hover:bg-surface-3 text-accent-subtle hover:text-accent transition-colors">
                            {expandido === al.id ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                          </button>
                        </div>
                      </td>
                    </tr>
                    {/* Expandido: itens e notas */}
                    {expandido === al.id && (
                      <tr className="bg-surface-0">
                        <td colSpan={7} className="px-4 py-3">
                          <div className="flex gap-6 flex-wrap">
                            {/* Itens */}
                            <div className="flex-1 min-w-[200px]">
                              <p className="text-[10px] font-bold uppercase tracking-wider text-accent-subtle mb-2">Equipamentos</p>
                              {(al.aluguer_itens ?? []).length === 0
                                ? <p className="text-[10px] text-accent-subtle italic">Sem itens.</p>
                                : (al.aluguer_itens ?? []).map(it => (
                                    <div key={it.id} className="flex justify-between text-[10px] text-accent-muted border-b border-border/20 py-1 last:border-0">
                                      <span>{it.equipamentos?.nome ?? '—'} × {it.quantidade}</span>
                                      <span className="tabular-nums">{it.preco_aplicado != null ? `${parseFloat(it.preco_aplicado).toFixed(2)} €` : '—'}</span>
                                    </div>
                                  ))}
                            </div>
                            {/* Detalhes */}
                            <div className="text-[10px] text-accent-muted space-y-1">
                              {al.local_utilizacao && <p><strong>Local de uso:</strong> {al.local_utilizacao}</p>}
                              {al.matricula && <p><strong>Matrícula:</strong> {al.matricula}</p>}
                              {al.atendido_por && <p><strong>Atendido por:</strong> {al.atendido_por} {al.atendido_por_tel ? `· ${al.atendido_por_tel}` : ''}</p>}
                              {al.caucao_valor && <p><strong>Caução:</strong> {parseFloat(al.caucao_valor).toFixed(2)} € ({al.caucao_metodo ?? '—'})</p>}
                              {al.notas && <p><strong>Notas:</strong> {al.notas}</p>}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden divide-y divide-border/40">
            {filtrados.map(al => (
              <div key={al.id} className="px-4 py-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-mono text-[10px] text-accent-subtle">{al.numero}</span>
                      <EstadoBadge estado={al.estado} />
                    </div>
                    <div className="font-semibold text-accent text-sm">{al.aluguer_clientes?.nome ?? '—'}</div>
                    <div className="text-[11px] text-accent-muted mt-0.5">
                      {fmtDia(al.data_saida_prevista)} → {fmtDia(al.data_entrada_prevista)}
                    </div>
                    {al.valor_total && <div className="text-[11px] font-semibold text-status-confirmado mt-0.5">{parseFloat(al.valor_total).toFixed(2)} €</div>}
                  </div>
                  <div className="flex flex-col gap-1 shrink-0">
                    <button onClick={() => setContrato(al)} className="p-1.5 rounded border border-border text-accent-subtle hover:text-accent transition-colors"><Printer size={13} /></button>
                    {al.estado === 'reserva' && (
                      <button onClick={() => confirmarSaida(al)} disabled={aConfirmando === al.id}
                        className="p-1.5 rounded border border-amber-500/30 text-amber-400 hover:bg-amber-500/10 transition-colors disabled:opacity-40">
                        <LogOut size={13} />
                      </button>
                    )}
                    {al.estado === 'em_curso' && (
                      <button onClick={() => registarEntrada(al)} disabled={aEntrada === al.id}
                        className="p-1.5 rounded border border-blue-500/30 text-blue-400 hover:bg-blue-500/10 transition-colors disabled:opacity-40">
                        <LogIn size={13} />
                      </button>
                    )}
                    {al.estado === 'reserva' && (
                      <button onClick={() => abrirEditar(al)} className="p-1.5 rounded border border-border text-accent-subtle hover:text-accent transition-colors"><Pencil size={13} /></button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Modal form ──────────────────────────────────────────── */}
      {drawer !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={fecharDrawer} />
          <div className="relative w-full max-w-2xl bg-surface-1 border border-border flex flex-col max-h-[90vh] rounded-2xl shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
              <h3 className="text-sm font-bold text-accent uppercase tracking-wider">
                {drawer === 'criar' ? 'Novo aluguer' : `Editar — ${form.numero}`}
              </h3>
              <button onClick={fecharDrawer} className="p-1 rounded hover:bg-surface-2 text-accent-subtle hover:text-accent transition-colors"><X size={16} /></button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">

              {/* Número */}
              <div>
                <label className={lbl}>Nº Aluguer</label>
                <input value={form.numero} readOnly className={inpCls + ' font-mono opacity-70 cursor-default'} />
              </div>

              {/* ── Cliente ── */}
              <section>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-accent-subtle">Cliente</p>
                  <button onClick={() => setForm(f => ({ ...f, _novoCliente: !f._novoCliente, cliente_id: '', _clienteBusca: '' }))}
                    className="flex items-center gap-1 text-[10px] text-status-confirmado hover:underline">
                    <UserPlus size={11} />
                    {form._novoCliente ? 'Usar existente' : 'Novo cliente'}
                  </button>
                </div>

                {form._novoCliente ? (
                  <div className="space-y-2 border border-border/60 rounded-lg p-3 bg-surface-2/30">
                    <p className="text-[10px] text-accent-muted font-semibold">Dados do novo cliente</p>
                    {[['nome','Nome *'],['telefone','Telemovel'],['email','E-mail'],['nif','NIF'],['morada','Morada']].map(([k,lb]) => (
                      <div key={k}>
                        <label className={lbl}>{lb}</label>
                        <input value={form._novoCli[k]} onChange={e => setForm(f => ({ ...f, _novoCli: { ...f._novoCli, [k]: e.target.value } }))}
                          className={inpCls} placeholder={lb} />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="relative">
                    <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-accent-subtle" />
                    <input
                      value={form.cliente_id ? form._clienteBusca : cliBusca}
                      onChange={e => {
                        if (form.cliente_id) {
                          setForm(f => ({ ...f, cliente_id: '', _clienteBusca: e.target.value }))
                          setCliBusca(e.target.value)
                        } else {
                          setCliBusca(e.target.value)
                          setForm(f => ({ ...f, _clienteBusca: e.target.value }))
                        }
                      }}
                      placeholder="Pesquisar cliente…"
                      className={inpCls + ' pl-8'} />
                    {form.cliente_id && (
                      <div className="flex items-center gap-1 mt-1 text-[10px] text-status-confirmado">
                        <Check size={10} /> Cliente seleccionado: <strong>{form._clienteBusca}</strong>
                        <button onClick={() => { setForm(f => ({ ...f, cliente_id: '', _clienteBusca: '' })); setCliBusca('') }} className="ml-1 text-accent-subtle hover:text-red-400"><X size={10} /></button>
                      </div>
                    )}
                    {!form.cliente_id && cliResultados.length > 0 && (
                      <div className="absolute top-9 left-0 right-0 z-20 bg-surface-2 border border-border rounded-lg shadow-lg max-h-44 overflow-y-auto">
                        {cliLoading ? <p className="text-center py-3 text-[11px] text-accent-subtle">A pesquisar…</p>
                          : cliResultados.map(c => (
                            <button key={c.id} type="button"
                              onMouseDown={() => { setForm(f => ({ ...f, cliente_id: c.id, _clienteBusca: c.nome })); setCliBusca(''); setCLiResultados([]) }}
                              className="w-full text-left px-3 py-2 text-[11px] text-accent hover:bg-surface-3 transition-colors border-b border-border/20 last:border-0">
                              <strong>{c.nome}</strong>
                              {c.telefone && <span className="text-accent-subtle ml-2">{c.telefone}</span>}
                            </button>
                          ))}
                      </div>
                    )}
                  </div>
                )}
              </section>

              {/* ── Datas ── */}
              <section>
                <p className="text-[10px] font-bold uppercase tracking-wider text-accent-subtle mb-2">Datas</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={lbl}>Data saída *</label>
                    <input type="date" value={form.data_saida_prevista} onChange={e => setForm(f => ({ ...f, data_saida_prevista: e.target.value }))} className={inpCls} />
                  </div>
                  <div>
                    <label className={lbl}>Data entrada *</label>
                    <input type="date" value={form.data_entrada_prevista} onChange={e => setForm(f => ({ ...f, data_entrada_prevista: e.target.value }))} className={inpCls} />
                  </div>
                </div>
              </section>

              {/* ── Locais ── */}
              <section>
                <p className="text-[10px] font-bold uppercase tracking-wider text-accent-subtle mb-2">Locais</p>
                <div className="space-y-2">
                  <div>
                    <label className={lbl}>Levantamento</label>
                    <input value={form.local_levantamento} onChange={e => setForm(f => ({ ...f, local_levantamento: e.target.value }))} className={inpCls} />
                  </div>
                  <div>
                    <label className={lbl}>Entrega (se diferente)</label>
                    <input value={form.local_devolucao} onChange={e => setForm(f => ({ ...f, local_devolucao: e.target.value }))} className={inpCls} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={lbl}>Local de utilização</label>
                      <input value={form.local_utilizacao} onChange={e => setForm(f => ({ ...f, local_utilizacao: e.target.value }))} className={inpCls} placeholder="Endereço do evento…" />
                    </div>
                    <div>
                      <label className={lbl}>Matrícula</label>
                      <input value={form.matricula} onChange={e => setForm(f => ({ ...f, matricula: e.target.value }))} className={inpCls} placeholder="XX-00-XX" />
                    </div>
                  </div>
                </div>
              </section>

              {/* ── Atendido por ── */}
              <section>
                <p className="text-[10px] font-bold uppercase tracking-wider text-accent-subtle mb-2">Atendido por</p>
                <div className="flex gap-2 flex-wrap mb-2">
                  {colaboradores.map(c => (
                    <button key={c.id} type="button" onClick={() => selecionarColaborador(c)}
                      className={clsx('px-2.5 py-1 rounded-lg border text-xs transition-colors',
                        form.atendido_por === c.nome
                          ? 'bg-status-confirmado/15 border-status-confirmado/40 text-status-confirmado'
                          : 'border-border text-accent-muted hover:text-accent hover:bg-surface-2')}>
                      {c.nome}
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={lbl}>Nome</label>
                    <input value={form.atendido_por} onChange={e => setForm(f => ({ ...f, atendido_por: e.target.value }))} className={inpCls} placeholder="Nome…" />
                  </div>
                  <div>
                    <label className={lbl}>Tel</label>
                    <input value={form.atendido_por_tel} onChange={e => setForm(f => ({ ...f, atendido_por_tel: e.target.value }))} className={inpCls} placeholder="9xx xxx xxx" />
                  </div>
                </div>
                <div className="mt-2">
                  <label className={lbl}>E-mail</label>
                  <input value={form.atendido_por_email} onChange={e => setForm(f => ({ ...f, atendido_por_email: e.target.value }))} className={inpCls} placeholder="email@…" />
                </div>
              </section>

              {/* ── Equipamentos ── */}
              <section>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-accent-subtle">Equipamentos</p>
                  <button onClick={() => setEquipQrScan(true)}
                    className="flex items-center gap-1 text-[10px] text-amber-400 hover:underline">
                    <QrCode size={11} /> Scan QR
                  </button>
                </div>

                {/* Pesquisa text */}
                <div className="relative mb-3">
                  <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-accent-subtle" />
                  <input value={equipBusca} onChange={e => setEquipBusca(e.target.value)}
                    placeholder="Pesquisar equipamento por nome…"
                    className={inpCls + ' pl-8'} />
                  {equipResultados.length > 0 && (
                    <div className="absolute top-9 left-0 right-0 z-20 bg-surface-2 border border-border rounded-lg shadow-lg max-h-40 overflow-y-auto">
                      {equipResultados.map(eq => (
                        <button key={eq.id} type="button"
                          onMouseDown={() => adicionarItemForm(eq)}
                          className="w-full text-left px-3 py-1.5 text-[11px] text-accent hover:bg-surface-3 transition-colors border-b border-border/20 last:border-0">
                          {eq.nome}
                          {eq.valor_aluguer_dia > 0 && <span className="text-accent-subtle ml-2">{parseFloat(eq.valor_aluguer_dia).toFixed(2)} €/dia</span>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Lista de itens */}
                {formItens.length > 0 && (
                  <div className="space-y-2">
                    {formItens.map((it, idx) => (
                      <div key={idx} className="flex items-center gap-2 bg-surface-2/50 rounded-lg px-3 py-2 border border-border/40">
                        <span className="flex-1 text-[11px] font-medium text-accent truncate">{it.nome}</span>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <div>
                            <label className="text-[9px] text-accent-subtle block">Qtd</label>
                            <input type="number" min="1" value={it.quantidade}
                              onChange={e => actualizarItemForm(idx, 'quantidade', parseInt(e.target.value) || 1)}
                              className="w-14 bg-surface-2 border border-border rounded px-2 py-0.5 text-xs text-accent text-center" />
                          </div>
                          <div>
                            <label className="text-[9px] text-accent-subtle block">Preço total (€)</label>
                            <input type="number" min="0" step="0.01" value={it.preco_aplicado}
                              onChange={e => actualizarItemForm(idx, 'preco_aplicado', e.target.value)}
                              className="w-20 bg-surface-2 border border-border rounded px-2 py-0.5 text-xs text-accent text-right" />
                          </div>
                          <button onClick={() => removerItemForm(idx)} className="p-1 rounded hover:bg-surface-3 text-accent-subtle hover:text-red-400 transition-colors mt-3"><Trash2 size={12} /></button>
                        </div>
                      </div>
                    ))}
                    <div className="text-right text-xs font-semibold text-status-confirmado pr-1">
                      Subtotal: {valorAutoCalc.toFixed(2)} €
                    </div>
                  </div>
                )}
              </section>

              {/* ── Valor e Caução ── */}
              <section>
                <p className="text-[10px] font-bold uppercase tracking-wider text-accent-subtle mb-2">Pagamento</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={lbl}>Valor total (€)</label>
                    <input type="number" step="0.01" min="0" value={form.valor_total}
                      onChange={e => setForm(f => ({ ...f, valor_total: e.target.value }))}
                      placeholder={valorAutoCalc > 0 ? `Auto: ${valorAutoCalc.toFixed(2)}` : '0.00'}
                      className={inpCls + ' text-right'} />
                  </div>
                  <div>
                    <label className={lbl}>Caução (€)</label>
                    <input type="number" step="0.01" min="0" value={form.caucao_valor}
                      onChange={e => setForm(f => ({ ...f, caucao_valor: e.target.value }))}
                      className={inpCls + ' text-right'} />
                  </div>
                </div>
                <div className="mt-2">
                  <label className={lbl}>Método de caução</label>
                  <select value={form.caucao_metodo} onChange={e => setForm(f => ({ ...f, caucao_metodo: e.target.value }))} className={inpCls}>
                    <option value="">— Selecionar —</option>
                    {['Dinheiro','MBWay','Transferência','Cheque','Cartão','Outro'].map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
              </section>

              {/* Notas */}
              <div>
                <label className={lbl}>Notas</label>
                <textarea value={form.notas} onChange={e => setForm(f => ({ ...f, notas: e.target.value }))}
                  rows={3} placeholder="Observações…" className={inpCls + ' resize-none'} />
              </div>

              {erro && <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{erro}</p>}
            </div>

            <div className="shrink-0 px-5 py-4 border-t border-border flex justify-end gap-2">
              <button onClick={fecharDrawer} className="px-4 py-2 rounded-lg border border-border text-xs text-accent-muted hover:text-accent hover:bg-surface-2 transition-colors">Cancelar</button>
              <button onClick={guardar} disabled={aGuardar}
                className="px-5 py-2 rounded-lg bg-status-confirmado/15 border border-status-confirmado/30 text-status-confirmado text-xs font-semibold hover:bg-status-confirmado/25 disabled:opacity-50 transition-colors">
                {aGuardar ? 'A guardar…' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* QR picker para form */}
      {equipQrScan && (
        <QrPickerModal
          onFound={async (qrCode) => {
            setEquipQrScan(false)
            try {
              const eq = await alugueresApi.buscarEquipPorQr(qrCode)
              if (eq) adicionarItemForm(eq)
              else alert(`Código "${qrCode}" não encontrado no catálogo.`)
            } catch (e) { console.error(e) }
          }}
          onClose={() => setEquipQrScan(false)}
        />
      )}

      {/* Contrato */}
      {contrato && <ContratoAluguer aluguer={contrato} onClose={() => setContrato(null)} />}
    </div>
  )
}
