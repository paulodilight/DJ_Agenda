import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { Alerta } from '@/components/ui/Alerta'
import { KeyRound, CheckCircle2 } from 'lucide-react'

export function ResetPassword() {
  const [password, setPassword]         = useState('')
  const [confirmar, setConfirmar]       = useState('')
  const [loading, setLoading]           = useState(false)
  const [erro, setErro]                 = useState(null)
  const [sucesso, setSucesso]           = useState(false)
  const navigate = useNavigate()

  const handleSubmit = async (e) => {
    e.preventDefault()
    setErro(null)

    if (password.length < 6) {
      setErro('A password deve ter pelo menos 6 caracteres.')
      return
    }
    if (password !== confirmar) {
      setErro('As passwords não coincidem.')
      return
    }

    setLoading(true)
    try {
      const { error } = await supabase.auth.updateUser({ password })
      if (error) throw error
      setSucesso(true)
      // Redireciona para login após 3 segundos
      setTimeout(() => navigate('/login', { replace: true }), 3000)
    } catch (e) {
      setErro(e.message)
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

          {sucesso ? (
            /* ── Estado de sucesso ── */
            <div className="flex flex-col items-center gap-4 py-4 text-center">
              <CheckCircle2 size={40} className="text-status-confirmado" />
              <div>
                <p className="text-sm font-semibold text-accent">Password actualizada!</p>
                <p className="text-xs text-accent-muted mt-1">A redirecionar para o login…</p>
              </div>
            </div>
          ) : (
            /* ── Formulário ── */
            <>
              <div className="flex items-center gap-2 mb-1">
                <KeyRound size={14} className="text-accent-muted" />
                <h1 className="text-sm font-semibold text-accent">Nova password</h1>
              </div>
              <p className="text-xs text-accent-muted mb-6">
                Define uma nova palavra-passe para a tua conta.
              </p>

              <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                {erro && <Alerta tipo="erro" mensagem={erro} />}

                <Input
                  label="Nova password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  autoFocus
                />

                <Input
                  label="Confirmar password"
                  type="password"
                  value={confirmar}
                  onChange={(e) => setConfirmar(e.target.value)}
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
                  Guardar nova password
                </Button>
              </form>
            </>
          )}
        </div>

        <p className="text-center text-xs text-accent-subtle mt-5">
          LMD / i4DJ — Uso interno
        </p>
      </div>
    </div>
  )
}
