// Edge Function: send-push
// Envia Web Push para todos os dispositivos da app Apoio Técnico (Xclusive TS)
// quando há um evento (supa_eventos) ou ocorrência (ocorrencias) novo/alterado.
//
// Disparada por Database Webhooks em INSERT/UPDATE de public.supa_eventos e
// public.ocorrencias (ver SETUP.md).
//
// Segredos necessários (supabase secrets set ...):
//   VAPID_PUBLIC_KEY   → chave pública VAPID (mesma que o frontend usa em VITE_VAPID_PUBLIC_KEY)
//   VAPID_PRIVATE_KEY  → chave privada VAPID
//   VAPID_SUBJECT      → "mailto:dj@paulodilight.com" (ou um URL)
//   WEBHOOK_SECRET     → string partilhada; o webhook envia-a no header x-webhook-secret
// Auto-injetados pelo runtime: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

// Campos cuja alteração é "relevante" num evento (evita push em escritas
// internas, ex.: a sincronização de calendário que grava google_event_id).
const EVENTO_FIELDS = [
  "evento", "data_evento", "hora_inicio", "hora_fim", "hora_instalacao",
  "dia_instalacao", "status", "morada", "espaco_id", "notas_operacionais",
];

function mudou(record: Record<string, any>, old: Record<string, any> | null, campos: string[]) {
  if (!old) return true;
  return campos.some((c) => JSON.stringify(record?.[c]) !== JSON.stringify(old?.[c]));
}

function montarMensagem(table: string, type: string, record: Record<string, any>) {
  if (table === "supa_eventos") {
    const nome = record.evento || "Evento";
    const data = record.data_evento || "";
    const hora = record.hora_inicio ? ` às ${String(record.hora_inicio).slice(0, 5)}` : "";
    if (type === "INSERT") return { title: "🆕 Novo evento", body: `${nome} — ${data}${hora}` };
    if (record.status === "cancelado") return { title: "❌ Evento cancelado", body: `${nome} — ${data}` };
    return { title: "✏️ Evento atualizado", body: `${nome} — ${data}${hora}` };
  }
  if (table === "ocorrencias") {
    const titulo = record.titulo || record.descricao || "Ocorrência";
    if (type === "INSERT") return { title: "⚠️ Nova ocorrência", body: String(titulo).slice(0, 120) };
    return { title: "⚠️ Ocorrência atualizada", body: String(titulo).slice(0, 120) };
  }
  return { title: "Xclusive TS", body: "Há novidades na agenda." };
}

Deno.serve(async (req) => {
  const secret = Deno.env.get("WEBHOOK_SECRET");
  if (secret && req.headers.get("x-webhook-secret") !== secret) {
    return new Response("unauthorized", { status: 401 });
  }

  const pub = Deno.env.get("VAPID_PUBLIC_KEY");
  const priv = Deno.env.get("VAPID_PRIVATE_KEY");
  const subject = Deno.env.get("VAPID_SUBJECT") || "mailto:dj@paulodilight.com";
  if (!pub || !priv) return new Response("missing VAPID keys", { status: 500 });
  webpush.setVapidDetails(subject, pub, priv);

  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const { type, table, record, old_record } = await req.json();

    // Só notificamos em INSERT/UPDATE de eventos e ocorrências.
    if (!["INSERT", "UPDATE"].includes(type)) return new Response("ignored", { status: 200 });
    if (!["supa_eventos", "ocorrencias"].includes(table)) return new Response("ignored", { status: 200 });

    // Em UPDATE de evento, só avança se um campo relevante mudou (loop-guard).
    if (table === "supa_eventos" && type === "UPDATE" && !mudou(record, old_record, EVENTO_FIELDS)) {
      return new Response("no relevant change", { status: 200 });
    }
    // Não notificar eventos criados já como cancelados.
    if (table === "supa_eventos" && type === "INSERT" && record?.status === "cancelado") {
      return new Response("ignored cancelled", { status: 200 });
    }

    const msg = montarMensagem(table, type, record || {});
    const payload = JSON.stringify({ ...msg, url: "/apoiot", tag: `${table}-${record?.id ?? ""}` });

    const { data: subs, error } = await sb
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth")
      .eq("app", "apoiot");
    if (error) throw error;

    let enviados = 0;
    const expirados: string[] = [];
    await Promise.all((subs ?? []).map(async (s) => {
      const subscription = { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } };
      try {
        await webpush.sendNotification(subscription, payload);
        enviados++;
      } catch (e: any) {
        const code = e?.statusCode;
        if (code === 404 || code === 410) expirados.push(s.id); // subscrição morta
      }
    }));

    if (expirados.length) {
      await sb.from("push_subscriptions").delete().in("id", expirados);
    }

    return new Response(JSON.stringify({ enviados, removidos: expirados.length }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response("error: " + (e?.message ?? String(e)), { status: 500 });
  }
});
