import { useState, useEffect, useCallback } from 'react'
import { bloqueiosApi } from '@/lib/api'

export function useBloqueios() {
  const [bloqueios, setBloqueios] = useState([])
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState(null)

  const carregar = useCallback(async () => {
    setLoading(true); setErro(null)
    try { setBloqueios(await bloqueiosApi.listar()) }
    catch (e) { setErro(e.message) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { carregar() }, [carregar])

  return { bloqueios, loading, erro, recarregar: carregar }
}
