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
  proposta:         'Proposta',
  'aceitação':      'Aceitação',
  'validação':      'Validação',
  'pré-confirmado': 'Pré-confirmado',
  confirmado:       'Confirmado',
  trocado:          'Trocado',
  cancelado:        'Cancelado',
  a_pedido:         'A pedido',
  presente:         'Presente',
  faltou:           'Faltou',
})[estado] ?? estado

export const corEstado = (estado) => ({
  proposta:         'text-status-proposta',
  'aceitação':      'text-orange-400',
  'validação':      'text-violet-400',
  'pré-confirmado': 'text-sky-400',
  confirmado:       'text-status-confirmado',
  presente:         'text-status-confirmado',
  trocado:          'text-zinc-400',
  cancelado:        'text-status-cancelado',
  a_pedido:         'text-amber-600',
  faltou:           'text-orange-400',
  lock:             'text-status-lock',
})[estado] ?? 'text-accent-muted'

export const bgEstado = (estado) => ({
  proposta:         'bg-status-proposta/10 border-status-proposta/30',
  'aceitação':      'bg-orange-500/10 border-orange-500/30',
  'validação':      'bg-violet-500/10 border-violet-500/30',
  'pré-confirmado': 'bg-sky-500/10 border-sky-500/30',
  confirmado:       'bg-status-confirmado/10 border-status-confirmado/30',
  presente:         'bg-status-confirmado/10 border-status-confirmado/30',
  trocado:          'bg-zinc-500/10 border-zinc-500/30',
  cancelado:        'bg-status-cancelado/10 border-status-cancelado/30',
  a_pedido:         'bg-amber-600/10 border-amber-600/30',
  faltou:           'bg-orange-500/10 border-orange-500/30',
  lock:             'bg-status-lock/10 border-status-lock/30',
})[estado] ?? 'bg-surface-3 border-border'
