import { useState, useEffect, useCallback } from 'react'
import { djsApi } from '@/lib/api'

export function useDJs() {
  const [djs, setDJs] = useState([])
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState(null)

  const carregar = useCallback(async () => {
    setLoading(true)
    setErro(null)
    try {
      const data = await djsApi.listar()
      setDJs(data)
    } catch (e) {
      setErro(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { carregar() }, [carregar])

  return { djs, loading, erro, recarregar: carregar }
}

export function useDJ(id) {
  const [dj, setDJ] = useState(null)
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState(null)

  useEffect(() => {
    if (!id) return
    setLoading(true)
    djsApi.buscar(id)
      .then(setDJ)
      .catch((e) => setErro(e.message))
      .finally(() => setLoading(false))
  }, [id])

  return { dj, loading, erro }
}
