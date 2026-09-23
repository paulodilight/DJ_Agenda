import webpush from 'npm:web-push@3.6.7'
import { createClient } from 'npm:@supabase/supabase-js@2'

const VAPID_PUBLIC  = Deno.env.get('VAPID_PUBLIC_KEY')!
const VAPID_PRIVATE = Deno.env.get('VAPID_PRIVATE_KEY')!
const SUPABASE_URL  = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY   = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const WEBHOOK_SECRET = Deno.env.get('WEBHOOK_SECRET')!

webpush.setVapidDetails('mailto:dj@paulodilight.com', VAPID_PUBLIC, VAPID_PRIVATE)

const TZ = 'Europe/Lisbon'

function toLocalDatetime(d: Date) {
  // Returns ISO string in Lisbon time for SQL comparison
  return new Date(d.toLocaleString('en-US', { timeZone: TZ })).toISOString()
}

Deno.serve(async (req) => {
  if (req.headers.get('x-webhook-secret') !== WEBHOOK_SECRET) {
    return new Response('Unauthorized', { status: 401 })
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY)
  const now = new Date()

  // Janelas de tempo (em Lisbon)
  // 5 min: eventos que começam entre agora+2.5min e agora+7.5min
  const w5_low  = new Date(now.getTime() + 2.5 * 60 * 1000)
  const w5_high = new Date(now.getTime() + 7.5 * 60 * 1000)
  // 4h: eventos que começam entre agora+3h57.5min e agora+4h2.5min
  const w4_low  = new Date(now.getTime() + (4 * 60 - 2.5) * 60 * 1000)
  const w4_high = new Date(now.getTime() + (4 * 60 + 2.5) * 60 * 1000)

  // Obter push subscriptions
  const { data: subs } = await supabase
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth')
    .eq('app', 'apoiot')

  if (!subs || subs.length === 0) {
    return new Response(JSON.stringify({ ok: true, sent: 0 }), { status: 200 })
  }

  async function buscarEventos(low: Date, high: Date) {
    const { data } = await supabase
      .from('supa_eventos')
      .select('id, evento, cliente, hora_inicio, data_evento')
      .not('status', 'ilike', 'cancelado')
      .filter(
        'data_evento',
        'gte',
        low.toISOString().slice(0, 10)
      )
      .filter(
        'data_evento',
        'lte',
        high.toISOString().slice(0, 10)
      )

    // Filtrar por hora_inicio (a query anterior pode trazer dias extra)
    const lowTime = low.toLocaleTimeString('pt-PT', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false })
    const highTime = high.toLocaleTimeString('pt-PT', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false })

    return (data || []).filter(e => {
      if (!e.hora_inicio) return false
      const h = e.hora_inicio.slice(0, 5)
      return h >= lowTime && h <= highTime
    })
  }

  async function enviarPush(title: string, body: string) {
    const payload = JSON.stringify({ title, body, badge: 1 })
    await Promise.all(
      subs!.map(sub =>
        webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload
        ).catch(() => {})
      )
    )
  }

  const eventos5  = await buscarEventos(w5_low, w5_high)
  const eventos4h = await buscarEventos(w4_low, w4_high)

  let sent = 0

  for (const ev of eventos5) {
    const hora = ev.hora_inicio?.slice(0, 5) ?? ''
    const nome = ev.evento || ev.cliente || 'Evento'
    await enviarPush(
      `⏰ Evento em 5 minutos — ${hora}`,
      `${nome} · Assina a tua presença na app`
    )
    sent++
  }

  for (const ev of eventos4h) {
    const hora = ev.hora_inicio?.slice(0, 5) ?? ''
    const nome = ev.evento || ev.cliente || 'Evento'
    await enviarPush(
      `🔔 Lembrete — Evento em 4 horas · ${hora}`,
      nome
    )
    sent++
  }

  return new Response(JSON.stringify({ ok: true, sent, eventos5: eventos5.length, eventos4h: eventos4h.length }), {
    headers: { 'Content-Type': 'application/json' }
  })
})
