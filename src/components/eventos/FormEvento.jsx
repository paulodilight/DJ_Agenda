import { useState, useEffect } from 'react'
import { X, Database } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Alerta } from '@/components/ui/Alerta'
import { supaEventosApi } from '@/lib/supaEventosApi'
import { supabase } from '@/lib/supabase'
import { clsx } from 'clsx'

const STATUS_OPTS = [
  { value: 'proposta',   label: 'Proposta' },
  { value: 'confirmado', label: 'Confirmado' },
  { value: 'cancelado',  label: 'Cancelado' },
]

const VAZIO = {
  evento: '',
  tipo: '',
  espaco_id: '',
  cliente: '',
  responsavel: '',
  morada: '',
  contacto_pelo_evento: '',
  status: 'proposta',
  data_evento: '',
  hora_inicio: '',
  hora_fim: '',
  dia_instalacao: '',
  hora_instalacao: '',
  notas_operacionais: '',
  Equipamentos: '',
  valor: '',
  valor_artistico: '',
  valor_apoio_tecnico: '',
  tecnico_id: '',
}

function Field({ label, children, required }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[11px] font-medium text-accent-subtle uppercase tracking-wider">
        {label}{required && <span className="text-status-cancelado ml-0.5">*</span>}
      </label>
      {children}
    </div>
  )
}

const inputCls = 'w-full bg-surface-2 border border-border rounded px-3 py-2 text-xs text-accent placeholder:text-accent-subtle/40 focus:outline-none focus:border-white/30 focus:bg-surface-3 transition-colors'
const textareaCls = `${inputCls} resize-none`

export function FormEvento({ aberto, evento, dataInicial = '', onFechar, onGuardado }) {
  const [form, setForm]       = useState(VAZIO)
  const [loading, setLoading] = useState(false)
  const [erro, setErro]       = useState(null)
  const [abaActiva, setAba]   = useState('geral')
  const [tipos, setTipos]       = useState([])
  const [espacos, setEspacos]   = useState([])
  const [tecnicos, setTecnicos] = useState([])

  useEffect(() => {
    // Carregar tipos com flag tem_artista
    supabase.from('tipo_eventos').select('id, nome, tem_artista').order('nome')
      .then(({ data }) => setTipos(data ?? []))
      .catch(console.error)
    supaEventosApi.listarEspacos().then(setEspacos).catch(console.error)
    supabase.from('tecnicos').select('id, nome').eq('ativo', true).order('nome')
      .then(({ data }) => setTecnicos(data ?? []))
      .catch(console.error)
  }, [])

  useEffect(() => {
    if (!aberto) return
    setErro(null)
    setAba('geral')
    if (evento?.id) {
      setForm({
        ...VAZIO,
        ...evento,
        valor:               evento.valor               != null ? String(evento.valor)               : '',
        valor_artistico:     evento.valor_artistico     != null ? String(evento.valor_artistico)     : '',
        valor_apoio_tecnico: evento.valor_apoio_tecnico != null ? String(evento.valor_apoio_tecnico) : '',
        tecnico_id:      evento.tecnico_id ?? '',
        hora_inicio:     evento.hora_inicio?.slice(0, 5)     ?? '',
        hora_fim:        evento.hora_fim?.slice(0, 5)        ?? '',
        hora_instalacao: evento.hora_instalacao?.slice(0, 5) ?? '',
      })
    } else {
      // Suporte a pré-preenchimento parcial (ex: criado a partir de slot)
      setForm({
        ...VAZIO,
        data_evento: dataInicial || evento?.data_evento || '',
        espaco_id:   evento?.espaco_id || '',
        tipo:        evento?.tipo      || '',
      })
    }
  }, [aberto, evento, dataInicial])

  const set = (campo, valor) => setForm((f) => ({ ...f, [campo]: valor }))

  const guardar = async () => {
    if (!form.evento.trim()) { setErro('Nome do evento obrigatório.'); return }
    if (!form.data_evento)   { setErro('Data obrigatória.'); return }

    setLoading(true)
    setErro(null)
    try {
      const dados = {
        ...form,
        valor:               form.valor               !== '' ? Number(form.valor)               : null,
        valor_artistico:     form.valor_artistico     !== '' ? Number(form.valor_artistico)     : null,
        valor_apoio_tecnico: form.valor_apoio_tecnico !== '' ? Number(form.valor_apoio_tecnico) : null,
        tecnico_id:      form.tecnico_id      || null,
        hora_inicio:     form.hora_inicio     || null,
        hora_fim:        form.hora_fim        || null,
        hora_instalacao: form.hora_instalacao || null,
        dia_instalacao:  form.dia_instalacao  || null,
      }
      if (evento?.id) {
        await supaEventosApi.actualizar(evento.id, dados)
      } else {
        await supaEventosApi.criar(dados)
      }
      onGuardado?.()
      onFechar()
    } catch (e) {
      setErro(e.message)
    } finally {
      setLoading(false)
    }
  }

  const apagar = async () => {
    if (!evento?.id) return
    if (!window.confirm('Apagar este evento? Esta acção não pode ser desfeita.')) return
    setLoading(true)
    try {
      await supaEventosApi.apagar(evento.id)
      onGuardado?.()
      onFechar()
    } catch (e) {
      setErro(e.message)
    } finally {
      setLoading(false)
    }
  }

  const titulo = evento?.id ? 'Editar Evento' : 'Novo Evento'

  return (
    <Modal aberto={aberto} onFechar={onFechar} largura="max-w-2xl">
      <div className="flex flex-col">

        {/* Cabeçalho */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-semibold text-accent">{titulo}</h2>
            <div className="flex items-center gap-1 px-2 py-0.5 rounded bg-violet-500/10 border border-violet-500/25">
              <Database size={9} className="text-violet-400 shrink-0" />
              <span className="text-[10px] font-mono text-violet-400 tracking-tight">supa_eventos</span>
            </div>
          </div>
          <button onClick={onFechar} className="text-accent-subtle hover:text-accent transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Abas */}
        <div className="flex border-b border-border px-6">
          {[
            { id: 'geral',   label: 'Geral' },
            { id: 'tecnico', label: 'Técnico & Notas' },
          ].map((aba) => (
            <button
              key={aba.id}
              onClick={() => setAba(aba.id)}
              className={clsx(
                'px-4 py-2.5 text-xs font-medium border-b-2 transition-colors -mb-px',
                abaActiva === aba.id
                  ? 'border-status-confirmado text-status-confirmado'
                  : 'border-transparent text-accent-muted hover:text-accent'
              )}
            >
              {aba.label}
            </button>
          ))}
        </div>

        <div className="px-6 py-5 flex flex-col gap-4 overflow-y-auto max-h-[65vh]">
          {erro && <Alerta tipo="erro" mensagem={erro} />}

          {/* ── Aba Geral ── */}
          {abaActiva === 'geral' && (
            <>
              {/* Nome + Tipo */}
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <Field label="Nome do evento" required>
                    <input
                      className={inputCls}
                      value={form.evento}
                      onChange={(e) => set('evento', e.target.value)}
                      placeholder="Ex: Noite de Fado, DJ Set Especial…"
                      autoFocus
                    />
                  </Field>
                </div>
                <Field label="Tipo">
                  <select
                    className={inputCls}
                    value={form.tipo}
                    onChange={(e) => set('tipo', e.target.value)}
                  >
                    <option value="">— Seleccionar —</option>
                    {tipos.map((t) => (
                      <option key={t.id} value={t.nome}>{t.nome}</option>
                    ))}
                  </select>
                </Field>
              </div>

              {/* Espaço */}
              <Field label="Espaço">
                <select
                  className={inputCls}
                  value={form.espaco_id}
                  onChange={(e) => set('espaco_id', e.target.value)}
                >
                  <option value="">— Seleccionar —</option>
                  {espacos.map((e) => (
                    <option key={e.id} value={e.id}>{e.nome}</option>
                  ))}
                </select>
              </Field>

              {/* Cliente + Status */}
              <div className="grid grid-cols-2 gap-3">
                <Field label="Cliente">
                  <input
                    className={inputCls}
                    value={form.cliente}
                    onChange={(e) => set('cliente', e.target.value)}
                    placeholder="Nome do cliente…"
                  />
                </Field>
                <Field label="Status">
                  <select
                    className={inputCls}
                    value={form.status}
                    onChange={(e) => set('status', e.target.value)}
                  >
                    {STATUS_OPTS.map((s) => (
                      <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                  </select>
                </Field>
              </div>

              {/* Valores — valor artístico só para tipos com artista */}
              {(() => {
                const tipoSel    = tipos.find(t => t.nome === form.tipo)
                const temArtista = tipoSel?.tem_artista ?? false
                const labelArt   = form.tipo ? `Valor ${form.tipo} (€)` : 'Valor Artístico (€)'
                if (!temArtista) return null
                return (
                  <div className="grid grid-cols-2 gap-3 p-3 bg-surface-2/60 rounded-lg border border-border/50">
                    <Field label={labelArt}>
                      <input
                        type="number" min="0" step="0.01"
                        className={inputCls}
                        value={form.valor_artistico}
                        onChange={(e) => set('valor_artistico', e.target.value)}
                        placeholder="0,00"
                      />
                    </Field>
                    <Field label="Valor Apoio Técnico (€)">
                      <input
                        type="number" min="0" step="0.01"
                        className={inputCls}
                        value={form.valor_apoio_tecnico}
                        onChange={(e) => set('valor_apoio_tecnico', e.target.value)}
                        placeholder="0,00"
                      />
                    </Field>
                  </div>
                )
              })()}

              {/* Técnico Responsável + Contacto */}
              <div className="grid grid-cols-2 gap-3">
                <Field label="Técnico Responsável">
                  <select
                    className={inputCls}
                    value={form.tecnico_id}
                    onChange={(e) => set('tecnico_id', e.target.value)}
                  >
                    <option value="">— Não atribuído —</option>
                    {tecnicos.map(t => (
                      <option key={t.id} value={t.id}>{t.nome}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Contacto pelo evento">
                  <input
                    className={inputCls}
                    value={form.contacto_pelo_evento}
                    onChange={(e) => set('contacto_pelo_evento', e.target.value)}
                    placeholder="Telefone / email…"
                  />
                </Field>
              </div>

              {/* Morada */}
              <Field label="Morada">
                <input
                  className={inputCls}
                  value={form.morada}
                  onChange={(e) => set('morada', e.target.value)}
                  placeholder="Local do evento…"
                />
              </Field>

              {/* Data + Horário */}
              <div className="grid grid-cols-3 gap-3">
                <Field label="Data do evento" required>
                  <input
                    type="date"
                    className={inputCls}
                    value={form.data_evento}
                    onChange={(e) => set('data_evento', e.target.value)}
                  />
                </Field>
                <Field label="Hora início">
                  <input
                    type="time"
                    className={inputCls}
                    value={form.hora_inicio}
                    onChange={(e) => set('hora_inicio', e.target.value)}
                  />
                </Field>
                <Field label="Hora fim">
                  <input
                    type="time"
                    className={inputCls}
                    value={form.hora_fim}
                    onChange={(e) => set('hora_fim', e.target.value)}
                  />
                </Field>
              </div>

              {/* Instalação */}
              <div className="grid grid-cols-2 gap-3">
                <Field label="Dia de instalação">
                  <input
                    type="date"
                    className={inputCls}
                    value={form.dia_instalacao}
                    onChange={(e) => set('dia_instalacao', e.target.value)}
                  />
                </Field>
                <Field label="Hora de instalação">
                  <input
                    type="time"
                    className={inputCls}
                    value={form.hora_instalacao}
                    onChange={(e) => set('hora_instalacao', e.target.value)}
                  />
                </Field>
              </div>
            </>
          )}

          {/* ── Aba Técnico & Notas ── */}
          {abaActiva === 'tecnico' && (
            <>
              <Field label="Equipamentos">
                <textarea
                  className={textareaCls}
                  rows={4}
                  value={form.Equipamentos}
                  onChange={(e) => set('Equipamentos', e.target.value)}
                  placeholder="Lista de equipamentos necessários…"
                />
              </Field>

              <Field label="Notas operacionais">
                <textarea
                  className={textareaCls}
                  rows={4}
                  value={form.notas_operacionais}
                  onChange={(e) => set('notas_operacionais', e.target.value)}
                  placeholder="Informações operacionais do evento…"
                />
              </Field>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border flex items-center justify-between gap-3">
          <div>
            {evento?.id && (
              <button
                onClick={apagar}
                disabled={loading}
                className="text-xs text-status-cancelado hover:text-status-cancelado/80 transition-colors disabled:opacity-40"
              >
                Apagar evento
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variante="secundario" onClick={onFechar} disabled={loading}>
              Cancelar
            </Button>
            <Button onClick={guardar} disabled={loading}>
              {loading ? 'A guardar…' : evento?.id ? 'Guardar alterações' : 'Criar evento'}
            </Button>
          </div>
        </div>

      </div>
    </Modal>
  )
}
