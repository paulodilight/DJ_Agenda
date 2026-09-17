import { useMemo } from 'react'
import { Boxes } from 'lucide-react'
import { clsx } from 'clsx'
import { format } from 'date-fns'
import { pt } from 'date-fns/locale'
import { ESTUDIO_EQUIPAMENTO_MAP, nomeCatalogoParaChave } from '../../lib/estudioEquipamentoMap'

const CATEGORIA_LABEL = { mesa: 'Mesa', player: 'Player', efeitos: 'Efeitos', setup: 'Setup' }

function fmtDia(iso) {
  if (!iso) return null
  return format(new Date(iso), 'dd/MM/yyyy', { locale: pt })
}

export function GestaoStocks({ equipamentos, loading }) {
  const linhas = useMemo(() => {
    const porChave = {}
    ESTUDIO_EQUIPAMENTO_MAP.forEach(m => { porChave[m.chave] = { ...m, unidades: [] } })
    equipamentos.forEach(eq => {
      const chave = nomeCatalogoParaChave(eq.nome)
      if (chave && porChave[chave]) porChave[chave].unidades.push(eq)
    })
    return Object.values(porChave)
  }, [equipamentos])

  const totalBloqueados = linhas.reduce((s, l) => s + l.unidades.filter(u => u.em_uso || u.reservado).length, 0)

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <Boxes size={15} className="text-status-confirmado" />
        <p className="text-xs text-accent-muted">
          Stock do estúdio — datas de saída e entrada por unidade.
          Equipamento reservado ou em uso fica automaticamente excluído das reservas do estúdio.
        </p>
      </div>

      {loading ? (
        <div className="text-center py-16 text-accent-subtle text-sm">A carregar…</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse min-w-[640px]">
            <thead>
              <tr className="border-b border-border bg-surface-0">
                <th className="text-left px-4 py-2.5 font-semibold uppercase tracking-wider text-[10px] text-accent-subtle">Equipamento (estúdio)</th>
                <th className="text-left px-3 py-2.5 font-semibold uppercase tracking-wider text-[10px] text-accent-subtle">Categoria</th>
                <th className="text-center px-3 py-2.5 font-semibold uppercase tracking-wider text-[10px] text-accent-subtle">Total</th>
                <th className="text-center px-3 py-2.5 font-semibold uppercase tracking-wider text-[10px] text-accent-subtle">Disponível</th>
                <th className="text-left px-3 py-2.5 font-semibold uppercase tracking-wider text-[10px] text-accent-subtle">Data saída</th>
                <th className="text-left px-3 py-2.5 font-semibold uppercase tracking-wider text-[10px] text-accent-subtle">Data entrada</th>
                <th className="text-left px-3 py-2.5 font-semibold uppercase tracking-wider text-[10px] text-accent-subtle">Evento / motivo</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map(l => {
                const total = l.unidades.length
                const emUso = l.unidades.filter(u => u.em_uso).length
                const reservado = l.unidades.filter(u => u.reservado).length
                const disponivel = total - emUso
                const bloqueadas = [
                  ...l.unidades.filter(u => u.reservado).map(u => ({
                    tipo: 'reservado',
                    dataSaida: u.reserva_atual?.data_evento ?? null,
                    dataEntrada: null,
                    evento: u.reserva_atual?.evento ?? null,
                  })),
                  ...l.unidades.filter(u => u.em_uso).map(u => ({
                    tipo: 'fora',
                    dataSaida: u.saida_at ?? null,
                    dataEntrada: null,
                    evento: u.evento_atual?.evento ?? null,
                  })),
                ].sort((a, b) => {
                  const da = a.dataSaida ? new Date(a.dataSaida) : new Date(0)
                  const db = b.dataSaida ? new Date(b.dataSaida) : new Date(0)
                  return da - db
                })

                // Linha de resumo por modelo
                const resumoRow = (
                  <tr key={l.chave} className={clsx(
                    'border-b border-border/40',
                    bloqueadas.length > 0 ? 'bg-surface-1/30' : 'hover:bg-surface-2 transition-colors'
                  )}>
                    <td className="px-4 py-2.5 font-semibold text-accent">{l.chave}</td>
                    <td className="px-3 py-2.5 text-accent-muted">{CATEGORIA_LABEL[l.categoriaEstudio]}</td>
                    <td className="px-3 py-2.5 text-center tabular-nums text-accent">{total || <span className="text-red-400">0</span>}</td>
                    <td className={clsx('px-3 py-2.5 text-center tabular-nums font-bold', disponivel > 0 ? 'text-status-confirmado' : 'text-red-400')}>{disponivel}</td>
                    {bloqueadas.length === 0 ? (
                      <>
                        <td className="px-3 py-2.5 text-accent-subtle/30">—</td>
                        <td className="px-3 py-2.5 text-accent-subtle/30">—</td>
                        <td className="px-3 py-2.5 text-accent-subtle/30">—</td>
                      </>
                    ) : (
                      <>
                        <td className="px-3 py-2.5" />
                        <td className="px-3 py-2.5" />
                        <td className="px-3 py-2.5">
                          <span className="text-[10px] text-accent-subtle/50">
                            {reservado > 0 && `${reservado} reservado${reservado > 1 ? 's' : ''}`}
                            {reservado > 0 && emUso > 0 && ' · '}
                            {emUso > 0 && `${emUso} fora`}
                          </span>
                        </td>
                      </>
                    )}
                  </tr>
                )

                // Sub-linhas de bloqueio com datas
                const bloqueioRows = bloqueadas.map((b, i) => (
                  <tr key={`${l.chave}-b-${i}`} className="border-b border-border/20 hover:bg-surface-2/50 transition-colors bg-surface-0/50">
                    <td className="px-4 py-1.5 pl-8 text-accent-muted text-[11px]">↳ unidade {i + 1}</td>
                    <td className="px-3 py-1.5">
                      <span className={clsx(
                        'px-1.5 py-0.5 rounded text-[9px] font-semibold border',
                        b.tipo === 'reservado'
                          ? 'bg-blue-500/10 text-blue-300 border-blue-500/20'
                          : 'bg-amber-500/10 text-amber-300 border-amber-500/20'
                      )}>
                        {b.tipo === 'reservado' ? 'Reservado' : 'Em uso'}
                      </span>
                    </td>
                    <td />
                    <td />
                    <td className="px-3 py-1.5 tabular-nums text-accent-muted">
                      {fmtDia(b.dataSaida) ?? <span className="text-accent-subtle/30">—</span>}
                    </td>
                    <td className="px-3 py-1.5 tabular-nums text-accent-subtle/40 italic text-[10px]">
                      Por definir
                    </td>
                    <td className="px-3 py-1.5 text-accent-muted max-w-[180px] truncate" title={b.evento ?? ''}>
                      {b.evento ?? <span className="text-accent-subtle/30">—</span>}
                    </td>
                  </tr>
                ))

                return [resumoRow, ...bloqueioRows]
              })}
            </tbody>
          </table>
        </div>
      )}

      {!loading && totalBloqueados === 0 && (
        <p className="text-[11px] text-status-confirmado/70 mt-3 text-center">
          Todo o equipamento do estúdio está disponível.
        </p>
      )}

      <p className="text-[10px] text-accent-subtle mt-3">
        Para adicionar, editar ou dar baixa a uma unidade, usa a aba "Saídas e entradas" — é o mesmo catálogo.
      </p>
    </div>
  )
}
