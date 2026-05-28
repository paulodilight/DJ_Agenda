import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, eachDayOfInterval, addWeeks, addMonths } from 'date-fns'
import { pt } from 'date-fns/locale'

export const formatarData = (data, fmt = 'dd/MM/yyyy') =>
  format(new Date(data), fmt, { locale: pt })

export const formatarDataCurta = (data) =>
  format(new Date(data), 'dd MMM', { locale: pt })

export const formatarHora = (hora) => hora?.slice(0, 5) ?? '—'

export const isoData = (data) => format(new Date(data), 'yyyy-MM-dd')

export const diasDaSemana = (data) => {
  const inicio = startOfWeek(new Date(data), { weekStartsOn: 1 })
  const fim = endOfWeek(new Date(data), { weekStartsOn: 1 })
  return eachDayOfInterval({ start: inicio, end: fim })
}

export const diasDoMes = (data) => {
  const inicio = startOfMonth(new Date(data))
  const fim = endOfMonth(new Date(data))
  return eachDayOfInterval({ start: inicio, end: fim })
}

export const semanaAnterior = (data) => addWeeks(new Date(data), -1)
export const proximaSemana = (data) => addWeeks(new Date(data), 1)
export const mesAnterior = (data) => addMonths(new Date(data), -1)
export const proximoMes = (data) => addMonths(new Date(data), 1)

export const nomeDiaSemana = (data) =>
  format(new Date(data), 'EEE', { locale: pt })

export const nomeMes = (data) =>
  format(new Date(data), 'MMMM yyyy', { locale: pt })
