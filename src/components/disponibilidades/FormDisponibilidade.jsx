import { useState, useEffect, useCallback } from 'react'
import { Trash2, CalendarCheck, CalendarX, Plus } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Alerta } from '@/components/ui/Alerta'
import { useDJs } from '@/hooks/useDJs'
import { disponibilidadesApi } from '@/lib/api'
import { useMesStore } from '@/store'
import { format, parse, isValid, addMonths, startOfMonth, getDaysInMonth } from 'date-fns'
import { pt } from 'date-fns/locale'
import { clsx } from 'clsx'

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1)

// Gerar lista de meses: mês actual + 5 meses à frente
function gerarMeses() {
  const hoje = new Date()
  return Array.from({ length: 6 }, (_, i) => {
    const d = addMonths(startOfMonth(hoje), i)
    return {
      value: format(d, 'yyyy-MM'),
      label: cap(format(d, 'MMMM yyyy', { locale: pt })),
    }
  })
}

function formatarDataCurta(iso) {
  try {
    const d = parse(iso, 'yyyy-MM-dd', new Date())
    return isValid(d) ? cap(format(d, "EEE d MMM", { locale: pt })) : iso
  } catch { return iso }
}

export function FormDisponibilidade({ aberto, onFechar }) {
  const { djs } = useDJs()
  const djsActivos = djs.filter((d) => d.estado === 'activo')
  const meses = gerarMeses()
  const mesGlobal = useMesStore((s) => s.anoMes)

  // Usa o mês global como default; se não estiver na lista de opções, usa o 1º
  const mesDefault = meses.find((m) => m.value === mesGlobal)?.value ?? meses[0].value

  const [djId, setDjId] = useState('')
  const [mes, setMes] = useState(mesDefault)
  const [diasInput, setDiasInput] = useState('')   // ex: "1, 2, 5, 27, 23"
  const [datas, setDatas] = useState([])            // [{ iso, disponivel }]
  const [disponivel, setDisponivel] = useState(false)
  const [notas, setNotas] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [erro, setErro] = useState(null)
  const [sucesso, setSucesso] = useState(false)

  // Reset ao abrir — sincroniza o mês com o global
  useEffect(() => {
    if (aberto) {
      setDjId('')
      setMes(meses.find((m) => m.value === mesGlobal)?.value ?? meses[0].value)
      setDiasInput('')
      setDatas([])
      setDisponivel(false)
      setNotas('')
      setErro(null)
      setSucesso(false)
    }
  }, [aberto])

  // Auto-selecionar primeiro DJ se só há um
  useEffect(() => {
    if (djsActivos.length === 1 && !djId) setDjId(djsActivos[0].id)
  }, [djsActivos, djId])

  // Adicionar dias da caixa de texto (ex: "1, 2, 5, 27")
  const adicionarDias = useCallback(() => {
    if (!diasInput.trim()) return
    setErro(null)

    const [ano, mNum] = mes.split('-').map(Number)
    const maxDias = getDaysInMonth(new Date(ano, mNum - 1))
    const pad = (n) => String(n).padStart(2, '0')

    // Suporta: "1, 2, 5" ou "1 2 5" ou "1-2-5" ou mistura
    const partes = diasInput.split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean)
    const novas = []
    const invalidas = []

    for (const p of partes) {
      const n = parseInt(p, 10)
      if (isNaN(n) || n < 1 || n > maxDias) {
        invalidas.push(p)
        continue
      }
      const iso = `${ano}-${pad(mNum)}-${pad(n)}`
      if (!datas.find((d) => d.iso === iso) && !novas.find((d) => d.iso === iso)) {
        novas.push({ iso, disponivel })
      }
    }

    if (invalidas.length) {
      setErro(`Dias inválidos para ${meses.find((m) => m.value === mes)?.label}: ${invalidas.join(', ')}`)
    }

    if (novas.length) {
      setDatas((prev) =>
        [...prev, ...novas].sort((a, b) => a.iso.localeCompare(b.iso))
      )
      setDiasInput('')
    }
  }, [diasInput, mes, datas, disponivel, meses])

  const removerData = (iso) => setDatas((prev) => prev.filter((d) => d.iso !== iso))

  const toggleDisponibilidadeData = (iso) =>
    setDatas((prev) => prev.map((d) => d.iso === iso ? { ...d, disponivel: !d.disponivel } : d))

  // Seleccionar / desseleccionar todas
  const todasDisponivel = (val) =>
    setDatas((prev) => prev.map((d) => ({ ...d, disponivel: val })))

  const guardar = async () => {
    if (!djId) { setErro('Selecciona um DJ.'); return }
    if (datas.length === 0) { setErro('Adiciona pelo menos uma data.'); return }
    setGuardando(true)
    setErro(null)
    try {
      await Promise.all(
        datas.map((d) => disponibilidadesApi.registar(djId, d.iso, d.disponivel, notas))
      )
      setSucesso(true)
      setDatas([])
      setDiasInput('')
      setTimeout(() => setSucesso(false), 3000)
    } catch (e) {
      setErro(e.message)
    } finally {
      setGuardando(false)
    }
  }

  const djNome = djsActivos.find((d) => d.id === djId)
    ?.nome_artistico || djsActivos.find((d) => d.id === djId)?.nome || ''

  return (
    <Modal aberto={aberto} onFechar={onFechar} titulo="Disponibilidade DJs" largura="max-w-lg">
      <div className="px-6 py-5 flex flex-col gap-4">
        {erro && <Alerta tipo="erro" mensagem={erro} />}
        {sucesso && <Alerta tipo="sucesso" mensagem={`Guardado com sucesso para ${djNome}.`} />}

        {/* DJ + Mês */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-accent-muted mb-1.5">DJ</label>
            <select
              value={djId}
              onChange={(e) => setDjId(e.target.value)}
              className="w-full bg-surface-2 border border-border rounded px-3 py-2 text-sm text-accent focus:outline-none focus:ring-1 focus:ring-white/20"
            >
              <option value="">— Seleccionar —</option>
              {djsActivos.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.nome_artistico || d.nome}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-accent-muted mb-1.5">Mês</label>
            <select
              value={mes}
              onChange={(e) => setMes(e.target.value)}
              className="w-full bg-surface-2 border border-border rounded px-3 py-2 text-sm text-accent focus:outline-none focus:ring-1 focus:ring-white/20"
            >
              {meses.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Estado */}
        <div>
          <label className="block text-xs font-medium text-accent-muted mb-1.5">Estado das datas a adicionar</label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setDisponivel(true)}
              className={clsx(
                'flex items-center gap-2 px-3 py-2 rounded border text-xs font-medium transition-colors',
                disponivel
                  ? 'bg-status-confirmado/20 text-status-confirmado border-status-confirmado/40'
                  : 'bg-surface-2 text-accent-subtle border-border hover:text-accent-muted'
              )}
            >
              <CalendarCheck size={13} />
              Disponível
            </button>
            <button
              type="button"
              onClick={() => setDisponivel(false)}
              className={clsx(
                'flex items-center gap-2 px-3 py-2 rounded border text-xs font-medium transition-colors',
                !disponivel
                  ? 'bg-status-cancelado/20 text-status-cancelado border-status-cancelado/40'
                  : 'bg-surface-2 text-accent-subtle border-border hover:text-accent-muted'
              )}
            >
              <CalendarX size={13} />
              Indisponível
            </button>
          </div>
        </div>

        {/* Entrada de dias */}
        <div>
          <label className="block text-xs font-medium text-accent-muted mb-1.5">
            Dias do mês
            <span className="ml-2 font-normal text-accent-subtle">separa por vírgula: 1, 2, 5, 23, 27</span>
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={diasInput}
              onChange={(e) => setDiasInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); adicionarDias() } }}
              placeholder="ex: 1, 2, 5, 23, 27"
              className="flex-1 bg-surface-2 border border-border rounded px-3 py-2 text-sm text-accent placeholder:text-accent-subtle/50 focus:outline-none focus:ring-1 focus:ring-white/20"
            />
            <button
              type="button"
              onClick={adicionarDias}
              disabled={!diasInput.trim()}
              className="px-3 py-2 rounded border border-border bg-surface-2 text-accent-muted hover:text-accent hover:border-white/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Plus size={15} />
            </button>
          </div>
          <p className="text-[11px] text-accent-subtle mt-1">Prima Enter ou + para adicionar ao carrinho.</p>
        </div>

        {/* Lista de datas */}
        {datas.length > 0 && (
          <div className="border border-border rounded-lg overflow-hidden">
            <div className="px-3 py-2 border-b border-border/50 bg-surface-2/50 flex items-center justify-between">
              <p className="text-[11px] font-semibold text-accent-muted uppercase tracking-wider">
                {datas.length} data{datas.length !== 1 ? 's' : ''}
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => todasDisponivel(true)}
                  className="text-[10px] text-status-confirmado hover:text-status-confirmado/80 transition-colors"
                >
                  todas disponível
                </button>
                <span className="text-accent-subtle/30">·</span>
                <button
                  type="button"
                  onClick={() => todasDisponivel(false)}
                  className="text-[10px] text-status-cancelado hover:text-status-cancelado/80 transition-colors"
                >
                  todas indisponível
                </button>
                <span className="text-accent-subtle/30">·</span>
                <button
                  type="button"
                  onClick={() => setDatas([])}
                  className="text-[10px] text-accent-subtle hover:text-accent-muted transition-colors"
                >
                  limpar
                </button>
              </div>
            </div>
            <div className="divide-y divide-border/30 max-h-52 overflow-y-auto">
              {datas.map(({ iso, disponivel: disp }) => (
                <div key={iso} className="flex items-center justify-between px-3 py-1.5 gap-2">
                  <span className="text-xs text-accent flex-1 tabular-nums">{formatarDataCurta(iso)}</span>
                  <button
                    type="button"
                    onClick={() => toggleDisponibilidadeData(iso)}
                    className={clsx(
                      'px-2 py-0.5 rounded text-[11px] font-medium border transition-colors shrink-0',
                      disp
                        ? 'bg-status-confirmado/15 text-status-confirmado border-status-confirmado/30'
                        : 'bg-status-cancelado/15 text-status-cancelado border-status-cancelado/30'
                    )}
                  >
                    {disp ? '✓ Disp.' : '✗ Indisp.'}
                  </button>
                  <button
                    type="button"
                    onClick={() => removerData(iso)}
                    className="text-accent-subtle hover:text-status-cancelado transition-colors"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Notas */}
        <div>
          <label className="block text-xs font-medium text-accent-muted mb-1.5">Notas (opcional)</label>
          <input
            type="text"
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            placeholder="Ex: férias, show fora, indisponível por doença…"
            className="w-full bg-surface-2 border border-border rounded px-3 py-2 text-sm text-accent placeholder:text-accent-subtle/50 focus:outline-none focus:ring-1 focus:ring-white/20"
          />
        </div>
      </div>

      <div className="px-6 py-4 border-t border-border flex items-center justify-between gap-2">
        <span className="text-xs text-accent-subtle">
          {datas.length > 0
            ? `${datas.length} data${datas.length !== 1 ? 's' : ''} seleccionada${datas.length !== 1 ? 's' : ''}`
            : 'Sem datas'}
        </span>
        <div className="flex gap-2">
          <Button type="button" variante="ghost" tamanho="sm" onClick={onFechar}>Fechar</Button>
          <Button
            type="button"
            variante="primary"
            tamanho="sm"
            loading={guardando}
            onClick={guardar}
            disabled={!djId || datas.length === 0}
          >
            Guardar {datas.length > 0 ? `(${datas.length})` : ''}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
