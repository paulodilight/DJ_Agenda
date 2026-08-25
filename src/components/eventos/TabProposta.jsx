import { useState, useEffect, useRef } from 'react'
import { Plus, Trash2, Printer } from 'lucide-react'
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

export function TabProposta({ evento, espacos = [], equipRows = {}, equipamentosList = [], notasTecnicasInicial = '', notasPropostaInicial = '', onNotasChange }) {
  const [linhas, setLinhas] = useState([linhaVazia()])
  const [notasTecnicas, setNotasTecnicas] = useState(notasTecnicasInicial)
  const [notasProposta, setNotasProposta] = useState(notasPropostaInicial)
  const [comIva, setComIva] = useState(true)
  const hasInit = useRef(false)

  // Reset quando o evento muda
  useEffect(() => {
    setNotasTecnicas(notasTecnicasInicial || '')
    setNotasProposta(notasPropostaInicial || '')
    hasInit.current = false
    setLinhas([linhaVazia()])
  }, [evento?.id])

  // Pré-popular quando os equipamentos chegam (podem chegar após a montagem)
  useEffect(() => {
    if (hasInit.current) return
    const proprios = equipRows.proprio ?? []
    if (proprios.length > 0) {
      hasInit.current = true
      setLinhas(proprios.map(r => ({
        descricao: equipamentosList.find(e => e.id === r.equipamento_id)?.nome || r.descricao || '',
        observacoes: r.observacoes || '',
        qtd: r.unidades || 1,
        unidade: 'Uni.',
        preco: r.valor_custo !== '' && r.valor_custo != null ? String(r.valor_custo) : '',
      })))
    }
  }, [equipRows.proprio?.length])

  function adicionarLinha() {
    setLinhas(l => [...l, linhaVazia()])
  }

  function removerLinha(i) {
    setLinhas(l => l.filter((_, idx) => idx !== i))
  }

  function setLinha(i, campo, valor) {
    setLinhas(l => l.map((linha, idx) => idx === i ? { ...linha, [campo]: valor } : linha))
  }

  const nomeEvento = evento?.evento || ''
  const espaco = espacos.find(e => String(e.id) === String(evento?.espaco_id)) || null
  const nomeCliente = espaco?.nome || ''

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
      nomeCliente,
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

        {/* Botão imprimir */}
        <button
          onClick={imprimir}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-accent/10 border border-accent/20 text-accent text-xs font-semibold hover:bg-accent/20 transition-colors"
        >
          <Printer size={14} />
          Imprimir Proposta
        </button>
      </div>

      {/* Evento + Cliente */}
      {(nomeEvento || nomeCliente) && (
        <div className="flex gap-6 px-1">
          {nomeEvento && (
            <div>
              <div className="text-[10px] font-medium text-accent-subtle uppercase tracking-wider mb-0.5">Evento</div>
              <div className="text-xs text-accent">{nomeEvento}</div>
            </div>
          )}
          {nomeCliente && (
            <div>
              <div className="text-[10px] font-medium text-accent-subtle uppercase tracking-wider mb-0.5">Cliente</div>
              <div className="text-xs text-accent">{nomeCliente}</div>
            </div>
          )}
        </div>
      )}

      {/* Tabela de linhas */}
      <div className="bg-surface-1 border border-border rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <span className="text-xs font-semibold text-accent">Itens da Proposta</span>
          <button
            onClick={adicionarLinha}
            className="flex items-center gap-1.5 text-xs text-accent-muted hover:text-accent transition-colors"
          >
            <Plus size={13} /> Adicionar linha
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
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
                const totalLinha = (Number(l.preco) || 0) * (Number(l.qtd) || 1)
                return (
                  <tr key={i} className="border-b border-border/50">
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

