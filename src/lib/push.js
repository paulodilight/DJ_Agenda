/**
 * Web Push + App Badge — app Apoio Técnico (Xclusive TS).
 *
 * - Regista o service worker (/sw.js).
 * - Pede permissão de notificações e subscreve o PushManager.
 * - Guarda a subscrição na tabela `push_subscriptions` (Supabase, acesso anónimo).
 * - Limpa o badge do ícone quando o técnico abre a app.
 *
 * O ENVIO dos pushes é feito pela Edge Function `send-push`, disparada por
 * Database Webhooks em `supa_eventos` e `ocorrencias`.
 */
import { supabase } from './supabase'

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY

export const pushSuportado = () =>
  typeof window !== 'undefined' &&
  'serviceWorker' in navigator &&
  'PushManager' in window &&
  'Notification' in window

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)))
}

// ── Registo do service worker (idempotente) ───────────────────────────────────
export async function registarSW() {
  if (!('serviceWorker' in navigator)) return null
  try {
    return await navigator.serviceWorker.register('/sw.js')
  } catch (e) {
    console.warn('SW register falhou:', e?.message)
    return null
  }
}

// ── Estado atual da permissão/subscrição ──────────────────────────────────────
export async function estadoPush() {
  if (!pushSuportado()) return 'indisponivel'
  if (Notification.permission === 'denied') return 'bloqueado'
  const reg = await navigator.serviceWorker.getRegistration()
  const sub = reg ? await reg.pushManager.getSubscription() : null
  return sub ? 'ativo' : 'inativo'
}

// ── Ativar notificações (tem de ser chamado a partir de um gesto do utilizador) ─
export async function ativarPush() {
  if (!pushSuportado()) throw new Error('Este dispositivo/navegador não suporta notificações.')
  if (!VAPID_PUBLIC_KEY) throw new Error('VITE_VAPID_PUBLIC_KEY em falta na configuração.')

  const permissao = await Notification.requestPermission()
  if (permissao !== 'granted') throw new Error('Permissão de notificações recusada.')

  const reg = (await navigator.serviceWorker.getRegistration()) || (await registarSW())
  await navigator.serviceWorker.ready

  let sub = await reg.pushManager.getSubscription()
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    })
  }

  const json = sub.toJSON()
  const { error } = await supabase
    .from('push_subscriptions')
    .upsert(
      {
        endpoint: json.endpoint,
        p256dh: json.keys?.p256dh,
        auth: json.keys?.auth,
        user_agent: navigator.userAgent,
        app: 'apoiot',
      },
      { onConflict: 'endpoint' },
    )
  if (error) throw error
  return 'ativo'
}

// ── Desativar notificações ────────────────────────────────────────────────────
export async function desativarPush() {
  const reg = await navigator.serviceWorker.getRegistration()
  const sub = reg ? await reg.pushManager.getSubscription() : null
  if (sub) {
    const endpoint = sub.toJSON().endpoint
    await sub.unsubscribe()
    await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint)
  }
  await limparBadge()
  return 'inativo'
}

// ── Limpar o número do ícone (ao abrir/focar a app) ───────────────────────────
export async function limparBadge() {
  try {
    if ('clearAppBadge' in navigator) await navigator.clearAppBadge()
  } catch { /* sem suporte — ignora */ }
  try {
    const reg = await navigator.serviceWorker?.getRegistration()
    reg?.active?.postMessage({ type: 'CLEAR_BADGE' })
  } catch { /* ignora */ }
}
