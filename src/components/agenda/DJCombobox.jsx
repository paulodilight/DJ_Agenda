/**
 * DJCombobox — selector de DJ com pesquisa e criação rápida.
 *
 * Props:
 *   value       — dj_id actualmente seleccionado
 *   onChange    — (dj_id) => void
 *   djs         — lista de DJs disponíveis
 *   label       — label do campo
 *   placeholder — placeholder
 *   onCriado    — (novoDJ) => void — chamado quando um DJ é criado
 *   onlyConvidados — bool — se true, filtra categorias 3,4,5 (convidados)
 */
import { useState, useRef, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { ExternalLink, Plus, User } from 'lucide-react'
import { clsx } from 'clsx'

const CAT_CONVIDADO_EXT = 4  // DJ Convidado EXT

export function DJCombobox({
  value, onChange, djs = [], label, placeholder = 'Pesquisar DJ…',
  onCriado, onlyConvidados = false, onQueryChange,
}) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [criando, setCriando] = useState(false)
  const inputRef = useRef(null)
  const containerRef = useRef(null)

  // Nome do DJ seleccionado
  const djSel = djs.find((d) => d.id === value)
  const nomeSel = djSel ? (djSel.nome_artistico || djSel.nome) : ''

  // Quando fecha: se há DJ seleccionado mostra o nome; se não há, mantém o texto digitado
  useEffect(() => {
    if (!open && value) setQuery(nomeSel)
  }, [open, nomeSel, value])

  useEffect(() => {
    if (open) setQuery('')
  }, [open])

  // Fechar ao clicar fora
  useEffect(() => {
    function handle(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [])

  const djsFiltrados = djs.filter((d) => {
    const nome = (d.nome_artistico || d.nome || '').toLowerCase()
    return nome.includes(query.toLowerCase())
  })

  const mostraCriar = query.trim().length >= 2 &&
    !djsFiltrados.some((d) => (d.nome_artistico || d.nome || '').toLowerCase() === query.trim().toLowerCase())

  async function criarDJ() {
    if (criando) return
    setCriando(true)
    try {
      const nome = query.trim()
      // 1. Criar DJ
      const { data: novoDJ, error } = await supabase
        .from('djs')
        .insert({
          nome,
          nome_artistico: nome,
          estado: 'activo',
          app_abas: onlyConvidados ? ['agenda', 'dados', 'club'] : null,
          qualidade_artistica: 0, assiduidade: 0, profissionalismo: 0, adaptacao_espaco: 0,
          prioridade_admin: 0, excluido_admin: false,
        })
        .select()
        .single()
      if (error) throw error

      // 2. Associar categoria
      const categoriaId = onlyConvidados ? CAT_CONVIDADO_EXT : null
      if (categoriaId) {
        await supabase.from('dj_categorias').insert({ dj_id: novoDJ.id, categoria_id: categoriaId })
        // Nota: categoria INT (3) nunca usada aqui — convidados criados são sempre EXT (4)
      }

      onChange(novoDJ.id)
      onQueryChange?.('')
      setOpen(false)
      onCriado?.(novoDJ)
    } catch (e) {
      console.error('Erro ao criar DJ:', e.message)
    } finally {
      setCriando(false)
    }
  }

  return (
    <div ref={containerRef} className="relative flex flex-col gap-1">
      {label && <label className="text-[11px] font-semibold text-accent-muted uppercase tracking-wider">{label}</label>}

      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={open ? query : (value ? nomeSel : query)}
          placeholder={placeholder}
          onFocus={() => { setOpen(true); setQuery('') }}
          onChange={(e) => { const q = e.target.value; setQuery(q); onQueryChange?.(q); if (!open) setOpen(true) }}
          className="w-full rounded border border-border bg-surface-2 px-3 py-2 text-sm text-accent placeholder:text-accent-subtle focus:outline-none focus:border-white/20 transition-colors"
        />
        {(value || query) && !open && (
          <button
            type="button"
            tabIndex={-1}
            onClick={() => { onChange(''); setQuery(''); onQueryChange?.('') }}
            title="Limpar"
            className="absolute right-2 top-1/2 -translate-y-1/2 text-accent-subtle hover:text-accent text-xs px-1"
          >✕</button>
        )}
      </div>

      {open && (
        <div className="absolute top-full left-0 right-0 z-50 mt-1 max-h-60 overflow-y-auto rounded border border-border bg-surface-0 shadow-xl">
          {djsFiltrados.length === 0 && !mostraCriar && (
            <div className="px-3 py-2 text-xs text-accent-subtle italic">Sem resultados</div>
          )}

          {djsFiltrados.map((d) => (
            <button
              key={d.id}
              type="button"
              onClick={() => { onChange(d.id); onQueryChange?.(''); setOpen(false) }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-surface-2 transition-colors"
            >
              <User size={12} className="text-accent-subtle shrink-0" />
              <span className="text-accent">{d.nome_artistico || d.nome}</span>
              {d.nome_artistico && <span className="text-xs text-accent-subtle">({d.nome})</span>}
            </button>
          ))}

          {mostraCriar && (
            <button
              type="button"
              onClick={criarDJ}
              disabled={criando}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-status-confirmado hover:bg-status-confirmado/10 transition-colors border-t border-border"
            >
              <Plus size={13} className="shrink-0" />
              {criando ? 'A criar…' : `Criar "${query.trim()}"${onlyConvidados ? ' como DJ Convidado EXT' : ''}`}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

/** Link discreto após criar um DJ — não bloqueia o fluxo */
export function NovoDJLink({ dj, onDismiss }) {
  if (!dj) return null
  return (
    <div className="flex items-center gap-1.5 text-[11px] text-accent-subtle/70 px-1">
      <span>✓ DJ criado</span>
      <span className="text-white/20">·</span>
      <a
        href={`/djs/${dj.id}`}
        target="_blank"
        rel="noreferrer"
        className="flex items-center gap-0.5 text-accent-subtle hover:text-accent underline underline-offset-2 transition-colors"
      >
        Completar perfil <ExternalLink size={9} />
      </a>
      <button type="button" onClick={onDismiss} className="ml-auto text-white/20 hover:text-white/50 transition-colors">✕</button>
    </div>
  )
}
