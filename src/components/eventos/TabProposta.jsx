import { useState, useEffect, useRef } from 'react'
import { Plus, Trash2, Printer, GripVertical, Minus } from 'lucide-react'
import { gerarHTMLProposta } from './propostaHtml'
import { clsx } from 'clsx'

const inputCls = 'w-full bg-surface-2 border border-border rounded px-3 py-2 text-xs text-accent placeholder:text-accent-subtle/40 focus:outline-none focus:border-white/30 focus:bg-surface-3 transition-colors'
const UNIDADES = ['Uni.', 'Serv.', 'Hr', 'Dia', 'm', 'm²']

function gerarNumeroProposta() {
  const now = new Date()
  const dd = String(now.getDate()).padStart(2, '0')
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  const yy = String(now.getFullYear()).slice(2)
  const hh = String(now.getHours()).padStart(2, '0')
  return `P${dd}${mm}${yy}${hh}`
}

function fmtEuro(val) {
  return Number(val || 0).toLocaleString('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '€'
}

function linhaVazia() {
  return { descricao: '', observacoes: '', qtd: 1, unidade: 'Uni.', preco: '' }
}

function separadorVazio() {
  return { _separador: true, label: '' }
}

export function TabProposta({ evento, espacos = [], equipRows = {}, equipamentosList = [], atuacoes = [], notasTecnicasInicial = '', notasPropostaInicial = '', linhasIniciais = null, onNotasChange, onLinhasChange, onRemoveEquip, onUpdateEquip, onUpdateAtuacao, linhasRef }) {
  const [linhas, setLinhas] = useState([linhaVazia()])
  const [notasTecnicas, setNotasTecnicas] = useState(notasTecnicasInicial)
  const [notasProposta, setNotasProposta] = useState(notasPropostaInicial)
  const [comIva, setComIva] = useState(true)
  const hasInit = useRef(false)

  // Manter ref sempre actualizada com o estado visual mais recente
  useEffect(() => {
    if (linhasRef) linhasRef.current = linhas
  }, [linhas, linhasRef])

  function linhasDeAtuacoes(slots) {
    return slots.map(s => ({
      _artistaKey: `slot_${s.id}`,
      descricao: s.djs?.nome_artistico || s.djs?.nome || s.dj_nome || 'Artista',
      observacoes: s.notas ?? '',
      qtd: 1,
      unidade: 'Serv.',
      preco: s.valor_total_cliente != null ? String(s.valor_total_cliente) : (s.valor != null ? String(s.valor) : ''),
    }))
  }

  // Reset quando o evento muda — usa linhas gravadas ou gera do zero
  useEffect(() => {
    setNotasTecnicas(notasTecnicasInicial || '')
    setNotasProposta(notasPropostaInicial || '')
    setClienteEditado(espaco?.nome || '')

    if (linhasIniciais && linhasIniciais.length > 0) {
      hasInit.current = true
      setLinhas(linhasIniciais.map(l =>
        l.tipo === 'separador' ? { _separador: true, label: l.label || '' } : l
      ))
    } else {
      hasInit.current = false
      const techTotal = (Number(evento?.valor_apoio_tecnico) || 0) + (Number(evento?.valor_apoio_tecnico_2) || 0)
      const transporteVal = Number(evento?.transporte) || 0
      const extras = []
      const alimentacaoVal = Number(evento?.valor_alimentacao) || 0
      if (techTotal > 0) extras.push({ descricao: 'Instalação e Apoio Técnico', observacoes: '', qtd: 1, unidade: 'Serv.', preco: String(techTotal) })
      if (transporteVal > 0) extras.push({ descricao: 'Transporte', observacoes: '', qtd: 1, unidade: 'Serv.', preco: String(transporteVal) })
      if (alimentacaoVal > 0) extras.push({ descricao: 'Alimentação', observacoes: '', qtd: 1, unidade: 'Serv.', preco: String(alimentacaoVal) })
      setLinhas(extras.length > 0 ? extras : [linhaVazia()])
    }
  }, [evento?.id])

  // Pré-popular com equipamentos quando chegam — inseridos depois do artista, antes das linhas base
  useEffect(() => {
    if (hasInit.current) return
    const proprios = equipRows.proprio ?? []
    if (proprios.length > 0) {
      hasInit.current = true
      const linhasEquip = proprios.map(r => ({
        _equipKey: r._key,
        descricao: equipamentosList.find(e => e.id === r.equipamento_id)?.nome || r.descricao || '',
        observacoes: r.observacoes || '',
        qtd: r.unidades || 1,
        unidade: 'Uni.',
        preco: r.valor_custo !== '' && r.valor_custo != null ? String(r.valor_custo) : '',
      }))
      setLinhas(prev => {
        const artLines = prev.filter(l => l._artistaKey)
        const rest = prev.filter(l => !l._artistaKey)
        return [...artLines, ...linhasEquip, ...rest]
      })
    }
  }, [equipRows.proprio?.length])

  // Sincronizar linhas de artista quando atuações mudam
  const artistaSyncKey = atuacoes.map(s => `${s.id}:${s.valor_total_cliente ?? s.valor}:${s.notas ?? ''}`).join('|')
  useEffect(() => {
    setLinhas(prev => {
      const artLines = linhasDeAtuacoes(atuacoes)
      const existingArtKeys = new Set(prev.filter(l => l._artistaKey).map(l => l._artistaKey))

      if (existingArtKeys.size > 0) {
        // Artistas já posicionados — actualizar só descricao/preco, preservar observacoes do utilizador
        const artMap = Object.fromEntries(artLines.map(l => [l._artistaKey, l]))
        return prev.map(l => {
          if (!l._artistaKey) return l
          const fresh = artMap[l._artistaKey]
          return fresh ? { ...l, descricao: fresh.descricao, preco: fresh.preco } : l
        })
      }

      // Nenhum artista guardado ainda — colocar no topo
      const withoutArtista = prev.filter(l => !l._artistaKey)
      if (artLines.length === 0) return withoutArtista.length > 0 ? withoutArtista : [linhaVazia()]
      return [...artLines, ...withoutArtista]
    })
  }, [artistaSyncKey])

  // Sincronizar linhas de equipamento quando Equipamentos tab muda (após init)
  const equipSyncKey = (equipRows.proprio ?? [])
    .map(r => `${r._key}:${r.equipamento_id || ''}:${r.descricao}:${r.unidades}`)
    .join('|')
  useEffect(() => {
    if (!hasInit.current) return
    const proprios = equipRows.proprio ?? []
    setLinhas(prev => {
      const updated = prev.map(l => {
        if (!l._equipKey) return l
        const equip = proprios.find(r => r._key === l._equipKey)
        if (equip) {
          const newDesc = equipamentosList.find(e => e.id === equip.equipamento_id)?.nome || equip.descricao || l.descricao
          const newQtd = equip.unidades || 1
          const newObs = equip.observacoes ?? ''
          if (newDesc === l.descricao && newQtd === l.qtd && newObs === l.observacoes) return l
          return { ...l, descricao: newDesc, qtd: newQtd, observacoes: newObs }
        }
        // Sem correspondência por _key — tentar por descrição para associar ao equipamento real
        const lDesc = (l.descricao || '').toLowerCase().trim()
        const equipByDesc = proprios.find(r => {
          const rDesc = (equipamentosList.find(e => e.id === r.equipamento_id)?.nome || r.descricao || '').toLowerCase().trim()
          return rDesc === lDesc
        })
        if (equipByDesc) {
          const newDesc = equipamentosList.find(e => e.id === equipByDesc.equipamento_id)?.nome || equipByDesc.descricao || l.descricao
          const newQtd = equipByDesc.unidades || 1
          const newObs = equipByDesc.observacoes ?? ''
          return { ...l, _equipKey: equipByDesc._key, descricao: newDesc, qtd: newQtd, observacoes: newObs }
        }
        return l
      })
      const existingKeys = new Set(updated.filter(l => l._equipKey).map(l => l._equipKey))
      const newLines = proprios
        .filter(r => !existingKeys.has(r._key))
        .map(r => ({
          _equipKey: r._key,
          descricao: equipamentosList.find(e => e.id === r.equipamento_id)?.nome || r.descricao || '',
          observacoes: r.observacoes || '',
          qtd: r.unidades || 1,
          unidade: 'Uni.',
          preco: r.valor_custo !== '' && r.valor_custo != null ? String(r.valor_custo) : '',
        }))
      if (newLines.length === 0) return updated
      const lastEquipIdx = updated.reduce((last, l, i) => l._equipKey ? i : last, -1)
      return [
        ...updated.slice(0, lastEquipIdx + 1),
        ...newLines,
        ...updated.slice(lastEquipIdx + 1),
      ]
    })
  }, [equipSyncKey])

  function adicionarLinha() {
    const next = [...linhas, linhaVazia()]
    setLinhas(next)
    onLinhasChange?.(next)
  }

  function removerLinha(i) {
    const linha = linhas[i]
    if (linha?._equipKey) onRemoveEquip?.(linha._equipKey)
    const next = linhas.filter((_, idx) => idx !== i)
    setLinhas(next)
    onLinhasChange?.(next)
  }

  function setLinha(i, campo, valor) {
    const next = linhas.map((l, idx) => idx === i ? { ...l, [campo]: valor } : l)
    setLinhas(next)
    onLinhasChange?.(next)
    const linha = linhas[i]
    if (linha?._equipKey && (campo === 'descricao' || campo === 'qtd' || campo === 'observacoes')) {
      const dbCampo = campo === 'descricao' ? 'descricao' : campo === 'qtd' ? 'unidades' : 'observacoes'
      onUpdateEquip?.(linha._equipKey, dbCampo, valor)
    }
    if (linha?._artistaKey && campo === 'observacoes') {
      onUpdateAtuacao?.(linha._artistaKey, valor)
    }
  }

  function adicionarSeparador() {
    const next = [...linhas, separadorVazio()]
    setLinhas(next)
    onLinhasChange?.(next)
  }

  function moverLinha(from, to) {
    if (from === to || from == null || to == null) return
    const next = [...linhas]
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    setLinhas(next)
    setDragIdx(null)
    setDragOverIdx(null)
    onLinhasChange?.(next)
  }

  const nomeEvento = evento?.evento || ''
  const espaco = espacos.find(e => String(e.id) === String(evento?.espaco_id)) || null
  const [clienteEditado, setClienteEditado] = useState(espaco?.nome || '')
  const [modoServicos,  setModoServicos]  = useState(false)
  const [dragIdx,      setDragIdx]      = useState(null)
  const [dragOverIdx,  setDragOverIdx]  = useState(null)

  function imprimir() {
    const logoUrl = window.location.origin + '/logo-x.png'
    const html = gerarHTMLProposta({
      linhas,
      notasTecnicas,
      notasProposta,
      evento,
      espaco,
      numeroProposta: gerarNumeroProposta(),
      logoUrl,
      comIva,
      nomeEvento,
      nomeCliente: clienteEditado,
      modoServicos,
    })
    const win = window.open('', '_blank', 'width=900,height=700')
    win.document.write(html)
    win.document.close()
  }

  const subtotal = linhas.reduce((s, l) => s + (Number(l.preco) || 0) * (Number(l.qtd) || 1), 0)
  const iva = comIva ? subtotal * 0.23 : 0
  const total = subtotal + iva

  return (
    <div className="flex flex-col gap-4">

      {/* Controlos topo */}
      <div className="flex items-center justify-between gap-3">
        {/* Toggle IVA */}
        <div className="flex items-center gap-1 p-0.5 bg-surface-2 border border-border rounded-lg">
          <button
            onClick={() => setComIva(true)}
            className={clsx(
              'px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
              comIva ? 'bg-surface-3 text-accent' : 'text-accent-muted hover:text-accent'
            )}
          >
            Com IVA
          </button>
          <button
            onClick={() => setComIva(false)}
            className={clsx(
              'px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
              !comIva ? 'bg-surface-3 text-accent' : 'text-accent-muted hover:text-accent'
            )}
          >
            Sem IVA
          </button>
        </div>

        {/* Botão imprimir + toggle cabeçalho */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setModoServicos(v => !v)}
            title={modoServicos ? 'Cabeçalho: Artistas & Serviços' : 'Cabeçalho: Artistas Xclusivos'}
            className={clsx(
              'px-3 py-2 rounded-lg border text-xs font-semibold transition-colors',
              modoServicos
                ? 'bg-blue-500/15 border-blue-500/40 text-blue-300'
                : 'bg-surface-2 border-border text-accent-muted hover:text-accent'
            )}
          >
            {modoServicos ? 'A&S' : 'AX'}
          </button>
          <button
            onClick={imprimir}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-accent/10 border border-accent/20 text-accent text-xs font-semibold hover:bg-accent/20 transition-colors"
          >
            <Printer size={14} />
            Imprimir Proposta
          </button>
        </div>
      </div>

      {/* Evento + Cliente */}
      {(nomeEvento || clienteEditado) && (
        <div className="flex gap-6 px-1">
          {nomeEvento && (
            <div>
              <div className="text-[10px] font-medium text-accent-subtle uppercase tracking-wider mb-0.5">Evento</div>
              <div className="text-xs text-accent">{nomeEvento}</div>
            </div>
          )}
          <div>
            <div className="text-[10px] font-medium text-accent-subtle uppercase tracking-wider mb-0.5">Cliente</div>
            <input
              className={inputCls}
              value={clienteEditado}
              onChange={e => setClienteEditado(e.target.value)}
              placeholder="Nome do cliente…"
            />
          </div>
        </div>
      )}

      {/* Tabela de linhas */}
      <div className="bg-surface-1 border border-border rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <span className="text-xs font-semibold text-accent">Itens da Proposta</span>
          <div className="flex items-center gap-3">
            <button
              onClick={adicionarSeparador}
              className="flex items-center gap-1.5 text-xs text-accent-muted hover:text-accent transition-colors"
            >
              <Minus size={13} /> Separador
            </button>
            <button
              onClick={adicionarLinha}
              className="flex items-center gap-1.5 text-xs text-accent-muted hover:text-accent transition-colors"
            >
              <Plus size={13} /> Adicionar linha
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                <th className="w-8" />
                <th className="px-3 py-2 text-left text-[10px] text-accent-subtle font-medium uppercase tracking-wider">Designação</th>
                <th className="px-3 py-2 text-left text-[10px] text-accent-subtle font-medium uppercase tracking-wider w-20">Qtd</th>
                <th className="px-3 py-2 text-left text-[10px] text-accent-subtle font-medium uppercase tracking-wider w-24">Unidade</th>
                <th className="px-3 py-2 text-left text-[10px] text-accent-subtle font-medium uppercase tracking-wider w-28">Preço (€)</th>
                <th className="px-3 py-2 text-center text-[10px] text-accent-subtle font-medium uppercase tracking-wider w-14">IVA</th>
                <th className="px-3 py-2 text-right text-[10px] text-accent-subtle font-medium uppercase tracking-wider w-24">Total</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {linhas.map((l, i) => {
                const isDragOver = dragOverIdx === i && dragIdx !== i
                const rowProps = {
                  draggable: true,
                  onDragStart: () => setDragIdx(i),
                  onDragOver: (e) => { e.preventDefault(); setDragOverIdx(i) },
                  onDrop: () => moverLinha(dragIdx, dragOverIdx),
                  onDragEnd: () => { setDragIdx(null); setDragOverIdx(null) },
                  className: clsx('border-b border-border/50 transition-colors', isDragOver && 'bg-amber-400/5 outline outline-1 outline-amber-400/30'),
                }

                if (l._separador) {
                  return (
                    <tr key={i} {...rowProps}>
                      <td className="px-2 py-2 cursor-grab active:cursor-grabbing">
                        <GripVertical size={13} className="text-accent-subtle/25" />
                      </td>
                      <td colSpan={6} className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-px bg-border/60" />
                          <input
                            className="bg-transparent text-[10px] font-semibold uppercase tracking-widest text-accent-subtle text-center focus:outline-none min-w-[4rem] placeholder:text-accent-subtle/30"
                            style={{ width: `max(4rem, ${((l.label || '').length || 10) + 2}ch)` }}
                            value={l.label || ''}
                            onChange={e => {
                              const next = linhas.map((linha, idx) => idx === i ? { ...linha, label: e.target.value } : linha)
                              setLinhas(next)
                              onLinhasChange?.(next)
                            }}
                            placeholder="Nome da secção…"
                          />
                          <div className="flex-1 h-px bg-border/60" />
                          <button
                            onClick={() => removerLinha(i)}
                            className="p-1 text-accent-subtle/40 hover:text-status-cancelado transition-colors shrink-0"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                }

                const totalLinha = (Number(l.preco) || 0) * (Number(l.qtd) || 1)
                return (
                  <tr key={i} {...rowProps}>
                    <td className="px-2 py-2 cursor-grab active:cursor-grabbing">
                      <GripVertical size={13} className="text-accent-subtle/25" />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        className={inputCls}
                        value={l.descricao}
                        onChange={e => setLinha(i, 'descricao', e.target.value)}
                        placeholder="Designação…"
                      />
                      <input
                        className={clsx(inputCls, 'mt-1 text-[10px]')}
                        value={l.observacoes}
                        onChange={e => setLinha(i, 'observacoes', e.target.value)}
                        placeholder="Observações (opcional)…"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number" min="1" step="1"
                        className={inputCls}
                        value={l.qtd}
                        onChange={e => setLinha(i, 'qtd', e.target.value)}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <select
                        className={inputCls}
                        value={l.unidade}
                        onChange={e => setLinha(i, 'unidade', e.target.value)}
                      >
                        {UNIDADES.map(u => <option key={u} value={u}>{u}</option>)}
                      </select>
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number" min="0" step="0.01"
                        className={inputCls}
                        value={l.preco}
                        onChange={e => setLinha(i, 'preco', e.target.value)}
                        placeholder="0,00"
                      />
                    </td>
                    <td className="px-3 py-2 text-center text-xs text-accent-subtle">23%</td>
                    <td className="px-3 py-2 text-right text-xs text-accent tabular-nums">{fmtEuro(totalLinha)}</td>
                    <td className="px-2 py-2">
                      <button
                        onClick={() => removerLinha(i)}
                        className="p-1 text-accent-subtle/40 hover:text-status-cancelado transition-colors"
                      >
                        <Trash2 size={13} />
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Notas Técnicas */}
      <div>
        <label className="text-[11px] font-medium text-accent-subtle uppercase tracking-wider block mb-1">
          Notas Técnicas
        </label>
        <textarea
          className={clsx(inputCls, 'resize-none')}
          rows={3}
          value={notasTecnicas}
          onChange={e => { setNotasTecnicas(e.target.value); onNotasChange?.({ notasTecnicas: e.target.value, notasProposta }) }}
          placeholder="Rider, requisitos técnicos, configurações…"
        />
      </div>

      {/* Notas da Proposta */}
      <div>
        <label className="text-[11px] font-medium text-accent-subtle uppercase tracking-wider block mb-1">
          Notas da Proposta
        </label>
        <textarea
          className={clsx(inputCls, 'resize-none')}
          rows={2}
          value={notasProposta}
          onChange={e => { setNotasProposta(e.target.value); onNotasChange?.({ notasTecnicas, notasProposta: e.target.value }) }}
          placeholder="Condições, validade, forma de pagamento…"
        />
      </div>

      {/* Totais */}
      <div className="flex justify-end">
        <div className="bg-surface-1 border border-border rounded-xl px-5 py-3 min-w-[220px]">
          {comIva && (
            <>
              <div className="flex justify-between text-xs text-accent-muted mb-1.5">
                <span>Total Ilíq.</span>
                <span className="tabular-nums">{fmtEuro(subtotal)}</span>
              </div>
              <div className="flex justify-between text-xs text-accent-muted mb-2">
                <span>IVA 23%</span>
                <span className="tabular-nums">{fmtEuro(iva)}</span>
              </div>
            </>
          )}
          <div className="flex justify-between text-sm font-bold text-accent border-t border-border pt-2">
            <span>Total a pagar</span>
            <span className="tabular-nums">{fmtEuro(total)}</span>
          </div>
        </div>
      </div>

    </div>
  )
}

