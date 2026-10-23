/* ================== GOOGLE CALENDAR (solo la persona que inició sesión) ==================
   Cada quien conecta SU cuenta de Google desde ⏰ o Mi espacio; nadie ve ni conecta el calendario de otro.
   - La conexión queda guardada en este navegador POR PERSONA: al salir y volver a entrar sigue vinculada.
     Google da permisos de ~1 h; cuando vencen basta un clic en «Reconectar» (sin volver a dar permisos).
     Solo «Desconectar» la quita.
   - «Sincronizar ahora» manda tus actividades del portal (las tuyas o donde estás en el equipo, con fecha,
     sin terminar) a tu Google Calendar y luego trae tus eventos. Solo toca los eventos que creó el portal
     (marcados por dentro con nuwek=1); si una actividad se termina, se mueve o deja de ser tuya, se actualiza o se quita.
   Requisito en Google Cloud Console → Credenciales → este CLIENT_ID: agregar en "Orígenes de JavaScript autorizados"
   el dominio donde está publicado el portal (y http://localhost:8080 para pruebas). */
const CLIENT_ID = '750897224529-ubbga1c9ioo28s2lh8a30l637c187lcn.apps.googleusercontent.com';
const GCAL_SCOPE = 'https://www.googleapis.com/auth/calendar.events';   // ver y crear eventos (antes solo lectura)
const GCAL_DAYS = 14;                       // cuántos días hacia adelante se muestran
const GCAL_PUSH_DAYS = 365;                 // hasta cuántos días adelante se mandan tus actividades a Google
const GCAL_API = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';
const GCAL_EMPTY = () => ({ uid:null, token:null, exp:0, scope:'', linked:false, email:'', events:null, cal:'', loading:false, err:'', at:0, push:null });
let gcal = GCAL_EMPTY();

/* escape completo: los títulos vienen de invitaciones de cualquiera, no solo del equipo */
function gcalEsc(v){ return String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function gcalKey(uid){ return 'nuwekGcal:'+uid; }
/* quién usa el calendario: la persona del equipo (código) o el contacto del cliente (portal de clientes) */
function gcalWho(){ try{ if(session) return session; }catch(_){ return null; } try{ if(clientSess) return 'cli:'+clientSess.cid+':'+clientSess.pid; }catch(_){} return null; }
function gcalIsClient(){ return /^cli:/.test(gcalWho()||''); }
function gcalStore(){ if(!gcal.uid) return; try{ localStorage.setItem(gcalKey(gcal.uid),JSON.stringify({token:gcal.token,exp:gcal.exp,scope:gcal.scope,linked:gcal.linked,email:gcal.email||gcal.cal})); }catch(_){} }
/* carga lo guardado de la persona en sesión (si cambió de persona, se limpia lo de la anterior) */
function gcalSync(){
  const who=gcalWho();
  if(!who){ if(gcal.uid) gcal=GCAL_EMPTY(); return; }
  if(gcal.uid===who) return;
  gcal=GCAL_EMPTY(); gcal.uid=who;
  try{ const s=JSON.parse(localStorage.getItem(gcalKey(who))||'null');
    if(s){ gcal.linked=s.linked!==false&&!!(s.token||s.linked); gcal.email=s.email||''; gcal.cal=s.email||''; gcal.scope=s.scope||'';
      if(s.token&&s.exp>Date.now()){ gcal.token=s.token; gcal.exp=s.exp; } } }catch(_){}
}
function gcalConnected(){ gcalSync(); return !!(gcal.token&&gcal.exp>Date.now()); }
/* vinculada pero con el permiso de Google vencido: se muestra «Reconectar» (un clic, sin pantalla de permisos) */
function gcalNeedsReconnect(){ gcalSync(); return gcal.linked&&!gcalConnected(); }
function gcalCanWrite(){ return /calendar\.events|auth\/calendar(\s|$)/.test(gcal.scope||''); }
/* [AGENDA · ARRASTRAR 2026-10-23] si llegan eventos de Google mientras arrastras una actividad, se espera a que la sueltes
   (redibujar a media arrastrada dejaba a Chrome «arrastrando» y sin responder a los clics) */
function gcalRefreshUI(){ const busy=(typeof agListDrag!=='undefined'&&agListDrag)||document.querySelector('.ag-block.dragging,.ag-block.resizing');
  if(busy){ clearTimeout(gcalRefreshUI.t); gcalRefreshUI.t=setTimeout(gcalRefreshUI,400); return; }
  render(); if(nextOpen) nextRender(); }

/* pide el permiso a Google; then() corre cuando ya hay token válido */
function gcalConnect(then){
  gcalSync(); if(!gcalWho()) return;
  if(!(window.google&&google.accounts&&google.accounts.oauth2)){ gcal.err='Google aún no termina de cargar. Intenta de nuevo en unos segundos.'; gcalRefreshUI(); return; }
  const uid=gcalWho(), first=!gcal.linked;
  const client=google.accounts.oauth2.initTokenClient({ client_id:CLIENT_ID, scope:GCAL_SCOPE, include_granted_scopes:true,
    callback:resp=>{
      if(gcalWho()!==uid) return;                // cambió la sesión mientras estaba abierta la ventana de Google
      if(resp.error){ gcal.err=resp.error==='access_denied'?'No se dio permiso para usar el calendario.':'No se pudo conectar ('+resp.error+').'; gcalRefreshUI(); return; }
      const okScope=!google.accounts.oauth2.hasGrantedAnyScope||google.accounts.oauth2.hasGrantedAnyScope(resp,GCAL_SCOPE,'https://www.googleapis.com/auth/calendar','https://www.googleapis.com/auth/calendar.readonly');
      if(!okScope){ gcal.err='En la ventana de Google quedó sin marcar la casilla del calendario. Vuelve a conectar y déjala marcada.'; gcalRefreshUI(); return; }
      gcal.token=resp.access_token; gcal.exp=Date.now()+((+resp.expires_in||3600)-60)*1000; gcal.scope=resp.scope||GCAL_SCOPE; gcal.linked=true; gcal.err='';
      if(first) gcal.events=null;
      gcalStore();
      if(typeof then==='function') then(); else gcalSyncNow();
    },
    error_callback:e=>{ if(gcalWho()!==uid) return;
      gcal.err=e&&e.type==='popup_closed'?(first?'Se cerró la ventana de Google sin conectar. Si te apareció «Acceso bloqueado», pide a quien administra Google Cloud que agregue tu correo como usuario de prueba.':'')
        :'No se pudo abrir la ventana de Google. Permite las ventanas emergentes para este sitio e intenta de nuevo.';
      gcalRefreshUI(); } });
  /* si ya estaba vinculada no se vuelve a mostrar la pantalla de permisos; login_hint elige la cuenta correcta */
  const opts={prompt:first?'consent':''}; if(gcal.email||gcal.cal) opts.login_hint=gcal.email||gcal.cal;
  client.requestAccessToken(opts);
}
/* corre fn con un token vigente; si venció, reconecta primero (lo llama un clic, así no lo bloquea el navegador) */
function gcalWithToken(fn){ if(gcalConnected()) fn(); else gcalConnect(fn); }
/* olvidar: revoke=true al desconectar a propósito (quita también el vínculo); false solo limpia la memoria */
function gcalForget(revoke){
  const t=gcal.token, uid=gcal.uid;
  if(revoke){ if(uid){ try{ localStorage.removeItem(gcalKey(uid)); }catch(_){} }
    if(t&&window.google&&google.accounts&&google.accounts.oauth2){ try{ google.accounts.oauth2.revoke(t,()=>{}); }catch(_){} } }
  gcal=GCAL_EMPTY(); gcal.uid=revoke?(gcalWho()||null):null;
}
function gcalDisconnect(){ if(!confirm('¿Desconectar tu Google Calendar de este navegador?\n\nLos eventos que el portal ya creó en tu calendario se quedan ahí.')) return; gcalForget(true); gcalRefreshUI(); }
/* el permiso de Google venció: se queda vinculada y se ofrece reconectar */
function gcalExpired(){ gcal.token=null; gcal.exp=0; gcalStore(); gcal.err=''; }

/* ---------- Llamadas a Google con reintento y mensajes claros ----------
   Reintenta solo cuando Google pide esperar (429 / límite de uso / 500-503), con pausas de 0.8, 1.6 y 3.2 s.
   Cualquier otro error sale con .kind para decidir qué decirle a la persona:
   exp (venció el permiso) · scope (falta la casilla del calendario) · api (la API está apagada en Google Cloud)
   rate (demasiadas solicitudes) · forbidden (no eres el organizador) · gone (el evento ya no existe) · net (sin conexión) */
async function gcalErrInfo(r){
  try{ const j=await r.clone().json(); const e=j&&j.error||{}; return {reason:((e.errors&&e.errors[0]&&e.errors[0].reason)||'')+' '+(e.status||''),message:e.message||''}; }catch(_){ return {reason:'',message:''}; }
}
const GCAL_MSG={
  exp:'Tu permiso de Google venció. Presiona «Reconectar».',
  scope:'Falta el permiso del calendario. Presiona «Dar permiso» y deja marcada la casilla del calendario en la ventana de Google.',
  api:'La API de Google Calendar no está activada en el proyecto de Google Cloud. Quien lo administra debe activarla en APIs y servicios → Biblioteca → Google Calendar API.',
  rate:'Google está recibiendo demasiadas solicitudes. Espera un minuto e intenta de nuevo.',
  forbidden:'Google no te deja cambiar este evento (solo su organizador puede).',
  gone:'Ese evento ya no existe en tu Google Calendar.',
  net:'Sin conexión con Google. Revisa tu internet e intenta de nuevo.'
};
async function gcalFetch(url,opt){
  opt=opt||{};
  for(let i=0;;i++){
    let r;
    try{ r=await fetch(url,Object.assign({},opt,{headers:Object.assign({Authorization:'Bearer '+gcal.token},opt.body?{'Content-Type':'application/json'}:{})})); }
    catch(_){ if(i<2){ await new Promise(z=>setTimeout(z,800*2**i)); continue; } const x=new Error(GCAL_MSG.net); x.kind='net'; throw x; }
    if(r.ok) return r.status===204?null:r.json().catch(()=>null);
    const info=await gcalErrInfo(r), why=info.reason;
    const rate=r.status===429||(r.status===403&&/rateLimit|userRateLimit|quotaExceeded|RESOURCE_EXHAUSTED/i.test(why));
    if((rate||r.status>=500)&&i<3){ await new Promise(z=>setTimeout(z,800*2**i)); continue; }
    const kind=r.status===401?'exp':/accessNotConfigured|SERVICE_DISABLED/i.test(why+' '+info.message)?'api':/insufficient|SCOPE_INSUFFICIENT/i.test(why)?'scope':rate?'rate':(r.status===404||r.status===410)?'gone':r.status===403?'forbidden':'http';
    const e=new Error(GCAL_MSG[kind]||('Google respondió con un error ('+r.status+').')); e.kind=kind; e.status=r.status; throw e;
  }
}

/* trae los próximos eventos (máx. cada 5 min salvo que se pida forzar) */
function gcalLoad(force){
  if(!gcalConnected()||gcal.loading) return;
  if(!force&&gcal.events&&Date.now()-gcal.at<5*60000) return;
  if(!force&&gcal.err&&!gcal.events) return;  // tras un error no se reintenta solo en cada render; queda el botón
  const uid=gcal.uid, now=new Date(), since=new Date(now.getTime()-7*86400000), until=new Date(now.getTime()+60*86400000);
  const q=new URLSearchParams({timeMin:since.toISOString(),timeMax:until.toISOString(),singleEvents:'true',orderBy:'startTime',maxResults:'250'});
  gcal.loading=true; gcal.err='';
  gcalFetch(GCAL_API+'?'+q)
    .then(d=>{ d=d||{}; if(gcal.uid!==uid) return; gcal.events=(d.items||[]).filter(e=>e.status!=='cancelled'); gcal.cal=d.summary||gcal.cal; if(gcal.cal&&gcal.cal!==gcal.email){ gcal.email=gcal.cal; gcalStore(); } gcal.at=Date.now(); })
    .catch(e=>{ if(gcal.uid!==uid) return; gcal.at=Date.now(); if(e.kind==='exp'){ gcalExpired(); return; } if(e.kind==='scope'){ gcal.scope=''; gcalStore(); } gcal.err=e.kind?e.message:'No se pudieron traer tus eventos de Google.'; })
    .finally(()=>{ if(gcal.uid===uid) gcal.loading=false; gcalRefreshUI(); });
}

/* ---------- Mandar MIS actividades del portal a Google Calendar ---------- */
function gcalLocalISO(d){ return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
function gcalHM(d){ return String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0'); }
/* Lo mismo que ves en «Mis pendientes», desde hoy en adelante (hasta GCAL_PUSH_DAYS):
   - cada subtarea sin terminar con fecha donde eres responsable, estás en el equipo o eres invitado
   - la fecha límite de cada tarea sin terminar de la que eres responsable (evento de todo el día)
   Las vencidas y las que no tienen fecha no se mandan (no tienen un día donde ponerlas). */
function gcalMyActs(){
  if(gcalIsClient()) return gcalClientActs();
  const me=session, out=[]; if(!me) return out;
  const t0=new Date(); t0.setHours(0,0,0,0); const from=gcalLocalISO(t0); const lim=new Date(t0); lim.setDate(lim.getDate()+GCAL_PUSH_DAYS); const to=gcalLocalISO(lim);
  (store.d.tasks||[]).forEach(t=>{ const p=store.project(t.projectId); if(!p||t.status==='done') return; const c=store.client(p.clientId);
    (t.subtasks||[]).forEach(s=>{
      if(s.done||s.isSeries||!s.date||s.date<from||s.date>to) return;
      const rol=s.personId===me?'resp':(s.team||[]).includes(me)?'equipo':(s.invitados||[]).includes(me)?'invitado':''; if(!rol) return;
      out.push({kind:'sub',key:s.id,s,t,p,c,rol}); });
    if(t.responsibleId===me&&t.dueDate&&t.dueDate>=from&&t.dueDate<=to) out.push({kind:'due',key:'due_'+t.id,t,p,c}); });
  return out;
}
function gcalActBody(a){
  if(a.kind==='cita') return gcalCitaBody(a);
  const tz=(Intl.DateTimeFormat().resolvedOptions().timeZone)||'America/Mexico_City';
  const link=location.origin+location.pathname+'#/tarea/'+encodeURIComponent(a.t.id);
  const where=(a.c?a.c.name+' · ':'')+a.p.name;
  const allDay=d=>{ const n=new Date(d+'T00:00:00'); n.setDate(n.getDate()+1); return {start:{date:d},end:{date:gcalLocalISO(n)}}; };
  const priv={nuwek:'1',sid:a.key,tid:a.t.id};
  if(a.kind==='due'){
    const desc=[where,'Fecha límite de la tarea (eres responsable)','','Abrir en Nuwek: '+link].join('\n');
    return Object.assign({summary:'🏁 Fecha límite: '+(a.t.name||'(Sin nombre)'),description:desc,colorId:'11',extendedProperties:{private:priv}},allDay(a.t.dueDate));
  }
  const rolTx=a.rol==='equipo'?'(Participas en el equipo)':a.rol==='invitado'?'(Estás invitado)':'';
  const meet=typeof gcalSubMeet==='function'?gcalSubMeet(a.s):'';
  const desc=[where,'Tarea: '+a.t.name,rolTx,meet?'Videollamada: '+meet:'','','Abrir en Nuwek: '+link].filter((x,i,arr)=>x||i===arr.length-2).join('\n');
  let when;
  if(a.s.time){ const st=new Date(a.s.date+'T'+a.s.time+':00'); const en=new Date(st.getTime()+Math.max(+a.s.durMin||30,15)*60000);
    when={start:{dateTime:a.s.date+'T'+a.s.time+':00',timeZone:tz},end:{dateTime:gcalLocalISO(en)+'T'+gcalHM(en)+':00',timeZone:tz}}; }
  else when=allDay(a.s.date);
  const tipo=typeof subTipo==='function'?subTipo(a.s,a.t):'';
  return Object.assign({summary:a.s.name||'(Sin nombre)',description:desc,location:meet||undefined,colorId:(typeof GCAL_SUB2G!=='undefined'&&GCAL_SUB2G[tipo])||'2',extendedProperties:{private:priv}},when);
}
/* misma hora/título/descripción → no hace falta tocar el evento */
function gcalSame(ev,b){
  const st=x=>x?(x.date||((x.dateTime||'').slice(0,16))):'';
  return (ev.summary||'')===b.summary&&(ev.description||'')===b.description&&st(ev.start)===st(b.start)&&st(ev.end)===st(b.end)&&(ev.colorId||'')===(b.colorId||'')&&(ev.location||'')===(b.location||'');
}
async function gcalPushMine(){
  if(!gcalConnected()||(gcal.push&&gcal.push.running)) return;   // nunca dos envíos a la vez (duplicarían eventos)
  gcal.autoAt=Date.now();
  const uid=gcal.uid;
  const call=async(url,opt)=>{ try{ return await gcalFetch(url,opt); }catch(e){ if(e.kind==='gone'&&opt&&(opt.method==='DELETE'||opt.method==='PATCH')) return {gone:true}; throw e; } };
  gcal.push={running:true,msg:'Enviando tus actividades…'}; gcalRefreshUI();
  try{
    const t0=new Date(); t0.setHours(0,0,0,0); const lim=new Date(t0); lim.setDate(lim.getDate()+GCAL_PUSH_DAYS+1);
    /* lo que el portal ya había puesto en tu calendario */
    const mine={}; let pageToken='';
    do{ const q=new URLSearchParams({privateExtendedProperty:'nuwek=1',timeMin:t0.toISOString(),timeMax:lim.toISOString(),singleEvents:'true',maxResults:'250',showDeleted:'false'}); if(pageToken) q.set('pageToken',pageToken);
      const d=await call(GCAL_API+'?'+q); (d&&d.items||[]).forEach(ev=>{ const sid=ev.extendedProperties&&ev.extendedProperties.private&&ev.extendedProperties.private.sid; if(sid&&ev.status!=='cancelled') mine[sid]=ev; }); pageToken=d&&d.nextPageToken||''; }while(pageToken);
    let nu=0, up=0, del=0; const keep=new Set();
    for(const a of gcalMyActs()){ if(gcal.uid!==uid) return; const b=gcalActBody(a); keep.add(a.key); const ev=mine[a.key];
      if(!ev){ await call(GCAL_API,{method:'POST',body:JSON.stringify(b)}); nu++; }
      else if(!gcalSame(ev,b)){ const r=await call(GCAL_API+'/'+encodeURIComponent(ev.id),{method:'PATCH',body:JSON.stringify(b)}); if(r&&r.gone){ await call(GCAL_API,{method:'POST',body:JSON.stringify(b)}); nu++; } else up++; } }
    /* terminadas, movidas fuera del rango o que ya no son tuyas: se quitan de tu calendario */
    for(const sid in mine){ if(keep.has(sid)) continue; if(gcal.uid!==uid) return; await call(GCAL_API+'/'+encodeURIComponent(mine[sid].id),{method:'DELETE'}); del++; }
    const parts=[nu&&nu+' nueva'+(nu>1?'s':''),up&&up+' actualizada'+(up>1?'s':''),del&&del+' quitada'+(del>1?'s':'')].filter(Boolean);
    gcal.push={running:false,ok:true,at:Date.now(),msg:parts.length?'✓ Tus actividades: '+parts.join(' · '):'✓ Tus actividades ya estaban al día'};
  }catch(e){
    if(gcal.uid!==uid) return;
    if(e.kind==='exp'){ gcalExpired(); gcal.push={running:false,msg:GCAL_MSG.exp}; }
    else if(e.kind==='scope'){ gcal.scope=''; gcalStore(); gcal.push={running:false,msg:GCAL_MSG.scope}; }
    else gcal.push={running:false,msg:e.kind?e.message:'No se pudieron enviar tus actividades a Google.'};
  }
  gcalRefreshUI();
}
/* «Sincronizar ahora»: manda tus actividades (si hay permiso de escritura) y luego trae tus eventos */
function gcalSyncNow(){
  if(gcal.push&&gcal.push.running) return;
  gcalWithToken(async()=>{ if(gcalCanWrite()) await gcalPushMine(); else gcal.push={running:false,msg:'Para ver aquí tus actividades del portal en Google, presiona «Dar permiso».'}; gcalLoad(true); });
}
/* conexiones viejas (solo lectura): pedir el permiso nuevo para poder crear eventos */
function gcalGrantWrite(){ gcalConnect(()=>gcalSyncNow()); }

/* "Hoy 10:30", "Mañana · todo el día", "mié 22 oct 16:00" */
function gcalWhen(e){
  const allDay=!e.start.dateTime, d=allDay?new Date(e.start.date+'T00:00:00'):new Date(e.start.dateTime);
  const t0=new Date(); t0.setHours(0,0,0,0); const dd=new Date(d); dd.setHours(0,0,0,0);
  const diff=Math.round((dd-t0)/86400000);
  const day=diff===0?'Hoy':diff===1?'Mañana':d.toLocaleDateString('es-MX',{weekday:'short',day:'numeric',month:'short'}).replace(/\./g,'');
  const hr=allDay?'todo el día':d.toLocaleTimeString('es-MX',{hour:'2-digit',minute:'2-digit',hour12:false});
  const soon=!allDay&&d>Date.now()&&d-Date.now()<3600000;
  return {day,hr,soon};
}
function gcalItem(e){
  const w=gcalWhen(e), link=/^https:\/\//.test(e.htmlLink||'')?e.htmlLink:'';
  const where=e.hangoutLink?'🎥 Meet':(e.location?'📍 '+gcalEsc(e.location):'');
  return `<a class="gc-it${w.soon?' soon':''}" ${link?`href="${gcalEsc(link)}" target="_blank" rel="noopener"`:''}><div class="gc-when"><b>${w.day}</b><span>${w.hr}</span></div><div class="gc-tx"><div class="gc-nm">${gcalEsc(e.summary||'(Sin título)')}</div>${where?`<div class="gc-sub">${where}</div>`:''}</div></a>`;
}
/* lista compacta de Google dentro del ⏰ (5 eventos) */
function gcalBlock(mode){
  const max=5;
  if(!session) return '';
  const g='<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><rect x="3" y="4.5" width="18" height="16" rx="3" fill="#fff" stroke="#4285F4" stroke-width="1.6"/><path d="M3 9h18" stroke="#4285F4" stroke-width="1.6"/><path d="M8 3v3M16 3v3" stroke="#4285F4" stroke-width="1.6" stroke-linecap="round"/><text x="12" y="18" text-anchor="middle" font-size="7.5" font-weight="700" fill="#1a73e8" font-family="Arial">31</text></svg>';
  const err=gcal.err?`<div class="gc-err">${gcalEsc(gcal.err)}</div>`:'';
  const re=gcalNeedsReconnect();
  const btn=`<button class="gc-btn" onclick="event.stopPropagation();gcalConnect()">${re?'Reconectar Google Calendar':'Conectar Google Calendar'}</button>`;
  if(!gcalConnected()){
    return `<div class="gc-sec ${mode}"><div class="gc-h">${g} Google Calendar</div>${err}<div class="gc-empty">${re?'Tu calendario sigue vinculado. Google pide confirmar cada hora: un clic y listo.':'Ve tus eventos de Google junto a tus actividades. Solo tú los ves.'}</div>${btn}</div>`;
  }
  gcalLoad(false);
  const t0=new Date(); t0.setHours(0,0,0,0); const lim=t0.getTime()+GCAL_DAYS*86400000;
  const evs=(gcal.events||[]).filter(e=>{ const st=gcalStart(e).getTime(), en=e.end&&(e.end.dateTime||e.end.date)?new Date(e.end.dateTime||e.end.date+'T00:00:00').getTime():st; return en>Date.now()&&st<lim; }), list=evs.slice(0,max);   // solo lo que viene (la Agenda trae también la semana pasada)
  const acts=`<span class="gc-acts"><button title="Sincronizar: manda tus actividades y trae tus eventos" onclick="event.stopPropagation();gcalSyncNow()">${gcal.loading||(gcal.push&&gcal.push.running)?'…':'↻'}</button><button title="Desconectar" onclick="event.stopPropagation();gcalDisconnect()">✕</button></span>`;
  const acc=gcal.cal?`<span class="gc-acc">${gcalEsc(gcal.cal)}</span>`:'';
  if(!list.length){
    const st=gcal.events===null?(gcal.loading?'Cargando tus eventos…':''):`✓ Sin eventos en los próximos ${GCAL_DAYS} días`;
    return `<div class="gc-sec ${mode}"><div class="gc-h">${g} Google Calendar ${acc}${acts}</div>${err}<div class="gc-list"><div class="gc-empty">${st}</div></div></div>`;
  }
  const body=list.map(gcalItem).join('')+(evs.length>list.length?`<div class="gc-more">+${evs.length-list.length} más en los próximos ${GCAL_DAYS} días</div>`:'');
  return `<div class="gc-sec ${mode}"><div class="gc-h">${g} Google Calendar ${acc}${acts}</div>${err}<div class="gc-list">${body}</div></div>`;
}

/* ================== Piezas visuales compartidas (logo, íconos, días, eventos de Google) ================== */
const GCAL_LOGO='<svg class="gcw-logo" viewBox="0 0 48 48" aria-hidden="true"><path fill="#fff" d="M37 11H11v26h26z"/><path fill="#EA4335" d="M37 48l11-11h-11z"/><path fill="#FBBC04" d="M48 11H37v26h11z"/><path fill="#34A853" d="M37 37H11v11h26z"/><path fill="#188038" d="M0 37v7.3C0 46.4 1.6 48 3.7 48H11V37z"/><path fill="#1967D2" d="M48 11V3.7C48 1.6 46.4 0 44.3 0H37v11z"/><path fill="#4285F4" d="M37 0H3.7C1.6 0 0 1.6 0 3.7V37h11V11h26z"/><text x="24" y="31.5" text-anchor="middle" font-family="Arial" font-weight="700" font-size="17" fill="#1967D2">31</text></svg>';
const GCAL_IC={
  sync:'<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path d="M20 12a8 8 0 0 1-14.3 4.9M4 12a8 8 0 0 1 14.3-4.9M18.5 3v4.2h-4.2M5.5 21v-4.2h4.2" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  cal:'<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15.5" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M3.5 10h17M8 3v4M16 3v4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  ext:'<svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  pin:'<svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true"><path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="10" r="2.3" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>',
  meet:'<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><rect x="2" y="6" width="13" height="12" rx="2.5" fill="#00AC47"/><path d="M15 10.2l5.2-3.4c.4-.3.8 0 .8.4v9.6c0 .4-.4.7-.8.4L15 13.8z" fill="#00832D"/><path d="M2 8.5A2.5 2.5 0 0 1 4.5 6H8v4H2z" fill="#4285F4"/><path d="M2 14h6v4H4.5A2.5 2.5 0 0 1 2 15.5z" fill="#FFBA00"/></svg>'
};
function gcalDayKey(d){ return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
function gcalStart(e){ return e.start.dateTime?new Date(e.start.dateTime):new Date(e.start.date+'T00:00:00'); }
function gcalDur(e){
  if(!e.start.dateTime) return '';
  const m=Math.round((new Date(e.end&&e.end.dateTime||e.start.dateTime)-new Date(e.start.dateTime))/60000);
  if(m<=0) return ''; if(m<60) return m+' min'; const h=Math.floor(m/60), r=m%60; return h+' h'+(r?' '+r:'');
}
function gcalDayHead(d){
  const t0=new Date(); t0.setHours(0,0,0,0); const dd=new Date(d); dd.setHours(0,0,0,0);
  const diff=Math.round((dd-t0)/86400000), short=d.toLocaleDateString('es-MX',{day:'numeric',month:'short'}).replace(/\./g,'');
  if(diff===0) return {lb:'Hoy',dt:short,today:true};
  if(diff===1) return {lb:'Mañana',dt:short};
  const wd=d.toLocaleDateString('es-MX',{weekday:'short'}).replace(/\./g,'');
  return {lb:wd.charAt(0).toUpperCase()+wd.slice(1)+' '+short,dt:''};
}
/* un evento dentro de la tarjeta del día; mini = vista Semana (solo hora y título) */
function gcalEv(e,mini){
  const link=/^https:\/\//.test(e.htmlLink||'')?e.htmlLink:'', s=gcalStart(e);
  const hr=e.start.dateTime?s.toLocaleTimeString('es-MX',{hour:'2-digit',minute:'2-digit',hour12:false}):'Todo el día';
  const soon=e.start.dateTime&&s>Date.now()&&s-Date.now()<3600000, dur=gcalDur(e);
  const nw=!!(e.extendedProperties&&e.extendedProperties.private&&e.extendedProperties.private.nuwek);
  const where=nw?`<span class="gcw-where gcw-nw"><b>N</b> Actividad del portal</span>`:e.hangoutLink?`<span class="gcw-where">${GCAL_IC.meet} Google Meet</span>`:(e.location?`<span class="gcw-where">${GCAL_IC.pin} ${gcalEsc(e.location)}</span>`:'');
  const gcol=!nw&&e.colorId?` style="border-left-color:${gcalColorOf(e)}"`:'', gcb=!nw&&e.id&&typeof gcalCanMove==='function'&&gcalCanMove(e)&&gcalConnected()?GCAL_CBTN('g',e.id):'';
  return `<a${gcol}${gcb?` oncontextmenu="gcalColorMenu(event,'g','${gcalEsc(e.id)}')"`:''} class="gcw-ev${soon?' soon':''}${mini?' mini':''}${nw?' nw':''}" ${link?`href="${gcalEsc(link)}" target="_blank" rel="noopener"`:''} title="${gcalEsc(e.summary||'')}"><div class="gcw-t"><b>${hr}</b>${dur&&!mini?`<span>${dur}</span>`:''}</div><div class="gcw-x"><div class="gcw-nm">${gcalEsc(e.summary||'(Sin título)')}</div>${mini?'':where}${gcalMeetOf(e)?GCAL_JOIN(gcalMeetOf(e)):''}</div>${gcb}</a>`;
}

/* ================== Calendario de Agenda (Mi espacio → Agenda) ==================
   Vista estilo Google Calendar con las actividades del PORTAL de la persona elegida en «Persona»
   (así ves el calendario de tus compañeros). Si eres tú y tienes Google conectado, se suman tus
   eventos de Google (los que el portal mandó a Google no se repiten: ya salen como actividad).
   Pestañas (en este orden): Por horas (la cuadrícula de lunes a sábado) · Semana (la semana de ‹ ›) · Próximos (3 días con algo).
   Por horas: la cuadrícula de
   siempre, donde se arrastra para cambiar hora y se estira para cambiar duración). */
/* [AGENDA · ORDEN DE PESTAÑAS 2026-10-23] Por horas · Semana · Próximos; abre en «Por horas».
   Se usa una llave nueva (nuwekAgView2) para que todos empiecen en «Por horas» aunque antes eligieran otra. */
let agCalView=(()=>{ try{ const v=localStorage.getItem('nuwekAgView2'); return ['sem','prox','horas'].includes(v)?v:'horas'; }catch(_){ return 'horas'; } })();
function agSetCalView(v){ agCalView=v; try{ localStorage.setItem('nuwekAgView2',v); }catch(_){} render(); }

/* actividades del portal de la persona: pendientes con fecha (responsable o en el equipo, como en la lista de Agenda) */
function gcalPortalItems(pid){
  return personSubtasks(pid,true).concat(participationSubs(pid)).filter(it=>it.s.date&&!it.s.done&&!it.s.isSeries&&store.project(it.t.projectId));
}
function gcalPortalEv(it){
  const f=kbFrente(it.t), p=store.project(it.t.projectId), c=p&&store.client(p.clientId);
  const now=new Date(), st=it.s.time?new Date(it.s.date+'T'+it.s.time+':00'):null;
  const soon=st&&st>now&&st-now<3600000, late=it.s.date<todayISO();
  const dur=it.s.time?fmtDurShort(+it.s.durMin||30):'';
  const col=typeof tipoCol==='function'?tipoCol(it.s,it.t):f.color, cb=gcalCanColorSub(it.t,it.s)?GCAL_CBTN('p',it.t.id,it.s.id):'';
  return `<a class="gcw-ev pt${soon?' soon':''}${it.part?' part':''}" style="border-left-color:${col}" ${cb?`oncontextmenu="gcalColorMenu(event,'p','${it.t.id}','${it.s.id}')"`:''} onclick="openAgItem('${it.t.id}','${it.s.id}')" title="${gcalEsc(it.s.name+' · '+it.t.name)}"><div class="gcw-t"><b>${it.s.time||'Todo el día'}</b>${dur?`<span>${dur}</span>`:''}</div><div class="gcw-x"><div class="gcw-nm">${late?'⚠️ ':''}${it.part?'🫱🏽‍🫲🏾 ':''}${gcalEsc(it.s.name)}</div><span class="gcw-where"><i class="gcw-dot" style="background:${f.color}"></i>${gcalEsc((c?c.name+' · ':'')+it.t.name)}</span>${gcalSubMeet(it.s)?GCAL_JOIN(gcalSubMeet(it.s)):''}</div>${cb}</a>`;
}
/* eventos de Google propios (sin los que vienen del portal) */
function gcalOwnGoogle(){ return (gcal.events||[]).filter(e=>!(e.extendedProperties&&e.extendedProperties.private&&e.extendedProperties.private.nuwek)); }
/* lo de un día, ordenado: primero todo el día, luego por hora */
function gcalDayList(iso,portal,goog){
  const L=[];
  portal.filter(it=>it.s.date===iso).forEach(it=>L.push({k:it.s.time||'',h:gcalPortalEv(it)}));
  goog.filter(e=>gcalDayKey(gcalStart(e))===iso).forEach(e=>L.push({k:e.start.dateTime?gcalHM(gcalStart(e)):'',h:gcalEv(e,false)}));
  return L.sort((a,b)=>a.k<b.k?-1:a.k>b.k?1:0);
}
function gcalAgenda(pid,days){
  const self=pid===session, per=store.person(pid)||{name:'—'};
  const on=self&&gcalConnected(); if(on) gcalLoad(false);
  if(on&&gcalCanWrite()&&!(gcal.push&&gcal.push.running)&&Date.now()-(gcal.autoAt||0)>10*60000){ gcal.autoAt=Date.now(); setTimeout(()=>{ gcalPushMine().then(()=>gcalLoad(true)); },0); }
  const auth=gcal.cal?'?authuser='+encodeURIComponent(gcal.cal):'';
  /* encabezado: el estado de Google solo tiene sentido en tu propio calendario */
  let right='', pill='';
  if(self){
    if(on){ pill=`<span class="gcw-pill">Google conectado</span>${gcal.cal?`<span class="gcw-acc">${gcalEsc(gcal.cal)}</span>`:''}`;
      right=`<button class="gcw-sync${gcal.loading||(gcal.push&&gcal.push.running)?' spin':''}" onclick="event.stopPropagation();gcalSyncNow()" title="Manda tus actividades a tu Google Calendar y trae tus eventos">${GCAL_IC.sync} Sincronizar ahora</button><span class="gcw-sep"></span><button class="gcw-off" onclick="event.stopPropagation();gcalDisconnect()">Desconectar</button><a class="gcw-main" href="https://calendar.google.com/calendar/r${auth}" target="_blank" rel="noopener">${GCAL_IC.cal} Abrir Google Calendar</a>`; }
    else if(gcalNeedsReconnect()){ pill=`<span class="gcw-pill warn">Google vinculado</span>`;
      right=`<button class="gcw-off" onclick="event.stopPropagation();gcalDisconnect()">Desconectar</button><button class="gcw-main" onclick="event.stopPropagation();gcalConnect()">${GCAL_IC.sync} Reconectar Google</button>`; }
    else { pill=`<span class="gcw-pill off">Google sin conectar</span>`;
      right=`<button class="gcw-main" onclick="event.stopPropagation();gcalConnect()">${GCAL_IC.cal} Conectar Google Calendar</button>`; }
  } else pill=`<span class="gcw-pill pt">Actividades del portal</span>`;
  const head=`<div class="gcw-h">${self?GCAL_LOGO:`<span class="gcw-logo gcw-av">${gcalEsc((per.name||'?')[0])}</span>`}<span class="gcw-ttl">${self?'Mi calendario':'Calendario de '+gcalEsc(per.name)}</span>${pill}${right?`<span class="gcw-r">${right}</span>`:''}</div>`;
  const err=self&&gcal.err?`<div class="gc-err gcw-err">${gcalEsc(gcal.err)}</div>`:'';
  const note=self&&on&&!gcalCanWrite()?`<div class="gcw-push warn">Para que tus actividades también aparezcan en tu Google Calendar falta un permiso. <button onclick="event.stopPropagation();gcalGrantWrite()">Dar permiso</button></div>`
    :self&&gcal.push&&gcal.push.msg?`<div class="gcw-push${gcal.push.ok?' ok':''}">${gcalEsc(gcal.push.msg)}</div>`:'';
  const tab=(k,l)=>`<button class="${agCalView===k?'on':''}" onclick="agSetCalView('${k}')">${l}</button>`;

  /* [AGENDA · ORDEN DE PESTAÑAS 2026-10-23] primero «Por horas», luego «Semana» y al final «Próximos» */
  /* [AGENDA · FLECHAS EN EL CALENDARIO 2026-10-23] ‹ Hoy › dentro de la tarjeta (antes solo estaban arriba y al bajar
     no se veían) + «↩ Volver» cuando abrir una actividad te llevó a otra semana */
  const back=typeof agBack!=='undefined'&&agBack?`<button class="gcw-back" onclick="agGoBack()" title="Regresar a la semana donde estabas">↩ Volver a ${agRangeLabel([0,1,2,3,4,5].map(i=>addDaysISO(agBack,i)))}</button>`:'';
  const nav=agCalView==='prox'?'':`<div class="gcw-nav"><button onclick="agShift(-7)" title="Semana anterior">‹</button><span>${agRangeLabel(days)}</span><button onclick="agShift(7)" title="Semana siguiente">›</button></div><button class="gcw-today" onclick="agToday()">Hoy</button>`;
  const bar=`<div class="gcw-bar"><div class="gcw-seg">${tab('horas','Por horas')}${tab('sem','Semana')}${tab('prox','Próximos')}</div>${nav}${back}${on?`<a class="gcw-link" href="https://calendar.google.com/calendar/r/agenda${auth}" target="_blank" rel="noopener">Ver agenda de Google ${GCAL_IC.ext}</a>`:''}</div>`;
  if(agCalView==='horas') return `<div class="gcw gcw-agenda">${head}${err}${note}${bar}${agCalendar(days,pid)}</div>`;
  const portal=gcalPortalItems(pid), goog=on?gcalOwnGoogle():[];
  const card=(iso,max)=>{ const d=new Date(iso+'T00:00:00'), h=gcalDayHead(d), L=gcalDayList(iso,portal,goog), more=L.length-max;
    return `<div class="gcw-day${h.today?' today':''}"><div class="gcw-dh"><span>${h.lb}</span>${h.dt&&!h.today?`<em>${h.dt}</em>`:''}</div>${L.length?L.slice(0,max).map(x=>x.h).join(''):'<div class="gcw-none">Sin actividades</div>'}${more>0?`<div class="gcw-more">+${more} más</div>`:''}</div>`; };
  let body;
  if(agCalView==='prox'){
    const today=todayISO(), keys=new Set();
    portal.forEach(it=>{ if(it.s.date>=today) keys.add(it.s.date); }); goog.forEach(e=>{ const k=gcalDayKey(gcalStart(e)); if(k>=today) keys.add(k); });
    const ks=[...keys].sort().slice(0,3);
    body=ks.length?`<div class="gcw-days">${ks.map(k=>card(k,6)).join('')}</div>`:`<div class="gcw-msg">✓ ${self?'No tienes':per.name+' no tiene'} actividades próximas con fecha</div>`;
  } else body=`<div class="gcw-days week5">${days.map(d=>card(d,8)).join('')}</div>`;
  return `<div class="gcw gcw-agenda">${head}${err}${note}${bar}${body}</div>`;
}

/* Por horas: tus eventos de Google (con hora) como bloques dentro de la cuadrícula. Solo en tu propio calendario.
   Si chocan con una actividad del portal, se van a la mitad derecha para que se vean las dos.
   Se pueden ARRASTRAR a otro día u hora (conservan su duración) y el cambio se guarda en tu Google Calendar.
   Solo se mueven los que puedes editar en Google (los que organizas tú o donde te dejan modificar). Clic sin arrastrar: lo abre en Google. */
function gcalCanMove(e){ return !!((e.organizer&&e.organizer.self)||(e.creator&&e.creator.self)||e.guestsCanModify||!e.organizer); }
function gcalHourBlocks(day,pid,H0,H1,rowH){
  if(pid!==session||!gcalConnected()) return '';
  const mine=gcalOwnGoogle().filter(e=>e.start.dateTime&&gcalDayKey(gcalStart(e))===day);
  if(!mine.length) return '';
  const busy=[]; (store.d.tasks||[]).forEach(t=>(t.subtasks||[]).forEach(s=>{ if(s.date===day&&s.time&&(s.personId===pid||(s.team||[]).includes(pid))){ const [h,m]=s.time.split(':').map(Number); busy.push([h*60+m,h*60+m+(+s.durMin||30)]); } }));
  return mine.map(e=>{
    const st=gcalStart(e), en=new Date(e.end&&e.end.dateTime||st.getTime()+1800000);
    const a=st.getHours()*60+st.getMinutes(), b=Math.max(a+15,en.getHours()*60+en.getMinutes()+(gcalDayKey(en)!==day?24*60:0));
    if(a<H0*60||a>=H1*60) return '';
    const top=(a-H0*60)/60*rowH, height=Math.max((Math.min(b,H1*60)-a)/60*rowH,20);
    const half=busy.some(([x,y])=>a<y&&b>x), mv=gcalCanMove(e);
    const gc=e.colorId?`;--gc:${gcalColorOf(e)}`:'';
    return `<div class="ag-block gg${half?' half':''}${mv?' mv':''}${e._saving?' saving':''}${e.colorId?' colored':''}" data-gid="${gcalEsc(e.id)}" onpointerdown="gcalBlockDown(event)" ${mv?`oncontextmenu="gcalColorMenu(event,'g','${gcalEsc(e.id)}')"`:''} style="top:${top}px;height:${height}px${gc}" title="${gcalEsc((e.summary||'(Sin título)')+' · Google Calendar · '+gcalHM(st)+(mv?' · arrastra para moverlo':' · solo el organizador puede moverlo'))}"><b>${gcalHM(st)}</b> ${gcalEsc(e.summary||'(Sin título)')}${mv?GCAL_CBTN('g',e.id):''}${gcalMeetOf(e)?GCAL_JOIN_MINI(gcalMeetOf(e)):''}</div>`;
  }).join('');
}
function gcalBlockDown(ev){
  if(ev.button!==0||ev.target.closest('.ag-cbtn')) return;
  const el=ev.currentTarget, e=(gcal.events||[]).find(x=>x.id===el.dataset.gid); if(!e) return;
  const x0=ev.clientX, y0=ev.clientY, step=AG.rowH/4, mv=gcalCanMove(e); let moved=false;
  const open=()=>{ if(/^https:\/\//.test(e.htmlLink||'')) window.open(e.htmlLink,'_blank','noopener'); };
  const onMove=m=>{ if(!mv) return; if(!moved&&Math.abs(m.clientX-x0)+Math.abs(m.clientY-y0)<5) return; moved=true; el.classList.add('dragging'); el.style.transform=`translate(${m.clientX-x0}px,${Math.round((m.clientY-y0)/step)*step}px)`; el.style.zIndex=20; };
  const onUp=u=>{ document.removeEventListener('pointermove',onMove); document.removeEventListener('pointerup',onUp);
    if(!moved){ open(); return; }
    const blkTop=el.getBoundingClientRect().top; el.style.transform=''; el.classList.remove('dragging');
    const body=[...document.elementsFromPoint(u.clientX,u.clientY)].find(n=>n.classList&&n.classList.contains('ag-day-body'));
    if(!body){ render(); return; }
    const st=gcalStart(e), en=new Date(e.end&&e.end.dateTime||st.getTime()+1800000), dur=Math.max(15,Math.round((en-st)/60000));
    const r=body.getBoundingClientRect(); let min=AG.H0*60+agSnap((blkTop-r.top)/AG.rowH*60); min=Math.max(AG.H0*60,Math.min(min,AG.H1*60-Math.min(dur,60)));
    const day=body.dataset.day, hm=String(Math.floor(min/60)).padStart(2,'0')+':'+String(min%60).padStart(2,'0');
    if(day===gcalDayKey(st)&&hm===gcalHM(st)){ render(); return; }
    gcalMoveEvent(e,day,hm,dur);
  };
  document.addEventListener('pointermove',onMove); document.addEventListener('pointerup',onUp);
}
/* mueve el evento: se ve al instante en el portal y se guarda en Google; si Google lo rechaza, regresa a donde estaba */
function gcalMoveEvent(e,day,hm,dur){
  if(!gcalCanWrite()){ alert('Para mover eventos en tu Google Calendar falta un permiso.\n\nUsa «Dar permiso» en tu calendario de Agenda.'); render(); return; }
  const tz=(Intl.DateTimeFormat().resolvedOptions().timeZone)||'America/Mexico_City';
  const ns=new Date(day+'T'+hm+':00'), ne=new Date(ns.getTime()+dur*60000);
  const body={start:{dateTime:day+'T'+hm+':00',timeZone:tz},end:{dateTime:gcalLocalISO(ne)+'T'+gcalHM(ne)+':00',timeZone:tz}};
  const prev={start:e.start,end:e.end};
  e.start={dateTime:ns.toISOString(),timeZone:tz}; e.end={dateTime:ne.toISOString(),timeZone:tz}; e._saving=true; render();
  gcalWithToken(async()=>{
    try{
      let upd; try{ upd=await gcalFetch(GCAL_API+'/'+encodeURIComponent(e.id),{method:'PATCH',body:JSON.stringify(body)}); }
      catch(x){ if(x.kind==='exp') gcalExpired(); if(x.kind==='scope'){ gcal.scope=''; gcalStore(); } throw x; }
      if(upd&&upd.id){ Object.assign(e,upd); }
      delete e._saving; gcal.push={running:false,ok:true,at:Date.now(),msg:'✓ «'+(e.summary||'Evento')+'» movido al '+gcalDayHead(ns).lb.toLowerCase()+' '+hm+' en tu Google Calendar'};
    }catch(err){ e.start=prev.start; e.end=prev.end; delete e._saving; alert(err.message||'No se pudo mover el evento en Google.'); }
    gcalRefreshUI();
  });
}
/* cuando cambias tus actividades en el portal (mover, cambiar hora, terminar…), se mandan a Google a los pocos segundos */
function gcalPushSoon(){
  const who=gcalWho(); if(!who) return;   // store.save() corre al crear la app, antes de que exista «session» (gcalWho lo cuida)
  if(!gcal.uid||gcal.uid!==who||!gcalConnected()||!gcalCanWrite()) return;
  clearTimeout(gcalPushSoon.t); gcalPushSoon.t=setTimeout(()=>{ if(gcal.push&&gcal.push.running){ gcalPushSoon(); return; } gcalPushMine().then(()=>gcalLoad(true)); },4000);
}

/* al volver a esta pestaña (por ejemplo, después de crear un evento en Google) se traen tus eventos otra vez */
document.addEventListener('visibilitychange',()=>{ if(!document.hidden&&gcalWho()&&gcalConnected()&&Date.now()-(gcal.at||0)>15000) gcalLoad(true); });

/* ================== Colores de los eventos ==================
   Botón 🎨 (o clic derecho) en un evento del calendario de Agenda:
   - Evento de Google → los 11 colores de Google; se guarda en tu Google Calendar.
   - Actividad del portal → los colores del portal (los mismos de «editar subtarea»); también llega a Google con su color equivalente. */
const GCAL_COLORS={'1':['#7986cb','Lavanda'],'2':['#33b679','Salvia'],'3':['#8e24aa','Uva'],'4':['#e67c73','Flamenco'],'5':['#f6bf26','Plátano'],'6':['#f4511e','Mandarina'],'7':['#039be5','Pavo real'],'8':['#616161','Grafito'],'9':['#3f51b5','Arándano'],'10':['#0b8043','Albahaca'],'11':['#d50000','Tomate']};
const GCAL_SUB2G={verde:'10',azul:'9',amarillo:'5',morado:'3',gris:'8',rojo:'11'};   // color del portal → color de Google
function gcalColorOf(e){ return GCAL_COLORS[e.colorId]?GCAL_COLORS[e.colorId][0]:'#4285F4'; }
/* ¿puedo cambiar el color de esta actividad del portal? igual que moverla: la tuya, o si no eres colaborador */
function gcalCanColorSub(t,s){ return !!(t&&s&&(s.personId===session||(typeof isColab==='function'&&!isColab()))); }
const GCAL_CBTN=(kind,a,b)=>`<button class="ag-cbtn" title="Cambiar color" onpointerdown="event.stopPropagation()" onclick="event.preventDefault();event.stopPropagation();gcalColorMenu(event,'${kind}','${gcalEsc(a)}'${b?`,'${gcalEsc(b)}'`:''})">🎨</button>`;
function gcalColorClose(){ const m=document.getElementById('gc-colors'); if(m) m.remove(); document.removeEventListener('pointerdown',gcalColorOutside,true); }
function gcalColorOutside(ev){ if(!ev.target.closest('#gc-colors')) gcalColorClose(); }
function gcalColorMenu(ev,kind,a,b){
  ev.preventDefault(); ev.stopPropagation(); gcalColorClose();
  let title='', cur='', sw='';
  if(kind==='g'){
    const e=(gcal.events||[]).find(x=>x.id===a); if(!e) return;
    if(!gcalCanMove(e)){ alert('Este evento es de otra persona: solo su organizador puede cambiarle el color en Google.'); return; }
    title=e.summary||'(Sin título)'; cur=e.colorId||'';
    sw=Object.keys(GCAL_COLORS).map(k=>`<button class="gcc-sw${cur===k?' on':''}" style="--c:${GCAL_COLORS[k][0]}" title="${GCAL_COLORS[k][1]}" onclick="gcalColorPick('g','${gcalEsc(a)}','','${k}')"></button>`).join('')
      +`<button class="gcc-def${cur?'':' on'}" onclick="gcalColorPick('g','${gcalEsc(a)}','','')">Color del calendario</button>`;
  } else {
    const t=store.task(a), s=t&&(t.subtasks||[]).find(x=>x.id===b); if(!s) return;
    if(!gcalCanColorSub(t,s)){ alert('Solo puedes cambiar el color de tus propias actividades.'); return; }
    title=s.name||'(Sin nombre)'; cur=s.color&&SUBCOL[s.color]?s.color:'';
    sw=Object.keys(SUBCOL).map(k=>`<button class="gcc-sw${cur===k?' on':''}" style="--c:${SUBCOL[k][0]}" title="${gcalEsc(SUBCOL[k][1])}" onclick="gcalColorPick('p','${gcalEsc(a)}','${gcalEsc(b)}','${k}')"></button>`).join('')
      +`<button class="gcc-def${cur?'':' on'}" onclick="gcalColorPick('p','${gcalEsc(a)}','${gcalEsc(b)}','')">Automático (según el tipo)</button>`;
  }
  const m=document.createElement('div'); m.id='gc-colors';
  m.innerHTML=`<div class="gcc-h">${kind==='g'?'Color en Google':'Color de la actividad'}</div><div class="gcc-t">${gcalEsc(title)}</div><div class="gcc-sws">${sw}</div>`;
  document.body.appendChild(m);
  const W=m.offsetWidth, H=m.offsetHeight; m.style.left=Math.max(8,Math.min(ev.clientX,innerWidth-W-8))+'px'; m.style.top=Math.max(8,Math.min(ev.clientY+6,innerHeight-H-8))+'px';
  setTimeout(()=>document.addEventListener('pointerdown',gcalColorOutside,true),0);
}
document.addEventListener('keydown',ev=>{ if(ev.key==='Escape'&&document.getElementById('gc-colors')){ ev.stopPropagation(); gcalColorClose(); } },true);
function gcalColorPick(kind,a,b,k){
  gcalColorClose();
  if(kind==='p'){
    const t=store.task(a), s=t&&(t.subtasks||[]).find(x=>x.id===b); if(!s||!gcalCanColorSub(t,s)) return;
    store.updateSubtask(a,b,{color:k}); if(typeof logEvent==='function') logEvent(a,'Cambió el color de «'+s.name+'» a '+(k?SUBCOL[k][1]:'automático'));
    render(); return;   // el cambio llega a Google solo (gcalPushSoon)
  }
  const e=(gcal.events||[]).find(x=>x.id===a); if(!e) return;
  if(!gcalCanWrite()){ alert('Para cambiar colores en tu Google Calendar falta un permiso.\n\nUsa «Dar permiso» en tu calendario de Agenda.'); return; }
  const prev=e.colorId; if(k) e.colorId=k; else delete e.colorId; e._saving=true; render();
  gcalWithToken(async()=>{
    try{
      try{ await gcalFetch(GCAL_API+'/'+encodeURIComponent(e.id),{method:'PATCH',body:JSON.stringify({colorId:k||null})}); }
      catch(x){ if(x.kind==='exp') gcalExpired(); if(x.kind==='scope'){ gcal.scope=''; gcalStore(); } throw x; }
      delete e._saving; gcal.push={running:false,ok:true,at:Date.now(),msg:'✓ Color de «'+(e.summary||'Evento')+'» cambiado a '+(k?GCAL_COLORS[k][1]:'el del calendario')+' en tu Google Calendar'};
    }catch(err){ if(prev) e.colorId=prev; else delete e.colorId; delete e._saving; alert(err.message||'No se pudo cambiar el color en Google.'); }
    gcalRefreshUI();
  });
}

/* ================== Google Meet ==================
   - En una cita con cliente (pestaña Sesión de la subtarea), «Generar enlace de Google Meet» crea la videollamada
     en TU Google Calendar y guarda el enlace en la cita; el cliente lo ve en su página de la sesión.
     Si la actividad ya está en tu Google (porque es tuya), se le agrega el Meet a ese mismo evento; si no es tuya,
     se crea un evento aparte para la llamada (marcado nuwekMeet, el envío automático no lo toca).
   - En el calendario de Agenda, los eventos y actividades con videollamada muestran «🎥 Unirse». */
function gcalMeetOf(e){ if(!e) return ''; if(/^https:\/\//.test(e.hangoutLink||'')) return e.hangoutLink;
  const v=e.conferenceData&&(e.conferenceData.entryPoints||[]).find(p=>p.entryPointType==='video'); return v&&/^https:\/\//.test(v.uri||'')?v.uri:''; }
/* enlace de videollamada de una actividad del portal (de la cita principal si está unida) */
function gcalSubMeet(s){ if(typeof sesOf!=='function'||!s) return ''; const l=sesOf(s).lugar||{}; return l.tipo!=='presencial'&&/^https:\/\//.test(l.link||'')?l.link:''; }
const GCAL_JOIN_MINI=url=>`<a class="ag-join" href="${gcalEsc(url)}" target="_blank" rel="noopener" onpointerdown="event.stopPropagation()" onclick="event.stopPropagation()" title="Entrar a la videollamada">🎥</a>`;
const GCAL_JOIN=url=>`<a class="gc-join" href="${gcalEsc(url)}" target="_blank" rel="noopener" onpointerdown="event.stopPropagation()" onclick="event.stopPropagation()" title="Entrar a la videollamada">🎥 Unirse</a>`;
let gcalMeetMsg={sid:'',text:'',bad:false};   // el aviso del botón sobrevive a que la ventana se redibuje
function gcalMeetBtnHtml(tid,sid){
  return `<button type="button" class="btn ghost sm gc-meet-btn" style="margin-top:6px" onclick="gcalMakeMeet('${gcalEsc(tid)}','${gcalEsc(sid)}')"><svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" style="vertical-align:-3px"><rect x="2" y="6" width="13" height="12" rx="2.5" fill="#00AC47"/><path d="M15 10.2l5.2-3.4c.4-.3.8 0 .8.4v9.6c0 .4-.4.7-.8.4L15 13.8z" fill="#00832D"/><path d="M2 8.5A2.5 2.5 0 0 1 4.5 6H8v4H2z" fill="#4285F4"/><path d="M2 14h6v4H4.5A2.5 2.5 0 0 1 2 15.5z" fill="#FFBA00"/></svg> Generar enlace de Google Meet</button><div class="hint" id="gc-meet-hint"${gcalMeetMsg.sid===sid&&gcalMeetMsg.bad?' style="color:#b3261e"':''}>${gcalMeetMsg.sid===sid?gcalEsc(gcalMeetMsg.text):'Crea la videollamada en tu Google Calendar y pone aquí el enlace.'}</div>`;
}
async function gcalMakeMeet(tid,sid){
  const t=store.task(tid), s=t&&(t.subtasks||[]).find(x=>x.id===sid); if(!s) return;
  const btn=document.querySelector('.gc-meet-btn');
  /* se busca el aviso cada vez: al guardar la cita la ventana se redibuja y el elemento cambia */
  const say=(m,bad)=>{ gcalMeetMsg={sid,text:m,bad:!!bad}; const hint=document.getElementById('gc-meet-hint'); if(hint){ hint.textContent=m; hint.style.color=bad?'#b3261e':''; } };
  if(!gcal.linked&&!gcalConnected()){ say('Primero conecta tu Google Calendar (Mi espacio → Agenda) y vuelve a intentarlo.',true); return; }
  /* fecha, hora y duración: lo que está escrito en la ventana (aunque aún no se guarde) o lo de la subtarea */
  const date=val('sm-date')||s.date, time=val('sm-time')||s.time, dur=+(val('sm-dur')||s.durMin)||60;
  if(!date||!time){ say('Ponle fecha y hora a la cita para crear la videollamada.',true); return; }
  gcalWithToken(async()=>{
    if(!gcalCanWrite()){ say('Falta el permiso para crear eventos: en tu calendario de Agenda presiona «Dar permiso».',true); return; }
    if(btn) btn.disabled=true; say('Creando la videollamada en tu Google Calendar…');
    try{
      const tz=(Intl.DateTimeFormat().resolvedOptions().timeZone)||'America/Mexico_City';
      const st=new Date(date+'T'+time+':00'), en=new Date(st.getTime()+dur*60000);
      const when={start:{dateTime:date+'T'+time+':00',timeZone:tz},end:{dateTime:gcalLocalISO(en)+'T'+gcalHM(en)+':00',timeZone:tz}};
      const conf={createRequest:{requestId:'nw-'+sid+'-'+Date.now(),conferenceSolutionKey:{type:'hangoutsMeet'}}};
      const mine=gcalMyActs().find(a=>a.key===sid);
      /* ¿ya hay un evento de esta actividad en tu Google? (el que mandó el portal o uno de Meet creado antes) */
      const find=async prop=>{ const d=await gcalFetch(GCAL_API+'?'+new URLSearchParams({privateExtendedProperty:prop,singleEvents:'true',maxResults:'5'})); return (d&&d.items||[]).find(x=>x.status!=='cancelled'); };
      let ev=await find('sid='+sid)||await find('nuwekMeet='+sid);
      let link=gcalMeetOf(ev);
      if(!link){
        if(ev) ev=await gcalFetch(GCAL_API+'/'+encodeURIComponent(ev.id)+'?conferenceDataVersion=1',{method:'PATCH',body:JSON.stringify({conferenceData:conf})});
        else if(mine) ev=await gcalFetch(GCAL_API+'?conferenceDataVersion=1',{method:'POST',body:JSON.stringify(Object.assign(gcalActBody(mine),{conferenceData:conf}))});
        else { const p=store.project(t.projectId), c=p&&store.client(p.clientId);
          ev=await gcalFetch(GCAL_API+'?conferenceDataVersion=1',{method:'POST',body:JSON.stringify(Object.assign({summary:s.name||'Reunión',description:(c?c.name+' · ':'')+(p?p.name:'')+'\nTarea: '+t.name,conferenceData:conf,extendedProperties:{private:{nuwekMeet:sid,tid}}},when))}); }
        link=gcalMeetOf(ev);
        /* Google a veces tarda un momento en tener lista la sala */
        for(let i=0;!link&&ev&&ev.id&&i<4;i++){ await new Promise(z=>setTimeout(z,1200)); ev=await gcalFetch(GCAL_API+'/'+encodeURIComponent(ev.id)); link=gcalMeetOf(ev); }
      }
      if(!link) throw Object.assign(new Error('Google no regresó el enlace de Meet. Intenta de nuevo en un momento.'),{kind:'http'});
      /* se guarda en la cita (la principal si está unida) y se pone en el campo de la ventana */
      const R=typeof citaRoot==='function'?citaRoot(t,s):{t,s};
      const ses=Object.assign({},R.s.sesion||{}); ses.lugar=Object.assign({tipo:'meet',link:'',direccion:''},ses.lugar||{},{tipo:'meet',link});
      store.updateSubtask(R.t.id,R.s.id,{sesion:ses}); if(typeof logEvent==='function') logEvent(R.t.id,'Generó la videollamada de Google Meet de «'+R.s.name+'»');
      const inp=document.getElementById('sm-llink'), tipo=document.getElementById('sm-ltipo'); if(inp) inp.value=link; if(tipo){ tipo.value='meet'; if(typeof smLugarChange==='function') smLugarChange(); }
      say('✓ Listo: el enlace ya está en la cita y en tu Google Calendar.'); gcalLoad(true);
    }catch(e){ if(e.kind==='exp') gcalExpired(); if(e.kind==='scope'){ gcal.scope=''; gcalStore(); } say(e.message||'No se pudo crear la videollamada.',true); }
    if(btn) btn.disabled=false;
  });
}

/* ================== Portal del cliente → Citas ==================
   El contacto del cliente ve sus citas en un calendario (Semana con ‹ › y Próximos), con «🎥 Unirse» cuando
   la cita tiene videollamada. Puede conectar SU Google Calendar: sus citas se agregan solas a su calendario
   (con el enlace de Meet) y ve ahí mismo sus otros eventos de Google. No mueve citas desde aquí: para cambiar
   la fecha usa «Ver cita» (confirmar / pedir reprogramar), igual que siempre. */
let gcCliWeek=null, gcCliView='sem';
function gcalCliSet(v){ gcCliView=v; render(); }
function gcalCliShift(n){ gcCliWeek=addDaysISO(gcCliWeek||mondayOf(todayISO()),n); render(); }
function gcalCliToday(){ gcCliWeek=mondayOf(todayISO()); render(); }
/* citas del contacto: las de su empresa si es administrador; si no, solo donde está invitado */
function gcalCliCitas(){
  let ctx=null; try{ ctx=typeof cpCtx==='function'?cpCtx():null; }catch(_){ return []; } if(!ctx) return [];
  return citasAll().filter(x=>x.c.id===ctx.c.id&&(ctx.isAdmin||(x.s.invitados||[]).includes(ctx.me.id))&&x.s.date&&x.est.k!=='cancelado');
}
function gcalClientActs(){
  const t0=new Date(); t0.setHours(0,0,0,0); const from=gcalLocalISO(t0); const lim=new Date(t0); lim.setDate(lim.getDate()+GCAL_PUSH_DAYS); const to=gcalLocalISO(lim);
  return gcalCliCitas().filter(x=>x.s.date>=from&&x.s.date<=to).map(x=>({kind:'cita',key:x.s.id,s:x.s,t:x.t,p:x.p,c:x.c}));
}
function gcalCitaBody(a){
  const tz=(Intl.DateTimeFormat().resolvedOptions().timeZone)||'America/Mexico_City';
  const ses=typeof sesOf==='function'?sesOf(a.s):{objetivo:'',lugar:{}}; const meet=gcalSubMeet(a.s);
  const dir=ses.lugar&&ses.lugar.tipo==='presencial'?(ses.lugar.direccion||''):'';
  const desc=['Cita con Nuwek · '+a.p.name, ses.objetivo?'Objetivo: '+ses.objetivo:'', meet?'Videollamada: '+meet:'', dir?'Lugar: '+dir:''].filter(Boolean).join('\n');
  let when;
  if(a.s.time){ const st=new Date(a.s.date+'T'+a.s.time+':00'); const en=new Date(st.getTime()+Math.max(+a.s.durMin||60,15)*60000);
    when={start:{dateTime:a.s.date+'T'+a.s.time+':00',timeZone:tz},end:{dateTime:gcalLocalISO(en)+'T'+gcalHM(en)+':00',timeZone:tz}}; }
  else { const n=new Date(a.s.date+'T00:00:00'); n.setDate(n.getDate()+1); when={start:{date:a.s.date},end:{date:gcalLocalISO(n)}}; }
  return Object.assign({summary:'Nuwek · '+(a.s.name||'Cita'),description:desc,location:meet||dir||undefined,colorId:'7',extendedProperties:{private:{nuwek:'1',sid:a.key,tid:a.t.id}}},when);
}
function gcalCitaEv(x){
  const st=x.est, meet=gcalSubMeet(x.s), dur=x.s.time?fmtDurShort(+x.s.durMin||60):'';
  return `<a class="gcw-ev pt" style="border-left-color:${st.c}" onclick="openCpSesion('${x.t.id}','${x.s.id}')" title="${gcalEsc(x.s.name+' · '+st.t)}"><div class="gcw-t"><b>${x.s.time||'Todo el día'}</b>${dur?`<span>${dur}</span>`:''}</div><div class="gcw-x"><div class="gcw-nm">${gcalEsc(x.s.name)}</div><span class="gcw-where"><i class="gcw-dot" style="background:${st.c}"></i>${gcalEsc(st.t+' · '+x.p.name)}</span>${meet?GCAL_JOIN(meet):''}</div></a>`;
}
function gcalClientCitas(ctx){
  if(!ctx) return '';
  const on=gcalConnected(); if(on) gcalLoad(false);
  if(on&&gcalCanWrite()&&!(gcal.push&&gcal.push.running)&&Date.now()-(gcal.autoAt||0)>10*60000){ gcal.autoAt=Date.now(); setTimeout(()=>{ gcalPushMine().then(()=>gcalLoad(true)); },0); }
  const auth=gcal.cal?'?authuser='+encodeURIComponent(gcal.cal):'';
  let pill, right;
  if(on){ pill=`<span class="gcw-pill">Google conectado</span>${gcal.cal?`<span class="gcw-acc">${gcalEsc(gcal.cal)}</span>`:''}`;
    right=`<button class="gcw-sync${gcal.loading||(gcal.push&&gcal.push.running)?' spin':''}" onclick="gcalSyncNow()" title="Agrega tus citas a tu Google Calendar y trae tus eventos">${GCAL_IC.sync} Sincronizar</button><span class="gcw-sep"></span><button class="gcw-off" onclick="gcalDisconnect()">Desconectar</button><a class="gcw-main" href="https://calendar.google.com/calendar/r${auth}" target="_blank" rel="noopener">${GCAL_IC.cal} Abrir Google Calendar</a>`; }
  else if(gcalNeedsReconnect()){ pill=`<span class="gcw-pill warn">Google vinculado</span>`; right=`<button class="gcw-off" onclick="gcalDisconnect()">Desconectar</button><button class="gcw-main" onclick="gcalConnect()">${GCAL_IC.sync} Reconectar Google</button>`; }
  else { pill=`<span class="gcw-pill off">Google sin conectar</span><span class="gcw-note">Conéctalo y tus citas con Nuwek aparecen solas en tu Google Calendar</span>`; right=`<button class="gcw-main" onclick="gcalConnect()">${GCAL_IC.cal} Conectar Google Calendar</button>`; }
  const head=`<div class="gcw-h">${GCAL_LOGO}<span class="gcw-ttl">Mis citas</span>${pill}<span class="gcw-r">${right}</span></div>`;
  const err=gcal.err?`<div class="gc-err gcw-err">${gcalEsc(gcal.err)}</div>`:'';
  const note=on&&!gcalCanWrite()?`<div class="gcw-push warn">Para agregar tus citas a tu Google Calendar falta un permiso. <button onclick="gcalGrantWrite()">Dar permiso</button></div>`
    :gcal.push&&gcal.push.msg?`<div class="gcw-push${gcal.push.ok?' ok':''}">${gcalEsc(String(gcal.push.msg).replace('Tus actividades','Tus citas').replace('tus actividades','tus citas'))}</div>`:'';
  const wk=gcCliWeek||mondayOf(todayISO()), days=[0,1,2,3,4,5,6].map(i=>addDaysISO(wk,i));
  const tab=(k,l)=>`<button class="${gcCliView===k?'on':''}" onclick="gcalCliSet('${k}')">${l}</button>`;
  const nav=gcCliView==='sem'?`<div class="kb-month"><button onclick="gcalCliShift(-7)" title="Semana anterior">‹</button><span class="kb-month-lbl">${dLabel(days[0])} – ${dLabel(days[6])}</span><button onclick="gcalCliShift(7)" title="Semana siguiente">›</button></div><button class="btn ghost sm" onclick="gcalCliToday()">Hoy</button>`:'';
  const bar=`<div class="gcw-bar gc-cli-bar"><div class="gcw-seg">${tab('sem','Semana')}${tab('prox','Próximas')}</div>${nav}</div>`;
  const citas=gcalCliCitas(), goog=on?gcalOwnGoogle():[];
  const list=iso=>{ const L=[]; citas.filter(x=>x.s.date===iso).forEach(x=>L.push({k:x.s.time||'',h:gcalCitaEv(x)})); goog.filter(e=>gcalDayKey(gcalStart(e))===iso).forEach(e=>L.push({k:e.start.dateTime?gcalHM(gcalStart(e)):'',h:gcalEv(e,false)})); return L.sort((a,b)=>a.k<b.k?-1:a.k>b.k?1:0); };
  const card=(iso,max)=>{ const d=new Date(iso+'T00:00:00'), h=gcalDayHead(d), L=list(iso), more=L.length-max;
    return `<div class="gcw-day${h.today?' today':''}"><div class="gcw-dh"><span>${h.lb}</span>${h.dt&&!h.today?`<em>${h.dt}</em>`:''}</div>${L.length?L.slice(0,max).map(x=>x.h).join(''):'<div class="gcw-none">Sin citas</div>'}${more>0?`<div class="gcw-more">+${more} más</div>`:''}</div>`; };
  let body;
  if(gcCliView==='prox'){ const td=todayISO(), ks=new Set(); citas.forEach(x=>{ if(x.s.date>=td) ks.add(x.s.date); }); goog.forEach(e=>{ const k=gcalDayKey(gcalStart(e)); if(k>=td) ks.add(k); });
    const arr=[...ks].sort().slice(0,3); body=arr.length?`<div class="gcw-days">${arr.map(k=>card(k,6)).join('')}</div>`:`<div class="gcw-msg">No tienes citas próximas.</div>`; }
  else body=`<div class="gcw-days gc-cli-week">${days.map(d=>card(d,6)).join('')}</div>`;
  return `<div class="gcw gc-cli">${head}${err}${note}${bar}${body}</div>`;
}
