import { format } from 'date-fns'
import { pt } from 'date-fns/locale'

const dt = (data) => new Date(`${data}T00:00:00`)

export const hhmm = (t) => (t ? String(t).slice(0, 5) : null)
export const dataLonga = (data) => (data ? format(dt(data), "EEE, d 'de' MMM", { locale: pt }) : null)
export const dataCurta = (data) => (data ? format(dt(data), 'd MMM', { locale: pt }) : null)
export const diaSemana    = (data) => (data ? format(dt(data), 'EEEE', { locale: pt }) : null)
const cap1 = (s) => s ? s.charAt(0).toUpperCase() + s.slice(1) : s
export const dataCompleta = (data) => data ? cap1(format(dt(data), "EEEE, d 'de' MMMM 'de' yyyy", { locale: pt })) : null
