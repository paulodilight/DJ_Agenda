import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store'
import { clsx } from 'clsx'
import { Plus, Trash2, Save, X, ShieldCheck, User, Eye, EyeOff } from 'lucide-react'

const PAGINAS = [
  { path: '/',              label: 'Dashboard',      secao: 'Principal' },
  { path: '/equilibrio',   label: 'Equilíbrio',     secao: 'Principal' },
  { path: '/agenda',       label: 'Agenda',          secao: 'Principal' },
  { path: '/eventos',      label: 'Eventos',         secao: 'Principal' },
  { path: '/comunicacao',  label: 'Comunicação',     secao: 'Principal' },
  { path: '/contas',       label: 'Contas',          secao: 'Principal' },
  { path: '/apoio-tecnico',label: 'Apoio Técnico',   secao: 'Principal' },
  { path: '/club',         label: 'Club',            secao: 'Principal' },
  { path: '/pontualidades',label: 'Pontualidades',   secao: 'Principal' },
  { path: '/atuacoes',     label: 'Atuações',        secao: 'Gestão' },
  { path: '/djs',          label: 'DJs',             secao: 'Gestão' },
  { path: '/convidados',   label: 'DJ Convidados',   secao: 'Gestão' },
  { path: '/artistas',     label: 'Artistas',        secao: 'Gestão' },
  { path: '/espacos',      label: 'Clientes',        secao: 'Gestão' },
  { path: '/bloqueios',    label: 'Bloqueios',       secao: 'Gestão' },
]

const SECOES = ['Principal', 'Gestão']

const VAZIO_NOVO = { nome: '', email: '', password: '', is_admin: false, paginas: [] }

function TogglePag({ path, label, ativo, onChange }) {
  return (
    <button
      type="button"
      onClick={() => onChange(path)}
      className={clsx(
        'px-2.5 py-1 rounded text-[11px] font-medium border transition-colors',
        ativo
          ? 'bg-status-confirmado/15 border-status-confirmado/40 text-status-confirmado'
          : 'bg-surface-2 border-border text-accent-subtle hover:text-accent hover:border-border/80'
      )}
    >
      {label}
    </button>
  )
}

function CardUtilizador({ u, onSave, onApagar }) {
  const [paginas, setPaginas] = useState(u.paginas ?? [])
  const [isAdmin, setIsAdmin] = useState(u.is_admin ?? false)
  const [salvando, setSalvando] = useState(false)
  const [confirmApagar, setConfirmApagar] = useState(false)

  const dirty = JSON.stringify(paginas.slice().sort()) !== JSON.stringify((u.paginas ?? []).slice().sort())
    || isAdmin !== (u.is_admin ?? false)

  const togglePag = (path) => {
    setPaginas(prev => prev.includes(path) ? prev.filter(p => p !== path) : [...prev, path])
  }

  const selecionarTodas = () => setPaginas(PAGINAS.map(p => p.path))
  const limparTodas = () => setPaginas([])

  const guardar = async () => {
    setSalvando(true)
    await onSave(u.user_id, { paginas, is_admin: isAdmin })
    setSalvando(false)
  }

  return (
    <div className="bg-surface-1 border border-border rounded-lg p-5 flex flex-col gap-4">
      {/* Cabeçalho */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-surface-3 border border-border flex items-center justify-center text-sm font-bold text-accent">
            {u.nome?.charAt(0)?.toUpperCase() ?? '?'}
          </div>
          <div>
            <p className="text-sm font-semibold text-accent">{u.nome}</p>
            <p className="text-[11px] text-accent-subtle">{u.email}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {dirty && (
            <button
              onClick={guardar}
              disabled={salvando}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-status-confirmado/15 border border-status-confirmado/40 text-status-confirmado text-xs font-semibold hover:bg-status-confirmado/25 transition-colors"
            >
              <Save size={12} />
              {salvando ? 'A guardar…' : 'Guardar'}
            </button>
          )}
          {!confirmApagar ? (
            <button
              onClick={() => setConfirmApagar(true)}
              className="p-1.5 rounded text-accent-subtle hover:text-status-cancelado hover:bg-status-cancelado/10 transition-colors"
              title="Apagar utilizador"
            >
              <Trash2 size={14} />
            </button>
          ) : (
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-status-cancelado">Confirmar?</span>
              <button
                onClick={() => onApagar(u.user_id)}
                className="px-2 py-1 rounded bg-status-cancelado/15 border border-status-cancelado/40 text-status-cancelado text-[11px] font-semibold hover:bg-status-cancelado/25 transition-colors"
              >
                Apagar
              </button>
              <button
                onClick={() => setConfirmApagar(false)}
                className="p-1 rounded text-accent-subtle hover:text-accent transition-colors"
              >
                <X size={12} />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Toggle admin */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => setIsAdmin(v => !v)}
          className={clsx(
            'flex items-center gap-2 px-3 py-1.5 rounded border text-xs font-medium transition-colors',
            isAdmin
              ? 'bg-yellow-500/15 border-yellow-500/40 text-yellow-400'
              : 'bg-surface-2 border-border text-accent-subtle hover:text-accent'
          )}
        >
          <ShieldCheck size={13} />
          {isAdmin ? 'Administrador (acesso total)' : 'Utilizador restrito'}
        </button>
      </div>

      {/* Páginas — só mostrar se não é admin */}
      {!isAdmin && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-semibold text-accent-subtle uppercase tracking-wider">Páginas permitidas</p>
            <div className="flex items-center gap-2">
              <button onClick={selecionarTodas} className="text-[11px] text-accent-subtle hover:text-accent underline-offset-2 hover:underline">todas</button>
              <span className="text-border">·</span>
              <button onClick={limparTodas} className="text-[11px] text-accent-subtle hover:text-accent underline-offset-2 hover:underline">nenhuma</button>
            </div>
          </div>
          {SECOES.map(secao => (
            <div key={secao} className="flex flex-col gap-1.5">
              <p className="text-[10px] text-accent-subtle/60 uppercase tracking-widest">{secao}</p>
              <div className="flex flex-wrap gap-1.5">
                {PAGINAS.filter(p => p.secao === secao).map(p => (
                  <TogglePag
                    key={p.path}
                    path={p.path}
                    label={p.label}
                    ativo={paginas.includes(p.path)}
                    onChange={togglePag}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function FormNovoUtilizador({ onCriar, onCancelar }) {
  const [form, setForm] = useState(VAZIO_NOVO)
  const [mostrarPass, setMostrarPass] = useState(false)
  const [criando, setCriando] = useState(false)
  const [erro, setErro] = useState('')

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const togglePag = (path) => {
    set('paginas', form.paginas.includes(path)
      ? form.paginas.filter(p => p !== path)
      : [...form.paginas, path])
  }

  const selecionarTodas = () => set('paginas', PAGINAS.map(p => p.path))
  const limparTodas = () => set('paginas', [])

  const submeter = async (e) => {
    e.preventDefault()
    if (!form.nome.trim() || !form.email.trim() || !form.password.trim()) {
      setErro('Nome, email e password são obrigatórios.')
      return
    }
    setCriando(true)
    setErro('')
    const result = await onCriar(form)
    if (result?.error) { setErro(result.error); setCriando(false) }
  }

  return (
    <form onSubmit={submeter} className="bg-surface-1 border border-status-confirmado/30 rounded-lg p-5 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-accent">Novo Utilizador</p>
        <button type="button" onClick={onCancelar} className="p-1 rounded text-accent-subtle hover:text-accent transition-colors">
          <X size={14} />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-[11px] text-accent-subtle uppercase tracking-wider">Nome</label>
          <input
            type="text"
            value={form.nome}
            onChange={e => set('nome', e.target.value)}
            placeholder="Nome do utilizador"
            className="bg-surface-2 border border-border rounded px-3 py-2 text-sm text-accent placeholder-accent-subtle/50 focus:outline-none focus:border-status-confirmado/50"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[11px] text-accent-subtle uppercase tracking-wider">Email</label>
          <input
            type="email"
            value={form.email}
            onChange={e => set('email', e.target.value)}
            placeholder="email@exemplo.com"
            className="bg-surface-2 border border-border rounded px-3 py-2 text-sm text-accent placeholder-accent-subtle/50 focus:outline-none focus:border-status-confirmado/50"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[11px] text-accent-subtle uppercase tracking-wider">Password</label>
          <div className="relative">
            <input
              type={mostrarPass ? 'text' : 'password'}
              value={form.password}
              onChange={e => set('password', e.target.value)}
              placeholder="Mínimo 6 caracteres"
              className="w-full bg-surface-2 border border-border rounded px-3 py-2 pr-9 text-sm text-accent placeholder-accent-subtle/50 focus:outline-none focus:border-status-confirmado/50"
            />
            <button
              type="button"
              onClick={() => setMostrarPass(v => !v)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-accent-subtle hover:text-accent transition-colors"
            >
              {mostrarPass ? <EyeOff size={13} /> : <Eye size={13} />}
            </button>
          </div>
        </div>
        <div className="flex flex-col gap-1 justify-end">
          <button
            type="button"
            onClick={() => set('is_admin', !form.is_admin)}
            className={clsx(
              'flex items-center gap-2 px-3 py-2 rounded border text-xs font-medium transition-colors',
              form.is_admin
                ? 'bg-yellow-500/15 border-yellow-500/40 text-yellow-400'
                : 'bg-surface-2 border-border text-accent-subtle hover:text-accent'
            )}
          >
            <ShieldCheck size={13} />
            {form.is_admin ? 'Administrador' : 'Utilizador restrito'}
          </button>
        </div>
      </div>

      {!form.is_admin && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-semibold text-accent-subtle uppercase tracking-wider">Páginas permitidas</p>
            <div className="flex items-center gap-2">
              <button type="button" onClick={selecionarTodas} className="text-[11px] text-accent-subtle hover:text-accent underline-offset-2 hover:underline">todas</button>
              <span className="text-border">·</span>
              <button type="button" onClick={limparTodas} className="text-[11px] text-accent-subtle hover:text-accent underline-offset-2 hover:underline">nenhuma</button>
            </div>
          </div>
          {SECOES.map(secao => (
            <div key={secao} className="flex flex-col gap-1.5">
              <p className="text-[10px] text-accent-subtle/60 uppercase tracking-widest">{secao}</p>
              <div className="flex flex-wrap gap-1.5">
                {PAGINAS.filter(p => p.secao === secao).map(p => (
                  <TogglePag
                    key={p.path}
                    path={p.path}
                    label={p.label}
                    ativo={form.paginas.includes(p.path)}
                    onChange={togglePag}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {erro && <p className="text-[12px] text-status-cancelado">{erro}</p>}

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={criando}
          className="flex items-center gap-2 px-4 py-2 rounded bg-status-confirmado/15 border border-status-confirmado/40 text-status-confirmado text-xs font-semibold hover:bg-status-confirmado/25 transition-colors disabled:opacity-50"
        >
          <Plus size={13} />
          {criando ? 'A criar…' : 'Criar utilizador'}
        </button>
      </div>
    </form>
  )
}

export function Utilizadores() {
  const { user } = useAuthStore((s) => ({ user: s.user }))
  const [utilizadores, setUtilizadores] = useState([])
  const [carregando, setCarregando] = useState(true)
  const [mostrarForm, setMostrarForm] = useState(false)

  const carregar = useCallback(async () => {
    setCarregando(true)
    const { data, error } = await supabase
      .from('user_permissoes')
      .select('*')
      .order('criado_em', { ascending: true })
    if (!error) setUtilizadores(data ?? [])
    setCarregando(false)
  }, [])

  useEffect(() => { carregar() }, [carregar])

  const guardarPermissoes = async (userId, updates) => {
    const { error } = await supabase
      .from('user_permissoes')
      .update(updates)
      .eq('user_id', userId)
    if (!error) await carregar()
  }

  const criarUtilizador = async (form) => {
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/gerir-utilizador`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
        apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({
        action: 'criar',
        email: form.email,
        password: form.password,
        nome: form.nome,
        paginas: form.paginas,
        is_admin: form.is_admin,
      }),
    })
    const json = await res.json()
    if (json.error) return { error: json.error }
    setMostrarForm(false)
    await carregar()
    return {}
  }

  const apagarUtilizador = async (userId) => {
    const { data: { session } } = await supabase.auth.getSession()
    await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/gerir-utilizador`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
        apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({ action: 'apagar', user_id: userId }),
    })
    await carregar()
  }

  return (
    <div className="p-6 flex flex-col gap-6 max-w-3xl">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-accent">Gestão de Utilizadores</h2>
          <p className="text-[12px] text-accent-subtle mt-0.5">Cria utilizadores e define quais as páginas que podem aceder.</p>
        </div>
        {!mostrarForm && (
          <button
            onClick={() => setMostrarForm(true)}
            className="flex items-center gap-2 px-3 py-2 rounded bg-status-confirmado/15 border border-status-confirmado/40 text-status-confirmado text-xs font-semibold hover:bg-status-confirmado/25 transition-colors"
          >
            <Plus size={13} />
            Novo utilizador
          </button>
        )}
      </div>

      {/* Formulário novo utilizador */}
      {mostrarForm && (
        <FormNovoUtilizador
          onCriar={criarUtilizador}
          onCancelar={() => setMostrarForm(false)}
        />
      )}

      {/* Nota sobre o utilizador atual */}
      <div className="bg-yellow-500/8 border border-yellow-500/20 rounded-lg px-4 py-3 flex items-start gap-2.5">
        <ShieldCheck size={14} className="text-yellow-400 mt-0.5 shrink-0" />
        <p className="text-[12px] text-accent-subtle leading-relaxed">
          <span className="text-yellow-400 font-semibold">Conta atual ({user?.email}):</span> é administrador com acesso total. Para criar outros admins, ativa o toggle "Administrador" ao criar o utilizador.
        </p>
      </div>

      {/* Lista */}
      {carregando ? (
        <p className="text-sm text-accent-subtle">A carregar…</p>
      ) : utilizadores.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-12 text-center">
          <User size={32} className="text-accent-subtle/30" />
          <p className="text-sm text-accent-subtle">Nenhum utilizador criado ainda.</p>
          <p className="text-[12px] text-accent-subtle/60">Clica em "Novo utilizador" para começar.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {utilizadores.map(u => (
            <CardUtilizador
              key={u.user_id}
              u={u}
              onSave={guardarPermissoes}
              onApagar={apagarUtilizador}
            />
          ))}
        </div>
      )}
    </div>
  )
}
