import { AlertTriangle } from 'lucide-react'

export function ColaboradorOcorrencias() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-3 py-16 px-6 text-center">
      <AlertTriangle size={36} className="text-amber-400/40" />
      <p className="text-accent font-semibold">Ocorrências</p>
      <p className="text-[13px] text-accent-subtle">Em breve poderás registar e consultar ocorrências aqui.</p>
    </div>
  )
}
