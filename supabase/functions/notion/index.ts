// ================== Puente Portal Nuwek → Notion (Supabase Edge Function) ==================
// El navegador no puede llamar a Notion (Notion bloquea esas llamadas y la llave quedaría a la vista de todos).
// Esta función vive en Supabase, guarda la llave como SECRETO y solo sabe hacer dos cosas:
//   - action "schema": dice qué columnas encontró en la tabla de citas (para probar la conexión)
//   - action "cita":   crea o actualiza la página de UNA cita en esa tabla (nunca borra, nunca toca otras tablas)
// Secretos (Supabase → Edge Functions → Secrets):  NOTION_TOKEN  y  NOTION_DB_CITAS
// Las columnas se reconocen por su nombre (sin importar acentos ni mayúsculas) y por su tipo; las que no
// existan en tu tabla simplemente no se llenan. La columna «ID portal» (texto) es OBLIGATORIA: con ella cada cita
// tiene una sola página aunque la manden dos pestañas o dos computadoras.
// Solo acepta llamadas con el «pase» que da la función google-auth al entrar con usuario y código (misma firma).

const NOTION = "https://api.notion.com/v1";
const VERSION = "2022-06-28"; // estable; usa database_id como padre
const TOKEN = Deno.env.get("NOTION_TOKEN") ?? ""; 
const DB = (Deno.env.get("NOTION_DB_CITAS") ?? "").replace(/-/g, "");

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const SB_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const SIGN_KEY = Deno.env.get("GAUTH_SECRET") || SB_KEY;   // la misma llave de firma que google-auth

// ---------- pase (igual que en google-auth: firmado y ligado al código vigente de la persona) ----------
const enc = new TextEncoder();
const b64u = (b: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromB64u = (s: string) => new TextDecoder().decode(Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0)));
async function hmac(data: string) {
  const k = await crypto.subtle.importKey("raw", enc.encode(SIGN_KEY), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64u(await crypto.subtle.sign("HMAC", k, enc.encode(data)));
}
function same(a: string, b: string) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
const passErr = (m: string) => Object.assign(new Error(m), { status: 401, code: "pass" });
async function checkPass(st: unknown) {
  if (typeof st !== "string" || !st.includes(".")) throw passErr("Falta el pase: sal y vuelve a entrar al portal.");
  const [body, sig] = st.split(".");
  if (!same(await hmac(body), sig || "")) throw passErr("Pase inválido: sal y vuelve a entrar al portal.");
  let p: any;
  try { p = JSON.parse(fromB64u(body)); } catch { throw passErr("Pase inválido"); }
  if (!p.w || !p.v || !(p.exp > Date.now()) || String(p.w).startsWith("cli:")) throw passErr("Pase vencido: sal y vuelve a entrar al portal.");
  const r = await fetch(`${SB_URL}/rest/v1/personal?id=eq.${encodeURIComponent(p.w)}&select=*`, { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } });
  const u = r.ok ? (await r.json())?.[0] : null;
  if (!u || u.active === false || !u.password || !same((await hmac("v:" + String(u.password))).slice(0, 16), p.v)) throw passErr("Tu acceso cambió: sal y vuelve a entrar al portal.");
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

async function notion(path: string, method = "GET", body?: unknown) {
  for (let i = 0; ; i++) {
    const r = await fetch(NOTION + path, {
      method,
      headers: { Authorization: `Bearer ${TOKEN}`, "Notion-Version": VERSION, "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (r.status === 429 && i < 3) { await new Promise((z) => setTimeout(z, 1000 * (i + 1))); continue; } // Notion pide esperar
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(data.message || `Notion respondió ${r.status}`), { status: r.status, code: data.code });
    return data;
  }
}

// ---------- columnas de la tabla ----------
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
// dato del portal → nombres de columna que se aceptan (ya normalizados)
const NAMES: Record<string, string[]> = {
  fecha: ["fecha", "fechahora", "fechayhora", "cuando", "date", "horario"],
  cliente: ["cliente", "empresa", "client", "nombrecliente", "nombredelcliente"],
  proyecto: ["proyecto", "project", "servicio"],
  responsable: ["responsable", "asesor", "consultor", "encargado", "atiende"],
  meet: ["enlacedegooglemeet", "googlemeet", "meet", "linkmeet", "enlacemeet", "linkdemeet", "videollamada", "enlacedelareunion", "linkdelareunion"],
  estado: ["estado", "estatus", "status"],
  lugar: ["lugar", "modalidad", "ubicacion", "direccion"],
  objetivo: ["objetivo", "notas", "descripcion", "tema", "motivo"],
  telefono: ["telefono", "tel", "phone", "celular", "whatsapp"],
  correo: ["correo", "email", "mail", "correoelectronico"],
  portal: ["linkalportal", "enlacealportal", "portal", "linkportal", "abrirenportal", "nuwek"],
  id: ["idportal", "portalid", "idnuwek", "idcita", "id"],
};
type Prop = { id: string; name: string; type: string; [k: string]: any };
let cache: { at: number; props: Record<string, Prop>; title: string; map: Record<string, Prop> } | null = null;

async function schema(force = false) {
  if (!force && cache && Date.now() - cache.at < 5 * 60_000) return cache;
  const db = await notion(`/databases/${DB}`);
  const props: Record<string, Prop> = {};
  for (const [name, p] of Object.entries<any>(db.properties || {})) props[name] = { ...p, name };
  const list = Object.values(props);
  const title = list.find((p) => p.type === "title")?.name ?? "";
  const map: Record<string, Prop> = {};
  const used = new Set<string>([title]);
  for (const [k, names] of Object.entries(NAMES)) {
    const hit = list.find((p) => !used.has(p.name) && names.includes(norm(p.name)));
    if (hit) { map[k] = hit; used.add(hit.name); }
  }
  // si no hay columna con nombre conocido, se usa la primera de ese tipo
  const byType = (k: string, t: string) => {
    if (map[k]) return;
    const hit = list.find((p) => !used.has(p.name) && p.type === t);
    if (hit) { map[k] = hit; used.add(hit.name); }
  };
  byType("fecha", "date");
  byType("meet", "url");
  byType("telefono", "phone_number");
  byType("correo", "email");
  cache = { at: Date.now(), props, title, map };
  return cache;
}

// estado del portal → nombres que puede tener la opción en Notion
const ESTADOS: Record<string, [string, string[]]> = {
  pendiente: ["Pendiente", ["pendiente", "sinrespuesta", "porconfirmar", "agendada", "agendado", "programada", "notstarted"]],
  confirmado: ["Confirmada", ["confirmada", "confirmado", "confirmed"]],
  reprogramar: ["Reprogramar", ["reprogramar", "reprogramada", "pidereprogramar", "reagendar"]],
  cancelado: ["Cancelada", ["cancelada", "cancelado", "cancelled"]],
  realizada: ["Realizada", ["realizada", "realizado", "completado", "completada", "asistio", "hecha", "done"]],
};

// arma el valor según el TIPO real de la columna en Notion
function value(p: Prop, v: any): any | undefined {
  const txt = (s: unknown) => [{ text: { content: String(s ?? "").slice(0, 1900) } }];
  switch (p.type) {
    case "title": return { title: txt(v) };
    case "rich_text": return { rich_text: v ? txt(v) : [] };
    case "url": return { url: v || null };
    case "phone_number": return { phone_number: v || null };
    case "email": return { email: v || null };
    case "number": return { number: v === "" || v == null || isNaN(+v) ? null : +v };
    case "date": return { date: v && v.start ? v : null };
    case "checkbox": return { checkbox: !!v };
    case "select": case "status": case "multi_select": {
      if (!v) return p.type === "multi_select" ? { multi_select: [] } : { [p.type]: null };
      const [label, alias] = ESTADOS[v as string] ?? [String(v), [norm(String(v))]];
      const opts: any[] = p[p.type]?.options ?? [];
      const found = opts.find((o) => alias.includes(norm(o.name)) || norm(o.name) === norm(label));
      if (p.type === "status") return found ? { status: { name: found.name } } : undefined; // status no permite crear opciones
      const name = (found?.name ?? label).replace(/,/g, " ");
      return p.type === "select" ? { select: { name } } : { multi_select: [{ name }] };
    }
    default: return undefined; // relaciones, fórmulas, etc.: no se tocan
  }
}

function properties(s: Awaited<ReturnType<typeof schema>>, c: any) {
  const out: Record<string, unknown> = {};
  if (s.title) out[s.title] = value(s.props[s.title], c.nombre || "(Sin nombre)");
  const put = (k: string, v: unknown) => { const p = s.map[k]; if (!p) return; const x = value(p, v); if (x !== undefined) out[p.name] = x; };
  put("fecha", c.fecha);
  put("cliente", c.cliente);
  put("proyecto", c.proyecto);
  put("responsable", c.responsable);
  put("meet", c.meet);
  put("estado", c.estado);
  put("lugar", c.lugar);
  put("objetivo", c.objetivo);
  put("telefono", c.telefono);
  put("correo", c.correo);
  put("portal", c.portal);
  put("id", c.sid);
  return out;
}

async function upsertCita(c: any) {
  if (!c || typeof c.sid !== "string" || !c.sid) throw Object.assign(new Error("Falta el id de la cita"), { status: 400, code: "cita" });
  let s = await schema();
  if (!s.map.id) s = await schema(true);   // quizá la columna se acaba de agregar: se vuelve a leer la tabla
  // sin «ID portal» no hay forma segura de saber si la cita ya tiene página: mejor no crear que duplicar
  const idp = s.map.id;
  if (!idp || idp.type !== "rich_text")
    throw Object.assign(new Error("Agrega a tu tabla de Notion una columna de tipo Texto llamada «ID portal» (evita citas duplicadas)."), { status: 400, code: "noid" });
  const props = properties(s, c);
  const q = await notion(`/databases/${DB}/query`, "POST", { filter: { property: idp.name, rich_text: { equals: c.sid } }, page_size: 1 });
  const hit = q.results?.[0];
  if (hit) { const up = await notion(`/pages/${hit.id}`, "PATCH", { properties: props }); return { id: up.id, url: up.url, op: "actualizada" }; }
  const pg = await notion(`/pages`, "POST", { parent: { database_id: DB }, properties: props });
  return { id: pg.id, url: pg.url, op: "creada" };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Solo POST" }, 405);
  if (!TOKEN || !DB) return json({ error: "Faltan los secretos NOTION_TOKEN y/o NOTION_DB_CITAS en Supabase", code: "config" }, 500);
  try {
    const body = await req.json().catch(() => ({}));
    await checkPass(body.st);
    if (body.action === "schema") {
      const s = await schema(true);
      return json({
        ok: true, titulo: s.title,
        columnas: Object.values(s.props).map((p) => ({ nombre: p.name, tipo: p.type })),
        usadas: Object.fromEntries(Object.entries(s.map).map(([k, p]) => [k, p.name])),
      });
    }
    if (body.action === "cita") return json({ ok: true, ...(await upsertCita(body.cita)) });
    return json({ error: "Acción no permitida" }, 400);
  } catch (e: any) {
    const status = e.status === 401 ? 401 : e.status === 404 ? 404 : e.status || 500;
    const why = e.code === "pass" ? e.message
      : e.status === 401 ? "La llave de Notion no es válida (NOTION_TOKEN)."
      : e.status === 404 ? "Notion no encuentra la tabla: revisa NOTION_DB_CITAS y que la tabla esté conectada a la integración (⋯ → Conexiones)."
      : e.message;
    return json({ error: why, code: e.status === 401 && e.code !== "pass" ? "token" : e.status === 404 ? "tabla" : e.code ?? "notion" }, status);
  }
});
