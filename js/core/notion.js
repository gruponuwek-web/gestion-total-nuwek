/* ================== NOTION · las citas se copian solas a la tabla de citas de Notion ==================
   El navegador NO habla con Notion: llama al «puente» de Google Apps Script (apps-script/notion-puente), que guarda la
   llave de Notion en sus propiedades. Aquí nunca va la llave de Notion.
   [2026-10-29] Antes el puente era la función «notion» de Supabase; se movió a Apps Script para no depender del acceso
   a Supabase. El puente da su propio «pase» al entrar con usuario y código (ya no depende de la función google-auth).
   - Cada cita la manda SOLO el navegador de su responsable (si no tiene, el responsable de la tarea).
   - Cada cita tiene UNA página: el puente la busca por la columna «ID portal» antes de crearla (y usa un candado para que
     dos computadoras no la creen dos veces). Entre pestañas del mismo navegador solo una envía a la vez (navigator.locks).
   - Se mandan las citas desde hace NOTION_DAYS_BACK días en adelante; si cambia algo que se ve en Notion (nombre, fecha,
     hora, Meet, estado, lugar…), se actualiza esa misma página. El portal NO escribe nada en la tarea.
   - Lo ya enviado se recuerda en este navegador (localStorage) para no reenviar lo que no cambió, POR TABLA: si el puente
     apunta a otra tabla u otra cuenta de Notion (cambia su «huella»), se vuelven a mandar todas las citas.
   - Si el puente no responde, se pausa en silencio y se reintenta: el portal sigue igual.
   - Una cita que Notion rechaza no frena a las demás, y no se reintenta hasta que cambie.
   [2026-10-29 · MINUTAS DE NOTION] Si la reunión se grabó con las notas de reunión con IA de Notion (AI Meeting Notes,
   se inician desde Notion Calendar o desde Notion), el puente busca esa nota para cada cita ya pasada y el portal guarda
   en la subtarea s.notionMinuta = { url, status, titulo, resumen, grabacion, at }. Se ve en la tarjeta de la cita y en
   «📝 Minutas de esta cita», y el link llega a la columna «Minuta» de la tabla de citas. Solo lee: no inicia grabaciones.
   [2026-10-29 · MINUTA DEL PORTAL → NOTION] Al CERRAR una minuta del portal (▶ Iniciar minuta → Cerrar), viaja con la cita
   y el puente la escribe como subpágina «📝 Minuta · fecha» dentro de la página de la cita (asistentes, notas y acuerdos
   ☐/☑). Si se edita después, la subpágina se reemplaza. Si no hay minuta de IA de Notion, la columna «Minuta» apunta a ella.
   [2026-11-02 · GOOGLE CALENDAR + AVISO] También los eventos de TU Google Calendar con Meet creados fuera del portal
   (los que el portal ya lee al conectar Google) van a la tabla de Notion y se les liga la minuta (por el id del evento).
   Y 5 min antes de cualquier videollamada (del portal o de tu Google Calendar) el portal muestra «🎙 ¿Grabar con Notion?»:
   abre el Meet y la página de la reunión en la app de Notion, donde se inicia /meeting → Empezar a transcribir.
   (El aviso propio de Notion Calendar no se puede controlar desde aquí; este es el del portal.) */

/* ▶ URL del puente: Apps Script → Implementar → Nueva implementación → Aplicación web → copiar la URL que termina en /exec.
   Vacía = Notion apagado (el portal funciona igual). */
const NOTION_URL = 'https://script.google.com/macros/s/AKfycbwhCsfD7cRDN-1K_-qo5AI80JzVQjI5n8mdYYrJpenhRoZWeRPJefYskCf_CkKcc5a6VA/exec';
const NOTION_DAYS_BACK = 7;
const NOTION_MAX_RUN = 25;              // máximo de citas por vuelta (Notion permite ~3 solicitudes por segundo)
const NOTION_MIN_EVERY = 10 * 60000;    // cada cuánto se buscan minutas de Notion de las citas ya pasadas
const NOTION_MIN_OFF = 6 * 3600000;     // si el espacio de Notion no tiene notas de reunión con IA, se vuelve a intentar en 6 h
let notionSt = { off: !NOTION_URL, running: false, err: '', ok: 0, bad: 0, at: 0, pauseUntil: 0, minAt: 0, minErr: '', db: '' };
/* quién inició sesión. «session» todavía no existe mientras el portal arranca (store.save corre antes): tocarla ahí
   lanzaba un error que dejaba el portal en blanco; por eso se lee con try/catch, igual que gcalWho */
function notionWho(){ try{ return window.CLIENT_ONLY ? null : session; }catch(_){ return null; } }

/* pase de este navegador para el puente (dura 30 días; «Salir» lo borra; si cambia tu código deja de servir) */
function notionPassKey(w){ return 'nuwekNotionPass:' + w; }
function notionPass(){ const w = notionWho(); if (!w) return ''; try{ return localStorage.getItem(notionPassKey(w)) || ''; }catch(_){ return ''; } }
function notionSetPass(w, st){ try{ if (st) localStorage.setItem(notionPassKey(w), st); else localStorage.removeItem(notionPassKey(w)); }catch(_){} }

function notionSentKey(sid){ return 'nuwekNotion:' + notionSt.db + ':' + sid; }
/* huella de la tabla a la que escribe el puente; al cambiar se borra lo recordado de la tabla anterior */
async function notionDbSync(){
  if (notionSt.db) return;
  const r = await notionCall({ action: 'ping' });
  notionSt.db = String((r && r.db) || 'x');
  try{
    const keep = 'nuwekNotion:' + notionSt.db + ':', old = [];
    for (let i = 0; i < localStorage.length; i++){ const k = localStorage.key(i); if (k && k.indexOf('nuwekNotion:') === 0 && k.indexOf(keep) !== 0) old.push(k); }
    old.forEach(k => localStorage.removeItem(k));
  }catch(_){}
}
function notionWasSent(sid){ try{ return localStorage.getItem(notionSentKey(sid)); }catch(_){ return null; } }
function notionMarkSent(sid, h){ try{ localStorage.setItem(notionSentKey(sid), h); }catch(_){} }
/* otros datos recordados por tabla (página de Notion de cada cita, minuta de los eventos de Google) */
function notionLocal(k){ try{ return localStorage.getItem('nuwekNotion:' + notionSt.db + ':' + k); }catch(_){ return null; } }
function notionLocalSet(k, v){ try{ localStorage.setItem('nuwekNotion:' + notionSt.db + ':' + k, v); }catch(_){} }
const notionPad = n => String(n).padStart(2, '0');
const notionLoc = ms => { const d = new Date(ms); return d.getFullYear() + '-' + notionPad(d.getMonth() + 1) + '-' + notionPad(d.getDate()) + 'T' + notionPad(d.getHours()) + ':' + notionPad(d.getMinutes()) + ':00'; };

/* ---------- eventos de TU Google Calendar con Meet, creados fuera del portal ----------
   (los del portal ya vienen como citas; gcalOwnGoogle() los excluye, así que no se duplican) */
const NOTION_G = 'gcal:';
function notionGcalMeet(e){ try{ return typeof gcalMeetOf === 'function' ? gcalMeetOf(e) : (/^https:\/\//.test(e.hangoutLink || '') ? e.hangoutLink : ''); }catch(_){ return ''; } }
function notionGoogleCitas(){
  if (!notionWho()) return [];
  let evs = []; try{ evs = typeof gcalOwnGoogle === 'function' ? gcalOwnGoogle() : []; }catch(_){ evs = []; }
  const from = Date.now() - NOTION_DAYS_BACK * 86400000;
  return (evs || []).filter(e => e && e.id && e.status !== 'cancelled' && e.start && e.start.dateTime && notionGcalMeet(e) && Date.parse(e.start.dateTime) >= from)
    .map(e => { const st = Date.parse(e.start.dateTime), en = Date.parse((e.end && e.end.dateTime) || '') || st + 3600000;
      return { sid: NOTION_G + e.id, ev: e.id, nombre: e.summary || '(Reunión sin título)', start: st, end: en, meet: notionGcalMeet(e), desc: e.description || '' }; });
}
function notionGoogleMin(sid){ try{ return JSON.parse(notionLocal('min:' + sid) || 'null'); }catch(_){ return null; } }
function notionGoogleData(g){
  const tz = (Intl.DateTimeFormat().resolvedOptions().timeZone) || 'America/Mexico_City';
  const me = store.person(notionWho()) || {}, min = notionGoogleMin(g.sid);
  const d = { sid: g.sid, nombre: g.nombre, cliente: '', proyecto: 'Google Calendar', responsable: me.name || '',
    fecha: { start: notionLoc(g.start), end: notionLoc(g.end), time_zone: tz }, meet: g.meet,
    estado: min && min.status === 'notes_ready' ? 'realizada' : 'pendiente', lugar: 'Videollamada',
    objetivo: String(g.desc).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 500), telefono: '', correo: '', portal: '' };
  if (min && min.url) d.minuta = min.url;
  return d;
}

/* lo que viaja a Notion de una cita */
function notionCitaData(x){
  const { s, t, p, c, est } = x;
  const tz = (Intl.DateTimeFormat().resolvedOptions().timeZone) || 'America/Mexico_City';
  let fecha = null;
  if (s.date && s.time){
    const st = new Date(s.date + 'T' + s.time + ':00'), en = new Date(st.getTime() + Math.max(+s.durMin || 60, 15) * 60000);
    const loc = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0') + 'T' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0') + ':00';
    if (!isNaN(st)) fecha = { start: loc(st), end: loc(en), time_zone: tz };
  } else if (s.date) fecha = { start: s.date };
  const ses = typeof sesOf === 'function' ? sesOf(s) : { objetivo: '', lugar: {} };
  const lugar = ses.lugar && ses.lugar.tipo === 'presencial' ? ('Presencial' + (ses.lugar.direccion ? ' · ' + ses.lugar.direccion : '')) : 'Videollamada';
  const inv = (s.invitados || []).map(id => ((c && c.people) || []).find(pp => pp.id === id)).filter(Boolean);
  const resp = store.person(s.personId) || {};
  const nm = s.notionMinuta && s.notionMinuta.url ? { minuta: s.notionMinuta.url } : {};   // solo si ya se encontró: así no se reenvían las demás
  const mp = notionMinutasPortal(s); if (mp.length) nm.minutasPortal = mp;                // minutas cerradas del portal (solo si hay)
  return Object.assign({
    sid: s.id,
    nombre: s.name || '(Sin nombre)',
    cliente: (c && c.name) || '',
    proyecto: (p && p.name) || '',
    responsable: resp.name || '',
    fecha,
    meet: typeof gcalSubMeet === 'function' ? gcalSubMeet(s) : '',
    estado: s.done ? 'realizada' : (est && est.k) || 'pendiente',
    lugar,
    objetivo: ses.objetivo || '',
    telefono: (inv.find(pp => pp.phone) || {}).phone || '',
    correo: (inv.find(pp => pp.email) || {}).email || '',
    portal: location.origin + location.pathname + '#/tarea/' + encodeURIComponent(t.id)
  }, nm);
}
/* minutas CERRADAS del portal de una cita, en el formato que escribe el puente en Notion */
function notionMinutasPortal(s){
  const pn = id => ((typeof store !== 'undefined' && store.person(id)) || {}).name || '';
  const hm = d => { const x = new Date(d); return isNaN(x) ? '' : String(x.getHours()).padStart(2, '0') + ':' + String(x.getMinutes()).padStart(2, '0'); };
  const fd = d => { const x = new Date(d); return isNaN(x) ? '' : x.toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' }); };
  return (s.minutas || []).filter(m => m && m.estado === 'cerrada' && m.start).sort((a, b) => a.start < b.start ? -1 : 1).map(m => {
    const lines = m.lines || [], ms = (m.end ? new Date(m.end) : new Date(m.start)) - new Date(m.start);
    return {
      id: m.id, fecha: fd(m.start), hora: hm(m.start) + (m.end ? ' – ' + hm(m.end) : ''),
      duracion: typeof mnClockTxt === 'function' ? mnClockTxt(ms) : Math.round(ms / 60000) + ' min',
      tipo: m.kind === 'cliente' ? 'con cliente' : 'interna', por: pn(m.by),
      asistentes: (m.asist || []).map(a => (a.name || '') + (a.tipo === 'c' ? ' (cliente)' : '')).filter(Boolean),
      notas: lines.filter(l => l.kind === 'n' && l.txt).map(l => l.txt),
      acuerdos: lines.filter(l => l.kind === 'a' && l.txt).map(l => ({ txt: l.txt, resp: l.resp ? pn(l.resp) : '', fecha: l.date && typeof dLabel === 'function' ? dLabel(l.date) : (l.date || ''), done: !!l.done }))
    };
  });
}
/* citas que le toca mandar a quien inició sesión: las citas del portal (con participantes del cliente) y además
   [2026-11-02] cualquier VIDEOLLAMADA del portal (subtarea con fecha, hora y link de Meet), aunque sea interna o sin
   participantes, para que también se le ligue la minuta de Notion */
function notionMyCitas(){
  const me = notionWho(); if (!me || typeof citasAll !== 'function') return [];
  const from = addDaysISO(todayISO(), -NOTION_DAYS_BACK);
  const mine = x => x.s.date && x.s.date >= from && (x.s.personId ? x.s.personId === me : x.t.responsibleId === me);
  const out = citasAll().filter(mine), seen = new Set(out.map(x => x.s.id));
  if (typeof gcalSubMeet === 'function') store.d.tasks.forEach(t => {
    const p = store.project(t.projectId); if (!p) return;
    const c = store.client(p.clientId) || { name: '', id: '' };
    (t.subtasks || []).forEach(s => {
      if (seen.has(s.id) || s.isSeries || s.unida || !s.date || !s.time || !gcalSubMeet(s)) return;
      const x = { s, t, p, c, est: typeof citaEstadoInfo === 'function' ? citaEstadoInfo(s) : { k: 'pendiente' } };
      if (mine(x)){ out.push(x); seen.add(s.id); }
    });
  });
  return out;
}

/* llamada al puente. Se manda como text/plain para que el navegador no haga la consulta previa (CORS) que Apps Script
   no contesta. Apps Script siempre responde 200: el error viene en el cuerpo { error, code, status }.
   net=true: el puente no respondió (sin internet o URL equivocada) */
async function notionCall(body, sinPase){
  if (!NOTION_URL) throw Object.assign(new Error('Falta la URL del puente de Notion (NOTION_URL en js/core/notion.js)'), { net: true, code: 'config' });
  let r;
  try{
    r = await fetch(NOTION_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, redirect: 'follow',
      body: JSON.stringify(sinPase ? body : Object.assign({ st: notionPass() }, body)) });
  }catch(e){ throw Object.assign(new Error('El puente de Notion no respondió'), { net: true }); }
  let j = null; try{ j = await r.json(); }catch(_){}
  if (!r.ok || !j) throw Object.assign(new Error('El puente de Notion respondió ' + r.status + (j ? '' : ' (¿la implementación es «Cualquier usuario»?)')), { status: r.status || 500 });
  if (j.error) throw Object.assign(new Error(j.error), { status: j.status || 400, code: j.code || '' });
  return j;
}
/* al entrar con usuario y código (pinSubmit) se pide el pase de este navegador */
async function notionLogin(uid, pin){
  if (!NOTION_URL || !uid) return;
  try{
    const r = await notionCall({ action: 'login', uid, pin }, true);
    if (r && r.st){ notionSetPass(uid, r.st); notionSt.err = ''; notionSt.pauseUntil = 0; notionPushSoon(); }
  }catch(e){ console.info('Notion: sin pase (' + (e.message || 'el puente no respondió') + ').'); }
}
/* al salir (logout) se borra el pase de quien sale */
function notionForget(){ const w = notionWho(); if (w) notionSetPass(w, ''); notionSt.err = ''; notionSt.at = 0; }

/* errores que valen para TODAS las citas (configuración, pase, tabla): se corta la vuelta */
const NOTION_GLOBAL = ['config', 'pass', 'token', 'tabla', 'noid', 'sb', 'busy'];

async function notionPushRun(){
  let sent = 0, bad = 0;
  try{
    await notionDbSync();
    const items = notionMyCitas().map(x => ({ sid: x.s.id, data: () => notionCitaData(x) }))
      .concat(notionGoogleCitas().map(g => ({ sid: g.sid, data: () => notionGoogleData(g) })));   // + eventos de tu Google Calendar con Meet
    for (const it of items){
      if (sent + bad >= NOTION_MAX_RUN){ notionPushSoon(); break; }     // el resto en la siguiente vuelta
      const data = it.data(), h = JSON.stringify(data), was = notionWasSent(it.sid);
      if (was === h || was === 'ERR:' + h) continue;                 // ya está igual en Notion · o Notion la rechazó y no ha cambiado
      try{
        const r = await notionCall({ action: 'cita', cita: data });
        if (r && r.db && r.db !== notionSt.db){ notionSt.db = ''; notionPushSoon(); break; }   // el puente cambió de tabla a media vuelta: se empieza de nuevo
        sent++; notionMarkSent(it.sid, h);
        if (r && r.url) notionLocalSet('page:' + it.sid, r.url);       // para abrir la página de la reunión desde el aviso
      }catch(e){
        if (e.net || NOTION_GLOBAL.includes(e.code) || e.status === 429 || e.status >= 500) throw e;
        bad++; notionMarkSent(it.sid, 'ERR:' + h);                    // solo esta cita: se anota y se sigue con las demás
        console.warn('Notion no aceptó la cita «' + data.nombre + '»:', e.message);
      }
      await new Promise(z => setTimeout(z, 400));
    }
    notionSt.err = bad ? bad + ' cita(s) que Notion no aceptó (ver consola, F12)' : '';
    notionSt.ok += sent; notionSt.bad = bad; notionSt.at = Date.now();
    await notionMinutasRun();                                        // minutas de Notion de las citas ya pasadas (cada 10 min)
  }catch(e){
    if (e.net){ notionSt.pauseUntil = Date.now() + 600000; console.info('Notion: el puente no respondió. Se reintenta en 10 min.'); }
    else {
      notionSt.err = e.message || 'No se pudo enviar a Notion';
      notionSt.pauseUntil = Date.now() + (e.status === 429 || e.status >= 500 ? 120000 : 600000);
      if (e.code === 'pass'){ const w = notionWho(); if (w) notionSetPass(w, ''); }   // pase vencido o código cambiado: hay que volver a entrar
      console.warn('Notion:', notionSt.err);
    }
  }
}
/* ---------- minutas de Notion (AI Meeting Notes) ----------
   citas ya pasadas (hasta NOTION_DAYS_BACK días) cuya minuta aún no está lista: se le pregunta al puente cada 10 min */
function notionMinStart(s){ const d = new Date(s.date + 'T' + (s.time || '00:00') + ':00'); return isNaN(d) ? 0 : d.getTime(); }
function notionGcalIds(){ const m = {}; try{ (gcal.events || []).forEach(e => { const p = e.extendedProperties && e.extendedProperties.private; if (p && p.sid && e.id) m[p.sid] = e.id; }); }catch(_){} return m; }
async function notionMinutasRun(){
  const now = Date.now();
  if (now < notionSt.minAt) return;
  notionSt.minAt = now + NOTION_MIN_EVERY;
  const list = notionMyCitas().filter(x => x.s.time && !(x.s.notionMinuta && x.s.notionMinuta.status === 'notes_ready'))
    .map(x => { const st = notionMinStart(x.s); return { x, st, en: st + Math.max(+x.s.durMin || 60, 15) * 60000 }; })
    .filter(o => o.st && o.st < now).slice(0, 12);
  const glist = notionGoogleCitas().filter(g => g.start < now && !((notionGoogleMin(g.sid) || {}).status === 'notes_ready')).slice(0, 20 - list.length);
  if (!list.length && !glist.length) return;
  const ev = notionGcalIds();
  try{
    const r = await notionCall({ action: 'minutas', citas: list.map(o => ({ sid: o.x.s.id, nombre: o.x.s.name || '', start: o.st, end: o.en, ev: ev[o.x.s.id] || '' }))
      .concat(glist.map(g => ({ sid: g.sid, nombre: g.nombre, start: g.start, end: g.end, ev: g.ev }))) });
    notionSt.minErr = '';
    let changed = 0;
    glist.forEach(g => {                                               // eventos de Google: la minuta se recuerda aquí y viaja a la columna «Minuta»
      const m = r && r.minutas && r.minutas[g.sid]; if (!m || !m.url) return;
      const prev = notionGoogleMin(g.sid) || {};
      if (prev.url === m.url && prev.status === m.status) return;
      notionLocalSet('min:' + g.sid, JSON.stringify({ url: m.url, status: m.status || '', titulo: m.titulo || '', at: new Date().toISOString() }));
      changed++; notionPushSoon();
    });
    list.forEach(o => {
      const m = r && r.minutas && r.minutas[o.x.s.id]; if (!m || !m.url) return;
      const prev = o.x.s.notionMinuta || {};
      if (prev.url === m.url && prev.status === m.status && (prev.resumen || '') === (m.resumen || '')) return;
      store.updateSubtask(o.x.t.id, o.x.s.id, { notionMinuta: { url: m.url, status: m.status || '', titulo: m.titulo || '', resumen: m.resumen || '', grabacion: m.grabacion || null, at: new Date().toISOString() } });
      if (!prev.url && typeof logEvent === 'function') logEvent(o.x.t.id, 'Se ligó la minuta de Notion de la cita «' + (o.x.s.name || '') + '»');
      changed++;
    });
    if (changed){ console.info('Notion: ' + changed + ' minuta(s) de Notion ligadas o actualizadas.'); if (typeof renderKeepScroll === 'function') renderKeepScroll(); }
  }catch(e){
    if (e.code === 'meet_off'){ notionSt.minAt = now + NOTION_MIN_OFF; notionSt.minErr = e.message; console.info('Notion (minutas):', e.message); }
    else if (e.code === 'pass') throw e;                 // lo maneja notionPushRun: hay que volver a entrar
    else console.warn('Notion (minutas):', e.message || e);
  }
}
/* lo que se ve en la tarjeta de la cita y en «📝 Minutas de esta cita» (nunca en el portal de clientes) */
const NOTION_MIN_ST = { notes_ready: ['lista', '#1f7a44', '#e8f6ee'], summary_in_progress: ['resumiendo…', '#9a7a00', '#fff7e0'], transcription_in_progress: ['grabando…', '#a3341f', '#fdecea'],
  transcription_paused: ['en pausa', '#6b7a73', '#eef0ec'], transcription_not_started: ['sin grabar', '#6b7a73', '#eef0ec'], transcription_failed: ['falló la transcripción', '#a3341f', '#fdecea'] };
function notionMinutaHtml(s, full){
  if (window.CLIENT_ONLY) return '';
  const m = s && s.notionMinuta; if (!m || !m.url) return '';
  const st = NOTION_MIN_ST[m.status] || [m.status || 'sin estado', '#6b7a73', '#eef0ec'];
  const dur = m.grabacion && m.grabacion.start && m.grabacion.end ? Math.round((Date.parse(m.grabacion.end) - Date.parse(m.grabacion.start)) / 60000) : 0;
  const res = m.resumen ? `<details style="margin-top:4px"${full ? ' open' : ''}><summary style="cursor:pointer;font-size:.76rem;color:#3b5b8c">Resumen de la reunión (Notion)</summary><div style="white-space:pre-wrap;font-size:.78rem;line-height:1.4;margin-top:4px;padding:6px 8px;background:#f6f7fb;border-radius:6px">${esc(m.resumen)}</div></details>` : '';
  return `<div class="cita-prop" style="display:block"><a href="${esc(m.url)}" target="_blank" rel="noopener" style="font-weight:600;color:#3b5b8c" onclick="event.stopPropagation()">🎙 Minuta de Notion</a> <span class="pill" style="font-size:.68rem;background:${st[2]};color:${st[1]}">${st[0]}</span>${dur ? ` <span class="muted" style="font-size:.72rem">· ${dur} min grabados</span>` : ''}${res}</div>`;
}

/* ---------- aviso «🎙 ¿Grabar con Notion?» a la hora de cada videollamada ----------
   de 5 min antes a 20 min después del inicio; una vez por reunión. Para citas/videollamadas del portal y eventos de tu
   Google Calendar con Meet. «Entrar y grabar» abre el Meet y la página de esa reunión en la app de Notion. */
const notionAvisoVisto = new Set(); let notionAvisoCur = null;
function notionAvisoCands(){
  const now = Date.now(), out = [];
  notionMyCitas().forEach(x => { if (!x.s.time || x.s.done) return; const meet = typeof gcalSubMeet === 'function' ? gcalSubMeet(x.s) : ''; if (!meet) return; out.push({ sid: x.s.id, nombre: x.s.name || 'Reunión', start: notionMinStart(x.s), meet }); });
  notionGoogleCitas().forEach(g => out.push({ sid: g.sid, nombre: g.nombre, start: g.start, meet: g.meet }));
  return out.filter(c => c.start && now >= c.start - 5 * 60000 && now <= c.start + 20 * 60000).sort((a, b) => a.start - b.start);
}
function notionAvisoWatch(){
  if (notionSt.off || !notionWho() || document.hidden || notionAvisoCur) return;
  const c = notionAvisoCands().find(c => !notionAvisoVisto.has(c.sid + ':' + c.start)); if (!c) return;
  notionAvisoVisto.add(c.sid + ':' + c.start); notionAvisoCur = c; notionAvisoRender();
}
function notionAvisoRender(){
  let el = document.getElementById('notion-aviso'); const c = notionAvisoCur;
  if (!c){ if (el) el.remove(); return; }
  if (!el){ el = document.createElement('div'); el.id = 'notion-aviso'; document.body.appendChild(el); }
  const hh = new Date(c.start).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }), web = notionLocal('page:' + c.sid) || '';
  el.style.cssText = 'position:fixed;left:16px;bottom:16px;z-index:9999;max-width:340px;background:#fff;color:#223c36;border:1px solid #d9d7cb;border-radius:12px;box-shadow:0 8px 28px rgba(0,0,0,.18);padding:12px 14px;font:13px/1.45 Inter,Arial,sans-serif';
  el.innerHTML = `<b>🎙 ¿Grabar «${esc(c.nombre)}» con Notion?</b>
    <div style="color:#5b6b64;margin:4px 0 8px">Empieza a las ${hh}. Se abre el Meet y la página de la reunión en Notion; ahí escribe <b>/meeting</b> → <b>Empezar a transcribir</b>. La minuta se liga sola.${web ? ` <a href="${esc(web)}" target="_blank" rel="noopener" style="color:#3b5b8c">Abrir en el navegador</a>` : ''}</div>
    <div style="display:flex;gap:6px;flex-wrap:wrap"><button class="btn sm" onclick="notionAvisoGo()">🎥 Entrar y grabar</button><button class="btn ghost sm" onclick="notionAvisoNotion()">Solo abrir Notion</button><button class="btn ghost sm" onclick="notionAvisoCerrar()">Ahora no</button></div>`;
}
/* la app de escritorio de Notion abre los links notion://; si aún no se mandó la cita, abre Notion sin página */
function notionAvisoNotion(){ const c = notionAvisoCur; if (!c) return; const u = notionLocal('page:' + c.sid) || ''; try{ window.location.href = u ? u.replace(/^https:\/\//, 'notion://') : 'notion://www.notion.so'; }catch(_){} }
function notionAvisoGo(){ const c = notionAvisoCur; if (!c) return; try{ window.open(c.meet, '_blank', 'noopener'); }catch(_){} notionAvisoNotion(); notionAvisoCerrar(); }
function notionAvisoCerrar(){ notionAvisoCur = null; notionAvisoRender(); }

async function notionPushMine(){
  if (window.__bootStale){ notionPushSoon(); return; }   // [ARRANQUE INSTANTÁNEO] espera a los datos al día
  if (notionSt.off || notionSt.running || !notionWho() || !notionPass() || Date.now() < notionSt.pauseUntil) return;
  notionSt.running = true;
  try{
    /* una sola pestaña de este navegador envía a la vez (las demás se saltan esta vuelta) */
    if (navigator.locks && navigator.locks.request) await navigator.locks.request('nuwek-notion', { ifAvailable: true }, lock => lock ? notionPushRun() : null);
    else await notionPushRun();
  }finally{ notionSt.running = false; }
}
/* se llama desde store.save(): los cambios llegan a Notion a los pocos segundos */
function notionPushSoon(){
  if (notionSt.off || !notionWho()) return;
  clearTimeout(notionPushSoon.t);
  notionPushSoon.t = setTimeout(() => { if (notionSt.running) notionPushSoon(); else notionPushMine(); }, 5000);
}
/* para revisar la conexión desde la consola (F12): notionProbar() → muestra qué columnas reconoció */
async function notionProbar(){
  if (!NOTION_URL){ const m = 'Falta la URL del puente: pega la URL /exec del Apps Script en NOTION_URL (js/core/notion.js).'; console.warn('Notion:', m); return { error: m }; }
  if (!notionPass()) { const m = 'Falta el pase: sal del portal y vuelve a entrar con tu código.'; console.warn('Notion:', m); return { error: m }; }
  try{ const r = await notionCall({ action: 'schema' }); console.table(r.columnas); console.log('Columnas usadas por el portal:', r.usadas); return r; }
  catch(e){ console.warn('Notion:', e.message); return { error: e.message }; }
}
/* aviso en el panel de Citas */
function notionChip(){
  if (notionSt.off || !notionWho()) return '';
  if (!notionPass()) return `<span class="pill" style="background:#fff7e0;color:#9a7a00;font-size:.72rem;margin-left:8px" title="Sal y vuelve a entrar con tu código para que tus citas se copien a Notion">Notion: vuelve a entrar</span>`;
  if (notionSt.err) return `<span class="pill" style="background:#fdecea;color:#a3341f;font-size:.72rem;margin-left:8px" title="${esc(notionSt.err)}">Notion: error</span>`;
  return notionSt.at ? `<span class="pill" style="background:#eef2f8;color:#3b5b8c;font-size:.72rem;margin-left:8px" title="${esc('Las citas se copian solas a Notion' + (notionSt.minErr ? ' · Minutas: ' + notionSt.minErr : ' · Las minutas grabadas en Notion se ligan solas'))}">Notion ✓</span>` : '';
}
/* al abrir el portal y cada 2 min (por si el cliente confirmó o alguien más cambió la cita) */
setTimeout(() => notionPushMine(), 8000);
setInterval(() => { if (!document.hidden) notionPushMine(); }, 120000);
setTimeout(() => notionAvisoWatch(), 12000);
setInterval(() => notionAvisoWatch(), 30000);
