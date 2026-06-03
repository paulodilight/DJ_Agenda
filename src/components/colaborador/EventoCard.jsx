import { useState } from 'react'
import { clsx } from 'clsx'
import {
  MapPin, Phone, User, Wrench, CalendarDays, RotateCw, ChevronLeft,
  Save, StickyNote, Boxes, CalendarClock,
} from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { labelEstado } from '@/utils/formatacao'
import { colaboradorApi } from '@/lib/colaboradorApi'
import { hhmm, dataLonga } from './format'

const statusVar = (s) =>
  ({ confirmado: 'confirmado', proposta: 'proposta', cancelado: 'cancelado' }[s] ?? 'default')

const mapaUrl = (v) => /^https?:\/\//i.test(v)
  ? v
  : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(v)}`

function Campo({ Icone, rotulo, valor, isLink }) {
  if (!valor) return null
  return (
    <div className="flex items-start gap-2">
      <Icone size={14} className="text-accent-subtle mt-0.5 shrink-0" />
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-wider text-accent-subtle">{rotulo}</p>
        {isLink
          ? <a href={mapaUrl(valor)} target="_blank" rel="noopener noreferrer"
              className="text-sm text-amber-400 underline underline-offset-2 hover:text-amber-400/80 break-words">
              {valor}
            </a>
          : <p className="text-sm text-accent break-words">{valor}</p>
        }
      </div>
    </div>
  )
}

function LogoCliente({ logo, nome }) {
  return (
    <div className="w-10 h-10 rounded-xl bg-surface-2 border border-border flex items-center justify-center shrink-0 overflow-hidden">
      {logo
        ? <img src={logo} alt={nome || ''} className="w-full h-full object-cover" />
        : <span className="text-sm font-bold text-accent-subtle">{(nome || '?').charAt(0).toUpperCase()}</span>}
    </div>
  )
}

export function EventoCard({ evento, mapaTecnicos = {}, className }) {
  const [verso, setVerso] = useState(false)
  const [notas, setNotas] = useState(evento.notas_colaborador ?? '')
  const [guardando, setGuardando] = useState(false)
  const [guardado, setGuardado] = useState(false)
  const [erro, setErro] = useState(null)

  const logo    = evento.espacos?.logo_url
  const cliente = evento.espacos?.nome || evento.cliente || null
  const morada  = evento.morada || null
  const tecnico = mapaTecnicos[evento.tecnico_id] || evento.responsavel || null
  const horas   = [hhmm(evento.hora_inicio), hhmm(evento.hora_fim)].filter(Boolean).join(' – ') || null
  const instalacao =
    evento.dia_instalacao || evento.hora_instalacao
      ? [dataLonga(evento.dia_instalacao), hhmm(evento.hora_instalacao)].filter(Boolean).join(' · ')
      : null

  const guardar = async () => {
    setGuardando(true); setErro(null)
    try {
      await colaboradorApi.guardarNotasColaborador(evento.id, notas)
      setGuardado(true)
      setTimeout(() => setGuardado(false), 2000)
    } catch (e) { setErro(e.message) }
    finally { setGuardando(false) }
  }

  return (
    <div className={clsx('[perspective:1400px]', className)}>
      <div className={clsx(
        'relative transition-transform duration-500 [transform-style:preserve-3d] min-h-[400px]',
        verso && '[transform:rotateY(180deg)]',
      )}>

        {/* ── Frente ── */}
        <div className="absolute inset-0 [backface-visibility:hidden] bg-surface-1 border border-border rounded-2xl p-5 flex flex-col">
          {/* Header com logo */}
          <div className="flex items-start gap-3 mb-4">
            <LogoCliente logo={logo} nome={cliente || evento.evento} />
            <div className="flex-1 min-w-0">
              <h3 className="text-base font-bold text-accent truncate">{evento.evento || 'Evento'}</h3>
              {evento.tipo && <p className="text-xs text-accent-muted mt-0.5">{evento.tipo}</p>}
            </div>
            {evento.status && <Badge variante={statusVar(evento.status)}>{labelEstado(evento.status)}</Badge>}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 flex-1 content-start">
            <Campo Icone={CalendarClock} rotulo="Data do evento"       valor={[dataLonga(evento.data_evento), horas].filter(Boolean).join(' · ')} />
            <Campo Icone={Wrench}        rotulo="Instalação"            valor={instalacao} />
            <Campo Icone={User}          rotulo="Cliente"               valor={cliente} />
            <Campo Icone={User}          rotulo="Técnico responsável"   valor={tecnico} />
            <Campo Icone={Phone}         rotulo="Contacto"              valor={evento.contacto_pelo_evento} />
            <Campo Icone={MapPin}        rotulo="Morada"                valor={morada} isLink />
          </div>

          <button onClick={() => setVerso(true)}
            className="mt-4 self-end flex items-center gap-1.5 text-xs font-medium text-amber-400 hover:text-amber-400/80 transition-colors">
            <RotateCw size={13} /> Notas &amp; equipamento
          </button>
        </div>

        {/* ── Verso ── */}
        <div className="absolute inset-0 [backface-visibility:hidden] [transform:rotateY(180deg)] bg-surface-1 border border-border rounded-2xl p-5 flex flex-col">
          <div className="flex items-center justify-between gap-3 mb-3">
            <button onClick={() => setVerso(false)} className="flex items-center gap-1 text-xs text-accent-subtle hover:text-accent">
              <ChevronLeft size={14} /> Detalhes
            </button>
            <h3 className="text-sm font-semibold text-accent truncate">{evento.evento || 'Evento'}</h3>
          </div>

          <div className="flex flex-col gap-3 flex-1 overflow-y-auto pr-1">
            {/* Notas do evento */}
            <div>
              <p className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-accent-subtle mb-1.5">
                <StickyNote size={12} /> Notas do evento
              </p>
              <p className={clsx(
                'text-sm whitespace-pre-wrap rounded-lg px-3 py-2 border',
                evento.notas_operacionais ? 'text-accent-muted bg-surface-2 border-border' : 'text-accent-subtle/40 italic bg-surface-2/40 border-border/40',
              )}>
                {evento.notas_operacionais || 'Sem notas de evento.'}
              </p>
            </div>
            {/* Equipamentos */}
            <div>
              <p className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-accent-subtle mb-1.5">
                <Boxes size={12} /> Equipamentos
              </p>
              <p className={clsx(
                'text-sm whitespace-pre-wrap rounded-lg px-3 py-2 border',
                evento.Equipamentos ? 'text-accent-muted bg-surface-2 border-border' : 'text-accent-subtle/40 italic bg-surface-2/40 border-border/40',
              )}>
                {evento.Equipamentos || 'Sem equipamentos definidos.'}
              </p>
            </div>
            {/* As minhas notas */}
            <div>
              <p className="text-[10px] uppercase tracking-wider text-accent-subtle mb-1.5">As minhas notas</p>
              <textarea
                value={notas}
                onChange={e => setNotas(e.target.value)}
                rows={3}
                placeholder="Adiciona notas antes ou depois do evento…"
                className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm text-accent placeholder:text-accent-subtle/50 focus:outline-none focus:border-white/25 resize-none"
              />
            </div>
          </div>

          {erro && <p className="text-xs text-status-cancelado mt-2">{erro}</p>}
          <button onClick={guardar} disabled={guardando}
            className="mt-3 self-end inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-white text-black text-sm font-medium hover:bg-white/90 disabled:opacity-40 transition-colors">
            <Save size={14} /> {guardando ? 'A guardar…' : guardado ? 'Guardado ✓' : 'Guardar notas'}
          </button>
        </div>
      </div>
    </div>
  )
}
