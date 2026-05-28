import { useState, useEffect, useCallback } from 'react'
import { format, startOfMonth, endOfMonth } from 'date-fns'
import { espacosApi } from '@/lib/api'

// todos: true  → todos os espaços incluindo inactivos (páginas de gestão)
// todos: false → espaços com calendário configurado OU com actividade no mês
// anoMes: 'yyyy-MM' → considera actividade nesse mês (slots DJ + eventos)
export function useEspacos({ todos = false, anoMes = null } = {}) {
  const [espacos, setEspacos] = useState([])
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState(null)

  const carregar = useCallback(async () => {
    setLoading(true)
    setErro(null)
    try {
      const data = await espacosApi.listar({ incluirInactivos: todos })

      if (todos) {
        setEspacos(data)
        return
      }

      // Espaços com calendário semanal configurado
      const comCalendario = data.filter(e =>
        (e.turnos_espaco ?? []).some(t => t.dias_semana?.length > 0)
      )

      if (!anoMes) {
        setEspacos(comCalendario)
        return
      }

      // Também inclui espaços sem calendário mas com actividade no mês
      const [ano, mes] = anoMes.split('-').map(Number)
      const ref    = new Date(ano, mes - 1, 1)
      const inicio = format(startOfMonth(ref), 'yyyy-MM-dd')
      const fim    = format(endOfMonth(ref),   'yyyy-MM-dd')

      const atividade = await espacosApi.atividadeMes(inicio, fim)

      const idsComCalendario = new Set(comCalendario.map(e => e.id))
      const extras = data.filter(e =>
        !idsComCalendario.has(e.id) &&
        ((atividade[e.id]?.agenda ?? 0) > 0 || (atividade[e.id]?.eventos ?? 0) > 0)
      )

      setEspacos([...comCalendario, ...extras])
    } catch (e) {
      setErro(e.message)
    } finally {
      setLoading(false)
    }
  }, [todos, anoMes])

  useEffect(() => { carregar() }, [carregar])

  return { espacos, loading, erro, recarregar: carregar }
}
