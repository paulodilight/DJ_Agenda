import { useState, useEffect } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Input, Select, Textarea } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { Alerta } from '@/components/ui/Alerta'
import { agendaApi, espacosApi } from '@/lib/api'
import { useDJs } from '@/hooks/useDJs'
import { useEspacos } from '@/hooks/useEspacos'
import { clsx } from 'clsx'

const ESTADO_OPCOES = [
  { value: 'proposta', label: 'Proposta' },
  { value: 'confirmado', label: 'Confirmado' },
]

const diaSemana = (dataStr) => {
  if (!dataStr) return null
  const [y, m, d] = dataStr.split('-').map(Number)
  return new Date(y, m - 1, d).getDay()
}

const novaLinhaManual = (referencia) => ({
  key: crypto.randomUUID(),
  nome: '',
  hora_inicio: referencia?.hora_fim ?? '22:00',
  hora_fim: '02:00',
  valor: '',
  dj_id: '',
  ativo: true,
  manual: true,
})

export function FormAtuacao({ aberto, dataInicial, espacoIdInicial, onFechar, onGuardado }) {
  // Se vem da grelha, o Cliente está fixo e não se mostra o selector
  const doCelula = !!espacoIdInicial

  const [espacoId, setEspacoId] = useState('')
  const [data, setData] = useState('')
  const [estado, setEstado] = useState('proposta')
  const [evento, setEvento] = useState('')
  const [notas, setNotas] = useState('')
  const [linhas, setLinhas] = useState([novaLinhaManual(null)])
  const [loadingTurnos, setLoadingTurnos] = useState(false)
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState(null)

  const [turnosEspaco, setTurnosEspaco] = useState([])
  const [djsFixosEspaco, setDjsFixosEspaco] = useState({})

  const { djs } = useDJs()
  const { espacos } = useEspacos()

  // Reset ao abrir
  useEffect(() => {
    if (aberto) {
      setEspacoId(espacoIdInicial ?? '')
      setData(dataInicial ?? '')
      setEstado('proposta')
      setEvento('')
      setNotas('')
      setLinhas([novaLinhaManual(null)])
      setTurnosEspaco([])
      setDjsFixosEspaco({})
      setErro(null)
    }
  }, [aberto, dataInicial, espacoIdInicial])

  // Carregar turnos + djs fixos quando o Cliente muda
  useEffect(() => {
    if (!espacoId) { setTurnosEspaco([]); setDjsFixosEspaco({}); return }
    setLoadingTurnos(true)
    espacosApi.buscarCompleto(espacoId)
      .then((res) => {
        setTurnosEspaco(res.turnos ?? [])
        const fixosMap = {}
        res.djs_fixos?.forEach((f) => { fixosMap[f.dia_semana] = f.dj_id })
        setDjsFixosEspaco(fixosMap)
      })
      .catch(() => {})
      .finally(() => setLoadingTurnos(false))
  }, [espacoId])

  // Reconstruir linhas a partir dos turnos quando mudam Cliente/data/turnos/fixos
  useEffect(() => {
    const dia = diaSemana(data)
    const aplicaveis = turnosEspaco.filter((t) =>
      dia === null || !t.dias_semana?.length || t.dias_semana.includes(dia)
    )
    const djFixo = dia !== null ? (djsFixosEspaco[dia] ?? '') : ''

    if (aplicaveis.length > 0) {
      setLinhas(aplicaveis.map((t) => ({
        key: t.id,
        nome: t.nome,
        hora_inicio: t.hora_inicio?.slice(0, 5) ?? '22:00',
        hora_fim: t.hora_fim?.slice(0, 5) ?? '02:00',
        valor: t.valor ?? '',
        dj_id: djFixo,
        ativo: true,
        manual: false,
      })))
    } else {
      setLinhas([{ ...novaLinhaManual(null), dj_id: djFixo }])
    }
  }, [turnosEspaco, djsFixosEspaco, data])

  const setLinha = (key, campo, valor) =>
    setLinhas((prev) => prev.map((l) => l.key === key ? { ...l, [campo]: valor } : l))

  const adicionarDJ = () =>
    setLinhas((prev) => [...prev, novaLinhaManual(prev[prev.length - 1])])

  const removerLinha = (key) =>
    setLinhas((prev) => prev.filter((l) => l.key !== key))

  const guardar = async (e) => {
    e.preventDefault()
    setErro(null)
    setLoading(true)
    try {
      const slots = linhas
        .filter((l) => l.ativo)
        .map((l) => ({
          espaco_id: espacoId || null,
          dj_id: l.dj_id || null,
          data,
          hora_inicio: l.hora_inicio,
          hora_fim: l.hora_fim,
          valor: l.valor === '' ? null : Number(l.valor),
          estado,
          evento: evento.trim() || null,
          notas: notas.trim() || null,
          origem: 'manual',
        }))
      await Promise.all(slots.map((s) => agendaApi.criar(s)))
      onGuardado()
      onFechar()
    } catch (e) {
      setErro(e.message)
    } finally {
      setLoading(false)
    }
  }

  const djsActivos = djs.filter((d) => d.estado !== 'banido')
  const linhasActivas = linhas.filter((l) => l.ativo)
  const espacoNome = espacos.find((e) => e.id === espacoId)?.nome

  return (
    <Modal aberto={aberto} onFechar={onFechar} titulo="Adicionar Atuação" largura="max-w-xl">
      <form onSubmit={guardar}>
        <div className="px-6 py-5 flex flex-col gap-4">
          {erro && <Alerta tipo="erro" mensagem={erro} />}

          {/* Cliente + Data */}
          {doCelula ? (
            // Vem da grelha — Cliente fixo, só mostra a data
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <Input label="Data" value={data} onChange={(e) => setData(e.target.value)} type="date" required />
              </div>
              {espacoNome && (
                <div className="flex-1">
                  <p className="text-xs font-medium text-accent-muted mb-1.5">Cliente</p>
                  <p className="text-sm font-medium text-accent border border-border rounded px-3 py-2 bg-surface-2">
                    {espacoNome}
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              <Select label="Cliente" value={espacoId} onChange={(e) => setEspacoId(e.target.value)} required>
                <option value="">Seleccionar Cliente</option>
                {espacos.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}
              </Select>
              <Input label="Data" value={data} onChange={(e) => setData(e.target.value)} type="date" required />
            </div>
          )}

          {/* Linhas de DJ */}
          {espacoId && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-medium text-accent-muted">
                  {loadingTurnos
                    ? 'A carregar turnos…'
                    : linhas.length > 1
                      ? `${linhas.length} atuações`
                      : 'DJ e horário'}
                </p>
                <Button type="button" variante="ghost" tamanho="sm" onClick={adicionarDJ}>
                  <Plus size={12} />
                  Adicionar DJ
                </Button>
              </div>

              <div className="flex flex-col gap-2">
                {linhas.map((linha, idx) => (
                  <div
                    key={linha.key}
                    className={clsx(
                      'border rounded-md p-3 flex flex-col gap-3 transition-opacity',
                      linha.ativo ? 'border-border bg-surface-2' : 'border-border/30 bg-surface-1 opacity-40'
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-accent">
                        {linha.nome || `${idx + 1}º DJ`}
                      </span>
                      <div className="flex items-center gap-2">
                        {!linha.ativo ? (
                          <label className="flex items-center gap-1.5 cursor-pointer select-none">
                            <input
                              type="checkbox"
                              checked={false}
                              onChange={() => setLinha(linha.key, 'ativo', true)}
                              className="accent-white"
                            />
                            <span className="text-xs text-accent-muted">incluir</span>
                          </label>
                        ) : null}
                        {/* Linha de turno configurado: checkbox para excluir */}
                        {!linha.manual && linha.ativo && (
                          <label className="flex items-center gap-1.5 cursor-pointer select-none">
                            <input
                              type="checkbox"
                              checked={true}
                              onChange={() => setLinha(linha.key, 'ativo', false)}
                              className="accent-white"
                            />
                            <span className="text-xs text-accent-muted">incluir</span>
                          </label>
                        )}
                        {/* Linha manual: botão de remover */}
                        {linha.manual && linhas.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removerLinha(linha.key)}
                            className="text-accent-subtle hover:text-status-cancelado transition-colors"
                          >
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>
                    </div>

                    {linha.ativo && (
                      <div className="grid grid-cols-3 gap-2">
                        <Select
                          label="DJ"
                          value={linha.dj_id}
                          onChange={(e) => setLinha(linha.key, 'dj_id', e.target.value)}
                        >
                          <option value="">Sem DJ</option>
                          {djsActivos.map((d) => (
                            <option key={d.id} value={d.id}>{d.nome_artistico || d.nome}</option>
                          ))}
                        </Select>
                        <Input
                          label="Início"
                          value={linha.hora_inicio}
                          onChange={(e) => setLinha(linha.key, 'hora_inicio', e.target.value)}
                          type="time"
                        />
                        <Input
                          label="Fim"
                          value={linha.hora_fim}
                          onChange={(e) => setLinha(linha.key, 'hora_fim', e.target.value)}
                          type="time"
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {!espacoId && !doCelula && (
            <p className="text-xs text-accent-subtle text-center py-3 border border-dashed border-border rounded-md">
              Selecciona um Cliente para ver os turnos e DJs disponíveis.
            </p>
          )}

          <div className="grid grid-cols-2 gap-4">
            <Select label="Estado" value={estado} onChange={(e) => setEstado(e.target.value)}>
              {ESTADO_OPCOES.map((e) => <option key={e.value} value={e.value}>{e.label}</option>)}
            </Select>
            <div />
          </div>

          <Input
            label="Evento (opcional)"
            value={evento}
            onChange={(e) => setEvento(e.target.value)}
            placeholder="Ex: Halloween Party, Aniversário do clube, NYE..."
          />

          <Textarea
            label="Observações"
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            placeholder="Notas sobre a atuação, rider, condições especiais..."
          />
        </div>

        <div className="px-6 py-4 border-t border-border flex items-center justify-between">
          <span className="text-xs text-accent-subtle">
            {linhasActivas.length > 0
              ? `${linhasActivas.length} atuação${linhasActivas.length !== 1 ? 'ões' : ''} a criar`
              : 'Nenhuma atuação seleccionada'}
          </span>
          <div className="flex gap-2">
            <Button type="button" variante="ghost" tamanho="sm" onClick={onFechar}>Cancelar</Button>
            <Button
              type="submit"
              variante="primary"
              tamanho="sm"
              loading={loading}
              disabled={!data || !espacoId || linhasActivas.length === 0}
            >
              Adicionar Atuação
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  )
}
