// Edge Function: supa-evento-to-calendar
// Sincroniza supa_eventos (projeto principal) → Google Calendar lmdcorporativo@gmail.com.
// Disparada por um Database Webhook em INSERT/UPDATE/DELETE de public.supa_eventos.
//
// Segredos necessários (supabase secrets set ...):
//   GOOGLE_SA_KEY   → JSON completo da service account (com private_key e client_email)
//   WEBHOOK_SECRET  → string partilhada; o webhook envia-a no header x-webhook-secret
// Auto-injetados pelo runtime: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//
// Pré-requisito manual: partilhar o calendário lmdcorporativo@gmail.com com o
// client_email da service account, com permissão "Fazer alterações nos eventos".

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const CALENDAR_ID = "lmdcorporativo@gmail.com";
const TZ = "Europe/Lisbon";
const SCOPE = "https://www.googleapis.com/auth/calendar";

// Campos relevantes para o evento de calendário (loop-guard em UPDATE).
const CAL_FIELDS = [
  "evento", "data_evento", "hora_inicio", "hora_fim",
  "morada", "status", "notas_operacionais", "responsavel", "espaco_id",
];

const b64url = (s: string) =>
  btoa(s).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");

async function importPrivateKey(pem: string) {
  const body = pem.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  const der = Uint8Array.from(atob(body), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey(
    "pkcs8", der.buffer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"],
  );
}

async function getAccessToken(sa: { client_email: string; private_key: string }) {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = b64url(JSON.stringify({
    iss: sa.client_email, scope: SCOPE,
    aud: "https://oauth2.googleapis.com/token",
    iat: now, exp: now + 3600,
  }));
  const unsigned = `${header}.${claim}`;
  const key = await importPrivateKey(sa.private_key);
  const sigBuf = await crypto.subtle.sign(
    { name: "RSASSA-PKCS1-v1_5" }, key, new TextEncoder().encode(unsigned),
  );
  const sig = b64url(String.fromCharCode(...new Uint8Array(sigBuf)));
  const assertion = `${unsigned}.${sig}`;
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${assertion}`,
  });
  const j = await res.json();
  if (!j.access_token) throw new Error("token error: " + JSON.stringify(j));
  return j.access_token as string;
}

const hms = (t: string) => (t.length === 5 ? `${t}:00` : t); // HH:MM → HH:MM:SS

function buildEvent(r: Record<string, any>) {
  const desc: string[] = [];
  if (r.responsavel) desc.push(`Responsável: ${r.responsavel}`);
  if (r.espaco_nome || r.cliente) desc.push(`Cliente: ${r.espaco_nome || r.cliente}`);
  if (r.contacto_pelo_evento) desc.push(`Contacto: ${r.contacto_pelo_evento}`);
  if (r.Equipamentos) desc.push(`Equipamentos: ${r.Equipamentos}`);
  if (r.notas_operacionais) desc.push(`Notas: ${r.notas_operacionais}`);
  desc.push(`#${r.id} · status: ${r.status || "-"}`);

  const ev: Record<string, any> = {
    summary: r.evento || "Evento",
    description: desc.join("\n"),
  };
  if (r.morada) ev.location = r.morada;

  if (r.hora_inicio) {
    const startT = hms(r.hora_inicio);
    const endT   = r.hora_fim ? hms(r.hora_fim) : startT;
    // hora_fim 00:00 ou anterior à hora_inicio → evento termina na meia-noite do dia seguinte
    let endDate = r.data_evento;
    if (endT <= startT) {
      const d = new Date(r.data_evento + "T00:00:00");
      d.setDate(d.getDate() + 1);
      endDate = d.toISOString().slice(0, 10);
    }
    ev.start = { dateTime: `${r.data_evento}T${startT}`, timeZone: TZ };
    ev.end   = { dateTime: `${endDate}T${endT}`,         timeZone: TZ };
  } else {
    ev.start = { date: r.data_evento };
    ev.end   = { date: r.data_evento };
  }
  return ev;
}

Deno.serve(async (req) => {
  // Guarda por segredo partilhado (o webhook envia x-webhook-secret).
  const secret = Deno.env.get("WEBHOOK_SECRET");
  if (secret && req.headers.get("x-webhook-secret") !== secret) {
    return new Response("unauthorized", { status: 401 });
  }

  const saRaw = Deno.env.get("GOOGLE_SA_KEY");
  if (!saRaw) return new Response("missing GOOGLE_SA_KEY", { status: 500 });
  const sa = JSON.parse(saRaw);

  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const calBase =
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(CALENDAR_ID)}/events`;

  try {
    const { type, record, old_record } = await req.json();
    const token = await getAccessToken(sa);
    const auth = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

    // Resolve o nome do espaço (o webhook envia a linha crua, sem o join).
    const enrich = async (r: Record<string, any> | null) => {
      if (r?.espaco_id) {
        const { data } = await sb.from("espacos").select("nome").eq("id", r.espaco_id).maybeSingle();
        if (data) r.espaco_nome = data.nome;
      }
      return r;
    };

    if (type === "DELETE") {
      if (old_record?.google_event_id) {
        await fetch(`${calBase}/${old_record.google_event_id}`, { method: "DELETE", headers: auth });
      }
      return new Response("deleted");
    }

    const r = await enrich(record) as Record<string, any>;
    const eligible = !!r.data_evento && r.status !== "cancelado";

    if (type === "INSERT") {
      if (!eligible) return new Response("skip: not eligible");
      const res = await fetch(calBase, { method: "POST", headers: auth, body: JSON.stringify(buildEvent(r)) });
      const j = await res.json();
      if (!res.ok) throw new Error("create: " + JSON.stringify(j));
      await sb.from("supa_eventos").update({ google_event_id: j.id }).eq("id", r.id);
      return new Response("created " + j.id);
    }

    if (type === "UPDATE") {
      // loop-guard: ignora updates que não tocam em campos do calendário
      // (ex.: a nossa própria escrita de google_event_id).
      const changed = CAL_FIELDS.some(
        (f) => JSON.stringify(record[f]) !== JSON.stringify(old_record?.[f]),
      );
      if (!changed) return new Response("skip: no calendar fields changed");

      const gid = r.google_event_id || old_record?.google_event_id;

      if (r.status === "cancelado") {
        if (gid) {
          await fetch(`${calBase}/${gid}`, { method: "DELETE", headers: auth });
          await sb.from("supa_eventos").update({ google_event_id: null }).eq("id", r.id);
        }
        return new Response("cancelled → removed from calendar");
      }

      if (gid) {
        const res = await fetch(`${calBase}/${gid}`, { method: "PATCH", headers: auth, body: JSON.stringify(buildEvent(r)) });
        if (!res.ok) throw new Error("patch: " + JSON.stringify(await res.json()));
        return new Response("updated " + gid);
      }
      if (eligible) {
        const res = await fetch(calBase, { method: "POST", headers: auth, body: JSON.stringify(buildEvent(r)) });
        const j = await res.json();
        if (!res.ok) throw new Error("create: " + JSON.stringify(j));
        await sb.from("supa_eventos").update({ google_event_id: j.id }).eq("id", r.id);
        return new Response("created (late) " + j.id);
      }
      return new Response("noop");
    }

    return new Response("ignored type: " + type);
  } catch (e) {
    console.error(e);
    return new Response("error: " + String(e), { status: 500 });
  }
});
