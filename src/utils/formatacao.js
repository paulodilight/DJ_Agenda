export const formatarEuro = (valor) => {
  if (valor == null) return '—'
  return new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(valor)
}

export const labelTipo = (tipo) => ({
  BAN: 'BAN',
  LOCK: 'LOCK',
  SWAP: 'SWAP',
})[tipo] ?? tipo

export const labelEstadoDJ = (estado) => ({
  activo:     'Activo',
  activo_ext: 'Activo EXT',
  inactivo:   'Inactivo',
  banido:     'Banido',
})[estado] ?? estado

export const labelTipoEspaco = (tipo) => ({
  club: 'Club',
  bar: 'Bar',
  hotel: 'Hotel',
  restaurante: 'Restaurante',
})[tipo] ?? tipo

export const labelEstado = (estado) => ({
  proposta: 'Proposta',
  confirmado: 'Confirmado',
  presente: 'Presente',
  faltou: 'Faltou',
  cancelado: 'Cancelado',
})[estado] ?? estado

export const corEstado = (estado) => ({
  confirmado: 'text-status-confirmado',
  presente:   'text-status-confirmado',
  proposta:   'text-status-proposta',
  cancelado:  'text-status-cancelado',
  faltou:     'text-orange-400',
  lock:       'text-status-lock',
})[estado] ?? 'text-accent-muted'

export const bgEstado = (estado) => ({
  confirmado: 'bg-status-confirmado/10 border-status-confirmado/30',
  presente:   'bg-status-confirmado/10 border-status-confirmado/30',
  proposta:   'bg-status-proposta/10 border-status-proposta/30',
  cancelado:  'bg-status-cancelado/10 border-status-cancelado/30',
  faltou:     'bg-orange-500/10 border-orange-500/30',
  lock:       'bg-status-lock/10 border-status-lock/30',
})[estado] ?? 'bg-surface-3 border-border'
