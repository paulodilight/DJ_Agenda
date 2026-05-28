import { clsx } from 'clsx'
import { useDraggable } from '@dnd-kit/core'
import { Sparkles } from 'lucide-react'

export function SlotChip({ slot, isLock, onClick, onClickVazio, onSugerir, dimmed = false, dragId, dragData, conflito = false }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: dragId ?? 'chip-empty',
    disabled: !dragId,
    data: dragData,
  })

  // ── Célula vazia (sem slot criado) ──────────────────────────────────────────
  if (!slot) {
    return (
      <button
        onClick={onClickVazio}
        className={clsx(
          'w-full px-2 py-1 rounded border border-dashed min-h-[34px] flex items-center justify-center transition-colors',
          dimmed
            // Dia não operacional — fundo muito escuro, + quase invisível
            ? 'border-surface-4/15 bg-black/[0.35] text-white/[0.07] hover:text-white/20 hover:border-surface-4/40'
            // Dia operacional normal
            : 'border-surface-4 bg-surface-2 text-accent-subtle/40 hover:text-accent-subtle hover:border-border'
        )}
      >
        +
      </button>
    )
  }

  const temDJ      = !!slot.dj_nome
  const isManual   = temDJ && !slot.dj_id        // DJ externo (sem registo na BD)
  const isProposta  = temDJ && slot.estado === 'proposta'
  const isSemEfeito = slot.estado === 'sem_efeito'
  const isAPedido   = slot.estado === 'a_pedido'

  // ── Slot com ou sem DJ ───────────────────────────────────────────────────────
  const chip = (
    <button
      ref={setNodeRef}
      {...(dragId ? listeners : {})}
      {...(dragId ? attributes : {})}
      onClick={(e) => { if (!isDragging) onClick?.(e) }}
      className={clsx(
        'w-full text-center px-2 py-1 rounded border transition-colors min-h-[34px] flex items-center justify-center',
        dragId && 'cursor-grab active:cursor-grabbing',
        isDragging && 'opacity-30',
        // Extra right padding to leave room for the Sparkles button
        onSugerir && !isSemEfeito && !isLock && 'pr-5',
        conflito
          ? 'border-red-500/60 bg-red-500/15 hover:bg-red-500/25'
          : isSemEfeito
            ? 'border-white/[0.07] border-dashed bg-surface-1/50 hover:bg-surface-2'
            : isAPedido
              ? 'border-violet-400/35 bg-violet-400/[0.13] hover:bg-violet-400/20'
              : isLock
                ? 'border-status-lock/35 bg-status-lock/[0.13] hover:bg-status-lock/20'
                : isProposta
                  ? 'border-status-proposta/40 bg-status-proposta/[0.17] hover:bg-status-proposta/25'
                  : isManual
                    ? 'border-yellow-400/35 bg-yellow-400/[0.11] hover:bg-yellow-400/20'
                    : temDJ
                      ? 'border-status-confirmado/35 bg-status-confirmado/[0.13] hover:bg-status-confirmado/20'
                      : 'border-surface-4 bg-surface-3 hover:bg-surface-4 hover:border-border'
      )}
    >
      {isSemEfeito ? (
        <span className="text-xs text-accent-subtle/40 italic">
          {temDJ ? <s>{slot.dj_nome}</s> : 'Sem Efeito'}
        </span>
      ) : (
        <span className={clsx(
          'text-xs truncate',
          conflito
            ? 'font-semibold text-red-400'
            : isAPedido
              ? 'font-semibold text-violet-300'
              : isLock
                ? 'font-semibold text-status-lock'
                : isProposta
                  ? 'font-semibold text-status-proposta'
                  : isManual
                    ? 'font-semibold text-yellow-300'
                    : temDJ
                      ? 'font-semibold text-status-confirmado'
                      : 'italic text-accent-subtle'
        )}>
          {isLock ? 'LOCK' : temDJ ? slot.dj_nome : 'Sem DJ'}
        </span>
      )}
    </button>
  )

  if (!onSugerir || isSemEfeito || isLock) return chip

  return (
    <div className="relative group/chip">
      {chip}
      <button
        onClick={(e) => { e.stopPropagation(); onSugerir() }}
        title="Sugerir DJ"
        className="absolute top-0.5 right-0.5 w-4 h-4 rounded flex items-center justify-center
          opacity-0 group-hover/chip:opacity-100 transition-opacity
          bg-black/30 hover:bg-black/60 text-accent-subtle hover:text-accent"
      >
        <Sparkles size={9} />
      </button>
    </div>
  )
}
