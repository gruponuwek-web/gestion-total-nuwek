// ================== Google Calendar sin desconexiones (Supabase Edge Function) ==================
// Google da al navegador permisos de solo 1 hora y el navegador no puede renovarlos solo (bloquea la ventana de Google
// si no la abrió un clic). Además la vinculación vivía en UN navegador. Esta función guarda, por persona, el permiso
// PERMANENTE de Google (refresh token) y entrega un permiso nuevo de 1 h cada vez que el portal lo pide, sin ventanas
// y desde cualquier navegador.
//   login  → comprueba usuario + código del portal y entrega un «pase» firmado (30 días) a ese navegador
//   link   → con el pase y el código que da Google al conectar, guarda el permiso permanente
//   token  → con el pase, entrega un permiso nuevo de 1 h (o {linked:false} si no hay vínculo)
//   unlink → con el pase, quita el vínculo (y se lo revoca a Google)
// Secretos: GOOGLE_CLIENT_SECRET (obligatorio), GOOGLE_CLIENT_ID (opcional), GAUTH_SECRET (opcional).
// SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY los pone Supabase solo. Tabla: google_tokens (ver README).

const CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID") ?? "750897224529-ubbga1c9ioo28s2lh8a30l637c187lcn.apps.googleusercontent.com";
const CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET") ?? "";
const SB_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const SIGN_KEY = Deno.env.get("GAUTH_SECRET") || SB_KEY;
const PASS_DAYS = 30;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
const fail = (msg: string, status = 400, code = "") => Object.assign(new Error(msg), { status, code });

// ---------- pase firmado (HMAC) ----------
const enc = new TextEncoder();
const b64u = (b: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromB64u = (s: string) => new TextDecoder().decode(Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0)));
async function hmac(data: string) {
  const k = await crypto.subtle.importKey("raw", enc.encode(SIGN_KEY), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64u(await crypto.subtle.sign("HMAC", k, enc.encode(data)));
}
// comparación de tiempo constante (no deja adivinar la firma midiendo tiempos)
function same(a: string, b: string) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
// «versión» del código de acceso: si cambian el código o desactivan a la persona, sus pases dejan de servir
const credVersion = async (code: string) => (await hmac("v:" + code)).slice(0, 16);
async function makePass(who: string, v: string) {
  const body = b64u(enc.encode(JSON.stringify({ w: who, v, exp: Date.now() + PASS_DAYS * 86400000 })));
  return body + "." + (await hmac(body));
}
async function readPass(st: unknown): Promise<{ w: string; v: string }> {
  if (typeof st !== "string" || !st.includes(".")) throw fail("Pase inválido", 401, "pass");
  const [body, sig] = st.split(".");
  if (!same(await hmac(body), sig || "")) throw fail("Pase inválido", 401, "pass");
  let p: any;
  try { p = JSON.parse(fromB64u(body)); } catch { throw fail("Pase inválido", 401, "pass"); }
  if (!p.w || !p.v || !(p.exp > Date.now())) throw fail("Pase vencido", 401, "pass");
  return { w: p.w, v: p.v };
}

// ---------- base de datos (con la llave de servicio: solo esta función ve la tabla) ----------
async function db(path: string, method = "GET", body?: unknown, prefer = "") {
  const r = await fetch(`${SB_URL}/rest/v1/${path}`, {
    method,
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, "Content-Type": "application/json", ...(prefer ? { Prefer: prefer } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) throw fail("Base de datos: " + (await r.text()).slice(0, 200), 500, "db");
  return r.status === 204 ? null : r.json().catch(() => null);
}
const getRow = async (who: string) => ((await db(`google_tokens?who=eq.${encodeURIComponent(who)}&select=*`)) ?? [])[0];
const delRow = (who: string) => db(`google_tokens?who=eq.${encodeURIComponent(who)}`, "DELETE");

// ---------- comprobar usuario + código (lo mismo que pide la pantalla de entrada) ----------
// código vigente de una persona (null si no existe o está desactivada)
async function currentCode(who: string): Promise<string | null> {
  const m = who.match(/^cli:([^:]+):(.+)$/);
  if (m) {
    const rows = await db(`clientes?id=eq.${encodeURIComponent(m[1])}&select=*`);
    const c = rows?.[0];
    const p = (c?.contactos ?? []).find((x: any) => x && x.id === m[2]);
    return c && c.activo !== false && p && p.portal && p.portal.activo !== false && p.portal.code ? String(p.portal.code) : null;
  }
  const rows = await db(`personal?id=eq.${encodeURIComponent(who)}&select=*`);
  const u = rows?.[0];
  return u && u.active !== false && u.password ? String(u.password) : null;
}
// máx. 5 intentos fallidos por persona cada 10 min (en esta instancia de la función)
const tries = new Map<string, { n: number; until: number }>();
async function checkLogin(b: any): Promise<string> {
  const who = b.kind === "staff" ? String(b.uid || "") : b.kind === "cli" ? `cli:${b.cid}:${b.pid}` : "";
  if (!who || who === "cli::") throw fail("Tipo de usuario no válido");
  const t = tries.get(who);
  if (t && t.n >= 5 && Date.now() < t.until) throw fail("Demasiados intentos. Espera unos minutos.", 429, "login");
  const code = await currentCode(who);
  const given = String((b.kind === "staff" ? b.pin : b.code) ?? "").trim();
  if (!code || !same(code, given)) {
    const n = t && Date.now() < t.until ? t.n + 1 : 1;
    tries.set(who, { n, until: Date.now() + 10 * 60000 });
    throw fail("Usuario o código incorrecto", 401, "login");
  }
  tries.delete(who);
  return makePass(who, await credVersion(code));
}
// el pase sirve solo si la persona sigue activa y con el MISMO código que cuando lo recibió
async function checkPass(st: unknown): Promise<string> {
  const { w, v } = await readPass(st);
  const code = await currentCode(w);
  if (!code || !same(await credVersion(code), v)) throw fail("Tu acceso cambió. Sal y vuelve a entrar al portal.", 401, "pass");
  return w;
}

// ---------- Google ----------
async function google(params: Record<string, string>) {
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET, ...params }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw fail(d.error_description || d.error || `Google respondió ${r.status}`, r.status === 400 || r.status === 401 ? 400 : 502, d.error || "google");
  return d;
}
async function emailOf(access: string) {
  try {
    const r = await fetch("https://www.googleapis.com/calendar/v3/calendars/primary", { headers: { Authorization: `Bearer ${access}` } });
    const d = await r.json();
    return r.ok ? String(d.id || d.summary || "") : "";
  } catch { return ""; }
}
const out = (d: any, row: any) => ({ linked: true, access_token: d.access_token, expires_in: d.expires_in, scope: d.scope || row?.scope || "", email: row?.email || "" });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Solo POST" }, 405);
  if (!CLIENT_SECRET || !SB_URL || !SB_KEY) return json({ error: "Falta el secreto GOOGLE_CLIENT_SECRET en Supabase", code: "config" }, 500);
  try {
    const b = await req.json().catch(() => ({}));
    if (b.action === "login") return json({ st: await checkLogin(b) });

    const who = await checkPass(b.st);
    if (b.action === "link") {
      if (typeof b.code !== "string" || !b.code) throw fail("Falta el código de Google");
      const d = await google({ code: b.code, grant_type: "authorization_code", redirect_uri: "postmessage" });
      const old = await getRow(who);
      const refresh = d.refresh_token || old?.refresh_token;
      if (!refresh) {
        // Google solo da el permiso permanente la primera vez. Se le revoca este acceso para que el próximo «Conectar»
        // vuelva a pedir permiso y lo entregue (pasa si la cuenta ya estaba autorizada o el vínculo se borró aquí)
        await fetch("https://oauth2.googleapis.com/revoke?token=" + encodeURIComponent(d.access_token), { method: "POST" }).catch(() => {});
        throw fail("Google pidió confirmar el permiso otra vez. Presiona «Conectar» una vez más.", 400, "norefresh");
      }
      const email = (await emailOf(d.access_token)) || old?.email || "";
      await db("google_tokens?on_conflict=who", "POST", { who, refresh_token: refresh, email, scope: d.scope || "", updated_at: new Date().toISOString() }, "resolution=merge-duplicates");
      return json(out(d, { email, scope: d.scope }));
    }
    if (b.action === "token") {
      const row = await getRow(who);
      if (!row) return json({ linked: false });
      try {
        const d = await google({ refresh_token: row.refresh_token, grant_type: "refresh_token" });
        return json(out(d, row));
      } catch (e: any) {
        // el permiso ya no sirve (lo quitaron en la cuenta de Google, cambió la contraseña, o la app de Google está en «Prueba» y pasaron 7 días)
        if (e.code === "invalid_grant") { await delRow(who); return json({ linked: false, revoked: true }); }
        throw e;
      }
    }
    if (b.action === "unlink") {
      const row = await getRow(who);
      if (row) {
        await fetch("https://oauth2.googleapis.com/revoke?token=" + encodeURIComponent(row.refresh_token), { method: "POST" }).catch(() => {});
        await delRow(who);
      }
      return json({ ok: true });
    }
    return json({ error: "Acción no permitida" }, 400);
  } catch (e: any) {
    return json({ error: e.message || "Error", code: e.code || "" }, e.status || 500);
  }
});
