import { useState, useEffect, useCallback } from 'react'
import { tecnicosApi } from '@/lib/api'

export function useTecnicos() {
  const [tecnicos, setTecnicos] = useState([])
  const [loading, setLoading]   = useState(true)
  const [erro, setErro]         = useState(null)

  const carregar = useCallback(async () => {
    setLoading(true)
    setErro(null)
    try {
      const data = await tecnicosApi.listar()
      setTecnicos(data)
    } catch (e) {
      setErro(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { carregar() }, [carregar])

  return { tecnicos, loading, erro, recarregar: carregar }
}
