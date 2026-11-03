// ================== Puente Portal Nuwek → Notion (Google Apps Script) ==================
// Reemplaza a la función «notion» de Supabase. El navegador no puede llamar a Notion directo (Notion bloquea esas
// llamadas y la llave quedaría a la vista), así que el portal le habla a este script y el script le habla a Notion.
// La llave de Notion vive SOLO en las «Propiedades del script» (Configuración del proyecto → Propiedades del script):
//   NOTION_TOKEN     = la llave de la integración de Notion (ntn_… o secret_…)      ← obligatoria
//   NOTION_DB_CITAS  = el Database ID de la tabla de citas (32 caracteres de la URL)  ← obligatoria
//   NOTION_PAGINA    = (opcional) página de Notion donde ▶ crearTablaCitas() crea la tabla de citas ya lista;
//                      al crearla, NOTION_DB_CITAS se llena solo.
// Solo sabe hacer tres cosas:
//   - action "login":  comprueba usuario y código contra la tabla «personal» del portal y entrega un «pase» firmado (30 días)
//   - action "schema": dice qué columnas encontró en la tabla de citas (para probar la conexión)
//   - action "cita":   crea o actualiza la página de UNA cita (nunca borra, nunca toca otras tablas)
//   - action "minutas": busca la nota de reunión con IA de Notion (AI Meeting Notes) de cada cita ya pasada y
//                       devuelve su link, estado y resumen (solo lee; la grabación se inicia en Notion)
//   - minutas del portal: con «cita» pueden venir las minutas cerradas del portal (c.minutasPortal); cada una se escribe
//     como subpágina «📝 Minuta · fecha [id]» dentro de la página de la cita. Al editarla en el portal, la subpágina se
//     reemplaza (solo las que creó el portal, reconocidas por su [id]; lo demás de la página no se toca).
// Las columnas se reconocen por su nombre (sin importar acentos ni mayúsculas) y por su tipo; las que no existan en la
// tabla simplemente no se llenan. Si falta la columna de texto «ID portal», el script la crea sola.

// Datos públicos del portal (los mismos de js/core/supabase-config.js; la llave «publishable» es pública por diseño)
const SB_URL = 'https://wxxuxaodpikkelrjkacs.supabase.co';
const SB_KEY = 'sb_publishable_jkSQwyt_z7o9bAdOD8XgOw_ruAPWS8t';

const NOTION = 'https://api.notion.com/v1';
const NOTION_VERSION = '2022-06-28';
const MEET_VERSION = '2026-03-11';   // las notas de reunión con IA solo existen en esta versión de la API
const PASS_DAYS = 30;
const MAX_FAILS = 5, LOCK_MIN = 10;          // 5 códigos equivocados seguidos → ese usuario espera 10 min

// ---------- configuración ----------
function prop_(k) { return (PropertiesService.getScriptProperties().getProperty(k) || '').trim(); }
function token_() { return prop_('NOTION_TOKEN'); }
/* ID de Notion (32 caracteres) a partir de un ID o de una URL completa: «…/Mi-tabla-402bd031…?v=…» → «402bd031…» */
function notionId_(v) {
  const base = String(v || '').trim().split('?')[0].split('#')[0].replace(/\/+$/, '').replace(/-/g, '');
  const m = base.match(/[0-9a-f]{32}$/i);
  return m ? m[0].toLowerCase() : '';
}
function db_() { return notionId_(prop_('NOTION_DB_CITAS')); }
/* huella de la tabla: si cambia (otra tabla u otra cuenta de Notion), el portal vuelve a mandar todas las citas */
function dbTag_() { return db_().slice(-8); }
/* llave para firmar los pases: se crea sola la primera vez y nunca sale del script.
   Para invalidar TODOS los pases (todos vuelven a entrar): borra la propiedad PASS_SECRET. */
function signKey_() {
  const props = PropertiesService.getScriptProperties();
  let k = props.getProperty('PASS_SECRET');
  if (!k) { k = Utilities.getUuid() + Utilities.getUuid(); props.setProperty('PASS_SECRET', k); }
  return k;
}

// ---------- utilidades ----------
function err_(msg, code, status) { const e = new Error(msg); e.code = code || 'notion'; e.status = status || 400; return e; }
function b64u_(bytesOrStr) {
  const s = typeof bytesOrStr === 'string' ? Utilities.base64EncodeWebSafe(bytesOrStr, Utilities.Charset.UTF_8) : Utilities.base64EncodeWebSafe(bytesOrStr);
  return s.replace(/=+$/, '');
}
function fromB64u_(s) {
  s = String(s).replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '=';
  return Utilities.newBlob(Utilities.base64Decode(s)).getDataAsString('UTF-8');
}
function hmac_(data) { return b64u_(Utilities.computeHmacSha256Signature(data, signKey_(), Utilities.Charset.UTF_8)); }
function same_(a, b) {
  a = String(a); b = String(b); if (a.length !== b.length) return false;
  let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0;
}
const norm_ = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');

// ---------- usuarios del portal (tabla «personal» de Supabase, solo id / código / activo) ----------
function person_(id) {
  const r = UrlFetchApp.fetch(SB_URL + '/rest/v1/personal?id=eq.' + encodeURIComponent(id) + '&select=id,password,active', {
    headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY }, muteHttpExceptions: true,
  });
  if (r.getResponseCode() !== 200) throw err_('No se pudo consultar el personal del portal (' + r.getResponseCode() + ').', 'sb', 502);
  return (JSON.parse(r.getContentText()) || [])[0] || null;
}
const credVer_ = (code) => hmac_('v:' + String(code)).slice(0, 16);   // cambia si cambia el código: el pase viejo deja de servir

function login_(b) {
  const uid = String(b.uid || ''), pin = String(b.pin || '');
  if (!uid || !pin) throw err_('Faltan usuario y código.', 'login', 400);
  const cache = CacheService.getScriptCache(), fk = 'fail:' + uid;
  const fails = +(cache.get(fk) || 0);
  if (fails >= MAX_FAILS) throw err_('Demasiados intentos. Espera unos minutos.', 'login', 429);
  const u = person_(uid);
  if (!u || u.active === false || !u.password || !same_(String(u.password), pin)) {
    cache.put(fk, String(fails + 1), LOCK_MIN * 60);
    throw err_('Usuario o código incorrecto.', 'login', 401);
  }
  cache.remove(fk);
  const body = b64u_(JSON.stringify({ w: uid, v: credVer_(u.password), exp: Date.now() + PASS_DAYS * 86400000 }));
  return { st: body + '.' + hmac_(body) };
}
function checkPass_(st) {
  const passErr = (m) => err_(m, 'pass', 401);
  if (typeof st !== 'string' || st.indexOf('.') < 0) throw passErr('Falta el pase: sal y vuelve a entrar al portal.');
  const parts = st.split('.'), body = parts[0], sig = parts[1] || '';
  if (!same_(hmac_(body), sig)) throw passErr('Pase inválido: sal y vuelve a entrar al portal.');
  let p; try { p = JSON.parse(fromB64u_(body)); } catch (_) { throw passErr('Pase inválido: sal y vuelve a entrar al portal.'); }
  if (!p.w || !p.v || !(p.exp > Date.now())) throw passErr('Pase vencido: sal y vuelve a entrar al portal.');
  const u = person_(p.w);
  if (!u || u.active === false || !u.password || !same_(credVer_(u.password), p.v)) throw passErr('Tu acceso cambió: sal y vuelve a entrar al portal.');
  return p.w;
}

// ---------- Notion ----------
function notion_(path, method, body, version) {
  for (let i = 0; ; i++) {
    const opt = {
      method: method || 'get', muteHttpExceptions: true,
      headers: { Authorization: 'Bearer ' + token_(), 'Notion-Version': version || NOTION_VERSION },
    };
    if (body) { opt.contentType = 'application/json'; opt.payload = JSON.stringify(body); }
    const r = UrlFetchApp.fetch(NOTION + path, opt), code = r.getResponseCode();
    if (code === 429 && i < 3) { Utilities.sleep(1000 * (i + 1)); continue; }   // Notion pide esperar
    let data = {}; try { data = JSON.parse(r.getContentText()); } catch (_) {}
    if (code < 200 || code >= 300) {
      const why = code === 401 ? 'La llave de Notion no es válida (revisa NOTION_TOKEN en las propiedades del script).'
        : code === 404 && !version ? 'Notion no encuentra la tabla: revisa NOTION_DB_CITAS y que la tabla esté conectada a la integración (⋯ → Conexiones).'
        : (data.message || ('Notion respondió ' + code));
      throw err_(why, code === 401 ? 'token' : code === 404 && !version ? 'tabla' : (data.code || 'notion'), code);
    }
    return data;
  }
}

// dato del portal → nombres de columna que se aceptan (ya normalizados)
const NAMES = {
  fecha: ['fecha', 'fechahora', 'fechayhora', 'cuando', 'date', 'horario'],
  cliente: ['cliente', 'empresa', 'client', 'nombrecliente', 'nombredelcliente'],
  proyecto: ['proyecto', 'project', 'servicio'],
  responsable: ['responsable', 'asesor', 'consultor', 'encargado', 'atiende'],
  meet: ['enlacedegooglemeet', 'googlemeet', 'meet', 'linkmeet', 'enlacemeet', 'linkdemeet', 'videollamada', 'enlacedelareunion', 'linkdelareunion'],
  estado: ['estado', 'estatus', 'status'],
  lugar: ['lugar', 'modalidad', 'ubicacion', 'direccion'],
  objetivo: ['objetivo', 'notas', 'descripcion', 'tema', 'motivo'],
  telefono: ['telefono', 'tel', 'phone', 'celular', 'whatsapp'],
  correo: ['correo', 'email', 'mail', 'correoelectronico'],
  portal: ['linkalportal', 'enlacealportal', 'portal', 'linkportal', 'abrirenportal', 'nuwek'],
  id: ['idportal', 'portalid', 'idnuwek', 'idcita', 'id'],
  minuta: ['minuta', 'minutanotion', 'notasdereunion', 'notasdelareunion', 'grabacion', 'meetingnotes'],
};
const ID_COL = 'ID portal', MINUTA_COL = 'Minuta';

function schema_(force) {
  const cache = CacheService.getScriptCache(), ck = 'schema:' + db_();
  if (!force) { const c = cache.get(ck); if (c) return JSON.parse(c); }
  const dbi = notion_('/databases/' + db_());
  const props = {};
  Object.keys(dbi.properties || {}).forEach((name) => { const p = dbi.properties[name]; props[name] = Object.assign({}, p, { name }); });
  const list = Object.keys(props).map((k) => props[k]);
  const t = list.filter((p) => p.type === 'title')[0];
  const title = t ? t.name : '';
  const map = {}, used = {}; used[title] = 1;
  Object.keys(NAMES).forEach((k) => {
    const hit = list.filter((p) => !used[p.name] && NAMES[k].indexOf(norm_(p.name)) >= 0)[0];
    if (hit) { map[k] = hit; used[hit.name] = 1; }
  });
  // si no hay columna con nombre conocido, se usa la primera de ese tipo
  [['fecha', 'date'], ['meet', 'url'], ['telefono', 'phone_number'], ['correo', 'email']].forEach(([k, ty]) => {
    if (map[k]) return;
    const hit = list.filter((p) => !used[p.name] && p.type === ty)[0];
    if (hit) { map[k] = hit; used[hit.name] = 1; }
  });
  const s = { props, title, map };
  try { cache.put(ck, JSON.stringify(s), 300); } catch (_) {}
  return s;
}
/* sin «ID portal» no hay forma segura de saber si una cita ya tiene página: se crea la columna (Texto) en la tabla */
function ensureId_() {
  let s = schema_(false);
  if (!s.map.id) s = schema_(true);
  if (s.map.id && s.map.id.type === 'rich_text') return s;
  if (s.map.id) throw err_('La columna «' + s.map.id.name + '» de Notion debe ser de tipo Texto (se usa como ID de la cita).', 'noid', 400);
  const add = {}; add[ID_COL] = { rich_text: {} };
  notion_('/databases/' + db_(), 'patch', { properties: add });
  s = schema_(true);
  if (!s.map.id || s.map.id.type !== 'rich_text') throw err_('Agrega a tu tabla de Notion una columna de tipo Texto llamada «ID portal».', 'noid', 400);
  return s;
}

/* la columna «Minuta» (URL) se crea sola la primera vez que el portal encuentra una nota de reunión */
function ensureMinuta_() {
  let s = schema_(true);
  if (s.map.minuta) return s;
  const add = {}; add[MINUTA_COL] = { url: {} };
  notion_('/databases/' + db_(), 'patch', { properties: add });
  return schema_(true);
}

// ---------- notas de reunión con IA (AI Meeting Notes) ----------
const plain_ = (rt) => (rt || []).map((x) => x.plain_text || (x.text && x.text.content) || '').join('');
const nid_ = (id) => String(id || '').replace(/-/g, '');
function blockUrl_(b) {
  const m = b.meeting_notes || {}, p = b.parent || {};
  if (!m.is_full_page && p.page_id) return 'https://www.notion.so/' + nid_(p.page_id) + '#' + nid_(b.id);
  return 'https://www.notion.so/' + nid_(b.id);
}
/* texto de un bloque y sus hijos (resumen de la reunión): viñetas, pendientes ☐/☑ y títulos */
function blockText_(id, depth) {
  const out = []; let cursor = null, n = 0;
  do {
    const q = notion_('/blocks/' + id + '/children?page_size=100' + (cursor ? '&start_cursor=' + cursor : ''), 'get', null, MEET_VERSION);
    (q.results || []).forEach((b) => {
      const d = b[b.type] || {}, t = plain_(d.rich_text || d.title);
      const pre = { bulleted_list_item: '• ', numbered_list_item: '• ', to_do: d.checked ? '☑ ' : '☐ ', heading_1: '\n', heading_2: '\n', heading_3: '\n' }[b.type] || '';
      if (t) out.push(pre + t);
      if (b.has_children && depth < 2) { const sub = blockText_(b.id, depth + 1); if (sub) out.push(sub.split('\n').map((l) => '   ' + l).join('\n')); }
    });
    cursor = q.has_more ? q.next_cursor : null; n++;
  } while (cursor && n < 3);
  return out.join('\n').trim();
}
/* list: [{ sid, nombre, start, end (ms), ev (id del evento de Google, si se sabe) }] → { minutas: { sid: {...} } }
   Una nota corresponde a una cita si: es del mismo evento de Google, o el evento empieza ±15 min de la cita,
   o la grabación empezó entre 30 min antes y 60 min después del fin de la cita. Cada nota se usa para una sola cita. */
function minutas_(list) {
  if (!Array.isArray(list) || !list.length) return { minutas: {} };
  list = list.filter((c) => c && typeof c.sid === 'string' && +c.start).slice(0, 20);
  if (!list.length) return { minutas: {} };
  const from = Utilities.formatDate(new Date(Math.min.apply(null, list.map((c) => +c.start)) - 86400000), 'UTC', 'yyyy-MM-dd');
  let q;
  try {
    q = notion_('/blocks/meeting_notes/query', 'post', {
      filter: { operator: 'and', filters: [{ property: 'created_time', filter: { operator: 'date_is_on_or_after', value: { type: 'exact', value: { type: 'date', start_date: from } } } }] },
      sort: [{ property: 'created_time', direction: 'descending' }], limit: 50,
    }, MEET_VERSION);
  } catch (e) {
    if (/plan|upgrade|meeting notes/i.test(e.message || '') || (e.status === 400 && e.code !== 'validation_error') || e.status === 403 || e.status === 404)
      throw err_('El espacio de Notion de la tabla no tiene notas de reunión con IA (AI Meeting Notes): se necesita un plan de Notion que las incluya. (' + e.message + ')', 'meet_off', 400);
    throw e;
  }
  const notes = (q.results || []).filter((b) => b.type === 'meeting_notes' && !b.in_trash);
  const out = {}, used = {};
  list.forEach((c) => {
    const st = +c.start, en = +c.end || st + 3600000, nm = norm_(c.nombre || '').slice(0, 12);
    let best = null, bestScore = Infinity;
    notes.forEach((b) => {
      if (used[b.id]) return;
      const m = b.meeting_notes || {}, ce = m.calendar_event || {}, rec = m.recording || {};
      const cs = ce.start_time ? Date.parse(ce.start_time) : NaN, rs = rec.start_time ? Date.parse(rec.start_time) : NaN;
      let score = null;
      if (c.ev && ce.event_id && String(ce.event_id).indexOf(String(c.ev)) >= 0) score = 0;
      else if (!isNaN(cs) && Math.abs(cs - st) <= 15 * 60000) score = 1 + Math.abs(cs - st);
      else if (!isNaN(rs) && rs >= st - 30 * 60000 && rs <= en + 60 * 60000) score = 900000 + Math.abs(rs - st);
      if (score === null) return;
      if (nm && norm_(plain_(m.title)).indexOf(nm) >= 0) score -= 0.5;   // mismo nombre: desempata
      if (score < bestScore) { bestScore = score; best = b; }
    });
    if (!best) return;
    used[best.id] = 1;
    const m = best.meeting_notes || {};
    let resumen = '';
    if (m.status === 'notes_ready' && m.children && m.children.summary_block_id) { try { resumen = blockText_(m.children.summary_block_id, 0).slice(0, 4000); } catch (_) {} }
    out[c.sid] = { id: best.id, url: blockUrl_(best), status: m.status || '', titulo: plain_(m.title), resumen,
      grabacion: m.recording && m.recording.start_time ? { start: m.recording.start_time, end: m.recording.end_time || '' } : null };
  });
  return { minutas: out };
}

// estado del portal → nombres que puede tener la opción en Notion
const ESTADOS = {
  pendiente: ['Pendiente', ['pendiente', 'sinrespuesta', 'porconfirmar', 'agendada', 'agendado', 'programada', 'notstarted', 'sinempezar', 'porhacer', 'nuevo']],
  confirmado: ['Confirmada', ['confirmada', 'confirmado', 'confirmed']],
  reprogramar: ['Reprogramar', ['reprogramar', 'reprogramada', 'pidereprogramar', 'reagendar']],
  cancelado: ['Cancelada', ['cancelada', 'cancelado', 'cancelled']],
  realizada: ['Realizada', ['realizada', 'realizado', 'completado', 'completada', 'asistio', 'hecha', 'done', 'listo', 'lista', 'terminada', 'terminado']],
};

// arma el valor según el TIPO real de la columna en Notion (isEstado: solo la columna de estado traduce estados)
function value_(p, v, isEstado) {
  const txt = (s) => [{ text: { content: String(s == null ? '' : s).slice(0, 1900) } }];
  switch (p.type) {
    case 'title': return { title: txt(v) };
    case 'rich_text': return { rich_text: v ? txt(v) : [] };
    case 'url': return { url: v || null };
    case 'phone_number': return { phone_number: v || null };
    case 'email': return { email: v || null };
    case 'number': return { number: v === '' || v == null || isNaN(+v) ? null : +v };
    case 'date': return { date: v && v.start ? v : null };
    case 'checkbox': return { checkbox: !!v };
    case 'select': case 'status': case 'multi_select': {
      if (!v) return p.type === 'multi_select' ? { multi_select: [] } : (p.type === 'status' ? undefined : { select: null });
      const e = isEstado && ESTADOS[v];
      const label = e ? e[0] : String(v), alias = e ? e[1] : [norm_(String(v))];
      const opts = (p[p.type] && p[p.type].options) || [];
      const found = opts.filter((o) => alias.indexOf(norm_(o.name)) >= 0 || norm_(o.name) === norm_(label))[0];
      if (p.type === 'status') return found ? { status: { name: found.name } } : undefined;   // status no permite crear opciones
      const name = (found ? found.name : label).replace(/,/g, ' ').slice(0, 100);
      return p.type === 'select' ? { select: { name } } : { multi_select: [{ name }] };
    }
    default: return undefined;   // relaciones, fórmulas, personas, etc.: no se tocan
  }
}
function properties_(s, c) {
  const out = {};
  if (s.title) out[s.title] = value_(s.props[s.title], c.nombre || '(Sin nombre)');
  const put = (k, v) => { const p = s.map[k]; if (!p) return; const x = value_(p, v, k === 'estado'); if (x !== undefined) out[p.name] = x; };
  ['fecha', 'cliente', 'proyecto', 'responsable', 'meet', 'estado', 'lugar', 'objetivo', 'telefono', 'correo', 'portal'].forEach((k) => put(k, c[k]));
  if (c.minuta !== undefined) put('minuta', c.minuta);   // solo cuando el portal ya encontró la minuta (no borra un link puesto a mano)
  put('id', c.sid);
  return out;
}
function upsertCita_(c) {
  if (!c || typeof c.sid !== 'string' || !c.sid) throw err_('Falta el id de la cita', 'cita', 400);
  let s = ensureId_();
  if (c.minuta && !s.map.minuta) s = ensureMinuta_();
  const idp = s.map.id, props = properties_(s, c);
  /* candado: si dos computadoras mandan la misma cita a la vez, la segunda espera y encuentra la página de la primera */
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(25000)) throw err_('El puente está ocupado, se reintenta en un momento.', 'busy', 503);
  try {
    const q = notion_('/databases/' + db_() + '/query', 'post', { filter: { property: idp.name, rich_text: { equals: c.sid } }, page_size: 1 });
    const hit = (q.results || [])[0];
    let pg, op;
    if (hit) { pg = notion_('/pages/' + hit.id, 'patch', { properties: props }); op = 'actualizada'; }
    else { pg = notion_('/pages', 'post', { parent: { database_id: db_() }, properties: props }); op = 'creada'; }
    const out = { id: pg.id, url: pg.url, op };
    if (Array.isArray(c.minutasPortal) && c.minutasPortal.length) {
      const mins = syncMinutasPortal_(pg.id, c.minutasPortal);
      out.minutas = mins.length;
      const last = mins[mins.length - 1];
      if (last && !c.minuta) {                       // sin minuta de IA de Notion, la columna «Minuta» apunta a la del portal
        if (!s.map.minuta) s = ensureMinuta_();
        if (s.map.minuta && s.map.minuta.type === 'url') { const pp = {}; pp[s.map.minuta.name] = { url: last.url }; notion_('/pages/' + pg.id, 'patch', { properties: pp }); }
      }
    }
    return out;
  } finally { lock.releaseLock(); }
}

// ---------- minutas del portal → subpáginas de la cita ----------
const rt_ = (t, ann) => [{ type: 'text', text: { content: String(t == null ? '' : t).slice(0, 1900) }, annotations: ann || undefined }];
const blk_ = (type, t, extra) => { const o = { object: 'block', type }; o[type] = Object.assign({ rich_text: rt_(t) }, extra || {}); return o; };
function minutaBlocks_(m) {
  const b = [];
  b.push(blk_('paragraph', ['🗓 ' + (m.fecha || ''), m.hora ? '🕒 ' + m.hora : '', m.duracion ? '⏱ ' + m.duracion : '', m.tipo ? 'Tipo: ' + m.tipo : '', m.por ? 'Tomó la minuta: ' + m.por : ''].filter(Boolean).join('  ·  ')));
  b.push(blk_('heading_3', 'Asistentes'));
  b.push(blk_('paragraph', (m.asistentes || []).join(', ') || '—'));
  b.push(blk_('heading_3', 'Notas'));
  if ((m.notas || []).length) (m.notas || []).slice(0, 40).forEach((n) => b.push(blk_('bulleted_list_item', n)));
  else b.push(blk_('paragraph', '—'));
  b.push(blk_('heading_3', 'Actividades y acuerdos'));
  if ((m.acuerdos || []).length) (m.acuerdos || []).slice(0, 40).forEach((a) => b.push(blk_('to_do', [a.txt, a.resp ? '— ' + a.resp : '', a.fecha ? '· ' + a.fecha : ''].filter(Boolean).join(' '), { checked: !!a.done })));
  else b.push(blk_('paragraph', '—'));
  const foot = blk_('paragraph', 'Generada desde el Portal Nuwek. Para cambiarla, edita la minuta en el portal: esta página se reemplaza sola.');
  foot.paragraph.rich_text[0].annotations = { italic: true, color: 'gray' };
  b.push(foot);
  return b.slice(0, 100);
}
function childPages_(pageId) {
  const out = []; let cursor = null, n = 0;
  do {
    const q = notion_('/blocks/' + pageId + '/children?page_size=100' + (cursor ? '&start_cursor=' + cursor : ''));
    (q.results || []).forEach((b) => { if (b.type === 'child_page') out.push({ id: b.id, title: (b.child_page && b.child_page.title) || '' }); });
    cursor = q.has_more ? q.next_cursor : null; n++;
  } while (cursor && n < 5);
  return out;
}
/* crea o reemplaza la subpágina de cada minuta. Devuelve [{ id, url }] en el mismo orden */
function syncMinutasPortal_(pageId, list) {
  list = list.filter((m) => m && typeof m.id === 'string' && m.id).slice(-10);
  if (!list.length) return [];
  const kids = childPages_(pageId), out = [];
  list.forEach((m) => {
    /* [id·huella]: la huella cambia solo si cambia la minuta; si ya está igual en Notion no se toca */
    const hh = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, JSON.stringify(m), Utilities.Charset.UTF_8).map((x) => ((x + 256) % 256).toString(16).padStart(2, '0')).join('').slice(0, 6);
    const pre = '[' + m.id + '·', tag = pre + hh + ']';
    const same = kids.filter((k) => k.title.indexOf(tag) >= 0)[0];
    if (same) { out.push({ id: same.id, url: 'https://www.notion.so/' + nid_(same.id) }); return; }
    const title = '📝 Minuta · ' + (m.fecha || '') + (m.hora ? ' ' + m.hora.split('–')[0].trim() : '') + ' ' + tag;
    kids.filter((k) => k.title.indexOf(pre) >= 0).forEach((k) => notion_('/pages/' + k.id, 'patch', { archived: true }));   // versión anterior → papelera de Notion
    const pg = notion_('/pages', 'post', { parent: { page_id: pageId }, icon: { type: 'emoji', emoji: '📝' }, properties: { title: { title: rt_(title) } }, children: minutaBlocks_(m) });
    out.push({ id: pg.id, url: pg.url });
  });
  return out;
}

// ---------- entrada web ----------
function out_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function handle_(b) {
  if (b.action === 'login') return login_(b);
  if (!token_() || !db_()) throw err_('Faltan NOTION_TOKEN y/o NOTION_DB_CITAS en las propiedades del script.', 'config', 500);
  checkPass_(b.st);
  if (b.action === 'ping') return { ok: true, db: dbTag_() };
  if (b.action === 'schema') {
    const s = ensureId_();
    return {
      ok: true, db: dbTag_(), titulo: s.title,
      columnas: Object.keys(s.props).map((k) => ({ nombre: k, tipo: s.props[k].type })),
      usadas: Object.keys(s.map).reduce((o, k) => { o[k] = s.map[k].name; return o; }, {}),
    };
  }
  if (b.action === 'cita') return Object.assign({ ok: true, db: dbTag_() }, upsertCita_(b.cita));
  if (b.action === 'minutas') return Object.assign({ ok: true, db: dbTag_() }, minutas_(b.citas));
  throw err_('Acción no permitida', 'accion', 400);
}
function doPost(e) {
  try {
    let b = {}; try { b = JSON.parse((e && e.postData && e.postData.contents) || '{}'); } catch (_) {}
    return out_(handle_(b));
  } catch (x) {
    return out_({ error: x.message || String(x), code: x.code || 'notion', status: x.status || 500 });
  }
}
/* abrir la URL del script en el navegador muestra si está configurado (no revela la llave) */
function doGet() {
  return out_({ ok: true, servicio: 'Puente Portal Nuwek → Notion', configurado: !!(token_() && db_()) });
}

/* ▶ diagnosticoNotion: dice a qué espacio de Notion pertenece la llave y qué páginas/tablas tiene compartidas (no muestra la llave) */
function diagnosticoNotion() {
  if (!token_()) { Logger.log('Falta NOTION_TOKEN.'); return; }
  const me = notion_('/users/me');
  Logger.log('Integración: «' + (me.name || '') + '» · espacio de Notion: «' + ((me.bot && me.bot.workspace_name) || '¿?') + '»');
  const q = notion_('/search', 'post', { page_size: 20 });
  const items = (q.results || []).map((r) => (r.object === 'database' ? '📅 tabla: ' + plain_(r.title) : '📄 página: ' + plain_(((r.properties || {}).title || {}).title || (Object.values(r.properties || {}).find((p) => p.type === 'title') || {}).title)) + '  (' + nid_(r.id) + ')');
  Logger.log(items.length ? 'Tiene acceso a:\n' + items.join('\n') : 'No tiene NINGUNA página compartida: abre la página en Notion → ⋯ → Conexiones → agrega esta integración.');
  const pag = notionId_(prop_('NOTION_PAGINA'));
  if (pag) Logger.log('NOTION_PAGINA (' + pag + ') ' + ((q.results || []).some((r) => nid_(r.id) === pag) ? 'SÍ está compartida ✔' : 'NO aparece entre las compartidas ✘'));
}

/* ▶ crearTablaCitas: crea en tu cuenta de Notion la tabla «Citas · Portal Nuwek» con todas las columnas que llena el portal.
   Antes: comparte con la integración la página donde la quieres (⋯ → Conexiones) y pon su URL en la propiedad NOTION_PAGINA.
   Si NOTION_DB_CITAS ya apunta a una tabla que esta llave puede abrir, no crea otra. */
function crearTablaCitas() {
  if (!token_()) { Logger.log('Falta NOTION_TOKEN en las propiedades del script.'); return; }
  if (db_()) { try { const d = notion_('/databases/' + db_()); Logger.log('Ya hay tabla de citas: ' + d.url + ' (no se creó otra). Para crear una nueva, borra NOTION_DB_CITAS.'); return; } catch (e) { Logger.log('La tabla anterior no se puede abrir con esta llave (' + e.message + '): se crea una nueva.'); } }
  const pag = notionId_(prop_('NOTION_PAGINA'));
  if (!/^[0-9a-f]{32}$/i.test(pag)) { Logger.log('Pon en la propiedad NOTION_PAGINA la URL de la página de Notion donde va la tabla (y compártela con la integración: ⋯ → Conexiones).'); return; }
  const opt = (n, c) => ({ name: n, color: c });
  let d;
  try { d = notion_('/databases', 'post', {
    parent: { type: 'page_id', page_id: pag },
    icon: { type: 'emoji', emoji: '📅' },
    title: [{ type: 'text', text: { content: 'Citas · Portal Nuwek' } }],
    properties: {
      'Cita': { title: {} },
      'Fecha': { date: {} },
      'Estado': { select: { options: [opt('Pendiente', 'gray'), opt('Confirmada', 'green'), opt('Reprogramar', 'yellow'), opt('Cancelada', 'red'), opt('Realizada', 'blue')] } },
      'Cliente': { select: { options: [] } },
      'Proyecto': { select: { options: [] } },
      'Responsable': { select: { options: [] } },
      'Enlace de Google Meet': { url: {} },
      'Minuta': { url: {} },
      'Lugar': { rich_text: {} },
      'Objetivo': { rich_text: {} },
      'Teléfono': { phone_number: {} },
      'Correo': { email: {} },
      'Link al portal': { url: {} },
      'ID portal': { rich_text: {} },
    },
  }); } catch (e) {
    if (e.status === 404 || e.status === 403) { Logger.log('Esta llave no puede ver la página NOTION_PAGINA. Revisa: 1) que NOTION_TOKEN sea la llave de la integración del MISMO espacio de Notion donde está la página, y 2) que la página esté conectada a esa integración (⋯ → Conexiones).'); return; }
    throw e;
  }
  PropertiesService.getScriptProperties().setProperty('NOTION_DB_CITAS', nid_(d.id));
  try { CacheService.getScriptCache().remove('schema:' + nid_(d.id)); } catch (_) {}
  Logger.log('Tabla creada: ' + d.url);
  Logger.log('NOTION_DB_CITAS quedó en ' + nid_(d.id) + '. El portal volverá a mandar todas las citas a esta tabla.');
}

/* ▶ Ejecuta esta función UNA vez desde el editor (botón «Ejecutar») para dar permisos y revisar la conexión con Notion.
   El resultado sale en «Registro de ejecución». */
function probarConexion() {
  if (!token_() || !db_()) { Logger.log('Faltan NOTION_TOKEN y/o NOTION_DB_CITAS en Configuración del proyecto → Propiedades del script.'); return; }
  const s = ensureId_();
  Logger.log('Tabla OK. Columna título: ' + s.title);
  Logger.log('Columnas que usará el portal: ' + JSON.stringify(Object.keys(s.map).reduce((o, k) => { o[k] = s.map[k].name; return o; }, {})));
  person_('__prueba__');
  Logger.log('Conexión con el personal del portal OK.');
  try { const r = minutas_([{ sid: '__prueba__', nombre: '', start: Date.now() - 7 * 86400000, end: Date.now() }]); Logger.log('Notas de reunión con IA: acceso OK' + (r.minutas.__prueba__ ? ' (encontró al menos una de los últimos 7 días)' : ' (sin notas que coincidan en la prueba)')); }
  catch (e) { Logger.log('Notas de reunión con IA: ' + e.message); }
}
