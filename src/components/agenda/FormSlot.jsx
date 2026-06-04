import { useState, useEffect } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Input, Select, Textarea } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { Alerta } from '@/components/ui/Alerta'
import { Badge } from '@/components/ui/Badge'
import { agendaApi } from '@/lib/api'
import { useUndo } from '@/contexts/UndoContext'
import { supabase } from '@/lib/supabase'
import { useDJs } from '@/hooks/useDJs'
import { useEspacos } from '@/hooks/useEspacos'
import { validarSlot } from '@/lib/regras'
import { useAppStore } from '@/store'
import { useBloqueios } from '@/hooks/useBloqueios'
import { useAgenda } from '@/hooks/useAgenda'
import { formatarEuro } from '@/utils/formatacao'
import { formatarData, formatarHora } from '@/utils/datas'
import { FormEvento } from '@/components/eventos/FormEvento'
import { clsx } from 'clsx'
import { CalendarPlus } from 'lucide-react'

const ESTADO_OPCOES = [
  { value: 'proposta',    label: 'Proposta' },
  { value: 'confirmado',  label: 'Confirmado' },
  { value: 'a_pedido',    label: 'A pedido' },
  { value: 'presente',    label: 'Presente' },
  { value: 'faltou',      label: 'Faltou' },
  { value: 'cancelado',   label: 'Cancelado' },
  { value: 'sem_efeito',  label: 'Sem Efeito' },
]

const vazio = {
  dj_id: '', dj_externo: '', espaco_id: '', data: '', hora_inicio: '22:00', hora_fim: '02:00',
  valor: '', margem: '', estado: 'confirmado', evento: '', notas: '',
}

export function FormSlot({ aberto, slot, onFechar, onGuardado, simplificado = false, conflito = false }) {
  const [form, setForm] = useState(vazio)
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState(null)
  const [conflitos, setConflitos] = useState([])
  const [eventoFormAberto, setEventoFormAberto] = useState(false)
  const { pushUndo } = useUndo()
  const [conflitoCrossEspaco, setConflitoCrossEspaco] = useState(null) // bloqueia guardar
  const [avisoMeta, setAvisoMeta] = useState(null)                      // avisa mas permite
  const [bloqueioIndisponivel, setBloqueioIndisponivel] = useState(null) // bloqueia guardar
  const [avisoOptIn, setAvisoOptIn] = useState(null)                     // avisa mas permite
  const [verificacaoFeita, setVerificacaoFeita] = useState(false)        // async já correu

  const { djs } = useDJs()
  const { espacos } = useEspacos()
  const { bloqueios } = useBloqueios()
  const { agenda } = useAgenda()
  const config = useAppStore((s) => s.config)

  useEffect(() => {
    if (aberto && slot) {
      setForm({
        ...vazio,
        ...slot,
        valor: slot.valor ?? '',
        hora_inicio: slot.hora_inicio?.slice(0, 5) ?? '22:00',
        hora_fim: slot.hora_fim?.slice(0, 5) ?? '02:00',
        evento: slot.evento ?? '',
        notas: slot.notas ?? '',
        estado: slot.estado ?? 'confirmado',
        // DJ externo: carregado quando o slot tem nome mas não tem dj_id (da base)
        dj_externo: !slot.dj_id && slot.dj_nome ? slot.dj_nome : '',
        margem: slot.margem ?? '',
      })
      setLoading(false)
      setErro(null)
      setConflitos([])
      setConflitoCrossEspaco(null)
      setAvisoMeta(null)
      setBloqueioIndisponivel(null)
      setAvisoOptIn(null)
      setVerificacaoFeita(false)
    }
  }, [aberto, slot, simplificado])

  const set = (campo) => (e) => setForm((f) => ({ ...f, [campo]: e.target.value }))

  // DJ da base e DJ externo são mutuamente exclusivos
  const setDjId = (e) => setForm((f) => ({ ...f, dj_id: e.target.value, dj_externo: e.target.value ? '' : f.dj_externo }))
  const setDjExterno = (e) => setForm((f) => ({ ...f, dj_externo: e.target.value, dj_id: e.target.value.trim() ? '' : f.dj_id }))

  useEffect(() => {
    if (simplificado) { setConflitos([]); return }
    if (!form.dj_id || !form.espaco_id || !form.data) { setConflitos([]); return }
    const dj = djs.find((d) => d.id === form.dj_id)
    const espaco = espacos.find((e) => e.id === form.espaco_id)
    if (!dj || !espaco) return
    const agendaSemActual = agenda.filter((a) => a.id !== slot?.id)
    const c = validarSlot({
      djId: form.dj_id, espacoId: form.espaco_id, data: form.data,
      valorDJ: dj.valor_sessao,
      bloqueios, agenda: agendaSemActual, espaco, config, espacos,
    })
    setConflitos(c)
  }, [form.dj_id, form.espaco_id, form.data, djs, espacos, bloqueios, agenda, config, slot?.id, simplificado])

  // Validações live: conflito cross-Cliente (bloqueia) + meta mensal (avisa)
  useEffect(() => {
    if (!form.dj_id || !form.data) {
      setConflitoCrossEspaco(null)
      setAvisoMeta(null)
      setBloqueioIndisponivel(null)
      setAvisoOptIn(null)
      setVerificacaoFeita(true)  // sem dj_id — nada a verificar, banner genérico mantém-se
      return  // DJ externo (sem dj_id) ou data vazia — sem validações de base
    }
    const espacoIdActual = form.espaco_id || slot?.espaco_id || ''

    const verificar = async () => {
      // ── 1. Conflito cross-Cliente ─────────────────────────────────────────
      // Bloqueia se o DJ já tiver slot noutro Cliente nesta data
      let qCross = supabase
        .from('agenda')
        .select('id, espaco_id, espacos!agenda_espaco_id_fkey(nome)')
        .eq('dj_id', form.dj_id)
        .eq('data', form.data)
        .neq('estado', 'cancelado')
      if (slot?.id) qCross = qCross.neq('id', slot.id)

      const { data: slotsNaData } = await qCross
      const conflito = (slotsNaData ?? []).find(s => s.espaco_id !== espacoIdActual)
      setConflitoCrossEspaco(
        conflito
          ? `🔴 DJ no mesmo dia noutro Cliente · já está em "${conflito.espacos?.nome ?? 'outro Cliente'}" — não é possível guardar`
          : null
      )

      // ── 2. Meta mensal ───────────────────────────────────────────────────
      // Avisa (não bloqueia) se meta_datas_mes estiver atingida
      const dj = djs.find(d => d.id === form.dj_id)
      if (dj?.meta_datas_mes > 0) {
        const mesAno = form.data.slice(0, 7)
        const [ano, mes] = mesAno.split('-').map(Number)
        const ultimoDia = new Date(ano, mes, 0).getDate()
        const mesInicio = `${mesAno}-01`
        const mesFim    = `${mesAno}-${String(ultimoDia).padStart(2, '0')}`

        let qMeta = supabase
          .from('agenda')
          .select('id', { count: 'exact', head: true })
          .eq('dj_id', form.dj_id)
          .gte('data', mesInicio)
          .lte('data', mesFim)
          .neq('estado', 'cancelado')
        if (slot?.id) qMeta = qMeta.neq('id', slot.id)

        const { count } = await qMeta
        const total = count ?? 0
        setAvisoMeta(
          total >= dj.meta_datas_mes
            ? `Meta mensal atingida: ${total}/${dj.meta_datas_mes} atuações em ${mesAno.replace('-', '/')} — podes guardar na mesma`
            : null
        )
      } else {
        setAvisoMeta(null)
      }

      // ── 3. Disponibilidade do DJ nesta data ──────────────────────────────
      // Bloqueia se disponivel=false; avisa se DJ tem opt-in no mês mas esta data não consta
      const mesAno = form.data.slice(0, 7)
      const [anoD, mesD] = mesAno.split('-').map(Number)
      const ultimoDiaD = new Date(anoD, mesD, 0).getDate()
      const mesInicioD = `${mesAno}-01`
      const mesFimD    = `${mesAno}-${String(ultimoDiaD).padStart(2, '0')}`

      const { data: dispMes } = await supabase
        .from('disponibilidades')
        .select('data, disponivel')
        .eq('dj_id', form.dj_id)
        .gte('data', mesInicioD)
        .lte('data', mesFimD)

      const registos = dispMes ?? []
      const indisponivel = registos.find(r => r.data === form.data && r.disponivel === false)
      const optIns = registos.filter(r => r.disponivel === true)

      if (indisponivel) {
        const dj = djs.find(d => d.id === form.dj_id)
        const nomeDJ = dj?.nome_artistico || dj?.nome || 'DJ'
        setBloqueioIndisponivel(`🚫 Indisponível · ${nomeDJ} marcou esta data como indisponível — não é possível agendar`)
        setAvisoOptIn(null)
      } else {
        setBloqueioIndisponivel(null)
        if (optIns.length > 0 && !optIns.find(r => r.data === form.data)) {
          const dj = djs.find(d => d.id === form.dj_id)
          const nomeDJ = dj?.nome_artistico || dj?.nome || 'DJ'
          setAvisoOptIn(`📅 Sem disponibilidade · ${nomeDJ} não indicou esta data (tem opt-in noutros dias do mês)`)
        } else {
          setAvisoOptIn(null)
        }
      }
      setVerificacaoFeita(true)
    }

    verificar()
  }, [form.dj_id, form.data, form.espaco_id, slot?.id, slot?.espaco_id, djs])

  const guardar = async (e) => {
    e.preventDefault()
    if (conflitoCrossEspaco || bloqueioIndisponivel) return  // bloqueado — não deve chegar aqui mas por segurança
    setErro(null)
    setLoading(true)
    try {
      const isConvidado = !!form.dj_externo?.trim()
      const payload = {
        ...form,
        dj_id:     form.dj_id || null,
        dj_nome:   isConvidado ? form.dj_externo.trim() : null,
        espaco_id: form.espaco_id || null,
        valor:     form.valor  === '' ? null : Number(form.valor),
        margem:    form.margem === '' ? null : Number(form.margem),
        tipo_slot: isConvidado ? 'convidado' : (form.tipo_slot || 'residente'),
        evento:    form.evento.trim() || null,
        notas:     form.notas.trim() || null,
        origem:    'manual',
      }
      if (slot?.id) {
        await agendaApi.actualizar(slot.id, payload)
      } else {
        await agendaApi.criar(payload)
      }
      onGuardado()
      onFechar()
    } catch (e) {
      setErro(e.message)
    } finally {
      setLoading(false)
    }
  }

  const apagar = async () => {
    if (!confirm('Apagar esta atuação?')) return
    setLoading(true)
    try {
      const backup = { ...slot }
      await agendaApi.apagar(slot.id)
      pushUndo({
        label: `Atuação apagada (${backup.data ?? ''})`,
        undo: async () => { await agendaApi.criar(backup); onGuardado() },
      })
      onGuardado()
      onFechar()
    } catch (e) {
      setErro(e.message)
    } finally {
      setLoading(false)
    }
  }

  const confirmar = async () => {
    setLoading(true)
    try {
      await agendaApi.mudarEstado(slot.id, 'confirmado')
      onGuardado()
      onFechar()
    } catch (e) {
      setErro(e.message)
      setLoading(false)
    }
  }

  const toggleSemEfeito = async () => {
    setLoading(true)
    try {
      const novoEstado = form.estado === 'sem_efeito' ? 'confirmado' : 'sem_efeito'
      await agendaApi.mudarEstado(slot.id, novoEstado)
      onGuardado()
      onFechar()
    } catch (e) {
      setErro(e.message)
      setLoading(false)
    }
  }

  const djActual = djs.find((d) => d.id === form.dj_id)
  const espacoActual = espacos.find((e) => e.id === form.espaco_id)
  const djsActivos = djs.filter((d) => d.estado !== 'banido')

  return (
    <>
    <Modal aberto={aberto} onFechar={onFechar} titulo={slot?.id ? 'Atuação' : 'Nova Atuação'} largura={simplificado ? 'max-w-sm' : 'max-w-lg'}>
      <form onSubmit={guardar}>
        <div className="px-6 py-5 flex flex-col gap-4">
          {erro && <Alerta tipo="erro" mensagem={erro} />}
          {conflitoCrossEspaco && (
            <Alerta tipo="erro" mensagem={`🚫 ${conflitoCrossEspaco}`} />
          )}
          {bloqueioIndisponivel && (
            <Alerta tipo="erro" mensagem={`🚫 ${bloqueioIndisponivel}`} />
          )}
          {avisoOptIn && (
            <Alerta tipo="aviso" mensagem={`⚠️ ${avisoOptIn}`} />
          )}
          {avisoMeta && (
            <Alerta tipo="aviso" mensagem={`⚠️ ${avisoMeta}`} />
          )}
          {conflito && verificacaoFeita && !bloqueioIndisponivel && !conflitoCrossEspaco && !avisoOptIn && conflitos.length === 0 && (
            <Alerta tipo="aviso" mensagem="⚠️ Conflito detectado nesta data" />
          )}
          {conflitos.length > 0 && (
            <div className="flex flex-col gap-1">
              {conflitos.map((c, i) => <Alerta key={i} tipo="aviso" mensagem={c} />)}
            </div>
          )}

          {/* Cabeçalho de contexto — sempre visível */}
          {slot && (
            <div className="bg-surface-2 border border-border rounded-lg px-4 py-3 flex items-start justify-between">
              <div>
                <p className="text-sm font-semibold text-accent">
                  {djActual?.nome_artistico || djActual?.nome || form.dj_externo || <span className="italic text-accent-subtle">Sem DJ</span>}
                </p>
                <p className="text-xs text-accent-muted mt-0.5">
                  {espacoActual?.nome ?? '—'}
                  {' · '}
                  {form.data ? formatarData(form.data) : '—'}
                  {' · '}
                  {formatarHora(form.hora_inicio)}–{formatarHora(form.hora_fim)}
                </p>
                {!simplificado && form.valor !== '' && form.valor !== null && (
                  <p className="text-xs text-accent-muted mt-0.5">
                    {formatarEuro(Number(form.valor))}
                  </p>
                )}
              </div>
              <Badge
                variante={
                  form.estado === 'confirmado' ? 'confirmado' :
                  form.estado === 'cancelado'  ? 'cancelado'  :
                  form.estado === 'sem_efeito' ? 'default'    :
                  form.estado === 'a_pedido'   ? 'default'    :
                  'proposta'
                }
                className={form.estado === 'a_pedido' ? 'border-violet-400/40 bg-violet-400/15 text-violet-300' : ''}
              >
                {ESTADO_OPCOES.find((e) => e.value === form.estado)?.label ?? form.estado}
              </Badge>
            </div>
          )}

          {simplificado ? (
            /* ── MODO SIMPLIFICADO ── */
            <>
              {/* Horário (editável, vem predefinido) + Valor */}
              <div className="grid grid-cols-3 gap-3">
                <Input label="Início" value={form.hora_inicio} onChange={set('hora_inicio')} type="time" required />
                <Input label="Fim" value={form.hora_fim} onChange={set('hora_fim')} type="time" required />
                <Input
                  label="Valor (€)"
                  value={form.valor}
                  onChange={set('valor')}
                  type="number"
                  min={0}
                  step={0.01}
                  placeholder="—"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <Select label="DJ da base" value={form.dj_id} onChange={setDjId}>
                  <option value="">— seleccionar —</option>
                  {djsActivos.map((d) => (
                    <option key={d.id} value={d.id}>{d.nome_artistico || d.nome}</option>
                  ))}
                </Select>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-px bg-border/40" />
                  <span className="text-[10px] text-accent-subtle uppercase tracking-wider">ou</span>
                  <div className="flex-1 h-px bg-border/40" />
                </div>
                <Input
                  label="DJ convidado / externo"
                  value={form.dj_externo}
                  onChange={setDjExterno}
                  placeholder="Nome do DJ fora da base..."
                />
              </div>

              <Select label="Estado" value={form.estado} onChange={set('estado')}>
                {ESTADO_OPCOES.map((e) => <option key={e.value} value={e.value}>{e.label}</option>)}
              </Select>

              <div className="flex items-end gap-2">
                <div className="flex-1">
                  <Input
                    label="Evento (opcional)"
                    value={form.evento}
                    onChange={set('evento')}
                    placeholder="Ex: Halloween Party, Aniversário do clube..."
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setEventoFormAberto(true)}
                  title="Criar evento associado"
                  className="shrink-0 mb-0.5 flex items-center gap-1 px-2.5 py-2 rounded border border-border bg-surface-2 text-accent-subtle hover:text-accent hover:border-white/20 transition-colors text-[11px]"
                >
                  <CalendarPlus size={13} />
                </button>
              </div>

              <Textarea
                label="Observações"
                value={form.notas}
                onChange={set('notas')}
                placeholder="Notas sobre a atuação, rider, condições especiais..."
              />
            </>
          ) : (
            /* ── MODO COMPLETO ── */
            <>
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <Select label="DJ da base" value={form.dj_id} onChange={setDjId}>
                    <option value="">— seleccionar —</option>
                    {djsActivos.map((d) => (
                      <option key={d.id} value={d.id}>{d.nome_artistico || d.nome}</option>
                    ))}
                  </Select>
                  <Input
                    label="ou DJ externo"
                    value={form.dj_externo}
                    onChange={setDjExterno}
                    placeholder="Nome livre..."
                  />
                </div>
                <Select label="Cliente" value={form.espaco_id} onChange={set('espaco_id')}>
                  <option value="">—</option>
                  {espacos.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}
                </Select>
              </div>

              <div className="grid grid-cols-4 gap-3">
                <Input label="Data" value={form.data} onChange={set('data')} type="date" required className="col-span-1" />
                <Input label="Início" value={form.hora_inicio} onChange={set('hora_inicio')} type="time" required />
                <Input label="Fim" value={form.hora_fim} onChange={set('hora_fim')} type="time" required />
                <Input label="Valor (€)" value={form.valor} onChange={set('valor')} type="number" min={0} step={0.01} placeholder="—" />
              </div>

              {/* Margem — só visível para DJ convidado */}
              {form.dj_externo?.trim() && (
                <div className="grid grid-cols-2 gap-3 p-3 bg-surface-2 rounded-lg border border-border/60">
                  <Input
                    label="Margem sobre DJ convidado (€)"
                    value={form.margem}
                    onChange={set('margem')}
                    type="number" min={0} step={0.01}
                    placeholder="0,00"
                  />
                  <div className="flex flex-col justify-end pb-1">
                    {form.valor !== '' && form.margem !== '' && (
                      <p className="text-xs text-accent-muted">
                        DJ recebe:{' '}
                        <span className="font-semibold text-accent">
                          {new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' })
                            .format(Number(form.valor) - Number(form.margem))}
                        </span>
                        <span className="ml-2 text-accent-subtle">
                          (margem: {new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(Number(form.margem))})
                        </span>
                      </p>
                    )}
                  </div>
                </div>
              )}

              <Select label="Estado" value={form.estado} onChange={set('estado')}>
                {ESTADO_OPCOES.map((e) => <option key={e.value} value={e.value}>{e.label}</option>)}
              </Select>

              <div className="flex items-end gap-2">
                <div className="flex-1">
                  <Input
                    label="Evento (opcional)"
                    value={form.evento}
                    onChange={set('evento')}
                    placeholder="Ex: Halloween Party, Aniversário do clube, NYE..."
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setEventoFormAberto(true)}
                  title="Criar evento associado"
                  className="shrink-0 mb-0.5 flex items-center gap-1 px-2.5 py-2 rounded border border-border bg-surface-2 text-accent-subtle hover:text-accent hover:border-white/20 transition-colors text-[11px]"
                >
                  <CalendarPlus size={13} />
                </button>
              </div>

              <Textarea
                label="Observações"
                value={form.notas}
                onChange={set('notas')}
                placeholder="Notas sobre a atuação, rider, condições especiais..."
              />
            </>
          )}
        </div>

        <div className="px-6 py-4 border-t border-border flex items-center justify-between">
          <div className="flex gap-2">
            {slot?.id && (
              <Button type="button" variante="danger" tamanho="sm" onClick={apagar} loading={loading}>
                Apagar
              </Button>
            )}
            {slot?.id && form.estado === 'proposta' && (
              <Button
                type="button" variante="ghost" tamanho="sm" onClick={confirmar} loading={loading}
                className="text-status-confirmado/80 hover:text-status-confirmado"
              >
                Confirmar
              </Button>
            )}
            {slot?.id && (
              <Button
                type="button" variante="ghost" tamanho="sm" onClick={toggleSemEfeito} loading={loading}
                className={clsx(
                  'border transition-colors',
                  form.estado === 'sem_efeito'
                    ? 'border-white/20 text-accent bg-surface-3'
                    : 'border-border/50 text-accent-subtle hover:text-accent hover:border-white/20'
                )}
              >
                {form.estado === 'sem_efeito' ? '↩ Repor' : 'Sem Efeito'}
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button type="button" variante="ghost" tamanho="sm" onClick={onFechar}>Cancelar</Button>
            <Button
              type="submit"
              variante="primary"
              tamanho="sm"
              loading={loading}
              disabled={!!conflitoCrossEspaco || !!bloqueioIndisponivel}
              title={
                conflitoCrossEspaco ? 'Resolve o conflito de Cliente antes de guardar'
                : bloqueioIndisponivel ? 'DJ indisponível nesta data'
                : undefined
              }
            >
              Guardar
            </Button>
          </div>
        </div>
      </form>
    </Modal>

    {/* FormEvento para criar evento a partir do slot */}
    <FormEvento
      aberto={eventoFormAberto}
      evento={eventoFormAberto ? { data_evento: form.data, espaco_id: form.espaco_id || '' } : null}
      onFechar={() => setEventoFormAberto(false)}
      onGuardado={() => setEventoFormAberto(false)}
    />
    </>
  )
}
