export function EmptyState({ icone: Icone, titulo, descricao, accao }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
      {Icone && <Icone size={32} className="text-accent-subtle" />}
      <p className="text-sm font-medium text-accent-muted">{titulo}</p>
      {descricao && <p className="text-xs text-accent-subtle max-w-xs">{descricao}</p>}
      {accao && <div className="mt-2">{accao}</div>}
    </div>
  )
}
