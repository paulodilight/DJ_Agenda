// Mapa de cores por primeiro nome (sem acentos, lowercase)
const MAPA_NOMES = {
  marcio: 'green',
  pedro:  'red',
  wilson: 'blue',
  paulo:  'amber',
}

// Paleta de fallback para nomes não mapeados (por índice)
const PALETA_FALLBACK = ['amber', 'cyan', 'pink', 'orange', 'teal']

const ESTILOS = {
  green:  {
    chip:   'bg-status-confirmado/15 text-status-confirmado border-status-confirmado/30',
    avatar: 'bg-status-confirmado/20 text-status-confirmado border-status-confirmado/30',
    btn:    'bg-status-confirmado/15 text-status-confirmado border-status-confirmado/30',
    dot:    'bg-status-confirmado',
    text:   'text-status-confirmado',
    row:    'bg-status-confirmado/[0.06]',
  },
  red:    {
    chip:   'bg-red-400/15 text-red-400 border-red-400/30',
    avatar: 'bg-red-400/20 text-red-400 border-red-400/30',
    btn:    'bg-red-400/15 text-red-400 border-red-400/30',
    dot:    'bg-red-400',
    text:   'text-red-400',
    row:    'bg-red-400/[0.06]',
  },
  blue:   {
    chip:   'bg-blue-400/15 text-blue-400 border-blue-400/30',
    avatar: 'bg-blue-400/20 text-blue-400 border-blue-400/30',
    btn:    'bg-blue-400/15 text-blue-400 border-blue-400/30',
    dot:    'bg-blue-400',
    text:   'text-blue-400',
    row:    'bg-blue-400/[0.06]',
  },
  violet: {
    chip:   'bg-violet-400/15 text-violet-400 border-violet-400/30',
    avatar: 'bg-violet-400/20 text-violet-400 border-violet-400/30',
    btn:    'bg-violet-400/15 text-violet-400 border-violet-400/30',
    dot:    'bg-violet-400',
    text:   'text-violet-400',
    row:    'bg-violet-400/[0.06]',
  },
  amber:  {
    chip:   'bg-amber-400/15 text-amber-400 border-amber-400/30',
    avatar: 'bg-amber-400/20 text-amber-400 border-amber-400/30',
    btn:    'bg-amber-400/15 text-amber-400 border-amber-400/30',
    dot:    'bg-amber-400',
    text:   'text-amber-400',
    row:    'bg-amber-400/[0.06]',
  },
  cyan:   {
    chip:   'bg-cyan-400/15 text-cyan-400 border-cyan-400/30',
    avatar: 'bg-cyan-400/20 text-cyan-400 border-cyan-400/30',
    btn:    'bg-cyan-400/15 text-cyan-400 border-cyan-400/30',
    dot:    'bg-cyan-400',
    text:   'text-cyan-400',
    row:    'bg-cyan-400/[0.06]',
  },
  pink:   {
    chip:   'bg-pink-400/15 text-pink-400 border-pink-400/30',
    avatar: 'bg-pink-400/20 text-pink-400 border-pink-400/30',
    btn:    'bg-pink-400/15 text-pink-400 border-pink-400/30',
    dot:    'bg-pink-400',
    text:   'text-pink-400',
    row:    'bg-pink-400/[0.06]',
  },
  orange: {
    chip:   'bg-orange-400/15 text-orange-400 border-orange-400/30',
    avatar: 'bg-orange-400/20 text-orange-400 border-orange-400/30',
    btn:    'bg-orange-400/15 text-orange-400 border-orange-400/30',
    dot:    'bg-orange-400',
    text:   'text-orange-400',
    row:    'bg-orange-400/[0.06]',
  },
}

function normalizar(nome) {
  return (nome ?? '')
    .toLowerCase()
    .split(' ')[0]
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
}

export function corTecnico(nome, indexFallback = 0) {
  const chave = normalizar(nome)
  const cor = MAPA_NOMES[chave] ?? PALETA_FALLBACK[indexFallback % PALETA_FALLBACK.length]
  return ESTILOS[cor] ?? ESTILOS.green
}
