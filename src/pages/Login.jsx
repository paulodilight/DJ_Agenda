import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { Alerta } from '@/components/ui/Alerta'

export function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState(null)
  const navigate = useNavigate()

  const handleSubmit = async (e) => {
    e.preventDefault()
    setErro(null)
    setLoading(true)
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) throw error
      navigate('/', { replace: true })
    } catch (e) {
      setErro(
        e.message === 'Invalid login credentials'
          ? 'Email ou palavra-passe incorrectos.'
          : e.message
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-surface-0 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex items-center gap-3 mb-10">
          <div className="w-8 h-8 rounded-full border border-white/20 bg-surface-2 flex items-center justify-center">
            <div className="w-3 h-3 rounded-full bg-white" />
          </div>
          <span className="text-base font-semibold tracking-tight">DJ Schedule</span>
        </div>

        <div className="bg-surface-1 border border-border rounded-lg p-6">
          <h1 className="text-sm font-semibold text-accent mb-1">Entrar</h1>
          <p className="text-xs text-accent-muted mb-6">Acesso restrito a administradores.</p>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {erro && <Alerta tipo="erro" mensagem={erro} />}

            <Input
              label="Email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@exemplo.com"
              required
              autoFocus
            />

            <Input
              label="Palavra-passe"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
            />

            <Button
              type="submit"
              variante="primary"
              tamanho="md"
              loading={loading}
              className="w-full justify-center mt-1"
            >
              Entrar
            </Button>
          </form>
        </div>

        <p className="text-center text-xs text-accent-subtle mt-5">
          LMD / i4DJ — Uso interno
        </p>
      </div>
    </div>
  )
}
