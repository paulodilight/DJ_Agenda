import { clsx } from 'clsx'

const tamanhos = {
  sm:  'w-9 h-9 text-sm',
  md:  'w-12 h-12 text-lg',
  lg:  'w-24 h-24 text-4xl',
  xl:  'w-36 h-36 text-5xl',
  '2xl': 'w-44 h-44 text-6xl',
}

/**
 * Avatar do colaborador — mostra a foto se existir, senão a inicial do nome.
 * @param {{ nome?: string, foto?: string, tamanho?: keyof tamanhos, anel?: boolean, className?: string }} props
 */
export function Avatar({ nome, foto, tamanho = 'md', anel, className }) {
  const inicial = (nome ?? '?').trim().charAt(0).toUpperCase()
  return (
    <div
      className={clsx(
        'relative rounded-full overflow-hidden shrink-0 flex items-center justify-center font-bold select-none',
        'bg-surface-3 text-accent-muted border border-border',
        anel && 'ring-2 ring-amber-400/50 ring-offset-2 ring-offset-surface-0',
        tamanhos[tamanho],
        className,
      )}
    >
      {foto ? (
        <img src={foto} alt={nome ?? ''} className="w-full h-full object-cover" />
      ) : (
        <span>{inicial}</span>
      )}
    </div>
  )
}
