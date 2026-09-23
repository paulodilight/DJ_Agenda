import webpush from 'npm:web-push@3.6.7'
import { createClient } from 'npm:@supabase/supabase-js@2'

const VAPID_PUBLIC   = Deno.env.get('VAPID_PUBLIC_KEY')!
const VAPID_PRIVATE  = Deno.env.get('VAPID_PRIVATE_KEY')!
const SUPABASE_URL   = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY    = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const WEBHOOK_SECRET = Deno.env.get('WEBHOOK_SECRET')!

webpush.setVapidDetails('mailto:dj@paulodilight.com', VAPID_PUBLIC, VAPID_PRIVATE)

const TZ = 'Europe/Lisbon'

function toLisbonHHMM(d: Date) {
  return d.toLocaleTimeString('pt-PT', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false })
}

function toLisbonDate(d: Date) {
  return d.toLocaleDateString('sv-SE', { timeZone: TZ }) // YYYY-MM-DD
}

Deno.serve(async (req) => {
  if (req.headers.get('x-webhook-secret') !== WEBHOOK_SECRET) {
    return new Response('Unauthorized', { status: 401 })
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY)
  const now = new Date()

  // Janelas de tempo (±2.5 min centradas no momento alvo)
  const w5_low  = new Date(now.getTime() + 2.5 * 60 * 1000)
  const w5_high = new Date(now.getTime() + 7.5 * 60 * 1000)
  const w4_low  = new Date(now.getTime() + (4 * 60 - 2.5) * 60 * 1000)
  const w4_high = new Date(now.getTime() + (4 * 60 + 2.5) * 60 * 1000)
  // 10 min depois de hora_fim: hora_fim ficou entre 7.5 e 12.5 min atrás
  const wFim_low  = new Date(now.getTime() - 12.5 * 60 * 1000)
  const wFim_high = new Date(now.getTime() - 7.5 * 60 * 1000)

  const { data: subs } = await supabase
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth')
    .eq('app', 'apoiot')

  if (!subs || subs.length === 0) {
    return new Response(JSON.stringify({ ok: true, sent: 0 }), { status: 200 })
  }

  // Busca eventos onde campoData+campoHora cai na janela [low, high] (hora em Lisbon)
  async function buscarEventos(low: Date, high: Date, campoData: string, campoHora: string) {
    const lowDate  = toLisbonDate(low)
    const highDate = toLisbonDate(high)
    const lowTime  = toLisbonHHMM(low)
    const highTime = toLisbonHHMM(high)

    const { data } = await supabase
      .from('supa_eventos')
      .select('id, evento, cliente, hora_inicio, hora_fim, hora_instalacao, dia_instalacao, data_evento, recorrente')
      .not('status', 'ilike', 'cancelado')
      .gte(campoData, lowDate)
      .lte(campoData, highDate)

    return (data || []).filter(e => {
      const h = (e[campoHora] ?? '').slice(0, 5)
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

  let sent = 0

  // ── NÃO-RECORRENTES ────────────────────────────────────────────────────────

  // 4h antes hora_inicio → lembrete
  const ev4h = (await buscarEventos(w4_low, w4_high, 'data_evento', 'hora_inicio'))
    .filter(e => !e.recorrente)
  for (const ev of ev4h) {
    const hora = ev.hora_inicio?.slice(0, 5) ?? ''
    const nome = ev.evento || ev.cliente || 'Evento'
    await enviarPush(`🔔 Lembrete — Evento em 4 horas · ${hora}`, nome)
    sent++
  }

  // 5 min antes hora_instalacao → assina presença
  const evInstalacao = (await buscarEventos(w5_low, w5_high, 'dia_instalacao', 'hora_instalacao'))
    .filter(e => !e.recorrente)
  for (const ev of evInstalacao) {
    const hora = ev.hora_instalacao?.slice(0, 5) ?? ''
    const nome = ev.evento || ev.cliente || 'Evento'
    await enviarPush(`⏰ Evento em 5 minutos — ${hora}`, `${nome} · Assina a tua presença na app`)
    sent++
  }

  // 5 min antes hora_inicio → regista fotos
  const evInicio = (await buscarEventos(w5_low, w5_high, 'data_evento', 'hora_inicio'))
    .filter(e => !e.recorrente)
  for (const ev of evInicio) {
    const nome = ev.evento || ev.cliente || 'Evento'
    await enviarPush(`✅ ${nome}`, 'Tudo pronto? Regista com 2 ou 3 fotos.')
    sent++
  }

  // ── RECORRENTES ────────────────────────────────────────────────────────────

  // 5 min antes hora_inicio → aviso de início
  const evRec5 = (await buscarEventos(w5_low, w5_high, 'data_evento', 'hora_inicio'))
    .filter(e => e.recorrente)
  for (const ev of evRec5) {
    const hora = ev.hora_inicio?.slice(0, 5) ?? ''
    const nome = ev.evento || ev.cliente || 'Evento'
    await enviarPush(`⏰ Evento em 5 minutos — ${hora}`, nome)
    sent++
  }

  // 10 min depois hora_fim → lembrete de conclusão
  const evRecFim = (await buscarEventos(wFim_low, wFim_high, 'data_evento', 'hora_fim'))
    .filter(e => e.recorrente)
  for (const ev of evRecFim) {
    const nome = ev.evento || ev.cliente || 'Evento'
    await enviarPush(`💼 ${nome}`, 'Não te esqueças de concluir o evento ou fechar o dia de trabalho!')
    sent++
  }

  return new Response(JSON.stringify({ ok: true, sent }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
