import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'

/**
 * @typedef {'idle'|'loading'|'signed'|'error'} PCWStatus
 * @typedef {Object} Presenca
 * @property {string} id
 * @property {string} [agenda_id]
 * @property {number} [evento_id]
 * @property {string|null} [dj_id]
 * @property {string|null} [tecnico_id]
 * @property {string} signed_at        // ISO timestamptz
 * @property {number|null} latitude
 * @property {number|null} longitude
 * @property {number|null} accuracy_m
 * @property {'dj'|'manager'|'tecnico'} signed_by
 */

// Configuração por tipo de presença
const CFG = {
  dj:      { tabela: 'presencas_djs',      fk: 'agenda_id', owner: 'dj_id',      onConflict: 'agenda_id' },
  tecnico: { tabela: 'presencas_tecnicos', fk: 'evento_id', owner: 'tecnico_id', onConflict: 'evento_id,tecnico_id' },
}

// Tolerância (minutos) para a janela de assinatura.
export const TOLERANCIA_MIN = 5

/** Date do início a partir de data (YYYY-MM-DD) + hora (HH:MM[:SS]). */
export function inicioEvento(data, hora) {
  if (!data) return null
  const h = (hora || '00:00').slice(0, 5)
  const d = new Date(`${data}T${h}:00`)
  return isNaN(d.getTime()) ? null : d
}

/** Só permite assinar a partir de TOLERANCIA_MIN minutos antes do início. */
export function podeAssinar(data, hora) {
  const ini = inicioEvento(data, hora)
  return !!ini && Date.now() >= ini.getTime() - TOLERANCIA_MIN * 60000
}

/** True se a assinatura foi feita mais de TOLERANCIA_MIN minutos depois do início (atrasada). */
export function presencaAtrasada(presenca, data, hora) {
  const ini = inicioEvento(data, hora)
  if (!ini || !presenca?.signed_at) return false
  return new Date(presenca.signed_at).getTime() > ini.getTime() + TOLERANCIA_MIN * 60000
}

/**
 * Obtém a posição GPS. Se o browser não suportar, recusar ou falhar (timeout 10s),
 * resolve com coordenadas a null — a presença grava na mesma (manual).
 * @returns {Promise<{latitude:number|null, longitude:number|null, accuracy_m:number|null}>}
 */
export function obterPosicao() {
  return new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      resolve({ latitude: null, longitude: null, accuracy_m: null })
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        accuracy_m: pos.coords.accuracy != null ? Math.round(pos.coords.accuracy) : null,
      }),
      () => resolve({ latitude: null, longitude: null, accuracy_m: null }),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    )
  })
}

/**
 * Carrega em lote as presenças existentes (1 query) para evitar N pedidos.
 * @param {'dj'|'tecnico'} kind
 * @param {Array<string|number>} ids  agenda_id[] (dj) ou evento_id[] (tecnico)
 * @param {string|null} [ownerId]     no caso 'tecnico', filtra pelo técnico
 * @returns {Promise<Record<string, Presenca>>} mapa por id
 */
export async function fetchPresencasBatch(kind, ids, ownerId = null) {
  const cfg = CFG[kind]
  const lista = [...new Set((ids ?? []).filter(Boolean))]
  if (lista.length === 0) return {}
  let q = supabase.from(cfg.tabela).select('*').in(cfg.fk, lista)
  if (kind === 'tecnico' && ownerId) q = q.eq('tecnico_id', ownerId)
  const { data, error } = await q
  if (error) throw error
  /** @type {Record<string, Presenca>} */
  const mapa = {}
  ;(data ?? []).forEach((r) => { mapa[r[cfg.fk]] = r })
  return mapa
}

async function fetchOne(kind, refId, ownerId) {
  const cfg = CFG[kind]
  let q = supabase.from(cfg.tabela).select('*').eq(cfg.fk, refId)
  if (kind === 'tecnico' && ownerId) q = q.eq('tecnico_id', ownerId)
  const { data, error } = await q.limit(1).maybeSingle()
  if (error) throw error
  return data ?? null
}

async function upsertPresenca(kind, { refId, ownerId, signedBy }) {
  const cfg = CFG[kind]
  const pos = await obterPosicao()
  const row = {
    [cfg.fk]: refId,
    [cfg.owner]: ownerId ?? null,
    signed_by: signedBy,
    ...pos,
  }
  const { data, error } = await supabase
    .from(cfg.tabela)
    .upsert(row, { onConflict: cfg.onConflict })
    .select()
    .single()
  if (error) throw error
  return data
}

/**
 * Hook de presença para uma linha (self-contained).
 * - Se receber `inicial` (do fetch em lote do parent), usa-o e NÃO faz pedido próprio.
 * - Se `inicial` for `undefined`, faz fetch no mount (fallback self-contained).
 *
 * @param {Object} opts
 * @param {'dj'|'tecnico'} opts.kind
 * @param {string|number} opts.refId          agenda_id (dj) ou evento_id (tecnico)
 * @param {string|null} [opts.ownerId]         dj_id ou tecnico_id
 * @param {'dj'|'manager'|'tecnico'} [opts.signedBy]
 * @param {Presenca|null} [opts.inicial]       registo vindo do lote (null = não existe)
 * @returns {{ status: PCWStatus, presenca: Presenca|null, erro: string|null, assinar: () => Promise<void> }}
 */
export function usePresenca({ kind, refId, ownerId = null, signedBy = 'manager', inicial = undefined }) {
  const [presenca, setPresenca] = useState(inicial ?? null)
  const [status, setStatus]     = useState(inicial ? 'signed' : 'idle')
  const [erro, setErro]         = useState(null)

  useEffect(() => {
    // Recebeu valor do lote → usa-o, sem pedido próprio.
    if (inicial !== undefined) {
      setPresenca(inicial ?? null)
      setStatus(inicial ? 'signed' : 'idle')
      return
    }
    // Fallback self-contained: busca no mount.
    let activo = true
    fetchOne(kind, refId, ownerId)
      .then((p) => { if (activo) { setPresenca(p); setStatus(p ? 'signed' : 'idle') } })
      .catch((e) => { if (activo) { setErro(e.message); setStatus('error') } })
    return () => { activo = false }
  }, [kind, refId, ownerId, inicial])

  const assinar = useCallback(async () => {
    setStatus('loading'); setErro(null)
    try {
      const p = await upsertPresenca(kind, { refId, ownerId, signedBy })
      setPresenca(p); setStatus('signed')
    } catch (e) {
      setErro(e.message); setStatus('error')
    }
  }, [kind, refId, ownerId, signedBy])

  return { status, presenca, erro, assinar }
}
