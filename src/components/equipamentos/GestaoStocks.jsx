import { useMemo } from 'react'
import { Boxes } from 'lucide-react'
import { clsx } from 'clsx'
import { ESTUDIO_EQUIPAMENTO_MAP, nomeCatalogoParaChave } from '../../lib/estudioEquipamentoMap'

const CATEGORIA_LABEL = { mesa: 'Mesa', player: 'Player', efeitos: 'Efeitos', setup: 'Setup' }

// Só leitura: as unidades em si continuam a criar-se/editar-se em "Saídas e entradas"
// (é o mesmo catálogo `equipamentos`) — aqui só se agrega por modelo do estúdio para
// se ver de relance quantas unidades de cada há e quantas estão livres agora.
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

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <Boxes size={15} className="text-status-confirmado" />
        <p className="text-xs text-accent-muted">
          Equipamento do estúdio — a mesma unidade pode estar a ser usada num evento fora; se estiver,
          a disponibilidade para reservas no estúdio desce automaticamente.
        </p>
      </div>

      {loading ? (
        <div className="text-center py-16 text-accent-subtle text-sm">A carregar…</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse min-w-[520px]">
            <thead>
              <tr className="border-b border-border bg-surface-0">
                <th className="text-left px-4 py-2.5 font-semibold uppercase tracking-wider text-[10px] text-accent-subtle">Equipamento (estúdio)</th>
                <th className="text-left px-4 py-2.5 font-semibold uppercase tracking-wider text-[10px] text-accent-subtle">Categoria</th>
                <th className="text-center px-3 py-2.5 font-semibold uppercase tracking-wider text-[10px] text-accent-subtle">Total</th>
                <th className="text-center px-3 py-2.5 font-semibold uppercase tracking-wider text-[10px] text-accent-subtle">Reservado</th>
                <th className="text-center px-3 py-2.5 font-semibold uppercase tracking-wider text-[10px] text-accent-subtle">Fora (em uso)</th>
                <th className="text-center px-3 py-2.5 font-semibold uppercase tracking-wider text-[10px] text-accent-subtle">Disponível p/ estúdio</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map(l => {
                const total = l.unidades.length
                const emUso = l.unidades.filter(u => u.em_uso).length
                const reservado = l.unidades.filter(u => u.reservado).length
                const disponivel = total - emUso
                return (
                  <tr key={l.chave} className="border-b border-border/40 hover:bg-surface-2 transition-colors">
                    <td className="px-4 py-2.5 font-semibold text-accent">{l.chave}</td>
                    <td className="px-4 py-2.5 text-accent-muted">{CATEGORIA_LABEL[l.categoriaEstudio]}</td>
                    <td className="px-3 py-2.5 text-center tabular-nums text-accent">{total || <span className="text-red-400">0</span>}</td>
                    <td className="px-3 py-2.5 text-center tabular-nums text-blue-400">{reservado || <span className="text-accent-subtle/30">—</span>}</td>
                    <td className="px-3 py-2.5 text-center tabular-nums text-amber-400">{emUso || <span className="text-accent-subtle/30">—</span>}</td>
                    <td className={clsx('px-3 py-2.5 text-center tabular-nums font-bold', disponivel > 0 ? 'text-status-confirmado' : 'text-red-400')}>
                      {disponivel}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-[10px] text-accent-subtle mt-3">
        Para adicionar, editar ou dar baixa a uma unidade, usa a aba "Saídas e entradas" — é o mesmo catálogo.
      </p>
    </div>
  )
}
