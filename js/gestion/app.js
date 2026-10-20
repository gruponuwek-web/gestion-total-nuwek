var lastLocalWrite=0;   // marca de la última escritura local (la sincronización no la pisa)
/* ================== SEED / STORE ================== */
const DV = 5;
function iso(y,m,d){return new Date(y,m-1,d).toISOString().split('T')[0];}
function todayISO(){ const d=new Date(); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }

const FRENTE_PALETTE = ['#223c36','#3f7d6e','#C0553B','#4a6fa5','#8a6d3b','#6b8e23','#9c5a8a','#2c8ca0'];

let _uidSeq=0;
function uid(pfx){ _uidSeq++; return pfx+Date.now().toString(36)+_uidSeq.toString(36); }
const DUR_OPTS=[15,30,45,60,90,120,180,240];
function fmtDurShort(m){ m=+m||0; if(m<60) return m+' min'; const h=Math.floor(m/60), r=m%60; return h+'h'+(r?' '+r:''); }
function durOptsEl(sel){ return DUR_OPTS.map(m=>`<option value="${m}" ${m===(+sel)?'selected':''}>${fmtDurShort(m)}</option>`).join(''); }
class Store{
  constructor(){ this.load(); }
  load(){
    let s=null; try{ s = localStorage.getItem('nuwekPortal'); }catch(_){}
    if(s){ try{ const p=JSON.parse(s); if(p.v===DV){ this.d=p; this.normalize(); return; } }catch(_){} }
    this.d = this.seed(); this.normalize(); this.save();
  }
  normalize(){
    if(this.d.tags && this.d.tags.length && typeof this.d.tags[0]==='string') this.d.tags=this.d.tags.map(t=>({name:t,color:'#8a9a93'}));
    (this.d.staff||[]).forEach(u=>{ if(u.active===undefined) u.active=true;
      const D=(k,v)=>{ if(u[k]===undefined) u[k]=v; };
      D('team','');D('tipo','Interno');D('joinDate','');D('gmail','');D('emailWork','');
      D('phonePersonal','');D('phoneWork','');D('birthday','');D('city','');D('password','');
      D('rfc','');D('curp','');D('nss','');D('salaryMonthly',0);D('skills','');D('photo','');D('perm','colab');
      if(u.firstName===undefined) u.firstName=u.name||'';
      if(u.secondName===undefined) u.secondName='';
      if(u.lastName===undefined) u.lastName='';
      u.name=u.firstName||u.name||'';
      if(!u.health) u.health={blood:'',allergies:'',conditions:'',diet:'',emName:'',emRel:'',emPhone:''};
      if(!u.computer) u.computer={model:'',serial:'',assignedDate:'',accessories:'',status:'',licenses:''};
    });
    (this.d.services||[]).forEach(sv=>{ if(sv.frentes && sv.frentes.length && typeof sv.frentes[0]==='string') sv.frentes=sv.frentes.map((n,i)=>({name:n,color:FRENTE_PALETTE[i%FRENTE_PALETTE.length]})); if(!sv.subLinks) sv.subLinks=[]; });
    if(!this.d._subLinksSeeded){ const mkt=this.d.services.find(s=>s.id==='sv_mkt'); if(mkt && (!mkt.subLinks||mkt.subLinks.length===0)) mkt.subLinks=['Planeación / Copys','Material terminado']; this.d._subLinksSeeded=true; }
    (this.d.projects||[]).forEach(p=>{ if(!(this.d.payments||[]).some(x=>x.projectId===p.id)) this.d.payments=(this.d.payments||[]).concat(this._genPayments(p)); });
    // reparar ids de tareas/subtareas duplicados (colisiones antiguas por Date.now())
    const seenT={}; (this.d.tasks||[]).forEach(t=>{ if(seenT[t.id]||!t.id) t.id=uid('t_'); seenT[t.id]=1; const seenS={}; (t.subtasks||[]).forEach(s=>{ if(seenS[s.id]||!s.id) s.id=uid('s_'); seenS[s.id]=1;
      if(s.links && !Array.isArray(s.links)) s.links=Object.entries(s.links).filter(e=>e[1]).map(e=>({title:e[0],url:e[1]}));
      if(!Array.isArray(s.links)) s.links=[]; if(s.done && !s.doneAt) s.doneAt='2020-01-01T00:00:00.000Z'; });
      if(!Array.isArray(t.links)){ const col=[]; (t.subtasks||[]).forEach(s=>(s.links||[]).forEach(l=>{ if(l.url) col.push({title:l.title||'',url:l.url}); })); t.links=col; }
    });
    if(!this.d.log){ this.d.log=[]; (this.d.tasks||[]).forEach(t=>(t.subtasks||[]).forEach(s=>{ if(s.done) this.d.log.push({id:uid('lg_'),ts:s.doneAt||new Date().toISOString(),userId:s.personId,taskId:t.id,action:'Completó la subtarea «'+s.name+'»'+(s.timeSpent?' ('+fmtTime(s.timeSpent)+')':'')}); })); }
    if(!this.d.settings) this.d.settings={};
    (this.d.projects||[]).forEach(p=>{ if(!Array.isArray(p.links)) p.links=[]; if(!Array.isArray(p.scorecards)) p.scorecards=[]; });
    (this.d.services||[]).forEach(s=>{ if(s.listPrice==null) s.listPrice=0; if(s.opCost==null) s.opCost=0; });
    this.save();
  }
  /* La copia en el navegador es solo un respaldo rápido (la verdad está en Supabase). Si ya no cabe (límite ~5 MB), se guarda una versión ligera o se omite: nunca debe tumbar el portal. */
  save(){ lastLocalWrite=Date.now(); this.d.v=DV;
    try{ localStorage.setItem('nuwekPortal', JSON.stringify(this.d)); return; }catch(_){}
    try{ const lite=Object.assign({},this.d,{log:[],comments:(this.d.comments||[]).map(c=>Object.assign({},c,{attachments:(c.attachments||[]).map(a=>({name:a.name,type:a.type}))}))}); localStorage.setItem('nuwekPortal', JSON.stringify(lite)); return; }catch(_){}
    try{ localStorage.removeItem('nuwekPortal'); }catch(_){} }
  setSetting(k,v){ this.d.settings=this.d.settings||{}; if(v===null||v===undefined||v==='') delete this.d.settings[k]; else this.d.settings[k]=v; this.save(); }

  seed(){
    const y=2026;
    // Personal Nuwek (con tarifa/hora)
    const P='112233';
    const staff=[
      {id:'u_car',type:'nuwek',name:'Carlos',firstName:'Carlos',secondName:'',lastName:'',role:'PM / Líder técnico',perm:'gerencia',rate:600,color:'#223c36',team:'Directivo',tipo:'Interno',password:P,active:true},
      {id:'u_est',type:'nuwek',name:'Estrella',firstName:'Estrella',secondName:'',lastName:'',role:'Dirección',perm:'gerencia',rate:600,color:'#9c5a8a',team:'Directivo',tipo:'Interno',password:P,active:true},
      {id:'u_ger',type:'nuwek',name:'Gerardo',firstName:'Gerardo',secondName:'',lastName:'',role:'Project Manager',perm:'pm',rate:400,color:'#C0553B',team:'Consulting',tipo:'Interno',password:P,active:true},
      {id:'u_mic',type:'nuwek',name:'Michell',firstName:'Michell',secondName:'',lastName:'',role:'Project Manager',perm:'pm',rate:400,color:'#3f7d6e',team:'Marketing',tipo:'Interno',password:P,active:true},
      {id:'u_jai',type:'nuwek',name:'Jaime',firstName:'Jaime',secondName:'',lastName:'',role:'Project Manager',perm:'pm',rate:400,color:'#4a6fa5',team:'Sales',tipo:'Interno',password:P,active:true},
      {id:'u_dan',type:'nuwek',name:'Daniel',firstName:'Daniel',secondName:'',lastName:'',role:'Colaborador',perm:'colab',rate:260,color:'#b8873b',team:'Marketing',tipo:'Interno',password:P,active:true},
      {id:'u_eva',type:'nuwek',name:'Eva',firstName:'Eva',secondName:'',lastName:'',role:'Colaborador',perm:'colab',rate:260,color:'#6a8f3c',team:'Consulting',tipo:'Interno',password:P,active:true},
      {id:'u_ala',type:'nuwek',name:'Alaide',firstName:'Alaide',secondName:'',lastName:'',role:'Colaborador',perm:'colab',rate:260,color:'#a4506b',team:'Marketing',tipo:'Interno',password:P,active:true},
      {id:'u_gui',type:'nuwek',name:'Guillermo',firstName:'Guillermo',secondName:'',lastName:'',role:'Colaborador',perm:'colab',rate:260,color:'#3b7d8a',team:'Sales',tipo:'Interno',password:P,active:true},
      {id:'u_san',type:'nuwek',name:'Santiago',firstName:'Santiago',secondName:'',lastName:'',role:'Colaborador',perm:'colab',rate:260,color:'#7a5aa0',team:'Apoyo',tipo:'Interno',password:P,active:true},
    ];
    // Clientes (con su gente)
    const clients=[
      {id:'c_adn',name:'ADN Media',rfc:'ADN200101AA1',razon:'ADN Media SA de CV',location:'Pachuca, Hgo',web:'adnmedia.mx',ig:'@adnmedia',generalResponsibleId:'u_est',
        people:[
          {id:'p_hugo',type:'cliente',name:'Hugo',phone:'771-000-0001',email:'hugo@adnmedia.mx',role:'Coord. Marketing',bossId:null,birthday:'03-14'},
          {id:'p_david',type:'cliente',name:'David',phone:'771-000-0002',email:'david@adnmedia.mx',role:'Coord. Comercial',bossId:null,birthday:'09-02'},
        ]},
      {id:'c_poc',name:'Papel Oro del Centro',rfc:'POC190505BB2',razon:'Papel Oro del Centro SA',location:'CDMX',web:'papeloro.mx',ig:'@papelorodelcentro',generalResponsibleId:'u_car',
        people:[
          {id:'p_eli',type:'cliente',name:'Lic. Elizabeth',phone:'55-000-0003',email:'eli@papeloro.mx',role:'Dirección',bossId:null,birthday:'12-20'},
        ]},
    ];
    // Servicios = plantilla (frentes + tareas base)
    const services=[
      {id:'sv_mkt',name:'Marketing',frentes:['Onboarding','Estrategia Digital','Levantamientos','Implementación','Lanzamiento','Medición y Reportes','Admon y Finanzas','Revisiones'],
        tasks:[['Onboarding','Kit de bienvenida'],['Estrategia Digital','Estrategia y guía de estilo'],['Levantamientos','Parrilla de contenidos'],['Implementación','Landing + CRM'],['Lanzamiento','Lanzamiento + tableros KPI'],['Medición y Reportes','Reporte mensual'],['Admon y Finanzas','Contrato y facturación']]},
      {id:'sv_eva',name:'EVA+',frentes:['Onboarding','Setteo comercial','Nutrición','Cierre','Admon y Finanzas'],
        tasks:[['Onboarding','Arranque comercial'],['Setteo comercial','Config. de pipeline'],['Nutrición','Secuencias de seguimiento']]},
      {id:'sv_sb',name:'Selling Blocks',frentes:['Diagnóstico','Estructura','Capacitación','Admon y Finanzas'],
        tasks:[['Diagnóstico','Diagnóstico comercial'],['Estructura','Estructura organizacional']]},
    ];
    const tags=[{name:'Alta',color:'#C0553B'},{name:'Media',color:'#E0A93B'},{name:'Baja',color:'#5a7d6f'},{name:'Revisión-cliente',color:'#4a6fa5'},{name:'En-proceso',color:'#3f7d6e'}];

    // ---- Proyecto estrella: ADN Media · Marketing ----
    const frMk = {}; // name->id
    const frentes=[]; let fi=0;
    services[0].frentes.forEach((n)=>{ const id='fr_'+(++fi); frMk[n]=id; frentes.push({id,projectId:'pr_mkt',name:n,color:FRENTE_PALETTE[(fi-1)%FRENTE_PALETTE.length],order:fi}); });
    const etapas=[
      {id:'et_1',projectId:'pr_mkt',name:'Etapa 1',start:iso(y,5,1),end:iso(y,7,31),order:1},
      {id:'et_2',projectId:'pr_mkt',name:'Etapa 2',start:iso(y,8,1),end:iso(y,10,31),order:2},
      {id:'et_3',projectId:'pr_mkt',name:'Etapa 3',start:iso(y,11,1),end:iso(y+1,1,31),order:3},
    ];
    const projects=[
      {id:'pr_mkt',clientId:'c_adn',serviceId:'sv_mkt',name:'Marketing',price:162500,monthlyPay:27083,months:6,paymentDay:5,startDate:iso(y,5,1),endDate:iso(y+1,1,31),status:'active',
        links:[{id:'lk_a',label:'Drive del cliente',url:'https://drive.google.com'},{id:'lk_b',label:'Brand kit',url:'https://www.figma.com'},{id:'lk_c',label:'Parrilla de contenidos',url:'https://docs.google.com/spreadsheets'}],
        alcances:[{item:'Reels',qty:4,period:'mes'},{item:'Carruseles',qty:8,period:'mes'},{item:'Reporte KPIs',qty:1,period:'mes'}]},
      {id:'pr_eva',clientId:'c_adn',serviceId:'sv_eva',name:'EVA+',price:90000,monthlyPay:22500,months:4,paymentDay:10,startDate:iso(y,6,1),endDate:iso(y,9,30),status:'active',alcances:[{item:'Leads gestionados',qty:100,period:'mes'}]},
      {id:'pr_sb',clientId:'c_poc',serviceId:'sv_sb',name:'Selling Blocks',price:120000,monthlyPay:40000,months:3,paymentDay:1,startDate:iso(y,5,15),endDate:iso(y,8,15),status:'active',alcances:[{item:'Sesiones',qty:8,period:'proyecto'}]},
    ];
    // pagos (cobranza)
    const payments=[];
    for(let m=0;m<6;m++){ const dd=iso(y,5+m,5); payments.push({id:'pay_'+m,projectId:'pr_mkt',dueDate:dd,amount:27083,paid:m<2,paidDate:m<2?dd:null}); }
    projects.filter(p=>p.id!=='pr_mkt').forEach(p=>{ payments.push(...this._genPayments(p)); });

    // Tareas del proyecto Marketing (con subtareas: persona, fecha, tiempo, etapa deducida por fecha, invitados)
    const tasks=[
      {id:'t1',projectId:'pr_mkt',frenteId:frMk['Onboarding'],name:'Kit de bienvenida',subtitle:'ADN Media',description:'Arranque operativo y accesos.',tags:['Alta'],workLink:'',deliverables:[],responsibleId:'u_car',status:'done',dueDate:iso(y,5,10),viaticos:0,
        subtasks:[
          {id:'s1',name:'Brief interno',done:true,personId:'u_car',invitados:[],date:iso(y,5,6),time:'10:00',timeSpent:60},
          {id:'s2',name:'Creación de grupo y carpeta',done:true,personId:'u_mic',invitados:[],date:iso(y,5,8),time:'12:00',timeSpent:40},
        ]},
      {id:'t2',projectId:'pr_mkt',frenteId:frMk['Estrategia Digital'],name:'Estrategia y guía de estilo',subtitle:'ADN Media',description:'Planeación y directriz visual.',tags:['Alta','Revisión-cliente'],workLink:'',deliverables:[],responsibleId:'u_est',status:'in-progress',dueDate:iso(y,6,20),viaticos:0,
        subtasks:[
          {id:'s3',name:'Moodboard',done:true,personId:'u_ger',invitados:[],date:iso(y,6,5),time:'11:00',timeSpent:120},
          {id:'s4',name:'Plan de comunicación',done:true,personId:'u_mic',invitados:[],date:iso(y,6,12),time:'10:00',timeSpent:90},
          {id:'s5',name:'Validación con el cliente',done:false,personId:'p_hugo',invitados:['p_david'],date:iso(y,6,18),time:'16:00',timeSpent:0},
        ]},
      {id:'t3',projectId:'pr_mkt',frenteId:frMk['Levantamientos'],name:'Parrilla de contenidos',subtitle:'ADN Media',description:'Producción audiovisual y parrilla.',tags:['Alta'],workLink:'',deliverables:[],responsibleId:'u_mic',status:'in-progress',dueDate:iso(y,7,15),viaticos:850,
        subtasks:[
          {id:'s6',name:'Escaletas',done:true,personId:'u_mic',invitados:[],date:iso(y,7,2),time:'09:00',timeSpent:75},
          {id:'s7',name:'Grabación',done:true,personId:'u_ger',invitados:[],date:iso(y,7,8),time:'09:00',timeSpent:240},
          {id:'s8',name:'Post producción',done:false,personId:'u_ger',invitados:[],date:iso(y,7,20),time:'12:00',timeSpent:0},
        ]},
      {id:'t4',projectId:'pr_mkt',frenteId:frMk['Implementación'],name:'Landing + CRM',subtitle:'ADN Media',description:'Landing y CRM básico Nuwek.',tags:['Media'],workLink:'',deliverables:[],responsibleId:'u_jai',status:'ajuste',dueDate:iso(y,7,10),viaticos:0,
        subtasks:[
          {id:'s9',name:'Desarrollo landing',done:true,personId:'u_jai',invitados:[],date:iso(y,7,4),time:'10:00',timeSpent:180},
          {id:'s10',name:'Validación con el cliente',done:false,personId:'p_hugo',invitados:[],date:iso(y,7,9),time:'11:00',timeSpent:0},
        ]},
      {id:'t5',projectId:'pr_mkt',frenteId:frMk['Admon y Finanzas'],name:'Contrato y facturación',subtitle:'ADN Media',description:'Contrato, factura y cobranza.',tags:['En-proceso'],workLink:'',deliverables:[],responsibleId:'u_car',status:'done',dueDate:iso(y,5,5),viaticos:0,
        subtasks:[
          {id:'s11',name:'Contrato firmado',done:true,personId:'u_car',invitados:['p_david'],date:iso(y,5,3),time:'10:00',timeSpent:45},
        ]},
      {id:'t6',projectId:'pr_mkt',frenteId:frMk['Medición y Reportes'],name:'Reporte mensual',subtitle:'ADN Media',description:'Reportes de KPIs y scorecard.',tags:['Media'],workLink:'',deliverables:[],responsibleId:'u_mic',status:'to-do',dueDate:iso(y,8,30),viaticos:0,
        subtasks:[
          {id:'s12',name:'Scorecard agosto',done:false,personId:'u_mic',invitados:[],date:iso(y,8,28),time:'12:00',timeSpent:0},
        ]},
      {id:'t7',projectId:'pr_mkt',frenteId:frMk['Revisiones'],name:'Estructura organizacional',subtitle:'ADN Media',description:'Entregada; reabierta por madurez.',tags:['Media'],workLink:'',deliverables:[],responsibleId:'u_est',status:'to-do',dueDate:iso(y,11,15),viaticos:0,
        subtasks:[
          {id:'s13',name:'Actualización (madurez)',done:false,personId:'u_est',invitados:['p_hugo'],date:iso(y,11,10),time:'10:00',timeSpent:0},
        ]},
    ];
    const comments=[
      {id:'cm1',taskId:'t2',userId:'u_est',text:'Moodboard aprobado internamente, va a cliente.',ts:new Date(Date.now()-7200000).toISOString()},
      {id:'cm2',taskId:'t3',userId:'u_ger',text:'Grabación lista, subo material a la biblioteca.',ts:new Date(Date.now()-3600000).toISOString()},
    ];
    services.forEach(sv=>{ sv.frentes=sv.frentes.map((n,i)=>({name:n,color:FRENTE_PALETTE[i%FRENTE_PALETTE.length]})); if(!sv.subLinks) sv.subLinks=[]; });
    (services.find(s=>s.id==='sv_mkt')||{}).subLinks=['Planeación / Copys','Material terminado'];
    return {v:DV,staff:[],clients:[],services:[],tags:[],projects:[],frentes:[],etapas:[],tasks:[],comments:[],payments:[]};
  }

  /* getters */
  client(id){return this.d.clients.find(c=>c.id===id);}
  project(id){return this.d.projects.find(p=>p.id===id);}
  service(id){return this.d.services.find(s=>s.id===id);}
  person(id){return this.d.staff.find(u=>u.id===id) || this.d.clients.flatMap(c=>c.people).find(p=>p.id===id) || {name:'—',color:'#999'};}
  projectsOf(cid){return this.d.projects.filter(p=>p.clientId===cid);}
  frentesOf(pid){return this.d.frentes.filter(f=>f.projectId===pid).sort((a,b)=>a.order-b.order);}
  etapasOf(pid){return this.d.etapas.filter(e=>e.projectId===pid).sort((a,b)=>a.order-b.order);}
  tasksOf(pid){return this.d.tasks.filter(t=>t.projectId===pid);}
  task(id){return this.d.tasks.find(t=>t.id===id);}
  commentsOf(tid){return this.d.comments.filter(c=>c.taskId===tid).sort((a,b)=>new Date(a.ts)-new Date(b.ts));}
  paymentsOf(pid){return this.d.payments.filter(p=>p.projectId===pid);}
  _genPayments(p){ const out=[]; if(!p.startDate)return out; const [y,mo]=p.startDate.split('-').map(Number); for(let m=0;m<(p.months||0);m++){ const dt=new Date(y,(mo-1)+m,p.paymentDay||1); const ds=dt.getFullYear()+'-'+String(dt.getMonth()+1).padStart(2,'0')+'-'+String(dt.getDate()).padStart(2,'0'); out.push({id:'pay_'+p.id+'_'+m,projectId:p.id,dueDate:ds,amount:p.monthlyPay||0,paid:false,paidDate:null}); } return out; }
  generatePayments(p){ this.d.payments=this.d.payments.filter(x=>x.projectId!==p.id).concat(this._genPayments(p)); this.save(); if(typeof dbReplacePayments==='function') dbReplacePayments(p.id, this.paymentsOf(p.id)); }
  togglePayment(payId){ const x=this.d.payments.find(p=>p.id===payId); if(x){ x.paid=!x.paid; x.paidDate=x.paid?todayISO():null; x.estado=x.paid?'cobrado':'programado'; x.cobro=x.paid?{monto:+x.amount||0,fecha:todayISO()}:null; if(!x.paid) x.conciliadoFecha=null; this.save(); if(typeof dbSavePayment==='function') dbSavePayment(x); } }
  addPayment(pid,dueDate,amount){ const x={id:'pay_'+pid+'_'+Date.now(),projectId:pid,dueDate,amount:+amount||0,paid:false,paidDate:null}; this.d.payments.push(x); this.save(); if(typeof dbSavePayment==='function') dbSavePayment(x); }
  updatePayment(payId,patch){ const x=this.d.payments.find(p=>p.id===payId); if(x){ if(patch.amount!==undefined)patch.amount=+patch.amount||0; Object.assign(x,patch); this.save(); if(typeof dbSavePayment==='function') dbSavePayment(x); } }
  removePayment(payId){ this.d.payments=this.d.payments.filter(p=>p.id!==payId); this.save(); if(typeof dbDeletePayment==='function') dbDeletePayment(payId); }
  generatePaymentsCustom(pid,freq,count,total,startDate){
    this.d.payments=this.d.payments.filter(x=>x.projectId!==pid);
    const [y,mo,da]=startDate.split('-').map(Number);
    const base=Math.round((total/count)*100)/100; let acc=0;
    for(let i=0;i<count;i++){
      let dt;
      if(freq==='semanal') dt=new Date(y,mo-1,da+7*i);
      else if(freq==='quincenal') dt=new Date(y,mo-1,da+15*i);
      else dt=new Date(y,mo-1+i,da);
      const ds=dt.getFullYear()+'-'+String(dt.getMonth()+1).padStart(2,'0')+'-'+String(dt.getDate()).padStart(2,'0');
      const amt=(i===count-1)?Math.round((total-acc)*100)/100:base; acc+=base;
      this.d.payments.push({id:'pay_'+pid+'_'+i+'_'+Date.now(),projectId:pid,dueDate:ds,amount:amt,paid:false,paidDate:null});
    }
    this.save(); if(typeof dbReplacePayments==='function') dbReplacePayments(pid, this.paymentsOf(pid));
  }

  /* etapa deducida por fecha */
  etapaOfDate(pid,dateStr){ if(!dateStr) return null; return this.etapasOf(pid).find(e=>dateStr>=e.start && dateStr<=e.end)||null; }
  taskTime(t){ return (t.subtasks||[]).reduce((s,x)=>s+(x.timeSpent||0),0); }

  /* mutations */
  addProject(p){ p.id='pr_'+Date.now(); this.d.projects.push(p); this.save(); return p; }
  updateProject(id,patch){ const p=this.project(id); if(p){Object.assign(p,patch); this.save(); if(typeof dbSaveProject==='function') dbSaveProject(p);} }
  linksOf(pid){ const p=this.project(pid); return (p&&p.links)||[]; }
  addLink(pid,label,urls){ const p=this.project(pid); if(!p)return; p.links=p.links||[]; const list=(Array.isArray(urls)?urls:[{title:'',url:urls}]).filter(u=>u&&u.url);
    const ex=p.links.find(l=>(l.label||'').trim().toLowerCase()===(label||'').trim().toLowerCase());
    if(ex){ ex.urls=linkUrls(ex).concat(list); delete ex.url; } else p.links.push({id:'lk_'+Date.now(),label,urls:list});
    this.saveLinks(p); }
  saveLinks(p){ this.save(); if(typeof dbSaveProject==='function') dbSaveProject(p); }
  scorecardsOf(pid){ const p=this.project(pid); return (p&&p.scorecards)||[]; }
  addScorecard(pid,title,url,date){ const p=this.project(pid); if(!p)return; p.scorecards=p.scorecards||[]; p.scorecards.push({id:'sc_'+Date.now(),title:title||'',url:url||'',date:date||todayISO()}); this.save(); }
  updateScorecard(pid,id,fields){ const p=this.project(pid); if(!p)return; const s=(p.scorecards||[]).find(x=>x.id===id); if(s)Object.assign(s,fields); this.save(); }
  removeScorecard(pid,id){ const p=this.project(pid); if(!p)return; p.scorecards=(p.scorecards||[]).filter(x=>x.id!==id); this.save(); }
  updateLink(pid,lid,patch){ const p=this.project(pid); if(!p||!p.links)return; const l=p.links.find(x=>x.id===lid); if(l){Object.assign(l,patch); if(patch.urls) delete l.url; this.saveLinks(p);} }
  removeLink(pid,lid){ const p=this.project(pid); if(!p||!p.links)return; p.links=p.links.filter(x=>x.id!==lid); this.saveLinks(p); }
  addClient(o){ const c=Object.assign({id:'c_'+Date.now(),name:'',razon:'',rfc:'',location:'',web:'',ig:'',generalResponsibleId:null,people:[]},o); this.d.clients.push(c); this.save(); if(typeof dbSaveClient==='function') dbSaveClient(c); return c; }
  updateClient(id,patch){ const c=this.client(id); if(c){Object.assign(c,patch); this.save(); if(typeof dbSaveClient==='function') dbSaveClient(c);} }
  addClientPerson(cid,o){ const c=this.client(cid); if(!c)return; const p=Object.assign({id:'p_'+Date.now(),type:'cliente',bossId:null},o); c.people.push(p); this.save(); if(typeof dbSaveClient==='function') dbSaveClient(c); return p; }
  updateClientPerson(cid,pid,patch){ const c=this.client(cid); if(!c)return; const p=c.people.find(x=>x.id===pid); if(p){Object.assign(p,patch); this.save(); if(typeof dbSaveClient==='function') dbSaveClient(c);} }
  removeClient(cid){ if(this.projectsOf(cid).length) return false; this.d.clients=this.d.clients.filter(c=>c.id!==cid); this.save(); if(typeof dbDeleteClient==='function') dbDeleteClient(cid); return true; }
  removeClientPerson(cid,pid){ const c=this.client(cid); if(!c)return; c.people=c.people.filter(x=>x.id!==pid); this.save(); if(typeof dbSaveClient==='function') dbSaveClient(c); }
  addEtapa(pid,name,start,end){ const ord=this.etapasOf(pid).length+1; const e={id:uid('et_'),projectId:pid,name:name||('Etapa '+ord),start,end,order:ord}; this.d.etapas.push(e); this.save(); if(typeof dbSaveEtapa==='function') dbSaveEtapa(e); return e; }
  updateEtapa(eid,patch){ const e=this.d.etapas.find(x=>x.id===eid); if(e){Object.assign(e,patch); this.save(); if(typeof dbSaveEtapa==='function') dbSaveEtapa(e);} }
  removeEtapa(eid){ this.d.etapas=this.d.etapas.filter(e=>e.id!==eid); this.save(); if(typeof dbDeleteEtapa==='function') dbDeleteEtapa(eid); }
  moveEtapa(pid,eid,dir){ const list=this.etapasOf(pid); const i=list.findIndex(e=>e.id===eid); const j=i+dir; if(j<0||j>=list.length) return; const a=list[i],b=list[j]; const t=a.order; a.order=b.order; b.order=t; this.save(); if(typeof dbSaveEtapa==='function'){dbSaveEtapa(a);dbSaveEtapa(b);} }
  subtasksInEtapa(pid,e){ let n=0; this.tasksOf(pid).forEach(t=>(t.subtasks||[]).forEach(s=>{ if(s.date&&s.date>=e.start&&s.date<=e.end)n++; })); return n; }
  addFrente(pid,name,color){ const ord=this.frentesOf(pid).length+1; const f={id:uid('fr_'),projectId:pid,name,color:color||FRENTE_PALETTE[(ord-1)%FRENTE_PALETTE.length],order:ord}; this.d.frentes.push(f); this.save(); if(typeof dbSaveFrente==='function') dbSaveFrente(f); return f; }
  updateFrente(fid,patch){ const f=this.d.frentes.find(x=>x.id===fid); if(f){Object.assign(f,patch); this.save(); if(typeof dbSaveFrente==='function') dbSaveFrente(f);} }
  removeFrente(fid){ this.d.frentes=this.d.frentes.filter(f=>f.id!==fid); this.save(); if(typeof dbDeleteFrente==='function') dbDeleteFrente(fid); }
  moveFrente(pid,fid,dir){ const list=this.frentesOf(pid); const i=list.findIndex(f=>f.id===fid); const j=i+dir; if(j<0||j>=list.length) return; const a=list[i],b=list[j]; const t=a.order; a.order=b.order; b.order=t; this.save(); if(typeof dbSaveFrente==='function'){dbSaveFrente(a);dbSaveFrente(b);} }
  addTask(t){ t.id=uid('t_'); t.subtasks=t.subtasks||[]; t.links=t.links||[]; this.d.tasks.push(t); this.save(); if(typeof dbSaveTask==='function') dbSaveTask(t); return t; }
  taskAddLink(tid,title,url){ const t=this.task(tid); if(!t)return; t.links=t.links||[]; t.links.push({title:title||'',url:url||''}); this.save(); if(typeof dbSaveTask==='function') dbSaveTask(t); }
  taskSetLink(tid,idx,field,val){ const t=this.task(tid); if(t&&t.links&&t.links[idx]){ t.links[idx][field]=val; this.save(); if(typeof dbSaveTask==='function') dbSaveTask(t); } }
  taskDelLink(tid,idx){ const t=this.task(tid); if(t&&t.links){ t.links.splice(idx,1); this.save(); if(typeof dbSaveTask==='function') dbSaveTask(t); } }
  addSubtask(tid,st){ const t=this.task(tid); if(st&&st.date) st.date=okDate(st.date); st.id=uid('s_'); st.invitados=st.invitados||[]; st.timeSpent=0; st.done=false; st.links=st.links||[]; t.subtasks.push(st); this.save(); if(typeof dbSaveTask==='function') dbSaveTask(t); }
  subAddLink(tid,sid){ const t=this.task(tid); const s=t.subtasks.find(x=>x.id===sid); if(s){ s.links=s.links||[]; s.links.push({title:'',url:''}); this.save(); if(typeof dbSaveTask==='function') dbSaveTask(t); } }
  subSetLink(tid,sid,idx,field,val){ const t=this.task(tid); const s=t.subtasks.find(x=>x.id===sid); if(s&&s.links&&s.links[idx]){ s.links[idx][field]=val; this.save(); if(typeof dbSaveTask==='function') dbSaveTask(t); } }
  subDelLink(tid,sid,idx){ const t=this.task(tid); const s=t.subtasks.find(x=>x.id===sid); if(s&&s.links){ s.links.splice(idx,1); this.save(); if(typeof dbSaveTask==='function') dbSaveTask(t); } }
  releaseNext(t,s){ const now=new Date().toISOString(); (t.subtasks||[]).forEach(d=>{ if(d.dependsOn===s.id&&!d.done){ d.turno={pred:s.id,predName:s.name,ts:now,by:currentUser}; d.turnoAck={}; } }); }
  updateSubtask(tid,sid,patch){ if(patch&&patch.date) patch=Object.assign({},patch,{date:okDate(patch.date)}); const t=this.task(tid); const s=(t.subtasks||[]).find(x=>x.id===sid); if(s){ if(patch&&patch.date!==undefined&&patch.date!==s.date){ if(!canSubDate()){ patch=Object.assign({},patch); delete patch.date; } else s.dateConflict=false; } const wasDone=s.done; Object.assign(s,patch); if(patch&&patch.done===true&&!wasDone) this.releaseNext(t,s); if(patch&&patch.done===false&&wasDone) (t.subtasks||[]).forEach(d=>{ if(d.dependsOn===s.id){ delete d.turno; delete d.turnoAck; } }); if(patch&&patch.done===true&&!wasDone&&s.repeatAfter&&!subIsChild(t,s)) this.spawnNextSubtask(t,s); this.save(); if(typeof dbSaveTask==='function') dbSaveTask(t);} }
  /* Ciclo "N días después de terminar": al terminar la subtarea se crea la siguiente (con sus sub-subtareas) en hoy + N */
  spawnNextSubtask(t,s){ const n=+s.repeatAfter; if(!n||(s.nextId&&t.subtasks.some(x=>x.id===s.nextId))) return null;
    const nd=addDaysISO(todayISO(),n); const shift=daysBetween(s.date||todayISO(),nd); const now=new Date().toISOString(); const sid=s.seriesId||s.id;
    const fresh=(o,extra)=>{ const c=JSON.parse(JSON.stringify(o)); Object.assign(c,{id:uid('s_'),done:false,doneAt:null,timeSpent:0,nextId:null,dateConflict:false,teamAck:{},seriesId:sid},extra||{}); if(c.date) c.date=addDaysISO(c.date,shift); if((c.team||[]).length){ c.teamInfo={}; c.team.forEach(id=>{ c.teamInfo[id]={by:currentUser,ts:now}; }); } return c; };
    const main=fresh(s,{repeatOf:s.id}); main.date=nd; t.subtasks.push(main); s.nextId=main.id;
    subKids(t,s.id).forEach(k=>{ const kc=fresh(k,{parentId:main.id}); delete kc.repeatAfter; t.subtasks.push(kc); });
    repeatNotice('↻ Se creó la siguiente: «'+main.name+'» para el '+dLabel(nd)); return main; }
  /* Clona una tarea con TODAS sus subtareas, con las fechas movidas a la nueva fecha límite. det=true => ids fijos (dos usuarios no duplican) */
  cloneTaskShifted(t,nd,opts){ opts=opts||{}; const shift=daysBetween(t.dueDate||nd,nd); const now=new Date().toISOString(); const nt=JSON.parse(JSON.stringify(t)); const tag=nd.replace(/-/g,''); const idMap={};
    const mk=(base,pfx)=>opts.det?(pfx+base.replace(/^[st]_/,'').replace(/_\d{8}$/,'')+'_'+tag):uid(pfx);
    Object.assign(nt,{id:mk(t.id,'t_'),status:'to-do',dueDate:nd,nextId:null,repeatOf:t.id}); delete nt.ord; delete nt.impCode; if(opts.name) nt.name=opts.name;
    const keep=(nt.subtasks||[]).filter(x=>!x.seriesId);                                 // las repeticiones de una serie se regeneran solas
    keep.forEach(x=>{ idMap[x.id]=mk(x.id,'s_'); });
    nt.subtasks=keep.map(x=>{ const o=Object.assign({},x,{impCode:undefined,id:idMap[x.id],parentId:x.parentId?idMap[x.parentId]:undefined,done:false,doneAt:null,timeSpent:0,nextId:null,dateConflict:false,teamAck:{},seriesId:undefined,repeatOf:undefined,occDate:undefined});
      if(o.date) o.date=addDaysISO(o.date,shift);
      if(o.isSeries&&o.series){ o.series=Object.assign({},o.series,{startDate:o.series.startDate?addDaysISO(o.series.startDate,shift):'',skip:[]}); if(o.series.tpl&&(o.series.tpl.team||[]).length){ o.series.tpl=Object.assign({},o.series.tpl,{teamAck:{},teamInfo:Object.fromEntries(o.series.tpl.team.map(id=>[id,{by:opts.by||currentUser,ts:now}]))}); } }
      if((o.team||[]).length){ o.teamInfo={}; o.team.forEach(id=>{ o.teamInfo[id]={by:opts.by||currentUser,ts:now}; }); }
      return o; });
    return nt; }
  spawnNextTask(t){ const n=+t.repeatAfter; if(!n||(t.nextId&&this.task(t.nextId))) return null;
    const nd=addDaysISO(todayISO(),n); const nt=this.cloneTaskShifted(t,nd); t.nextId=nt.id; this.d.tasks.push(nt); if(typeof dbSaveTask==='function') dbSaveTask(nt);
    repeatNotice('↻ Se creó la siguiente tarea: «'+nt.name+'» con fecha límite '+dLabel(nd)); return nt; }
  /* Mueve una tarea a (frente, etapa, posición). Reubica las fechas de las subtareas que estaban en la etapa de origen
     conservando su día relativo; si no cabe en la etapa destino -> hoy + dateConflict (icono rojo). */
  moveTaskTo(tid,frenteId,fromEtapaId,toEtapaId,beforeTid){
    const t=this.task(tid); if(!t) return; const pid=t.projectId;
    const from=this.etapasOf(pid).find(e=>e.id===fromEtapaId), to=this.etapasOf(pid).find(e=>e.id===toEtapaId);
    t.frenteId=frenteId;
    if(from&&to&&from.id!==to.id){
      const day=86400000, toD=x=>Math.round(new Date(x+'T00:00:00').getTime()/day);
      const fromS=toD(from.start), toS=toD(to.start), toE=toD(to.end), fmt=n=>new Date(n*day).toISOString().split('T')[0];
      (t.subtasks||[]).forEach(st=>{
        if(!st.date||st.date<from.start||st.date>from.end) return;
        const n=toD(st.date)-fromS+toS;
        if(n<=toE){ st.date=fmt(n); st.dateConflict=false; }
        else { st.date=todayISO(); st.dateConflict=true; }
      });
    }
    // reordenar dentro de la celda destino
    const cell=this.tasksOf(pid).filter(x=>x.id!==tid && x.frenteId===frenteId && taskEtapaIds(x).has(toEtapaId)).sort((a,b)=>(a.ord||0)-(b.ord||0));
    let idx=beforeTid?cell.findIndex(x=>x.id===beforeTid):-1; if(idx<0) idx=cell.length;
    cell.splice(idx,0,t);
    cell.forEach((x,i)=>{ if(x.ord!==i+1||x===t){ x.ord=i+1; if(typeof dbSaveTask==='function') dbSaveTask(x); } });
    this.save();
  }
  moveSubtask(tid,sid,targetSid,after){ const t=this.task(tid); if(!t||!t.subtasks) return false; const a=t.subtasks; const sub=a.find(x=>x.id===sid), tg=a.find(x=>x.id===targetSid); if(!sub||!tg) return false;
    const isChild=x=>!!(x.parentId&&a.find(y=>y.id===x.parentId&&!y.parentId));
    let ref=tg;
    if(isChild(sub)){ if(tg.parentId!==sub.parentId) return false; }          // una hija solo se reordena entre sus hermanas
    else { ref=isChild(tg)?a.find(y=>y.id===tg.parentId):tg; if(ref.id===sub.id) return false; }   // una madre se mueve entre las madres (sus hijas la acompañan)
    const i=a.findIndex(x=>x.id===sid); a.splice(i,1); let j=a.findIndex(x=>x.id===ref.id); a.splice(after?j+1:j,0,sub);
    this.save(); if(typeof dbSaveTask==='function') dbSaveTask(t); return true; }
  removeSubtask(tid,sid){ const t=this.task(tid); t.subtasks=t.subtasks.filter(x=>x.id!==sid&&x.parentId!==sid); this.save(); if(typeof dbSaveTask==='function') dbSaveTask(t); }
  projectStats(pid){ const ts=this.tasksOf(pid); return {tareas:ts.length,subtareas:ts.reduce((a,t)=>a+(t.subtasks||[]).length,0),pagos:(this.d.payments||[]).filter(x=>x.projectId===pid).length,frentes:this.frentesOf(pid).length,etapas:this.etapasOf(pid).length}; }
  async removeProject(pid){ const ids=this.tasksOf(pid).map(t=>t.id);
    if(typeof dbDeleteProjectCascade==='function'){ const ok=await dbDeleteProjectCascade(pid,ids); if(!ok) return false; }
    const idSet=new Set(ids);
    this.d.tasks=this.d.tasks.filter(t=>t.projectId!==pid); this.d.comments=(this.d.comments||[]).filter(c=>!idSet.has(c.taskId)); this.d.log=(this.d.log||[]).filter(l=>!idSet.has(l.taskId));
    this.d.payments=(this.d.payments||[]).filter(x=>x.projectId!==pid); this.d.frentes=this.d.frentes.filter(f=>f.projectId!==pid); this.d.etapas=this.d.etapas.filter(e=>e.projectId!==pid);
    this.d.projects=this.d.projects.filter(p=>p.id!==pid); this.save(); return true; }
  removeTask(id){ this.d.tasks=this.d.tasks.filter(t=>t.id!==id); this.d.comments=this.d.comments.filter(c=>c.taskId!==id); this.save(); if(typeof dbDeleteTask==='function') dbDeleteTask(id); }
  updateTask(tid,patch){ const t=this.task(tid); if(t){ if(patch&&patch.dueDate!==undefined&&patch.dueDate!==t.dueDate&&!canSubDate()){ patch=Object.assign({},patch); delete patch.dueDate; } const wasSt=t.status; Object.assign(t,patch); if(patch&&patch.status==='done'&&wasSt!=='done'&&t.repeatAfter) this.spawnNextTask(t); this.save(); if(typeof dbSaveTask==='function') dbSaveTask(t);} }
  addComment(tid,uid,text,attachments,mentions){ const cm={id:'cm_'+Date.now(),taskId:tid,userId:uid,text,ts:new Date().toISOString(),attachments:attachments||[],mentions:mentions||[],readBy:[]}; this.d.comments.push(cm); this.save(); if(typeof dbSaveComment==='function') dbSaveComment(cm); }
  updateComment(cmId,text,mentions){ const cm=this.d.comments.find(c=>c.id===cmId); if(!cm) return; cm.text=text; cm.readBy=(cm.readBy||[]).filter(id=>(mentions||[]).includes(id)); cm.mentions=mentions||[]; this.save(); if(typeof dbSaveComment==='function') dbSaveComment(cm); }
  removeComment(cmId){ this.d.comments=this.d.comments.filter(c=>c.id!==cmId); this.save(); if(typeof dbDeleteComment==='function') dbDeleteComment(cmId); }
  markCommentRead(cmId,uid){ const cm=this.d.comments.find(c=>c.id===cmId); if(cm&&(cm.mentions||[]).includes(uid)){ cm.readBy=cm.readBy||[]; if(!cm.readBy.includes(uid)) cm.readBy.push(uid); this.save(); if(typeof dbSaveComment==='function') dbSaveComment(cm); } }

  /* catálogos: servicios */
  addService(name,listPrice,opCost){ const s={id:'sv_'+Date.now(),name,listPrice:+listPrice||0,opCost:+opCost||0,frentes:[],tasks:[],subLinks:[]}; this.d.services.push(s); this.save(); if(typeof dbSaveService==='function') dbSaveService(s); return s; }
  updateService(id,patch){ const s=this.service(id); if(s){Object.assign(s,patch); this.save(); if(typeof dbSaveService==='function') dbSaveService(s);} }
  removeService(id){ this.d.services=this.d.services.filter(s=>s.id!==id); this.save(); if(typeof dbDeleteService==='function') dbDeleteService(id); }
  serviceUsed(id){ return this.d.projects.some(p=>p.serviceId===id); }
  addServiceFrente(sid,name,color){ const s=this.service(sid); if(s&&name&&!s.frentes.some(f=>f.name===name)){ s.frentes.push({name,color:color||FRENTE_PALETTE[s.frentes.length%FRENTE_PALETTE.length]}); this.save(); if(typeof dbSaveService==='function') dbSaveService(s); } }
  updateServiceFrente(sid,oldName,newName,color){ const s=this.service(sid); if(!s)return; const f=s.frentes.find(x=>x.name===oldName); if(f){ f.name=newName||f.name; if(color)f.color=color; } (s.tasks||[]).forEach(t=>{ if(t[0]===oldName)t[0]=newName; }); this.save(); if(typeof dbSaveService==='function') dbSaveService(s); }
  removeServiceFrente(sid,name){ const s=this.service(sid); if(s){ s.frentes=s.frentes.filter(f=>f.name!==name); s.tasks=(s.tasks||[]).filter(t=>t[0]!==name); this.save(); if(typeof dbSaveService==='function') dbSaveService(s); } }
  addServiceTask(sid,frenteName,taskName,desc){ const s=this.service(sid); if(s&&taskName){ s.tasks=s.tasks||[]; s.tasks.push([frenteName,taskName,desc||'']); this.save(); if(typeof dbSaveService==='function') dbSaveService(s); } }
  updateServiceTask(sid,idx,frenteName,taskName,desc){ const s=this.service(sid); if(s&&s.tasks[idx]){ s.tasks[idx]=[frenteName,taskName,desc||'']; this.save(); if(typeof dbSaveService==='function') dbSaveService(s); } }
  removeServiceTask(sid,idx){ const s=this.service(sid); if(s&&s.tasks){ s.tasks.splice(idx,1); this.save(); if(typeof dbSaveService==='function') dbSaveService(s); } }
  addServiceSubLink(sid,label){ const s=this.service(sid); if(s&&label){ s.subLinks=s.subLinks||[]; if(!s.subLinks.includes(label)){ s.subLinks.push(label); this.save(); if(typeof dbSaveService==='function') dbSaveService(s); } } }
  removeServiceSubLink(sid,label){ const s=this.service(sid); if(s&&s.subLinks){ s.subLinks=s.subLinks.filter(l=>l!==label); this.save(); } }
  subLinksForProject(pid){ const p=this.project(pid); const s=p&&this.service(p.serviceId); return (s&&s.subLinks)||[]; }
  /* catálogos: personal */
  addStaff(o){ const u=Object.assign({id:'u_'+Date.now(),type:'nuwek',active:true},o); this.d.staff.push(u); this.save(); if(typeof dbSavePerson==='function') dbSavePerson(u); return u; }
  updateStaff(id,patch){ const u=this.d.staff.find(x=>x.id===id); if(u){Object.assign(u,patch); this.save(); if(typeof dbSavePerson==='function') dbSavePerson(u);} }
  toggleStaffActive(id){ const u=this.d.staff.find(x=>x.id===id); if(u){ u.active=(u.active===false); this.save(); if(typeof dbSavePerson==='function') dbSavePerson(u); } }
  activeStaff(){ return this.d.staff.filter(u=>u.active!==false); }
  /* catálogos: etiquetas */
  tagColor(name){ const t=(this.d.tags||[]).find(x=>x.name===name); return t?t.color:'#8a9a93'; }
  addTag(name,color){ if(name&&!this.d.tags.some(t=>t.name===name)){ const tg={name,color:color||'#8a9a93'}; this.d.tags.push(tg); this.save(); if(typeof dbSaveTag==='function') dbSaveTag(tg); } }
  renameTag(oldN,newN,color){ if(!newN)return; const t=this.d.tags.find(x=>x.name===oldN); if(t){ t.name=newN; if(color)t.color=color; } this.d.tasks.forEach(tk=>{ tk.tags=(tk.tags||[]).map(x=>x===oldN?newN:x); }); this.save(); if(typeof dbRenameTag==='function') dbRenameTag(oldN,newN,color); if(typeof dbSaveTask==='function') this.d.tasks.forEach(tk=>{ if((tk.tags||[]).includes(newN)) dbSaveTask(tk); }); }
  removeTag(name){ this.d.tags=this.d.tags.filter(t=>t.name!==name); this.save(); if(typeof dbDeleteTag==='function') dbDeleteTag(name); }
}
const store = new Store();

/* ================== STATE + HELPERS ================== */
/* ===== FONDO DEL LOGIN: pega aquí tu imagen (URL o base64). Tamaño ideal 1080×1920 px (vertical), JPG/PNG. ===== */
const LOGIN_BG = "https://images.unsplash.com/photo-1512428813834-c702c7702b78?q=80&w=1080&auto=format&fit=crop";
let session=null, loginUser=null, loginPin='', loginErr='', loginAttempts={};
let view='clientes', selClient=null, selProject=null, selTab='gestor', role='gerencia';
let currentUser='u_car', perfWindow='mes', perfMonth=todayISO().slice(0,7), opFilterClient='', opSelTask=null;
let kbScope='mes', kbAnchor=todayISO(), kbGroup='frente', kbPerson='', kbClient='', kbProject='';
let gestSub='asig', gestScope='mes', gestAnchor=todayISO(), gestProject='', gestPerson='', gestClients=[], gestPeople=[], gestFilterId=null;
let svcOpen={}, teamOpen={};
let agPerson='u_car', agStart=todayISO(), agSel=null, agListDrag=null;
const MESES=['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
/* ===== Secciones tipo acordeón (Vencidas, Hoy, …) — se recuerda cuáles dejaste cerradas ===== */
function accClosed(){ try{ return JSON.parse(localStorage.getItem('accClosed')||'{}'); }catch(_){ return {}; } }
function toggleAcc(key){ const c=accClosed(); if(c[key]) delete c[key]; else c[key]=1; try{ localStorage.setItem('accClosed',JSON.stringify(c)); }catch(_){} 
  const ids=document.querySelectorAll('.op-sec[data-acc="'+key+'"]'); if(ids.length){ ids.forEach(e=>e.classList.toggle('closed',!!c[key])); } else render(); }
function accSec(scope,title,icon,arr,rowFn){ if(!arr.length) return ''; const key=scope+':'+title; const closed=!!accClosed()[key];
  return `<div class="op-sec${closed?' closed':''}" data-acc="${esc(key)}"><div class="op-sec-h acc-h" onclick="toggleAcc('${esc(key)}')" role="button" tabindex="0" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();toggleAcc('${esc(key)}')}"><span class="acc-arw">▾</span> ${icon} ${title} <span class="op-cnt">${arr.length}</span></div><div class="acc-body">${arr.map(rowFn).join('')}</div></div>`; }
/* ===== Urgente ⚠️ (tarea o subtarea) ===== */
const URG='<span class="urg" title="Urgente">⚠️</span>';
function taskHasUrgent(t){ return !!t.urgent || (t.subtasks||[]).some(x=>x.urgent&&!x.done); }
function urgMark(on){ return on?URG+' ':''; }
function toggleTaskUrgent(tid){ const t=store.task(tid); if(!t) return; t.urgent=!t.urgent; store.save(); if(typeof dbSaveTask==='function') dbSaveTask(t); logEvent(tid,t.urgent?'Marcó la tarea como URGENTE':'Quitó la marca de urgente de la tarea'); render(); }
function toggleSubUrgent(tid,sid){ const t=store.task(tid); const sub=t&&(t.subtasks||[]).find(x=>x.id===sid); if(!sub) return; const v=!sub.urgent; store.updateSubtask(tid,sid,{urgent:v}); logEvent(tid,(v?'Marcó como URGENTE':'Quitó la marca de urgente de')+' la subtarea «'+sub.name+'»'); render(); }
/* Solo PM (y gerencia) pueden modificar las fechas de las subtareas */
/* ===== NIVELES DE PERMISO =====
   Clave guardada → etiqueta en pantalla:  gerencia → Dirección (todo) · gerente → Gerencia (crea/edita/borra proyectos)
   · pm → Project Manager (tareas y fechas) · colab → Colaborador (sin editar fechas).
   La clave 'gerencia' se conserva para no tener que migrar a las personas que ya la tienen. */
const PERM_LABEL={gerencia:'Dirección',gerente:'Gerencia',pm:'Project Manager',colab:'Colaborador'};
function permLabel(k){ return PERM_LABEL[k]||PERM_LABEL.colab; }
function permOptions(sel){ return ['gerencia','gerente','pm','colab'].map(k=>`<option value="${k}" ${(sel===k||(!sel&&k==='colab'))?'selected':''}>${PERM_LABEL[k]}</option>`).join(''); }
function canManageProject(){ return role==='gerencia' || role==='gerente'; }          // crear / editar / eliminar proyectos
function canSubDate(){ return role==='gerencia' || role==='gerente' || role==='pm'; }   // fechas de subtareas y de tareas
const SUB_DATE_MSG='Solo el PM puede cambiar las fechas de las subtareas.';
/* ===== Sub-subtareas: tarea > subtarea (madre) > sub-subtarea (hija). Un solo nivel de sangría ===== */
/* ===== Series por calendario: la MADRE (isSeries) guarda la regla y la plantilla; las HIJAS son las repeticiones ===== */
const SERIES_HORIZON_DAYS=56;   // 8 semanas por adelantado
function workSubs(t){ return (t.subtasks||[]).filter(x=>!x.isSeries); }
function seriesTpl(m){ return (m.series&&m.series.tpl)||{}; }
const WD_LETTER={1:'L',2:'M',3:'X',4:'J',5:'V',6:'S',0:'D'};
function seriesLabel(sr){ if(!sr) return ''; const n=+sr.interval||1;
  if(sr.freq==='daily') return 'L–V';
  if(sr.freq==='weekly') return (n>1?'c/'+n+' sem · ':'')+(sr.days||[]).slice().sort((a,b)=>((a+6)%7)-((b+6)%7)).map(d=>WD_LETTER[d]).join(' ');
  if(sr.freq==='monthly') return 'día '+(sr.monthDay||'')+(n>1?' c/'+n+' meses':' c/mes');
  return ''; }
function seriesDates(sr,start,dueDate,horizonEnd){
  const out=[]; if(!sr||!sr.freq||!start) return out; let end=horizonEnd;
  const cap=sr.endType==='date'&&sr.until?sr.until:(sr.endType==='deadline'&&dueDate?dueDate:null); if(cap&&cap<end) end=cap;
  const maxN=sr.endType==='count'?Math.max(1,+sr.count||1):Infinity; const k=Math.max(1,+sr.interval||1); const wk0=mondayOf(start);
  const [y0,m0,d0]=start.split('-').map(Number); let d=start,n=0,g=0;
  while(d<=end&&n<maxN&&g++<900){ const w=isoWeekday(d); let ok=false;
    if(sr.freq==='daily') ok=w>=1&&w<=5;
    else if(sr.freq==='weekly'){ const days=(sr.days&&sr.days.length)?sr.days:[isoWeekday(start)]; ok=days.includes(w)&&(Math.floor(daysBetween(wk0,mondayOf(d))/7)%k===0); }
    else if(sr.freq==='monthly'){ const [y,m,dd]=d.split('-').map(Number); const diff=(y-y0)*12+(m-m0); const dim=new Date(y,m,0).getDate(); ok=diff>=0&&diff%k===0&&dd===Math.min(+sr.monthDay||d0,dim); }
    if(ok){ n++; out.push(d); } d=addDaysISO(d,1); }
  return out; }
/* crea las repeticiones que falten (idempotente; ids fijos serie+fecha para que dos usuarios no dupliquen) */
function syncSeriesOf(t){
  let changed=false; const horizon=addDaysISO(todayISO(),SERIES_HORIZON_DAYS);
  (t.subtasks||[]).filter(m=>m.isSeries&&m.series).forEach(m=>{ const sr=m.series, tp=sr.tpl||{}; const have=new Set((t.subtasks||[]).filter(x=>x.seriesId===m.id).map(x=>x.occDate)); const skip=new Set(sr.skip||[]);
    seriesDates(sr,sr.startDate,t.dueDate,horizon).forEach(d=>{ if(have.has(d)||skip.has(d)) return;
      t.subtasks.push({id:'s_'+m.id.replace(/^s_/,'')+'_'+d.replace(/-/g,''),name:m.name,personId:tp.personId||'',date:d,time:tp.time||'',durMin:tp.durMin||null,invitados:(tp.invitados||[]).slice(),team:(tp.team||[]).slice(),done:false,doneAt:null,timeSpent:0,parentId:m.id,seriesId:m.id,occDate:d,links:[]}); changed=true; }); });
  const seen=new Set(); const before=t.subtasks.length; t.subtasks=t.subtasks.filter(x=>{ if(seen.has(x.id)) return false; seen.add(x.id); return true; }); if(t.subtasks.length!==before) changed=true;
  return changed; }
function runAllSeries(){ let any=false; (store.d.tasks||[]).forEach(t=>{ if((t.subtasks||[]).some(m=>m.isSeries)&&syncSeriesOf(t)){ any=true; if(typeof dbSaveTask==='function') dbSaveTask(t); } }); if(any) store.save(); return any; }
function subIsChild(t,x){ return !!(x.parentId&&(t.subtasks||[]).some(y=>y.id===x.parentId&&!y.parentId)); }
function subKids(t,pid){ return (t.subtasks||[]).filter(x=>x.parentId===pid&&subIsChild(t,x)); }
function subCollapsedMap(){ try{ return JSON.parse(localStorage.getItem('subCollapsed')||'{}'); }catch(_){ return {}; } }
function subCollapsedNow(m,map){ map=map||subCollapsedMap(); return map[m.id]===undefined?!!m.isSeries:!!map[m.id]; }
function toggleSubCollapse(sid){ const c=subCollapsedMap(); let m=null; store.d.tasks.some(t=>(m=(t.subtasks||[]).find(x=>x.id===sid))); c[sid]=m?(subCollapsedNow(m,c)?0:1):1; try{ localStorage.setItem('subCollapsed',JSON.stringify(c)); }catch(_){} render(); }
function subOrder(t,ignoreCollapse){ const all=t.subtasks||[]; const col=ignoreCollapse?{}:subCollapsedMap(); const out=[];
  all.filter(x=>!subIsChild(t,x)).forEach(m=>{ const kids=subKids(t,m.id); out.push({s:m,depth:0,kids}); if(!subCollapsedNow(m,col)) kids.forEach(k=>out.push({s:k,depth:1,kids:[]})); });
  return out; }
let addingChild=null, subEd=null, clientPop=null, verbInfo=false;
function openAddChild(tid,sid){ addingChild={tid,sid}; render(); setTimeout(()=>{ const el=document.getElementById('nc-name'); if(el) el.focus(); },0); }
function cancelAddChild(){ addingChild=null; render(); }
function addChildSub(){ if(!addingChild) return; const {tid,sid}=addingChild; const n=(val('nc-name')||'').trim(); if(!n) return; const t=store.task(tid); const m=t.subtasks.find(x=>x.id===sid); if(!m||m.parentId) return;
  const c=subCollapsedMap(); if(c[sid]!==0){ c[sid]=0; try{ localStorage.setItem('subCollapsed',JSON.stringify(c)); }catch(_){} }
  store.addSubtask(tid,{name:n,personId:'',date:m.date||t.dueDate||'',time:'',durMin:null,invitados:[],parentId:sid});
  // la madre ya no puede estar hecha: tiene una hija pendiente
  if(m.done) store.updateSubtask(tid,sid,{done:false,timeSpent:0,doneAt:null});
  logEvent(tid,'Agregó la sub-subtarea «'+n+'» dentro de «'+m.name+'»'); addingChild=null; render(); }
/* ===== «Ya te toca»: aviso cuando termina la actividad de la que depende la tuya ===== */
function pendingTurno(){ const out=[]; store.d.tasks.forEach(t=>{ if(!store.project(t.projectId)) return; (t.subtasks||[]).forEach(s=>{
    if(s.done||!s.turno||s.seriesId) return; const who=[s.personId,...(s.team||[])].filter(Boolean); if(!who.includes(currentUser)) return; if(s.turno.by===currentUser) return; if((s.turnoAck||{})[currentUser]) return; out.push({s,t,tu:s.turno}); }); });
  return out; }
function ackTurno(tid,sid){ const t=store.task(tid); const sub=t&&(t.subtasks||[]).find(x=>x.id===sid); if(!sub) return; const ack=Object.assign({},sub.turnoAck||{}); ack[currentUser]=new Date().toISOString(); store.updateSubtask(tid,sid,{turnoAck:ack}); render(); }
/* ===== Participantes de una subtarea ===== */
function pendingTeam(){ const out=[]; store.d.tasks.forEach(t=>{ if(!store.project(t.projectId)) return; (t.subtasks||[]).forEach(s=>{
    if(s.done||s.seriesId) return; const src=s.isSeries?seriesTpl(s):s; if(!(src.team||[]).includes(currentUser)) return; const inf=(src.teamInfo||{})[currentUser]; if(!inf||inf.by===currentUser) return; if((src.teamAck||{})[currentUser]) return; out.push({s,t,by:inf.by,ts:inf.ts}); }); });
  return out.sort((a,b)=>a.ts<b.ts?1:-1); }
function ackTeam(tid,sid){ const t=store.task(tid); const sub=t&&(t.subtasks||[]).find(x=>x.id===sid); if(!sub) return; const ack=Object.assign({},(sub.isSeries?seriesTpl(sub):sub).teamAck||{}); ack[currentUser]=new Date().toISOString();
  if(sub.isSeries){ const sr=Object.assign({},sub.series); sr.tpl=Object.assign({},sr.tpl,{teamAck:ack}); store.updateSubtask(tid,sid,{series:sr}); } else store.updateSubtask(tid,sid,{teamAck:ack}); logEvent(tid,'Vio y atendió su participación en «'+sub.name+'»'); render(); }
function subInvolves(s,pid){ return s.personId===pid||(s.team||[]).includes(pid)||(s.invitados||[]).includes(pid); }
function subMissing(s){ const x=s.isSeries?seriesTpl(s):s; const date=s.isSeries?(s.series||{}).startDate:s.date; const m=[]; if(!x.personId) m.push('responsable'); if(!date) m.push('fecha'); if(!x.time) m.push('hora'); if(!x.durMin) m.push('estimación de tiempo'); return m; }
/* ===== Tareas cíclicas por calendario: cada periodo nace una tarea nueva con todas sus subtareas ===== */
function cycleNextDue(t){ const c=t.repeatCal; if(!c||!c.freq||!t.dueDate) return ''; const n=Math.max(1,+c.interval||1);
  if(c.freq==='weekly') return addDaysISO(t.dueDate,7*n); if(c.freq==='days') return addDaysISO(t.dueDate,n);
  if(c.freq==='monthly'){ const [y,m,d]=t.dueDate.split('-').map(Number); const tm=m-1+n; const yy=y+Math.floor(tm/12), mm=((tm%12)+12)%12; const dim=new Date(yy,mm+1,0).getDate(); return yy+'-'+String(mm+1).padStart(2,'0')+'-'+String(Math.min(d,dim)).padStart(2,'0'); }
  return ''; }
function cycleName(t,nd){ const c=t.repeatCal||{}; if(!c.addPeriod) return t.name; const base=t.name;
  if(c.freq==='monthly'){ const mn=MESES[+nd.split('-')[1]-1]; const re=new RegExp('('+MESES.join('|')+')','i'); if(re.test(base)) return base.replace(re,(m)=>m[0]===m[0].toUpperCase()?mn:mn.toLowerCase()); return base+' | '+mn; }
  const lab='semana del '+dLabel(nd); return base.replace(/\s*\|\s*semana del .*$/i,'')+' | '+lab; }
function runAllCycles(){ let any=false;
  (store.d.tasks||[]).slice().forEach(t0=>{ let t=t0; if(!t.repeatCal||(t.nextId&&store.task(t.nextId))) return; let g=0;
    while(t&&t.repeatCal&&!(t.nextId&&store.task(t.nextId))&&g++<6){ const nd=cycleNextDue(t); if(!nd) break; const lead=Math.max(0,+t.repeatCal.lead||0); if(todayISO()<addDaysISO(nd,-lead)) break;
      const nt=store.cloneTaskShifted(t,nd,{det:true,name:cycleName(t,nd),by:t.responsibleId||currentUser});
      if(store.task(nt.id)){ t.nextId=nt.id; break; }   // otro usuario ya la creó
      t.nextId=nt.id; store.d.tasks.push(nt); if(typeof dbSaveTask==='function'){ dbSaveTask(nt); dbSaveTask(t); } any=true; repeatNotice('↻ Nuevo ciclo: «'+nt.name+'» (límite '+dLabel(nd)+')'); t=nt; } });
  if(any) store.save(); return any; }
function daysBetween(a,b){ const A=new Date(a+'T00:00:00'),B=new Date(b+'T00:00:00'); return Math.round((B-A)/86400000); }
function repeatNotice(msg){ try{ setTimeout(()=>{ if(typeof shareToast==='function') shareToast(msg); },50); }catch(_){} }
function repLabel(n){ return n?`↻ cada ${n} día${n==1?'':'s'} tras terminar`:''; }
function isColab(){ return role==='colab'; }
function isPM(){ return role==='pm'; }
function isGerente(){ return role==='gerente'; }
function isGerencia(){ return role==='gerencia'; }
function canEditTask(t){ return true; }
function canCheckSub(s){ return true; }
const CMT_EDIT_MS=15*60*1000; // 15 minutos para editar o borrar tu propio comentario
let editingCmt=null;
function cmtCanEdit(cm){ return cm.userId===currentUser && (Date.now()-new Date(cm.ts).getTime())<=CMT_EDIT_MS; }
function cmtEditUntil(cm){ const d=new Date(new Date(cm.ts).getTime()+CMT_EDIT_MS); return String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0'); }
function editCmt(id){ const cm=(store.d.comments||[]).find(c=>c.id===id); if(!cm||!cmtCanEdit(cm)){ alert('Ya pasaron los 15 minutos: este comentario ya no se puede editar.'); render(); return; } editingCmt=id; render(); setTimeout(()=>{ const el=document.getElementById('cmt-edit-'+id); if(el){ el.focus(); el.setSelectionRange(el.value.length,el.value.length); } },0); }
function cancelCmtEdit(){ editingCmt=null; render(); }
function saveCmtEdit(id){ const cm=(store.d.comments||[]).find(c=>c.id===id); if(!cm) return; if(!cmtCanEdit(cm)){ alert('Ya pasaron los 15 minutos: este comentario ya no se puede editar.'); editingCmt=null; render(); return; }
  const tx=(document.getElementById('cmt-edit-'+id).value||'').trim(); if(!tx&&!(cm.attachments||[]).length){ alert('El comentario no puede quedar vacío. Si quieres quitarlo, usa 🗑️.'); return; }
  const ments=(cm.mentions||[]).filter(pid=>tx.includes('@'+store.person(pid).name)); store.updateComment(id,tx,ments); logEvent(cm.taskId,'Editó un comentario'); editingCmt=null; render(); }
function delCmt(id){ const cm=(store.d.comments||[]).find(c=>c.id===id); if(!cm) return; if(!cmtCanEdit(cm)){ alert('Ya pasaron los 15 minutos: este comentario ya no se puede borrar.'); render(); return; }
  if(!confirm('¿Borrar este comentario?')) return; store.removeComment(id); logEvent(cm.taskId,'Borró un comentario'); render(); }
/* Enter envía · Shift+Enter = nueva línea (si hay sugerencias de @, Enter elige la primera) */
function cmtKey(ev,tid){ if(ev.key!=='Enter'||ev.shiftKey||ev.isComposing) return;
  const box=document.getElementById('mention-box-'+tid); const first=box&&box.classList.contains('on')&&box.querySelector('.ment-opt');
  ev.preventDefault(); if(first){ mentionPick(ev,tid,first.dataset.id); return; } addCmt(tid); }
function cmtEditKey(ev,id){ if(ev.isComposing) return; if(ev.key==='Escape'){ ev.preventDefault(); cancelCmtEdit(); } else if(ev.key==='Enter'&&!ev.shiftKey){ ev.preventDefault(); saveCmtEdit(id); } }
const SUB_EDIT_MS=10*60*1000; // 10 minutos para editar el tiempo
function subTimeLocked(s){ return !!(s.done && s.doneAt && (Date.now()-new Date(s.doneAt).getTime())>SUB_EDIT_MS); }
function subEditUntil(s){ if(!s.doneAt) return ''; const d=new Date(new Date(s.doneAt).getTime()+SUB_EDIT_MS); return String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0'); }
let modalTask=null, timingSub=null, wiz=null, qm=null, editingTask=null, editingSub=null;
let draftAtt=[], draftMentions=[];
let libModal=null, subView='list', lightbox=null, editingLink=null;
let tareasMode='kanban', calMonth=new Date(), groupBy='frente', filterPersona='', filterMes='', ganttZoom='month', calDay=null;

const money=n=>'$'+Math.round(n||0).toLocaleString('es-MX');
function fmtTime(min){min=Math.round(min||0); if(min<=0)return'—'; if(min<60)return min+' min'; const h=Math.floor(min/60),m=min%60; return m?`${h}h ${m}m`:`${h}h`;}
function dk(t){return t.status==='done'?'✓ ':'';}
function taskDelay(t){const ds=(t.subtasks||[]).map(s=>s.date).filter(Boolean).sort();if(!ds.length)return 0;const last=ds[ds.length-1];return last>t.dueDate?Math.round((new Date(last)-new Date(t.dueDate))/86400000):0;}
const statusLabel={'to-do':'To Do','in-progress':'En Progreso','done':'Hecho','ajuste':'Ajuste','on-hold':'En Pausa'};
function avatar(p,sm){p=p||{}; if(p.photo) return `<span class="avatar ${sm?'sm':''}" style="background-image:url('${p.photo}');background-size:cover;background-position:center"></span>`; return `<span class="avatar ${sm?'sm':''}" style="background:${p.color||'#8a9a93'}">${(p.name||'?')[0]}</span>`;}
function fullName(u){u=u||{}; return [u.firstName||u.name,u.secondName,u.lastName].filter(Boolean).join(' ')||u.name||'';}
/* ===== Markdown ligero y SEGURO para descripciones y comentarios =====
   Soporta: # ## ### títulos · **negrita** · *cursiva* · ***ambas*** · ~~tachado~~ · `código` · listas (- / 1.) · [texto](url) · links sueltos.
   Primero se escapa todo el HTML, así que nada de lo escrito se ejecuta. */
function mdEsc(t){ return String(t==null?'':t).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function mdInline(t){
  const keep=[]; const hold=h=>{ keep.push(h); return '\u0000'+(keep.length-1)+'\u0000'; };
  t=t.replace(/`([^`\n]+)`/g,(_,c)=>hold('<code>'+c+'</code>'));
  t=t.replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g,(_,a,u)=>hold('<a href="'+u+'" target="_blank" rel="noopener noreferrer">'+a+'</a>'));
  t=t.replace(/(^|[^\w@\/.\-])((?:https?:\/\/|www\.)[^\s<]+|(?:[a-z0-9-]+\.)+(?:com|mx|org|net|io|co|app|dev|me|edu|gob|ly|gl|link|page|site|xyz)(?:\/[^\s<]*)?)/gi,(m,pre,u)=>{
    let tail=''; while(/[.,;:!?)\]]$/.test(u)||/&(?:gt|lt|quot);$/.test(u)){ const mm=u.match(/&(?:gt|lt|quot);$/); const cut=mm?mm[0]:u.slice(-1); tail=cut+tail; u=u.slice(0,-cut.length); }
    if(!u||/^\w+\.\w+$/.test(u)&&!/\.(com|mx|org|net|io|co|app|dev|me|edu|gob|ly|gl|link|page|site|xyz)$/i.test(u)) return m;
    const href=/^https?:\/\//i.test(u)?u:'https://'+u;
    return pre+hold('<a href="'+href+'" target="_blank" rel="noopener noreferrer">'+u+'</a>')+tail; });
  t=t.replace(/\*\*\*([^*\n]+?)\*\*\*/g,'<strong><em>$1</em></strong>')
     .replace(/\*\*([^*\n]+?)\*\*/g,'<strong>$1</strong>').replace(/(^|[^\w])__([^_\n]+?)__(?!\w)/g,'$1<strong>$2</strong>')
     .replace(/\*([^*\s][^*\n]*?)\*/g,'<em>$1</em>').replace(/(^|[^\w])_([^_\s][^_\n]*?)_(?!\w)/g,'$1<em>$2</em>')
     .replace(/~~([^~\n]+?)~~/g,'<del>$1</del>');
  return t.replace(/\u0000(\d+)\u0000/g,(_,i)=>keep[+i]);
}
function mdRender(src){
  const lines=mdEsc(src).split(/\r?\n/); let out='', list=null, para=[];
  const flushP=()=>{ if(para.length){ out+='<p>'+para.map(mdInline).join('<br>')+'</p>'; para=[]; } };
  const closeL=()=>{ if(list){ out+='</'+list+'>'; list=null; } };
  lines.forEach(l=>{ let m;
    if((m=l.match(/^(#{1,3})\s+(.+)$/))){ flushP(); closeL(); out+='<h'+(m[1].length+2)+' class="md-h">'+mdInline(m[2])+'</h'+(m[1].length+2)+'>'; }
    else if((m=l.match(/^\s*[-*•]\s+(.+)$/))){ flushP(); if(list!=='ul'){ closeL(); out+='<ul>'; list='ul'; } out+='<li>'+mdInline(m[1])+'</li>'; }
    else if((m=l.match(/^\s*\d+[.)]\s+(.+)$/))){ flushP(); if(list!=='ol'){ closeL(); out+='<ol>'; list='ol'; } out+='<li>'+mdInline(m[1])+'</li>'; }
    else if(!l.trim()){ flushP(); closeL(); }
    else { closeL(); para.push(l); } });
  flushP(); closeL(); return out;
}
/* ===== Selector de color: paleta predefinida + selector libre (ambos escriben en #qm-color) ===== */
const COLOR_SWATCHES=['#223c36','#3f7d6e','#6b8e23','#2e9e5b','#2c8ca0','#4a6fa5','#2f7dd8','#5b4fc9','#9c5a8a','#c2417a','#C0553B','#e53935','#E0A93B','#e6b800','#8a6d3b','#6b7a73','#8a9a93','#16261f','#b8873b','#a4506b','#7a5aa0','#3b7d8a','#f0a020','#1e88e5'];
function colorPicker(cur){ cur=(cur||'#3f7d6e').toLowerCase();
  const sw=COLOR_SWATCHES.map(c=>`<button type="button" class="clr-sw${c.toLowerCase()===cur?' on':''}" style="background:${c}" title="${c}" onclick="pickColor('${c}')"></button>`).join('');
  return `<div class="clr-wrap"><div class="clr-pal">${sw}</div><div class="clr-custom"><input id="qm-color" type="color" value="${cur}" oninput="syncColorSw()" style="width:48px;height:34px;padding:2px"><span class="muted">o elige cualquier color</span></div></div>`; }
function pickColor(c){ const i=document.getElementById('qm-color'); if(i){ i.value=c; syncColorSw(); } }
function syncColorSw(){ const i=document.getElementById('qm-color'); if(!i) return; const v=i.value.toLowerCase(); document.querySelectorAll('.clr-sw').forEach(b=>b.classList.toggle('on',b.title.toLowerCase()===v)); }
function esc(s){return (s||'').replace(/"/g,'&quot;');}
function dLabel(dateStr){ if(!dateStr) return '—'; const d=new Date(dateStr+'T00:00:00'); return d.toLocaleDateString('es-MX',{day:'numeric',month:'short'}); }

/* etapas que toca una tarea (por fechas de subtareas; fallback dueDate) */
function taskEtapaIds(t){
  const pid=t.projectId; const set=new Set();
  (t.subtasks||[]).forEach(s=>{ const e=store.etapaOfDate(pid,s.date); if(e) set.add(e.id); });
  if(set.size===0){ const e=store.etapaOfDate(pid,t.dueDate); if(e) set.add(e.id); }
  return set;
}

/* ================== RENDER DISPATCH ================== */
let _rSig='';
function renderSig(){ return [view,selClient,selProject,selTab,(typeof cpView!=='undefined'&&clientSess&&!session)?cpView:'',session?'s':(clientSess?'c':'p'),(typeof gestSub!=='undefined')?gestSub:''].join('|'); }
function domPath(e){ const a=[]; while(e&&e.id!=='app'&&e.id!=='modal-root'&&e.parentElement){ a.push(Array.prototype.indexOf.call(e.parentElement.children,e)); e=e.parentElement; } a.push(e&&e.id==='app'?'a':'m'); return a.reverse().join('.'); }
function scrollSnap(){ const out=[]; document.querySelectorAll('#app *, #modal-root *').forEach(e=>{ if(e.scrollTop>0||e.scrollLeft>0) out.push({p:domPath(e),c:e.tagName+'|'+e.className,t:e.scrollTop,l:e.scrollLeft}); }); return out; }
function scrollRestore(list){ list.forEach(o=>{ const q=o.p.split('.'); let el=document.getElementById(q[0]==='a'?'app':'modal-root'); for(let i=1;i<q.length&&el;i++) el=el.children[+q[i]]; if(el&&(el.tagName+'|'+el.className)===o.c){ el.scrollTop=o.t; el.scrollLeft=o.l; } }); }
/* fechas con año mal escrito (p. ej. 0026-10-19 por teclear «26» en un campo de fecha) */
function okDate(v){ if(!v) return v; const m=/^(\d{4})-(\d\d)-(\d\d)$/.exec(String(v)); if(!m) return ''; let y=+m[1]; if(y<100) y+=2000; if(y<2000||y>2100) return ''; return y+'-'+m[2]+'-'+m[3]; }
function fixBadDates(){ if(window.__dfix||typeof store==='undefined'||!store.d||!(store.d.tasks||[]).length) return; window.__dfix=1; store.d.tasks.forEach(t=>{ let ch=false; (t.subtasks||[]).forEach(s=>{ if(s.date&&okDate(s.date)!==s.date){ s.date=okDate(s.date); ch=true; } (s.minutas||[]).forEach(m=>(m.lines||[]).forEach(l=>{ if(l.date&&okDate(l.date)!==l.date){ l.date=okDate(l.date); ch=true; } })); }); if(ch&&typeof dbSaveTask==='function') dbSaveTask(t); }); }
function render(){
  fixBadDates();
  const sig=renderSig(); const keep=(sig===_rSig)&&!!document.getElementById('app').firstChild; const y=window.scrollY, snap=keep?scrollSnap():null; _rSig=sig;
  renderBase();
  if(keep){ scrollRestore(snap); if(window.scrollY!==y) window.scrollTo(0,y); requestAnimationFrame(()=>{ if(Math.abs(window.scrollY-y)>2) window.scrollTo(0,y); }); }
}
function renderBase(){
  const app=document.getElementById('app');
  if(session){ saveSession(); saveNav(); }
  setTimeout(mnRender,0); setTimeout(notifUpdate,0); setTimeout(ensureAttNow,0); setTimeout(()=>{ nextBtnUpdate(); if(nextOpen) nextRender(); },0);
  if(window.CLIENT_ONLY&&!session&&!publicSes&&!clientSess){ app.innerHTML=clientLoginScreen(); document.getElementById('modal-root').innerHTML=cpRecS?cpRecModal():''; return; }
  if(!session){
    if(publicSes){ app.innerHTML=viewPublicSession(); document.getElementById('modal-root').innerHTML=sesPubModal()+(mnSum?mnSumModal():'')+(mnAuth?mnAuthModal():''); return; }
    if(clientSess){ renderClientPortal(); return; }
    if(showClientLogin){ app.innerHTML=clientLoginScreen(); document.getElementById('modal-root').innerHTML=cpRecS?cpRecModal():''; return; }
    if(publicTaskId){ app.innerHTML=viewPublicTask(); document.getElementById('modal-root').innerHTML=''; return; }
    app.innerHTML = loginScreen();
    document.getElementById('modal-root').innerHTML = loginUser ? pinModal() : '';
    return;
  }
  if(publicSes){ app.innerHTML=viewPublicSession(); document.getElementById('modal-root').innerHTML=sesPubModal()+(mnSum?mnSumModal():'')+(mnAuth?mnAuthModal():''); return; }
  let body='';
  if(isColab()){
    if(view==='proyecto') body=viewProyecto();
    else if(view==='op_desempeno') body=viewMiDesempeno();
    else if(view==='op_kanban') body=viewOpKanban();
    else if(view==='op_agenda') body=viewAgenda();
    else body=viewMisPendientes();
    app.innerHTML = shellOp(body);
  } else {
    if(view==='catalogos' && !isGerencia()) view='clientes';
    if(isMiEspacio()) body=miEspacioBody();
    else if(view==='clientes') body=viewClientes();
    else if(view==='cliente') body=viewCliente();
    else if(view==='wizard') body=viewWizard();
    else if(view==='proyecto') body=viewProyecto();
    else if(view==='catalogos') body=viewCatalogos();
    else if(view==='importar') body=canImport()?viewImportar():viewClientes();
    else if(view==='gestion') body=viewGestion();
    else body=viewClientes();
    app.innerHTML = shell(body);
  }
  // modal
  document.getElementById('modal-root').innerHTML = (modalTask ? taskModal() : (qm ? quickModal() : '')) + (libModal ? libraryModal() : '') + (wiz ? wizModal() : '') + (subEd ? subEditModal() : '') + (clientPop ? clientPopModal() : '') + (verbInfo ? verbInfoModal() : '') + (expS ? expModal() : '') + (pdfS ? pdfModal() : '') + (mnSum ? mnSumModal() : '') + (mnNew ? mnNewModal() : '') + (movT ? movTModal() : '') + (movS ? movModal() : '') + (dupS ? dupModal() : '') + (accEd ? accModal() : '') + (copyS ? copyModal() : '') + (depPrev ? depPrevModal() : '') + (lightbox ? lightboxModal() : '');
  setTimeout(ganttAfter,0);
}
function isMiEspacio(){ return view==='op_pendientes'||view==='op_kanban'||view==='op_agenda'||view==='op_desempeno'; }
function openMiEspacio(){ view='op_pendientes'; opSelTask=null; modalTask=null; render(); }
function miEspacioBody(){
  let inner;
  if(view==='op_kanban') inner=viewOpKanban();
  else if(view==='op_agenda') inner=viewAgenda();
  else if(view==='op_desempeno') inner=viewMiDesempeno();
  else inner=viewMisPendientes();
  const tab=(v,label,fn)=>`<button class="${view===v?'active':''}" onclick="${fn}">${label}</button>`;
  return `<div class="subnav">
    ${tab('op_pendientes','Mis pendientes',"go('op_pendientes')")}
    ${tab('op_agenda','Agenda',"openAgenda()")}
    ${tab('op_kanban','Kanban',"openKanban()")}
    ${tab('op_desempeno','Mi desempeño',"go('op_desempeno')")}
  </div>${inner}`;
}
function whoSelector(){
  const opts=store.activeStaff().map(u=>`<option value="${u.id}" ${currentUser===u.id?'selected':''}>${u.name}</option>`).join('');
  return `<div class="role"><select onchange="setUser(this.value)" title="Quién soy">${opts}</select>
    <select onchange="setRole(this.value)">${permOptions(role)}</select></div>`;
}
function sessionBar(){
  const u=store.person(session)||{name:'?'};
  const rl=permLabel(u.perm);
  return `<div class="sessbar"><button id="next-btn" class="next-btn" onclick="toggleNext(event)" title="Tus siguientes actividades">⏰</button>${avatar(u,true)}<div class="sess-info"><div class="sess-nm">${u.name}</div><div class="sess-rl">${rl}</div></div><button class="sess-out" onclick="logout()">Salir</button></div>`;
}
/* ===== LOGIN ===== */
function getLoginBg(){ return (store.d.settings && store.d.settings.loginBg) || LOGIN_BG; }
function loginScreen(){
  const LOGIN_ORDER=['carlos','estrella','gerardo','jaime']; const rank=u=>{ const i=LOGIN_ORDER.indexOf((u.name||'').trim().toLowerCase()); return i<0?99:i; };
  const pills=store.activeStaff().map((u,i)=>({u,i})).sort((a,b)=>rank(a.u)-rank(b.u)||a.i-b.i).map(x=>x.u).map(u=>`<button class="login-pill" onclick="openPin('${u.id}')" title="${u.name}"><span class="login-av">${u.photo?`<img src="${u.photo}" alt="">`:esc((u.name||'?')[0])}</span></button>`).join('');
  return `<div class="login-wrap" style="background-image:linear-gradient(rgba(10,20,15,.35),rgba(10,20,15,.55)),url('${getLoginBg()}')">
    <div class="login-grid">${pills}</div>
    <button class="login-client-link" onclick="location.href='clientes/'">Acceso para clientes →</button>
  </div>`;
}
function pinModal(){
  const u=store.person(loginUser); if(!u) return '';
  const dots=Array.from({length:6},(_,i)=>`<span class="pin-dot ${i<loginPin.length?'on':''}"></span>`).join('');
  const lock=loginAttempts[loginUser]; const now=Date.now();
  const locked = lock && lock.until && now<lock.until;
  const keys=['1','2','3','4','5','6','7','8','9','','0','⌫'];
  const pad=keys.map(k=>{ if(k==='') return `<span></span>`; if(k==='⌫') return `<button class="pin-key" onclick="pinBack()">⌫</button>`; return `<button class="pin-key" onclick="pinPush('${k}')">${k}</button>`; }).join('');
  const mins = locked ? Math.ceil((lock.until-now)/60000) : 0;
  return `<div class="modal active" onclick="if(event.target===this)cancelPin()"><div class="modal-card pin-card">
    <div class="pin-head">${avatar(u)}<div><div class="pin-name">${u.name}</div><div class="pin-sub">${locked?`Bloqueado · espera ${mins} min`:'Ingresa tu código'}</div></div></div>
    <div class="pin-dots">${dots}</div>
    ${loginErr?`<div class="pin-err">${loginErr}</div>`:''}
    <div class="pin-pad ${locked?'pin-disabled':''}">${pad}</div>
    <div style="text-align:center"><button class="pin-cancel" onclick="cancelPin()">Cancelar</button></div>
  </div></div>`;
}
/* Esc: cierra lo último que abriste (modal, edición, panel) */
document.addEventListener('keydown',ev=>{
  if(ev.key!=='Escape'||ev.defaultPrevented||!session) return;
  const tg=ev.target; if(tg&&tg.classList&&tg.classList.contains('cmt-in')&&tg.value.trim()&&!tg.id.startsWith('cmt-edit')){ tg.blur(); return; }   // no perder un comentario a medias
  if(nextOpen){ nextOpen=false; nextRender(); return; }
  if(notifOpen){ notifOpen=false; notifUpdate(); return; }
  if(depPrev){ depCancel(); return; }
  if(expS){ expClose(); return; }
  if(pdfS){ pdfClose(); return; }
  if(mnSum){ mnSumClose(); return; }
  if(mnNew){ mnNewClose(); return; }
  if(movT){ closeMovT(); return; }
  if(movS){ closeMov(); return; }
  if(dupS){ closeDup(); return; }
  if(accEd){ closeAcc(); return; }
  if(copyS){ closeCopy(); return; }
  if(verbInfo){ closeVerbInfo(); return; }
  if(subEd){ closeSubEdit(); return; }
  if(clientPop){ closeClientPop(); return; }
  if(wiz&&!qm){ closeWizard(); return; }
  if(lightbox){ closeLightbox(); return; }
  if(qm){ closeQM(); return; }
  if(libModal){ closeLibModal(); return; }
  if(modalTask){ if(addingChild){ cancelAddChild(); return; } if(timingSub){ cancelSubTime(); return; } if(editingSub){ cancelSubEdit(); return; } if(editingTask===modalTask){ cancelTaskEdit(); return; } closeTask(); return; }
  if(opSelTask&&view==='op_pendientes'){ selectOpTask(opSelTask); return; }
});
/* Teclado físico para el PIN: 0-9, Backspace, Escape */
document.addEventListener('keydown',ev=>{
  if(!loginUser || session || ev.metaKey || ev.ctrlKey || ev.altKey) return;
  if(/^[0-9]$/.test(ev.key)){ ev.preventDefault(); pinPush(ev.key); }
  else if(ev.key==='Backspace'){ ev.preventDefault(); pinBack(); }
  else if(ev.key==='Escape'){ ev.preventDefault(); cancelPin(); }
});
function openPin(uid){ loginUser=uid; loginPin=''; loginErr=''; render(); }
function cancelPin(){ loginUser=null; loginPin=''; loginErr=''; render(); }
function pinBack(){ if(loginPin.length){ loginPin=loginPin.slice(0,-1); render(); } }
function pinPush(d){
  const lock=loginAttempts[loginUser]; if(lock && lock.until && Date.now()<lock.until) return;
  if(loginPin.length>=6) return;
  loginPin+=d; loginErr='';
  if(loginPin.length===6){ pinSubmit(); return; }
  render();
}
function pinSubmit(){
  const u=store.person(loginUser); if(!u) return;
  if((u.password||'')===loginPin){
    session=u.id; currentUser=u.id; role=u.perm||'colab'; kbPerson=u.id;
    view=(role==='colab')?'op_pendientes':'clientes';
    selProject=null; modalTask=null; opSelTask=null;
    loginAttempts[u.id]=null; loginUser=null; loginPin=''; loginErr='';
    saveSession(); if(afterLoginTask){ openSharedTask(afterLoginTask); afterLoginTask=null; } render(); return;
  }
  const a=loginAttempts[loginUser]||{fails:0,until:0};
  a.fails=(a.fails||0)+1;
  if(a.fails>=3){ a.until=Date.now()+5*60*1000; a.fails=0; loginErr='Demasiados intentos. Espera 5 minutos.'; }
  else { loginErr=`Código incorrecto (intento ${a.fails} de 3).`; }
  loginAttempts[loginUser]=a; loginPin=''; render();
}
/* ===== Sesión que sobrevive al refresh (se cierra con «Salir» o tras 12 h sin usar el portal) ===== */
const SESSION_TTL_MS=12*60*60*1000;
function saveSession(){ try{ if(session) localStorage.setItem('nuwekSession',JSON.stringify({uid:session,exp:Date.now()+SESSION_TTL_MS})); }catch(_){} }
function clearSession(){ try{ localStorage.removeItem('nuwekSession'); sessionStorage.removeItem('nuwekNav'); }catch(_){} }
function saveNav(){ try{ sessionStorage.setItem('nuwekNav',JSON.stringify({view,selClient,selProject,selTab,modalTask,opSelTask,gestSub,gestScope})); }catch(_){} }
function restoreSession(){
  try{ const raw=localStorage.getItem('nuwekSession'); if(!raw) return false; const o=JSON.parse(raw);
    if(!o||!o.uid||Date.now()>o.exp) { clearSession(); return false; }
    const u=store.d.staff.find(x=>x.id===o.uid&&x.active!==false); if(!u){ clearSession(); return false; }
    session=u.id; currentUser=u.id; role=u.perm||'colab'; kbPerson=u.id;
    view=(role==='colab')?'op_pendientes':'clientes';
    const n=JSON.parse(sessionStorage.getItem('nuwekNav')||'null');
    if(n){ if(typeof n.view==='string') view=n.view;
      if(n.selClient&&store.client(n.selClient)) selClient=n.selClient;
      if(n.selProject&&store.project(n.selProject)) selProject=n.selProject; else if(view==='proyecto') view=(role==='colab')?'op_pendientes':'clientes';
      if(view==='cliente'&&!selClient) view='clientes';
      if(typeof n.selTab==='string') selTab=n.selTab;
      if(n.modalTask&&store.task(n.modalTask)) modalTask=n.modalTask;
      if(n.opSelTask&&store.task(n.opSelTask)) opSelTask=n.opSelTask;
      if(n.gestSub) gestSub=n.gestSub; if(n.gestScope) gestScope=n.gestScope; }
    return true; }catch(_){ return false; } }
function logout(){ session=null; loginUser=null; loginPin=''; loginErr=''; clearSession(); render(); }
function shellOp(body){
  return `
    <div class="topbar"><div class="topbar-in">
      <div class="brand" onclick="go('op_pendientes')"><span class="mark">N</span> Nuwek <span class="slash">╱</span> Portal</div>
      <div class="nav">
        <button class="${view==='op_pendientes'?'active':''}" onclick="go('op_pendientes')">Mis pendientes</button>
        <button class="${view==='op_agenda'?'active':''}" onclick="openAgenda()">Agenda</button>
        <button class="${view==='op_kanban'?'active':''}" onclick="openKanban()">Kanban</button>
        <button class="${view==='op_desempeno'?'active':''}" onclick="go('op_desempeno')">Mi desempeño</button>
      </div>
      ${sessionBar()}
    </div></div>
    <div class="wrap">${body}</div>`;
}

function shell(body){
  return `
    <div class="topbar"><div class="topbar-in">
      <div class="brand" onclick="go('clientes')"><span class="mark">N</span> Nuwek <span class="slash">╱</span> Portal</div>
      <div class="nav">
        <button class="${isMiEspacio()?'active':''}" onclick="openMiEspacio()">Mi espacio</button>
        <button class="${view==='clientes'||view==='cliente'||view==='proyecto'||view==='wizard'?'active':''}" onclick="go('clientes')">Clientes</button>
        <button class="${view==='gestion'?'active':''}" onclick="openGestion()">Gestión</button>
        ${isGerencia()?`<button class="${view==='catalogos'?'active':''}" onclick="go('catalogos')">Catálogos</button>`:''}
      </div>
      ${sessionBar()}
    </div></div>
    <div class="wrap">${body}</div>`;
}
/* ===== Clientes favoritos (por usuario) ===== */
function myFavClients(){ const u=store.d.staff.find(x=>x.id===currentUser); if(u&&Array.isArray(u.favClients)&&u.favClients.length) return u.favClients;
  try{ return JSON.parse(localStorage.getItem('favClients_'+currentUser)||'[]'); }catch(_){ return []; } }
function toggleFavClient(cid){ const cur=myFavClients().slice(); const i=cur.indexOf(cid); if(i>=0) cur.splice(i,1); else cur.push(cid);
  try{ localStorage.setItem('favClients_'+currentUser,JSON.stringify(cur)); }catch(_){}
  const u=store.d.staff.find(x=>x.id===currentUser); if(u) store.updateStaff(u.id,{favClients:cur}); render(); }
let showInactive=false;
function viewClientes(){
  const favs=myFavClients();
  const card=c=>{
    const n=store.projectsOf(c.id).length; const fav=favs.includes(c.id);
    return `<div class="card click${fav?' is-fav':''}${c.activo===false?' cl-off':''}" onclick="openClient('${c.id}')">
      <button class="fav-btn${fav?' on':''}" title="${fav?'Quitar de favoritos':'Marcar como favorito'}" onclick="event.stopPropagation();toggleFavClient('${c.id}')">${fav?'★':'☆'}</button>
      <div class="pill ${c.tipo==='interno'?'yellow':'green'}">${c.tipo==='interno'?'Interno':'Cliente'}</div>${c.activo===false?' <span class="pill gray">Inactivo</span>':''}
      <h3 style="margin:8px 0 4px">${c.name}</h3>
      <div class="muted" style="font-size:.85rem">${c.location} · ${n} proyecto${n===1?'':'s'} vivo${n===1?'':'s'}</div>
    </div>`; };
  const inact=store.d.clients.filter(c=>c.activo===false); const vis=c=>showInactive||c.activo!==false;
  const favList=favs.map(id=>store.client(id)).filter(Boolean).filter(vis);
  const rest=store.d.clients.filter(c=>!favs.includes(c.id)).filter(vis);
  const add=isGerencia()?`<div class="card click" style="display:flex;align-items:center;justify-content:center;color:var(--muted);border-style:dashed" onclick="openClientForm()">+ Nuevo cliente</div>`:'';
  return `<div class="crumb">Clientes</div>
    <div class="sec-title"><h2>Clientes</h2>${isGerencia()&&inact.length?`<button class="btn ghost sm" onclick="showInactive=!showInactive;render()">${showInactive?'Ocultar':'Ver'} inactivos (${inact.length})</button>`:''}</div>
    ${favList.length?`<div class="fav-title">★ Favoritos</div><div class="grid cols-3">${favList.map(card).join('')}</div><div class="fav-title" style="margin-top:22px">Todos los clientes</div>`:''}
    <div class="grid cols-3">${rest.map(card).join('')}
      ${add}
    </div>`;
}

/* ================== CLIENTE ================== */

/* ===== Pestañas de la ficha del cliente: Citas · Finanzas · Próximas subtareas · Scorecard ===== */
let clientTab='citas';
function setClientTab(k){ clientTab=k; render(); }
function clientNextSubs(c,onlyPid){ const now=todayISO(); const out=[];
  store.projectsOf(c.id).filter(p=>!onlyPid||p.id===onlyPid).forEach(p=>store.tasksOf(p.id).forEach(t=>(t.subtasks||[]).forEach(s=>{ if(s.done||s.isSeries||!s.date||s.date<now) return; out.push({s,t,p}); })));
  return out.sort((a,b)=>((a.s.date+(a.s.time||'99:99'))<(b.s.date+(b.s.time||'99:99'))?-1:1)).slice(0,8); }
function clientNextHtml(c){ const items=clientNextSubs(c); const today=todayISO(), tm=addDaysISO(today,1);
  const rows=items.map(({s,t,p})=>{ const per=store.person(s.personId); const w=s.date===today?'hoy':s.date===tm?'mañana':dLabel(s.date); const f=kbFrente(t);
    return `<div class="cita-row" style="border-left:4px solid ${f.color}"><div class="cita-when"><b>${w}</b><span>${s.time||'sin hora'}</span></div>
      <div class="cita-main"><div class="cita-nm">${subHasCita(s)?'📅 ':''}${esc(s.name)}</div><div class="muted" style="font-size:.76rem">${esc(p.name)} · ${esc(t.name)} · <span style="color:${f.color};font-weight:600">${esc(f.name)}</span></div></div>
      <div class="cita-side" style="display:flex;align-items:center;gap:8px">${s.personId?`${avatar(per,true)}<span style="font-size:.78rem;font-weight:600">${esc((per.name||'').split(' ')[0])}</span>`:'<span class="muted" style="font-size:.76rem;font-style:italic">Sin asignar</span>'}<button class="btn ghost sm" onclick="openTask('${t.id}')">Abrir</button></div></div>`; }).join('');
  return `<div class="cita-list">${rows||'<div class="muted">No hay subtareas próximas programadas para este cliente.</div>'}</div>${items.length?`<div class="hint" style="margin-top:8px">Las próximas ${items.length} subtareas y sub-subtareas pendientes, de todos sus proyectos.</div>`:''}`; }
function clientScoreHtml(c){ const rows=[]; store.projectsOf(c.id).forEach(p=>store.scorecardsOf(p.id).forEach(sc=>rows.push({sc,p}))); rows.sort((a,b)=>((a.sc.date||'')<(b.sc.date||'')?1:-1));
  const list=rows.map(({sc,p})=>{ const href=(sc.url||'').match(/^https?:\/\//)?sc.url:'https://'+sc.url; return `<div class="lib-row"><div class="lib-ico">📊</div><div class="lib-g"><a class="lib-nm" href="${esc(href)}" target="_blank" rel="noopener">${esc(sc.title||sc.url||'Scorecard')}</a><div class="lib-url muted">${esc(p.name)}${sc.date?' · '+dLabel(sc.date):''}</div></div><div class="lib-ops"><a class="btn ghost sm" href="${esc(href)}" target="_blank" rel="noopener">Abrir ↗</a></div></div>`; }).join('');
  return `<div class="score-soon"><span>🛠️</span><div><b>Estamos afinando el scorecard</b><div class="muted" style="font-size:.8rem">El método de evaluación se está cocinando. Mientras tanto, aquí viven los scorecards ya registrados.</div></div></div><div class="lib-list" style="margin-top:12px">${list||'<div class="muted">Aún no hay scorecards registrados para este cliente.</div>'}</div>`; }
function clientNotasStaffHtml(c){ const projs=store.projectsOf(c.id); const rows=[]; projs.forEach(p=>(p.notasCliente||[]).forEach(n=>rows.push({n,p}))); rows.sort((a,b)=>(a.n.fecha||'')<(b.n.fecha||'')?1:-1);
  const form=projs.length?`<div class="card" style="margin-bottom:12px"><div class="muted" style="font-size:.8rem;margin-bottom:8px">Estas notas las ve el <b>administrador del cliente</b> en su portal (pestaña Notas).</div><div class="field row"><div><label>Proyecto</label><select id="nc-proj">${projs.map(p=>`<option value="${p.id}">${esc(p.name)}</option>`).join('')}</select></div><div><label>Título</label><input id="nc-tit" placeholder="Ej. Acuerdos de la junta"></div></div><div class="field"><label>Nota</label><textarea id="nc-txt" rows="3" style="width:100%;padding:9px;border:2px solid var(--line);border-radius:8px;font-family:inherit" placeholder="Admite **negrita**, listas con -, links…"></textarea></div><div style="text-align:right"><button class="btn sm" onclick="saveNotaCliente()">＋ Publicar nota</button></div></div>`:'<div class="muted">Este cliente aún no tiene proyectos.</div>';
  return `<div class="sec-title"><h2>📝 Notas para el cliente</h2></div>${form}<div class="cita-list">${rows.map(({n,p})=>`<div class="card"><div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start"><div><b>${esc(n.titulo||'Nota')}</b><div class="muted" style="font-size:.74rem">${esc(p.name)} · ${n.fecha?dLabel(n.fecha):''}</div></div><button class="btn ghost sm" title="Quitar" onclick="delNotaCliente('${p.id}','${n.id}')">🗑️</button></div><div class="md" style="margin-top:6px">${mdRender(n.texto||'')}</div></div>`).join('')||'<div class="muted">Aún no hay notas publicadas.</div>'}</div>`; }
function saveNotaCliente(){ const pid=val('nc-proj'); const tit=(val('nc-tit')||'').trim(), txt=(val('nc-txt')||'').trim(); if(!txt){ alert('Escribe la nota.'); return; } const pr=store.project(pid); if(!pr) return;
  const arr=(pr.notasCliente||[]).concat([{id:'nt_'+Date.now().toString(36),titulo:tit,texto:txt,fecha:todayISO(),autor:currentUser}]); store.updateProject(pid,{notasCliente:arr}); render(); }
function delNotaCliente(pid,nid){ const pr=store.project(pid); if(!pr||!confirm('¿Quitar esta nota?')) return; store.updateProject(pid,{notasCliente:(pr.notasCliente||[]).filter(n=>n.id!==nid)}); render(); }
function clientTabsHtml(c){
  const tabs=[['citas','📅 Citas'],...(canSeeFinance()?[['finanzas','💰 Finanzas']]:[]),['proximas','🧭 Próximas subtareas'],['score','📊 Scorecard'],['notas','📝 Notas para el cliente']];
  if(!tabs.some(t=>t[0]===clientTab)) clientTab=tabs[0][0];
  const bar=`<div class="ptabs client-tabs">${tabs.map(([k,l])=>`<button class="${clientTab===k?'active':''}" onclick="setClientTab('${k}')">${l}</button>`).join('')}</div>`;
  const body=clientTab==='citas'?citasHistorialHtml(c):clientTab==='finanzas'?finanzasHtml(c):clientTab==='proximas'?`<div class="sec-title"><h2>🧭 Próximas subtareas</h2></div>${clientNextHtml(c)}`:clientTab==='notas'?clientNotasStaffHtml(c):`<div class="sec-title"><h2>📊 Scorecard</h2></div>${clientScoreHtml(c)}`;
  return bar+`<div class="client-tab-body">${body}</div>`; }

function viewCliente(){
  const c=store.client(selClient); if(!c) return '';
  const resp=store.person(c.generalResponsibleId);
  const people=c.people.map(p=>`<span class="chip tag-chip">${avatar(p,true)} ${p.portal?`<span title="Tiene acceso al portal (${esc(p.portal.user)})">🔑</span> `:''}${p.name}${p.role?' · '+p.role:''} <button class="chip-e" title="Editar" onclick="openContactEdit('${c.id}','${p.id}')">✏️</button><button class="chip-x" title="Quitar" onclick="delContact('${c.id}','${p.id}')">×</button></span>`).join('') || '<span class="muted" style="font-size:.85rem">Sin contactos aún</span>';
  const projs=store.projectsOf(c.id).map(p=>{
    const sv=store.service(p.serviceId); const health=projectHealth(p.id);
    return `<div class="card click" onclick="openProject('${p.id}')">
      <div style="display:flex;justify-content:space-between;align-items:start">
        <div><div class="pill yellow">${sv?sv.name:'Servicio'}</div><h3 style="margin:8px 0 2px">${p.name}</h3></div>
        <span style="display:flex;align-items:center;gap:6px"><span class="pill ${health.cls}">${health.icon} ${health.pct}%</span>${canManageProject()?`<button class="btn ghost sm" title="Editar proyecto" onclick="event.stopPropagation();openProjectEdit('${p.id}')">✏️</button>`:''}</span>
      </div>
      <div class="muted" style="font-size:.85rem;margin-top:6px">${money(p.price)} · ${p.months} meses · ${dLabel(p.startDate)}–${dLabel(p.endDate)}</div>
    </div>`;
  }).join('');
  return `<div class="crumb"><a onclick="go('clientes')">Clientes</a> › ${c.name}</div>
    <div class="card">
      <div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:14px">
        <div><div class="pill green">Cliente</div>${c.activo===false?' <span class="pill gray">Inactivo</span>':''}<h2 style="margin:8px 0 2px;font-size:1.5rem">${c.name}</h2><div class="muted">${c.razon||''}</div></div>
        <div style="display:flex;gap:8px">${isGerencia()?`<button class="btn ghost" onclick="openClientEdit('${c.id}')">✏️ Editar</button>`:''}${canManageProject()?`<button class="btn" onclick="startWizard('${c.id}')">+ Nuevo proyecto</button>`:''}</div>
      </div>
      <dl class="kv" style="margin-top:16px">
        <dt>RFC</dt><dd>${c.rfc||'—'}</dd>
        <dt>Ubicación</dt><dd>${c.location||'—'}</dd>
        <dt>Web</dt><dd>${c.web||'—'}</dd>
        <dt>Redes</dt><dd>${[['IG',c.ig],['FB',c.fb],['YouTube',c.youtube],['TikTok',c.tiktok],['LinkedIn',c.linkedin],['Otro',c.otro]].filter(r=>r[1]).map(r=>`${r[0]}: ${r[1]}`).join(' · ')||'—'}</dd>
        <dt>Responsable Nuwek</dt><dd>${c.generalResponsibleId?`${avatar(resp,true)} ${resp.name}`:'—'}</dd>
        <dt>Su gente</dt><dd><div class="chiplist" style="align-items:center">${people} <button class="btn ghost sm" onclick="openContactForm('${c.id}')">+ Contacto</button></div></dd>
      </dl>
    </div>
    <div class="sec-title"><h2>Proyectos vivos</h2></div>
    <div class="grid cols-2">${projs||'<div class="muted">Sin proyectos aún. Usa “+ Nuevo proyecto”.</div>'}</div>
    ${clientTabsHtml(c)}`;
}

function projectHealth(pid){
  const ts=store.tasksOf(pid); let onTime=0,total=0;
  ts.forEach(t=>{ (t.subtasks||[]).forEach(s=>{ total++; const today=todayISO();
    if(s.done){ if(s.date<=t.dueDate) onTime++; } else { if(s.date>=today) onTime++; } }); });
  const pct= total? Math.round(onTime/total*100):100;
  const cls= pct>=75?'green':pct>=50?'yellow':'red'; const icon= pct>=75?'🟢':pct>=50?'🟡':'🔴';
  return {pct,cls,icon};
}

/* ================== WIZARD ================== */
function startWizard(cid){ if(!canManageProject()) return;
  wiz={step:1,clientId:cid,serviceId:store.d.services[0].id,price:'',monthlyPay:'',months:'',paymentDay:'',startDate:'',endDate:'',
       alcances:[],loadTemplate:true,etapas:[],frentes:[]};
  render(); setTimeout(()=>{ const el=document.getElementById('w-monthly'); if(el) el.focus(); },30);
}
function closeWizard(){ wiz=null; render(); }
/* Nuevo proyecto en ventana emergente: 1 · Parámetros  →  2 · Etapas y Frentes (el cliente ya es el de la pantalla) */
function wizModal(){
  const c=store.client(wiz.clientId)||{name:''};
  const stepbar=[1,2].map(n=>{const cls=wiz.step===n?'on':(wiz.step>n?'done':'');const lab=['Parámetros','Etapas y Frentes'][n-1];return `<div class="ws ${cls}">${wiz.step>n?'✓ ':n+' · '}${lab}</div>`;}).join('');
  const body=wiz.step===1?wizStep2():wizStep3();
  return `<div class="modal active" onclick="if(event.target===this)closeWizard()"><div class="modal-card" style="max-width:680px">
    <div class="m-head"><div class="m-top"><div><div class="pill yellow">${esc(c.name)}</div><h3 style="margin:8px 0 0">Nuevo proyecto</h3></div><button class="x" onclick="closeWizard()">×</button></div></div>
    <div class="m-body"><div class="wiz-steps" style="margin-bottom:16px">${stepbar}</div>${body}</div></div></div>`;
}
function viewWizard(){ return ''; }
function wizStep1(){
  const opts=store.d.clients.map(c=>`<div class="opt ${wiz.clientId===c.id?'sel':''}" onclick="wizPick('${c.id}')">
    <h4>${c.name}</h4><div class="muted" style="font-size:.82rem">${c.location} · ${c.people.length} contactos</div></div>`).join('');
  const c=store.client(wiz.clientId);
  return `<p class="muted">Elige el cliente. Su información ya está cargada, no la recapturas.</p>
    <div class="pick">${opts}</div>
    <div class="card" style="margin-top:16px;background:#f9f8f2">
      <div class="eyebrow">Info precargada de ${c.name}</div>
      <dl class="kv" style="margin-top:8px"><dt>RFC</dt><dd>${c.rfc}</dd><dt>Contactos</dt><dd>${c.people.map(p=>p.name).join(', ')}</dd></dl>
    </div>
    <div class="wiz-actions"><span></span><button class="btn" onclick="wizNext()">Continuar →</button></div>`;
}
function wizStep2(){
  const svc=store.d.services.map(sv=>`<option value="${sv.id}" ${wiz.serviceId===sv.id?'selected':''}>${sv.name}</option>`).join('');
  return `<div class="field"><label>Servicio</label><select id="w-svc" onchange="wizPickService(this.value)">${svc}</select></div>
    <div class="field row"><div><label>Pago por mes</label><input id="w-monthly" type="number" placeholder="27083" value="${wiz.monthlyPay}"></div>
      <div><label># de meses</label><input id="w-months" type="number" placeholder="6" value="${wiz.months}"></div></div>
    <div class="field row"><div><label>Día de pago</label><input id="w-payday" type="number" min="1" max="31" placeholder="5" value="${wiz.paymentDay}"></div><div></div></div>
    <div class="field row"><div><label>Fecha de inicio</label><input id="w-start" type="date" value="${wiz.startDate}"></div>
      <div><label>Fecha de cierre</label><input id="w-end" type="date" value="${wiz.endDate}"></div></div>
    <div class="wiz-actions"><button class="btn ghost" onclick="closeWizard()">Cancelar</button><button class="btn" onclick="wizNext()">Continuar →</button></div>`;
}
function wizStep3(){
  const ets=wiz.etapas.map((e,i)=>`<span class="chip">${e.name}: ${dLabel(e.start)}–${dLabel(e.end)} <button onclick="wizDelEt(${i})">×</button></span>`).join('');
  const frs=wiz.frentes.map((f,i)=>`<span class="frente-tag" style="background:${f.color}">${f.name} <button onclick="wizDelFr(${i})" style="background:none;border:none;color:#fff;cursor:pointer">×</button></span>`).join(' ');
  return `<p class="muted">Arma el Gantt: crea las <b>Etapas</b> (columnas de meses reales) y los <b>Frentes</b> (filas). También podrás agregar más después.</p>
    <div class="field"><label>Etapas (columnas)</label>
      <div class="alc-row"><input id="w-et-name" placeholder="Etapa 1"><input id="w-et-start" type="date"><input id="w-et-end" type="date"><button class="btn ghost sm" onclick="wizAddEt()">+ Etapa</button></div>
      <div class="chiplist">${ets||'<span class="muted">Aún sin etapas</span>'}</div></div>
    <div class="field"><label>Frentes (filas) — color automático Nuwek</label>
      <div class="alc-row"><input id="w-fr-name" class="grow" placeholder="Onboarding"><button class="btn ghost sm" onclick="wizAddFr()">+ Frente</button></div>
      <div class="chiplist" style="gap:8px">${frs||'<span class="muted">Aún sin frentes</span>'}</div>
      <div class="hint">Si activaste la plantilla, ya vienen precargados los del servicio.</div></div>
    <div class="wiz-actions"><button class="btn ghost" onclick="wizBack()">← Atrás</button><button class="btn yellow" onclick="wizCreate()">✓ Crear proyecto</button></div>`;
}
function wizPickService(sid){
  wiz.serviceId=sid;
  wiz.monthlyPay=val('w-monthly'); wiz.months=val('w-months'); wiz.paymentDay=val('w-payday');
  wiz.startDate=val('w-start'); wiz.endDate=val('w-end');
  render();
}
function wizPick(id){wiz.clientId=id; render();}
function wizSaveStep2(){wiz.serviceId=val('w-svc')||wiz.serviceId;wiz.monthlyPay=+val('w-monthly')||0;wiz.months=+val('w-months')||0;wiz.paymentDay=+val('w-payday')||5;wiz.startDate=val('w-start');wiz.endDate=val('w-end');}
function wizNext(){ if(wiz.step===1){ wizSaveStep2(); if(wiz.loadTemplate&&wiz.frentes.length===0){const sv=store.service(wiz.serviceId)||{frentes:[]}; (sv.frentes||[]).forEach((f,i)=>wiz.frentes.push({name:f.name,color:f.color||FRENTE_PALETTE[i%FRENTE_PALETTE.length]}));} } wiz.step=Math.min(2,wiz.step+1); render(); }
function wizBack(){ if(wiz.step===1)wizSaveStep2(); wiz.step=Math.max(1,wiz.step-1); render(); }
function wizAddAlc(){const it=val('w-alc-item');const q=val('w-alc-qty');if(!it||!q)return;wiz.alcances.push({item:it,qty:+q,period:val('w-alc-per')});render();}
function wizDelAlc(i){wiz.alcances.splice(i,1);render();}
function wizAddEt(){const n=val('w-et-name'),s=val('w-et-start'),e=val('w-et-end');if(!n||!s||!e){alert('Nombre y fechas de la etapa.');return;}wiz.etapas.push({name:n,start:s,end:e});render();}
function wizDelEt(i){wiz.etapas.splice(i,1);render();}
function wizAddFr(){const n=val('w-fr-name');if(!n)return;wiz.frentes.push({name:n,color:FRENTE_PALETTE[wiz.frentes.length%FRENTE_PALETTE.length]});render();}
function wizDelFr(i){wiz.frentes.splice(i,1);render();}
async function wizCreate(){
  if(wiz.step===1) wizSaveStep2();
  if(wiz.frentes.length===0){alert('Agrega al menos un frente.');return;}
  if(!wiz.price){ wiz.price = (wiz.monthlyPay&&wiz.months) ? wiz.monthlyPay*wiz.months : ((store.service(wiz.serviceId)||{}).listPrice||0); }
  const p=store.addProject({clientId:wiz.clientId,serviceId:wiz.serviceId,name:store.service(wiz.serviceId).name,price:wiz.price,monthlyPay:wiz.monthlyPay,months:wiz.months,paymentDay:wiz.paymentDay,startDate:wiz.startDate,endDate:wiz.endDate,status:'active',alcances:wiz.alcances});
  // Guardar el PROYECTO en Supabase y ESPERAR a que exista antes de crear sus frentes/etapas
  // (frentes y etapas dependen del proyecto por llave foránea).
  if(typeof dbSaveProject==='function'){ try{ await dbSaveProject(p); }catch(e){ console.error(e); } }
  store.generatePayments(p);
  wiz.frentes.forEach(f=>store.addFrente(p.id,f.name,f.color));
  wiz.etapas.forEach(e=>store.addEtapa(p.id,e.name,e.start,e.end));
  // Nota: las TAREAS se conectarán en el Sub-paso B (módulo de Tareas).
  store.save(); wiz=null; openProject(p.id);
}
function val(id){const e=document.getElementById(id);return e?e.value:'';}

/* selector múltiple de etiquetas desde catálogo (sin re-render, conserva campos) */
function tagPicker(boxId,selected){
  selected=selected||[];
  const all=[...new Set([...store.d.tags.map(t=>t.name),...selected])];
  return `<div id="${boxId}" class="tagpick-box">${all.map(t=>`<label class="tagpick"><input type="checkbox" value="${esc(t)}" ${selected.includes(t)?'checked':''}><span>${t}</span></label>`).join('')}</div>`;
}
function readTags(boxId){return [...document.querySelectorAll('#'+boxId+' input:checked')].map(i=>i.value);}
function staffOptEls(selId,suffix){const list=store.activeStaff().slice();if(selId){const cur=store.d.staff.find(u=>u.id===selId);if(cur&&cur.active===false)list.push(cur);}return list.map(u=>`<option value="${u.id}" ${u.id===selId?'selected':''}>${u.name}${suffix||''}${u.active===false?' (inactivo)':''}</option>`).join('');}
function peoplePicker(boxId,people,selected){selected=selected||[];return `<div id="${boxId}" class="tagpick-box">${people.map(pp=>`<label class="tagpick"><input type="checkbox" value="${pp.id}" ${selected.includes(pp.id)?'checked':''}><span>${pp.name}</span></label>`).join('')}</div>`;}

/* ================== PROYECTO HUB ================== */
/* ================== PORTAL OPERATIVO ================== */
function opTaskRow(t){
  const p=store.project(t.projectId); const c=store.client(p.clientId);
  const fr=store.frentesOf(p.id).find(f=>f.id===t.frenteId)||{name:'',color:'#223c36'};
  const mineSub=(t.subtasks||[]).filter(s=>!s.done && subInvolves(s,currentUser));
  const doneS=workSubs(t).filter(s=>s.done).length, totS=workSubs(t).length;
  const isResp=t.responsibleId===currentUser;
  const unreadMention=store.commentsOf(t.id).some(cm=>(cm.mentions||[]).includes(currentUser) && !(cm.readBy||[]).includes(currentUser));
  const bits=[];
  if(mineSub.length) bits.push(`🙋 ${mineSub.length} subt. mía(s)`); else if(isResp) bits.push('🎯 responsable');
  if(unreadMention) bits.push('👋 Te buscan');
  const mineTxt = bits.length?'· '+bits.join(' · '):'';
  return `<div class="op-row ${opSelTask===t.id?'sel':''}" onclick="selectOpTask('${t.id}')">
    <span class="badge s-${t.status}">${statusLabel[t.status]}</span>
    <div class="g"><div class="nm">${urgMark(taskHasUrgent(t))}${dk(t)}${t.name}</div>
      <div class="mt">${c.name} » ${p.name} » <span style="color:${fr.color};font-weight:600">${fr.name}</span> · ☑ ${doneS}/${totS} ${mineTxt}</div></div>
    <div class="op-due">${(()=>{ const sd=mySubDate(t); const dl=t.dueDate?dLabel(t.dueDate):'—';
      return sd?`<div class="op-due-sub${sd<todayISO()?' late':sd===todayISO()?' today':''}" title="Fecha de mi subtarea pendiente más próxima">☑ ${sd===todayISO()?'hoy':dLabel(sd)}</div><div class="op-due-dl" title="Fecha límite de la tarea">🏁 ${dl}</div>`:dl; })()}</div></div>`;
}
function myPendingTasks(){
  let ts=store.d.tasks.filter(t=>personParticipates(t,currentUser));
  if(opFilterClient) ts=ts.filter(t=>store.project(t.projectId).clientId===opFilterClient);
  return ts;
}
/* Fecha que manda para ubicar una tarea en MIS pendientes: la subtarea mía pendiente más próxima; si no hay, el deadline de la tarea */
function mySubDate(t){ const ds=(t.subtasks||[]).filter(s=>!s.done&&s.date&&subInvolves(s,currentUser)).map(s=>s.date).sort(); return ds[0]||''; }
function myKeyDate(t){ return mySubDate(t)||t.dueDate||''; }
function viewMisPendientes(){
  const u=store.person(currentUser);
  const today=todayISO();
  const wk=new Date(); wk.setDate(wk.getDate()+7); const wkStr=wk.toISOString().slice(0,10);
  const ts=myPendingTasks();
  const buckets={venc:[],hoy:[],sem:[],resto:[],sinf:[]};
  ts.forEach(t=>{ const d=myKeyDate(t); if(!d) buckets.sinf.push(t); else if(d<today) buckets.venc.push(t); else if(d===today) buckets.hoy.push(t); else if(d<=wkStr) buckets.sem.push(t); else buckets.resto.push(t); });
  Object.values(buckets).forEach(a=>a.sort((x,y)=>(myKeyDate(x)||'9')<(myKeyDate(y)||'9')?-1:1));
  const sec=(title,icon,arr)=> accSec('op',title,icon,arr,opTaskRow);
  const clientes=[...new Set(ts.length?store.d.tasks.map(t=>store.project(t.projectId).clientId):[])];
  const cliOpts='<option value="">Todos los clientes</option>'+store.d.clients.map(c=>`<option value="${c.id}" ${opFilterClient===c.id?'selected':''}>${c.name}</option>`).join('');
  const list = (buckets.venc.length+buckets.hoy.length+buckets.sem.length+buckets.resto.length+buckets.sinf.length)
    ? sec('Vencidas','🔴',buckets.venc)+sec('Hoy','🟡',buckets.hoy)+sec('Esta semana','⚪',buckets.sem)+sec('Más adelante','🗓️',buckets.resto)+sec('Sin fecha','⚪',buckets.sinf)
    : '<div class="muted" style="padding:20px;text-align:center">🎉 Sin pendientes. ¡Bien ahí!</div>';
  return `<div class="op-hello"><h2>Hola, ${u.name.split(' ')[0]}.</h2>
      <div class="muted">${buckets.venc.length+buckets.hoy.length+buckets.sem.length+buckets.resto.length+buckets.sinf.length} pendientes · ${buckets.hoy.length} hoy · <span style="color:var(--bad)">${buckets.venc.length} vencida${buckets.venc.length===1?'':'s'}</span></div></div>
    <div class="op-ctl"><label class="filt"><span class="glabel">Cliente</span><select class="filter-val" onchange="setOpClient(this.value)">${cliOpts}</select></label></div>
    <div class="op-split">
      <div class="op-left"><div class="op-list">${list}</div></div>
      <div class="op-right">${taskPanel()}</div>
    </div>`;
}
/* ===== Ocupación: horas requeridas y semáforo ===== */
const PERF_WEEK_H=40;                        // horas requeridas por semana (ajustable)
const PERF_MONTH_H=PERF_WEEK_H*52/12;        // horas requeridas por mes
function occClass(pct){ return pct>90?'red':pct>=85?'green':pct>=75?'yellow':'red'; }   // 85–90 verde · 75–85 amarillo · <75 y >90 rojo
function occLabel(pct){ return pct>90?'Riesgo de burnout':pct>=85?'En meta':pct>=75?'Por debajo de la meta':'Muy baja ocupación'; }
function localISO(iso){ const d=new Date(iso); return isNaN(d)?'':`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
function perfHist(month){
  const me=currentUser; let sOn=0,sTot=0,tOn=0,tTot=0; const wk={}, mo={};
  store.d.tasks.forEach(t=>{ let last='';
    (t.subtasks||[]).forEach(s=>{ if(s.personId!==me||!s.done) return; const day=s.doneAt?localISO(s.doneAt):(s.date||'');
      if(month && day.slice(0,7)!==month) return;
      if(s.doneAt&&s.date){ sTot++; if(day<=s.date) sOn++; }
      if(day>last) last=day;
      const min=s.timeSpent||0; if(min>0&&day){ const w=mondayOf(day), m=day.slice(0,7); wk[w]=(wk[w]||0)+min; mo[m]=(mo[m]||0)+min; } });
    if(t.responsibleId===me && t.status==='done' && last && t.dueDate){ tTot++; if(last<=t.dueDate) tOn++; } });
  const avg=o=>{ const k=Object.keys(o); return k.length?k.reduce((a,x)=>a+o[x],0)/k.length:0; };
  return {sOn,sTot,tOn,tTot,wkAvg:avg(wk),moAvg:avg(mo),moSum:Object.values(mo).reduce((a,x)=>a+x,0),wkN:Object.keys(wk).length,moN:Object.keys(mo).length};
}
function perfMonthKpis(){
  const h=perfHist(perfMonth); const pc=(a,b)=>b?Math.round(a/b*100):null;
  const sp=pc(h.sOn,h.sTot), tp=pc(h.tOn,h.tTot);
  const occ=(avgMin,req,n,lbl)=>{ const pct=Math.round(avgMin/60/req*100); const cl=n?occClass(pct):'';
    return `<div class="perf-card occ ${cl}"><div class="perf-big">${n?pct+'%':'—'}</div><div class="perf-lbl">${lbl}</div><div class="occ-sub">${n?`${fmtTime(avgMin)} de ${Math.round(req*10)/10} h requeridas`:'Sin horas registradas'}</div>${n?`<div class="occ-tag">${occLabel(pct)}</div>`:''}</div>`; };
  return `<div class="perf-kpis" style="margin-bottom:8px">
      <div class="perf-card"><div class="perf-big">${sp==null?'—':sp+'%'}</div><div class="perf-lbl">Subtareas entregadas a tiempo</div><div class="occ-sub">${h.sOn} de ${h.sTot} hechas</div></div>
      <div class="perf-card"><div class="perf-big">${tp==null?'—':tp+'%'}</div><div class="perf-lbl">Tareas entregadas a tiempo</div><div class="occ-sub">${h.tOn} de ${h.tTot} hechas (donde soy responsable)</div></div>
      ${occ(h.wkAvg,PERF_WEEK_H,h.wkN,'Promedio de horas por semana')}
      ${occ(h.moSum,PERF_MONTH_H,h.moN,'Horas del mes')}
    </div>
    <div class="occ-legend"><span class="occ-dot green"></span> 85–90% en meta <span class="occ-dot yellow"></span> 75–85% por debajo <span class="occ-dot red"></span> menos de 75% o más de 90% (riesgo de burnout) · Promedio semanal sobre las semanas del mes con horas registradas · Requeridas: ${PERF_WEEK_H} h por semana</div>`;
}
function perfData(pid){
  // subtareas MÍAS (asignado) del proyecto pid (o todas si pid null), filtradas por ventana
  const inWin=(s)=>{ if(perfWindow==='hist') return true; const ym=(s.date||'').slice(0,7); return ym===perfMonth; };
  let subDone=0,subTot=0,tiempo=0,atrasos=0; const today=todayISO();
  const tasks=store.d.tasks.filter(t=>!pid||t.projectId===pid);
  tasks.forEach(t=>(t.subtasks||[]).forEach(s=>{ if(s.personId!==currentUser) return; if(!inWin(s)) return;
    subTot++; if(s.done){subDone++; tiempo+=s.timeSpent||0;} else if(s.date&&s.date<today) atrasos++; }));
  const respTasks=tasks.filter(t=>t.responsibleId===currentUser && (perfWindow==='hist'|| (t.dueDate||'').slice(0,7)===perfMonth)).length;
  return {subDone,subTot,tiempo,atrasos,respTasks};
}
function viewMiDesempeno(){
  const u=store.person(currentUser);
  const g=perfData(null);
  const pct=g.subTot?Math.round(g.subDone/g.subTot*100):0;
  const projs=store.d.projects.filter(p=>store.d.tasks.some(t=>t.projectId===p.id&&(t.subtasks||[]).some(s=>s.personId===currentUser)));
  const rows=projs.map(p=>{const d=perfData(p.id); if(!d.subTot&&!d.respTasks) return ''; const c=store.client(p.clientId);
    return `<div class="perf-row"><div class="perf-nm">${c.name} · ${p.name}</div>
      <div class="perf-mt">☑ ${d.subDone}/${d.subTot} · ⏱ ${fmtTime(d.tiempo)} · ${d.atrasos?`<span style="color:var(--bad)">🔴 ${d.atrasos}</span>`:'🟢 0'}</div></div>`;}).join('')||'<div class="muted">Sin datos en esta ventana.</div>';
  // atrasos abiertos (mis subtareas vencidas, siempre "al día de hoy")
  const today=todayISO(); const late=[];
  store.d.tasks.forEach(t=>(t.subtasks||[]).forEach(s=>{ if(s.personId===currentUser && !s.done && s.date && s.date<today){ const p=store.project(t.projectId); const dd=Math.round((new Date(today)-new Date(s.date))/86400000); late.push({name:s.name,proj:store.client(p.clientId).name+'·'+p.name,dias:dd}); }}));
  late.sort((a,b)=>b.dias-a.dias);
  const lateHtml=late.length?late.slice(0,8).map(l=>`<span class="chip">🔴 ${l.name} <span class="muted">(${l.proj}) ${l.dias}d</span></span>`).join(''):'<span class="muted">Sin atrasos abiertos 🎉</span>';
  return `<div class="op-hello"><h2>Mi desempeño</h2><div class="muted">${u.name} · al día de hoy (${dLabel(today)})</div></div>
    <div class="subtoggle" style="margin:4px 0 16px"><button class="${perfWindow==='mes'?'on':''}" onclick="setPerfWin('mes')">Este mes</button><button class="${perfWindow==='hist'?'on':''}" onclick="setPerfWin('hist')">Histórico</button></div>
    ${perfWindow==='mes'?`<div class="kb-month" style="margin:-4px 0 16px"><button onclick="perfShift(-1)" title="Mes anterior">‹</button><span class="kb-month-lbl">${perfMonthLabel()}</span><button onclick="perfShift(1)" title="Mes siguiente">›</button></div>`:''}
    ${perfWindow==='mes'?perfMonthKpis():''}
    <div class="perf-kpis">
      <div class="perf-card"><div class="perf-big">${g.subDone}/${g.subTot}</div><div class="perf-lbl">Subtareas hechas (${pct}%)</div><div class="bar sm"><i style="width:${pct}%"></i></div></div>
      <div class="perf-card"><div class="perf-big">${g.respTasks}</div><div class="perf-lbl">Tareas donde soy responsable</div></div>
      <div class="perf-card"><div class="perf-big">${fmtTime(g.tiempo)}</div><div class="perf-lbl">Tiempo invertido</div></div>
      <div class="perf-card"><div class="perf-big" style="color:${g.atrasos?'var(--bad)':'var(--ok)'}">${g.atrasos}</div><div class="perf-lbl">Subtareas atrasadas</div></div>
    </div>
    <div class="sec-title"><h2 style="font-size:1.1rem">Por proyecto</h2></div>
    <div class="perf-list">${rows}</div>
    <div class="sec-title"><h2 style="font-size:1.1rem">🔴 Atrasos abiertos</h2></div>
    <div class="chiplist">${lateHtml}</div>`;
}
function viewTableros(){
  const projs=store.d.projects.filter(p=>store.d.tasks.some(t=>t.projectId===p.id&&personParticipates(t,currentUser)) || store.d.tasks.some(t=>t.projectId===p.id&&(t.subtasks||[]).some(s=>s.personId===currentUser)));
  const cards=(projs.length?projs:store.d.projects).map(p=>{const c=store.client(p.clientId);const sv=store.service(p.serviceId);const h=projectHealth(p.id);
    return `<div class="card click" onclick="openProject('${p.id}')">
      <div style="display:flex;justify-content:space-between;align-items:start"><div><div class="pill yellow">${sv?sv.name:''}</div><h3 style="margin:8px 0 2px">${p.name}</h3><div class="muted" style="font-size:.85rem">${c.name}</div></div><span class="pill ${h.cls}">${h.icon} ${h.pct}%</span></div></div>`;}).join('');
  return `<div class="op-hello"><h2>Tableros</h2><div class="muted">Consulta (solo lectura) los proyectos en los que participas.</div></div>
    <div class="grid cols-3">${cards||'<div class="muted">Sin proyectos.</div>'}</div>`;
}
function setOpClient(v){opFilterClient=v;render();}
function setPerfWin(w){perfWindow=w;render();}
function perfShift(d){ let [y,m]=perfMonth.split('-').map(Number); m+=d; if(m<1){m=12;y--;} if(m>12){m=1;y++;} perfMonth=y+'-'+String(m).padStart(2,'0'); render(); }
function perfMonthLabel(){ const [y,m]=perfMonth.split('-').map(Number); return MESES[m-1]+' '+y; }

function kbFrente(t){ const p=store.project(t.projectId); const f=p&&store.frentesOf(p.id).find(x=>x.id===t.frenteId); return f||{name:'(sin frente)',color:'#9aa39f'}; }
function kbInvolves(t,pid){ return t.responsibleId===pid || (t.subtasks||[]).some(s=>subInvolves(s,pid)); }
function kbRange(){
  const ab=iso=>MESES[(+iso.split('-')[1])-1].slice(0,3).toLowerCase();
  const WD=['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
  const dnum=iso=>+iso.split('-')[2];
  if(kbScope==='dia'){ const s=kbAnchor; return {start:s,end:s,label:`${WD[isoWeekday(s)]} ${dnum(s)} ${ab(s)}`}; }
  if(kbScope==='semana'){ const s=mondayOf(kbAnchor), e=addDaysISO(s,6); const sameM=s.slice(0,7)===e.slice(0,7);
    return {start:s,end:e,label:sameM?`${dnum(s)}–${dnum(e)} ${ab(s)}`:`${dnum(s)} ${ab(s)} – ${dnum(e)} ${ab(e)}`}; }
  const [y,m]=kbAnchor.split('-').map(Number); const last=new Date(Date.UTC(y,m,0)).getUTCDate();
  const pad=n=>String(n).padStart(2,'0');
  return {start:`${y}-${pad(m)}-01`,end:`${y}-${pad(m)}-${pad(last)}`,label:`${MESES[m-1]} ${y}`};
}
function kbScopeWord(){ return kbScope==='dia'?'el día':kbScope==='semana'?'la semana':'el mes'; }
function setKbScope(s){ kbScope=s; render(); }
function kbShift(dir){
  if(kbScope==='dia') kbAnchor=addDaysISO(kbAnchor,dir);
  else if(kbScope==='semana') kbAnchor=addDaysISO(kbAnchor,dir*7);
  else { let [y,m]=kbAnchor.split('-').map(Number); m+=dir; if(m<1){m=12;y--;} if(m>12){m=1;y++;} kbAnchor=`${y}-${String(m).padStart(2,'0')}-01`; }
  render();
}
function kbToday(){ kbAnchor=todayISO(); render(); }
function setKbGroup(g){kbGroup=g;render();}
function setKbPerson(p){kbPerson=p;render();}
function setKbClient(c){kbClient=c;kbProject='';render();}
function setKbProject(p){kbProject=p;render();}
function openKanban(){kbGroup='frente';kbAnchor=todayISO();kbPerson=currentUser;view='op_kanban';modalTask=null;render();}
function kbCard(t){
  const p=store.project(t.projectId), c=store.client(p.clientId), f=kbFrente(t), resp=store.person(t.responsibleId);
  const done=workSubs(t).filter(s=>s.done).length, tot=workSubs(t).length;
  const overdue=t.dueDate&&t.status!=='done'&&t.dueDate<todayISO();
  return `<div class="kb-card" onclick="openTask('${t.id}')" style="border-left:4px solid ${f.color}">
    <div class="kb-card-nm">${urgMark(taskHasUrgent(t))}${dk(t)}${t.name}</div>
    <div class="kb-card-mt">${c.name} · ${p.name}</div>
    <div class="kb-card-ft"><span class="kb-fr" style="background:${f.color}">${f.name}</span>${avatar(resp,true)}<span class="kb-prog ${done===tot&&tot>0?'ok':''}">☑ ${done}/${tot}</span>${overdue?'<span class="kb-late">🔴</span>':''}</div></div>`;
}
function viewOpKanban(){
  const R=kbRange();
  let tasks=store.d.tasks.filter(t=>t.dueDate && t.dueDate>=R.start && t.dueDate<=R.end);
  if(kbClient) tasks=tasks.filter(t=>store.project(t.projectId).clientId===kbClient);
  if(kbProject) tasks=tasks.filter(t=>t.projectId===kbProject);
  if(kbPerson) tasks=tasks.filter(t=>kbInvolves(t,kbPerson));
  const persOpts='<option value="">👥 Todos</option>'+store.activeStaff().map(u=>`<option value="${u.id}" ${kbPerson===u.id?'selected':''}>${u.name}</option>`).join('');
  const cliOpts='<option value="">🏢 Todos</option>'+store.d.clients.map(c=>`<option value="${c.id}" ${kbClient===c.id?'selected':''}>${c.name}</option>`).join('');
  const projSource=kbClient?store.d.projects.filter(p=>p.clientId===kbClient):store.d.projects;
  const projOpts='<option value="">📁 Todos</option>'+projSource.map(p=>`<option value="${p.id}" ${kbProject===p.id?'selected':''}>${kbClient?p.name:store.client(p.clientId).name+' · '+p.name}</option>`).join('');
  let cols;
  if(kbGroup==='estado'){
    cols=['to-do','in-progress','done','ajuste','on-hold'].map(s=>({label:statusLabel[s],cls:'s-'+s,tasks:tasks.filter(t=>t.status===s)}));
  } else {
    const seen=[]; store.d.frentes.forEach(f=>{ if(tasks.some(t=>t.frenteId===f.id)&&!seen.some(x=>x.name===f.name)) seen.push({name:f.name,color:f.color}); });
    tasks.forEach(t=>{const f=kbFrente(t); if(!seen.some(x=>x.name===f.name)) seen.push({name:f.name,color:f.color});});
    cols=seen.map(f=>({label:f.name,color:f.color,tasks:tasks.filter(t=>kbFrente(t).name===f.name)}));
  }
  const board=cols.map(col=>`<div class="kb-col"><div class="kb-col-h ${col.cls||''}" ${col.color?`style="border-top:3px solid ${col.color}"`:''}>${col.label} <span class="kb-cnt">${col.tasks.length}</span></div><div class="kb-col-body">${col.tasks.map(kbCard).join('')||'<div class="kb-empty">—</div>'}</div></div>`).join('');
  return `<div class="op-hello"><h2>Kanban del equipo</h2><div class="muted">Tareas por ${kbGroup==='estado'?'estado':'frente'} · ${kbClient?store.client(kbClient).name:'todos los clientes'} · ${kbPerson?store.person(kbPerson).name:'todo el equipo'} · ${tasks.length} en ${kbScopeWord()}</div></div>
    <div class="kb-ctl">
      <div class="subtoggle"><button class="${kbGroup==='frente'?'on':''}" onclick="setKbGroup('frente')">Por frente</button><button class="${kbGroup==='estado'?'on':''}" onclick="setKbGroup('estado')">Por estado</button></div>
      <div class="subtoggle"><button class="${kbScope==='dia'?'on':''}" onclick="setKbScope('dia')">Día</button><button class="${kbScope==='semana'?'on':''}" onclick="setKbScope('semana')">Semana</button><button class="${kbScope==='mes'?'on':''}" onclick="setKbScope('mes')">Mes</button></div>
      <div class="kb-month"><button onclick="kbShift(-1)" title="Anterior">‹</button><span class="kb-month-lbl">${R.label}</span><button onclick="kbShift(1)" title="Siguiente">›</button></div>
      <button class="btn ghost sm" onclick="kbToday()">Hoy</button>
      <label class="filt"><span class="glabel">Cliente</span><select class="filter-val" onchange="setKbClient(this.value)">${cliOpts}</select></label>
      <label class="filt"><span class="glabel">Proyecto</span><select class="filter-val" onchange="setKbProject(this.value)">${projOpts}</select></label>
      <label class="filt"><span class="glabel">Persona</span><select class="filter-val" onchange="setKbPerson(this.value)">${persOpts}</select></label>
      <button class="btn sm" style="margin-left:auto" onclick="openKbTask()">+ Nueva tarea</button>
    </div>
    <div class="kb-board">${board||`<div class="muted" style="padding:20px">Sin tareas en ${kbScopeWord()}.</div>`}</div>`;
}

/* ============ GESTIÓN (vista de mando PM) ============ */
function openGestion(){ view='gestion'; modalTask=null; gestAnchor=todayISO(); gestSub='asig';
  let last=null; try{ last=localStorage.getItem('gestLast_'+currentUser); }catch(_){}
  const f=last&&gestFilters().find(x=>x.id===last); if(f) applyGestFilter(f.id,true); else clearGestFilter(true);
  render(); }
/* ===== Vistas (filtros guardados por usuario): clientes + personas + periodo ===== */
function gestFilters(){ const u=store.d.staff.find(x=>x.id===currentUser); if(u&&Array.isArray(u.gestFilters)&&u.gestFilters.length) return u.gestFilters;
  try{ return JSON.parse(localStorage.getItem('gestFilters_'+currentUser)||'[]'); }catch(_){ return []; } }
function saveGestFilters(list){ try{ localStorage.setItem('gestFilters_'+currentUser,JSON.stringify(list)); }catch(_){}
  const u=store.d.staff.find(x=>x.id===currentUser); if(u) store.updateStaff(u.id,{gestFilters:list}); }
function applyGestFilter(id,silent){ const f=gestFilters().find(x=>x.id===id); if(!f) return;
  gestFilterId=f.id; gestClients=(f.clients||[]).slice(); gestPeople=(f.people||[]).slice(); gestScope=f.scope||'mes'; gestProject=''; gestPerson='';
  try{ localStorage.setItem('gestLast_'+currentUser,f.id); }catch(_){} if(!silent) render(); }
function clearGestFilter(silent){ gestFilterId=null; gestClients=[]; gestPeople=[]; gestProject=''; gestPerson='';
  try{ localStorage.removeItem('gestLast_'+currentUser); }catch(_){} if(!silent) render(); }
function gestPass(x){ return (!gestClients.length||gestClients.includes(x.p.clientId)) && (!gestPeople.length||gestPeople.includes(x.s.personId)); }
function openGestFilterForm(id){ const f=id?gestFilters().find(x=>x.id===id):null; qm={kind:'gestFilter',fid:id||null,f:f||{name:'',clients:[],people:[],scope:gestScope}}; render(); }
function saveGestFilter(){ const name=(val('gf-name')||'').trim(); if(!name){alert('Ponle un nombre a la vista.');return;}
  const clients=[...document.querySelectorAll('.gf-cl:checked')].map(x=>x.value), people=[...document.querySelectorAll('.gf-pe:checked')].map(x=>x.value);
  const scope=(document.querySelector('input[name=gf-scope]:checked')||{}).value||'mes';
  const list=gestFilters().slice(); const f={id:qm.fid||('gf_'+Date.now()),name,clients,people,scope};
  const i=list.findIndex(x=>x.id===f.id); if(i>=0) list[i]=f; else list.push(f);
  saveGestFilters(list); qm=null; applyGestFilter(f.id); }
function delGestFilter(){ if(!confirm('¿Eliminar esta vista?')) return; saveGestFilters(gestFilters().filter(x=>x.id!==qm.fid)); if(gestFilterId===qm.fid) clearGestFilter(true); qm=null; render(); }
function setGestSub(v){ gestSub=v; if(v==='citas'||v==='min') gestScope='mes'; else if(gestScope==='todo') gestScope='mes'; render(); }
function setGestScope(s){ gestScope=s; render(); }
function setGestProject(v){ gestProject=v; render(); }
function setGestPerson(v){ gestPerson=v; render(); }
function sundayOf(iso){ return addDaysISO(iso, -isoWeekday(iso)); }
function gestRange(){
  const pad=n=>String(n).padStart(2,'0');
  if(gestScope==='todo') return {start:'0000-01-01',end:'9999-12-31'};
  if(gestScope==='dia') return {start:gestAnchor,end:gestAnchor};
  if(gestScope==='semana'){ const s=sundayOf(gestAnchor); return {start:s,end:addDaysISO(s,6)}; }
  const [y,m]=gestAnchor.split('-').map(Number); const last=new Date(Date.UTC(y,m,0)).getUTCDate();
  return {start:`${y}-${pad(m)}-01`,end:`${y}-${pad(m)}-${pad(last)}`};
}
function gestRangeLabel(R){
  const ab=iso=>MESES[(+iso.split('-')[1])-1].slice(0,3).toLowerCase();
  const WD=['Dom','Lun','Mar','Mié','Jue','Vie','Sáb']; const dn=iso=>+iso.split('-')[2];
  if(gestScope==='todo') return 'Todo el historial';
  if(gestScope==='dia') return `${WD[isoWeekday(gestAnchor)]} ${dn(gestAnchor)} ${ab(gestAnchor)} ${gestAnchor.slice(0,4)}`;
  if(gestScope==='semana'){ const s=R.start,e=R.end; return `${dn(s)} ${ab(s)} – ${dn(e)} ${ab(e)}`; }
  const [y,m]=gestAnchor.split('-').map(Number); return `${MESES[m-1]} ${y}`;
}
function gestShift(dir){
  if(gestScope==='todo') return;
  if(gestScope==='dia') gestAnchor=addDaysISO(gestAnchor,dir);
  else if(gestScope==='semana') gestAnchor=addDaysISO(gestAnchor,dir*7);
  else { let [y,m]=gestAnchor.split('-').map(Number); m+=dir; if(m<1){m=12;y--;} if(m>12){m=1;y++;} gestAnchor=`${y}-${String(m).padStart(2,'0')}-01`; }
  render();
}
function gestGoDay(iso){ gestScope='dia'; gestAnchor=iso; render(); }
function gestSubs(){ const out=[]; store.d.tasks.forEach(t=>{ const p=store.project(t.projectId); if(!p) return; const c=store.client(p.clientId); (t.subtasks||[]).forEach(s=>{ if(s.date) out.push({s,t,p,c}); }); }); return out; }
function viewGestion(){
  const R=gestRange();
  const projOpts='<option value="">Todos los proyectos</option>'+store.d.projects.map(p=>`<option value="${p.id}" ${gestProject===p.id?'selected':''}>${store.client(p.clientId).name} · ${p.name}</option>`).join('');
  const persOpts='<option value="">Equipo Nuwek</option>'+store.activeStaff().map(u=>`<option value="${u.id}" ${gestPerson===u.id?'selected':''}>${u.name}</option>`).join('');
  const body = gestSub==='asig' ? gestAsignaciones(R) : gestSub==='citas' ? gestCitas() : gestSub==='min' ? gestMinutas() : gestCalendar(R);
  return `<div class="op-hello"><h2>Gestión</h2><div class="muted">Vista de mando · ${gestSub==='asig'?'quién trabaja en qué':'calendario del equipo'}</div></div>
    <div class="subtoggle gest-tabs"><button class="${gestSub==='cal'?'on':''}" onclick="setGestSub('cal')">Calendario</button><button class="${gestSub==='asig'?'on':''}" onclick="setGestSub('asig')">Asignaciones</button><button class="${gestSub==='citas'?'on':''}" onclick="setGestSub('citas')">📅 Citas</button><button class="${gestSub==='min'?'on':''}" onclick="setGestSub('min')">📝 Minutas</button></div>
    <div class="gf-bar"><span class="glabel">Vistas</span>
      <button class="gf-chip${gestFilterId?'':' on'}" onclick="clearGestFilter()">Todo</button>
      ${gestFilters().map(f=>`<button class="gf-chip${f.id===gestFilterId?' on':''}" onclick="applyGestFilter('${f.id}')">${esc(f.name)}${f.id===gestFilterId?` <span class="gf-ed" title="Editar vista" onclick="event.stopPropagation();openGestFilterForm('${f.id}')">✏️</span>`:''}</button>`).join('')}
      <button class="gf-chip gf-new" onclick="openGestFilterForm()">+ Nueva vista</button>
    </div>
    <div class="kb-ctl">
      <div class="subtoggle"><button class="${gestScope==='dia'?'on':''}" onclick="setGestScope('dia')">Hoy</button><button class="${gestScope==='semana'?'on':''}" onclick="setGestScope('semana')">Semana</button><button class="${gestScope==='mes'?'on':''}" onclick="setGestScope('mes')">Mes</button>${gestSub==='min'?`<button class="${gestScope==='todo'?'on':''}" onclick="setGestScope('todo')">Todo</button>`:''}</div>
      <label class="filt"><span class="glabel">Proyecto</span><select class="filter-val" onchange="setGestProject(this.value)">${projOpts}</select></label>
      <label class="filt"><span class="glabel">Persona</span><select class="filter-val" onchange="setGestPerson(this.value)">${persOpts}</select></label>
      <div class="kb-month"><button onclick="gestShift(-1)" title="Anterior">‹</button><span class="kb-month-lbl">${gestRangeLabel(R)}</span><button onclick="gestShift(1)" title="Siguiente">›</button></div>
      <button class="btn sm" style="margin-left:auto" onclick="openKbTask()">+ Tarea</button>
    </div>
    ${(gestSub==='cal'||gestSub==='citas')?tipoLegend():''}
    ${body}`;
}
/* ---- color distintivo por tipo de actividad (calendarios): cliente=verde · equipo=azul · trabajo solo=amarillo; editable: morado, gris, rojo ---- */
const SUBCOL={verde:['#2f9e5b','Con cliente'],azul:['#2f6fd6','Con el equipo'],amarillo:['#e0a800','Trabajo solo'],morado:['#7d4fd1','Morado'],gris:['#8a948f','Gris'],rojo:['#d23b3b','Rojo (vacaciones / incapacidad)']};
function subTipo(s,t){ let m=s; if(!(m&&m.color&&SUBCOL[m.color])&&s&&s.seriesId&&t) m=(t.subtasks||[]).find(x=>x.id===s.seriesId)||s; if(m&&m.color&&SUBCOL[m.color]) return m.color; const k=citaKind(s); return k==='cliente'?'verde':k==='interna'?'azul':'amarillo'; }
function tipoCol(s,t){ return SUBCOL[subTipo(s,t)][0]; }
function tipoDot(s,t){ const k=subTipo(s,t); return `<i class="tp-dot" style="background:${SUBCOL[k][0]}" title="${SUBCOL[k][1]}"></i>`; }
function tipoLegend(){ return `<div class="tp-leg">${['verde','azul','amarillo'].map(k=>`<span><i class="tp-dot" style="background:${SUBCOL[k][0]}"></i>${SUBCOL[k][1]}</span>`).join('')}<span class="muted">· otros colores: se eligen al editar la subtarea</span></div>`; }
function gestChip(it){ const fr=kbFrente(it.t); return `<div class="gc-chip" style="border-left:4px solid ${tipoCol(it.s,it.t)}" title="${esc(it.s.name)} · ${it.c.name} · ${it.p.name} · ${fr.name}" onclick="openTask('${it.t.id}')">${tipoDot(it.s,it.t)}${it.s.time?`<b>${it.s.time}</b> `:''}${esc(it.s.name)}</div>`; }
function gestCalendar(R){
  let all=gestSubs().filter(gestPass); if(gestProject) all=all.filter(x=>x.p.id===gestProject); if(gestPerson) all=all.filter(x=>x.s.personId===gestPerson);
  const byDay={}; all.forEach(x=>{ (byDay[x.s.date]=byDay[x.s.date]||[]).push(x); });
  if(gestScope==='dia') return gestDayView(byDay);
  if(gestScope==='semana') return gestWeekView(byDay);
  return gestMonthView(byDay);
}
function citaChip(it){ const {s,t,c,est}=it; return `<div class="gc-chip" style="border-left:3px solid ${est.c};background:${est.bg}" title="${esc(s.name)} · ${esc(c.name)} · ${est.t}" onclick="openTask('${t.id}')">${tipoDot(s,t)}${s.time?`<b>${s.time}</b> `:''}${esc(s.name)} <span class="muted">· ${esc(c.name)}</span></div>`; }
function gestCitas(){ let all=citasAll().filter(x=>x.s.date); if(gestClients.length) all=all.filter(x=>gestClients.includes(x.p.clientId)); if(gestProject) all=all.filter(x=>x.p.id===gestProject);
  const byDay={}; all.forEach(x=>{ (byDay[x.s.date]=byDay[x.s.date]||[]).push(x); }); Object.values(byDay).forEach(a=>a.sort((x,y)=>(x.s.time||'')<(y.s.time||'')?-1:1));
  if(gestPerson) all=all.filter(x=>x.s.personId===gestPerson);
  const R=gestRange(); const mi=all.filter(x=>x.s.date>=R.start&&x.s.date<=R.end); const n=k=>mi.filter(x=>x.est.k===k).length;
  const view=gestScope==='dia'?(mi.length?`<div class="cita-list">${mi.slice().sort((a,b)=>(a.s.time||'')<(b.s.time||'')?-1:1).map(x=>citaCard(x,true,false)).join('')}</div>`:'<div class="gc-day"><div class="muted" style="padding:24px;text-align:center">Sin citas este día.</div></div>'):gestScope==='semana'?gestWeekView(byDay,citaChip):gestMonthView(byDay,citaChip);
  return `<div class="cita-leg"><span style="color:#1f7a44">● Confirmadas ${n('confirmado')}</span><span style="color:#9a7a00">● Piden reprogramar ${n('reprogramar')}</span><span style="color:#c0392b">● Canceladas ${n('cancelado')}</span><span style="color:#6b7a73">● Sin respuesta ${n('pendiente')}</span></div>`+view; }
function gestMonthView(byDay,chipFn){ chipFn=chipFn||gestChip;
  const pad=n=>String(n).padStart(2,'0'); const [y,m]=gestAnchor.split('-').map(Number);
  const last=new Date(Date.UTC(y,m,0)).getUTCDate();
  const firstISO=`${y}-${pad(m)}-01`, lastISO=`${y}-${pad(m)}-${pad(last)}`;
  const startSun=addDaysISO(firstISO,-isoWeekday(firstISO)), endSat=addDaysISO(lastISO,6-isoWeekday(lastISO));
  const WD=['DOM','LUN','MAR','MIÉ','JUE','VIE','SÁB']; const today=todayISO();
  let cells=''; let cur=startSun;
  while(cur<=endSat){
    const inMonth=cur.slice(0,7)===`${y}-${pad(m)}`; const items=byDay[cur]||[]; const MAXC=3;
    const shown=items.slice(0,MAXC).map(chipFn).join('');
    const more=items.length>MAXC?`<div class="gc-more" onclick="gestGoDay('${cur}')">+${items.length-MAXC} más</div>`:'';
    cells+=`<div class="gc-cell ${inMonth?'':'out'} ${cur===today?'today':''}"><div class="gc-dn">${+cur.split('-')[2]}</div>${shown}${more}</div>`;
    cur=addDaysISO(cur,1);
  }
  return `<div class="gc-grid"><div class="gc-wdhead">${WD.map(d=>`<div class="gc-wd">${d}</div>`).join('')}</div><div class="gc-cells">${cells}</div></div>`;
}
function gestWeekView(byDay,chipFn){ chipFn=chipFn||gestChip;
  const s=sundayOf(gestAnchor); const WD=['DOM','LUN','MAR','MIÉ','JUE','VIE','SÁB']; const today=todayISO();
  let cols='';
  for(let i=0;i<7;i++){ const day=addDaysISO(s,i); const items=(byDay[day]||[]).slice().sort((a,b)=>(a.s.time||'')<(b.s.time||'')?-1:1);
    const chips=items.map(chipFn).join('')||'<div class="gc-none">—</div>';
    cols+=`<div class="gc-wcol"><div class="gc-wh ${day===today?'today':''}">${WD[i]} ${+day.split('-')[2]}</div><div class="gc-wbody">${chips}</div></div>`;
  }
  return `<div class="gc-week">${cols}</div>`;
}
function gestDayView(byDay){
  const day=gestAnchor; const items=(byDay[day]||[]).slice().sort((a,b)=>(a.s.time||'')<(b.s.time||'')?-1:1);
  if(!items.length) return `<div class="gc-day"><div class="muted" style="padding:24px;text-align:center">Sin actividades este día.</div></div>`;
  const rows=items.map(it=>{ const fr=kbFrente(it.t); const per=store.person(it.s.personId);
    return `<div class="gc-drow" onclick="openTask('${it.t.id}')" style="border-left:5px solid ${tipoCol(it.s,it.t)}">
      <div class="gc-dtime">${it.s.time||'—'}</div>
      <div class="gc-dmain"><div class="gc-dname">${tipoDot(it.s,it.t)}${it.s.done?'✓ ':''}${esc(it.s.name)}</div><div class="gc-dmeta">${it.c.name} · ${it.p.name} · ${fr.name} · ${avatar(per,true)} ${per.name}</div></div>
      <div class="gc-ddur">${fmtDurShort(it.s.durMin||30)}</div></div>`;
  }).join('');
  return `<div class="gc-day">${rows}</div>`;
}
function gestAsignaciones(R){
  let all=gestSubs().filter(gestPass).filter(x=>x.s.date>=R.start && x.s.date<=R.end);
  if(gestProject) all=all.filter(x=>x.p.id===gestProject);
  if(gestPerson) all=all.filter(x=>x.s.personId===gestPerson);
  const staff=(gestPerson?store.activeStaff().filter(u=>u.id===gestPerson):store.activeStaff()).filter(u=>!gestPeople.length||gestPeople.includes(u.id));
  const projects=(gestProject?store.d.projects.filter(p=>p.id===gestProject):store.d.projects).filter(p=>!gestClients.length||gestClients.includes(p.clientId));
  const head=`<th class="ga-proj-h">PROYECTO</th>`+staff.map(u=>`<th class="ga-ph"><div class="ga-phin">${avatar(u,true)}<span>${u.name}</span></div></th>`).join('');
  const rows=projects.map(p=>{ const c=store.client(p.clientId); const fc=(store.frentesOf(p.id)[0]||{}).color||'#8a9a93'; const sv=store.service(p.serviceId);
    const cells=staff.map(u=>{ const items=all.filter(x=>x.p.id===p.id && x.s.personId===u.id);
      const byT=[]; items.forEach(it=>{ let g=byT.find(x=>x.t.id===it.t.id); if(!g){ g={t:it.t,list:[]}; byT.push(g); } g.list.push(it); });
      const chips=byT.map(g=>{ const pend=g.list.filter(x=>!x.s.done); const tip=g.list.map(x=>(x.s.done?'✓ ':'• ')+x.s.name+(x.s.date?' ('+dLabel(x.s.date)+')':'')).slice(0,12).join('\n');
        return `<div class="ga-chip ga-task" title="${esc(tip)}" onclick="openTask('${g.t.id}')"><span class="ga-tn">${esc(g.t.name)}</span><span class="ga-n ${pend.length?'':'ok'}">${pend.length?pend.length:'✓'}</span></div>`; }).join('')||'<div class="ga-none">—</div>';
      return `<td class="ga-cell">${chips}</td>`; }).join('');
    return `<tr><td class="ga-proj"><span class="ga-dot" style="background:${fc}"></span><div class="ga-pinfo"><div class="ga-pn">${c.name}</div><div class="ga-ps">${sv?sv.name:''}</div></div></td>${cells}</tr>`;
  }).join('');
  return `<div class="ga-scroll"><table class="ga-tbl"><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table></div>`;
}

/* ============ AGENDA (carga por persona) ============ */
function addDaysISO(iso,n){ const [y,m,d]=iso.split('-').map(Number); const dt=new Date(Date.UTC(y,m-1,d)); dt.setUTCDate(dt.getUTCDate()+n); return dt.toISOString().slice(0,10); }
function isoWeekday(iso){ const [y,m,d]=iso.split('-').map(Number); return new Date(Date.UTC(y,m-1,d)).getUTCDay(); }
function participationSubs(pid){ const out=[]; store.d.tasks.forEach(t=>(t.subtasks||[]).forEach(s=>{ if(!s.done&&(s.team||[]).includes(pid)&&s.personId!==pid) out.push({s,t,part:true}); })); return out; }
function personSubtasks(pid,onlyPending){ const out=[]; store.d.tasks.forEach(t=>(t.subtasks||[]).forEach(s=>{ if(s.personId===pid && (!onlyPending||!s.done)) out.push({s,t}); })); return out; }
function mondayOf(iso){ const wd=isoWeekday(iso); const diff=wd===0?-6:(1-wd); return addDaysISO(iso,diff); }
function openAgenda(){ agPerson=currentUser; agStart=mondayOf(todayISO()); view='op_agenda'; modalTask=null; opSelTask=null; render(); }
function setAgPerson(p){ agPerson=p; render(); }
function agShift(d){ agStart=addDaysISO(agStart,d); render(); }
function agToday(){ agStart=mondayOf(todayISO()); render(); }
function agRangeLabel(days){ const dn=i=>+days[i].split('-')[2]; const last=days.length-1; const ab=MESES[(+days[last].split('-')[1])-1].slice(0,3).toLowerCase(); return `${dn(0)}–${dn(last)} ${ab}`; }
const AG={H0:7,H1:21,rowH:46};
function agCanEdit(){ return agPerson===currentUser || !isColab(); }
function agSelInfo(){ if(!agSel) return null; const t=store.task(agSel.tid); const sub=t&&(t.subtasks||[]).find(x=>x.id===agSel.sid); return (t&&sub)?{t,s:sub}:null; }
function openAgItem(tid,sid){ agSel={tid,sid}; const t=store.task(tid); const sub=t&&(t.subtasks||[]).find(x=>x.id===sid); if(sub&&sub.date) agStart=mondayOf(sub.date); openTask(tid); }
function agGoDeadline(){ const si=agSelInfo(); if(si&&si.t.dueDate){ agStart=mondayOf(si.t.dueDate); render(); } }
function agCalendar(days,pid){
  const {H0,H1,rowH}=AG, slots=H1-H0;
  const WD=['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
  const today=todayISO(); const si=agSelInfo(); const canEdit=agCanEdit();
  const hourLabels=[]; for(let h=H0;h<H1;h++) hourLabels.push(`<div class="ag-hr" style="height:${rowH}px">${h}:00</div>`);
  let anyOff=false;
  const cols=days.map(day=>{
    const subs=[]; store.d.tasks.forEach(t=>(t.subtasks||[]).forEach(s=>{ if(s.date===day && s.time && (s.personId===pid||(s.team||[]).includes(pid))) subs.push({s,t,part:s.personId!==pid}); }));
    const off=[];
    const blocks=subs.map(it=>{ const [hh,mm]=(it.s.time||'10:00').split(':').map(Number); const startMin=hh*60+mm; if(startMin<H0*60||startMin>=H1*60){ off.push(it); return ''; }
      const top=(startMin-H0*60)/60*rowH; const dur=+it.s.durMin||30; const height=Math.max(dur/60*rowH,20); const f=kbFrente(it.t); const c=store.client(store.project(it.t.projectId).clientId);
      const sel=agSel&&agSel.sid===it.s.id;
      const canDrag=canEdit&&!it.part;
      return `<div class="ag-block${sel?' sel':''}${it.s.done?' done':''}${it.part?' part':''}" data-tid="${it.t.id}" data-sid="${it.s.id}" style="top:${top}px;height:${height}px;background:${f.color};border-left:6px solid ${tipoCol(it.s,it.t)}" title="${esc(it.s.name)} · ${c.name} · ${f.name} · ${it.s.time} · ${fmtDurShort(dur)}" ${canDrag?`onpointerdown="agBlockDown(event)"`:`onclick="openAgItem('${it.t.id}','${it.s.id}')"`}><div class="ag-bl-nm">${tipoDot(it.s,it.t)}${it.part?'🤝 ':''}${urgMark(it.s.urgent||it.t.urgent)}${it.s.done?'✓ ':''}${esc(it.s.name)}</div><div class="ag-bl-sub">${c.name} · ${f.name}</div><div class="ag-bl-mt">${it.s.time} · ${fmtDurShort(dur)}</div>${canDrag?'<div class="ag-rs" title="Arrastra para cambiar la duración" onpointerdown="agResizeDown(event)"></div>':''}</div>`;
    }).join('');
    if(off.length) anyOff=true;
    const lines=[]; for(let k=0;k<slots;k++) lines.push(`<div class="ag-line" style="top:${k*rowH}px"></div>`);
    const load=subs.filter(x=>!x.part).reduce((a,it)=>a+(+it.s.durMin||30),0);
    const isDl=si&&si.t.dueDate===day;
    const dl=isDl?`<div class="ag-dl-lbl" title="Fecha límite de «${esc(si.t.name)}»">🏁 Deadline · ${esc(si.t.name)}</div>`:'';
    return {day,html:(offFoot)=>`<div class="ag-day${isDl?' deadline':''}"><div class="ag-day-h ${day===today?'today':''}">${WD[isoWeekday(day)]} ${(+day.split('-')[2])} ${load?`<span class="ag-load">${fmtDurShort(load)}</span>`:''}${isDl?'<span class="ag-dl-flag">🏁</span>':''}</div><div class="ag-day-body" data-day="${day}" style="height:${slots*rowH}px" ondragover="agListOver(event)" ondragleave="agListLeave(event)" ondrop="agListDrop(event)">${lines.join('')}${dl}${blocks||''}</div>${offFoot?`<div class="ag-off">${off.length?off.map(it=>`<div class="ag-off-it" onclick="openAgItem('${it.t.id}','${it.s.id}')" title="Fuera del horario 7:00–21:00">⏰ ${it.s.time} · ${esc(it.s.name)}</div>`).join(''):''}</div>`:''}</div>`};
  });
  const dayCols=cols.map(c=>c.html(anyOff)).join('');
  const hoursCol=`<div class="ag-hours"><div class="ag-hours-sp"></div>${hourLabels.join('')}</div>`;
  return `<div class="ag-cal">${hoursCol}${dayCols}</div>`;
}
/* ---- hover sobre el TÍTULO del bloque: etiquetas de estatus (el tooltip de la tarjeta se conserva) ---- */
function agPopHide(){ const p=document.getElementById('ag-pop'); if(p) p.remove(); const b=document.querySelector('.ag-block[data-title-held]'); if(b){ b.setAttribute('title',b.dataset.titleHeld); b.removeAttribute('data-title-held'); } }
function agPopShow(nm){
  const blk=nm.closest('.ag-block'); if(!blk) return; const t=store.task(blk.dataset.tid); const sub=t&&(t.subtasks||[]).find(x=>x.id===blk.dataset.sid); if(!sub) return;
  agPopHide(); if(blk.hasAttribute('title')){ blk.dataset.titleHeld=blk.getAttribute('title'); blk.removeAttribute('title'); }
  const today=todayISO(); const late=!sub.done&&sub.date&&sub.date<today; const per=store.person(sub.personId);
  const chips=[
    `<span class="agp-chip badge s-${t.status}">Tarea · ${statusLabel[t.status]||t.status}</span>`,
    sub.done?`<span class="agp-chip" style="background:#3f9d6d">✓ Subtarea hecha</span>`:late?`<span class="agp-chip" style="background:#c0392b">⚠ Subtarea atrasada</span>`:`<span class="agp-chip" style="background:#6b7a73">Subtarea pendiente</span>`,
    t.dueDate?`<span class="agp-chip" style="background:${(t.status!=='done'&&t.dueDate<today)?'#c0392b':'#2c6b4c'}">🏁 ${dLabel(t.dueDate)}</span>`:'',
    ...(t.tags||[]).map(g=>`<span class="agp-chip" style="background:${store.tagColor(g)}">${esc(g)}</span>`)
  ].join('');
  const pop=document.createElement('div'); pop.id='ag-pop'; pop.innerHTML=`<div class="agp-t">${esc(sub.name)}</div><div class="agp-s">${esc(t.name)} · ${esc(per.name||'')}</div><div class="agp-chips">${chips}</div>`;
  document.body.appendChild(pop); const r=nm.getBoundingClientRect(), pw=pop.offsetWidth, ph=pop.offsetHeight;
  let x=Math.min(Math.max(8,r.left),innerWidth-pw-8), y=r.bottom+6; if(y+ph>innerHeight-8) y=Math.max(8,r.top-ph-6);
  pop.style.left=x+'px'; pop.style.top=y+'px';
}
document.addEventListener('mouseover',ev=>{ const nm=ev.target.closest&&ev.target.closest('.ag-bl-nm'); if(nm){ if(!nm._agp){ nm._agp=1; } agPopShow(nm); } });
document.addEventListener('mouseout',ev=>{ const nm=ev.target.closest&&ev.target.closest('.ag-bl-nm'); if(nm && !(ev.relatedTarget&&nm.contains(ev.relatedTarget))) agPopHide(); });
document.addEventListener('pointerdown',agPopHide,true);
/* ---- arrastrar / redimensionar bloques ---- */
function agSnap(min){ return Math.round(min/15)*15; }
function agBlockDown(ev){
  if(ev.button!==0 || ev.target.classList.contains('ag-rs')) return;
  const el=ev.currentTarget; const tid=el.dataset.tid, sid=el.dataset.sid; const x0=ev.clientX, y0=ev.clientY; let moved=false;
  const step=AG.rowH/4; const onMove=e=>{ if(!moved && Math.abs(e.clientX-x0)+Math.abs(e.clientY-y0)<5) return; moved=true; el.classList.add('dragging'); el.style.transform=`translate(${e.clientX-x0}px,${Math.round((e.clientY-y0)/step)*step}px)`; el.style.zIndex=20; };
  const onUp=e=>{ document.removeEventListener('pointermove',onMove); document.removeEventListener('pointerup',onUp);
    if(!moved){ openAgItem(tid,sid); return; }
    const blkTop=el.getBoundingClientRect().top; el.style.transform=''; el.classList.remove('dragging');
    const body=[...document.elementsFromPoint(e.clientX,e.clientY)].find(n=>n.classList&&n.classList.contains('ag-day-body'));
    if(!body){ render(); return; }
    const t=store.task(tid); const sub=t.subtasks.find(x=>x.id===sid); const dur=+sub.durMin||30;
    const r=body.getBoundingClientRect(); const topPx=(blkTop-r.top);   // posición real del bloque soltado
    let min=AG.H0*60+agSnap(topPx/AG.rowH*60); min=Math.max(AG.H0*60,Math.min(min,AG.H1*60-Math.max(dur,15)));
    const time=String(Math.floor(min/60)).padStart(2,'0')+':'+String(min%60).padStart(2,'0');
    if(body.dataset.day!==sub.date && !canSubDate()){ alert(SUB_DATE_MSG+' Puedes cambiar la hora dentro del mismo día.'); render(); return; }
    depApply(tid,sid,{date:body.dataset.day,time},()=>{ logEvent(tid,'Movió la subtarea «'+sub.name+'» a '+body.dataset.day+' '+time); agSel={tid,sid}; render(); }); };
  document.addEventListener('pointermove',onMove); document.addEventListener('pointerup',onUp);
}
function agResizeDown(ev){
  ev.stopPropagation(); ev.preventDefault(); const blk=ev.currentTarget.parentElement; const tid=blk.dataset.tid, sid=blk.dataset.sid; const y0=ev.clientY; const h0=blk.getBoundingClientRect().height;
  const mt=blk.querySelector('.ag-bl-mt'); const t0=(blk.querySelector('.ag-bl-mt').textContent.split(' · ')[0]||''); blk.classList.add('resizing');
  const onMove=e=>{ const dur=Math.max(15,agSnap((h0+(e.clientY-y0))/AG.rowH*60)); blk.style.height=(dur/60*AG.rowH)+'px'; if(mt) mt.textContent=t0+' · '+fmtDurShort(dur); };
  const onUp=e=>{ document.removeEventListener('pointermove',onMove); document.removeEventListener('pointerup',onUp);
    const h=blk.getBoundingClientRect().height; let dur=Math.max(15,agSnap(h/AG.rowH*60));
    const t=store.task(tid); const sub=t.subtasks.find(x=>x.id===sid); const [hh,mm]=(sub.time||'10:00').split(':').map(Number); dur=Math.min(dur,AG.H1*60-(hh*60+mm));
    blk.classList.remove('resizing'); depApply(tid,sid,{durMin:dur},()=>{ logEvent(tid,'Cambió la duración de «'+sub.name+'» a '+fmtDurShort(dur)); render(); }); };
  document.addEventListener('pointermove',onMove); document.addEventListener('pointerup',onUp);
}
/* ---- arrastrar desde la lista al calendario ---- */
function agListStart(ev,tid,sid){ agListDrag={tid,sid}; ev.dataTransfer.effectAllowed='move'; try{ev.dataTransfer.setData('text/plain',sid);}catch(_){} }
function agListEnd(){ agListDrag=null; document.querySelectorAll('.ag-day-body.drop-on').forEach(x=>x.classList.remove('drop-on')); }
function agListOver(ev){ if(!agListDrag) return; ev.preventDefault(); ev.currentTarget.classList.add('drop-on'); }
function agListLeave(ev){ ev.currentTarget.classList.remove('drop-on'); }
function agListDrop(ev){ if(!agListDrag) return; ev.preventDefault(); const body=ev.currentTarget; const d=agListDrag; agListEnd();
  const t=store.task(d.tid); const sub=t.subtasks.find(x=>x.id===d.sid); const dur=+sub.durMin||30;
  const r=body.getBoundingClientRect(); let min=AG.H0*60+agSnap((ev.clientY-r.top)/AG.rowH*60); min=Math.max(AG.H0*60,Math.min(min,AG.H1*60-Math.max(dur,15)));
  const time=String(Math.floor(min/60)).padStart(2,'0')+':'+String(min%60).padStart(2,'0');
  if(body.dataset.day!==sub.date && !canSubDate()){ alert(SUB_DATE_MSG+' Puedes colocarla en su mismo día.'); agSel=d; render(); return; }
  depApply(d.tid,d.sid,{date:body.dataset.day,time},()=>{ logEvent(d.tid,'Agendó la subtarea «'+sub.name+'» el '+body.dataset.day+' '+time); agSel=d; render(); }); }
function agNotes(days){ let h=''; const si=agSelInfo();
  if(si&&si.t.dueDate&&!days.includes(si.t.dueDate)) h+=`<button class="ag-note dl" onclick="agGoDeadline()" title="Ir a la semana del deadline">🏁 Deadline de «${esc(si.t.name)}»: ${dLabel(si.t.dueDate)} ${si.t.dueDate<days[0]?'←':'→'}</button>`;
  const wk=[]; store.d.tasks.forEach(t=>(t.subtasks||[]).forEach(x=>{ if(x.personId===agPerson&&x.date&&x.time&&!x.done&&[0,6].includes(isoWeekday(x.date))&&x.date>=addDaysISO(days[0],-1)&&x.date<=addDaysISO(days[4],2)) wk.push(x); }));
  const wkIn=wk.filter(x=>x.date>=days[0]&&x.date<=addDaysISO(days[4],2)); if(wkIn.length) h+=`<span class="ag-note" title="${esc(wkIn.map(x=>x.name).join(' · '))}">🗓️ ${wkIn.length} subtarea${wkIn.length>1?'s':''} en fin de semana</span>`;
  return h; }
function viewAgenda(){
  const per=store.person(agPerson);
  const persOpts=store.activeStaff().map(u=>`<option value="${u.id}" ${agPerson===u.id?'selected':''}>${u.name}</option>`).join('');
  const days=[0,1,2,3,4].map(i=>addDaysISO(agStart,i));
  const items=personSubtasks(agPerson,true).concat(participationSubs(agPerson));
  const today=todayISO(); const wkStr=addDaysISO(today,7);
  const buckets={venc:[],hoy:[],sem:[],resto:[],sinf:[]};
  items.forEach(it=>{const d=it.s.date; if(!d)buckets.sinf.push(it); else if(d<today)buckets.venc.push(it); else if(d===today)buckets.hoy.push(it); else if(d<=wkStr)buckets.sem.push(it); else buckets.resto.push(it);});
  Object.values(buckets).forEach(a=>a.sort((x,y)=>(((x.s.date||'9')+(x.s.time||''))<((y.s.date||'9')+(y.s.time||'')))?-1:1));
  const row=it=>{const p=store.project(it.t.projectId),c=store.client(p.clientId),f=kbFrente(it.t);const overdue=it.s.date&&it.s.date<today;
    const pend=(it.t.subtasks||[]).filter(x=>!x.done), sched=pend.filter(x=>x.date&&x.time).length; const sel=agSel&&agSel.sid===it.s.id; const canEdit=agCanEdit();
    return `<div class="ag-item${sel?' sel':''}${it.part?' part':''}" ${(canEdit&&!it.part)?`draggable="true" ondragstart="agListStart(event,'${it.t.id}','${it.s.id}')" ondragend="agListEnd()"`:''} onclick="openAgItem('${it.t.id}','${it.s.id}')" style="border-left:3px solid ${f.color}">
      <div class="ag-it-nm">${it.part?'🤝 ':''}${urgMark(it.s.urgent||it.t.urgent)}${esc(it.s.name)} <span class="ag-cnt" title="Subtareas pendientes de esta tarea que ya tienen fecha y hora, de las pendientes totales">📅 ${sched}/${pend.length}</span></div>
      <div class="ag-it-tk">Tarea: ${esc(it.t.name)}</div>
      <div class="ag-it-mt"><span>${c.name} · <span style="color:${f.color};font-weight:600">${f.name}</span></span><span class="ag-it-date">${overdue?'🔴 ':''}${it.s.date?dLabel(it.s.date):'sin fecha'}</span></div></div>`;};
  const sec=(title,icon,arr)=>accSec('ag',title,icon,arr,row);
  const total=buckets.venc.length+buckets.hoy.length+buckets.sem.length+buckets.resto.length+buckets.sinf.length;
  const list= total? sec('Vencidas','🔴',buckets.venc)+sec('Hoy','🟡',buckets.hoy)+sec('Esta semana','⚪',buckets.sem)+sec('Más adelante','🗓️',buckets.resto)+sec('Sin fecha','⚪',buckets.sinf) : '<div class="muted" style="padding:16px">Sin actividades pendientes.</div>';
  return `<div class="op-hello"><h2>Agenda · ${per.name}</h2><div class="muted">Mira la semana de tu compañero para balancear su carga. ⏳ = duración planeada.</div></div>
    <div class="ag-ctl">
      <label class="filt"><span class="glabel">Persona</span><select class="filter-val" onchange="setAgPerson(this.value)">${persOpts}</select></label>
      <div class="kb-month"><button onclick="agShift(-7)" title="Semana anterior">‹</button><span class="kb-month-lbl">${agRangeLabel(days)}</span><button onclick="agShift(7)" title="Semana siguiente">›</button></div>
      <button class="btn ghost sm" onclick="agToday()">Hoy</button>
      ${agNotes(days)}
    </div>
    ${tipoLegend()}
    <div class="ag-split">
      <div class="ag-left"><div class="op-list">${list}</div></div>
      <div class="ag-right">${agCalendar(days,agPerson)}</div>
    </div>`;
}

function viewProyecto(){
  const p=store.project(selProject); if(!p) return '';
  const c=store.client(p.clientId); const sv=store.service(p.serviceId);
  const colab=isColab();
  let tabs;
  if(isGerencia()) tabs=['gestor','gantt','tareas','kpis','biblioteca'];
  else if(isPM()||isGerente()) tabs=['gestor','gantt','tareas','biblioteca'];
  else tabs=['gestor','gantt','tareas','biblioteca'];
  const tlabel={gestor:'Gestor',gantt:'Gantt',tareas:'Tareas',kpis:'KPIs',biblioteca:'📚 Biblioteca',datos:'Datos y alcances',scorecard:'📊 Scorecard'};
  if(!tabs.includes(selTab)) selTab='gestor';
  const tabbar=tabs.map(t=>`<button class="${selTab===t?'active':''}" onclick="setTab('${t}')">${tlabel[t]}</button>`).join('');
  let content='';
  if(selTab==='gestor') content=tabGestor(p);
  else if(selTab==='gantt') content=tabGantt(p);
  else if(selTab==='tareas') content=tabTareas(p);
  else if(selTab==='kpis') content=tabKPIs(p);
  else if(selTab==='biblioteca') content=tabBiblioteca(p);
  else if(selTab==='scorecard') content=tabScorecard(p);
  else content=tabDatos(p);
  const crumb = colab
    ? `<div class="crumb"><a onclick="go('op_tableros')">Tableros</a> › ${p.name}</div>`
    : `<div class="crumb"><a onclick="go('clientes')">Clientes</a> › <a onclick="openClient('${c.id}')">${c.name}</a> › ${p.name}</div>`;
  const meta = colab ? `${p.months} meses · ${dLabel(p.startDate)}–${dLabel(p.endDate)}` : `${money(p.price)} · ${p.months} meses · ${dLabel(p.startDate)}–${dLabel(p.endDate)}`;
  const hubBtns = colab ? '' : `<div style="display:flex;gap:8px">${canManageProject()?`<button class="btn ghost sm" onclick="openProjectEdit('${p.id}')">✏️ Editar</button><button class="btn ghost sm" title="Eliminar proyecto" style="color:#c0392b" onclick="openProjectDel('${p.id}')">🗑️</button>`:''}${canCopy()?`<button class="btn ghost sm" onclick="openCopy('${p.id}')">⧉ Copiar tareas</button><button class="btn ghost sm" onclick="openImport('${p.id}')">⬆ Importar</button><button class="btn ghost sm" onclick="expOpen('${p.id}')">⬇ Exportar</button>`:''}<button class="btn ghost sm" onclick="openEtapaForm('${p.id}')">+ Etapa</button><button class="btn ghost sm" onclick="openFrenteForm('${p.id}')">+ Frente</button><button class="btn ghost sm" onclick="openKbTask('${p.id}')">+ Tarea</button></div>`;
  return `${crumb}
    <div class="card"><div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:12px;align-items:center">
      <div><div class="pill yellow">${sv?sv.name:''}</div><h2 style="margin:8px 0 2px;font-size:1.5rem">${p.name}</h2>
        <div class="muted" style="font-size:.86rem">${c.name} · ${meta}</div></div>
      ${hubBtns}
    </div></div>
    <div class="ptabs">${tabbar}</div>${content}`;
}

/* ===== Arrastrar tareas en el Gestor ===== */
let tcDrag=null;
function tcDragStart(ev,tid,eid){ tcDrag={tid,eid}; ev.dataTransfer.effectAllowed='move'; try{ev.dataTransfer.setData('text/plain',tid);}catch(_){} setTimeout(()=>{ const el=ev.target.closest&&ev.target.closest('.tchip'); if(el) el.classList.add('dragging'); },0); }
function tcDragEnd(){ tcDrag=null; document.querySelectorAll('.tchip.dragging,.gcell.drop-on').forEach(x=>x.classList.remove('dragging','drop-on')); document.querySelectorAll('.drop-line').forEach(x=>x.remove()); }
function tcBefore(cell,y){ const chips=[...cell.querySelectorAll('.tchip:not(.dragging)')]; for(const c of chips){ const r=c.getBoundingClientRect(); if(y<r.top+r.height/2) return c; } return null; }
function tcDragOver(ev){ if(!tcDrag) return; ev.preventDefault(); const cell=ev.currentTarget; cell.classList.add('drop-on');
  cell.querySelectorAll('.drop-line').forEach(x=>x.remove()); const ln=document.createElement('div'); ln.className='drop-line';
  const b=tcBefore(cell,ev.clientY); if(b) cell.insertBefore(ln,b); else { const add=cell.querySelector('.cell-add'); if(add) cell.insertBefore(ln,add); else cell.appendChild(ln); } }
function tcDragLeave(ev){ const cell=ev.currentTarget; if(!cell.contains(ev.relatedTarget)){ cell.classList.remove('drop-on'); cell.querySelectorAll('.drop-line').forEach(x=>x.remove()); } }
function tcDrop(ev){ if(!tcDrag) return; ev.preventDefault(); const cell=ev.currentTarget; const b=tcBefore(cell,ev.clientY); const d=tcDrag; tcDragEnd();
  store.moveTaskTo(d.tid,cell.dataset.fr,d.eid,cell.dataset.et,b?b.dataset.tid:null); render(); }

function tabGestor(p){
  const colab=isColab();
  const frentes=store.frentesOf(p.id), etapas=store.etapasOf(p.id), tasks=store.tasksOf(p.id);
  if(etapas.length===0) return `<div class="lock">Este proyecto aún no tiene etapas.${colab?'':`<br><button class="btn sm" style="margin-top:10px" onclick="openEtapaForm('${p.id}')">+ Crear etapa</button>`}</div>`;
  const etOps=e=>colab?'':`<span class="et-ops"><button title="Mover ←" onclick="moveEtapa('${p.id}','${e.id}',-1)">←</button><button title="Mover →" onclick="moveEtapa('${p.id}','${e.id}',1)">→</button><button title="Editar" onclick="openEtapaEdit('${e.id}','${p.id}')">✏️</button><button title="Eliminar" onclick="delEtapa('${e.id}','${p.id}')">🗑️</button></span>`;
  const head=`<tr><th class="corner">Frente ╲ Etapa</th>${etapas.map(e=>`<th><div class="et-hd"><div><div class="et-nm">${e.name}</div><span class="sub">${dLabel(e.start)}–${dLabel(e.end)}</span></div>${etOps(e)}</div></th>`).join('')}</tr>`;
  const rows=frentes.map(f=>{
    const cells=etapas.map(e=>{
      const chips=tasks.filter(t=>t.frenteId===f.id && taskEtapaIds(t).has(e.id)).sort((a,b)=>(a.ord||0)-(b.ord||0)).map(t=>{
        const done=workSubs(t).filter(s=>s.done).length, tot=workSubs(t).length;
        const bad=(t.subtasks||[]).some(x=>x.dateConflict&&!x.done);
        const isDone=t.status==='done';
        const late=!isDone && e.end<todayISO() && ((t.subtasks||[]).some(x=>!x.done && x.date>=e.start && x.date<=e.end) || ((t.subtasks||[]).length===0 && t.dueDate>=e.start && t.dueDate<=e.end));
        const cls='tchip'+(isDone?' is-done':'')+(late?' is-late':'');
        return `<div class="${cls}" ${late?'title="Atrasada: la etapa ya terminó y tiene pendientes"':''} data-tid="${t.id}" ${colab?'':`draggable="true" ondragstart="tcDragStart(event,'${t.id}','${e.id}')" ondragend="tcDragEnd()"`} style="background:${f.color}"  onclick="openTask('${t.id}')">${urgMark(taskHasUrgent(t))}${bad?'<span class="date-bad" title="Hay subtareas con fecha que no cabía en la etapa; se pusieron en hoy">🔴</span> ':''}${dk(t)}${t.name}<div class="st">${statusLabel[t.status]} · ${done}/${tot} · ${fmtTime(store.taskTime(t))}</div></div>`;
      }).join('');
      return `<td class="gcell" data-fr="${f.id}" data-et="${e.id}" ${colab?'':`ondragover="tcDragOver(event)" ondragleave="tcDragLeave(event)" ondrop="tcDrop(event)"`}>${chips}${colab?'':`<button class="cell-add" onclick="openTaskForm('${p.id}','${f.id}','${e.id}')">+ tarea</button>`}</td>`;
    }).join('');
    const frOps=colab?'':`<span class="fr-ops"><button title="Subir" onclick="moveFrente('${p.id}','${f.id}',-1)">↑</button><button title="Bajar" onclick="moveFrente('${p.id}','${f.id}',1)">↓</button><button title="Renombrar" onclick="openFrenteEdit('${f.id}','${p.id}')">✏️</button><button title="Eliminar" onclick="delFrente('${f.id}','${p.id}')">🗑️</button></span>`;
    return `<tr><td class="frente-h" style="background:${f.color}"><div class="fr-hd"><span class="fr-nm">${f.name}</span>${frOps}</div></td>${cells}</tr>`;
  }).join('');
  return `<div class="gantt-wrap"><table class="gantt"><thead>${head}</thead><tbody>${rows}</tbody></table></div>
    <div class="hint" style="margin-top:10px">Filas = Frentes · Columnas = Etapas · cada tarjeta es una tarea (clic para abrir). La etapa se deduce de la fecha de las subtareas.</div>`;
}

/* ===== GANTT real (barras, zoom día/semana/mes) ===== */
function dISO(iso){return new Date(iso+'T00:00:00');}
function addDays(d,n){const x=new Date(d);x.setDate(x.getDate()+n);return x;}
function diffDays(a,b){return Math.round((dISO(b)-dISO(a))/86400000);}
function taskSpan(t){
  const ds=(t.subtasks||[]).map(s=>s.date).filter(Boolean);
  if(t.dueDate) ds.push(t.dueDate);
  if(!ds.length) return null;
  ds.sort(); return {start:ds[0],end:ds[ds.length-1]};
}
function tabGantt(p,cp){
  const frentes=store.frentesOf(p.id).filter(f=>store.tasksOf(p.id).some(t=>t.frenteId===f.id));
  const tasks=store.tasksOf(p.id);
  // rango del proyecto
  let rangeStart=p.startDate, rangeEnd=p.endDate;
  tasks.forEach(t=>{const s=taskSpan(t); if(s){ if(s.start<rangeStart)rangeStart=s.start; if(s.end>rangeEnd)rangeEnd=s.end; }});
  const total=Math.max(1,diffDays(rangeStart,rangeEnd)+1);
  const PX={day:34,week:12,month:5}[ganttZoom];
  const W=total*PX;

  // ticks del eje
  const ticks=[]; // {off, w, label, strong}
  if(ganttZoom==='month'){
    let cur=new Date(dISO(rangeStart).getFullYear(),dISO(rangeStart).getMonth(),1);
    const end=dISO(rangeEnd);
    while(cur<=end){ const off=Math.max(0,diffDays(rangeStart,cur.toISOString().split('T')[0]));
      const next=new Date(cur.getFullYear(),cur.getMonth()+1,1);
      const w=diffDays((cur<dISO(rangeStart)?dISO(rangeStart):cur).toISOString().split('T')[0], (next>addDays(end,1)?addDays(end,1):next).toISOString().split('T')[0]);
      ticks.push({off,w,label:cur.toLocaleDateString('es-MX',{month:'short',year:'2-digit'}),strong:true}); cur=next; }
  } else if(ganttZoom==='week'){
    for(let o=0;o<total;o+=7){ const dt=addDays(dISO(rangeStart),o); ticks.push({off:o,w:Math.min(7,total-o),label:dt.toLocaleDateString('es-MX',{day:'numeric',month:'short'}),strong:dt.getDate()<=7}); }
  } else {
    for(let o=0;o<total;o++){ const dt=addDays(dISO(rangeStart),o); const wd=dt.getDay(); ticks.push({off:o,w:1,label:`<span class="g-wd${wd===3?' x':''}${wd===0||wd===6?' fin':''}">${'DLMXJVS'[wd]}</span><span>${dt.getDate()}</span>`,strong:dt.getDate()===1}); }
  }
  const axis=ticks.map(tk=>`<div class="g-tick ${tk.strong?'strong':''}" style="left:${tk.off*PX}px;width:${tk.w*PX}px">${tk.label}</div>`).join('');
  const grid=ticks.map(tk=>`<div class="g-line ${tk.strong?'strong':''}" style="left:${tk.off*PX}px"></div>`).join('');
  // marcador de hoy
  const today=todayISO(); let todayMark='';
  if(today>=rangeStart&&today<=rangeEnd){ todayMark=`<div class="g-today" style="left:${diffDays(rangeStart,today)*PX}px"></div>`; }

  // filas
  let labels='<div class="g-lh">Tarea</div>', lanes=`<div class="g-axis">${axis}</div>`; let yy=42; const rects={}, deps=[];
  frentes.forEach(f=>{
    labels+=`<div class="g-fr" style="border-left:4px solid ${f.color}">${f.name}</div>`;
    lanes+=`<div class="g-frrow"></div>`;
    yy+=30;
    ganttOrdered(p,f.id).forEach(t=>{
      const sp=taskSpan(t); const canExp=!cp||cp.admin; const subsAll=canExp?workSubs(t):[]; const open=canExp&&subsAll.length&&ganttOpen[t.id];
      const arrow=(canExp&&subsAll.length)?`<span class="g-tg" onclick="ganttToggle('${t.id}')" title="${open?'Contraer':'Ver subtareas y sub-subtareas'}">${open?'▾':'▸'}</span>`:'<span class="g-tg"></span>';
      labels+=`<div class="g-ll" title="${esc(t.name)}">${arrow}<span class="g-nm">${t.name}</span></div>`; yy+=34;
      if(!sp){ lanes+=`<div class="g-lane"></div>`; }
      else {
      const left=Math.max(0,diffDays(rangeStart,sp.start))*PX;
      const wdt=Math.max(PX*0.7,(diffDays(sp.start,sp.end)+1)*PX);
      const done=workSubs(t).filter(s=>s.done).length, tot=workSubs(t).length;
      const pct=tot?Math.round(done/tot*100):(t.status==='done'?100:0);
      lanes+=`<div class="g-lane"><div class="g-bar" style="left:${left}px;width:${wdt}px;background:${f.color}" onclick="${cp?`openCpTask('${t.id}')`:`ganttPop(event,'${t.id}')`}"><div class="g-fill" style="width:${pct}%"></div><span class="g-bl">${dk(t)}${t.name}</span><span class="g-av">${[...new Set(workSubs(t).map(x=>x.personId).filter(Boolean))].slice(0,4).map(id=>avatar(store.person(id),true)).join('')}</span></div></div>`; }
      if(open){ const okIds=new Set(subsAll.map(x=>x.id)); const bad=new Set(cp?[]:subsAll.filter(x=>depBroken(t,x)).map(x=>x.id));
        const parents=subOrder(t,true).filter(o=>o.depth===0&&okIds.has(o.s.id)); const vis=[]; parents.forEach(o=>{ vis.push(o); if(ganttOpen[o.s.id]) o.kids.filter(k=>okIds.has(k.id)).forEach(k=>vis.push({s:k,depth:1,kids:[]})); });
        vis.forEach(o=>{ const x=o.s; const kidsAll=o.depth?[]:(o.kids||[]).filter(k=>okIds.has(k.id)); const nk=kidsAll.length;
          const tg=nk?`<span class="g-tg g-tg1" style="color:${f.color}" onclick="ganttToggle('${x.id}')" title="${ganttOpen[x.id]?'Contraer':'Ver sub-subtareas'}">${ganttOpen[x.id]?'▾':'▸'}</span>`:(o.depth?'<span class="g-tg g-tg2">└</span>':`<span class="g-tg g-tg1 g-dot" style="color:${f.color}">•</span>`);
          labels+=`<div class="g-ll ${o.depth?'g-sl2':'g-sl1'}" style="padding-left:${o.depth?44:22}px" title="${esc(x.name)}">${tg}<span class="g-nm">${x.done?'✓ ':''}${bad.has(x.id)?'⚠️ ':''}${esc(x.name)}</span></div>`;
          const ds=[x.date,...kidsAll.map(k=>k.date)].filter(Boolean).sort();
          if(!ds.length){ lanes+=`<div class="g-lane"></div>`; yy+=34; return; }
          const l=Math.max(0,diffDays(rangeStart,ds[0]))*PX; let w=Math.max((diffDays(ds[0],ds[ds.length-1])+1)*PX,o.depth?56:76); kidsAll.forEach(k=>{ if(k.date){ const kr=Math.max(0,diffDays(rangeStart,k.date))*PX+Math.max(PX,56); if(kr-l>w) w=kr-l; } }); const cy=yy+17;
          rects[x.id]={l,r:l+w,cy,d:o.depth};
          lanes+=`<div class="g-lane"><div class="g-bar ${o.depth?'g-ssb':'g-sb'} ${x.done?'done':''}" style="left:${l}px;width:${w}px;--fc:${f.color}" onclick="ganttPop(event,'${t.id}','${x.id}')"><span class="g-bl">${bad.has(x.id)?'⚠️ ':''}${esc(x.name)}</span></div></div>`; yy+=34; });
        subsAll.forEach(x=>{ if(x.dependsOn&&rects[x.id]&&rects[x.dependsOn]) deps.push([rects[x.dependsOn],rects[x.id],bad.has(x.id)]); }); }
    });
  });
  const svg=deps.length?`<svg class="g-deps" width="${W}" height="${yy}"><defs><marker id="gdA" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="M0,0 L7,3.5 L0,7 z" fill="#d62828"/></marker></defs>${deps.map(([a,b,br])=>{ let path,y1,xc; const down=b.cy>=a.cy;
      if(a.d===0&&b.d===0){ const xt=Math.round((b.l+b.r)/2), ye=b.cy+(down?-11:11); y1=a.cy; xc=a.r; path=xt>=a.r+10?`M${a.r},${a.cy} H${xt} V${ye}`:`M${a.r},${a.cy} H${a.r+9} V${b.cy+(down?-17:17)} H${xt} V${ye}`; }
      else { xc=Math.round((a.l+a.r)/2); y1=a.cy+(down?11:-11); const x2=b.l, y2=b.cy; path=x2>=xc+10?`M${xc},${y1} V${y2} H${x2}`:`M${xc},${y1} V${y2+(down?-17:17)} H${x2-9} V${y2} H${x2}`; }
      return `<path d="${path}" fill="none" stroke="#d62828" stroke-width="${br?2.2:1.6}" ${br?'stroke-dasharray="5 3"':''} marker-end="url(#gdA)"/><circle cx="${xc}" cy="${y1}" r="2.6" fill="#d62828"/>`; }).join('')}</svg>`:'';

  const zoomBtns=[['day','Día'],['week','Semana'],['month','Mes']].map(([k,l])=>`<button class="${ganttZoom===k?'on':''}" onclick="setGanttZoom('${k}')">${l}</button>`).join('');
  return `<div class="tareas-ctl"><div class="group-ctl"><span class="glabel">Zoom</span><div class="subtoggle sm">${zoomBtns}</div></div>
      <span class="muted" style="font-size:.82rem">${dLabel(rangeStart)} – ${dLabel(rangeEnd)}</span>${cp?'':`<button class="btn ghost sm" style="margin-left:auto" onclick="pdfOpen('${p.id}')">📄 Exportar PDF</button>`}</div>
    <div class="gc">
      <div class="g-labels">${labels}</div>
      <div class="g-scroll"><div class="g-inner" style="width:${W}px" data-key="${p.id}|${ganttZoom}" data-today="${today>=rangeStart&&today<=rangeEnd?diffDays(rangeStart,today)*PX:''}">
        <div class="g-grid">${grid}${todayMark}</div>
        ${lanes}${svg}
      </div></div>
    </div>
    <div class="hint" style="margin-top:10px">Cada barra va del inicio al fin de las subtareas de la tarea. El relleno muestra el avance. La línea amarilla es hoy. Las fotos son quienes participan. Clic en una barra para ver sus datos. Con la flechita ▸ ves las subtareas y sub-subtareas; las flechas rojas muestran dependencias.</div>`;
}
function monthLabel(ym){ if(!ym) return 'Sin fecha'; const [y,m]=ym.split('-'); return new Date(+y,+m-1,1).toLocaleDateString('es-MX',{month:'long',year:'numeric'}); }
function primaryEtapaId(t){ const e=store.etapaOfDate(t.projectId,t.dueDate); if(e) return e.id; const ss=(t.subtasks||[]).map(s=>store.etapaOfDate(t.projectId,s.date)).filter(Boolean); return ss.length?ss[0].id:''; }
function taskGroupKey(t,dim){ return dim==='frente'?t.frenteId : dim==='estado'?t.status : dim==='etapa'?primaryEtapaId(t) : t.frenteId; }
function groupsFor(p,dim){
  if(dim==='estado') return ['to-do','in-progress','ajuste','on-hold','done'].map(s=>({key:s,label:statusLabel[s],status:s}));
  if(dim==='etapa'){ const g=store.etapasOf(p.id).map(e=>({key:e.id,label:e.name,color:'#3f7d6e'})); g.push({key:'',label:'Sin etapa',color:'#9aa39f'}); return g; }
  return store.frentesOf(p.id).map(f=>({key:f.id,label:f.name,color:f.color,frente:true}));
}
/* filtros combinables: persona (responsable) + mes (fecha límite) */
function personParticipates(t,pid){
  if(t.status==='done') return false;                 // tarea Hecho: no aparece
  if(t.responsibleId===pid) return true;              // responsable de tarea no terminada
  if((t.subtasks||[]).some(s=>!s.done && subInvolves(s,pid))) return true; // subtarea PENDIENTE
  if(store.commentsOf(t.id).some(cm=>(cm.mentions||[]).includes(pid) && !(cm.readBy||[]).includes(pid))) return true; // @mención NO leída (en tarea no terminada)
  return false;
}
function applyFilters(tasks){
  let ts=tasks;
  if(filterPersona) ts=ts.filter(t=>personParticipates(t,filterPersona));
  if(filterMes) ts=ts.filter(t=>(t.dueDate||'').slice(0,7)===filterMes);
  return ts;
}
function monthsOf(p){ return [...new Set(store.tasksOf(p.id).map(t=>(t.dueDate||'').slice(0,7)).filter(Boolean))].sort(); }

function tabTareas(p){
  const fmt=[['kanban','🗂️ Kanban'],['calendario','📅 Calendario'],['lista','☰ Lista']].map(([k,l])=>`<button class="${tareasMode===k?'on':''}" onclick="setTareasMode('${k}')">${l}</button>`).join('');
  const isCal=tareasMode==='calendario';
  // Agrupar por (solo lista/kanban): Frente | Estado | Etapa
  const dims=[['frente','Frente'],['estado','Estado'],['etapa','Etapa']];
  let groupCtl = isCal ? '' : `<div class="group-ctl"><span class="glabel">Agrupar por</span>
    <div class="subtoggle sm">${dims.map(([k,l])=>`<button class="${groupBy===k?'on':''}" onclick="setGroupBy('${k}')">${l}</button>`).join('')}</div></div>`;
  // Filtros combinables: Persona + Mes
  const cli=store.client(p.clientId);
  const persOpts=`<optgroup label="Nuwek">${store.activeStaff().map(u=>`<option value="${u.id}" ${filterPersona===u.id?'selected':''}>${u.name}</option>`).join('')}</optgroup>`
    + (cli&&cli.people.length?`<optgroup label="Cliente">${cli.people.map(pp=>`<option value="${pp.id}" ${filterPersona===pp.id?'selected':''}>${pp.name}</option>`).join('')}</optgroup>`:'');
  const mesOpts=monthsOf(p).map(m=>`<option value="${m}" ${filterMes===m?'selected':''}>${monthLabel(m)}</option>`).join('');
  const mesCtl = isCal ? '' : `<label class="filt"><span class="glabel">Mes</span><select class="filter-val" onchange="setFilterMes(this.value)"><option value="">Todos</option>${mesOpts}</select></label>`;
  const filtCtl=`<div class="group-ctl filters"><span class="glabel strong">Filtros</span>
    <label class="filt"><span class="glabel">Persona</span><select class="filter-val" onchange="setFilterPersona(this.value)"><option value="">Todas</option>${persOpts}</select></label>
    ${mesCtl}</div>`;
  let body;
  if(tareasMode==='kanban') body=tareasKanban(p);
  else if(tareasMode==='calendario') body=tareasCalendario(p);
  else body=tareasLista(p);
  return `<div class="tareas-ctl"><div class="subtoggle">${fmt}</div>${groupCtl}${filtCtl}</div>${body}`;
}

function taskRow(p,t){const r=store.person(t.responsibleId);const done=workSubs(t).filter(s=>s.done).length,tot=workSubs(t).length;
  return `<div class="trow" onclick="openTask('${t.id}')"><span class="badge s-${t.status}">${statusLabel[t.status]}</span>
    <div class="g"><div class="nm">${dk(t)}${t.name}</div><div class="mt">${avatar(r,true)} ${r.name} · ${store.frentesOf(p.id).find(f=>f.id===t.frenteId)?.name||''} · vence ${dLabel(t.dueDate)} · ☑ ${done}/${tot} · ⏱ ${fmtTime(store.taskTime(t))}</div></div></div>`;}

function tareasLista(p){
  const tasks=applyFilters(store.tasksOf(p.id)); const groups=groupsFor(p,groupBy);
  const out=groups.map(g=>{
    const ts=tasks.filter(t=>taskGroupKey(t,groupBy)===g.key);
    if(!ts.length) return '';
    const addBtn = groupBy==='frente' ? `<button class="btn ghost sm" onclick="openTaskForm('${p.id}','${g.key}',null)">+ Tarea</button>` : '';
    const color = g.color || '#223c36';
    return `<div class="sec-title" style="margin:18px 0 10px"><h2 style="font-size:1.05rem;color:${color}">${g.label} <span class="muted" style="font-size:.8rem">(${ts.length})</span></h2>${addBtn}</div>${ts.map(t=>taskRow(p,t)).join('')}`;
  }).join('');
  return out || '<div class="muted">Sin tareas con esos filtros.</div>';
}

function kanbanCard(p,t){
  const fr=store.frentesOf(p.id).find(f=>f.id===t.frenteId)||{name:'',color:'#223c36'};
  const r=store.person(t.responsibleId);
  const done=workSubs(t).filter(s=>s.done).length,tot=workSubs(t).length;
  return `<div class="kb-card" style="border-left-color:${fr.color}" onclick="openTask('${t.id}')">
    <div class="kb-nm">${dk(t)}${t.name}</div>
    <div class="kb-fr" style="color:${fr.color}">${fr.name} · ${statusLabel[t.status]}</div>
    <div class="kb-mt">${avatar(r,true)} ${r.name} · ☑ ${done}/${tot}${store.taskTime(t)?` · ⏱ ${fmtTime(store.taskTime(t))}`:''}</div>
  </div>`;
}
function tareasKanban(p){
  const tasks=applyFilters(store.tasksOf(p.id)); const groups=groupsFor(p,groupBy);
  const cols=groups.map(g=>{
    const ts=tasks.filter(t=>taskGroupKey(t,groupBy)===g.key);
    const head = g.status
      ? `<span class="badge s-${g.status}">${g.label}</span>`
      : `<span class="kb-glabel" style="background:${g.color||'#223c36'}">${g.label}</span>`;
    return `<div class="kb-col"><div class="kb-head">${head}<span class="kb-count">${ts.length}</span></div>
      <div class="kb-body">${ts.map(t=>kanbanCard(p,t)).join('')||'<div class="muted" style="font-size:.8rem;padding:6px">—</div>'}</div></div>`;
  }).join('');
  const dimLabel={frente:'frente',estado:'estado',etapa:'etapa'}[groupBy];
  return `<div class="kb-board">${cols}</div>
    <div class="hint" style="margin-top:10px">Columnas por <b>${dimLabel}</b>${filterPersona?' · persona = solo <b>pendientes</b> donde participa (responsable, subtarea, invitado o @mención; sin Hecho)':''}${filterMes?' · filtrado por mes':''}. Clic en una tarjeta para abrir la tarea.</div>`;
}

function tareasCalendario(p){
  const tasks=applyFilters(store.tasksOf(p.id));
  const y=calMonth.getFullYear(), m=calMonth.getMonth();
  const first=new Date(y,m,1), days=new Date(y,m+1,0).getDate(), startDow=first.getDay();
  const monthName=calMonth.toLocaleDateString('es-MX',{month:'long',year:'numeric'});
  let cells='';
  ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'].forEach(d=>cells+=`<div class="cal-dh">${d}</div>`);
  for(let i=0;i<startDow;i++) cells+=`<div class="cal-day empty"></div>`;
  const todayStr=todayISO();
  for(let d=1;d<=days;d++){
    const ds=iso(y,m+1,d);
    const dayTasks=tasks.filter(t=>t.dueDate===ds);
    // marcadores (no clicables): un punto por tarea con color de su frente
    const dots=dayTasks.slice(0,6).map(t=>{const fr=store.frentesOf(p.id).find(f=>f.id===t.frenteId)||{color:'#223c36'};
      return `<span class="cal-dot" style="background:${fr.color}"></span>`;}).join('');
    const more=dayTasks.length>6?`<span class="cal-more">+${dayTasks.length-6}</span>`:'';
    const cls=[ds===todayStr?'today':'', ds===calDay?'sel':'', dayTasks.length?'has':''].filter(Boolean).join(' ');
    cells+=`<div class="cal-day ${cls}" onclick="selectCalDay('${ds}')"><div class="cal-num">${d}</div><div class="cal-dots">${dots}${more}</div></div>`;
  }
  // lista del día seleccionado, debajo del calendario
  let dayList='';
  if(calDay){
    const dts=tasks.filter(t=>t.dueDate===calDay);
    const rows=dts.map(t=>taskRow(p,t)).join('') || '<div class="muted">Sin tareas para este día.</div>';
    dayList=`<div class="cal-daylist"><div class="sec-title" style="margin:0 0 10px"><h2 style="font-size:1.05rem">📌 ${dLabel(calDay)} <span class="muted" style="font-size:.8rem">(${dts.length})</span></h2></div>${rows}</div>`;
  } else {
    dayList=`<div class="cal-daylist muted" style="text-align:center;padding:18px">Selecciona un día para ver sus tareas.</div>`;
  }
  return `<div class="cal-nav"><button class="btn ghost sm" onclick="calShift(-1)">← Anterior</button>
      <span class="cal-month">${monthName}</span>
      <button class="btn ghost sm" onclick="calShift(1)">Siguiente →</button></div>
    <div class="cal-grid">${cells}</div>
    <div class="hint" style="margin-top:10px">Tareas por <b>fecha límite</b>${filterPersona?' · solo <b>pendientes</b> donde participa la persona: responsable, subtarea, invitado o @mención (no muestra Hecho ni subtareas palomeadas)':''}. Clic en un día para ver su lista abajo.</div>
    ${dayList}`;
}

/* ---------- KPIs ---------- */
function tabKPIs(p){
  if(role!=='PM') return `<div class="lock">🔒 Los KPIs son visibles solo para el <b>PM</b>.<br>Cambia “Ver como” arriba a la derecha.</div>`;
  const tasks=store.tasksOf(p.id), today=todayISO();
  let totalMin=0; const byPerson={};
  const subCnt={};
  tasks.forEach(t=>(t.subtasks||[]).forEach(s=>{ totalMin+=s.timeSpent||0; byPerson[s.personId]=(byPerson[s.personId]||0)+(s.timeSpent||0);
    if(!subCnt[s.personId]) subCnt[s.personId]={done:0,total:0}; subCnt[s.personId].total++; if(s.done) subCnt[s.personId].done++; }));
  const totalTasks=tasks.length, doneTasks=tasks.filter(t=>t.status==='done').length;
  const totalSub=tasks.reduce((a,t)=>a+(t.subtasks||[]).length,0);
  const doneSub=tasks.reduce((a,t)=>a+workSubs(t).filter(s=>s.done).length,0);
  const avancePct=totalSub?Math.round(doneSub/totalSub*100):0;

  const etapas=store.etapasOf(p.id), frentes=store.frentesOf(p.id);
  const etBlocks=etapas.map(e=>{
    const ets=tasks.filter(t=>primaryEtapaId(t)===e.id);
    const total=ets.length, done=ets.filter(t=>t.status==='done').length, pct=total?Math.round(done/total*100):0;
    const etDelay=ets.reduce((mx,t)=>Math.max(mx,taskDelay(t)),0);
    let status,scls;
    if(total===0){status='Sin tareas';scls='gray';}
    else if(etDelay>0){status='🔴 '+etDelay+' días de retraso';scls='red';}
    else if(done===total){status='✅ Completa';scls='green';}
    else {status='🟢 Sano';scls='green';}
    const frRows=frentes.map(f=>{
      const ft=ets.filter(t=>t.frenteId===f.id); if(!ft.length) return '';
      const fd=ft.filter(t=>t.status==='done').length, fp=Math.round(fd/ft.length*100);
      return `<div class="brow"><div style="color:${f.color};font-weight:600">${f.name}</div><div class="bt"><i style="width:${fp}%;background:${f.color}"></i></div><div>${fd}/${ft.length} · ${fp}%</div></div>`;
    }).join('') || '<div class="muted" style="font-size:.85rem;padding:4px">Sin tareas en esta etapa.</div>';
    const barCol=pct>=75?'var(--ok)':pct>=50?'var(--warn)':'var(--bad)';
    return `<details class="eacc"><summary>
        <span class="eacc-chev">›</span>
        <span class="eacc-name">${e.name}</span>
        <span class="pill ${scls}">${status}</span>
        <div class="eacc-bar"><i style="width:${pct}%;background:${barCol}"></i></div>
        <span class="eacc-count">${done}/${total} · ${pct}%</span>
      </summary><div class="eacc-body"><div class="bars">${frRows}</div></div></details>`;
  }).join('');

  const persRows=Object.keys(byPerson).map(id=>({name:store.person(id).name,color:store.person(id).color,min:byPerson[id],done:(subCnt[id]||{}).done||0,total:(subCnt[id]||{}).total||0})).sort((a,b)=>b.min-a.min);
  const maxMin=Math.max(1,...persRows.map(r=>r.min));

  return `
    <div class="grid cols-3">
      <div class="kpi"><div class="lab">Tiempo invertido</div><div class="big">${fmtTime(totalMin)}</div><div class="sub">suma de subtareas</div></div>
      <div class="kpi"><div class="lab">Tareas completadas</div><div class="big">${doneTasks}/${totalTasks}</div><div class="sub">tareas en estado Hecho</div></div>
      <div class="kpi"><div class="lab">Avance general</div><div class="big">${avancePct}%</div><div class="sub">${doneSub}/${totalSub} subtareas hechas</div>
        <div class="track"><i style="width:${avancePct}%;background:var(--ok)"></i></div></div>
    </div>
    <div class="sec-title"><h2 style="font-size:1.1rem">Avance y salud por etapa</h2></div>
    <div class="eacc-list">${etBlocks||'<div class="muted">Sin etapas.</div>'}</div>
    <div class="sec-title"><h2 style="font-size:1.1rem">Ocupación por persona (horas)</h2></div>
    <div class="bars">${persRows.map(r=>`<div class="brow"><div>${r.name}</div><div class="bt"><i style="width:${Math.round(r.min/maxMin*100)}%;background:${r.color}"></i><span class="bt-ov">${r.done}/${r.total} subt.</span></div><div>${fmtTime(r.min)}</div></div>`).join('')||'<div class="muted">Sin tiempo registrado.</div>'}</div>`;
}

/* ---------- Datos y alcances (incluye Cobranza y Rentabilidad) ---------- */
/* Biblioteca: cada "cajón" (nombre) guarda varias URLs. Compatible con links viejos {label,url}. */
function linkUrls(l){ return Array.isArray(l.urls)?l.urls:(l.url?[{title:'',url:l.url}]:[]); }
function hrefOf(u){ return (u||'').match(/^https?:\/\//)?u:'https://'+u; }
function libCard(pid,l,editable){
  const urls=linkUrls(l);
  const items=urls.map(u=>{ const host=faviconOf(u.url);
    return `<a class="lib-item" href="${esc(hrefOf(u.url))}" target="_blank" rel="noopener"><span class="lib-ico sm">${host?`<img src="https://www.google.com/s2/favicons?domain=${host}&sz=64" alt="">`:'🔗'}</span><span class="lib-g"><span class="lib-nm">${esc(u.title||host||u.url)}</span>${u.title?`<span class="lib-url muted">${esc(host||u.url)}</span>`:''}</span><span class="lib-open">↗</span></a>`; }).join('');
  return `<div class="lib-box"><div class="lib-box-h"><span class="lib-box-nm">🗂️ ${esc(l.label||'Sin nombre')} <span class="muted" style="font-weight:500">· ${urls.length}</span></span>
    <span class="lib-ops">${editable?`<button class="btn ghost sm" title="Editar" onclick="openLinkEdit('${pid}','${l.id}')">✏️</button>`:''}<button class="btn ghost sm" title="Eliminar" onclick="delLink('${pid}','${l.id}')">🗑️</button></span></div>
    <div class="lib-box-b">${items||'<div class="muted" style="padding:8px 4px">Sin URLs.</div>'}</div></div>`;
}
function faviconOf(url){ try{ const u=new URL(url.match(/^https?:\/\//)?url:'https://'+url); return u.hostname; }catch(e){ return ''; } }
function tabScorecard(p){
  const scs=store.scorecardsOf(p.id).slice().sort((a,b)=>((a.date||'')<(b.date||'')?1:-1));
  const rows=scs.map(s=>{
    const href=(s.url||'').match(/^https?:\/\//)?s.url:'https://'+s.url;
    const host=faviconOf(s.url);
    return `<div class="lib-row">
      <div class="lib-ico">📊</div>
      <div class="lib-g"><a class="lib-nm" href="${href}" target="_blank" rel="noopener">${esc(s.title||s.url||'Scorecard')}</a><div class="lib-url muted">${s.date?dLabel(s.date):''}${host?' · '+host:''}</div></div>
      <div class="lib-ops"><a class="btn ghost sm" href="${href}" target="_blank" rel="noopener">Abrir ↗</a><button class="btn ghost sm" onclick="openScoreEdit('${p.id}','${s.id}')">✏️</button><button class="btn ghost sm" onclick="delScore('${p.id}','${s.id}')">🗑️</button></div>
    </div>`;
  }).join('');
  return `<div class="sec-title"><h2 style="font-size:1.15rem">📊 Scorecard</h2><button class="btn sm" onclick="openScoreForm('${p.id}')">+ Scorecard</button></div>
    <p class="muted" style="margin-bottom:14px">Historial de evaluaciones del proyecto. Por ahora se guarda el link a cada scorecard; el portal para llenarlos (cliente ↔ Nuwek) llegará pronto.</p>
    <div class="lib-list">${rows||'<div class="muted">Aún no hay scorecards. Agrega el primero con “+ Scorecard”.</div>'}</div>`;
}
let selLib=null;
function selectLib(id){ selLib=id; render(); }
function tabBiblioteca(p){
  const links=store.linksOf(p.id);
  if(!links.some(l=>l.id===selLib)) selLib=links.length?links[0].id:null;
  const cur=links.find(l=>l.id===selLib);
  const list=links.map(l=>`<div class="lib-side-it${l.id===selLib?' on':''}" onclick="selectLib('${l.id}')"><span class="lib-side-nm">🗂️ ${esc(l.label||'Sin nombre')}</span><span class="lib-side-n">${linkUrls(l).length}</span></div>`).join('');
  const detail=cur?`<div class="lib-det-h"><h3>${esc(cur.label||'Sin nombre')}</h3><span class="lib-ops"><button class="btn ghost sm" title="Editar" onclick="openLinkEdit('${p.id}','${cur.id}')">✏️</button><button class="btn ghost sm" title="Eliminar" onclick="delLink('${p.id}','${cur.id}')">🗑️</button></span></div>
      <div class="lib-det-b">${linkUrls(cur).map(u=>{ const host=faviconOf(u.url);
        return `<a class="lib-item" href="${esc(hrefOf(u.url))}" target="_blank" rel="noopener"><span class="lib-ico sm">${host?`<img src="https://www.google.com/s2/favicons?domain=${host}&sz=64" alt="">`:'🔗'}</span><span class="lib-g"><span class="lib-nm">${esc(u.title||host||u.url)}</span>${u.title?`<span class="lib-url muted">${esc(host||u.url)}</span>`:''}</span><span class="lib-open">↗</span></a>`; }).join('')||'<div class="muted" style="padding:8px">Sin URLs.</div>'}</div>`
    :'<div class="muted" style="padding:20px">Selecciona un cajón para ver sus links.</div>';
  return `<div class="sec-title"><h2 style="font-size:1.15rem">📚 Biblioteca</h2><button class="btn sm" onclick="openLinkForm('${p.id}')">+ Link</button></div>
    <p class="muted" style="margin-bottom:14px">Cada nombre es un cajón que puede guardar varias URLs: drives, documentos, brand kits, tableros, referencias…</p>
    ${links.length?`<div class="lib-split"><div class="lib-side">${list}</div><div class="lib-det">${detail}</div></div>`:'<div class="muted">Aún no hay links. Agrega el primero con “+ Link”.</div>'}`;
}
function tabDatos(p){
  const sv=store.service(p.serviceId); const today=todayISO();
  const pays=store.paymentsOf(p.id).slice().sort((a,b)=>a.dueDate<b.dueDate?-1:a.dueDate>b.dueDate?1:0);
  const cobrado=pays.filter(x=>x.paid).reduce((s,x)=>s+x.amount,0);
  const vencido=pays.filter(x=>!x.paid && x.dueDate<today).reduce((s,x)=>s+x.amount,0);
  const pctCob=p.price?Math.round(cobrado/p.price*100):0;
  const tasks=store.tasksOf(p.id); let laborCost=0,viat=0;
  tasks.forEach(t=>{ viat+=t.viaticos||0; (t.subtasks||[]).forEach(s=>{ const pr=store.person(s.personId); laborCost+=(s.timeSpent||0)/60*(pr.rate||0); }); });
  const margen=p.price-(viat+laborCost), margenPct=p.price?Math.round(margen/p.price*100):0;

  const internal=(store.client(p.clientId)||{}).tipo==='interno';
  const finCards=internal?`<div class="card" style="margin-bottom:16px"><b>Proyecto interno</b><div class="muted" style="margin-top:4px">Capacitaciones, juntas y actividades internas: sus horas cuentan para la ocupación del equipo, pero no generan ingreso, cobranza ni costo.</div></div>`:`<div class="grid cols-2" style="margin-bottom:16px">
    <div class="kpi"><div class="lab">Cobranza</div><div class="big">${money(cobrado)}</div><div class="sub">de ${money(p.price)} contratado · ${pctCob}%</div>
      <div class="track"><i style="width:${pctCob}%;background:var(--ok)"></i></div>
      <div class="sub" style="margin-top:6px;color:var(--bad)">Vencido: ${money(vencido)}</div></div>
    <div class="kpi"><div class="lab">Rentabilidad (est.)</div><div class="big">${money(margen)}</div><div class="sub">margen ${margenPct}% · mano de obra ${money(laborCost)} + viáticos ${money(viat)}</div></div>
  </div>`;

  const alc=(p.alcances||[]).map(a=>`<span class="chip">${a.item} — ${a.qty}/${a.period}</span>`).join('') || '<span class="muted">Sin alcances capturados.</span>';
  const paysRows=pays.map(x=>`<div class="trow" style="cursor:default"><span class="badge ${x.paid?'s-done':(x.dueDate<today?'s-ajuste':'s-todo')}">${x.paid?'Pagado':(x.dueDate<today?'Vencido':'Pendiente')}</span><div class="g"><div class="nm">${money(x.amount)}</div><div class="mt">vence ${dLabel(x.dueDate)}${x.paid&&x.paidDate?` · pagado ${dLabel(x.paidDate)}`:''}</div></div><div style="display:flex;gap:4px"><button class="btn ghost sm" onclick="togglePay('${x.id}','${p.id}')">${x.paid?'↩︎':'✓ pagar'}</button><button class="btn ghost sm" onclick="openPayEdit('${p.id}','${x.id}')">✏️</button><button class="btn ghost sm" onclick="delPay('${x.id}','${p.id}')">🗑️</button></div></div>`).join('');
  const scheduled=pays.reduce((s,x)=>s+x.amount,0);
  const diff=Math.round(((p.price||0)-scheduled)*100)/100;
  const cuadre = diff===0 ? '<span style="color:var(--ok)">✓ cuadra con lo contratado</span>' : (diff>0?`<span style="color:var(--bad)">faltan ${money(diff)}</span>`:`<span style="color:var(--warn)">sobran ${money(-diff)}</span>`);
  return `${finCards}
  <div class="grid cols-2">
    <div class="card"><div style="display:flex;justify-content:space-between;align-items:center;gap:8px"><h3>Parámetros</h3><button class="btn ghost sm" onclick="openProjectEdit('${p.id}')">✏️ Editar</button></div>
      <dl class="kv" style="margin-top:10px">
      <dt>Servicio</dt><dd>${sv?sv.name:''}</dd><dt>Precio contratado</dt><dd>${money(p.price)}</dd>
      <dt>Pago/mes</dt><dd>${money(p.monthlyPay)} · día ${p.paymentDay}</dd><dt>Meses</dt><dd>${p.months}</dd>
      <dt>Periodo</dt><dd>${dLabel(p.startDate)}–${dLabel(p.endDate)}</dd></dl>
      <h4 style="margin-top:16px">Alcances</h4><div class="chiplist" style="margin-top:8px">${alc}</div></div>
    <div class="card"><div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap"><h3>Calendario de pagos</h3>
      <div style="display:flex;gap:6px"><button class="btn ghost sm" onclick="openGenPagos('${p.id}')">⚙ Generar</button><button class="btn sm" onclick="openPayForm('${p.id}')">+ Pago</button></div></div>
      <div class="muted" style="font-size:.84rem;margin-top:6px">Programado: <b>${money(scheduled)}</b> de ${money(p.price)} contratado · ${cuadre}</div>
      <div style="margin-top:12px">${paysRows||'<span class="muted">Sin pagos. Usa “+ Pago” o “Generar”.</span>'}</div></div>
  </div>`;
}

/* prompts rápidos */
/* ---- modal genérico (etapa / frente / nueva tarea) ---- */
function closeQM(){qm=null;render();}
function openEtapaForm(pid){qm={kind:'etapa',pid};render();}
function openFrenteForm(pid){qm={kind:'frente',pid};render();}
function openTaskForm(pid,fid,etid){qm={kind:'task',pid,fid,etid};render();}

function quickModal(){
  if(!qm) return '';
  const p=store.project(qm.pid);
  let inner='';
  if(qm.kind==='etapa' || qm.kind==='etapaEdit'){
    const e=qm.kind==='etapaEdit'?store.etapasOf(qm.pid).find(x=>x.id===qm.eid):{name:'Etapa '+(store.etapasOf(qm.pid).length+1),start:p.startDate,end:p.endDate};
    inner=`<h3>${qm.kind==='etapaEdit'?'Editar etapa':'Nueva etapa'}</h3>
      <div class="field"><label>Nombre</label><input id="qm-name" value="${esc(e.name||'')}"></div>
      <div class="field row"><div><label>Inicio</label><input id="qm-start" type="date" value="${e.start||''}"></div>
        <div><label>Fin</label><input id="qm-end" type="date" value="${e.end||''}"></div></div>
      <div class="hint">Las etapas son las columnas del Gantt (ventanas de meses reales). La etapa de cada subtarea se deduce de su fecha.</div>
      <div class="wiz-actions"><button class="btn ghost" onclick="closeQM()">Cancelar</button><button class="btn" onclick="${qm.kind==='etapaEdit'?'saveEtapaEdit()':'saveEtapa()'}">Guardar</button></div>`;
  } else if(qm.kind==='frente'){
    const nextColor=FRENTE_PALETTE[store.frentesOf(qm.pid).length%FRENTE_PALETTE.length];
    inner=`<h3>Nuevo frente</h3>
      <div class="field"><label>Nombre</label><input id="qm-name" placeholder="Ej. Onboarding"></div>
      <div class="field"><label>Color</label>${colorPicker(nextColor)}</div>
      <div class="hint">Los frentes son las filas del Gantt.</div>
      <div class="wiz-actions"><button class="btn ghost" onclick="closeQM()">Cancelar</button><button class="btn" onclick="saveFrente()">Crear frente</button></div>`;
  } else if(qm.kind==='frenteEdit'){
    const f=store.frentesOf(qm.pid).find(x=>x.id===qm.fid)||{name:'',color:'#223c36'};
    inner=`<h3>Editar frente</h3>
      <div class="field"><label>Nombre</label><input id="qm-name" value="${esc(f.name)}"></div>
      <div class="field"><label>Color</label>${colorPicker(f.color)}</div>
      <div class="hint">El orden se ajusta con las flechas ↑ ↓ en el Gestor.</div>
      <div class="wiz-actions"><button class="btn ghost" onclick="closeQM()">Cancelar</button><button class="btn" onclick="saveFrenteEdit()">Guardar</button></div>`;
  } else if(qm.kind==='proyectoEdit'){
    const p2=store.project(qm.pid);
    inner=`<h3>Editar proyecto</h3>
      <div class="field"><label>Nombre del proyecto</label><input id="qm-pname" value="${esc(p2.name||'')}" placeholder="Ej. Marketing 2026"></div>
      <div class="field row"><div><label>Precio contratado</label><input id="qm-price" type="number" value="${p2.price||0}"></div>
        <div><label>Pago por mes</label><input id="qm-monthly" type="number" value="${p2.monthlyPay||0}"></div></div>
      <div class="field row"><div><label># meses</label><input id="qm-months" type="number" value="${p2.months||0}"></div>
        <div><label>Día de pago</label><input id="qm-payday" type="number" value="${p2.paymentDay||1}"></div></div>
      <div class="field row"><div><label>Inicio</label><input id="qm-start" type="date" value="${p2.startDate||''}"></div>
        <div><label>Cierre</label><input id="qm-end" type="date" value="${p2.endDate||''}"></div></div>
      <div class="hint">Editar el precio no toca el calendario de pagos (ese lo manejas aparte). Tip: puedes usar el total programado como precio.</div>
      <div class="wiz-actions"><button class="btn ghost" style="margin-right:auto;color:#c0392b" onclick="openProjectDel('${qm.pid}')">🗑️ Eliminar proyecto</button><button class="btn ghost" onclick="closeQM()">Cancelar</button><button class="btn" onclick="saveProjectEdit()">Guardar</button></div>`;
  } else if(qm.kind==='proyectoDel'){
    const p2=store.project(qm.pid), st=store.projectStats(qm.pid);
    inner=`<h3 style="color:#c0392b">Eliminar proyecto</h3>
      <p>Vas a borrar <b>${esc(p2.name)}</b> de forma <b>permanente</b>. Esto no se puede deshacer.</p>
      <div class="card" style="background:#fdeceb;border-color:#e8b4b0;margin:10px 0"><div style="font-size:.88rem">Se eliminarán también: <b>${st.tareas}</b> tarea(s), <b>${st.subtareas}</b> subtarea(s) con sus comentarios y bitácora, <b>${st.pagos}</b> pago(s), <b>${st.frentes}</b> frente(s) y <b>${st.etapas}</b> etapa(s).</div></div>
      <div class="field"><label>Para confirmar, escribe el nombre del proyecto exactamente</label><input id="qm-delname" placeholder="${esc(p2.name)}" autocomplete="off" oninput="document.getElementById('qm-delbtn').disabled=(this.value.trim()!==${JSON.stringify(p2.name.trim()).replace(/"/g,'&quot;')})"></div>
      <div class="wiz-actions"><button class="btn ghost" onclick="closeQM()">Cancelar</button><button class="btn" id="qm-delbtn" disabled style="background:#c0392b;border-color:#c0392b" onclick="confirmProjectDel()">Eliminar para siempre</button></div>`;
  } else if(qm.kind==='pagoEstado'){
    const x=store.d.payments.find(z=>z.id===qm.payId)||{}; const p2=store.project(x.projectId)||{name:''}; const e=payEstado(x); const f=x.factura||{}, cb=x.cobro||{};
    inner=`<h3>💰 Estado del pago</h3><div class="muted" style="margin:-4px 0 12px">${esc(p2.name)} · vence ${x.dueDate?dLabel(x.dueDate):'—'} · <b>${money(x.amount)}</b></div>
      <div class="field"><label>Estado</label><select id="pe-estado" onchange="payEstadoChange()">${Object.keys(PAY_ST).map(k=>`<option value="${k}" ${e===k?'selected':''}>${PAY_ST[k].t}</option>`).join('')}</select></div>
      <div id="pe-fac" class="sm-series" style="display:none;margin-bottom:12px"><label style="font-weight:700;font-size:.78rem">🧾 FACTURA</label><div class="field row" style="margin-top:6px"><div><label>Folio</label><input id="pe-folio" value="${esc(f.folio||'')}" placeholder="A-1234"></div><div><label>Fecha de factura</label><input id="pe-ffecha" type="date" value="${f.fecha||''}"></div></div></div>
      <div id="pe-cob" class="sm-series" style="display:none;margin-bottom:12px"><label style="font-weight:700;font-size:.78rem">💵 COBRO</label><div class="field row" style="margin-top:6px"><div><label>Monto cobrado</label><input id="pe-cmonto" type="number" value="${cb.monto!=null?cb.monto:''}" oninput="this.dataset.touched=1"></div><div><label>Fecha de cobro</label><input id="pe-cfecha" type="date" value="${cb.fecha||''}"></div></div></div>
      <div id="pe-con" class="sm-series" style="display:none;margin-bottom:12px"><label style="font-weight:700;font-size:.78rem">✔ CONCILIACIÓN</label><div class="field" style="margin-top:6px"><label>Fecha de conciliación</label><input id="pe-confecha" type="date" value="${x.conciliadoFecha||''}"></div></div>
      <div class="field"><label>Nota (opcional)</label><input id="pe-nota" value="${esc(x.nota||'')}" placeholder="Ej. transferencia SPEI, complemento de pago pendiente"></div>
      <div class="wiz-actions"><button class="btn ghost" onclick="closeQM()">Cancelar</button><button class="btn" onclick="savePayEstado()">Guardar</button></div>`;
  } else if(qm.kind==='pago' || qm.kind==='pagoEdit'){
    const p2=store.project(qm.pid); const x=qm.kind==='pagoEdit'?store.paymentsOf(qm.pid).find(z=>z.id===qm.payId):{dueDate:p2.startDate,amount:p2.monthlyPay||''};
    inner=`<h3>${qm.kind==='pagoEdit'?'Editar pago':'Nuevo pago'}</h3>
      <div class="field row"><div><label>Fecha de vencimiento</label><input id="qm-pdate" type="date" value="${x.dueDate||''}"></div>
        <div><label>Monto</label><input id="qm-pamount" type="number" value="${x.amount||''}" placeholder="10000"></div></div>
      <div class="wiz-actions"><button class="btn ghost" onclick="closeQM()">Cancelar</button><button class="btn" onclick="${qm.kind==='pagoEdit'?'savePayEdit()':'savePay()'}">Guardar</button></div>`;
  } else if(qm.kind==='genPagos'){
    const p2=store.project(qm.pid);
    inner=`<h3>Generar calendario de pagos</h3>
      <div class="field"><label>Frecuencia</label><select id="qm-freq"><option value="semanal">Semanal</option><option value="quincenal">Quincenal</option><option value="mensual" selected>Mensual</option></select></div>
      <div class="field row"><div><label>Número de pagos</label><input id="qm-count" type="number" value="${p2.months||4}"></div>
        <div><label>Monto total</label><input id="qm-total" type="number" value="${p2.price||''}"></div></div>
      <div class="field"><label>Fecha del primer pago</label><input id="qm-pstart" type="date" value="${p2.startDate}"></div>
      <div class="hint">Reparte el total en partes iguales (la última ajusta el redondeo). Después puedes editar montos sueltos (ej. 10, 10, 10, 8).</div>
      <div class="wiz-actions"><button class="btn ghost" onclick="closeQM()">Cancelar</button><button class="btn" onclick="runGenPagos()">Generar</button></div>`;
  } else if(qm.kind==='cliente' || qm.kind==='clienteEdit'){
    const c=qm.kind==='clienteEdit'?store.client(qm.cid):{name:'',razon:'',rfc:'',location:'',web:'',ig:'',fb:'',youtube:'',tiktok:'',linkedin:'',otro:'',generalResponsibleId:null};
    const respOpts='<option value="">— sin asignar —</option>'+staffOptEls(c.generalResponsibleId);
    inner=`<h3>${qm.kind==='clienteEdit'?'Editar cliente':'Nuevo cliente'}</h3>
      <div class="field"><label>Nombre comercial</label><input id="qm-name" value="${esc(c.name)}" placeholder="Ej. ADN Media"></div>
      <div class="field"><label>Logo del cliente</label><div style="display:flex;align-items:center;gap:12px"><span id="cl-logo-prev" class="cl-logo-prev" style="${c.logo?`background-image:url('${esc(c.logo)}')`:''}">${c.logo?'':'Sin logo'}</span><div><input type="hidden" id="qm-logo" value="${esc(c.logo||'')}"><input type="file" accept="image/*" onchange="photoPickInto(this,'qm-logo','cl-logo-prev','cl-logo-hint','clientes')" style="font-size:.8rem"><div class="hint" id="cl-logo-hint">Aparece en la página de sesión que ve el cliente</div></div></div></div>
      <div class="field"><label>Tipo de cliente</label><select id="qm-tipo"><option value="externo" ${c.tipo==='interno'?'':'selected'}>Externo (genera ingreso y costo)</option><option value="interno" ${c.tipo==='interno'?'selected':''}>Interno (capacitaciones, juntas, RH… cuenta horas, no costo)</option></select></div>
      <div class="field row"><div><label>Razón social</label><input id="qm-razon" value="${esc(c.razon||'')}"></div>
        <div><label>RFC</label><input id="qm-rfc" value="${esc(c.rfc||'')}"></div></div>
      <div class="field row"><div><label>Ubicación (dirección completa, para el mapa)</label><input id="qm-loc" value="${esc(c.location||'')}" placeholder="Calle, número, colonia, ciudad"></div>
        <div><label>Responsable Nuwek</label><select id="qm-resp2">${respOpts}</select></div></div>
      <div class="field"><label>Web</label><input id="qm-web" value="${esc(c.web||'')}" placeholder="sitio.mx"></div>
      <div class="se-lbl" style="margin-bottom:8px">Redes sociales</div>
      <div class="field row"><div><label>Instagram</label><input id="qm-ig" value="${esc(c.ig||'')}" placeholder="@cuenta"></div>
        <div><label>Facebook</label><input id="qm-fb" value="${esc(c.fb||'')}"></div></div>
      <div class="field row"><div><label>YouTube</label><input id="qm-yt" value="${esc(c.youtube||'')}"></div>
        <div><label>TikTok</label><input id="qm-tt" value="${esc(c.tiktok||'')}"></div></div>
      <div class="field row"><div><label>LinkedIn</label><input id="qm-in" value="${esc(c.linkedin||'')}"></div>
        <div><label>Otro</label><input id="qm-otro" value="${esc(c.otro||'')}"></div></div>
      ${qm.kind==='clienteEdit'&&isGerencia()?`<div class="danger-zone"><div class="muted" style="font-size:.78rem;margin-bottom:6px">Zona delicada</div><button type="button" class="btn ghost sm" title="Se conserva todo, pero el cliente se oculta y sus usuarios no entran" onclick="toggleClientActive('${c.id}')">${c.activo===false?'↩ Reactivar cliente':'⏸ Desactivar cliente'}</button> <button type="button" class="btn ghost sm" style="color:#c0392b" onclick="deleteClient('${c.id}')">🗑️ Eliminar cliente</button></div>`:''}
      <div class="wiz-actions"><button class="btn ghost" onclick="closeQM()">Cancelar</button><button class="btn" onclick="${qm.kind==='clienteEdit'?'saveClientEdit()':'saveClient()'}">Guardar</button></div>`;
  } else if(qm.kind==='contacto' || qm.kind==='contactoEdit'){
    const p=qm.kind==='contactoEdit'?(store.client(qm.cid).people.find(x=>x.id===qm.pid)||{}):{};
    inner=`<h3>${qm.kind==='contactoEdit'?'Editar contacto':'Nuevo contacto'}</h3>
      <div class="field"><label>Nombre</label><input id="qm-name" value="${esc(p.name||'')}"></div>
      <div class="field"><label>Foto (opcional)</label><div style="display:flex;align-items:center;gap:12px"><span id="ct-prev" class="cl-logo-prev" style="border-radius:50%;${p.photo?`background-image:url('${esc(p.photo)}')`:''}">${p.photo?'':'?'}</span><div><input type="hidden" id="qm-cphoto" value="${esc(p.photo||'')}"><input type="file" accept="image/*" onchange="photoPickInto(this,'qm-cphoto','ct-prev','ct-hint','contactos')" style="font-size:.8rem"><div class="hint" id="ct-hint"></div></div></div></div>
      <div class="field row"><div><label>Teléfono</label><input id="qm-phone" value="${esc(p.phone||'')}"></div>
        <div><label>Correo</label><input id="qm-email" value="${esc(p.email||'')}"></div></div>
      <div class="field row"><div><label>Rol</label><input id="qm-crole" value="${esc(p.role||'')}" placeholder="Ej. Coord. Marketing"></div>
        <div><label>Cumpleaños (MM-DD)</label><input id="qm-bday" value="${esc(p.birthday||'')}" placeholder="03-14"></div></div>
      <div class="sm-series" style="margin-bottom:12px"><label style="font-weight:700;font-size:.78rem">🔑 ACCESO AL PORTAL DEL CLIENTE</label>
        <div class="field row" style="margin-top:6px"><div><label>Usuario</label><input id="qm-pu" value="${esc((p.portal&&p.portal.user)||'')}" autocapitalize="off" placeholder="ej. maria.lopez"></div><div><label>Código de 6 cifras</label><input id="qm-pc" inputmode="numeric" maxlength="6" value="${esc((p.portal&&p.portal.code)||'')}" placeholder="123456"></div></div>
        <div class="field row"><div><label>Rol</label><select id="qm-pr"><option value="admin" ${p.portal&&p.portal.rol==='admin'?'selected':''}>Administrador</option><option value="colab" ${p.portal&&p.portal.rol==='colab'?'selected':''}>Colaborador</option></select></div><div style="padding-top:24px"><label class="gf-opt"><input type="checkbox" id="qm-pa" ${(!p.portal||p.portal.activo!==false)?'checked':''}> Activo</label></div></div>
        <div class="hint">Déjalo vacío si esta persona no entrará al portal. El administrador del cliente crea después a su propia gente.</div></div>
      <div class="wiz-actions"><button class="btn ghost" onclick="closeQM()">Cancelar</button><button class="btn" onclick="${qm.kind==='contactoEdit'?'saveContactEdit()':'saveContact()'}">Guardar</button></div>`;
  } else if(qm.kind==='servicio' || qm.kind==='servicioEdit'){
    const s=qm.kind==='servicioEdit'?store.service(qm.sid):{name:'',listPrice:'',opCost:''};
    inner=`<h3>${qm.kind==='servicioEdit'?'Editar servicio':'Nuevo servicio'}</h3>
      <div class="field"><label>Nombre del servicio</label><input id="qm-name" value="${esc(s.name)}" placeholder="Ej. Marketing"></div>
      <div class="field row"><div><label>Precio de lista (sugerido)</label><input id="qm-svprice" type="number" value="${s.listPrice||''}" placeholder="162500"></div>
        <div><label>Costo operativo estimado</label><input id="qm-svcost" type="number" value="${s.opCost||''}" placeholder="8000"></div></div>
      <div class="hint">El precio de lista se precarga al crear un proyecto (puedes ajustarlo por cliente). El costo es una referencia para ver el margen. Ambos opcionales.</div>
      <div class="hint">${qm.kind==='servicioEdit'?'Los frentes y tareas base se editan en la tarjeta del servicio.':'Después podrás agregarle frentes y tareas.'}</div>
      <div class="wiz-actions"><button class="btn ghost" onclick="closeQM()">Cancelar</button><button class="btn" onclick="${qm.kind==='servicioEdit'?'saveSvcEdit()':'saveSvc()'}">Guardar</button></div>`;
  } else if(qm.kind==='svSubLink'){
    inner=`<h3>Nuevo link de subtarea</h3>
      <div class="field"><label>Etiqueta del link</label><input id="qm-name" placeholder="Ej. Planeación / Copys"></div>
      <div class="hint">Aparecerá como campo de link en cada subtarea de los proyectos de este servicio.</div>
      <div class="wiz-actions"><button class="btn ghost" onclick="closeQM()">Cancelar</button><button class="btn" onclick="saveSvcSubLink()">Agregar</button></div>`;
  } else if(qm.kind==='svcTask' || qm.kind==='svcTaskEdit'){
    const s=store.service(qm.sid); const cur=qm.kind==='svcTaskEdit'?(s.tasks[qm.idx]||['','','']):['','',''];
    const frOpts=s.frentes.map(f=>`<option value="${esc(f.name)}" ${f.name===cur[0]?'selected':''}>${f.name}</option>`).join('');
    inner=`<h3>${qm.kind==='svcTaskEdit'?'Editar tarea base':'Nueva tarea base'}</h3>
      <div class="field"><label>Nombre de la tarea</label><input id="qm-tname" value="${esc(cur[1])}" placeholder="Ej. Parrilla de contenidos"></div>
      <div class="field"><label>Descripción (opcional)</label><textarea id="qm-tdesc" style="width:100%;min-height:64px;padding:9px;border:2px solid var(--line);border-radius:7px" placeholder="Objetivo, contexto, qué entrega…">${esc(cur[2]||'')}</textarea></div>
      <div class="field"><label>Frente</label><select id="qm-tfrente">${frOpts}</select></div>
      <div class="hint">Estas tareas (con su descripción) se precargan al crear un proyecto con este servicio.</div>
      <div class="wiz-actions"><button class="btn ghost" onclick="closeQM()">Cancelar</button><button class="btn" onclick="${qm.kind==='svcTaskEdit'?'saveSvcTaskEdit()':'saveSvcTask()'}">Guardar</button></div>`;
  } else if(qm.kind==='svFrente' || qm.kind==='svFrenteEdit'){
    const s=store.service(qm.sid); const cur=qm.kind==='svFrenteEdit'?(s.frentes.find(f=>f.name===qm.old)||{name:'',color:'#3f7d6e'}):{name:'',color:FRENTE_PALETTE[(s?s.frentes.length:0)%FRENTE_PALETTE.length]};
    inner=`<h3>${qm.kind==='svFrenteEdit'?'Editar frente del servicio':'Agregar frente al servicio'}</h3>
      <div class="field"><label>Nombre del frente</label><input id="qm-name" value="${esc(cur.name)}" placeholder="Ej. Onboarding"></div>
      <div class="field"><label>Color</label>${colorPicker(cur.color)}</div>
      <div class="wiz-actions"><button class="btn ghost" onclick="closeQM()">Cancelar</button><button class="btn" onclick="${qm.kind==='svFrenteEdit'?'saveSvcFrenteEdit()':'saveSvcFrente()'}">Guardar</button></div>`;
  } else if(qm.kind==='persona' || qm.kind==='personaEdit'){
    const u=qm.kind==='personaEdit'?store.d.staff.find(x=>x.id===qm.uid):{name:'',role:'',rate:'',color:'#3f7d6e'};
    const h=u.health||{}, cp=u.computer||{};
    const TEAMS=['Consulting','Sales','Marketing','Apoyo','Gerencial','Directivo'];
    const TIPOS=['Interno','Freelance','Externo'];
    const BLOOD=['','O+','O-','A+','A-','B+','B-','AB+','AB-'];
    const CSTAT=['','Óptimo','Bueno','Regular','En reparación','Propio','Baja'];
    const opt=(arr,cur)=>arr.map(o=>`<option value="${esc(o)}" ${o===(cur||'')?'selected':''}>${o||'—'}</option>`).join('');
    inner=`<div class="pers-modal"><h3>${qm.kind==='personaEdit'?'Editar persona':'Nueva persona (Nuwek)'}</h3>
      <div class="pers-tabs">
        <button class="pers-tab active" data-sec="basicos" onclick="persTab('basicos')">Básicos</button>
        <button class="pers-tab" data-sec="contacto" onclick="persTab('contacto')">Contacto</button>
        <button class="pers-tab" data-sec="laboral" onclick="persTab('laboral')">Laboral</button>
        <button class="pers-tab" data-sec="salud" onclick="persTab('salud')">Salud</button>
        <button class="pers-tab" data-sec="computo" onclick="persTab('computo')">Cómputo</button>
      </div>

      <div class="pers-sec" data-sec="basicos">
        <div style="display:flex;gap:14px;align-items:center;margin-bottom:12px">
          <div id="pers-photo-prev" class="pers-photo" style="${u.photo?`background-image:url('${u.photo}')`:''}">${u.photo?'':esc((u.name||'?')[0])}</div>
          <div><input type="hidden" id="qm-photo" value="${u.photo||''}">
            <input type="file" accept="image/*" id="qm-photo-file" onchange="persPhotoPick(this)" style="font-size:.8rem">
            <div class="hint" id="qm-photo-hint">Foto JPG/PNG · se comprime sola</div></div>
        </div>
        <div class="field row"><div><label>Nombre (acceso y todo el sistema)</label><input id="qm-fname" value="${esc(u.firstName||u.name||'')}" placeholder="Carlos"></div>
          <div><label>Segundo nombre (opcional)</label><input id="qm-sname" value="${esc(u.secondName||'')}" placeholder="Alberto"></div></div>
        <div class="field"><label>Apellidos</label><input id="qm-lname" value="${esc(u.lastName||'')}" placeholder="Pérez García"></div>
        <div class="field row"><div><label>Rol / puesto</label><input id="qm-role" value="${esc(u.role||'')}" placeholder="Ej. Diseño"></div>
          <div><label>Equipo</label><select id="qm-team">${opt(TEAMS,u.team)}</select></div></div>
        <div class="field row"><div><label>Tipo</label><select id="qm-tipo">${opt(TIPOS,u.tipo)}</select></div>
          <div><label>Color</label>${colorPicker(u.color||'#3f7d6e')}</div></div>
        <div class="field row"><div><label>Fecha de ingreso</label><input id="qm-join" type="date" value="${esc(u.joinDate||'')}"></div>
          <div><label>Estado</label><select id="qm-active"><option value="1" ${u.active!==false?'selected':''}>Activo</option><option value="0" ${u.active===false?'selected':''}>Inactivo</option></select></div></div>
        <div class="pers-div">Acceso al sistema</div>
        <div class="field row"><div><label>Contraseña de ingreso (6 dígitos)</label><input id="qm-pass" inputmode="numeric" maxlength="6" pattern="[0-9]*" value="${esc(u.password||'')}" placeholder="••••••" style="letter-spacing:3px;max-width:160px"></div>
          <div><label>Permiso</label><select id="qm-perm">${permOptions(u.perm)}</select></div></div>
      </div>

      <div class="pers-sec" data-sec="contacto" style="display:none">
        <div class="field row"><div><label>Correo Gmail</label><input id="qm-gmail" value="${esc(u.gmail||'')}" placeholder="nombre@gmail.com"></div>
          <div><label>Correo empresarial</label><input id="qm-emailw" value="${esc(u.emailWork||'')}" placeholder="nombre@nuwek.mx"></div></div>
        <div class="field row"><div><label>Teléfono personal</label><input id="qm-phonep" value="${esc(u.phonePersonal||'')}" placeholder="771-000-0000"></div>
          <div><label>Teléfono empresa</label><input id="qm-phonew" value="${esc(u.phoneWork||'')}" placeholder="771-000-0000"></div></div>
        <div class="field row"><div><label>Cumpleaños (MM-DD)</label><input id="qm-bday" value="${esc(u.birthday||'')}" placeholder="03-14"></div>
          <div><label>Ciudad</label><input id="qm-city" value="${esc(u.city||'')}" placeholder="Pachuca, Hgo"></div></div>
      </div>

      <div class="pers-sec" data-sec="laboral" style="display:none">
        <div class="field row"><div><label>Tarifa por hora</label><input id="qm-rate" type="number" value="${u.rate||''}" placeholder="280"></div>
          <div><label>Sueldo mensual</label><input id="qm-salary" type="number" value="${u.salaryMonthly||''}" placeholder="14000"></div></div>
        <div class="field"><label>Habilidades / especialidad</label><input id="qm-skills" value="${esc(u.skills||'')}" placeholder="Diseño, Copy, Meta Ads…"></div>
        <div class="pers-div">Datos fiscales</div>
        <div class="field row"><div><label>RFC</label><input id="qm-rfc" value="${esc(u.rfc||'')}" placeholder="XAXX010101000" style="text-transform:uppercase"></div>
          <div><label>NSS</label><input id="qm-nss" value="${esc(u.nss||'')}" placeholder="12345678901"></div></div>
        <div class="field"><label>CURP</label><input id="qm-curp" value="${esc(u.curp||'')}" placeholder="XAXX010101HDFXXX01" style="text-transform:uppercase"></div>
      </div>

      <div class="pers-sec" data-sec="salud" style="display:none">
        <div class="hint" style="margin-bottom:8px">🔒 Dato sensible · en modo demo todos lo ven; luego se restringe por tipo de usuario.</div>
        <div class="field row"><div><label>Tipo de sangre</label><select id="qm-blood">${opt(BLOOD,h.blood)}</select></div>
          <div><label>Alergias</label><input id="qm-allergies" value="${esc(h.allergies||'')}" placeholder="Penicilina…"></div></div>
        <div class="field"><label>Padecimientos relevantes</label><input id="qm-conditions" value="${esc(h.conditions||'')}" placeholder="Diabetes, asma…"></div>
        <div class="field"><label>Restricciones alimentarias</label><input id="qm-diet" value="${esc(h.diet||'')}" placeholder="Vegetariano, sin gluten…"></div>
        <div class="pers-div">Contacto de emergencia</div>
        <div class="field row"><div><label>Nombre</label><input id="qm-emname" value="${esc(h.emName||'')}"></div>
          <div><label>Parentesco</label><input id="qm-emrel" value="${esc(h.emRel||'')}" placeholder="Madre, pareja…"></div></div>
        <div class="field"><label>Teléfono de emergencia</label><input id="qm-emphone" value="${esc(h.emPhone||'')}" placeholder="771-000-0000" style="max-width:200px"></div>
      </div>

      <div class="pers-sec" data-sec="computo" style="display:none">
        <div class="field row"><div><label>Equipo / modelo</label><input id="qm-cmodel" value="${esc(cp.model||'')}" placeholder="MacBook Air M2"></div>
          <div><label>No. de serie / inventario</label><input id="qm-cserial" value="${esc(cp.serial||'')}"></div></div>
        <div class="field row"><div><label>Fecha de asignación</label><input id="qm-cassigned" type="date" value="${esc(cp.assignedDate||'')}"></div>
          <div><label>Estado</label><select id="qm-cstatus">${opt(CSTAT,cp.status)}</select></div></div>
        <div class="field"><label>Accesorios</label><input id="qm-caccess" value="${esc(cp.accessories||'')}" placeholder="Mouse, base, monitor…"></div>
        <div class="field"><label>Licencias / software</label><input id="qm-clicenses" value="${esc(cp.licenses||'')}" placeholder="Adobe CC, Meta Business…"></div>
      </div>

      <div class="wiz-actions"><button class="btn ghost" onclick="closeQM()">Cancelar</button><button class="btn" onclick="${qm.kind==='personaEdit'?'saveStaffEdit()':'saveStaff()'}">Guardar</button></div>
    </div>`;
  } else if(qm.kind==='tag' || qm.kind==='tagEdit'){
    const curColor=qm.kind==='tagEdit'?store.tagColor(qm.old):'#3f7d6e';
    inner=`<h3>${qm.kind==='tagEdit'?'Editar etiqueta':'Nueva etiqueta'}</h3>
      <div class="field"><label>Nombre</label><input id="qm-name" value="${esc(qm.kind==='tagEdit'?qm.old:'')}"></div>
      <div class="field"><label>Color</label>${colorPicker(curColor)}</div>
      ${qm.kind==='tagEdit'?'<div class="hint">El nombre se actualizará también en las tareas que la usan.</div>':''}
      <div class="wiz-actions"><button class="btn ghost" onclick="closeQM()">Cancelar</button><button class="btn" onclick="${qm.kind==='tagEdit'?'saveTagEdit()':'saveTag()'}">Guardar</button></div>`;
  } else if(qm.kind==='score' || qm.kind==='scoreEdit'){
    const s=qm.kind==='scoreEdit'?(store.scorecardsOf(qm.pid).find(x=>x.id===qm.sid)||{title:'',url:'',date:todayISO()}):{title:'',url:'',date:todayISO()};
    inner=`<h3>${qm.kind==='scoreEdit'?'Editar scorecard':'Nuevo scorecard'}</h3>
      <div class="field"><label>Título / periodo</label><input id="qm-sctitle" value="${esc(s.title||'')}" placeholder="Ej. Scorecard Julio 2026"></div>
      <div class="field"><label>Link del scorecard</label><input id="qm-scurl" value="${esc(s.url||'')}" placeholder="https://…"></div>
      <div class="field"><label>Fecha</label><input id="qm-scdate" type="date" value="${esc(s.date||todayISO())}" style="max-width:180px"></div>
      <div class="hint">Si no pones http(s), se asume https://</div>
      <div class="wiz-actions"><button class="btn ghost" onclick="closeQM()">Cancelar</button><button class="btn" onclick="${qm.kind==='scoreEdit'?'saveScoreEdit()':'saveScore()'}">Guardar</button></div>`;
  } else if(qm.kind==='link' || qm.kind==='linkEdit'){
    const l=qm.kind==='linkEdit'?(store.linksOf(qm.pid).find(x=>x.id===qm.lid)||{label:''}):{label:''};
    if(!qm.urls){ qm.urls=linkUrls(l).map(u=>({title:u.title||'',url:u.url||''})); if(!qm.urls.length) qm.urls=[{title:'',url:''}]; }
    const urlRows=qm.urls.map((u,i)=>`<div class="lk-row"><input class="lk-t" id="qm-lkt-${i}" value="${esc(u.title)}" placeholder="Título (opcional)"><input class="lk-u" id="qm-lku-${i}" value="${esc(u.url)}" placeholder="https://…"><button class="btn ghost sm" title="Quitar" onclick="lkRemove(${i})">×</button></div>`).join('');
    inner=`<h3>${qm.kind==='linkEdit'?'Editar link':'Nuevo link'}</h3>
      <div class="field"><label>Nombre</label><input id="qm-lklabel" value="${esc(l.label||'')}" placeholder="Ej. Brand kit / Drive del cliente"></div>
      <div class="field"><label>URLs</label>${urlRows}<button class="btn ghost sm" style="margin-top:6px" onclick="lkAdd()">+ Agregar otra URL</button></div>
      <div class="hint">Si no pones http(s), se asume https://</div>
      <div class="wiz-actions"><button class="btn ghost" onclick="closeQM()">Cancelar</button><button class="btn" onclick="saveLibLink()">Guardar</button></div>`;
  } else if(qm.kind==='gestFilter'){
    const f=qm.f;
    inner=`<h3>${qm.fid?'Editar vista':'Nueva vista'}</h3>
      <div class="field"><label>Nombre de la vista</label><input id="gf-name" value="${esc(f.name)}" placeholder="Ej. Marketing"></div>
      <div class="field"><label>Clientes <span class="muted" style="text-transform:none">(sin marcar = todos)</span></label><div class="gf-list">${store.d.clients.slice().sort((a,b)=>(a.name||'').localeCompare(b.name||'')).map(c=>`<label class="gf-opt"><input type="checkbox" class="gf-cl" value="${c.id}" ${(f.clients||[]).includes(c.id)?'checked':''}> ${esc(c.name)}</label>`).join('')}</div></div>
      <div class="field"><label>Personas <span class="muted" style="text-transform:none">(sin marcar = todas)</span></label><div class="gf-list">${store.activeStaff().map(u=>`<label class="gf-opt"><input type="checkbox" class="gf-pe" value="${u.id}" ${(f.people||[]).includes(u.id)?'checked':''}> ${esc(u.name)}</label>`).join('')}</div></div>
      <div class="field"><label>Periodo</label><div class="gf-scope">${[['dia','Hoy'],['semana','Semana'],['mes','Mes']].map(([v,l])=>`<label class="gf-opt"><input type="radio" name="gf-scope" value="${v}" ${(f.scope||'mes')===v?'checked':''}> ${l}</label>`).join('')}</div>
        <div class="hint">Con la vista aplicada puedes avanzar o retroceder de periodo con las flechas (‹ ›).</div></div>
      <div class="wiz-actions">${qm.fid?'<button class="btn ghost" style="margin-right:auto;color:#c0392b" onclick="delGestFilter()">🗑️ Eliminar</button>':''}<button class="btn ghost" onclick="closeQM()">Cancelar</button><button class="btn" onclick="saveGestFilter()">Guardar</button></div>`;
  } else if(qm.kind==='kbTask'){
    const projs=store.d.projects.slice();
    const pid=qm.pid||(projs[0]&&projs[0].id); const p2=store.project(pid);
    const projOpts=projs.map(pr=>`<option value="${pr.id}" ${pr.id===pid?'selected':''}>${store.client(pr.clientId).name} · ${pr.name}</option>`).join('');
    const frentes=store.frentesOf(pid), etapas=store.etapasOf(pid);
    const frOpts=frentes.map(f=>`<option value="${f.id}">${f.name}</option>`).join('');
    const etOpts=`<option value="">(según fecha límite)</option>`+etapas.map(e=>`<option value="${e.id}">${e.name}</option>`).join('');
    const persOpts=staffOptEls('');
    inner=`<h3>Nueva tarea</h3>
      <div class="field"><label>Proyecto</label><select id="kb-proj" onchange="kbTaskProject(this.value)">${projOpts}</select></div>
      <div class="field"><label>Nombre de la tarea</label><input id="qm-name" placeholder="Ej. Parrilla de contenidos" value="${esc(qm.name||'')}"></div>
      <div class="field"><label>Descripción general (opcional)</label><textarea id="qm-desc" style="width:100%;min-height:56px;padding:9px;border:2px solid var(--line);border-radius:7px" placeholder="Objetivo, contexto…">${esc(qm.desc||'')}</textarea></div>
      <div class="field row"><div><label>Frente</label><select id="qm-frente">${frOpts}</select></div>
        <div><label>Etapa</label><select id="qm-etapa" onchange="qmEtapaSync2()">${etOpts}</select></div></div>
      <div class="field row"><div><label>Responsable</label><select id="qm-resp">${persOpts}</select></div>
        <div><label>Fecha límite</label><input id="qm-date" type="date" value="${p2?p2.startDate:todayISO()}"></div></div>
      <div class="field"><label>Etiquetas (del catálogo)</label>${tagPicker('qm-tags-box',[])}</div>
      ${frentes.length?'':'<div class="hint" style="color:var(--bad)">Este proyecto no tiene frentes aún.</div>'}
      <div class="wiz-actions"><button class="btn ghost" onclick="closeQM()">Cancelar</button><button class="btn" onclick="saveKbTask()" ${frentes.length?'':'disabled'}>Crear tarea</button></div>`;
  } else { // task
    const frentes=store.frentesOf(qm.pid), etapas=store.etapasOf(qm.pid);
    const fr=frentes.find(f=>f.id===qm.fid)||frentes[0];
    const et=etapas.find(e=>e.id===qm.etid);
    const defDate=et?et.start:p.startDate;
    const frOpts=frentes.map(f=>`<option value="${f.id}" ${f.id===(qm.fid||'')?'selected':''}>${f.name}</option>`).join('');
    const etOpts=`<option value="">(según fecha límite)</option>`+etapas.map(e=>`<option value="${e.id}" ${e.id===qm.etid?'selected':''}>${e.name}</option>`).join('');
    const persOpts=staffOptEls('');
    inner=`<h3>Nueva tarea</h3>
      <div class="field"><label>Nombre de la tarea</label><input id="qm-name" placeholder="Ej. Parrilla de contenidos"></div>
      <div class="field"><label>Descripción general (opcional)</label><textarea id="qm-desc" style="width:100%;min-height:60px;padding:9px;border:2px solid var(--line);border-radius:7px" placeholder="Objetivo, contexto, lineamientos… (admite **negrita**, *cursiva*, # títulos, - listas)"></textarea></div>
      <div class="field row"><div><label>Frente</label><select id="qm-frente">${frOpts}</select></div>
        <div><label>Etapa</label><select id="qm-etapa" onchange="qmEtapaSync()">${etOpts}</select></div></div>
      <div class="field row"><div><label>Responsable</label><select id="qm-resp">${persOpts}</select></div>
        <div><label>Fecha límite</label><input id="qm-date" type="date" value="${defDate}"></div></div>
      <div class="field"><label>Etiquetas (del catálogo)</label>${tagPicker('qm-tags-box',[])}</div>
      <div class="hint">La tarea aparecerá en la columna de su etapa (o según su fecha límite).</div>
      <div class="wiz-actions"><button class="btn ghost" onclick="closeQM()">Cancelar</button><button class="btn" onclick="saveNewTask()">Crear tarea</button></div>`;
  }
  return `<div class="modal active" onclick="if(event.target===this)closeQM()"><div class="modal-card" style="max-width:520px"><div class="m-body">${inner}</div></div></div>`;
}
function qmEtapaSync(){ const et=store.etapasOf(qm.pid).find(e=>e.id===val('qm-etapa')); if(et){const d=document.getElementById('qm-date'); if(d)d.value=et.start;} }
function saveEtapa(){const n=val('qm-name'),s=val('qm-start'),e=val('qm-end');if(!n||!s||!e){alert('Nombre y fechas.');return;}store.addEtapa(qm.pid,n,s,e);qm=null;render();}
function openEtapaEdit(eid,pid){qm={kind:'etapaEdit',eid,pid};render();}
function saveEtapaEdit(){const n=val('qm-name'),s=val('qm-start'),e=val('qm-end');if(!n||!s||!e){alert('Nombre y fechas.');return;}store.updateEtapa(qm.eid,{name:n,start:s,end:e});qm=null;render();}
function moveEtapa(pid,eid,dir){store.moveEtapa(pid,eid,dir);render();}
function delEtapa(eid,pid){const e=store.etapasOf(pid).find(x=>x.id===eid);const n=store.subtasksInEtapa(pid,e);const msg=n>0?('Esta etapa tiene '+n+' subtarea(s) dentro de su rango de fechas. Si la borras, esas subtareas quedarán “fuera de etapa”. ¿Eliminar de todos modos?'):'¿Eliminar esta etapa?';if(confirm(msg)){store.removeEtapa(eid);render();}}
function saveFrente(){const n=val('qm-name');if(!n){alert('Escribe un nombre.');return;}store.addFrente(qm.pid,n,val('qm-color'));qm=null;render();}
function openFrenteEdit(fid,pid){qm={kind:'frenteEdit',fid,pid};render();}
function saveFrenteEdit(){const n=val('qm-name');if(!n){alert('Escribe un nombre.');return;}store.updateFrente(qm.fid,{name:n,color:val('qm-color')});qm=null;render();}
function moveFrente(pid,fid,dir){store.moveFrente(pid,fid,dir);render();}
function delFrente(fid,pid){const n=store.tasksOf(pid).filter(t=>t.frenteId===fid).length;if(n>0){alert('Este frente tiene '+n+' tarea(s). Muévelas o elimínalas antes de borrar el frente.');return;}if(confirm('¿Eliminar este frente?')){store.removeFrente(fid);render();}}

/* ===== Catálogos ===== */
function openClientForm(){qm={kind:'cliente'};render();}
function saveClient(){const n=val('qm-name');if(!n){alert('El cliente necesita un nombre.');return;}const c=store.addClient({name:n,razon:val('qm-razon'),rfc:val('qm-rfc'),location:val('qm-loc'),web:val('qm-web'),ig:val('qm-ig'),fb:val('qm-fb'),youtube:val('qm-yt'),tiktok:val('qm-tt'),linkedin:val('qm-in'),otro:val('qm-otro'),generalResponsibleId:val('qm-resp2')||null,logo:val('qm-logo')||'',tipo:val('qm-tipo')==='interno'?'interno':'externo'});qm=null;openClient(c.id);}
function toggleClientActive(cid){ if(!isGerencia()) return; const c=store.client(cid); if(!c) return; const off=c.activo!==false;
  if(off&&!confirm('¿Desactivar a «'+c.name+'»?\n\nSe conservan sus proyectos y tareas, pero el cliente se oculta de la lista y sus usuarios del portal ya no podrán entrar. Puedes reactivarlo cuando quieras.')) return;
  qm=null; c.activo=off?false:true; store.save(); if(typeof dbSaveClient==='function') dbSaveClient(c); if(off){ shareToast('⏸ Cliente desactivado'); go('clientes'); } else { shareToast('↩ Cliente reactivado'); render(); } }
function deleteClient(cid){ if(!isGerencia()) return; const c=store.client(cid); if(!c) return; const n=store.projectsOf(cid).length;
  if(n){ alert('«'+c.name+'» tiene '+n+' proyecto(s).\n\nPara no perder información, primero elimina sus proyectos o, mejor, usa «Desactivar», que lo oculta y bloquea a sus usuarios sin borrar nada.'); return; }
  if(!confirm('¿Eliminar definitivamente a «'+c.name+'»? Se borran también sus contactos y accesos. No se puede deshacer.')) return;
  qm=null; store.removeClient(cid); shareToast('🗑 Cliente eliminado'); go('clientes'); }
function openClientEdit(cid){qm={kind:'clienteEdit',cid};render();}
function saveClientEdit(){const n=val('qm-name');if(!n){alert('El cliente necesita un nombre.');return;}store.updateClient(qm.cid,{name:n,razon:val('qm-razon'),rfc:val('qm-rfc'),location:val('qm-loc'),web:val('qm-web'),ig:val('qm-ig'),fb:val('qm-fb'),youtube:val('qm-yt'),tiktok:val('qm-tt'),linkedin:val('qm-in'),otro:val('qm-otro'),generalResponsibleId:val('qm-resp2')||null,logo:val('qm-logo')||'',tipo:val('qm-tipo')==='interno'?'interno':'externo'});qm=null;render();}
function openContactForm(cid){qm={kind:'contacto',cid};render();}
function readPortalFields(exceptPid,name){ const user=(val('qm-pu')||'').trim(), code=(val('qm-pc')||'').trim(); if(!user&&!code) return {ok:true,portal:null}; if(!cpValidateUser(name,user,code,exceptPid)) return {ok:false}; return {ok:true,portal:{user,code,rol:val('qm-pr')==='admin'?'admin':'colab',activo:!!(document.getElementById('qm-pa')||{}).checked}}; }
function saveContact(){const n=val('qm-name');if(!n){alert('El contacto necesita un nombre.');return;}const pf=readPortalFields(null,n);if(!pf.ok)return;store.addClientPerson(qm.cid,{name:n,phone:val('qm-phone'),email:val('qm-email'),role:val('qm-crole'),birthday:val('qm-bday'),photo:val('qm-cphoto')||'',portal:pf.portal});qm=null;render();}
function openContactEdit(cid,pid){qm={kind:'contactoEdit',cid,pid};render();}
function saveContactEdit(){const n=val('qm-name');if(!n){alert('El contacto necesita un nombre.');return;}const pf=readPortalFields(qm.pid,n);if(!pf.ok)return;store.updateClientPerson(qm.cid,qm.pid,{name:n,phone:val('qm-phone'),email:val('qm-email'),role:val('qm-crole'),birthday:val('qm-bday'),photo:val('qm-cphoto')||'',portal:pf.portal});qm=null;render();}
function delContact(cid,pid){if(confirm('¿Quitar este contacto?')){store.removeClientPerson(cid,pid);render();}}
function togglePay(payId,pid){store.togglePayment(payId);render();}
function openPayForm(pid){qm={kind:'pago',pid};render();}
function savePay(){const d=val('qm-pdate'),a=val('qm-pamount');if(!d||!a){alert('Fecha y monto.');return;}store.addPayment(qm.pid,d,a);qm=null;render();}
function openPayEdit(pid,payId){qm={kind:'pagoEdit',pid,payId};render();}
function savePayEdit(){const d=val('qm-pdate'),a=val('qm-pamount');if(!d||!a){alert('Fecha y monto.');return;}store.updatePayment(qm.payId,{dueDate:d,amount:a});qm=null;render();}
function delPay(payId,pid){if(confirm('¿Eliminar este pago?')){store.removePayment(payId);render();}}
function openGenPagos(pid){qm={kind:'genPagos',pid};render();}function runGenPagos(){const freq=val('qm-freq'),count=+val('qm-count'),total=+val('qm-total'),start=val('qm-pstart');if(!count||!total||!start){alert('Completa frecuencia, número, total y fecha.');return;}if(!confirm('Esto reemplaza el calendario de pagos actual. ¿Continuar?'))return;store.generatePaymentsCustom(qm.pid,freq,count,total,start);qm=null;render();}
function openProjectEdit(pid){ if(!canManageProject()) return; qm={kind:'proyectoEdit',pid};render();}
function openProjectDel(pid){ if(!canManageProject()) return; qm={kind:'proyectoDel',pid}; render(); }
async function confirmProjectDel(){ if(!canManageProject()||!qm||qm.kind!=='proyectoDel') return; const p=store.project(qm.pid); if(!p) return;
  if((val('qm-delname')||'').trim()!==p.name.trim()){ alert('El nombre no coincide.'); return; }
  const btn=document.getElementById('qm-delbtn'); if(btn){ btn.disabled=true; btn.textContent='Eliminando…'; }
  const cid=p.clientId; const ok=await store.removeProject(qm.pid);
  if(ok){ qm=null; selProject=null; selClient=cid; view='cliente'; render(); } else { render(); } }
function openLinkForm(pid){qm={kind:'link',pid};render();}
function lkRead(){ if(!qm||!qm.urls) return; qm.urls=qm.urls.map((u,i)=>({title:val('qm-lkt-'+i)||'',url:(val('qm-lku-'+i)||'').trim()})); }
function lkAdd(){ lkRead(); qm.label=val('qm-lklabel'); qm.urls.push({title:'',url:''}); const lb=qm.label; render(); const el=document.getElementById('qm-lklabel'); if(el&&lb!=null) el.value=lb; const last=document.getElementById('qm-lku-'+(qm.urls.length-1)); if(last) last.focus(); }
function lkRemove(i){ lkRead(); const lb=val('qm-lklabel'); qm.urls.splice(i,1); if(!qm.urls.length) qm.urls=[{title:'',url:''}]; render(); const el=document.getElementById('qm-lklabel'); if(el) el.value=lb; }
function saveLibLink(){ lkRead(); const urls=qm.urls.filter(u=>u.url); if(!urls.length){alert('Pon al menos una URL.');return;}
  const label=val('qm-lklabel')||urls[0].title||urls[0].url;
  if(qm.kind==='linkEdit'){ store.updateLink(qm.pid,qm.lid,{label,urls}); selLib=qm.lid; } else { store.addLink(qm.pid,label,urls); const ls=store.linksOf(qm.pid); const m=ls.find(l=>(l.label||'').trim().toLowerCase()===label.trim().toLowerCase()); if(m) selLib=m.id; }
  qm=null; render(); }
function openLinkForm(pid){qm={kind:'link',pid};render();}
function openLinkEdit(pid,lid){qm={kind:'linkEdit',pid,lid};render();}
function delLink(pid,lid){if(confirm('¿Eliminar este link?')){store.removeLink(pid,lid);render();}}
function openScoreForm(pid){qm={kind:'score',pid};render();}
function openScoreEdit(pid,sid){qm={kind:'scoreEdit',pid,sid};render();}
function saveScore(){const u=val('qm-scurl');if(!u){alert('Pon el link del scorecard.');return;}store.addScorecard(qm.pid,val('qm-sctitle'),u,val('qm-scdate'));qm=null;render();}
function saveScoreEdit(){const u=val('qm-scurl');if(!u){alert('Pon el link del scorecard.');return;}store.updateScorecard(qm.pid,qm.sid,{title:val('qm-sctitle'),url:u,date:val('qm-scdate')});qm=null;render();}
function delScore(pid,sid){if(confirm('¿Eliminar este scorecard?')){store.removeScorecard(pid,sid);render();}}
function saveProjectEdit(){const nm=(val('qm-pname')||'').trim(); if(!nm){alert('El proyecto necesita un nombre.');return;} store.updateProject(qm.pid,{name:nm,price:+val('qm-price')||0,monthlyPay:+val('qm-monthly')||0,months:+val('qm-months')||0,paymentDay:+val('qm-payday')||1,startDate:val('qm-start'),endDate:val('qm-end')});qm=null;render();}
function toggleSvc(id){ svcOpen[id]=!svcOpen[id]; render(); }
function toggleTeam(key){ teamOpen[key]=(teamOpen[key]!==true); render(); }
function openSvcForm(){qm={kind:'servicio'};render();}
function saveSvc(){const n=val('qm-name');if(!n){alert('Escribe un nombre.');return;}store.addService(n,val('qm-svprice'),val('qm-svcost'));qm=null;render();}
function openSvcEdit(sid){qm={kind:'servicioEdit',sid};render();}
function saveSvcEdit(){const n=val('qm-name');if(!n){alert('Escribe un nombre.');return;}store.updateService(qm.sid,{name:n,listPrice:+val('qm-svprice')||0,opCost:+val('qm-svcost')||0});qm=null;render();}
function delSvc(sid){if(store.serviceUsed(sid)){alert('Este servicio está en uso por un proyecto y no se puede eliminar.');return;}if(confirm('¿Eliminar este servicio?')){store.removeService(sid);render();}}
function openSvcFrente(sid){qm={kind:'svFrente',sid};render();}
function saveSvcFrente(){const n=val('qm-name');if(!n){alert('Escribe un nombre.');return;}store.addServiceFrente(qm.sid,n,val('qm-color'));qm=null;render();}
function openSvcFrenteEdit(sid,old){qm={kind:'svFrenteEdit',sid,old};render();}
function saveSvcFrenteEdit(){const n=val('qm-name');if(!n){alert('Escribe un nombre.');return;}store.updateServiceFrente(qm.sid,qm.old,n,val('qm-color'));qm=null;render();}
function svDelFrente(sid,name){if(confirm('¿Quitar el frente "'+name+'" del servicio?')){store.removeServiceFrente(sid,name);render();}}
function openSvcTaskForm(sid){qm={kind:'svcTask',sid};render();}
function saveSvcTask(){const n=val('qm-tname');if(!n){alert('Escribe el nombre de la tarea.');return;}store.addServiceTask(qm.sid,val('qm-tfrente'),n,val('qm-tdesc'));qm=null;render();}
function openSvcTaskEdit(sid,idx){qm={kind:'svcTaskEdit',sid,idx};render();}
function saveSvcTaskEdit(){const n=val('qm-tname');if(!n){alert('Escribe el nombre de la tarea.');return;}store.updateServiceTask(qm.sid,qm.idx,val('qm-tfrente'),n,val('qm-tdesc'));qm=null;render();}
function svDelTask(sid,idx){if(confirm('¿Quitar esta tarea base?')){store.removeServiceTask(sid,idx);render();}}
function openSvcSubLink(sid){qm={kind:'svSubLink',sid};render();}
function saveSvcSubLink(){const n=val('qm-name');if(!n){alert('Escribe la etiqueta del link.');return;}store.addServiceSubLink(qm.sid,n);qm=null;render();}
function svDelSubLink(sid,label){if(confirm('¿Quitar el link "'+label+'" de este servicio?')){store.removeServiceSubLink(sid,label);render();}}

function openStaffForm(){qm={kind:'persona'};render();}
function persTab(id){
  document.querySelectorAll('.pers-sec').forEach(s=>s.style.display=(s.dataset.sec===id?'block':'none'));
  document.querySelectorAll('.pers-tab').forEach(b=>b.classList.toggle('active',b.dataset.sec===id));
}
function photoPickInto(input,hidId,prevId,hintId,folder){
  const f=input.files&&input.files[0]; if(!f) return;
  compressImage(f,(dataUrl)=>{
    const pv=document.getElementById(prevId), hid=document.getElementById(hidId), hint=document.getElementById(hintId);
    if(pv){ pv.style.backgroundImage=`url('${dataUrl}')`; pv.textContent=''; }
    if(hint) hint.textContent='Subiendo…';
    if(typeof dbUploadImage==='function'){
      dbUploadImage(dataUrlToBlob(dataUrl),folder||'misc').then(u=>{ if(hid) hid.value=u; if(hint) hint.textContent='Listo ✓'; })
        .catch(e=>{ console.error('Error subiendo imagen:',e); if(hid) hid.value=dataUrl; if(hint) hint.textContent='No se pudo subir al Storage; se guardará localmente.'; });
    } else if(hid) hid.value=dataUrl;
  });
}
function persPhotoPick(input){
  const f=input.files&&input.files[0]; if(!f) return;
  compressImage(f,(dataUrl)=>{
    const pv=document.getElementById('pers-photo-prev'); const hid=document.getElementById('qm-photo'); const hint=document.getElementById('qm-photo-hint');
    if(pv){ pv.style.backgroundImage=`url('${dataUrl}')`; pv.textContent=''; }   // preview inmediato
    if(typeof dbUploadImage==='function'){
      if(hint) hint.textContent='Subiendo foto…';
      dbUploadImage(dataUrlToBlob(dataUrl),'personal').then(pubUrl=>{
        if(hid) hid.value=pubUrl;                                               // se guarda la URL, no el base64
        if(hint) hint.textContent='Foto lista ✓';
      }).catch(e=>{
        if(hid) hid.value=dataUrl;                                             // fallback: base64 local
        if(hint) hint.textContent='No se pudo subir al Storage; se guardará localmente.';
        console.error('Error subiendo foto:', e);
      });
    } else { if(hid) hid.value=dataUrl; }
  });
}
function readPerson(){
  const pass=(val('qm-pass')||'').trim();
  if(pass && !/^\d{6}$/.test(pass)){ alert('La contraseña debe ser exactamente 6 dígitos numéricos.'); return null; }
  const fname=(val('qm-fname')||'').trim();
  return {
    name:fname, firstName:fname, secondName:(val('qm-sname')||'').trim(), lastName:(val('qm-lname')||'').trim(),
    role:val('qm-role'), team:val('qm-team'), tipo:val('qm-tipo'),
    color:val('qm-color')||'#3f7d6e', joinDate:val('qm-join'), active:val('qm-active')!=='0',
    password:pass, photo:val('qm-photo')||'', perm:val('qm-perm')||'colab',
    gmail:val('qm-gmail'), emailWork:val('qm-emailw'), phonePersonal:val('qm-phonep'), phoneWork:val('qm-phonew'),
    birthday:val('qm-bday'), city:val('qm-city'),
    rate:+val('qm-rate')||0, salaryMonthly:+val('qm-salary')||0, skills:val('qm-skills'),
    rfc:(val('qm-rfc')||'').toUpperCase(), curp:(val('qm-curp')||'').toUpperCase(), nss:val('qm-nss'),
    health:{blood:val('qm-blood'),allergies:val('qm-allergies'),conditions:val('qm-conditions'),diet:val('qm-diet'),emName:val('qm-emname'),emRel:val('qm-emrel'),emPhone:val('qm-emphone')},
    computer:{model:val('qm-cmodel'),serial:val('qm-cserial'),assignedDate:val('qm-cassigned'),accessories:val('qm-caccess'),status:val('qm-cstatus'),licenses:val('qm-clicenses')}
  };
}
function saveStaff(){const o=readPerson();if(!o)return;if(!o.name){alert('Escribe al menos el nombre.');return;}store.addStaff(o);qm=null;render();}
function saveStaffEdit(){const o=readPerson();if(!o)return;if(!o.name){alert('Escribe al menos el nombre.');return;}store.updateStaff(qm.uid,o);qm=null;render();}
function openStaffEdit(uid){qm={kind:'personaEdit',uid};render();}
function toggleStaff(uid){store.toggleStaffActive(uid);render();}

function openTagForm(){qm={kind:'tag'};render();}
function saveTag(){const n=val('qm-name');if(!n){alert('Escribe un nombre.');return;}store.addTag(n,val('qm-color'));qm=null;render();}
function openTagEdit(old){qm={kind:'tagEdit',old};render();}
function saveTagEdit(){const n=val('qm-name');if(!n){alert('Escribe un nombre.');return;}store.renameTag(qm.old,n,val('qm-color'));qm=null;render();}
function delTag(name){if(confirm('¿Eliminar la etiqueta "'+name+'"?')){store.removeTag(name);render();}}
function saveNewTask(){
  const n=val('qm-name');if(!n){alert('La tarea necesita un nombre.');return;}
  const p=store.project(qm.pid);
  const tags=readTags('qm-tags-box');
  store.addTask({projectId:qm.pid,frenteId:val('qm-frente'),name:n,subtitle:store.client(p.clientId).name,description:val('qm-desc')||'',tags,workLink:'',deliverables:[],responsibleId:val('qm-resp'),status:'to-do',dueDate:val('qm-date')||p.startDate,viaticos:0,subtasks:[]});
  qm=null;render();
}
function openKbTask(pid){ const first=pid?store.project(pid):(kbProject?store.project(kbProject):((kbClient?store.d.projects.find(p=>p.clientId===kbClient):null)||store.d.projects[0])); qm={kind:'kbTask',pid:first&&first.id}; render(); }
function kbTaskProject(pid){ qm.name=val('qm-name'); qm.desc=val('qm-desc'); qm.pid=pid; render(); }
function qmEtapaSync2(){ const et=store.etapasOf(qm.pid).find(e=>e.id===val('qm-etapa')); if(et){const d=document.getElementById('qm-date'); if(d)d.value=et.start;} }
function saveKbTask(){
  const n=val('qm-name');if(!n){alert('La tarea necesita un nombre.');return;}
  const pid=val('kb-proj')||qm.pid; const p=store.project(pid);
  const fr=val('qm-frente'); if(!fr){alert('Elige un frente.');return;}
  const tags=readTags('qm-tags-box');
  store.addTask({projectId:pid,frenteId:fr,name:n,subtitle:store.client(p.clientId).name,description:val('qm-desc')||'',tags,workLink:'',deliverables:[],responsibleId:val('qm-resp'),status:'to-do',dueDate:val('qm-date')||p.startDate,viaticos:0,subtasks:[]});
  qm=null;render();
}

/* ================== TASK MODAL ================== */
function taskModal(){
  const t=store.task(modalTask); if(!t) return '';
  return `<div class="modal active" onclick="if(event.target===this)closeTask()"><div class="modal-card">${taskBody(t,false)}</div></div>`;
}
function taskPanel(){
  const t=opSelTask&&store.task(opSelTask);
  if(!t) return `<div class="task-empty"><div>📋<div style="margin-top:8px">Elige una tarea y manos a la obra</div></div></div>`;
  return `<div class="task-panel">${taskBody(t,true)}</div>`;
}
function taskBody(t,panel){
  const p=store.project(t.projectId), c=store.client(p.clientId), fr=store.frentesOf(p.id).find(f=>f.id===t.frenteId)||{name:'',color:'#223c36'};
  const resp=store.person(t.responsibleId);
  const siblings=store.tasksOf(p.id); const idx=siblings.findIndex(x=>x.id===t.id);
  const tags=(t.tags||[]).map(x=>`<span class="tag" style="background:${store.tagColor(x)}">${x}</span>`).join('');
  const clientPeople=c.people;
  // Retraso: fecha límite vs última subtarea registrada
  const subDates=(t.subtasks||[]).map(s=>s.date).filter(Boolean).sort();
  let etNote='';
  if(subDates.length){
    const last=subDates[subDates.length-1];
    const anyOut=(t.subtasks||[]).some(s=>s.date && !store.etapaOfDate(p.id,s.date));
    const delay=taskDelay(t);
    if(delay>0) etNote+=`<div class="etapa-badge out" style="display:inline-block;margin-top:8px">🔴 Retraso: ${delay} días · última subtarea ${dLabel(last)} vs límite ${dLabel(t.dueDate)}</div>`;
    else { const e=store.etapaOfDate(p.id,last); etNote+=`<div class="etapa-badge" style="display:inline-block;margin-top:8px">🟢 En tiempo${e?` · vive en ${e.name}`:''}</div>`; }
    if(anyOut) etNote+=` <div class="etapa-badge out" style="display:inline-block;margin-top:8px">⚠️ Subtareas fuera de las etapas definidas</div>`;
  }
  const clientPeople2=c.people;
  const _ord=subOrder(t); const nCita=_ord.filter(x=>subHasCita(x.s)).length; const _ordF=subOnlyCita?_ord.filter(x=>x.depth===0?(subHasCita(x.s)||x.kids.some(subHasCita)):subHasCita(x.s)):_ord;
  const subs=_ordF.map(({s,depth,kids})=>{
    const _t=s.isSeries?seriesTpl(s):s; const per=store.person(_t.personId); const timing=timingSub===t.id+':'+s.id; const miss=subMissing(s); const cliN=(_t.invitados||[]).length;
    const canChk=canCheckSub(s); const locked=isColab()&&subTimeLocked(s); const chkClickable=canChk&&!locked&&!s.isSeries;
    const lockTag=(s.done&&isColab())?(subTimeLocked(s)?` <span class="sub-lock">🔒</span>`:(s.doneAt?` <span class="sub-editable" title="Editable hasta ${subEditUntil(s)}">✏️ ${subEditUntil(s)}</span>`:'')):'';
    const lateD=(!s.done&&s.date&&s.date<todayISO())?Math.round((new Date(todayISO()+'T00:00:00')-new Date(s.date+'T00:00:00'))/86400000):0;
    const donePct=kids.length?`<span class="sub-prog" title="Sub-subtareas hechas">${kids.filter(k=>k.done).length}/${kids.length}</span>`:'';
    const chev=kids.length?`<button class="sub-chev" title="Mostrar / ocultar sub-subtareas" onclick="toggleSubCollapse('${s.id}')">${subCollapsedNow(s)?'▸':'▾'}</button>`:'';
    const detail=s.isSeries?('Serie ↻ '+seriesLabel(s.series)+' · '+(_t.personId?per.name:'Sin responsable')+' · '+(_t.time||'sin hora')+' · '+(_t.durMin?fmtDurShort(_t.durMin):'sin duración')):[s.personId?per.name:'Sin responsable', s.date?dLabel(s.date):'sin fecha', s.time||'sin hora', s.durMin?fmtDurShort(s.durMin):'sin duración'].join(' · ');
    const nextOcc=s.isSeries?(subKids(t,s.id).filter(k=>!k.done&&k.date).map(k=>k.date).sort()[0]||''):'';
    const serChip=s.isSeries?`<span class="sub-chip ser" title="Serie por calendario">↻ ${seriesLabel(s.series)}</span>${nextOcc?`<span class="sub-chip" title="Próxima repetición pendiente">Próxima: ${dLabel(nextOcc)}</span>`:''}`:'';
    const _src=s.isSeries?seriesTpl(s):s; const ackBtn=!s.seriesId&&(_src.team||[]).includes(currentUser)&&(_src.teamInfo||{})[currentUser]&&(_src.teamInfo[currentUser].by!==currentUser)&&!(_src.teamAck||{})[currentUser]&&!s.done?`<button class="ack-btn" title="${esc(store.person(_src.teamInfo[currentUser].by).name)} te agregó como participante" onclick="event.stopPropagation();ackTeam('${t.id}','${s.id}')">🤝 Te agregaron · ✓ Ya la vi y la atendí</button>`:'';
    const _l=sesLast(s); const cliChip=_l?`<span class="sub-chip" style="background:${SES_ST[_l.estado].bg};color:${SES_ST[_l.estado].c};font-weight:700" title="${esc(_l.razon||'')}">${_l.estado==='confirmado'?'✅ Cliente confirmó':_l.estado==='cancelado'?'❌ Cliente canceló':'🔁 Cliente pide reprogramar'}</span>`:'';
    const _ck=citaKind(s); const citaBase=(subHasCita(s)&&_ck!=='interna'&&(((s.isSeries?seriesTpl(s):s).invitados)||[]).length)?`<span class="sub-chip cita chip-link" title="Cita con el cliente · clic para copiar el link" onclick="event.stopPropagation();copySessionLink('${t.id}','${s.id}')">📅 Cita</span>`:((_ck==='interna')?`<span class="sub-chip cita-int chip-link" title="Cita interna (${subPeopleN(s)} personas) · clic para copiar el link" onclick="event.stopPropagation();copySessionLink('${t.id}','${s.id}')">👥 Cita interna</span>`:'');
    const predS=s.dependsOn?(t.subtasks||[]).find(x=>x.id===s.dependsOn):null; const depChip=`${predS?`<span class="sub-chip" title="Empieza cuando termina «${esc(predS.name)}»">⛓ tras «${esc(predS.name.length>22?predS.name.slice(0,21)+'…':predS.name)}»</span>`:''}${s.fija?'<span class="sub-chip" title="Fecha fija: no se mueve con las dependencias">📌 fija</span>':''}`;
    const chips=`${ackBtn}${depChip}${citaBase}${cliChip}${serChip}${s.repeatAfter?`<span class="sub-chip" title="${repLabel(s.repeatAfter)}">↻ ${s.repeatAfter} d</span>`:''}${s.date?`<span class="sub-chip${lateD?' late':''}">📅 ${dLabel(s.date)}</span>`:''}${lateD?`<span class="late-tag" title="Venció el ${dLabel(s.date)} y sigue pendiente">⚠ ${lateD===1?'1 día':lateD+' días'}</span>`:''}${s.dateConflict?'<span class="date-bad" title="La fecha original no cabía en la nueva etapa; se puso hoy. Edítala.">🔴</span>':''}${s.done&&s.timeSpent?`<span class="sub-chip">⏱ ${fmtTime(s.timeSpent)}</span>`:''}${lockTag}`;
    const whoName=_t.personId?`<span class="sub-who" title="${esc(per.name||'')}">${esc((per.name||'').split(' ')[0])}</span>`:`<span class="sub-who none">Sin asignar</span>`;
    const av=`<span class="urg-av" title="${s.urgent?'Urgente: clic para quitar':(_t.personId?per.name+' · clic para marcar como urgente':'Sin responsable · clic para marcar como urgente')}" onclick="event.stopPropagation();toggleSubUrgent('${t.id}','${s.id}')">${s.urgent?'<span class="urg">⚠️</span>':avatar(_t.personId?per:{name:'?',color:'#cfd6d1'},true)}${(_t.team||[]).length?`<i class="av-n" title="${(_t.team||[]).length} persona(s) más del equipo participan">+${(_t.team||[]).length}</i>`:''}</span>`;
    const right=timing
      ? `<div class="sub-time"><input type="number" min="1" id="stime-${s.id}" placeholder="min"><button class="mini ok" onclick="confirmSubTime('${t.id}','${s.id}')">✓</button><button class="mini no" onclick="cancelSubTime()">×</button></div>`
      : `<div class="sub-btns">${whoName}${av}
          <button class="sub-ib${cliN?' on':''}" title="${cliN?'Participa el cliente ('+cliN+')':'Participación del cliente: nadie asignado'}" onclick="openClientPop('${t.id}','${s.id}')">🤝${cliN?`<i>${cliN}</i>`:''}</button>
          ${(depth===0&&!s.isSeries)?`<button class="sub-ib" title="Agregar sub-subtarea dentro de esta" onclick="openAddChild('${t.id}','${s.id}')">↳＋</button>`:`<span class="sub-ib-sp"></span>`}
          <button class="sub-ib${miss.length?' bad':''}" title="${miss.length?'Falta: '+miss.join(', ')+' — clic para completar':'Editar'}" onclick="openSubEdit('${t.id}','${s.id}')">✏️</button>
          <button class="sub-ib" title="Eliminar" onclick="delSub('${t.id}','${s.id}')">🗑️</button></div>`;
    const childForm=(addingChild&&addingChild.sid===s.id&&addingChild.tid===t.id)?`<div class="sub-addkid"><input id="nc-name" placeholder="Nueva sub-subtarea en «${esc(s.name)}»…" onkeydown="if(event.key==='Enter'){event.preventDefault();addChildSub()}else if(event.key==='Escape'){event.stopPropagation();cancelAddChild()}"><button class="btn sm" onclick="addChildSub()">+ Agregar</button><button class="btn ghost sm" onclick="cancelAddChild()">Cancelar</button></div>`:'';
    return `<div class="sub-group-item"><div class="sub-item sub2${lateD?' is-late':''}${depth?' sub-child':''}${hiSub&&hiSub.sid===s.id?' sub-hi':''}" data-sid="${s.id}" ondragover="sbOver(event,'${t.id}')" ondragleave="sbLeave(event)" ondrop="sbDrop(event,'${t.id}','${s.id}')">
      <span class="sub-grip" title="Arrastra para reordenar" draggable="true" ondragstart="sbStart(event,'${t.id}','${s.id}')" ondragend="sbEnd()">☰</span>${chev}
      <span class="check ${s.done?'done':''} ${chkClickable?'':'locked'}" ${chkClickable?`onclick="toggleSub('${t.id}','${s.id}')"`:`title="${s.isSeries?'Serie: se palomea cada repetición':(locked?'Tiempo fijo: pasaron los 10 minutos':'Solo palomeas tus subtareas')}"`}>${s.done?'✓':''}</span>
      <div class="sub-body" title="${esc(detail)}"><div class="sub-nm2 ${s.done?'done':''}">${s.name} ${donePct}</div>${chips?`<div class="sub-chips">${chips}</div>`:''}</div>
      ${right}</div>${childForm}</div>`;
  }).join('');
  const persOpts=['<option value="" selected>— Sin responsable —</option>',staffOptEls('',' (Nuwek)'),...clientPeople.map(pp=>`<option value="${pp.id}">${pp.name} (Cliente)</option>`)].join('');
  const invOpts=`<option value="">+ invitar…</option>`+clientPeople.map(pp=>`<option value="${pp.id}">${pp.name}</option>`).join('');
  const comments=store.commentsOf(t.id).slice().reverse().map(cm=>{const a=store.person(cm.userId);const time=new Date(cm.ts).toLocaleString('es-MX',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'});
    const atts=(cm.attachments||[]).map((f,i)=> f.type&&f.type.startsWith('image/')
      ? `<img class="cmt-thumb" src="${f.dataUrl}" alt="${esc(f.name)}" title="Ver imagen" onclick="openLightbox('${cm.id}',${i})">`
      : `<a href="${f.dataUrl}" download="${esc(f.name)}" class="att-chip">📄 ${f.name}</a>`).join('');
    const ments=(cm.mentions||[]).map(id=>`<span class="ment-chip">@${store.person(id).name}</span>`).join('');
    const meMent=(cm.mentions||[]).includes(currentUser), meRead=(cm.readBy||[]).includes(currentUser);
    const readers=(cm.mentions||[]).filter(id=>(cm.readBy||[]).includes(id)).map(id=>store.person(id).name);
    const receipt=readers.length?`<span class="cmt-read">✓ Leído por ${readers.join(', ')}</span>`:'';
    const readBtn=(meMent&&!meRead)?`<button class="cmt-read-btn" onclick="markRead('${cm.id}')">✓ Ya lo vi</button>`:'';
    const foot=(receipt||readBtn)?`<div class="cmt-foot">${receipt}${readBtn}</div>`:'';
    const canE=cmtCanEdit(cm); const isEd=editingCmt===cm.id&&canE;
    const ops=canE&&!isEd?`<span class="cmt-ops" title="Puedes editar o borrar hasta las ${cmtEditUntil(cm)}"><button onclick="editCmt('${cm.id}')">✏️</button><button onclick="delCmt('${cm.id}')">🗑️</button></span>`:'';
    const body=isEd?`<textarea class="cmt-in cmt-edit" id="cmt-edit-${cm.id}" onkeydown="cmtEditKey(event,'${cm.id}')">${mdEsc(cm.text||'')}</textarea><div class="cmt-edit-bar"><span class="muted">Enter guarda · Shift+Enter nueva línea · Esc cancela</span><span><button class="btn ghost sm" onclick="cancelCmtEdit()">Cancelar</button> <button class="btn sm" onclick="saveCmtEdit('${cm.id}')">Guardar</button></span></div>`:(cm.text?`<div class="t md">${mdRender(cm.text)}</div>`:'');
    return `<div class="cmt">${avatar(a)}<div class="b"><div class="h"><b>${a.name}</b> <span>${time}</span>${ops}</div>${body}${ments?`<div class="cmt-ments">${ments}</div>`:''}${atts?`<div class="cmt-atts">${atts}</div>`:''}${foot}</div></div>`;}).join('');

  return `${panel?'':''}
    <div class="m-head">
      <div class="m-top">${(panel||editingTask===t.id)?`<div class="muted" style="font-size:.8rem;font-weight:600">${editingTask===t.id?'Editar tarea':'Detalle de tarea'}</div>`:`<div class="m-nav"><button onclick="navTask(-1)" ${idx<=0?'disabled':''}>‹</button><button onclick="navTask(1)" ${idx>=siblings.length-1?'disabled':''}>›</button><span class="muted" style="font-size:.8rem">${idx+1} de ${siblings.length}</span></div>`}
        <div style="display:flex;gap:6px;align-items:center">
          ${(editingTask!==t.id)?`<button class="btn ghost sm" title="Copiar link para compartir esta tarea" onclick="copyTaskLink('${t.id}')">🔗</button><button class="btn ghost sm" onclick="editTask('${t.id}')">✏️ Editar</button>${canCopy()?`<button class="btn ghost sm" title="Copiar esta tarea (con subtareas) al mismo proyecto, a otro o a otro cliente" onclick="openCopy('${t.projectId}','${t.id}')">⧉ Copiar</button><button class="btn ghost sm" title="Mover esta tarea a otro proyecto o cliente" onclick="openMovT('${t.id}')">↦ Mover</button>`:''}<button class="btn ghost sm" onclick="deleteTask('${t.id}')">🗑️</button>`:''}
          ${(panel&&editingTask!==t.id)?'':`<button class="x" onclick="${editingTask===t.id?'cancelTaskEdit()':'closeTask()'}">×</button>`}
        </div></div>
      ${editingTask===t.id ? `
        <div class="field"><label>Nombre de la tarea</label><input id="et-name" value="${esc(t.name)}"></div>
        <div class="field"><label>Descripción general</label><textarea id="et-desc" style="width:100%;min-height:70px;padding:9px;border:2px solid var(--line);border-radius:7px" placeholder="Objetivo, contexto, lineamientos…">${esc(t.description||'')}</textarea></div>
        <div class="field row"><div><label>Frente</label><select id="et-frente">${store.frentesOf(p.id).map(f=>`<option value="${f.id}" ${f.id===t.frenteId?'selected':''}>${f.name}</option>`).join('')}</select></div>
          <div><label>Responsable</label><select id="et-resp">${staffOptEls(t.responsibleId)}</select></div></div>
        <div class="field"><label>Fecha límite</label><input id="et-date" type="date" value="${t.dueDate}" ${canSubDate()?'':'disabled title="Solo PM, Gerencia o Dirección pueden cambiar fechas."'}></div>
        <div class="field"><label>↻ Repetir la tarea después de cerrarla</label><div class="rep-row"><input id="et-rep" type="number" min="1" placeholder="Días" value="${t.repeatAfter||''}"><span class="muted">días después de marcarla Hecha</span>${[7,15,30,45,60].map(n=>`<button type="button" class="rep-chip" onclick="document.getElementById('et-rep').value=${n}">${n}</button>`).join('')}<button type="button" class="rep-chip" onclick="document.getElementById('et-rep').value=''">Quitar</button></div><div class="hint">Al pasarla a Hecha se crea una tarea nueva igual, con todas sus subtareas y fechas movidas a (hoy + N días).</div></div>
        ${(()=>{ const rc=t.repeatCal||{}; const live=!(t.nextId&&store.task(t.nextId)); return `<div class="field sm-series"><label>↻ Repetir la tarea por calendario (cada periodo nace una nueva)</label>
          <select id="et-cal" onchange="etCalChange()" ${(live&&canSubDate())?'':'disabled'}><option value="">No se repite por calendario</option><option value="weekly" ${rc.freq==='weekly'?'selected':''}>Cada semana</option><option value="monthly" ${rc.freq==='monthly'?'selected':''}>Cada mes</option><option value="days" ${rc.freq==='days'?'selected':''}>Cada cierto número de días</option></select>
          <div id="et-cal-box" style="display:${rc.freq?'block':'none'};margin-top:8px"><div class="rep-row"><span class="muted">Cada</span><input id="et-cal-n" type="number" min="1" value="${rc.interval||1}"><span class="muted" id="et-cal-unit">${rc.freq==='monthly'?'mes(es)':rc.freq==='weekly'?'semana(s)':'día(s)'}</span></div>
            <div class="rep-row" style="margin-top:8px"><span class="muted">Crear la nueva</span><input id="et-cal-lead" type="number" min="0" value="${rc.lead==null?7:rc.lead}"><span class="muted">días antes de su fecha límite</span></div>
            <label class="gf-opt" style="margin-top:8px"><input type="checkbox" id="et-cal-name" ${rc.addPeriod===false?'':'checked'}> Poner el periodo en el nombre (ej. «Parrilla | Noviembre»)</label>
            <div class="hint">Se toma esta tarea como molde: cada ciclo se copia con todas sus subtareas, sin hacer, con las fechas movidas. La fecha límite de esta tarea marca el ritmo.${live?'':' <b>Esta tarea ya generó su siguiente ciclo; para cambiar la regla, edita la más reciente.</b>'}</div></div></div>`; })()}
        <div class="field"><label>Etiquetas (del catálogo)</label>${tagPicker('et-tags-box', t.tags||[])}</div>
        <div class="wiz-actions"><button class="btn ghost" onclick="cancelTaskEdit()">Cancelar</button><button class="btn" onclick="saveTaskEdit('${t.id}')">Guardar</button></div>
      ` : `
        <div class="m-title"><button class="urg-btn${t.urgent?' on':''}" title="${t.urgent?'Urgente: clic para quitar':'Marcar tarea como urgente'}" onclick="toggleTaskUrgent('${t.id}')">⚠️</button><h3>${dk(t)}${t.name}</h3></div>
        <div class="m-crumb-row"><div class="m-crumb">${c.name} » ${p.name} » <span style="color:${fr.color};font-weight:600">${fr.name}</span></div>${tags?`<div class="m-tags">${tags}</div>`:''}</div>
        <div class="m-meta"><span>${avatar(resp,true)} <b>${resp.name}</b></span>${t.repeatCal?`<span class="rep-tag" title="Cada periodo se crea una tarea nueva con todas sus subtareas">↻ cada ${t.repeatCal.interval>1?t.repeatCal.interval+' ':''}${t.repeatCal.freq==='monthly'?(t.repeatCal.interval>1?'meses':'mes'):t.repeatCal.freq==='weekly'?(t.repeatCal.interval>1?'semanas':'semana'):'días'}</span>`:''}${t.repeatAfter?`<span class="rep-tag" title="Al marcarla Hecha se crea la siguiente">${repLabel(t.repeatAfter).replace('tras terminar','tras cerrarla')}</span>`:''}
          <select ${(isColab()&&!canEditTask(t))?'disabled title="Solo el responsable cambia el estado"':''} onchange="setTaskStatus('${t.id}',this.value)" style="padding:6px 10px;border-radius:7px;border:2px solid var(--line)">
            ${['to-do','in-progress','done','ajuste','on-hold'].map(s=>`<option value="${s}" ${t.status===s?'selected':''}>${statusLabel[s]}</option>`).join('')}
          </select></div>
        <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:10px">
          <div class="muted" style="font-size:.85rem">📅 Fecha límite: ${dLabel(t.dueDate)}</div>
          <button class="lib-btn" title="Biblioteca del proyecto (${store.linksOf(p.id).length})" onclick="openLibModal('${p.id}')">📚</button>
        </div>
        ${etNote}
      `}
    </div>
    <div class="m-body" ${editingTask===t.id?'style="display:none"':''}>
      <div class="m-sec"><h4>Descripción</h4><div class="md ${t.description?'':'muted'}">${t.description?mdRender(t.description):(isColab()?'Sin descripción.':'Sin descripción. Usa ✏️ Editar para agregarla.')}</div></div>
      <div class="m-sec"><div class="subs-head"><h4 style="margin:0;display:flex;align-items:center;gap:8px">Subtareas (${workSubs(t).filter(s=>s.done).length}/${workSubs(t).length}) <button type="button" class="info-i" title="Cómo escribir subtareas y sub-subtareas" onclick="openVerbInfo()">i</button>${(nCita||subOnlyCita)?`<button type="button" class="sm-sub ${subOnlyCita?'on':''}" style="padding:3px 10px;font-size:.72rem" onclick="toggleCitaFilter()" title="Mostrar solo las subtareas con cita">📅 Con cita (${nCita})</button>`:''}</h4>
        <div class="subs-tabs"><button class="${subView==='list'?'on':''}" onclick="setSubView('list')">Subtareas</button><button class="${subView==='links'?'on':''}" onclick="setSubView('links')">🔗 Links</button>${!isColab()?`<button class="${subView==='log'?'on':''}" onclick="setSubView('log')">📋 Log</button>`:''}</div></div>
        ${(subView==='log'&&!isColab())?taskLogPanel(t):(subView==='links')?taskLinksPanel(t):`${subs||'<div class="muted">Sin subtareas.</div>'}
        <div class="inline-add">
          <input class="grow" id="ns-name" placeholder="Nueva subtarea...">
          <span class="ns-field"><button type="button" class="ns-ico" title="Responsable" onclick="nsReveal('ns-person')">👤</button><select id="ns-person" class="ns-ctl hidden">${persOpts}</select></span>
          <button class="btn sm" onclick="addSub('${t.id}')">+ Agregar</button>
        </div>
        <div class="hint">Escribe el nombre (y, si quieres, el responsable) y da Agregar: se abre el formulario completo para fecha, hora, duración y demás.</div>`}
      </div>
      <div class="m-sec"><h4>Comentarios</h4>
        <div class="cmt-box">
          <textarea class="cmt-in" id="cmt-${t.id}" placeholder="Escribe un comentario… usa @ para mencionar · Enter envía, Shift+Enter nueva línea · **negrita** *cursiva*" oninput="mentionInput(this,'${t.id}')" onkeydown="cmtKey(event,'${t.id}')" onblur="mentionBlur('${t.id}')"></textarea>
          <button class="cmt-attach" title="Adjuntar imagen o archivo" onclick="document.getElementById('cmt-file-${t.id}').click()">📎</button>
          <input type="file" id="cmt-file-${t.id}" accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx" multiple style="display:none" onchange="draftAttach(event,'${t.id}')">
          <div id="mention-box-${t.id}" class="mention-box"></div>
        </div>
        <div id="cmt-preview-${t.id}" class="cmt-preview"></div>
        <div style="text-align:right;margin-top:6px"><button class="btn sm" onclick="addCmt('${t.id}')">Comentar</button></div>
        <div style="margin-top:12px">${comments||'<div class="muted">Aún no hay comentarios.</div>'}</div>
      </div>
      <div class="total-time">⏱ Tiempo invertido total: <b>${fmtTime(store.taskTime(t))}</b> <span class="muted">(suma de subtareas · informativo)</span></div>
    </div>`;
}
function editTask(id){editingTask=id||modalTask;render();}
function cancelTaskEdit(){editingTask=null;render();}
function markRead(cmId){ const cm=(store.d.comments||[]).find(c=>c.id===cmId); store.markCommentRead(cmId,currentUser); if(cm) logEvent(cm.taskId,'Marcó como leído un comentario'); render(); }
function _calPatch(id){ const t=store.task(id); const sel=document.getElementById('et-cal'); if(!sel||sel.disabled) return {};
  const f=sel.value||''; if(!f) return {repeatCal:null}; if(!(val('et-date')||t.dueDate)){ alert('Para repetir por calendario la tarea necesita fecha límite.'); return {}; }
  return {repeatCal:{freq:f,interval:Math.max(1,parseInt(val('et-cal-n'),10)||1),lead:Math.max(0,parseInt(val('et-cal-lead'),10)||0),addPeriod:!!(document.getElementById('et-cal-name')||{}).checked},repeatAfter:null}; }
function etCalChange(){ const f=val('et-cal'); const b=document.getElementById('et-cal-box'); if(b) b.style.display=f?'block':'none'; const u=document.getElementById('et-cal-unit'); if(u) u.textContent=f==='monthly'?'mes(es)':f==='weekly'?'semana(s)':'día(s)'; }
function saveTaskEdit(id){
  const name=(val('et-name')||'').trim(); if(!name){alert('La tarea necesita nombre.');return;}
  const tags=readTags('et-tags-box');
  store.updateTask(id,{name,description:val('et-desc'),frenteId:val('et-frente'),responsibleId:val('et-resp'),dueDate:val('et-date'),tags,repeatAfter:Math.max(0,parseInt(val('et-rep'),10)||0)||null,..._calPatch(id)});
  logEvent(id,'Editó la tarea');
  editingTask=null;render();
}
function deleteTask(id){ if(confirm('¿Eliminar esta tarea y sus subtareas/comentarios?')){ store.removeTask(id); modalTask=null; editingTask=null; render(); } }
function openTask(id){modalTask=id;timingSub=null;editingTask=null;editingSub=null;draftAtt=[];draftMentions=[];subView='list';render();}
function closeTask(){modalTask=null;timingSub=null;editingTask=null;editingSub=null;draftAtt=[];draftMentions=[];render();}
function navTask(dir){const p=store.project(store.task(modalTask).projectId);const sib=store.tasksOf(p.id);let i=sib.findIndex(x=>x.id===modalTask);i=Math.max(0,Math.min(sib.length-1,i+dir));modalTask=sib[i].id;timingSub=null;editingTask=null;editingSub=null;draftAtt=[];draftMentions=[];render();}
function setTaskStatus(id,s){const t=store.task(id);if(!canEditTask(t)){return;}store.updateTask(id,{status:s});logEvent(id,'Cambió el estado a '+(statusLabel[s]||s));render();}
function openLibModal(pid){libModal=pid;render();}
function closeLibModal(){libModal=null;render();}
function addLibLink(){const u=val('lib-url');if(!u){alert('Pon la URL del link.');return;}store.addLink(libModal,val('lib-label')||u,[{title:'',url:u}]);render();}
function libraryModal(){
  const pid=libModal; const p=store.project(pid); if(!p)return '';
  const rows=store.linksOf(pid).map(l=>libCard(pid,l,false)).join('');
  return `<div class="modal active" onclick="if(event.target===this)closeLibModal()"><div class="modal-card" style="max-width:560px">
    <div class="m-head"><div class="m-top"><div><div class="pill yellow">${p.name}</div><h3 style="margin:8px 0 0">📚 Biblioteca</h3></div>
      <button class="x" onclick="closeLibModal()">×</button></div></div>
    <div class="m-body">
      <div class="lib-add"><input id="lib-label" placeholder="Nombre (ej. Brand kit)"><input id="lib-url" placeholder="https://…"><button class="btn sm" onclick="addLibLink()">+ Agregar</button></div>
      <div class="hint" style="margin-top:6px">Si el nombre ya existe, la URL se agrega a ese cajón.</div>
      <div class="lib-list" style="margin-top:14px">${rows||'<div class="muted">Aún no hay links. Agrega el primero arriba.</div>'}</div>
    </div>
  </div></div>`;
}
/* ===== Reordenar subtareas arrastrando ☰ ===== */
let sbDrag=null;
function sbClear(){ document.querySelectorAll('.sub-item.drop-before,.sub-item.drop-after,.sub-item.sb-dragging').forEach(x=>x.classList.remove('drop-before','drop-after','sb-dragging')); }
function sbStart(ev,tid,sid){ sbDrag={tid,sid}; ev.dataTransfer.effectAllowed='move'; try{ev.dataTransfer.setData('text/plain',sid);}catch(_){}
  const row=ev.target.closest('.sub-item'); if(row){ try{ev.dataTransfer.setDragImage(row,20,20);}catch(_){} setTimeout(()=>row.classList.add('sb-dragging'),0); } }
function sbEnd(){ sbDrag=null; sbClear(); }
function sbOver(ev,tid){ if(!sbDrag||sbDrag.tid!==tid) return; ev.preventDefault(); const row=ev.currentTarget; if(row.dataset.sid===sbDrag.sid) return;
  const r=row.getBoundingClientRect(), after=ev.clientY>r.top+r.height/2;
  document.querySelectorAll('.sub-item.drop-before,.sub-item.drop-after').forEach(x=>x.classList.remove('drop-before','drop-after'));
  row.classList.add(after?'drop-after':'drop-before'); }
function sbLeave(ev){ if(!ev.currentTarget.contains(ev.relatedTarget)) ev.currentTarget.classList.remove('drop-before','drop-after'); }
function sbDrop(ev,tid,sid){ if(!sbDrag||sbDrag.tid!==tid) return; ev.preventDefault();
  const r=ev.currentTarget.getBoundingClientRect(), after=ev.clientY>r.top+r.height/2; const from=sbDrag.sid; sbEnd();
  if(from===sid) return; store.moveSubtask(tid,from,sid,after); render(); }
function toggleSub(tid,sid){const t=store.task(tid);const s=t.subtasks.find(x=>x.id===sid);if(!canCheckSub(s)){return;}
  if(!s.done){ const pend=subKids(t,sid).filter(k=>!k.done); if(pend.length){ alert('Primero marca como hechas sus sub-subtareas ('+pend.length+' pendiente'+(pend.length>1?'s':'')+').'); return; } }
  if(s.done&&subIsChild(t,s)){ const m=t.subtasks.find(x=>x.id===s.parentId); if(m&&m.done){ store.updateSubtask(tid,m.id,{done:false,timeSpent:0,doneAt:null}); logEvent(tid,'Reabrió «'+m.name+'» porque se reabrió una sub-subtarea'); } }
  if(s.done){if(isColab()&&subTimeLocked(s)){alert('Ya pasaron los 10 minutos: el tiempo de esta subtarea quedó fijo y no puede editarse.');return;}store.updateSubtask(tid,sid,{done:false,timeSpent:0,doneAt:null});logEvent(tid,'Reabrió la subtarea «'+s.name+'»');render();}else{timingSub=tid+':'+sid;render();setTimeout(()=>{const el=document.getElementById('stime-'+sid);if(el)el.focus();},0);}}
function confirmSubTime(tid,sid){const el=document.getElementById('stime-'+sid);const m=parseInt(el&&el.value,10);if(!m||m<=0){alert('Escribe los minutos.');return;}const s0=store.task(tid).subtasks.find(x=>x.id===sid);store.updateSubtask(tid,sid,{done:true,timeSpent:m,doneAt:new Date().toISOString()});logEvent(tid,'Completó la subtarea «'+s0.name+'» ('+fmtTime(m)+')');timingSub=null;render();}
function cancelSubTime(){timingSub=null;render();}
function delSub(tid,sid){const t0=store.task(tid);const s=t0.subtasks.find(x=>x.id===sid);const nk=subKids(t0,sid).length;
  if(s&&s.seriesId&&s.occDate){ const m=t0.subtasks.find(x=>x.id===s.seriesId); if(!confirm('¿Omitir esta repetición ('+dLabel(s.occDate)+')? La serie continúa con las demás.')) return; if(m&&m.series){ const sr=Object.assign({},m.series); sr.skip=(sr.skip||[]).concat([s.occDate]); m.series=sr; } store.removeSubtask(tid,sid); logEvent(tid,'Omitió la repetición del '+s.occDate+' de «'+s.name+'»'); render(); return; }
  if(s&&s.isSeries&&!confirm('¿Eliminar toda la serie «'+s.name+'» y sus '+nk+' repeticiones?')) return;
  if(!(s&&s.isSeries)&&confirm(nk?'¿Eliminar esta subtarea y sus '+nk+' sub-subtarea(s)?':'¿Eliminar subtarea?')||(s&&s.isSeries)){const nm=s?s.name:'';store.removeSubtask(tid,sid);logEvent(tid,'Eliminó la subtarea «'+nm+'»');render();}}
function setSubView(v){subView=v;editingLink=null;render();}
function logEvent(taskId, action){ if(!taskId||!action) return; store.d.log=store.d.log||[]; const e={id:'lg_'+Date.now().toString(36)+Math.random().toString(36).slice(2,6), ts:new Date().toISOString(), userId:currentUser, taskId, action}; store.d.log.push(e); store.save(); if(typeof dbSaveLog==='function') dbSaveLog(e); }
function taskLogPanel(t){
  const entries=(store.d.log||[]).filter(e=>e.taskId===t.id).slice().sort((a,b)=>a.ts<b.ts?1:-1);
  if(!entries.length) return '<div class="muted" style="padding:6px 0">Sin movimientos registrados aún.</div>';
  return `<div class="hint" style="margin-bottom:8px">📋 Historial de cambios · visible solo para PM/Gerencia</div><div class="log-list">${entries.map(e=>{const u=store.person(e.userId)||{name:'?'};const when=new Date(e.ts).toLocaleString('es-MX',{day:'2-digit',month:'short',year:'2-digit',hour:'2-digit',minute:'2-digit'});
    return `<div class="log-row">${avatar(u,true)}<div class="log-b"><div class="log-a"><b>${u.name}</b> ${e.action}</div><div class="log-t">${when}</div></div></div>`;}).join('')}</div>`;
}
function canEditLinks(t){ return true; }
function taskAddLink(tid){ const t=store.task(tid); if(!canEditLinks(t))return; const ti=document.getElementById('tl-title-'+tid), ui=document.getElementById('tl-url-'+tid); const url=(ui.value||'').trim(); if(!url){alert('Pon el link.');ui.focus();return;} store.taskAddLink(tid,(ti.value||'').trim(),url); logEvent(tid,'Agregó un link'+((ti.value||'').trim()?' «'+(ti.value||'').trim()+'»':'')); render(); }
function taskSetLink(tid,idx,field,val){ const t=store.task(tid); if(!canEditLinks(t))return; store.taskSetLink(tid,idx,field,val); render(); }
function taskDelLink(tid,idx){ const t=store.task(tid); if(!canEditLinks(t))return; if(!confirm('¿Eliminar este link?'))return; store.taskDelLink(tid,idx); logEvent(tid,'Eliminó un link'); render(); }
function editLink(tid,idx){ editingLink=tid+':'+idx; render(); }
function cancelEditLink(){ editingLink=null; render(); }
function saveLinkEdit(tid,idx){ const t=store.task(tid); if(!canEditLinks(t))return; const ti=document.getElementById('ll-t-'+tid+'-'+idx), ui=document.getElementById('ll-u-'+tid+'-'+idx); const url=(ui.value||'').trim(); if(!url){alert('Pon el link.');ui.focus();return;} store.taskSetLink(tid,idx,'title',(ti.value||'').trim()); store.taskSetLink(tid,idx,'url',url); editingLink=null; render(); }
function taskLinksPanel(t){
  const editable=canEditLinks(t); const links=t.links||[];
  const rows=links.map((l,i)=>{
    const href=(l.url||'').match(/^https?:\/\//)?l.url:'https://'+(l.url||'');
    if(editable && editingLink===t.id+':'+i){
      return `<div class="ll-row"><input class="sl2-t" id="ll-t-${t.id}-${i}" value="${esc(l.title||'')}" placeholder="Título"><input class="sl2-u" id="ll-u-${t.id}-${i}" value="${esc(l.url||'')}" placeholder="https://…"><button class="btn sm" onclick="saveLinkEdit('${t.id}',${i})">Guardar</button><button class="btn ghost sm" onclick="cancelEditLink()">Cancelar</button></div>`;
    }
    const openBtn=`<a class="ll-btn" href="${href}" target="_blank" rel="noopener">🔗 <span class="ll-tt">${l.title||l.url||'(sin título)'}</span><span class="ll-arrow">↗</span></a>`;
    if(!editable) return `<div class="ll-row">${openBtn}</div>`;
    return `<div class="ll-row">${openBtn}<button class="ll-icon edit" title="Editar" onclick="editLink('${t.id}',${i})">✏️</button><button class="ll-icon del" title="Eliminar" onclick="taskDelLink('${t.id}',${i})">🗑️</button></div>`;
  }).join('');
  const addRow = editable ? `<div class="ll-row sl2-add"><input class="sl2-t" id="tl-title-${t.id}" placeholder="Título"><input class="sl2-u" id="tl-url-${t.id}" placeholder="https://…"><button class="btn sm" onclick="taskAddLink('${t.id}')">+ Agregar</button></div>` : '';
  return `<div class="sl2-list">${rows||'<div class="muted" style="font-size:.85rem;margin-bottom:8px">Aún no hay links.</div>'}${addRow}</div>`;
}
function editSub(tid,sid){ openSubEdit(tid,sid); }
function cancelSubEdit(){editingSub=null;render();}
function saveSubEdit(tid,sid){
  const name=(val('se-name-'+sid)||'').trim(); if(!name){alert('La subtarea necesita nombre.');return;}
  const patch={name,personId:val('se-person-'+sid)||'',date:val('se-date-'+sid)||(store.task(tid)||{}).dueDate||'',time:val('se-time-'+sid)||'',durMin:+val('se-dur-'+sid)||null};
  const pe=document.getElementById('se-parent-'+sid); if(pe){ const tk=store.task(tid); const np=pe.value||''; const okParent=!np||(tk.subtasks.some(m=>m.id===np&&!m.parentId)&&!subKids(tk,sid).length&&np!==sid); if(okParent) patch.parentId=np; }
  store.updateSubtask(tid,sid,patch);
  logEvent(tid,'Editó la subtarea «'+name+'»');
  editingSub=null;render();
}
function nsReveal(id){const ctl=document.getElementById(id);if(!ctl)return;ctl.classList.remove('hidden');const btn=ctl.parentElement.querySelector('.ns-ico');if(btn)btn.style.display='none';if(ctl.showPicker){try{ctl.showPicker();}catch(e){ctl.focus();}}else{ctl.focus();}}
function addSub(tid){ const n=(val('ns-name')||'').trim(); if(!n) return; const tk=store.task(tid); const st={name:n,personId:val('ns-person')||'',date:(tk&&tk.dueDate)||'',time:'',durMin:null,invitados:[]}; store.addSubtask(tid,st); logEvent(tid,'Agregó la subtarea «'+n+'»'); openSubEdit(tid,st.id); }
function draftAttach(ev,tid){
  const files=[...ev.target.files]; const box=document.getElementById('cmt-preview-'+tid);
  files.forEach(f=>{
    if(f.type && f.type.startsWith('image/')){
      compressImage(f,(dataUrl)=>addAttPreview(box,{name:f.name,type:'image/jpeg',dataUrl}));
    } else {
      if(f.size>900*1024){alert('“'+f.name+'” pesa '+Math.round(f.size/1024)+' KB. Para la demo el máximo por archivo (no imagen) es ~900 KB.');return;}
      const r=new FileReader();
      r.onload=()=>addAttPreview(box,{name:f.name,type:f.type,dataUrl:r.result});
      r.readAsDataURL(f);
    }
  });
  ev.target.value='';
}
function addAttPreview(box,att){
  draftAtt.push(att);
  const el=document.createElement('span'); el.className='att-prev';
  el.innerHTML = (att.type&&att.type.startsWith('image/')) ? `<img src="${att.dataUrl}"><button onclick="dropAtt(this,'${esc(att.name)}')">×</button>` : `📄 ${att.name}<button onclick="dropAtt(this,'${esc(att.name)}')">×</button>`;
  if(box) box.appendChild(el);
}
function compressImage(file,cb){
  const r=new FileReader();
  r.onload=()=>{
    const img=new Image();
    img.onload=()=>{
      try{
        const max=1400; let w=img.width||1, h=img.height||1;
        if(w>max||h>max){ if(w>=h){ h=Math.round(h*max/w); w=max; } else { w=Math.round(w*max/h); h=max; } }
        const cv=document.createElement('canvas'); cv.width=w; cv.height=h;
        const ctx=cv.getContext('2d'); if(!ctx) throw new Error('no-canvas');
        ctx.drawImage(img,0,0,w,h);
        let q=0.72, out=cv.toDataURL('image/jpeg',q);
        while(out.length>700*1024 && q>0.4){ q-=0.12; out=cv.toDataURL('image/jpeg',q); }
        cb(out);
      }catch(e){
        // sin canvas disponible: usar original si cabe, si no avisar
        if(file.size<=1500*1024) cb(r.result);
        else alert('La imagen es muy pesada y no se pudo comprimir en este entorno.');
      }
    };
    img.onerror=()=>cb(r.result);
    img.src=r.result;
  };
  r.readAsDataURL(file);
}
function dropAtt(btn,name){ draftAtt=draftAtt.filter(a=>a.name!==name); btn.parentElement.remove(); }
function openLightbox(cmId,i){ const cm=store.d.comments.find(c=>c.id===cmId); if(!cm)return; const f=(cm.attachments||[])[i]; if(!f)return; lightbox={url:f.dataUrl,name:f.name}; render(); }
function closeLightbox(){ lightbox=null; render(); }
function lightboxModal(){
  return `<div class="lbx" onclick="if(event.target===this)closeLightbox()">
    <div class="lbx-bar"><span class="lbx-nm">${esc(lightbox.name||'imagen')}</span>
      <span style="display:flex;gap:8px"><a class="btn ghost sm" href="${lightbox.url}" download="${esc(lightbox.name||'imagen')}">⬇ Descargar</a><button class="btn ghost sm" onclick="closeLightbox()">Cerrar ✕</button></span></div>
    <img class="lbx-img" src="${lightbox.url}" onclick="event.stopPropagation()">
  </div>`;
}
function mentionPeople(tid){ const t=store.task(tid); const p=store.project(t.projectId); const c=store.client(p.clientId); return [...store.activeStaff().map(u=>({id:u.id,name:u.name,tipo:'Nuwek',color:u.color})), ...(c?c.people:[]).map(pp=>({id:pp.id,name:pp.name,tipo:'Cliente',color:pp.color||'#8a9a93'}))]; }
function mentionInput(ta,tid){
  const box=document.getElementById('mention-box-'+tid); if(!box)return;
  const before=ta.value.slice(0,ta.selectionStart);
  const m=before.match(/@([^\s@]*)$/);
  if(!m){ box.innerHTML=''; box.classList.remove('on'); return; }
  const q=m[1].toLowerCase();
  const matches=mentionPeople(tid).filter(pp=>pp.name.toLowerCase().includes(q)).slice(0,6);
  if(!matches.length){ box.innerHTML=''; box.classList.remove('on'); return; }
  box.innerHTML=matches.map(pp=>`<div class="ment-opt" data-id="${pp.id}" onmousedown="mentionPick(event,'${tid}','${pp.id}')"><span class="ment-dot" style="background:${pp.color}"></span>${pp.name} <span class="muted" style="font-size:.72rem">${pp.tipo}</span></div>`).join('');
  box.classList.add('on');
}
function mentionPick(ev,tid,id){
  ev.preventDefault();
  const ta=document.getElementById('cmt-'+tid); const pos=ta.selectionStart;
  const before=ta.value.slice(0,pos), after=ta.value.slice(pos);
  const m=before.match(/@([^\s@]*)$/); if(!m)return;
  const name=store.person(id).name;
  const newBefore=before.slice(0,m.index)+'@'+name+' ';
  ta.value=newBefore+after;
  const np=newBefore.length; ta.setSelectionRange(np,np);
  if(!draftMentions.includes(id)) draftMentions.push(id);
  const box=document.getElementById('mention-box-'+tid); box.innerHTML=''; box.classList.remove('on');
  ta.focus();
}
function mentionBlur(tid){ setTimeout(()=>{ const box=document.getElementById('mention-box-'+tid); if(box){ box.innerHTML=''; box.classList.remove('on'); } },150); }
async function addCmt(tid){
  const el=document.getElementById('cmt-'+tid); const tx=(el.value||'').trim();
  if(!tx && draftAtt.length===0){return;}
  const ments=draftMentions.filter(id=>tx.includes('@'+store.person(id).name));
  // los archivos se suben al Storage y en el comentario solo queda su URL (antes se guardaba el archivo entero en la base)
  const atts=[]; for(const a of draftAtt){ let u=a.dataUrl;
    if(typeof u==='string'&&u.startsWith('data:')&&typeof dbUploadFile==='function'){ try{ const mime=(u.match(/^data:(.*?);/)||[])[1]||'application/octet-stream'; const ext=(a.name&&a.name.includes('.')?a.name.split('.').pop():(mime.split('/')[1]||'bin')).toLowerCase().replace(/[^a-z0-9]/g,'').slice(0,5)||'bin'; u=await dbUploadFile(dataUrlToBlob(u),'adjuntos',ext,mime); }catch(e){ console.warn('No se pudo subir el adjunto; se guarda en la base:',e&&e.message||e); } }
    atts.push(Object.assign({},a,{dataUrl:u})); }
  try{ store.addComment(tid,currentUser,tx,atts,ments); }
  catch(e){ alert('No se pudo guardar el comentario.'); return; }
  logEvent(tid,'Comentó'+(ments.length?' y mencionó a '+ments.map(id=>store.person(id).name).join(', '):''));
  draftAtt=[]; draftMentions=[]; render();
}

/* ================== CATÁLOGOS ================== */
function viewCatalogos(){
  const svc=store.d.services.map(s=>{
    const used=store.serviceUsed(s.id);
    const open=!!svcOpen[s.id];
    const nF=s.frentes.length, nT=(s.tasks||[]).length;
    const frentes=s.frentes.map(f=>`<span class="chip tag-chip"><span class="tag-sw" style="background:${f.color}"></span>${f.name} <button class="chip-e" title="Editar" onclick="openSvcFrenteEdit('${s.id}','${esc(f.name)}')">✏️</button><button class="chip-x" title="Quitar frente" onclick="svDelFrente('${s.id}','${esc(f.name)}')">×</button></span>`).join('') || '<span class="muted" style="font-size:.8rem">Sin frentes</span>';
    const tasksHtml=(s.tasks||[]).map((t,i)=>{const fr=s.frentes.find(f=>f.name===t[0]);return `<div class="svc-task"><span class="tag-sw" style="background:${fr?fr.color:'#9aa39f'}"></span><span class="st-nm">${t[1]}</span>${t[2]?`<span title="${esc(t[2])}" style="cursor:help">📝</span>`:''}<span class="st-fr muted">${t[0]}</span><span class="st-ops"><button title="Editar" onclick="openSvcTaskEdit('${s.id}',${i})">✏️</button><button title="Quitar" onclick="svDelTask('${s.id}',${i})">×</button></span></div>`;}).join('') || '<span class="muted" style="font-size:.8rem">Sin tareas base</span>';
    return `<div class="card svc-acc">
      <div class="svc-head">
        <div class="svc-head-l" onclick="toggleSvc('${s.id}')">
          <span class="svc-chev">${open?'▾':'▸'}</span>
          <div><h3 style="margin:0;font-size:1.05rem">${s.name}</h3><div class="svc-sum">${nF} frente${nF===1?'':'s'} · ${nT} tarea${nT===1?'':'s'} base${s.listPrice?` · <b>${money(s.listPrice)}</b> lista`:''}${(s.listPrice&&s.opCost)?` · margen ${Math.round((s.listPrice-s.opCost)/s.listPrice*100)}%`:''}${used?' · <span style="color:var(--ok)">En uso</span>':''}</div></div>
        </div>
        <div class="svc-head-r"><span class="pill yellow">plantilla</span><button class="btn ghost sm" title="Renombrar" onclick="openSvcEdit('${s.id}')">✏️</button>${used?'':`<button class="btn ghost sm" title="Eliminar" onclick="delSvc('${s.id}')">🗑️</button>`}</div>
      </div>
      ${open?`<div class="svc-body">
        ${(s.listPrice||s.opCost)?`<div class="svc-econ">Precio de lista: <b>${money(s.listPrice||0)}</b> · Costo estimado: <b>${money(s.opCost||0)}</b>${s.listPrice?` · Margen: <b>${money((s.listPrice||0)-(s.opCost||0))}</b> (${Math.round(((s.listPrice||0)-(s.opCost||0))/s.listPrice*100)}%)`:''}</div>`:''}
        <div class="muted" style="font-size:.82rem;margin-top:4px">Frentes:</div>
        <div class="chiplist" style="margin:6px 0">${frentes}</div>
        <button class="btn ghost sm" onclick="openSvcFrente('${s.id}')">+ Frente</button>
        <div class="muted" style="font-size:.82rem;margin-top:14px">Tareas base:</div>
        <div class="svc-tasks">${tasksHtml}</div>
        <button class="btn ghost sm" style="margin-top:8px" onclick="openSvcTaskForm('${s.id}')" ${s.frentes.length?'':'disabled'}>+ Tarea base</button>
        ${used?'<div class="muted" style="font-size:.78rem;margin-top:10px">Editar la plantilla no afecta proyectos ya creados.</div>':''}
      </div>`:''}
    </div>`;
  }).join('');
  const staffRow=(u)=>{
    const inactive=u.active===false;
    return `<div class="cat-row ${inactive?'off':''}">
      ${avatar(u,true)} <span class="cat-nm">${fullName(u)}</span>
      <span class="muted" style="font-size:.82rem">${u.role||''}${u.team?' · '+u.team:''} · ${money(u.rate)}/h</span>
      <span class="pill ${inactive?'gray':'green'}">${inactive?'Inactivo':'Activo'}</span>
      <span class="cat-ops"><button class="btn ghost sm" title="Editar" onclick="openStaffEdit('${u.id}')">✏️</button>
        <button class="btn ghost sm" title="${inactive?'Reactivar':'Marcar inactivo (ya no está en Nuwek)'}" onclick="toggleStaff('${u.id}')">${inactive?'↩︎':'🚪'}</button></span>
    </div>`;
  };
  const TEAM_ORDER=['Directivo','Gerencial','Consulting','Sales','Marketing','Apoyo'];
  const activeStaffL=store.d.staff.filter(u=>u.active!==false);
  const inactiveStaffL=store.d.staff.filter(u=>u.active===false);
  const known=new Set(TEAM_ORDER);
  const groups=[];
  TEAM_ORDER.forEach(tm=>{ const list=activeStaffL.filter(u=>u.team===tm); if(list.length) groups.push([tm,list]); });
  const noTeam=activeStaffL.filter(u=>!u.team || !known.has(u.team));
  if(noTeam.length) groups.push(['Sin equipo',noTeam]);
  if(inactiveStaffL.length) groups.push(['Inactivos',inactiveStaffL]);
  const staff=groups.map(([name,list])=>{
    const key='t_'+name.replace(/[^a-zA-Z0-9]/g,'_');
    const open=teamOpen[key]===true;
    return `<div class="team-grp">
      <div class="team-head" onclick="toggleTeam('${key}')"><span class="svc-chev">${open?'▾':'▸'}</span><span class="team-nm">${name}</span><span class="team-cnt">${list.length}</span></div>
      ${open?`<div class="cat-list">${list.map(staffRow).join('')}</div>`:''}
    </div>`;
  }).join('') || '<div class="muted">Sin personal.</div>';
  const tags=store.d.tags.map(t=>`<span class="chip tag-chip"><span class="tag-sw" style="background:${t.color}"></span>${t.name} <button class="chip-e" title="Editar" onclick="openTagEdit('${esc(t.name)}')">✏️</button><button class="chip-x" title="Eliminar" onclick="delTag('${esc(t.name)}')">×</button></span>`).join('') || '<span class="muted">Sin etiquetas</span>';
  const CT=[['servicios','🧩 Servicios'],['personal','👥 Personal Nuwek'],['etiquetas','🏷️ Etiquetas'],['accesos','🔑 Accesos de clientes'],['importar','⬆ Importar tareas'],['login','🎨 Apariencia del login']];
  const bars=CT.map(([k,l])=>`<button class="${catTab===k?'active':''}" onclick="setCatTab('${k}')">${l}</button>`).join('');
  const panes={servicios:()=>`    <div class="sec-title"><h2 style="font-size:1.1rem">Servicios</h2><button class="btn sm" onclick="openSvcForm()">+ Nuevo servicio</button></div>
    <div class="svc-list">${svc||'<div class="muted">Sin servicios.</div>'}</div>
`,personal:()=>`    <div class="sec-title"><h2 style="font-size:1.1rem">Personal Nuwek</h2><button class="btn sm" onclick="openStaffForm()">+ Nueva persona</button></div>
    <div class="team-list">${staff}</div>
`,etiquetas:()=>`    <div class="sec-title"><h2 style="font-size:1.1rem">Etiquetas</h2><button class="btn sm" onclick="openTagForm()">+ Nueva etiqueta</button></div>
    <div class="chiplist">${tags}</div>
`,accesos:()=>accesosHtml(),importar:()=>`    <div class="sec-title"><h2 style="font-size:1.1rem">Importar tareas</h2><button class="btn sm" onclick="openImport('')">⬆ Importar desde Excel</button></div>
    <p class="muted" style="margin-top:-4px">Pasa un listado de tareas, subtareas y sub-subtareas desde Excel o CSV. También lo encuentras dentro de cada proyecto.</p>
`,login:()=>`    <div class="sec-title"><h2 style="font-size:1.1rem">Apariencia del login</h2></div>
    <div class="card">
      <div style="display:flex;gap:18px;flex-wrap:wrap;align-items:flex-start">
        <div class="bg-prev" style="background-image:url('${getLoginBg()}')"></div>
        <div style="flex:1;min-width:240px">
          <div class="field"><label>Pega una URL de imagen (recomendado)</label>
            <div style="display:flex;gap:8px"><input id="bg-url" placeholder="https://…/fondo.jpg" value="${store.d.settings&&store.d.settings.loginBg&&store.d.settings.loginBg.slice(0,5)!=='data:'?esc(store.d.settings.loginBg):''}" style="flex:1"><button class="btn sm" onclick="setLoginBgUrl()">Usar URL</button></div>
            <div class="hint">La URL debe ser directa a la imagen (termina en .jpg/.png). No sirven los links de "compartir" de Google Drive.</div>
          </div>
          <div class="field"><label>O sube un archivo (se guarda en este navegador)</label>
            <input type="file" accept="image/*" onchange="setLoginBgFile(this)" style="font-size:.82rem">
            <div class="hint">Se comprime sola. Ocupa espacio local (~5MB máx). Ideal solo para probar; para producción usa URL o Supabase Storage.</div>
          </div>
          <button class="btn ghost sm" onclick="resetLoginBg()">Restaurar por defecto</button>
        </div>
      </div>
    </div>`};
  const EMPTY=[['🧩','Aquí nacen las plantillas','Elige una pestaña y ponte a crear: servicios con sus frentes y tareas base, gente nueva en Nuwek, etiquetas de colores, importaciones masivas desde Excel o el fondo del login.'],
    ['🪄','¡Nada seleccionado, todo por inventar!','Toca una pestaña de arriba: ahí puedes dar de alta servicios, personal, etiquetas, importar tareas o cambiarle la cara al login.'],
    ['🛠️','Taller de catálogos abierto','Escoge una pestaña para crear o ajustar lo que usa todo el portal. Lo que hagas aquí lo heredan los proyectos nuevos.']];
  const em=EMPTY[catEmptyN%EMPTY.length];
  const body=catTab&&panes[catTab]?panes[catTab]():`<div class="cat-empty"><div class="cat-empty-i">${em[0]}</div><b>${em[1]}</b><p>${em[2]}</p></div>`;
  return `<div class="crumb">Catálogos</div><div class="sec-title"><h2>Catálogos</h2></div>
    <p class="muted">La base reutilizable. Los <b>Servicios</b> son plantillas: al crear un proyecto precargan sus frentes y tareas.</p>
    <div class="ptabs">${bars}</div>${body}`;
}
let catTab='', catEmptyN=0;
function setCatTab(k){ if(catTab===k){ catTab=''; catEmptyN++; } else catTab=k; render(); }

/* ================== NAV ================== */
function go(v){view=v;modalTask=null;render();}
function openClient(id){selClient=id;view='cliente';citaSel=null;finSel=null;clientTab='citas';render();}
function openProject(id){selProject=id;selTab='gestor';view='proyecto';render();}
function setTab(t){selTab=t;render();}
function setGanttZoom(z){ganttZoom=z;render();}
let ganttOpen={}, ganttLastKey='';
function ganttOrdered(p,fid){ const ets=store.etapasOf(p.id); const eo={}; ets.forEach(e=>eo[e.id]=e.order==null?0:e.order);
  const key=t=>{ const ids=[...taskEtapaIds(t)]; return ids.length?Math.min(...ids.map(i=>eo[i]==null?999:eo[i])):999; };
  return store.tasksOf(p.id).filter(t=>t.frenteId===fid).map((t,i)=>({t,i,k:key(t)})).sort((a,b)=>a.k-b.k||((a.t.ord||0)-(b.t.ord||0))||a.i-b.i).map(x=>x.t); }
function depBroken(t,x){ if(!x.dependsOn||!x.date) return false; const pr=(t.subtasks||[]).find(z=>z.id===x.dependsOn); if(!pr||!pr.date) return false; return instCmp(wStart(instStart(x)),instEnd(pr))<0; }
function ganttToggle(tid){ ganttOpen[tid]=!ganttOpen[tid]; ganttClosePop(); renderKeepScroll(); }
function ganttAfter(){ const el=document.querySelector('.g-inner'); if(!el){ ganttLastKey=''; return; } const key=el.dataset.key; if(key===ganttLastKey) return; ganttLastKey=key;
  const sc=el.parentElement; if(el.dataset.today!=='') sc.scrollLeft=Math.max(0,(+el.dataset.today)-Math.min(160,sc.clientWidth/3)); }
function ganttClosePop(){ const e=document.getElementById('g-pop'); if(e) e.remove(); }
function ganttStatus(x,due){ if(x.done) return {t:'✔ Hecha',c:'#1d6b3a'}; const d=x.date||due; if(!d) return {t:'Sin fecha',c:'#8a9a93'}; const n=daysBetween(todayISO(),d); return n<0?{t:'🔴 Atrasada '+(-n)+' día(s)',c:'#c0392b'}:n===0?{t:'🟡 Es hoy',c:'#a37b00'}:{t:'🟢 En tiempo · faltan '+n+' día(s)',c:'#1d6b3a'}; }
function ganttPop(ev,tid,sid){ ev.stopPropagation(); ganttClosePop(); const t=store.task(tid); if(!t) return; const x=sid?(t.subtasks||[]).find(z=>z.id===sid):null; const sp=taskSpan(t);
  let rows;
  if(x){ const per=store.person(x.personId); const st=ganttStatus(x); const est=x.durMin?fmtDurShort(x.durMin):'—';
    rows=[['Nivel',x.parentId?'Sub-subtarea':'Subtarea'],['Día',x.date?dLabel(x.date)+(x.time?' · '+x.time:''):'Sin fecha'],['Estatus','<b style="color:'+st.c+'">'+st.t+'</b>'],['Tiempo',(x.timeSpent?fmtTime(x.timeSpent):'0')+' de '+est+' estimados'],['Responsable',per&&per.id&&per.name&&per.name!=='—'?avatar(per,true)+' '+esc(per.name):'Sin asignar']];
    if(x.dependsOn){ const pr=t.subtasks.find(z=>z.id===x.dependsOn); if(pr) rows.push(['Empieza tras','⛓ '+esc(pr.name)]); if(pr&&!(typeof clientSess!=='undefined'&&clientSess&&!session)&&depBroken(t,x)) rows.push(['Aviso','<b style="color:#c0392b">⚠️ Empieza antes de que termine «'+esc(pr.name)+'»</b>']); } }
  else { const per=store.person(t.responsibleId); const ws=workSubs(t); const dn=ws.filter(z=>z.done).length; const st=t.status==='done'?{t:'✔ Hecha',c:'#1d6b3a'}:ganttStatus({},t.dueDate); const spent=ws.reduce((a,z)=>a+(z.timeSpent||0),0);
    rows=[['Nivel','Tarea'],['Días',sp?dLabel(sp.start)+' – '+dLabel(sp.end):'Sin fecha'],['Estatus','<b style="color:'+st.c+'">'+st.t+'</b>'],['Avance',dn+' de '+ws.length+' subtareas'],['Tiempo',spent?fmtTime(spent):'0'],['Responsable',per&&per.id&&per.name&&per.name!=='—'?avatar(per,true)+' '+esc(per.name):'Sin asignar']]; }
  const inCl=(typeof clientSess!=='undefined'&&clientSess&&!session); const open=inCl?`openCpTask('${tid}')`:(x?`openSubEdit('${tid}','${sid}')`:`openTask('${tid}')`);
  const box=document.createElement('div'); box.id='g-pop'; box.className='g-pop'; box.onclick=e=>e.stopPropagation();
  box.innerHTML=`<div class="g-pop-t">${esc(x?x.name:t.name)}</div>${rows.map(r=>`<div class="g-pop-r"><span>${r[0]}</span><span>${r[1]}</span></div>`).join('')}<button class="btn sm" style="margin-top:8px;width:100%" onclick="ganttClosePop();${open}">Abrir</button>`;
  document.body.appendChild(box); const r=box.getBoundingClientRect(); box.style.left=Math.max(8,Math.min(ev.clientX+10,innerWidth-r.width-8))+'px'; box.style.top=Math.max(8,Math.min(ev.clientY+10,innerHeight-r.height-8))+'px'; }
document.addEventListener('click',()=>ganttClosePop());
document.addEventListener('keydown',e=>{ if(e.key==='Escape') ganttClosePop(); });
function setTareasMode(m){tareasMode=m;render();}
function setGroupBy(d){groupBy=d;render();}
function setFilterPersona(v){filterPersona=v;render();}
function setFilterMes(v){filterMes=v;render();}
function calShift(n){calMonth=new Date(calMonth.getFullYear(),calMonth.getMonth()+n,1);calDay=null;render();}
function selectCalDay(ds){calDay=(calDay===ds?null:ds);render();}
function setRole(r){role=r;view=(r==='colab')?'op_pendientes':'clientes';selProject=null;modalTask=null;opSelTask=null;render();}
function setUser(id){currentUser=id;opSelTask=null;render();}
function setLoginBgUrl(){ const u=(val('bg-url')||'').trim(); if(!u){alert('Pega una URL de imagen.');return;} store.setSetting('loginBg',u); render(); }
function setLoginBgFile(input){ const f=input.files&&input.files[0]; if(!f) return;
  compressImage(f,(dataUrl)=>{
    if(typeof dbUploadImage==='function'){
      dbUploadImage(dataUrlToBlob(dataUrl),'login').then(pubUrl=>{ store.setSetting('loginBg',pubUrl); render(); })
        .catch(e=>{ console.error('Error subiendo fondo:',e); try{ store.setSetting('loginBg',dataUrl); render(); }catch(_){ alert('No se pudo subir la imagen.'); } });
    } else { try{ store.setSetting('loginBg',dataUrl); render(); }catch(e){ alert('La imagen es muy pesada. Prueba con una más chica o usa una URL.'); } }
  });
}
function resetLoginBg(){ if(confirm('¿Restaurar el fondo por defecto?')){ store.setSetting('loginBg',null); render(); } }
function selectOpTask(id){opSelTask=(opSelTask===id?null:id);draftAtt=[];draftMentions=[];subView='list';render();}

/* init: cargar Personal desde Supabase y luego arrancar */
let shareTaskIdAtLoad=(()=>{ try{ const m=(location.hash||'').match(/^#\/tarea\/(.+)$/); if(!m) return null; let id=m[1]; try{ id=decodeURIComponent(id); }catch(_){} history.replaceState(null,'',location.pathname+location.search); return id; }catch(_){ return null; } })();
async function boot(){
  try{
    if(typeof dbLoadPersonal==='function'){
      const rows = await dbLoadPersonal();
      store.d.staff = rows;      // el equipo viene de Supabase
      store.save();               // cache local
    }
    if(typeof dbLoadClientes==='function'){
      const cli = await dbLoadClientes();
      store.d.clients = cli;      // los clientes vienen de Supabase
      store.save();
    }
    if(typeof dbLoadServicios==='function'){
      const svs = await dbLoadServicios();
      store.d.services = svs;     // los servicios vienen de Supabase
      store.save();
    }
    if(typeof dbLoadProyectos==='function'){
      const pr = await dbLoadProyectos();
      store.d.projects = pr.projects;   // proyectos
      store.d.frentes  = pr.frentes;    // frentes
      store.d.etapas   = pr.etapas;     // etapas
      store.save();
    }
    if(typeof dbLoadTareas==='function'){
      const tk = await dbLoadTareas();
      store.d.tasks = tk;               // tareas (con subtareas dentro)
      store.save();
    }
    if(typeof dbLoadComentarios==='function'){ store.d.comments = await dbLoadComentarios(); store.save(); }
    if(typeof dbLoadLog==='function'){ store.d.log = await dbLoadLog(); store.save(); }
    if(typeof dbLoadTags==='function'){ store.d.tags = await dbLoadTags(); store.save(); }
    if(typeof dbLoadPagos==='function'){ store.d.payments = await dbLoadPagos(); store.save(); }
  }catch(e){
    console.error('Error cargando Personal desde Supabase:', e);
    const app=document.getElementById('app');
    if(app) app.innerHTML='<div style="padding:48px;max-width:520px;margin:40px auto;font-family:Inter,sans-serif;color:#223c36;text-align:center"><h2>No se pudo conectar con la base de datos</h2><p style="color:#6b7d76">Revisa tu conexión a internet y recarga la página. Si el problema sigue, avísame. (Detalle técnico en la consola del navegador.)</p></div>';
    return;
  }
  if(!window.CLIENT_ONLY) restoreSession(); if(!session) restoreClientSession();
  if(session){ runAllCycles(); runAllSeries(); }
  if(shareSesionAtLoad){ publicSes=shareSesionAtLoad; shareSesionAtLoad=null; }
  if(shareTaskIdAtLoad){ const sid=shareTaskIdAtLoad; shareTaskIdAtLoad=null; if(session){ openSharedTask(sid); } else { publicTaskId=sid; afterLoginTask=sid; } }
  render();
  startSync();
}
/* ================== SINCRONIZACIÓN EN VIVO (máx. ~3 s) ================== */
let syncBusy=false, syncDirty=false, syncTick=0, syncTimer=null, rtChannel=null, rtDebounce=null;
const SYNC_FAST_MS=3000;
function syncIsBusy(){
  const a=document.activeElement; if(a&&/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)&&(a.closest('#app')||a.closest('#modal-root'))) return true;
  if(tcDrag||sbDrag||agListDrag) return true;
  if(document.querySelector('.ag-block.dragging,.ag-block.resizing')) return true;
  if(editingTask||editingSub||timingSub||editingCmt||addingChild||subEd||clientPop||depPrev||copyS||dupS||movS||movT||mnNew||mnSum||mnAuth||pdfS||expS||accEd||(impS&&impS.rows)||qm||wiz||lightbox||libModal) return true;
  // borradores sin enviar (comentario, nombre de subtarea, etc.)
  if([...document.querySelectorAll('#app textarea, #modal-root textarea, #app input[type=text], #modal-root input[type=text], #app input:not([type]), #modal-root input:not([type])')].some(i=>!i.readOnly&&!i.disabled&&(i.value||'').trim())) return true;
  return false;
}
function renderKeepScroll(){
  const sel='.op-left,.op-right,.ag-left,.ag-right,.lib-det,.lib-side,.modal,.modal-card,.m-body,.gantt-wrap,.ga-scroll,.task-panel,.kb-board,.ag-cal,.gc-grid,.g-scroll';
  const y=window.scrollY; const saved=[...document.querySelectorAll(sel)].map(e=>({cls:e.className,top:e.scrollTop,left:e.scrollLeft}));
  render();
  [...document.querySelectorAll(sel)].forEach((e,i)=>{ const o=saved[i]; if(o&&o.cls===e.className){ e.scrollTop=o.top; e.scrollLeft=o.left; } });
  window.scrollTo(0,y);
}
async function syncTables(set){
  if(syncBusy||(!session&&!clientSess)||document.hidden) return; syncBusy=true; const t0=Date.now();
  try{
    const jobs={}; const want=n=>set.has(n)||set.has('all');
    if(want('tareas')&&typeof dbLoadTareas==='function') jobs.tasks=dbLoadTareas();
    if(want('comentarios')&&typeof dbLoadComentarios==='function') jobs.comments=dbLoadComentarios();
    if(want('log')&&typeof dbLoadLog==='function') jobs.log=dbLoadLog();
    if(want('pagos')&&typeof dbLoadPagos==='function') jobs.payments=dbLoadPagos();
    if(want('proyectos')&&typeof dbLoadProyectos==='function') jobs.pr=dbLoadProyectos();
    if(want('clientes')&&typeof dbLoadClientes==='function') jobs.clients=dbLoadClientes();
    if(want('personal')&&typeof dbLoadPersonal==='function') jobs.staff=dbLoadPersonal();
    if(want('etiquetas')&&typeof dbLoadTags==='function') jobs.tags=dbLoadTags();
    const keys=Object.keys(jobs); const vals=await Promise.all(keys.map(k=>jobs[k])); const got={}; keys.forEach((k,i)=>got[k]=vals[i]);
    if(lastLocalWrite>t0-1500) return;          // acabas de guardar algo: no lo pises, el siguiente ciclo lo trae
    let changed=false; const put=(k,v)=>{ if(JSON.stringify(store.d[k])!==JSON.stringify(v)){ store.d[k]=v; changed=true; } };
    if(got.comments){ const prev={}; (store.d.comments||[]).forEach(c=>{ if(c.attachments!==undefined) prev[c.id]=c.attachments; }); got.comments.forEach(c=>{ if(c.attachments===undefined&&prev[c.id]!==undefined) c.attachments=prev[c.id]; }); }
    if(got.tasks) put('tasks',got.tasks); if(got.comments) put('comments',got.comments); if(got.log) put('log',got.log); if(got.payments) put('payments',got.payments);
    if(got.pr){ put('projects',got.pr.projects); put('frentes',got.pr.frentes); put('etapas',got.pr.etapas); }
    if(got.clients) put('clients',got.clients); if(got.staff) put('staff',got.staff); if(got.tags) put('tags',got.tags);
    if(!changed) return;
    if(modalTask&&!store.task(modalTask)){ modalTask=null; editingTask=null; }
    if(opSelTask&&!store.task(opSelTask)) opSelTask=null;
    if(selProject&&!store.project(selProject)){ selProject=null; if(view==='proyecto') view=isColab()?'op_pendientes':'clientes'; }
    syncDirty=true; syncFlush();
  }catch(e){ console.warn('Sync:',e&&e.message||e); }
  finally{ syncBusy=false; }
}
function syncFlush(){ if(!syncDirty||(!session&&!clientSess)) return; if(syncIsBusy()) return; syncDirty=false; renderKeepScroll(); }
function startSync(){
  if(syncTimer) return;
  syncTimer=setInterval(()=>{ if((!session&&!clientSess)||document.hidden) return; syncTick++; const slow=(syncTick%5===0);
    syncTables(new Set(slow?['all']:['tareas','comentarios'])); if(session){ if(runAllCycles()) syncDirty=true; if(runAllSeries()) syncDirty=true; } syncFlush(); },SYNC_FAST_MS);
  document.addEventListener('visibilitychange',()=>{ if(!document.hidden) syncTables(new Set(['all'])); });
  // Realtime (acelera la entrega si la publicación está activada en Supabase; el sondeo de arriba garantiza el máximo de 3 s)
  try{ if(sb.channel){ rtChannel=sb.channel('nuwek-live'); ['tareas','comentarios','proyectos','frentes','etapas','pagos','clientes','personal','log','etiquetas'].forEach(tb=>{
      rtChannel.on('postgres_changes',{event:'*',schema:'public',table:tb},()=>{ clearTimeout(rtDebounce); rtDebounce=setTimeout(()=>syncTables(new Set([tb==='frentes'||tb==='etapas'?'proyectos':tb])),350); }); });
    rtChannel.subscribe(st=>{ if(st==='CHANNEL_ERROR'||st==='TIMED_OUT'){ try{ sb.removeChannel(rtChannel); }catch(_){} } }); } }catch(e){ console.warn('Realtime no disponible:',e&&e.message||e); }
}


/* ================== SIGUIENTES ACTIVIDADES (⏰ junto a tu foto) ================== */
let nextOpen=false;
function nextItems(){
  const me=currentUser; const now=Date.now(); const out=[];
  store.d.tasks.forEach(t=>{ const p=store.project(t.projectId); if(!p) return; (t.subtasks||[]).forEach(s=>{
    if(s.done||s.isSeries||!s.date) return; if(!(s.personId===me||(s.team||[]).includes(me))) return;
    const hasT=!!s.time; const at=new Date(s.date+'T'+(s.time||'23:59')+':00').getTime(); if(isNaN(at)||at<now-(hasT?0:0)) return;
    out.push({s,t,p,at,hasT,part:s.personId!==me}); }); });
  return out.sort((a,b)=>a.at-b.at).slice(0,14); }
function nextWhen(it){ const now=new Date(); const d=new Date(it.at); const mins=Math.round((it.at-now.getTime())/60000); const today=todayISO(), tm=addDaysISO(today,1);
  if(it.hasT&&mins<60) return {t:mins<=1?'¡ahora!':'en '+mins+' min',soon:true};
  if(it.s.date===today) return {t:it.hasT?'hoy · '+it.s.time:'hoy',soon:it.hasT&&mins<180};
  if(it.s.date===tm) return {t:'mañana'+(it.hasT?' · '+it.s.time:''),soon:false};
  return {t:dLabel(it.s.date)+(it.hasT?' · '+it.s.time:''),soon:false}; }
function nextBtnUpdate(){ const b=document.getElementById('next-btn'); if(!b||!session) return; const its=nextItems(); const soon=its.find(i=>i.hasT&&(i.at-Date.now())<=3600000);
  b.classList.toggle('soon',!!soon); b.title=soon?('Pronto: '+soon.s.name+' ('+nextWhen(soon).t+')'):'Tus siguientes actividades'; }
function nextPopHtml(){ const its=nextItems();
  const rows=its.map(it=>{ const w=nextWhen(it); const cita=subHasCita(it.s); const f=kbFrente(it.t);
    return `<div class="nx-it${w.soon?' soon':''}" onclick="goNext('${it.t.id}','${it.s.id}')"><div class="nx-when">${w.t}</div><div class="nx-tx"><div class="nx-nm">${cita?'📅 ':''}${it.part?'🤝 ':''}${esc(it.s.name)}</div><div class="nx-sub">${esc(it.p.name)} · ${esc(it.t.name)} · <span style="color:${f.color};font-weight:600">${esc(f.name)}</span></div></div></div>`; }).join('');
  return `<div class="nx-h">⏰ Lo que sigue <span class="muted">${its.length?its.length+' próxima'+(its.length>1?'s':''):''}</span></div><div class="nx-list">${rows||'<div class="nf-empty">🎉 No tienes actividades próximas programadas</div>'}</div>`; }
function toggleNext(ev){ ev&&ev.stopPropagation(); nextOpen=!nextOpen; nextRender(); }
function nextRender(){ let pop=document.getElementById('next-pop'); if(!nextOpen||!session){ if(pop) pop.remove(); return; }
  if(!pop){ pop=document.createElement('div'); pop.id='next-pop'; document.body.appendChild(pop); }
  pop.innerHTML=nextPopHtml(); const b=document.getElementById('next-btn'); const r=b?b.getBoundingClientRect():{right:innerWidth-20,bottom:60};
  pop.style.top=(r.bottom+8)+'px'; pop.style.right=Math.max(8,innerWidth-r.right-8)+'px'; }
function goNext(tid,sid){ nextOpen=false; nextRender(); openAgItem(tid,sid); }
document.addEventListener('click',ev=>{ if(nextOpen&&!ev.target.closest('#next-pop')&&!ev.target.closest('#next-btn')){ nextOpen=false; nextRender(); } });
setInterval(()=>{ if(session&&!document.hidden){ nextBtnUpdate(); if(nextOpen) nextRender(); } },30000);

/* ================== NOTIFICACIONES (@menciones) ================== */
let notifOpen=false, notifSeen=null;
function pendingMentions(){ return (store.d.comments||[]).filter(cm=>(cm.mentions||[]).includes(currentUser)&&!(cm.readBy||[]).includes(currentUser)&&cm.userId!==currentUser&&store.task(cm.taskId)).sort((a,b)=>a.ts<b.ts?1:-1); }
function notifRoot(){ let r=document.getElementById('notif-root'); if(!r){ r=document.createElement('div'); r.id='notif-root'; document.body.appendChild(r); } return r; }
function notifAvatar(p){ p=p||{}; return p.photo?`<span class="nf-av" style="background-image:url('${p.photo}')"></span>`:`<span class="nf-av" style="background:${p.color||'#3f7d6e'}">${mdEsc((p.name||'?')[0])}</span>`; }
/* respuestas del cliente a una sesión: avisan al responsable, a los participantes y al responsable de la tarea */
function pendingClientResp(){ const out=[]; store.d.tasks.forEach(t=>{ if(!store.project(t.projectId)) return; (t.subtasks||[]).forEach(s=>{ const last=sesLast(s); if(!last) return;
    const mine=s.personId===currentUser||(s.team||[]).includes(currentUser)||t.responsibleId===currentUser; if(!mine) return;
    if(((sesOf(s).respAck||{})[currentUser]||0)>=(last.tsN||0)) return; out.push({s,t,last}); }); }); return out.sort((a,b)=>a.last.ts<b.last.ts?1:-1); }
function ackClientResp(tid,sid){ const t=store.task(tid); const sub=t&&(t.subtasks||[]).find(x=>x.id===sid); if(!sub) return; const ses=Object.assign({},sub.sesion||{}); ses.respAck=Object.assign({},ses.respAck||{}); ses.respAck[currentUser]=Date.now();
  store.updateSubtask(tid,sid,{sesion:ses}); render(); }
function notifItems(){
  const m=pendingMentions().map(cm=>({id:'m:'+cm.id,type:'m',ts:cm.ts,cm,tid:cm.taskId}));
  const tm=pendingTeam().map(x=>({id:'t:'+x.s.id,type:'t',ts:x.ts,s:x.s,t:x.t,by:x.by,tid:x.t.id}));
  const tu=pendingTurno().map(x=>({id:'r:'+x.s.id+':'+x.tu.ts,type:'r',ts:x.tu.ts,s:x.s,t:x.t,tu:x.tu,tid:x.t.id}));
  const rc=pendingRecovery().map(x=>({id:'q:'+x.p.id+':'+x.ts,type:'q',ts:x.ts,c:x.c,p:x.p,tid:''}));
  const cr=pendingClientResp().map(x=>({id:'c:'+x.s.id+':'+x.last.id,type:'c',ts:x.last.ts,s:x.s,t:x.t,last:x.last,tid:x.t.id}));
  return m.concat(tm,cr,tu,rc).sort((a,b)=>a.ts<b.ts?1:-1); }
function notifUpdate(){
  const r=notifRoot(); if(!session){ r.innerHTML=''; notifSeen=null; return; }
  const list=notifItems(); const ids=list.map(x=>x.id); const me=store.person(currentUser);
  let fresh=[]; if(notifSeen){ fresh=list.filter(x=>!notifSeen.includes(x.id)); } notifSeen=ids;
  const ago=ts=>{ const m=Math.round((Date.now()-new Date(ts))/60000); return m<1?'ahora':m<60?m+' min':m<1440?Math.round(m/60)+' h':Math.round(m/1440)+' d'; };
  const items=list.slice(0,30).map(it=>{
    if(it.type==='m'){ const cm=it.cm; const a=store.person(cm.userId), t=store.task(cm.taskId); const txt=(cm.text||'').replace(/\s+/g,' ').slice(0,90);
      return `<div class="nf-it" onclick="goNotif('${cm.taskId}')">${notifAvatar(a)}<div class="nf-tx"><div class="nf-h"><b>${mdEsc(a.name||'')}</b> te mencionó <span class="muted">· ${ago(cm.ts)}</span></div><div class="nf-t">${mdEsc(t.name)}</div><div class="nf-s">${mdEsc(txt)}</div></div><button class="nf-ok" title="Ya lo vi" onclick="event.stopPropagation();markRead('${cm.id}')">✓</button></div>`; }
    if(it.type==='c'){ const st=SES_ST[it.last.estado]; const cn=(store.client((store.project(it.t.projectId)||{}).clientId)||{}).name||'El cliente';
      return `<div class="nf-it" onclick="goNotif('${it.t.id}','${it.s.id}')"><span class="nf-av" style="background:${st.c}">${it.last.estado==='confirmado'?'✓':it.last.estado==='cancelado'?'✕':'↻'}</span><div class="nf-tx"><div class="nf-h"><b>${mdEsc(cn)}</b> ${it.last.estado==='confirmado'?'confirmó':it.last.estado==='cancelado'?'canceló':'pidió reprogramar'} <span class="muted">· ${ago(it.last.ts)}</span></div><div class="nf-t">📅 ${mdEsc(it.s.name)}</div><div class="nf-s">${it.last.razon?'«'+mdEsc(it.last.razon)+'»':mdEsc(it.t.name)}</div>${(it.last.propuestas||[]).length?`<div class="nf-s" style="color:#9a7a00;font-weight:600">Propone: ${(it.last.propuestas||[]).map(x=>mdEsc(fmtPropuesta(x))).join(' · ')}</div>`:''}</div><button class="nf-ok" title="Ya la vi" onclick="event.stopPropagation();ackClientResp('${it.t.id}','${it.s.id}')">✓</button></div>`; }
    if(it.type==='q'){ return `<div class="nf-it"><span class="nf-av" style="background:#6b4fc9">🔑</span><div class="nf-tx"><div class="nf-h"><b>${mdEsc(it.p.name)}</b> pidió recuperar su código <span class="muted">· ${ago(it.ts)}</span></div><div class="nf-t">${mdEsc(it.c.name)} · usuario ${mdEsc(it.p.portal.user)}</div><div class="nf-s"><a style="cursor:pointer;color:#1f7a44;font-weight:700" onclick="event.stopPropagation();resetClientCode('${it.c.id}','${it.p.id}')">↺ Restablecer a ${RESET_CODE}</a></div></div><button class="nf-ok" title="Descartar" onclick="event.stopPropagation();dismissRecovery('${it.c.id}','${it.p.id}')">✓</button></div>`; }
    if(it.type==='r'){ const when=[it.s.date?dLabel(it.s.date):'',it.s.time||''].filter(Boolean).join(' · ');
      return `<div class="nf-it" onclick="goNotif('${it.t.id}','${it.s.id}')"><span class="nf-av" style="background:#e7b800">🔔</span><div class="nf-tx"><div class="nf-h"><b>Ya te toca</b> <span class="muted">· ${ago(it.ts)}</span></div><div class="nf-t">${mdEsc(it.s.name)}</div><div class="nf-s">Terminó «${mdEsc(it.tu.predName||'la actividad anterior')}» · ${mdEsc(it.t.name)}${when?' · '+mdEsc(when):''}</div></div><button class="nf-ok" title="Enterado" onclick="event.stopPropagation();ackTurno('${it.t.id}','${it.s.id}')">✓</button></div>`; }
    const a=store.person(it.by); const when=[it.s.date?dLabel(it.s.date):'',it.s.time||''].filter(Boolean).join(' · ');
    return `<div class="nf-it" onclick="goNotif('${it.t.id}','${it.s.id}')">${notifAvatar(a)}<div class="nf-tx"><div class="nf-h"><b>${mdEsc(a.name||'')}</b> te agregó como participante <span class="muted">· ${ago(it.ts)}</span></div><div class="nf-t">🤝 ${mdEsc(it.s.name)}</div><div class="nf-s">${mdEsc(it.t.name)}${when?' · '+mdEsc(when):''}</div></div><button class="nf-ok" title="Ya la vi y la atendí" onclick="event.stopPropagation();ackTeam('${it.t.id}','${it.s.id}')">✓</button></div>`; }).join('');
  r.innerHTML=`${notifOpen?`<div class="nf-pop"><div class="nf-pop-h">Pendientes por atender <span class="nf-cnt">${list.length}</span></div><div class="nf-list">${items||'<div class="nf-empty">🎉 Nada pendiente</div>'}</div></div>`:''}
    <button class="nf-fab${fresh.length?' pulse':''}" onclick="event.stopPropagation();toggleNotif()" title="${list.length?list.length+' pendiente(s) por atender':'Nada pendiente'}">${notifAvatar(me)}${list.length?`<span class="nf-badge">${list.length>99?'99+':list.length}</span>`:''}</button>`;
  if(fresh.length){ const f=fresh[0]; if(f.type==='q'){ notifToast('🔑 '+f.p.name+' ('+f.c.name+') pidió recuperar su código',f.tid); } else if(f.type==='r'){ notifToast('🔔 Ya te toca «'+f.s.name+'» (terminó «'+(f.tu.predName||'la anterior')+'»)',f.tid,f.s.id); } else if(f.type==='c'){ notifToast('El cliente '+(f.last.estado==='confirmado'?'confirmó':f.last.estado==='cancelado'?'canceló':'pidió reprogramar')+' «'+f.s.name+'»',f.tid,f.s.id); } else { const who=store.person(f.type==='m'?f.cm.userId:f.by).name||'Alguien'; notifToast(f.type==='m'?(who+' te mencionó en «'+store.task(f.tid).name+'»'):(who+' te agregó como participante en «'+f.s.name+'»'), f.tid, f.type==='m'?undefined:f.s.id); } }
}
function notifToast(msg,tid,sid){ const t=document.createElement('div'); t.className='nf-toast'; t.textContent='👋 '+msg; t.onclick=()=>{ t.remove(); goNotif(tid,sid); }; notifRoot().appendChild(t); setTimeout(()=>t.remove(),6000); }
function toggleNotif(){ notifOpen=!notifOpen; notifUpdate(); }
let hiSub=null, hiTimer=null;
function hiClear(){ hiSub=null; if(hiTimer){ clearTimeout(hiTimer); hiTimer=null; } }
function goNotif(tid,sid){ notifOpen=false; opFilterClient=''; view='op_pendientes'; modalTask=null; opSelTask=tid; subView='list'; draftAtt=[]; draftMentions=[]; hiClear();
  if(sid){ hiSub={tid,sid}; hiTimer=setTimeout(()=>{ hiSub=null; render(); },90000);
    const t=store.task(tid); const sb=t&&(t.subtasks||[]).find(x=>x.id===sid); if(sb&&sb.parentId){ const c=subCollapsedMap(); if(c[sb.parentId]===undefined?!!(((t.subtasks||[]).find(x=>x.id===sb.parentId)||{}).isSeries):c[sb.parentId]){ c[sb.parentId]=0; try{ localStorage.setItem('subCollapsed',JSON.stringify(c)); }catch(_){} } } }
  render();
  setTimeout(()=>{ const row=document.querySelector(`.op-row[onclick*="'${tid}'"]`); if(row){ const sec=row.closest('.op-sec'); if(sec&&sec.classList.contains('closed')) toggleAcc(sec.dataset.acc); row.scrollIntoView({block:'center'}); }
    if(sid) setTimeout(()=>{ const el=document.querySelector(`.sub-item[data-sid="${sid}"]`); if(el) el.scrollIntoView({block:'center',behavior:'smooth'}); },120); },30); }
document.addEventListener('click',ev=>{ if(notifOpen&&!ev.target.closest('#notif-root')){ notifOpen=false; notifUpdate(); } });


/* ================== GUÍA DE VERBOS PARA ESCRIBIR SUBTAREAS ================== */
const VERBOS=[['Recabar','reunir información, accesos o materiales'],['Analizar','estudiar los datos o la situación para entenderla'],['Proponer','presentar opciones o una recomendación'],['Diseñar','crear la solución, la pieza o el plan'],['Definir','decidir y dejar por escrito alcances o criterios'],['Validar','confirmar con el cliente o el equipo que está correcto'],['Probar','verificar que funciona antes de entregar'],['Aprobar','conseguir el visto bueno final'],['Ajustar','corregir con base en los comentarios'],['Comunicar','informar a quien corresponda'],['Implementar','poner en marcha'],['Evaluar','medir los resultados contra el objetivo'],['Entregar','hacer llegar el producto final'],['Auditar','revisar el cumplimiento y la calidad']];
function openVerbInfo(){ verbInfo=true; render(); }
function closeVerbInfo(){ verbInfo=false; render(); }
function useVerb(v){ verbInfo=false; render(); setTimeout(()=>{ const el=document.getElementById('nc-name')||document.getElementById('ns-name'); if(el){ el.value=v+' '; el.focus(); el.setSelectionRange(el.value.length,el.value.length); el.scrollIntoView({block:'center'}); } },30); }
function verbInfoModal(){
  return `<div class="modal active" style="z-index:130" onclick="if(event.target===this)closeVerbInfo()"><div class="modal-card vb-compact" style="max-width:470px">
    <div class="m-head"><div class="m-top"><div><h3 style="margin:0">ⓘ Cómo escribir subtareas</h3></div><button class="x" onclick="closeVerbInfo()">×</button></div></div>
    <div class="m-body">
      <p style="margin-top:0">Empieza cada subtarea con un <b>verbo en infinitivo</b> que diga la acción, y después <b>qué</b> se hace y, si ayuda, <b>para qué</b>.</p>
      <div class="vb-formula"><b>Verbo</b> + qué + (para qué / resultado)</div>
      <div class="muted" style="font-size:.84rem;margin:6px 0 14px">Ejemplo: «<b>Recabar</b> accesos de redes sociales del cliente» · «<b>Validar</b> el calendario de contenidos con dirección»</div>
      <div class="vb-grid">${VERBOS.map(([v,d])=>`<button type="button" class="vb-item" onclick="useVerb('${v}')" title="Clic para empezar una subtarea con «${v}»"><b>${v}</b><span>${d}</span></button>`).join('')}</div>
      <div class="hint" style="margin-top:6px">Toca un verbo para empezar a escribir una subtarea con él.</div>
      <h4 style="margin:16px 0 6px">Subtarea o sub-subtarea</h4>
      <ul class="vb-tips"><li><b>Subtarea:</b> un paso completo del trabajo, con un solo verbo principal.</li><li><b>Sub-subtarea:</b> un detalle chico dentro de ese paso. Úsalas para agrupar y no llenar la lista.</li><li>Ejemplo: subtarea «<b>Diseñar</b> la propuesta» → sub-subtareas «<b>Recabar</b> referencias», «<b>Definir</b> la estructura», «<b>Validar</b> con dirección».</li><li>Evita verbos vagos como «ver», «trabajar en» o «checar»: no dicen cuándo termina.</li><li>Cada una necesita responsable, fecha, hora y cuánto tardará.</li></ul>
      <div class="wiz-actions"><span></span><button class="btn" onclick="closeVerbInfo()">Entendido</button></div>
    </div></div></div>`; }

/* ================== DEPENDENCIAS ENTRE SUBTAREAS ==================
   Regla única: la subtarea B «empieza cuando termina» la subtarea A (una sola, dentro de la misma tarea).
   Calendario laboral: lunes a viernes, 9:00 a 18:00 (comida y festivos se acomodan a mano).
   Al mover A, sus dependientes (B, C, C1…) siguen la regla; antes de aplicar se muestra una vista previa. */
const WK={s:9*60,e:18*60};
const toMin=t=>{ const m=/^(\d{1,2}):(\d{2})/.exec(t||''); return m?(+m[1])*60+(+m[2]):null; };
const fromMin=m=>String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0');
const isWork=d=>{ const w=isoWeekday(d); return w>=1&&w<=5; };
function nextWork(d){ while(!isWork(d)) d=addDaysISO(d,1); return d; }
function instCmp(a,b){ return a.d<b.d?-1:a.d>b.d?1:a.m-b.m; }
function wStart(i){ let d=i.d,m=i.m; if(!isWork(d)){ d=nextWork(d); m=WK.s; } if(m<WK.s) m=WK.s; if(m>=WK.e){ d=nextWork(addDaysISO(d,1)); m=WK.s; } return {d,m}; }
function wEnd(st,dur){ let {d,m}=wStart(st); let rem=Math.max(0,+dur||0); for(let g=0;g<400;g++){ const room=WK.e-m; if(rem<=room) return {d,m:m+rem}; rem-=room; d=nextWork(addDaysISO(d,1)); m=WK.s; } return {d,m}; }
const WK_BASE='2020-01-06';   // lunes
function wTotal(i){ const days=daysBetween(WK_BASE,i.d); const weeks=Math.floor(days/7), dow=((days%7)+7)%7; const L=WK.e-WK.s; const before=weeks*5+Math.min(dow,5); const within=dow<5?Math.min(Math.max(i.m-WK.s,0),L):0; return before*L+within; }
function wFrom(total){ const L=WK.e-WK.s; const w=Math.floor(total/L), rem=((total%L)+L)%L; const weeks=Math.floor(w/5), dw=((w%5)+5)%5; return {d:addDaysISO(WK_BASE,weeks*7+dw),m:WK.s+rem}; }
const wDiff=(a,b)=>wTotal(b)-wTotal(a);
const instStart=s=>({d:s.date,m:toMin(s.time)==null?WK.s:toMin(s.time)});
const instEnd=s=>wEnd(instStart(s),s.durMin||0);
const instLabel=i=>dLabel(i.d)+' '+fromMin(i.m);
function depKids(t,id){ return (t.subtasks||[]).filter(x=>x.dependsOn===id&&x.id!==id); }
function depWouldCycle(t,sid,predId){ let cur=predId,g=0; while(cur&&g++<200){ if(cur===sid) return true; const x=(t.subtasks||[]).find(y=>y.id===cur); cur=x&&x.dependsOn; } return false; }
function subFixed(s){ if(s.fija) return {why:'📌 fecha fija'}; const l=sesLast(s); if(l&&l.estado==='confirmado'&&!sesCanRespond(s)) return {why:'🔒 cita confirmada por el cliente'}; return null; }
/* Calcula qué cambia al aplicar `patch` a la subtarea s. mode: 'shift' (mover todas igual) | 'push' (solo las que se encimen) | 'none' */
function depPlan(t,s,patch,mode){
  const merged=Object.assign({},s,patch); let selfNote=null;
  const pred=merged.dependsOn?(t.subtasks||[]).find(x=>x.id===merged.dependsOn):null;
  if(pred&&merged.date){ const pe=instEnd(pred); const st=wStart(instStart(merged)); if(instCmp(st,pe)<0){ const ns=wStart(pe); merged.date=ns.d; merged.time=fromMin(ns.m); selfNote='Empieza cuando termina «'+pred.name+'» ('+instLabel(pe)+'): se acomoda a '+instLabel(ns)+'.'; } }
  const out={merged:{date:merged.date,time:merged.time},selfNote,delta:0,changes:[],conflicts:[]};
  if(!s.date||!merged.date) return out;
  const oldE=instEnd(s), newE=instEnd(merged); const delta=wDiff(oldE,newE); out.delta=delta;
  if(mode==='none'||!depKids(t,s.id).length) return out;
  const seen=new Set([s.id]); const q=[{id:s.id,oldE,newE,delta,name:s.name}];
  while(q.length){ const n=q.shift();
    depKids(t,n.id).forEach(D=>{ if(seen.has(D.id)) return; seen.add(D.id); if(!D.date) return;
      const fx=D.done?{why:'✔ ya está hecha'}:subFixed(D); const stD=wStart(instStart(D)); let ns=stD;
      if(mode==='shift'&&n.delta!==0) ns=wFrom(wTotal(stD)+n.delta);
      if(instCmp(ns,n.newE)<0) ns=wStart(n.newE);          // la regla siempre se respeta
      if(fx){ if(instCmp(stD,wStart(n.newE))<0) out.conflicts.push({id:D.id,name:D.name,why:fx.why+': no se mueve y queda antes de que termine «'+n.name+'»'}); else if(instCmp(ns,stD)!==0) out.conflicts.push({id:D.id,name:D.name,why:fx.why+': no se mueve'}); return; }
      if(instCmp(ns,stD)===0) return;
      const ne=wEnd(ns,D.durMin||0); const oe=wEnd(stD,D.durMin||0);
      out.changes.push({id:D.id,name:D.name,from:instLabel(stD),to:instLabel(ns),patch:{date:ns.d,time:D.time?fromMin(ns.m):D.time}});
      q.push({id:D.id,oldE:oe,newE:ne,delta:wDiff(oe,ne),name:D.name}); }); }
  return out; }
let depPrev=null;
/* Punto de entrada único para cambios de fecha/hora/duración/dependencia de una subtarea */
function depApply(tid,sid,patch,done){
  const t=store.task(tid); const s=t&&(t.subtasks||[]).find(x=>x.id===sid); const fin=()=>{ if(done) done(); };
  if(!s||!canSubDate()){ store.updateSubtask(tid,sid,patch); fin(); return; }
  const touches=['date','time','durMin','dependsOn'].some(k=>(k in patch)&&(patch[k]||'')!==(s[k]||''));
  if(!touches){ store.updateSubtask(tid,sid,patch); fin(); return; }
  const plan=depPlan(t,s,patch,'shift');
  if(!plan.selfNote&&!plan.changes.length&&!plan.conflicts.length){ store.updateSubtask(tid,sid,patch); fin(); return; }
  depPrev={tid,sid,patch,mode:'shift',done}; render(); }
function depSetMode(m){ if(depPrev){ depPrev.mode=m; render(); } }
function depCancel(){ depPrev=null; render(); }
function depConfirm(){ const d=depPrev; if(!d) return; const t=store.task(d.tid); const s=t.subtasks.find(x=>x.id===d.sid); const plan=depPlan(t,s,d.patch,d.mode);
  const full=Object.assign({},d.patch); if(plan.merged.date){ full.date=plan.merged.date; full.time=plan.merged.time; }
  depPrev=null; store.updateSubtask(d.tid,d.sid,full);
  plan.changes.forEach(c=>{ const sub=t.subtasks.find(x=>x.id===c.id); if(sub) Object.assign(sub,c.patch); });
  if(plan.changes.length){ store.save(); if(typeof dbSaveTask==='function') dbSaveTask(t); logEvent(d.tid,'Movió «'+s.name+'» y acomodó '+plan.changes.length+' subtarea(s) que dependen de ella'); }
  if(d.done) d.done(); else render(); }
function depPrevModal(){ const d=depPrev; const t=store.task(d.tid); const s=t&&(t.subtasks||[]).find(x=>x.id===d.sid); if(!s){ depPrev=null; return ''; }
  const plan=depPlan(t,s,d.patch,d.mode); const hasKids=depKids(t,s.id).length>0; const dl=plan.delta;
  const newI=plan.merged.date?{d:plan.merged.date,m:toMin(plan.merged.time)==null?WK.s:toMin(plan.merged.time)}:null;
  const opts=hasKids&&dl!==0?(dl>0?[['shift','Mover también todas las que dependen, el mismo tiempo'],['push','Empujar solo las que se encimen con ella'],['none','Mover solo esta (las demás se quedan)']]:[['shift','Adelantar también todas las que dependen, el mismo tiempo'],['none','Dejar las demás donde están']]):[];
  return `<div class="modal active" style="z-index:150" onclick="if(event.target===this)depCancel()"><div class="modal-card" style="max-width:560px"><div class="m-head"><div class="m-top"><h3 style="margin:0">⛓ Acomodar dependencias</h3><button class="x" onclick="depCancel()">×</button></div></div><div class="m-body">
    <div style="margin-bottom:10px"><b>${esc(s.name)}</b>${newI?`<div class="muted" style="font-size:.84rem">Queda: <b>${esc(instLabel(newI))}</b></div>`:''}</div>
    ${plan.selfNote?`<div class="ses-resp" style="background:#fff7e0;color:#7a5f00;margin-bottom:10px">${esc(plan.selfNote)}</div>`:''}
    ${opts.length?`<div class="field"><label>¿Qué hago con las que dependen de ella?</label>${opts.map(([k,l])=>`<label class="gf-opt" style="margin:4px 0"><input type="radio" name="dep-mode" ${d.mode===k?'checked':''} onchange="depSetMode('${k}')"> ${l}</label>`).join('')}</div>`:''}
    ${plan.changes.length?`<div class="field"><label>Se moverán ${plan.changes.length} subtarea(s)</label><div class="dep-list">${plan.changes.map(c=>`<div class="dep-row"><b>${esc(c.name)}</b><span>${esc(c.from)} → <b>${esc(c.to)}</b></span></div>`).join('')}</div></div>`:(opts.length?'<div class="muted">Con esta opción ninguna otra subtarea cambia.</div>':'')}
    ${plan.conflicts.length?`<div class="field"><label style="color:#c0392b">⚠️ No se mueven</label><div class="dep-list">${plan.conflicts.map(c=>`<div class="dep-row"><b>${esc(c.name)}</b><span>${esc(c.why)}</span></div>`).join('')}</div></div>`:''}
    <div class="wiz-actions"><button class="btn ghost" onclick="depCancel()">Cancelar</button><button class="btn" onclick="depConfirm()">Aplicar</button></div></div></div></div>`; }


/* ================== COPIAR TAREAS (solo Dirección y Gerencia) ==================
   Se elige tarea por tarea (y qué subtareas / sub-subtareas van). No se copian: frentes ni etapas (solo se elige dónde caen),
   responsables, equipo, horas del día, avance, tiempos ni comentarios. Sí se copian: sesiones (sin respuestas), reglas de repetición y dependencias. */
let copyS=null;
const COPY_KEY='nuwek_copy_batches';
function canCopy(){ return role==='gerencia'||role==='gerente'; }
function copyBatches(){ try{ return JSON.parse(localStorage.getItem(COPY_KEY)||'[]'); }catch(_){ return []; } }
function copySaveBatches(b){ try{ localStorage.setItem(COPY_KEY,JSON.stringify(b.slice(-15))); }catch(_){} }
function copySubsOf(t){ return (t.subtasks||[]).filter(x=>!x.seriesId); }
function openCopy(pid,tid){ if(!canCopy()) return; const p=store.project(pid); if(!p) return; copyS={pid,sel:{},destClient:p.clientId,destPid:pid,frenteId:'',etapaId:'',mode:'same',start:'',resp:false,result:null}; if(tid&&store.task(tid)){ const o={}; copySubsOf(store.task(tid)).forEach(x=>o[x.id]=true); copyS.sel[tid]=o; } render(); }
function closeCopy(){ copyS=null; render(); }
function copyTaskToggle(tid,on){ const t=store.task(tid); if(!t) return; if(on){ const o={}; copySubsOf(t).forEach(x=>o[x.id]=true); copyS.sel[tid]=o; } else delete copyS.sel[tid]; render(); }
function copySubToggle(tid,sid,on){ const t=store.task(tid); const o=copyS.sel[tid]; if(!t||!o) return; const subs=copySubsOf(t);
  const kids=id=>subs.filter(x=>x.parentId===id).flatMap(k=>[k.id,...kids(k.id)]);
  if(on){ o[sid]=true; let cur=subs.find(x=>x.id===sid); while(cur&&cur.parentId){ o[cur.parentId]=true; cur=subs.find(x=>x.id===cur.parentId); } }
  else { delete o[sid]; kids(sid).forEach(k=>delete o[k]); }
  render(); }
function copyAll(on){ const p=store.project(copyS.pid); copyS.sel={}; if(on) store.tasksOf(p.id).forEach(t=>{ const o={}; copySubsOf(t).forEach(x=>o[x.id]=true); copyS.sel[t.id]=o; }); render(); }
function copyEffFr(){ return !!copyS.copyFr&&!!copyS.destPid&&copyS.destPid!==copyS.pid; }
function copySet(k,v){ copyS[k]=v; if(k==='destClient'){ const ps=store.d.projects.filter(x=>x.clientId===v); copyS.destPid=ps[0]?ps[0].id:''; copyS.frenteId=''; copyS.etapaId=''; copyS.copyFr=!!copyS.destPid&&copyS.destPid!==copyS.pid&&store.frentesOf(copyS.destPid).length===0; }
  if(k==='destPid'){ copyS.frenteId=''; copyS.etapaId=''; copyS.copyFr=!!v&&v!==copyS.pid&&store.frentesOf(v).length===0; }
  if(k==='etapaId'||k==='mode'){ const e=store.etapasOf(copyS.destPid).find(x=>x.id===copyS.etapaId); if(e&&copyS.mode==='start') copyS.start=e.start; }
  render(); }
function copyWdn(d){ return Math.round(wTotal({d,m:WK.s})/(WK.e-WK.s)); }
function copyDateMapper(tasks,mode,start){
  if(mode==='same') return d=>d;
  if(mode==='none') return ()=>'';
  const all=[]; tasks.forEach(({t,subs})=>{ const sd=subs.map(x=>x.date).filter(Boolean); if(sd.length) all.push(...sd); else if(t.dueDate) all.push(t.dueDate); });
  if(!all.length) return d=>d; const ref=all.sort()[0]; const base=copyWdn(nextWork(start))-copyWdn(ref);
  return d=>d?wFrom((copyWdn(d)+base)*(WK.e-WK.s)).d:''; }
function copyBlocker(){ const pid=copyS.destPid; if(!pid) return 'Elige el proyecto al que se copiará.';
  const fr=store.frentesOf(pid), et=store.etapasOf(pid), p=store.project(pid);
  const needFr=!fr.length&&!copyEffFr();
  if(needFr||!et.length) return 'El proyecto «'+p.name+'» todavía no tiene '+(needFr&&!et.length?'frentes ni etapas':needFr?'frentes':'etapas')+'. Las etapas no se copian: créalas primero en ese proyecto (botón «+ Etapa»)'+(needFr?'; los frentes puedes crearlos con «+ Frente» o marcar «Copiar también los frentes»':'')+' y vuelve a intentar.'; return ''; }
function copyDo(){ const S=copyS; if(!S||!canCopy()) return; const blk=copyBlocker(); if(blk){ alert(blk); return; }
  const ids=Object.keys(S.sel); if(!ids.length){ alert('Marca al menos una tarea.'); return; }
  const effFr=copyEffFr(); if(!effFr&&!S.frenteId){ alert('Elige el frente donde caerán.'); return; }
  if(S.mode!=='same'&&!S.etapaId){ alert('Elige la etapa donde caerán.'); return; }
  if(S.mode==='start'&&!S.start){ alert('Escribe la fecha de inicio.'); return; }
  const dp=store.project(S.destPid), dc=store.client(dp.clientId), srcP=store.project(S.pid), sameClient=srcP.clientId===dp.clientId;
  const et=store.etapasOf(S.destPid).find(e=>e.id===S.etapaId);
  const createdFr=[]; const frFor=t=>{ if(!effFr) return S.frenteId; const src=store.frentesOf(S.pid).find(f=>f.id===t.frenteId); const nm=(src&&src.name)||'General'; const key=impNz(nm); let f=store.frentesOf(S.destPid).find(x=>impNz(x.name)===key); if(!f){ f=store.addFrente(S.destPid,nm,src&&src.color); createdFr.push(f.id); } return f.id; };
  const picked=ids.map(id=>{ const t=store.task(id); return {t,subs:copySubsOf(t).filter(x=>S.sel[id][x.id])}; }).filter(x=>x.t);
  const mapD=copyDateMapper(picked,S.mode,S.start); const now=new Date().toISOString(); const created=[]; const tok=()=>Math.random().toString(36).slice(2,8)+Math.random().toString(36).slice(2,8);
  picked.forEach(({t,subs})=>{
    const nt=JSON.parse(JSON.stringify(t)); const idMap={}; subs.forEach(x=>idMap[x.id]=uid('s_'));
    Object.assign(nt,{id:uid('t_'),projectId:S.destPid,frenteId:frFor(t),subtitle:dc.name,status:'to-do',responsibleId:S.resp?(t.responsibleId||''):'',nextId:null,repeatOf:undefined,
      dueDate:S.mode==='none'?(et?et.end:''):mapD(t.dueDate)});
    delete nt.ord; delete nt.impCode;
    nt.subtasks=subs.map(x=>{ const o=JSON.parse(JSON.stringify(x)); delete o.impCode;
      Object.assign(o,{id:idMap[x.id],parentId:x.parentId&&idMap[x.parentId]?idMap[x.parentId]:undefined,dependsOn:x.dependsOn&&idMap[x.dependsOn]?idMap[x.dependsOn]:undefined,
        done:false,doneAt:null,timeSpent:0,personId:S.resp?(x.personId||''):'',team:S.resp?(x.team||[]):[],teamInfo:{},teamAck:{},time:'',nextId:null,dateConflict:false,repeatOf:undefined,seriesId:undefined,occDate:undefined,
        invitados:sameClient?(x.invitados||[]):[],date:mapD(x.date)});
      if(S.resp&&(o.team||[]).length){ o.team.forEach(id=>{ o.teamInfo[id]={by:currentUser,ts:now}; }); }
      if(x.sesion){ const q=x.sesion; o.sesion={objetivo:q.objetivo||'',lugar:q.lugar,temario:q.temario||[]}; o.shareToken=tok(); } else delete o.shareToken;
      if(o.isSeries&&o.series){ o.series=Object.assign({},o.series,{startDate:mapD(o.series.startDate),skip:[]}); delete o.series.time; if(o.series.tpl){ o.series.tpl=Object.assign({},o.series.tpl,{personId:S.resp?(o.series.tpl.personId||''):'',team:S.resp?(o.series.tpl.team||[]):[],teamInfo:{},teamAck:{},time:'',invitados:sameClient?(o.series.tpl.invitados||[]):[]}); } }
      return o; });
    store.d.tasks.push(nt); created.push(nt); });
  store.save(); created.forEach(nt=>{ if(typeof dbSaveTask==='function') dbSaveTask(nt); });
  const batch={id:uid('cb_'),ts:now,by:currentUser,src:srcP.name,dest:dp.name,tids:created.map(x=>x.id),names:created.map(x=>x.name),resp:!!S.resp,frentes:createdFr};
  const b=copyBatches(); b.push(batch); copySaveBatches(b);
  created.forEach((nt,i)=>logEvent(nt.id,'Copiada desde «'+picked[i].t.name+'» del proyecto «'+srcP.name+'» a «'+dp.name+'» ('+nt.subtasks.length+' subtareas)'));
  S.result=batch; S.sel={}; render(); }
function copyUndo(bid){ const b=copyBatches(); const x=b.find(y=>y.id===bid); if(!x) return; if(!confirm('¿Deshacer esta copia? Se eliminarán las '+x.tids.length+' tarea(s) copiadas, con todo lo que se les haya agregado.')) return;
  x.tids.forEach(id=>{ if(store.task(id)) store.removeTask(id); }); (x.frentes||[]).forEach(fid=>{ if(!store.d.tasks.some(t=>t.frenteId===fid)) store.removeFrente(fid); }); copySaveBatches(b.filter(y=>y.id!==bid)); if(copyS&&copyS.result&&copyS.result.id===bid) copyS.result=null; render(); }
function copyModal(){ const S=copyS; const p=store.project(S.pid); if(!p){ copyS=null; return ''; }
  const tasks=store.tasksOf(p.id).slice().sort((a,b)=>(a.ord||0)-(b.ord||0)); const fr=store.frentesOf(p.id);
  const subRows=(t,o,parent,depth)=>copySubsOf(t).filter(x=>(x.parentId||'')===parent).map(x=>`<div class="cp-sub" style="margin-left:${depth*18}px"><label class="gf-opt"><input type="checkbox" ${o[x.id]?'checked':''} onchange="copySubToggle('${t.id}','${x.id}',this.checked)"> ${depth?'↳ ':''}${esc(x.name)}${x.sesion?' <span class="muted">· sesión</span>':''}${x.isSeries?' <span class="muted">↻</span>':''}</label></div>${subRows(t,o,x.id,depth+1)}`).join('');
  const list=tasks.map(t=>{ const o=S.sel[t.id]; const f=fr.find(z=>z.id===t.frenteId);
    return `<div class="cp-task"><label class="gf-opt"><input type="checkbox" ${o?'checked':''} onchange="copyTaskToggle('${t.id}',this.checked)"> <b>${esc(t.name)}</b> <span class="muted">${f?'· '+esc(f.name):''} · ${copySubsOf(t).length} subtareas</span></label>${o?subRows(t,o,'',1):''}</div>`; }).join('')||'<div class="muted">Este proyecto aún no tiene tareas.</div>';
  const dClients=store.d.clients.slice().sort((a,b)=>a.name.localeCompare(b.name)); const dProjs=store.d.projects.filter(x=>x.clientId===S.destClient);
  const dFr=store.frentesOf(S.destPid), dEt=store.etapasOf(S.destPid); const blk=copyBlocker();
  const recents=copyBatches().slice().reverse().slice(0,5);
  const n=Object.keys(S.sel).length; const ns=Object.values(S.sel).reduce((a,o)=>a+Object.keys(o).length,0);
  const body=S.result?`<div class="ses-resp" style="background:#e6f6ec;color:#1d6b3a">✅ Se copiaron <b>${S.result.tids.length}</b> tarea(s) de «${esc(S.result.src)}» a «${esc(S.result.dest)}»${(S.result.frentes||[]).length?` y se crearon <b>${S.result.frentes.length}</b> frente(s)`:''}. ${S.result.resp?'Se copiaron también los responsables; las horas del día se asignan en cada agenda.':'Quedaron sin responsables y sin horas: asígnalos en cada agenda.'}</div><div class="wiz-actions"><button class="btn ghost" onclick="copyUndo('${S.result.id}')">↩ Deshacer esta copia</button><button class="btn" onclick="closeCopy()">Listo</button></div>`
  :`<div class="field"><label>1. ¿Qué copiamos de «${esc(p.name)}»? <a class="muted" style="cursor:pointer;font-size:.78rem" onclick="copyAll(true)">todo</a> · <a class="muted" style="cursor:pointer;font-size:.78rem" onclick="copyAll(false)">nada</a></label><div class="cp-list">${list}</div></div>
    <div class="field"><label>2. ¿A dónde?</label><div class="row" style="display:flex;gap:8px;flex-wrap:wrap"><select onchange="copySet('destClient',this.value)">${dClients.map(c=>`<option value="${c.id}" ${c.id===S.destClient?'selected':''}>${esc(c.name)}</option>`).join('')}</select><select onchange="copySet('destPid',this.value)">${dProjs.map(x=>`<option value="${x.id}" ${x.id===S.destPid?'selected':''}>${esc(x.name)}</option>`).join('')}</select></div>
      ${blk?`<div class="ses-resp" style="background:#fdecea;color:#a3271a;margin-top:8px">⚠️ ${esc(blk)}</div>`:`${(S.destPid&&S.destPid!==S.pid)?`<div class="field" style="margin:8px 0 0"><label>¿Qué hacemos con los frentes?</label><label class="gf-opt" style="margin:3px 0"><input type="radio" name="cp-fr" ${copyEffFr()?'checked':''} onchange="copyS.copyFr=true;render()"> Copiar también los frentes de las tareas <span class="muted">(se crean los que no existan, con su nombre y color)</span></label><label class="gf-opt" style="margin:3px 0"><input type="radio" name="cp-fr" ${!copyEffFr()?'checked':''} onchange="copyS.copyFr=false;render()"> Elegir un frente que ya tenga el proyecto destino</label></div>`:''}<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px">${copyEffFr()?'':`<select onchange="copySet('frenteId',this.value)"><option value="">Frente…</option>${dFr.map(f=>`<option value="${f.id}" ${f.id===S.frenteId?'selected':''}>${esc(f.name)}</option>`).join('')}</select>`}${S.mode!=='same'?`<select onchange="copySet('etapaId',this.value)"><option value="">Etapa…</option>${dEt.map(e=>`<option value="${e.id}" ${e.id===S.etapaId?'selected':''}>${esc(e.name)}</option>`).join('')}</select>`:''}</div>`}</div>
    <div class="field"><label>3. Fechas</label>${[['same','Dejar las mismas fechas'],['start','Fecha nueva de inicio (respeta los días hábiles entre ellas)'],['none','Sin fechas (las pongo después)']].map(([k,l])=>`<label class="gf-opt" style="margin:3px 0"><input type="radio" name="cp-mode" ${S.mode===k?'checked':''} onchange="copySet('mode','${k}')"> ${l}</label>`).join('')}${S.mode==='start'?`<input type="date" value="${S.start}" onchange="copyS.start=this.value" style="margin-top:6px">`:''}<label class="gf-opt" style="margin-top:8px"><input type="checkbox" ${S.resp?'checked':''} onchange="copyS.resp=this.checked;render()"> Copiar también los <b>responsables</b> (y el equipo de cada subtarea)</label><div class="hint">${S.resp?'Se copia quién es responsable de cada tarea, subtarea y sub-subtarea, y el equipo que participa; a esas personas les llegará el aviso de participación.':'Sin marcar, las tareas quedan sin responsable para asignarlos en el proyecto nuevo.'} Las horas del día nunca se copian: dependen de cada agenda. Tampoco avance, tiempos ni comentarios.</div></div>
    ${recents.length?`<div class="field"><label>Copias recientes</label>${recents.map(b=>`<div class="dep-row"><b>${b.tids.length} tarea(s)</b><span>${esc(b.src)} → ${esc(b.dest)} · ${new Date(b.ts).toLocaleDateString('es-MX',{day:'numeric',month:'short'})} <a style="cursor:pointer;color:#c0392b" onclick="copyUndo('${b.id}')">deshacer</a></span></div>`).join('')}</div>`:''}
    <div class="wiz-actions"><span class="muted" style="margin-right:auto;font-size:.8rem">${n} tarea(s) · ${ns} subtarea(s)</span><button class="btn ghost" onclick="closeCopy()">Cancelar</button><button class="btn" onclick="copyDo()" ${blk||!n?'disabled':''}>Copiar</button></div>`;
  return `<div class="modal active" style="z-index:145" onclick="if(event.target===this)closeCopy()"><div class="modal-card" style="max-width:640px"><div class="m-head"><div class="m-top"><h3 style="margin:0">⧉ Copiar tareas</h3><button class="x" onclick="closeCopy()">×</button></div></div><div class="m-body">${body}</div></div></div>`; }


/* ================== IMPORTAR TAREAS (Gerencia y Dirección) ==================
   Paso 1: instrucciones, plantilla de Excel y texto para Claude (se arman con los frentes y personas del proyecto elegido). */
let impS=null;
const IMP_COLS=['codigo','nivel','padre','frente','nombre','descripcion','etiquetas','fecha','hora','duracion_min','responsable','depende_de','fecha_fija','urgente','cita_objetivo','cita_lugar','cita_link','cita_direccion','cita_temario','invitados'];
function canImport(){ return role==='gerencia'||role==='gerente'; }
function openImport(pid){ if(!canImport()) return; impS={pid:pid||'',step:1,rows:null}; view='importar'; modalTask=null; render(); }
function impBack(){ const pid=impS&&impS.pid; impS=null; if(pid&&store.project(pid)) openProject(pid); else go(role==='gerencia'?'catalogos':'clientes'); }
function impSetProject(v){ impS.pid=v; if(impS.rows) impValidate(); render(); }
function impCtx(){ const p=impS.pid?store.project(impS.pid):null; const c=p?store.client(p.clientId):null;
  const frentes=p?store.frentesOf(p.id).map(f=>f.name):[]; const staff=store.activeStaff().map(u=>u.name);
  const inv=c?(c.people||[]).map(x=>x.name).filter(Boolean):[];
  return {p,c,frentes,staff,inv,generic:!p}; }
function impDates(){ let d=nextWork(addDaysISO(todayISO(),1)); const out=[]; for(let i=0;i<8;i++){ out.push(d); d=nextWork(addDaysISO(d,1)); } return out; }
function impExampleRows(cx){ const f1=cx.frentes[0]||'Onboarding', f2=cx.frentes[1]||cx.frentes[0]||'Operación';
  const r1=cx.staff[0]||'Nombre Apellido', r2=cx.staff[1]||cx.staff[0]||'Nombre Apellido', iv=cx.inv[0]||'Contacto del cliente'; const D=impDates();
  const R=(o)=>IMP_COLS.map(k=>o[k]==null?'':o[k]);
  return [
    R({codigo:'T1',nivel:'Tarea',frente:f1,nombre:'Kit de bienvenida',descripcion:'Arranque operativo y accesos.',etiquetas:'Alta',fecha:D[5]}),
    R({codigo:'T1.1',nivel:'Subtarea',padre:'T1',nombre:'Brief interno',fecha:D[0],hora:'10:00',duracion_min:60,responsable:r1}),
    R({codigo:'T1.2',nivel:'Subtarea',padre:'T1',nombre:'Reunión de arranque con el cliente',fecha:D[1],hora:'11:00',duracion_min:60,responsable:r1,depende_de:'T1.1',urgente:'NO',cita_objetivo:'Presentar el plan y acordar accesos',cita_lugar:'videollamada',cita_link:'https://meet.google.com/xxx-xxxx-xxx',cita_temario:'Bienvenida; Alcance; Accesos; Dudas',invitados:iv}),
    R({codigo:'T1.2.1',nivel:'Subsubtarea',padre:'T1.2',nombre:'Preparar la presentación',fecha:D[0],duracion_min:90,responsable:r2}),
    R({codigo:'T1.3',nivel:'Subtarea',padre:'T1',nombre:'Enviar minuta (sin fecha: se calcula sola al terminar la reunión)',duracion_min:30,responsable:r1,depende_de:'T1.2'}),
    R({codigo:'T2',nivel:'Tarea',frente:f2,nombre:'Seguimiento semanal',descripcion:'Revisión con el cliente.',etiquetas:'Media',fecha:D[7]}),
    R({codigo:'T2.1',nivel:'Subtarea',padre:'T2',nombre:'Llamada de seguimiento',fecha:D[4],hora:'09:30',duracion_min:30,responsable:r2,fecha_fija:'SI',urgente:'SI'}),
  ]; }
function impInstructions(){ return [
  ['CÓMO LLENAR ESTA PLANTILLA'],[''],
  ['• Una fila por cada tarea, subtarea o sub-subtarea. Borra las filas de ejemplo y pon las tuyas en la hoja «Importar».'],
  ['• codigo: una clave corta y única que tú inventas (T1, T1.1, T1.1.1…). Sirve para unir las filas entre sí y, después, para actualizar sin duplicar. No la cambies entre versiones.'],
  ['• nivel: Tarea, Subtarea o Subsubtarea (nada más).'],
  ['• padre: el código de la fila que la contiene. Vacío en las tareas. Una subtarea apunta a una tarea; una sub-subtarea apunta a una subtarea.'],
  ['• frente: solo en las tareas. Si el frente ya existe en el proyecto debe escribirse igual; si no existe, se crea. Las subtareas heredan el frente de su tarea.'],
  ['• nombre: obligatorio. descripcion y etiquetas (separadas por ;) solo aplican a tareas.'],
  ['• fecha: AAAA-MM-DD. En las tareas es la fecha límite; en las subtareas, su día. Si la fila tiene depende_de, puede ir vacía y se calcula sola.'],
  ['• hora (opcional): HH:MM. duracion_min: minutos estimados.'],
  ['• responsable: nombre de una persona de Nuwek tal como aparece en la hoja «Listas». Si no coincide, la fila se importa sin responsable y con un aviso.'],
  ['• depende_de: código de UNA subtarea o sub-subtarea de la misma tarea que debe terminar antes. La regla es: esta empieza cuando termina aquella. Se respeta el calendario laboral (lunes a viernes, 9:00 a 18:00).'],
  ['• fecha_fija: SI si la fila no debe moverse cuando se acomoden dependencias (sesiones diarias a la misma hora, por ejemplo). urgente: SI/NO.'],
  ['• Sesión con el cliente (opcional): cita_objetivo, cita_lugar (videollamada o presencial), cita_link (si es videollamada), cita_direccion (si es presencial), cita_temario (puntos separados por ;) e invitados (personas del cliente separadas por ;).'],
  ['• Las reglas de repetición no se importan todavía.'],
  [''],['Al subir el archivo verás una vista previa donde puedes corregir todo antes de guardar.'] ]; }
function impLists(cx){ const n=Math.max(cx.frentes.length,cx.staff.length,cx.inv.length,2); const rows=[['Frentes del proyecto','Responsables (Nuwek)','Invitados del cliente','Lugar de la sesión']];
  const lug=['videollamada','presencial']; for(let i=0;i<n;i++) rows.push([cx.frentes[i]||'',cx.staff[i]||'',cx.inv[i]||'',lug[i]||'']); return rows; }
function impDownload(){ if(typeof XLSX==='undefined'){ alert('No se pudo cargar el generador de Excel. Revisa tu conexión a internet e inténtalo de nuevo.'); return; }
  const cx=impCtx(); const wb=XLSX.utils.book_new();
  const ws=XLSX.utils.aoa_to_sheet([IMP_COLS,...impExampleRows(cx)]); ws['!cols']=IMP_COLS.map(k=>({wch:({nombre:44,descripcion:30,cita_objetivo:30,cita_link:32,cita_temario:30,cita_direccion:24}[k])||14}));
  XLSX.utils.book_append_sheet(wb,ws,'Importar');
  const wi=XLSX.utils.aoa_to_sheet(impInstructions()); wi['!cols']=[{wch:130}]; XLSX.utils.book_append_sheet(wb,wi,'Instrucciones');
  const wl=XLSX.utils.aoa_to_sheet(impLists(cx)); wl['!cols']=[{wch:28},{wch:26},{wch:28},{wch:20}]; XLSX.utils.book_append_sheet(wb,wl,'Listas');
  const nm='Plantilla-importacion-'+(cx.p?cx.p.name.replace(/[^\wÁÉÍÓÚáéíóúñÑ-]+/g,'-'):'generica')+'.xlsx'; XLSX.writeFile(wb,nm); }
function impPrompt(){ const cx=impCtx(); const ex=impExampleRows(cx).map(r=>r.join(' | ')).join('\n');
  const ctx=cx.p?`Proyecto destino: «${cx.p.name}» del cliente «${cx.c.name}».
Frentes que ya existen (si una tarea cae en uno de estos, usa el nombre EXACTO; si no encaja en ninguno, propón un frente nuevo con nombre corto): ${cx.frentes.join(', ')||'(todavía no tiene frentes)'}.
Responsables posibles (usa el nombre EXACTO): ${cx.staff.join(', ')}.
Personas del cliente que pueden ser invitadas a sesiones (nombre EXACTO): ${cx.inv.join(', ')||'(ninguna registrada)'}.`
  :`No hay proyecto elegido todavía: usa nombres de frentes cortos y claros (por ejemplo Onboarding, Estrategia, Implementación, Medición) y escribe los responsables tal como vienen en mi archivo; los corregiré en el portal.`;
  return `Actúa como un asistente que ordena planes de trabajo. Te voy a dar mi Excel actual con tareas y subtareas. Conviértelo EXACTAMENTE al formato de importación del Portal Nuwek que describo abajo y entrégame el resultado como un archivo .xlsx (o CSV con comas y UTF-8) con UNA sola hoja y esta fila de encabezados, en este orden:

${IMP_COLS.join(',')}

${ctx}

REGLAS
1. Una fila por cada tarea, subtarea o sub-subtarea. Jerarquía de máximo 3 niveles: Tarea > Subtarea > Subsubtarea.
2. codigo: clave única y estable que tú asignas: T1, T2… para tareas; T1.1, T1.2… para subtareas; T1.1.1… para sub-subtareas. Respeta el orden de mi archivo.
3. nivel: solo «Tarea», «Subtarea» o «Subsubtarea». padre: el codigo de la fila que la contiene (vacío en tareas).
4. frente: solo en las tareas. Las subtareas lo heredan.
5. nombre: obligatorio, claro y empezando con un verbo en infinitivo (Recabar, Analizar, Proponer, Diseñar, Definir, Validar, Probar, Aprobar, Ajustar, Comunicar, Implementar, Evaluar, Entregar, Auditar).
6. descripcion y etiquetas (separadas por punto y coma) solo en tareas; etiquetas posibles: Alta, Media, Baja, En-proceso, Revisión.
7. fecha en formato AAAA-MM-DD (en tareas es la fecha límite; en subtareas, su día). hora en HH:MM, solo si la conozco. duracion_min en minutos (estima si no viene: 30, 60, 90 o 120).
8. Calendario laboral: lunes a viernes, de 9:00 a 18:00. No pongas fechas en fin de semana.
9. depende_de: el codigo de UNA sola subtarea o sub-subtarea de la MISMA tarea que debe terminar antes (la fila empieza cuando termina aquella). Proponlas cuando el orden sea lógico. Si una fila depende de otra y no tengo su fecha, deja la fecha vacía: el portal la calculará.
10. fecha_fija: SI únicamente para sesiones o actividades que ocurren a una fecha y hora exactas; en los demás casos déjalo vacío. urgente: SI solo si lo indico.
11. Si una fila es una sesión o reunión con el cliente, llena cita_objetivo, cita_lugar («videollamada» o «presencial»), cita_link (videollamada) o cita_direccion (presencial), cita_temario (puntos separados por punto y coma) e invitados (nombres separados por punto y coma). Si no, deja esas columnas vacías.
12. No inventes información que no esté en mi archivo (fechas, nombres, links). Si falta algo, deja la celda vacía.
13. Al final, escríbeme una lista corta de DUDAS o supuestos que tomaste (frentes que creaste, dependencias que propusiste, filas ambiguas) para corregirlos en el portal.

EJEMPLO DE FILAS (columnas separadas por « | »):
${IMP_COLS.join(' | ')}
${ex}

Ahora te adjunto mi Excel. Conviértelo.`; }
function impCopyPrompt(){ const t=impPrompt(); const done=()=>shareToast('📋 Texto copiado. Pégalo en Claude junto con tu Excel.'); if(navigator.clipboard&&navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(done,()=>impShowPrompt()); else impShowPrompt(); }
function impShowPrompt(){ impS.showPrompt=true; render(); }
/* ---------- Paso 2 y 3: subir, revisar y corregir en pantalla, importar ---------- */
const IMP_NIVEL={tarea:'Tarea',subtarea:'Subtarea',subsubtarea:'Subsubtarea'};
const impNz=v=>String(v==null?'':v).normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const IMP_ALIAS={duracion:'duracion_min',duracion_minutos:'duracion_min',minutos:'duracion_min',codigo_:'codigo',id:'codigo',tipo:'nivel',padre_codigo:'padre',tarea_padre:'padre',dependencia:'depende_de',depende:'depende_de',fija:'fecha_fija',fechafija:'fecha_fija',etiqueta:'etiquetas',tags:'etiquetas',invitado:'invitados',lugar:'cita_lugar',objetivo:'cita_objetivo',temario:'cita_temario',link:'cita_link',direccion:'cita_direccion'};
function impDateNorm(v){ v=String(v==null?'':v).trim(); if(!v) return ''; let m=/^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(v); if(m) return m[1]+'-'+m[2].padStart(2,'0')+'-'+m[3].padStart(2,'0');
  m=/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})/.exec(v); if(m){ let y=m[3].length===2?'20'+m[3]:m[3]; return y+'-'+m[2].padStart(2,'0')+'-'+m[1].padStart(2,'0'); } return v; }
function impTimeNorm(v){ v=String(v==null?'':v).trim(); if(!v) return ''; const m=/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(am|pm|a\. m\.|p\. m\.)?/i.exec(v); if(!m) return v; let h=+m[1]; const ap=(m[3]||'').toLowerCase(); if(ap.startsWith('p')&&h<12) h+=12; if(ap.startsWith('a')&&h===12) h=0; return String(h).padStart(2,'0')+':'+m[2]; }
const impYN=v=>{ const t=impNz(v); return ['si','s','yes','y','true','1','x'].includes(t)?'SI':'NO'; };
const impLevel=v=>{ const t=impNz(v).replace(/ /g,''); return IMP_NIVEL[t]||''; };
function impReadFile(inp){ const f=inp.files&&inp.files[0]; if(!f) return; if(typeof XLSX==='undefined'){ alert('No se pudo cargar el lector de Excel. Revisa tu conexión a internet.'); return; }
  const csv=/\.csv$/i.test(f.name); const fr=new FileReader();
  fr.onload=()=>{ try{ const wb=XLSX.read(fr.result,{type:csv?'string':'array',cellDates:true}); const nm=wb.SheetNames.find(n=>impNz(n)==='importar')||wb.SheetNames[0]; const ws=wb.Sheets[nm];
      const raw=XLSX.utils.sheet_to_json(ws,{header:1,raw:false,dateNF:'yyyy-mm-dd',defval:''}); impLoad(raw,f.name); }catch(e){ console.error(e); alert('No pude leer ese archivo. Revisa que sea un Excel (.xlsx) o un CSV.'); } inp.value=''; };
  if(csv) fr.readAsText(f); else fr.readAsArrayBuffer(f); }
function impLoad(raw,fname){ let hi=raw.findIndex(r=>r.some(c=>impNz(c)));
  if(hi<0){ alert('El archivo está vacío.'); return; }
  const heads=raw[hi].map(h=>{ let k=impNz(h).replace(/ /g,'_'); return IMP_ALIAS[k]||k; });
  const miss=['codigo','nivel','nombre'].filter(k=>!heads.includes(k)); if(miss.length){ alert('A tu archivo le faltan columnas obligatorias: '+miss.join(', ')+'.\n\nDescarga la plantilla para ver el formato.'); return; }
  const rows=[]; raw.slice(hi+1).forEach(r=>{ if(!r.some(c=>String(c).trim())) return; const o={}; IMP_COLS.forEach(k=>o[k]=''); heads.forEach((k,i)=>{ if(IMP_COLS.includes(k)) o[k]=String(r[i]==null?'':r[i]).trim(); });
    o.nivel=impLevel(o.nivel)||o.nivel; o.fecha=impDateNorm(o.fecha); o.hora=impTimeNorm(o.hora); o.fecha_fija=impYN(o.fecha_fija); o.urgente=impYN(o.urgente);
    o.n=++impSeq; rows.push(o); });
  if(!rows.length){ alert('No encontré filas con datos.'); return; }
  impS.rows=rows; impS.file=fname; impS.step=3; impS.view='tabla'; impS.onlyBad=false; impS.open={}; impS.result=null; render(); }
let impSeq=0;
function impByCode(){ const m={}; (impS.rows||[]).forEach(r=>{ if(r.codigo&&!m[r.codigo]) m[r.codigo]=r; }); return m; }
function impRoot(r,by){ let cur=r,g=0; while(cur&&cur.nivel!=='Tarea'&&g++<5) cur=by[cur.padre]; return cur&&cur.nivel==='Tarea'?cur:null; }
function impFindPerson(name){ const t=impNz(name); if(!t) return null; const st=store.activeStaff(); let u=st.find(x=>impNz(x.name)===t||impNz(fullName(x))===t); if(u) return u;
  const c=st.filter(x=>impNz(fullName(x)).startsWith(t+' ')||impNz(x.name).split(' ')[0]===t); return c.length===1?c[0]:null; }
function impFindClientPerson(name){ const cx=impCtx(); const t=impNz(name); return cx.c?(cx.c.people||[]).find(x=>impNz(x.name)===t)||null:null; }
function impFindFrente(name){ const t=impNz(name); return t?store.frentesOf(impS.pid).find(f=>impNz(f.name)===t)||null:null; }
function impValidate(){ const rows=impS.rows, by=impByCode(); const E={}, W={}, bad=(o,n,f,m)=>{ (o[n]=o[n]||{})[f]=m; };
  const seen={}; const cnt={}; rows.forEach(r=>{ cnt[r.codigo]=(cnt[r.codigo]||0)+1; });
  rows.forEach(r=>{ const n=r.n;
    if(!r.nombre) bad(E,n,'nombre','Falta el nombre');
    if(!r.codigo) bad(E,n,'codigo','Falta el código'); else if(cnt[r.codigo]>1) bad(E,n,'codigo','Código repetido');
    if(!IMP_NIVEL[impNz(r.nivel).replace(/ /g,'')]) bad(E,n,'nivel','Nivel inválido: usa Tarea, Subtarea o Subsubtarea');
    else {
      if(r.nivel==='Tarea'){ if(r.padre) bad(W,n,'padre','Una tarea no lleva padre (se ignora)'); if(!r.frente) bad(E,n,'frente','Falta el frente de la tarea'); else if(!impFindFrente(r.frente)) bad(W,n,'frente','Frente nuevo: se creará'); }
      else { const pa=by[r.padre]; const need=r.nivel==='Subtarea'?'Tarea':'Subtarea';
        if(!r.padre) bad(E,n,'padre','Falta el padre'); else if(!pa) bad(E,n,'padre','El código «'+r.padre+'» no existe'); else if(pa.nivel!==need) bad(E,n,'padre','El padre debe ser una '+need.toLowerCase());
        else if(!impRoot(r,by)) bad(E,n,'padre','No llega a ninguna tarea'); }
    }
    if(r.fecha&&!/^\d{4}-\d{2}-\d{2}$/.test(r.fecha)) bad(E,n,'fecha','Fecha inválida (AAAA-MM-DD)'); else if(r.fecha&&!isWork(r.fecha)) bad(W,n,'fecha','Cae en fin de semana');
    if(r.hora&&!/^\d{2}:\d{2}$/.test(r.hora)) bad(E,n,'hora','Hora inválida (HH:MM)');
    if(r.duracion_min&&!(+r.duracion_min>0)) bad(E,n,'duracion_min','Debe ser un número de minutos');
    if(r.responsable&&!impFindPerson(r.responsable)) bad(W,n,'responsable','No encontrado: se importa sin responsable');
    if(r.nivel!=='Tarea'&&r.nivel){ if(!r.fecha&&!r.depende_de) bad(W,n,'fecha','Sin fecha: tomará la fecha límite de la tarea'); }
    if(r.depende_de){ const d=by[r.depende_de];
      if(r.nivel==='Tarea') bad(E,n,'depende_de','Las tareas no tienen dependencia');
      else if(!d) bad(E,n,'depende_de','El código «'+r.depende_de+'» no existe');
      else if(d===r) bad(E,n,'depende_de','No puede depender de sí misma');
      else if(d.nivel==='Tarea') bad(E,n,'depende_de','Debe ser una subtarea o sub-subtarea');
      else if(impRoot(d,by)!==impRoot(r,by)) bad(E,n,'depende_de','Debe ser de la misma tarea');
      else { let cur=d,g=0; while(cur&&cur.depende_de&&g++<60){ cur=by[cur.depende_de]; if(cur===r){ bad(E,n,'depende_de','Dependencia circular'); break; } } } }
    const hasC=r.cita_objetivo||r.cita_link||r.cita_direccion||r.cita_temario||r.invitados;
    if(hasC&&r.nivel==='Tarea') bad(W,n,'cita_objetivo','La sesión solo aplica a subtareas (se ignora)');
    if(r.cita_lugar&&!['videollamada','presencial','meet'].includes(impNz(r.cita_lugar))) bad(W,n,'cita_lugar','Usa videollamada o presencial');
    if(r.invitados){ const miss=r.invitados.split(';').map(x=>x.trim()).filter(x=>x&&!impFindClientPerson(x)); if(miss.length) bad(W,n,'invitados','No encontrados en el cliente: '+miss.join(', ')); }
  });
  // fechas calculadas y choques con dependencias
  const calc={}; const inst=(r)=>{ const d=r.fecha||(calc[r.n]&&calc[r.n].fecha); if(!d) return null; const t=r.fecha?r.hora:(calc[r.n]&&calc[r.n].hora)||''; return {d,m:toMin(t)==null?WK.s:toMin(t)}; };
  for(let pass=0;pass<30;pass++){ let ch=false; rows.forEach(r=>{ if(E[r.n]&&E[r.n].depende_de) return; const d=r.depende_de&&r.nivel!=='Tarea'?by[r.depende_de]:null; if(!d||r.fecha) return; const pi=inst(d); if(!pi) return;
      const st=wStart(wEnd(pi,+d.duracion_min||0)); const c=calc[r.n]; if(!c||c.fecha!==st.d||c.hora!==fromMin(st.m)){ calc[r.n]={fecha:st.d,hora:fromMin(st.m)}; ch=true; } }); if(!ch) break; }
  rows.forEach(r=>{ if(E[r.n]&&E[r.n].depende_de) return; const d=r.depende_de&&r.nivel!=='Tarea'?by[r.depende_de]:null; if(!d||!r.fecha) return; const pi=inst(d); if(!pi) return; const pe=wEnd(pi,+d.duracion_min||0); const si=wStart({d:r.fecha,m:toMin(r.hora)==null?WK.s:toMin(r.hora)});
    if(instCmp(si,pe)<0) bad(W,r.n,'fecha','Empieza antes de que termine «'+d.nombre+'» ('+instLabel(pe)+')'); });
  rows.forEach(r=>{ if(calc[r.n]&&W[r.n]&&W[r.n].fecha&&/Sin fecha/.test(W[r.n].fecha)) delete W[r.n].fecha; });
  impS.E=E; impS.W=W; impS.calc=calc; }
function impCounts(){ const E=impS.E||{},W=impS.W||{}; const c={t:0,s:0,ss:0,e:0,w:0,rowsE:0,newF:new Set()}; impS.rows.forEach(r=>{ if(r.nivel==='Tarea'){ c.t++; if(r.frente&&!impFindFrente(r.frente)) c.newF.add(impNz(r.frente)); } else if(r.nivel==='Subtarea') c.s++; else if(r.nivel==='Subsubtarea') c.ss++; if(E[r.n]){ c.e+=Object.keys(E[r.n]).length; c.rowsE++; } if(W[r.n]) c.w+=Object.keys(W[r.n]).length; }); return c; }
function impSet(n,f,v){ const r=impS.rows.find(x=>x.n===n); if(!r) return; if(f==='fecha_fija'||f==='urgente') v=v?'SI':'NO'; if(f==='fecha') v=impDateNorm(v); if(f==='hora') v=impTimeNorm(v); if(f==='nivel'&&v==='Tarea'){ r.padre=''; r.depende_de=''; }
  if(f==='codigo'&&v&&v!==r.codigo){ const old=r.codigo; impS.rows.forEach(x=>{ if(x.padre===old) x.padre=v; if(x.depende_de===old) x.depende_de=v; }); }
  r[f]=(f==='fecha_fija'||f==='urgente')?v:String(v==null?'':v).trim(); impRender(); }
function impRender(){ impValidate(); renderKeepScroll(); }
function impDelRow(n){ if(!confirm('¿Quitar esta fila del archivo? Las filas que cuelgan de ella quedarán marcadas con error.')) return; impS.rows=impS.rows.filter(r=>r.n!==n); impRender(); }
function impAddRow(){ const o={}; IMP_COLS.forEach(k=>o[k]=''); Object.assign(o,{n:++impSeq,nivel:'Subtarea',fecha_fija:'NO',urgente:'NO',codigo:'N'+impSeq}); impS.rows.push(o); impS.open[o.n]=true; impRender(); }
function impToggle(n){ impS.open[n]=!impS.open[n]; renderKeepScroll(); }
function impSetView(v){ impS.view=v; render(); }
function impOnlyBad(v){ impS.onlyBad=v; render(); }
function impAcomodar(){ const by=impByCode(); let moved=0; for(let pass=0;pass<30;pass++){ let ch=false; impS.rows.forEach(r=>{ if(r.fecha_fija==='SI'||r.nivel==='Tarea'||!r.depende_de) return; if(impS.E[r.n]&&impS.E[r.n].depende_de) return; const d=by[r.depende_de]; if(!d||!d.fecha) return;
      const pe=wEnd({d:d.fecha,m:toMin(d.hora)==null?WK.s:toMin(d.hora)},+d.duracion_min||0); const si=wStart({d:r.fecha||pe.d,m:r.fecha?(toMin(r.hora)==null?WK.s:toMin(r.hora)):pe.m});
      if(!r.fecha||instCmp(si,pe)<0){ const st=wStart(pe); r.fecha=st.d; r.hora=fromMin(st.m); ch=true; moved++; } }); if(!ch) break; }
  impRender(); shareToast(moved?'⛓ Se acomodaron '+moved+' fila(s) según sus dependencias.':'No había nada que acomodar.'); }
function impExport(){ if(typeof XLSX==='undefined'){ alert('No se pudo cargar el generador de Excel. Revisa tu conexión a internet.'); return; } impValidate();
  const rows=impS.rows.map(r=>IMP_COLS.map(k=>{ let v=r[k]; if(!v&&(k==='fecha'||k==='hora')&&impS.calc[r.n]) v=impS.calc[r.n][k]; if((k==='fecha_fija'||k==='urgente')&&v==='NO') v=''; return v==null?'':v; }));
  const wb=XLSX.utils.book_new(); const ws=XLSX.utils.aoa_to_sheet([IMP_COLS,...rows]); ws['!cols']=IMP_COLS.map(k=>({wch:({nombre:44,descripcion:30,cita_objetivo:30,cita_link:32,cita_temario:30,cita_direccion:24}[k])||14})); XLSX.utils.book_append_sheet(wb,ws,'Importar');
  const base=(impS.file||'importacion').replace(/\.[^.]+$/,''); XLSX.writeFile(wb,base+'-corregido.xlsx'); }
function impReset(){ if(impS.rows&&!confirm('Se descarta lo que llevas en pantalla. ¿Seguir?')) return; impS.rows=null; impS.step=1; impS.result=null; render(); }
function impBatches(){ try{ return JSON.parse(localStorage.getItem('nuwek_imp_batches')||'[]'); }catch(_){ return []; } }
function impSaveBatches(b){ try{ localStorage.setItem('nuwek_imp_batches',JSON.stringify(b.slice(-15))); }catch(_){} }
function impDo(){ if(!impS||!canImport()) return; impValidate(); const cnt=impCounts(); if(cnt.e){ alert('Aún hay '+cnt.e+' error(es) en rojo. Corrígelos o quita esas filas.'); return; }
  const p=store.project(impS.pid); if(!p){ alert('Elige el proyecto de destino.'); return; } const c=store.client(p.clientId); const by=impByCode(); const now=new Date().toISOString();
  const newFrentes=[]; const frId={}; impS.rows.filter(r=>r.nivel==='Tarea').forEach(r=>{ const k=impNz(r.frente); if(frId[k]) return; const ex=impFindFrente(r.frente); if(ex) frId[k]=ex.id; else { const f=store.addFrente(p.id,r.frente.trim()); frId[k]=f.id; newFrentes.push(f.id); } });
  (impS.rows.flatMap(r=>r.nivel==='Tarea'&&r.etiquetas?r.etiquetas.split(';').map(x=>x.trim()).filter(Boolean):[])).forEach(tg=>{ if(!(store.d.tags||[]).some(t=>impNz(t.name)===impNz(tg))) store.addTag(tg); });
  const tagName=tg=>{ const t=(store.d.tags||[]).find(x=>impNz(x.name)===impNz(tg)); return t?t.name:tg; };
  const tok=()=>Math.random().toString(36).slice(2,8)+Math.random().toString(36).slice(2,8); const created=[]; const idOf={};
  impS.rows.forEach(r=>{ idOf[r.n]=uid(r.nivel==='Tarea'?'t_':'s_'); });
  const dateOf=r=>r.fecha||(impS.calc[r.n]&&impS.calc[r.n].fecha)||''; const timeOf=r=>r.fecha?r.hora:((impS.calc[r.n]&&impS.calc[r.n].hora)||'');
  impS.rows.filter(r=>r.nivel==='Tarea').forEach(tr=>{ const kids=impS.rows.filter(x=>x.nivel!=='Tarea'&&impRoot(x,by)===tr);
    const dates=kids.map(dateOf).filter(Boolean).sort(); const due=tr.fecha||(dates.length?dates[dates.length-1]:p.startDate);
    const resp={}; kids.forEach(k=>{ const u=impFindPerson(k.responsable); if(u) resp[u.id]=(resp[u.id]||0)+1; }); const top=Object.keys(resp).sort((a,b)=>resp[b]-resp[a])[0]||'';
    const tid=idOf[tr.n]; const subs=kids.map(k=>{ const u=impFindPerson(k.responsable); const inv=(k.invitados||'').split(';').map(x=>impFindClientPerson(x.trim())).filter(Boolean).map(x=>x.id);
      const o={id:idOf[k.n],name:k.nombre,personId:u?u.id:'',date:dateOf(k)||due,time:timeOf(k)||'',durMin:+k.duracion_min||null,invitados:inv,done:false,timeSpent:0,links:[],team:[],teamInfo:{},teamAck:{},impCode:k.codigo};
      if(k.nivel==='Subsubtarea') o.parentId=idOf[by[k.padre].n]; if(k.depende_de) o.dependsOn=idOf[by[k.depende_de].n]; if(k.fecha_fija==='SI') o.fija=true; if(k.urgente==='SI') o.urgent=true;
      if(k.cita_objetivo||k.cita_link||k.cita_direccion||k.cita_temario){ const pres=impNz(k.cita_lugar)==='presencial'||(!k.cita_link&&k.cita_direccion);
        o.sesion={objetivo:k.cita_objetivo,lugar:{tipo:pres?'presencial':'meet',link:k.cita_link,direccion:k.cita_direccion},temario:(k.cita_temario||'').split(';').map(x=>x.trim()).filter(Boolean).map(t=>({id:'tm_'+Math.random().toString(36).slice(2,8),titulo:t,por:'nuwek',personId:'',by:currentUser,ts:now}))}; o.shareToken=tok(); }
      return o; });
    const nt={id:tid,projectId:p.id,frenteId:frId[impNz(tr.frente)],name:tr.nombre,subtitle:c.name,description:tr.descripcion||'',tags:(tr.etiquetas||'').split(';').map(x=>x.trim()).filter(Boolean).map(tagName),workLink:'',deliverables:[],responsibleId:top,status:'to-do',dueDate:due,viaticos:0,urgente:tr.urgente==='SI',subtasks:subs,links:[],impCode:tr.codigo};
    store.d.tasks.push(nt); created.push(nt); });
  store.save(); created.forEach(nt=>{ if(typeof dbSaveTask==='function') dbSaveTask(nt); });
  const batch={id:uid('ib_'),ts:now,by:currentUser,file:impS.file,dest:p.name,pid:p.id,tids:created.map(x=>x.id),frentes:newFrentes,subs:created.reduce((a,t)=>a+t.subtasks.length,0)};
  const b=impBatches(); b.push(batch); impSaveBatches(b);
  created.forEach(nt=>logEvent(nt.id,'Importada desde Excel «'+impS.file+'» al proyecto «'+p.name+'» ('+nt.subtasks.length+' subtareas)'));
  impS.result=batch; impS.step=4; impS.rows=null; render(); }
function impUndo(bid){ const b=impBatches(); const x=b.find(y=>y.id===bid); if(!x) return; if(!confirm('¿Deshacer esta importación? Se eliminarán las '+x.tids.length+' tarea(s) importadas (con sus subtareas) y los frentes que se crearon si quedan vacíos.')) return;
  x.tids.forEach(id=>{ if(store.task(id)) store.removeTask(id); }); (x.frentes||[]).forEach(fid=>{ if(!store.d.tasks.some(t=>t.frenteId===fid)) store.removeFrente(fid); });
  impSaveBatches(b.filter(y=>y.id!==bid)); if(impS&&impS.result&&impS.result.id===bid){ impS.result=null; impS.step=1; } render(); }
function impCell(r,f,html){ const e=impS.E[r.n]&&impS.E[r.n][f], w=impS.W[r.n]&&impS.W[r.n][f]; return `<td class="${e?'imp-e':w?'imp-w':''}" title="${esc(e||w||'')}">${html}</td>`; }
function impInp(r,f,type,w){ return `<input type="${type||'text'}" value="${esc(r[f])}" style="width:${w||100}px" onchange="impSet(${r.n},'${f}',this.value)">`; }
function impSel(r,f,opts,w,blank){ let o=opts.slice(); if(r[f]&&!o.some(x=>x[0]===r[f])) o.push([r[f],r[f]+' ⚠']); return `<select style="max-width:${w||130}px" onchange="impSet(${r.n},'${f}',this.value)"><option value="">${blank||'—'}</option>${o.map(x=>`<option value="${esc(x[0])}" ${x[0]===r[f]?'selected':''}>${esc(x[1])}</option>`).join('')}</select>`; }
function impTable(){ const rows=impS.rows, by=impByCode(); const staff=store.activeStaff().map(u=>[u.name,u.name]); const fr=store.frentesOf(impS.pid).map(f=>[f.name,f.name]);
  const newF=[...new Set(rows.filter(r=>r.nivel==='Tarea'&&r.frente&&!impFindFrente(r.frente)).map(r=>r.frente))].map(x=>[x,'✚ '+x+' (nuevo)']);
  const list=impS.onlyBad?rows.filter(r=>(impS.E[r.n]&&Object.keys(impS.E[r.n]).length)||(impS.W[r.n]&&Object.keys(impS.W[r.n]).length)):rows;
  const head=['','Código','Nivel','Padre','Frente','Nombre','Fecha','Hora','Min','Responsable','Depende de','Fija','Urg.',''].map(h=>`<th>${h}</th>`).join('');
  const body=list.map(r=>{ const e=impS.E[r.n]&&Object.keys(impS.E[r.n]).length, w=impS.W[r.n]&&Object.keys(impS.W[r.n]).length; const calc=impS.calc[r.n]; const open=impS.open[r.n];
    const parents=rows.filter(x=>x.nivel===(r.nivel==='Subsubtarea'?'Subtarea':'Tarea')&&x!==r).map(x=>[x.codigo,x.codigo+' · '+x.nombre.slice(0,24)]);
    const root=impRoot(r,by); const deps=rows.filter(x=>x!==r&&x.nivel!=='Tarea'&&root&&impRoot(x,by)===root).map(x=>[x.codigo,x.codigo+' · '+x.nombre.slice(0,22)]);
    const main=`<tr class="${e?'imp-rowe':w?'imp-roww':''} ${r.nivel==='Tarea'?'imp-rowt':''}"><td><span class="imp-ic">${e?'⛔':w?'⚠️':'✅'}</span> <a class="imp-tg" onclick="impToggle(${r.n})">${open?'▾':'▸'}</a></td>
      ${impCell(r,'codigo',impInp(r,'codigo','text',70))}${impCell(r,'nivel',impSel(r,'nivel',[['Tarea','Tarea'],['Subtarea','Subtarea'],['Subsubtarea','Subsubtarea']],110,'Nivel…'))}
      ${impCell(r,'padre',r.nivel==='Tarea'?'<span class="muted">—</span>':impSel(r,'padre',parents,130,'Padre…'))}${impCell(r,'frente',r.nivel==='Tarea'?impSel(r,'frente',[...fr,...newF],130,'Frente…'):'<span class="muted">hereda</span>')}
      ${impCell(r,'nombre',impInp(r,'nombre','text',230))}
      ${impCell(r,'fecha',`<input type="date" value="${esc(/^\d{4}-\d{2}-\d{2}$/.test(r.fecha)?r.fecha:'')}" onchange="impSet(${r.n},'fecha',this.value)">${calc&&!r.fecha?`<div class="imp-calc" title="Se calcula sola con la dependencia">⛓ ${esc(dLabel(calc.fecha))} ${calc.hora}</div>`:''}${r.fecha&&!/^\d{4}-\d{2}-\d{2}$/.test(r.fecha)?`<div class="imp-calc" style="color:#c0392b">${esc(r.fecha)}</div>`:''}`)}
      ${impCell(r,'hora',impInp(r,'hora','time',84))}${impCell(r,'duracion_min',impInp(r,'duracion_min','number',60))}
      ${impCell(r,'responsable',impSel(r,'responsable',staff,120,'Sin asignar'))}${impCell(r,'depende_de',r.nivel==='Tarea'?'<span class="muted">—</span>':impSel(r,'depende_de',deps,130,'Ninguna'))}
      <td><input type="checkbox" ${r.fecha_fija==='SI'?'checked':''} onchange="impSet(${r.n},'fecha_fija',this.checked)"></td><td><input type="checkbox" ${r.urgente==='SI'?'checked':''} onchange="impSet(${r.n},'urgente',this.checked)"></td>
      <td><a class="imp-del" title="Quitar fila" onclick="impDelRow(${r.n})">🗑</a></td></tr>`;
    const msgs=[...Object.entries(impS.E[r.n]||{}).map(([k,m])=>`<span class="imp-m e">⛔ ${esc(m)}</span>`),...Object.entries(impS.W[r.n]||{}).map(([k,m])=>`<span class="imp-m w">⚠️ ${esc(m)}</span>`)].join('');
    const det=(msgs||open)?`<tr class="imp-det"><td></td><td colspan="13">${msgs}${open?`<div class="imp-extra"><label>Descripción${impInp(r,'descripcion','text',220)}</label><label>Etiquetas (;)${impInp(r,'etiquetas','text',140)}</label><label>Sesión · objetivo${impInp(r,'cita_objetivo','text',200)}</label><label>Lugar${impSel(r,'cita_lugar',[['videollamada','videollamada'],['presencial','presencial']],110,'—')}</label><label>Link${impInp(r,'cita_link','text',170)}</label><label>Dirección${impInp(r,'cita_direccion','text',150)}</label><label>Temario (;)${impInp(r,'cita_temario','text',200)}</label><label>Invitados (;)${impInp(r,'invitados','text',160)}</label></div>`:''}</td></tr>`:'';
    return main+det; }).join('');
  return `<div class="imp-wrap"><table class="imp-tbl"><thead><tr>${head}</tr></thead><tbody>${body||'<tr><td colspan="14" class="muted" style="padding:16px">Sin filas que mostrar.</td></tr>'}</tbody></table></div>`; }
function impTree(){ const rows=impS.rows, by=impByCode(); const flag=r=>(impS.E[r.n]&&Object.keys(impS.E[r.n]).length)?'⛔':(impS.W[r.n]&&Object.keys(impS.W[r.n]).length)?'⚠️':'';
  const line=(r,d)=>{ const dep=r.depende_de&&by[r.depende_de]?` <span class="muted">⛓ tras «${esc(by[r.depende_de].nombre)}»</span>`:''; const cal=impS.calc[r.n]; const dt=r.fecha||(cal&&cal.fecha); const msg=[...Object.values(impS.E[r.n]||{}),...Object.values(impS.W[r.n]||{})].join(' · ');
    return `<div class="imp-tr" style="margin-left:${d*22}px" title="${esc(msg)}">${flag(r)} <b>${esc(r.codigo)}</b> ${esc(r.nombre||'(sin nombre)')}${dt?` <span class="muted">· ${esc(dLabel(dt))}${(r.fecha?r.hora:cal&&cal.hora)?' '+(r.fecha?r.hora:cal.hora):''}</span>`:''}${r.responsable?` <span class="muted">· ${esc(r.responsable)}</span>`:''}${r.fecha_fija==='SI'?' 📌':''}${dep}${r.cita_objetivo?' 📅':''}</div>`; };
  const kids=(r,d)=>rows.filter(x=>x.padre===r.codigo&&x.nivel===(r.nivel==='Tarea'?'Subtarea':'Subsubtarea')).map(x=>line(x,d)+kids(x,d+1)).join('');
  const orphans=rows.filter(r=>r.nivel!=='Tarea'&&!impRoot(r,by)); const fs={}; rows.filter(r=>r.nivel==='Tarea').forEach(r=>{ (fs[r.frente||'(sin frente)']=fs[r.frente||'(sin frente)']||[]).push(r); });
  return `<div class="imp-treewrap">${Object.entries(fs).map(([f,list])=>`<div class="imp-fr">${esc(f)}${impFindFrente(f)||f==='(sin frente)'?'':' <span class="pill yellow">nuevo</span>'}</div>${list.map(t=>line(t,0)+kids(t,1)).join('')}`).join('')}${orphans.length?`<div class="imp-fr" style="color:#c0392b">Filas sin tarea</div>${orphans.map(o=>line(o,0)).join('')}`:''}</div>`; }
function impPreview(){ impValidate(); const c=impCounts(); const p=store.project(impS.pid); const ok=!c.e;
  return `<div class="card imp-card"><div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:center"><div><h3 style="margin:0">3 · Revisa y corrige</h3><div class="muted" style="font-size:.82rem">${esc(impS.file)} → <b>${esc(p?p.name:'(sin proyecto)')}</b></div></div>
      <div class="imp-sum"><span><b>${c.t}</b> tareas</span><span><b>${c.s}</b> subtareas</span><span><b>${c.ss}</b> sub-subtareas</span>${c.newF.size?`<span>✚ <b>${c.newF.size}</b> frente(s) nuevo(s)</span>`:''}<span class="${c.e?'imp-bad':'imp-good'}">⛔ <b>${c.e}</b> errores</span><span>⚠️ <b>${c.w}</b> avisos</span></div></div>
    <div class="imp-bar"><div class="subtoggle sm"><button class="${impS.view==='tabla'?'on':''}" onclick="impSetView('tabla')">Tabla</button><button class="${impS.view==='arbol'?'on':''}" onclick="impSetView('arbol')">Árbol</button></div>
      <label class="gf-opt"><input type="checkbox" ${impS.onlyBad?'checked':''} onchange="impOnlyBad(this.checked)"> Solo filas con problemas</label>
      <button class="btn ghost sm" onclick="impAcomodar()" title="Acomoda las fechas de las filas que empiezan antes de que termine su dependencia (calendario laboral)">⛓ Acomodar según dependencias</button><button class="btn ghost sm" onclick="impAddRow()">+ Fila</button><button class="btn ghost sm" title="Descarga un Excel con todo lo que llevas corregido en pantalla" onclick="impExport()">⬇ Descargar Excel corregido</button></div>
    ${impS.view==='arbol'?impTree():impTable()}
    <div class="hint" style="margin-top:8px">Cambia cualquier celda: se vuelve a revisar al instante. Pulsa ▸ en una fila para editar descripción, etiquetas y sesión con cliente. Los frentes nuevos se crean al importar.</div>
    <div class="wiz-actions"><button class="btn ghost" onclick="impReset()">← Elegir otro archivo</button><button class="btn" onclick="impDo()" ${ok&&impS.pid?'':'disabled'}>${ok?(impS.pid?'Importar '+c.t+' tarea(s)':'Elige proyecto'):'Corrige los errores para importar'}</button></div></div>`; }
function impDone(){ const r=impS.result; return `<div class="card imp-card"><div class="ses-resp" style="background:#e6f6ec;color:#1d6b3a">✅ Se importaron <b>${r.tids.length}</b> tarea(s) con <b>${r.subs}</b> subtarea(s) a «${esc(r.dest)}»${(r.frentes||[]).length?` y se crearon ${r.frentes.length} frente(s)`:''}. Lo que no traía responsable quedó sin asignar: revísalo en la agenda.</div>
    <div class="wiz-actions"><button class="btn ghost" onclick="impUndo('${r.id}')">↩ Deshacer esta importación</button><button class="btn ghost" onclick="impS.step=1;impS.result=null;render()">Importar otro archivo</button><button class="btn" onclick="openProject('${r.pid}')">Ver el proyecto</button></div></div>`; }

function viewImportar(){ if(!impS){ impS={pid:'',step:1}; } const cx=impCtx();
  const projs=store.d.projects.map(p=>({p,c:store.client(p.clientId)})).sort((a,b)=>(a.c.name+a.p.name).localeCompare(b.c.name+b.p.name));
  const steps=['Instrucciones','Subir archivo','Revisar y corregir','Listo']; const cur=impS.step===4?3:impS.step===3?2:0;
  const stepbar=`<div class="imp-steps">${steps.map((l,i)=>`<div class="imp-st ${i<=cur?'on':''}"><span>${i+1}</span>${l}</div>`).join('')}</div>`;
  if(impS.step===3&&impS.rows) return `<div class="crumb"><a onclick="impBack()">${cx.p?esc(cx.p.name):'Catálogos'}</a> › Importar tareas</div><div class="sec-title"><h2>⬆ Importar tareas</h2></div>${stepbar}${impPreview()}`;
  if(impS.step===4&&impS.result) return `<div class="crumb"><a onclick="impBack()">${cx.p?esc(cx.p.name):'Catálogos'}</a> › Importar tareas</div><div class="sec-title"><h2>⬆ Importar tareas</h2></div>${stepbar}${impDone()}`;
  const sel=`<select onchange="impSetProject(this.value)"><option value="">Sin proyecto (plantilla genérica)</option>${projs.map(x=>`<option value="${x.p.id}" ${x.p.id===impS.pid?'selected':''}>${esc(x.c.name)} · ${esc(x.p.name)}</option>`).join('')}</select>`;
  return `<div class="crumb"><a onclick="impBack()">${cx.p?esc(cx.p.name):'Catálogos'}</a> › Importar tareas</div>
    <div class="sec-title"><h2>⬆ Importar tareas</h2></div>${stepbar}
    <div class="card imp-card"><h3 style="margin:0 0 6px">1 · Prepara tu archivo</h3>
      <p class="muted" style="margin-top:0">Pasa tu listado de tareas, subtareas y sub-subtareas del Excel al portal sin capturar una por una. Puedes usar tu archivo tal cual con ayuda de Claude, o llenar la plantilla.</p>
      <div class="field"><label>¿A qué proyecto lo vas a importar?</label>${sel}<div class="hint">${cx.p?'La plantilla y el texto para Claude usarán los <b>frentes</b> ('+(cx.frentes.length||'sin frentes aún')+'), los <b>responsables</b> de Nuwek y las <b>personas del cliente</b> de este proyecto.':'Sin proyecto, la plantilla trae ejemplos genéricos. Si eliges uno, se llena con sus frentes y personas.'}</div></div>
      <div class="imp-opts">
        <div class="imp-opt"><b>A · Ya tengo mi Excel</b><p class="muted">Copia este texto y pégalo en Claude junto con tu Excel. Te devuelve el archivo en el formato exacto.</p><button class="btn" onclick="impCopyPrompt()">📋 Copiar texto para Claude</button></div>
        <div class="imp-opt"><b>B · Lo lleno yo</b><p class="muted">Descarga la plantilla con ejemplos, instrucciones y listas de frentes y personas.</p><button class="btn" onclick="impDownload()">⬇ Descargar plantilla de Excel</button></div>
      </div>
      ${impS.showPrompt?`<div class="field" style="margin-top:12px"><label>Selecciona y copia este texto</label><textarea readonly rows="10" style="width:100%;font-size:.78rem" onfocus="this.select()">${esc(impPrompt())}</textarea></div>`:''}
    </div>
    <div class="card imp-card"><h3 style="margin:0 0 6px">Reglas en corto</h3><ul class="imp-rules">
      <li>Una fila por tarea, subtarea o sub-subtarea; se unen con un <b>código</b> (T1, T1.1, T1.1.1).</li>
      <li>La columna <b>frente</b> va en las tareas: si ya existe en el proyecto debe coincidir; si no, se crea.</li>
      <li>Si un <b>responsable</b> no coincide con nadie, la fila se importa sin responsable y con aviso.</li>
      <li><b>depende_de</b>: la fila empieza cuando termina otra de la misma tarea (lunes a viernes, 9 a 18). Sin fecha, se calcula sola.</li>
      <li>Antes de guardar vas a ver una vista previa donde se corrige todo en la pantalla.</li></ul></div>
    <div class="card imp-card"><h3 style="margin:0 0 6px">2 · Sube tu archivo</h3><p class="muted" style="margin-top:0">Excel (.xlsx) o CSV con el formato de la plantilla. No se guarda nada hasta que lo revises y confirmes.</p>
      ${impS.pid?'':'<div class="ses-resp" style="background:#fff7e0;color:#7a5f00;margin-bottom:10px">Elige arriba el proyecto de destino para poder importar.</div>'}
      <label class="btn" style="display:inline-block;cursor:pointer">⬆ Elegir archivo<input type="file" accept=".xlsx,.xls,.csv" style="display:none" onchange="impReadFile(this)"></label>
      ${impBatches().length?`<div class="field" style="margin-top:14px"><label>Importaciones recientes</label>${impBatches().slice().reverse().slice(0,5).map(b=>`<div class="dep-row"><b>${b.tids.length} tarea(s) · ${esc(b.dest)}</b><span>${esc(b.file||'')} · ${new Date(b.ts).toLocaleDateString('es-MX',{day:'numeric',month:'short'})} <a style="cursor:pointer;color:#c0392b" onclick="impUndo('${b.id}')">deshacer</a></span></div>`).join('')}</div>`:''}
    </div>`; }

/* ================== ACCESOS DE CLIENTES (Catálogos) ================== */
let accOpen={}, accShow={}, accEd=null, accQ='';
function accToggle(cid){ accOpen[cid]=!accOpen[cid]; render(); }
function accReveal(pid){ accShow[pid]=!accShow[pid]; render(); }
function accSearch(v){ accQ=v; render(); setTimeout(()=>{ const e=document.getElementById('acc-q'); if(e){ e.focus(); e.setSelectionRange(v.length,v.length); } },0); }
function accRow(c,p){ const po=p.portal; const off=po&&po.activo===false;
  return `<div class="cat-row ${off?'off':''}">${avatar(p,true)}<span class="cat-nm">${esc(p.name)}</span><span class="muted" style="font-size:.8rem">${esc(p.role||'Sin puesto')}${p.phone?' · '+esc(p.phone):''}</span>
    ${po?`<span class="acc-cred">usuario <b>${esc(po.user)}</b></span><span class="acc-cred">código <b class="acc-code">${accShow[p.id]?esc(po.code):'••••••'}</b> <a class="acc-eye" title="${accShow[p.id]?'Ocultar':'Mostrar'}" onclick="accReveal('${p.id}')">${accShow[p.id]?'🙈':'👁'}</a></span><span class="pill ${off?'gray':po.rol==='admin'?'yellow':'green'}">${off?'Inactivo':po.rol==='admin'?'Administrador':'Colaborador'}</span>`
    :'<span class="muted" style="font-size:.78rem">Sin acceso al portal</span>'}
    <span class="cat-ops">${po&&po.recover?'<span class="pill yellow" title="Pidió recuperar su código">🔑 pidió restaurar</span>':''}${po?`<button class="btn ghost sm" title="Restablecer el código a ${RESET_CODE}; el cliente deberá cambiarlo al entrar" onclick="resetClientCode('${c.id}','${p.id}')">↺</button>`:''}<button class="btn ghost sm" title="${po?'Editar acceso':'Dar acceso'}" onclick="openAcc('${c.id}','${p.id}')">${po?'✏️':'🔑'}</button>${po?`<button class="btn ghost sm" title="${off?'Reactivar':'Desactivar'}" onclick="accToggleActive('${c.id}','${p.id}')">${off?'↩︎':'⏸'}</button>`:''}</span></div>`; }
function accesosHtml(){ const q=impNz(accQ); let tot=0,act=0;
  const groups=store.d.clients.slice().sort((a,b)=>a.name.localeCompare(b.name)).map(c=>{ const ppl=(c.people||[]); const withA=ppl.filter(x=>x.portal); tot+=withA.length; act+=withA.filter(x=>x.portal.activo!==false).length;
    const list=q?ppl.filter(x=>impNz(x.name+' '+(x.portal?x.portal.user:'')+' '+c.name).includes(q)):ppl; if(q&&!list.length) return '';
    const open=q?true:!!accOpen[c.id];
    return `<div class="team-grp"><div class="team-head" onclick="accToggle('${c.id}')"><span class="svc-chev">${open?'▾':'▸'}</span><span class="team-nm">${esc(c.name)}</span><span class="team-cnt">${withA.length} con acceso</span><span class="muted" style="font-size:.74rem;margin-left:6px">${ppl.length} contacto(s)</span></div>
      ${open?`<div class="cat-list">${list.map(x=>accRow(c,x)).join('')||'<div class="muted" style="padding:8px">Este cliente aún no tiene contactos.</div>'}<div style="padding:6px 0"><button class="btn ghost sm" onclick="openAcc('${c.id}','')">+ Usuario para ${esc(c.name)}</button></div></div>`:''}</div>`; }).join('');
  return `<div class="sec-title"><h2 style="font-size:1.1rem">Accesos de clientes</h2><button class="btn sm" onclick="openAcc('','')">+ Nuevo acceso</button></div>
    <p class="muted" style="margin-top:-4px">Todos los usuarios del portal del cliente en un solo lugar: <b>${act}</b> activos de <b>${tot}</b>. Los códigos están ocultos; pulsa 👁 para verlos. Cada cliente administra a su gente desde su portal, pero aquí puedes crear, cambiar o desactivar accesos.</p>
    <div class="field" style="max-width:340px"><input id="acc-q" placeholder="Buscar cliente, persona o usuario…" value="${esc(accQ)}" oninput="accSearch(this.value)"></div>
    <div class="team-list">${groups||'<div class="muted">Sin resultados.</div>'}</div>`; }
function openAcc(cid,pid){ accEd={cid,pid,gen:''}; render(); }
function closeAcc(){ accEd=null; render(); }
function accGen(){ const c=String(Math.floor(Math.random()*900000)+100000); const e=document.getElementById('ac-code'); if(e) e.value=c; }
function accSyncPerson(){ const e=document.getElementById('ac-person'); if(!e) return; const nw=e.value==='__new'; const b=document.getElementById('ac-newbox'); if(b) b.style.display=nw?'block':'none'; }
function accCli(v){ accEd.cid=v; accEd.pid=''; render(); }
function accModal(){ const E=accEd; const c=store.client(E.cid); const p=c&&E.pid?(c.people||[]).find(x=>x.id===E.pid):null; const po=(p&&p.portal)||{rol:'colab',activo:true};
  const cli=`<div class="field"><label>Cliente *</label><select id="ac-cli" ${E.pid?'disabled':''} onchange="accCli(this.value)"><option value="">Elige…</option>${store.d.clients.slice().sort((a,b)=>a.name.localeCompare(b.name)).map(x=>`<option value="${x.id}" ${x.id===E.cid?'selected':''}>${esc(x.name)}</option>`).join('')}</select></div>`;
  const per=c?(E.pid?`<div class="field"><label>Persona</label><div><b>${esc(p.name)}</b> <span class="muted">${esc(p.role||'')}</span></div></div>`
    :`<div class="field"><label>Persona *</label><select id="ac-person" onchange="accSyncPerson()"><option value="__new">➕ Nuevo contacto…</option>${(c.people||[]).filter(x=>!x.portal).map(x=>`<option value="${x.id}">${esc(x.name)}${x.role?' · '+esc(x.role):''}</option>`).join('')}</select></div><div id="ac-newbox"><div class="field row"><div><label>Nombre *</label><input id="ac-name"></div><div><label>Puesto</label><input id="ac-puesto"></div></div></div>`):'';
  return `<div class="modal active" style="z-index:145" onclick="if(event.target===this)closeAcc()"><div class="modal-card" style="max-width:520px"><div class="m-head"><div class="m-top"><h3 style="margin:0">${p&&p.portal?'Editar acceso':'Dar acceso al portal'}</h3><button class="x" onclick="closeAcc()">×</button></div></div><div class="m-body">${cli}${per}
    ${c?`<div class="field row"><div><label>Usuario *</label><input id="ac-user" value="${esc(po.user||'')}" autocapitalize="off" placeholder="ej. maria.lopez"></div><div><label>Código de 6 cifras * <a class="muted" style="cursor:pointer;font-size:.74rem" onclick="accGen()">🎲 generar</a></label><input id="ac-code" inputmode="numeric" maxlength="6" value="${esc(po.code||'')}" placeholder="123456"></div></div>
    <div class="field"><label>Rol</label><select id="ac-rol"><option value="admin" ${po.rol==='admin'?'selected':''}>Administrador (Gantt, finanzas, tiempos, notas, scorecard, usuarios)</option><option value="colab" ${po.rol!=='admin'?'selected':''}>Colaborador (solo sus tareas)</option></select></div>
    <label class="gf-opt"><input type="checkbox" id="ac-act" ${po.activo!==false?'checked':''}> Usuario activo</label>`:'<div class="muted">Elige un cliente para continuar.</div>'}
    <div class="wiz-actions">${p&&p.portal?'<button class="btn ghost" style="margin-right:auto;color:#c0392b" onclick="accQuitar()">Quitar acceso</button>':''}<button class="btn ghost" onclick="closeAcc()">Cancelar</button><button class="btn" onclick="saveAcc()" ${c?'':'disabled'}>Guardar</button></div></div></div></div>`; }
function saveAcc(){ const E=accEd; const c=store.client(E.cid); if(!c) return; const user=(val('ac-user')||'').trim(), code=(val('ac-code')||'').trim(); let pid=E.pid; let name='';
  if(pid){ name=(c.people.find(x=>x.id===pid)||{}).name; } else { const sel=val('ac-person'); if(sel&&sel!=='__new'){ pid=sel; name=(c.people.find(x=>x.id===pid)||{}).name; } else name=(val('ac-name')||'').trim(); }
  if(!cpValidateUser(name,user,code,pid||null)) return; const portal={user,code,rol:val('ac-rol')||'colab',activo:!!document.getElementById('ac-act').checked};
  if(pid) store.updateClientPerson(c.id,pid,{portal}); else store.addClientPerson(c.id,{name,role:(val('ac-puesto')||'').trim(),phone:'',email:'',portal});
  accOpen[c.id]=true; accEd=null; render(); shareToast('🔑 Acceso guardado'); }
function accQuitar(){ const E=accEd; if(!E||!E.pid||!confirm('¿Quitarle el acceso al portal? Seguirá como contacto.')) return; store.updateClientPerson(E.cid,E.pid,{portal:null}); accEd=null; render(); }
function accToggleActive(cid,pid){ const c=store.client(cid); const x=c&&(c.people||[]).find(y=>y.id===pid); if(!x||!x.portal) return; store.updateClientPerson(cid,pid,{portal:Object.assign({},x.portal,{activo:x.portal.activo===false})}); render(); }

/* ================== DUPLICAR SUBTAREA DENTRO DE LA MISMA TAREA (Dirección y Gerencia) ================== */
let dupS=null;
function openDup(){ if(!canCopy()||!subEd) return; dupS={tid:subEd.tid,sid:subEd.sid,mode:'same',date:'',resp:false,kids:true}; render(); }
function closeDup(){ dupS=null; render(); }
function dupGroup(t,s0,withKids){ return [s0,...(withKids&&!s0.parentId?(t.subtasks||[]).filter(x=>x.parentId===s0.id):[])]; }
function dupModal(){ const t=store.task(dupS.tid); const s0=t&&(t.subtasks||[]).find(x=>x.id===dupS.sid); if(!s0){ dupS=null; return ''; }
  const nk=s0.parentId?0:(t.subtasks||[]).filter(x=>x.parentId===s0.id).length;
  return `<div class="modal active" style="z-index:150" onclick="if(event.target===this)closeDup()"><div class="modal-card" style="max-width:480px"><div class="m-head"><div class="m-top"><h3 style="margin:0">⧉ Duplicar «${esc(s0.name)}»</h3><button class="x" onclick="closeDup()">×</button></div></div><div class="m-body">
    <p class="muted" style="margin-top:0">Se crea una copia dentro de <b>esta misma tarea</b>${nk?`, con sus <b>${nk}</b> sub-subtarea(s)`:''}. Llega con el nombre «${esc(s0.name)} (copia)».</p>
    ${nk?`<label class="gf-opt"><input type="checkbox" ${dupS.kids?'checked':''} onchange="dupS.kids=this.checked;render()"> Incluir sus sub-subtareas</label>`:''}
    <div class="field" style="margin-top:8px"><label>Fechas</label>${[['same','Dejar las mismas fechas'],['start','Fecha nueva (respeta los días hábiles entre ellas)'],['none','Sin fechas (las pongo después)']].map(([k,l])=>`<label class="gf-opt" style="margin:3px 0"><input type="radio" name="dup-mode" ${dupS.mode===k?'checked':''} onchange="dupS.mode='${k}';render()"> ${l}</label>`).join('')}${dupS.mode==='start'?`<input type="date" value="${dupS.date}" onchange="dupS.date=this.value" style="margin-top:6px">`:''}</div>
    <label class="gf-opt"><input type="checkbox" ${dupS.resp?'checked':''} onchange="dupS.resp=this.checked"> Copiar también responsables y equipo</label>
    <div class="hint">Las horas del día no se copian (dependen de cada agenda). Tampoco avance, tiempos ni comentarios.</div>
    <div class="wiz-actions"><button class="btn ghost" onclick="closeDup()">Cancelar</button><button class="btn" onclick="dupDo()">Duplicar</button></div></div></div></div>`; }
function dupDo(){ const D=dupS; if(!D||!canCopy()) return; const t=store.task(D.tid); const s0=t&&(t.subtasks||[]).find(x=>x.id===D.sid); if(!s0) return;
  if(D.mode==='start'&&!D.date){ alert('Escribe la nueva fecha.'); return; }
  const group=dupGroup(t,s0,D.kids); const now=new Date().toISOString(); const idMap={}; group.forEach(x=>idMap[x.id]=uid('s_'));
  const ds=group.map(x=>x.date).filter(Boolean).sort(); const ref=ds[0]; const base=(D.mode==='start'&&ref)?copyWdn(nextWork(D.date))-copyWdn(ref):0;
  const mapD=d=>D.mode==='same'?d:D.mode==='none'?'':(d?wFrom((copyWdn(d)+base)*(WK.e-WK.s)).d:'');
  const tok=()=>Math.random().toString(36).slice(2,8)+Math.random().toString(36).slice(2,8);
  const copies=group.map(x=>{ const o=JSON.parse(JSON.stringify(x)); Object.assign(o,{id:idMap[x.id],name:x.id===s0.id?x.name+' (copia)':x.name,parentId:x.parentId?(idMap[x.parentId]||x.parentId):undefined,dependsOn:x.dependsOn?(idMap[x.dependsOn]||x.dependsOn):undefined,
      done:false,doneAt:null,timeSpent:0,time:'',nextId:null,dateConflict:false,repeatOf:undefined,impCode:undefined,date:mapD(x.date),
      personId:D.resp?(x.personId||''):'',team:D.resp?(x.team||[]):[],teamInfo:{},teamAck:{}});
    if(D.resp) (o.team||[]).forEach(id=>{ o.teamInfo[id]={by:currentUser,ts:now}; });
    if(x.sesion){ o.sesion={objetivo:x.sesion.objetivo||'',lugar:x.sesion.lugar,temario:x.sesion.temario||[]}; o.shareToken=tok(); } else delete o.shareToken;
    return o; });
  const idx=Math.max(...group.map(x=>t.subtasks.indexOf(x))); t.subtasks.splice(idx+1,0,...copies);
  store.save(); if(typeof dbSaveTask==='function') dbSaveTask(t); logEvent(t.id,'Duplicó la subtarea «'+s0.name+'» ('+copies.length+' elemento(s))');
  dupS=null; subEd=null; render(); shareToast('⧉ Se duplicó «'+s0.name+'» dentro de la tarea'); }

/* ================== MOVER SUBTAREA A OTRA TAREA DEL MISMO PROYECTO (Dirección y Gerencia) ================== */
let movS=null;
function openMov(){ if(!canCopy()||!subEd) return; movS={tid:subEd.tid,sid:subEd.sid,to:'',parent:''}; render(); }
function closeMov(){ movS=null; render(); }
function movSet(k,v){ movS[k]=v; if(k==='to') movS.parent=''; render(); }
function movModal(){ const t=store.task(movS.tid); const s0=t&&(t.subtasks||[]).find(x=>x.id===movS.sid); if(!s0){ movS=null; return ''; }
  const kids=(t.subtasks||[]).filter(x=>x.parentId===s0.id); const others=store.tasksOf(t.projectId).filter(x=>x.id!==t.id);
  const dest=movS.to?store.task(movS.to):null; const canNest=dest&&!kids.length;
  const frName=x=>{ const f=store.frentesOf(t.projectId).find(z=>z.id===x.frenteId); return f?f.name:''; };
  const deps=(t.subtasks||[]).filter(x=>x.dependsOn===s0.id).length+(s0.dependsOn?1:0);
  return `<div class="modal active" style="z-index:150" onclick="if(event.target===this)closeMov()"><div class="modal-card" style="max-width:480px"><div class="m-head"><div class="m-top"><h3 style="margin:0">↦ Mover «${esc(s0.name)}»</h3><button class="x" onclick="closeMov()">×</button></div></div><div class="m-body">
    <p class="muted" style="margin-top:0">Se mueve a <b>otra tarea de este mismo proyecto</b>${kids.length?`, junto con sus <b>${kids.length}</b> sub-subtarea(s)`:''}. Conserva sus fechas, responsables, avance y tiempos.</p>
    <div class="field"><label>Mover a la tarea *</label><select onchange="movSet('to',this.value)"><option value="">Elige…</option>${others.map(x=>`<option value="${x.id}" ${x.id===movS.to?'selected':''}>${esc(x.name)}${frName(x)?' · '+esc(frName(x)):''}</option>`).join('')}</select>${others.length?'':'<div class="hint">Este proyecto no tiene más tareas.</div>'}</div>
    ${canNest?`<div class="field"><label>Colocar</label><select onchange="movSet('parent',this.value)"><option value="">Como subtarea de la tarea</option>${(dest.subtasks||[]).filter(x=>!x.parentId&&!x.isSeries&&!x.seriesId).map(x=>`<option value="${x.id}" ${x.id===movS.parent?'selected':''}>Dentro de la subtarea «${esc(x.name)}»</option>`).join('')}</select></div>`:''}
    ${deps?`<div class="ses-resp" style="background:#fff7e0;color:#7a5f00">⛓ Las dependencias solo funcionan dentro de una misma tarea: ${deps} dependencia(s) ligadas a esta subtarea se quitarán.</div>`:''}
    <div class="wiz-actions"><button class="btn ghost" onclick="closeMov()">Cancelar</button><button class="btn" onclick="movDo()" ${movS.to?'':'disabled'}>Mover</button></div></div></div></div>`; }
function movDo(){ const M=movS; if(!M||!canCopy()||!M.to) return; const t=store.task(M.tid), dt=store.task(M.to); const s0=t&&(t.subtasks||[]).find(x=>x.id===M.sid); if(!s0||!dt||t.projectId!==dt.projectId) return;
  const group=[s0,...(t.subtasks||[]).filter(x=>x.parentId===s0.id)]; const gi=new Set(group.map(x=>x.id));
  (t.subtasks||[]).forEach(x=>{ if(!gi.has(x.id)&&x.dependsOn&&gi.has(x.dependsOn)) delete x.dependsOn; });
  group.forEach(x=>{ if(x.dependsOn&&!gi.has(x.dependsOn)) delete x.dependsOn; });
  t.subtasks=t.subtasks.filter(x=>!gi.has(x.id));
  if(M.parent&&!(group.length>1)) s0.parentId=M.parent; else if(s0.parentId) delete s0.parentId;
  dt.subtasks=dt.subtasks||[]; dt.subtasks.push(...group);
  store.save(); if(typeof dbSaveTask==='function'){ dbSaveTask(t); dbSaveTask(dt); }
  logEvent(t.id,'Movió la subtarea «'+s0.name+'» a la tarea «'+dt.name+'»'); logEvent(dt.id,'Recibió la subtarea «'+s0.name+'» desde la tarea «'+t.name+'»');
  movS=null; subEd=null; render(); shareToast('↦ «'+s0.name+'» ahora está en «'+dt.name+'»'); }

/* ================== EXPORTAR GANTT A PDF (diagrama + detalle semana por semana) ================== */
let pdfS=null;
const hx=v=>String(v==null?'':v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
function isoWeekOf(iso){ const [y,m,d]=iso.split('-').map(Number); const dt=new Date(Date.UTC(y,m-1,d)); const day=(dt.getUTCDay()+6)%7; dt.setUTCDate(dt.getUTCDate()-day+3); const wy=dt.getUTCFullYear(); const first=new Date(Date.UTC(wy,0,4)); const w=1+Math.round(((dt-first)/86400000-3+((first.getUTCDay()+6)%7))/7); return {y:wy,w}; }
function pdfOpen(pid){ pdfS={pid,from:'',to:'',flags:true}; render(); }
function pdfClose(){ pdfS=null; render(); }
function pdfModal(){ const p=store.project(pdfS.pid); if(!p){ pdfS=null; return ''; }
  return `<div class="modal active" style="z-index:150" onclick="if(event.target===this)pdfClose()"><div class="modal-card" style="max-width:480px"><div class="m-head"><div class="m-top"><h3 style="margin:0">📄 Exportar a PDF</h3><button class="x" onclick="pdfClose()">×</button></div></div><div class="m-body">
    <p class="muted" style="margin-top:0">Genera el diagrama de Gantt de «${hx(p.name)}» y, debajo, el detalle <b>semana por semana</b> (numeradas como en el calendario del año) con camino, tarea, subtarea, sub-subtarea, responsable, día, hora y estatus.</p>
    <div class="field row"><div><label>Desde (opcional)</label><input type="date" value="${pdfS.from}" onchange="pdfS.from=this.value"></div><div><label>Hasta (opcional)</label><input type="date" value="${pdfS.to}" onchange="pdfS.to=this.value"></div></div>
    <div class="hint" style="margin-top:-6px">Vacío = todo el proyecto.</div>
    <label class="gf-opt" style="margin-top:8px"><input type="checkbox" ${pdfS.flags?'checked':''} onchange="pdfS.flags=this.checked"> Marcar los días con <b>empalmes</b> (misma persona en dos caminos distintos el mismo día, o con horas encimadas). <span class="muted">Quítalo si el PDF se lo vas a mandar al cliente.</span></label>
    <div class="hint">Se abre una vista de impresión: elige «Guardar como PDF». Si no se abre, permite las ventanas emergentes de este sitio.</div>
    <div class="wiz-actions"><button class="btn ghost" onclick="pdfClose()">Cancelar</button><button class="btn" onclick="pdfGo()">Generar PDF</button></div></div></div></div>`; }
function pdfActivities(p,from,to){ const out=[]; const frs=store.frentesOf(p.id); const fr=id=>frs.find(f=>f.id===id)||{name:'(sin camino)',color:'#8a9a93'};
  store.tasksOf(p.id).forEach(t=>{ const f=fr(t.frenteId); const subs=(t.subtasks||[]).filter(x=>!x.isSeries); const byId={}; subs.forEach(x=>byId[x.id]=x);
    const kidsOf=id=>subs.filter(x=>x.parentId===id);
    if(!subs.length){ if(t.dueDate) out.push({date:t.dueDate,time:'',dur:0,f,t,sub:null,ss:null,person:store.person(t.responsibleId),done:t.status==='done',doneAt:'',spent:0,sesion:false,lim:true}); return; }
    subs.forEach(x=>{ const hasKids=!x.parentId&&kidsOf(x.id).length>0; if(hasKids) return;
      const par=x.parentId?byId[x.parentId]:null; const pr=x.personId?store.person(x.personId):null;
      out.push({date:x.date||'',time:x.time||'',dur:+x.durMin||0,f,t,sub:par||x,ss:par?x:null,person:pr,done:!!x.done,doneAt:x.doneAt||'',spent:+x.timeSpent||0,sesion:!!(x.sesion&&(x.sesion.objetivo||x.sesion.temario&&x.sesion.temario.length||x.sesion.lugar&&(x.sesion.lugar.link||x.sesion.lugar.direccion))),lim:false}); }); });
  return out; }
function pdfFlagItems(list){ const byDay={}; list.forEach(a=>{ if(!a.date||!a.person||!a.person.id) return; ((byDay[a.date]=byDay[a.date]||{})[a.person.id]=byDay[a.date][a.person.id]||[]).push(a); });
  const notes=[]; Object.entries(byDay).forEach(([day,ppl])=>Object.values(ppl).forEach(arr=>{ const frs=new Set(arr.map(a=>a.f.name));
    if(frs.size>1){ arr.forEach(a=>a.flagC=true); notes.push({day,who:arr[0].person.name,txt:'dos caminos: '+[...frs].join(' + ')+' ('+arr.length+' actividades)'}); }
    const timed=arr.filter(a=>a.time).map(a=>({a,s:toMin(a.time),e:toMin(a.time)+(a.dur||0)})).sort((x,y)=>x.s-y.s);
    for(let i=1;i<timed.length;i++){ if(timed[i].s<timed[i-1].e){ timed[i].a.flagH=true; timed[i-1].a.flagH=true; notes.push({day,who:arr[0].person.name,txt:'horas encimadas ('+timed[i-1].a.time+' y '+timed[i].a.time+')'}); } } }));
  return notes; }
function pdfStatus(a,today){ const parts=[]; if(a.done){ const dn=a.doneAt&&a.doneAt.slice(0,4)!=='2020'?a.doneAt.slice(0,10):''; if(dn&&a.date){ const late=daysBetween(a.date,dn); parts.push(late>0?`✓ Hecha con ${late} día(s) de atraso`:'✓ Hecha a tiempo'); } else parts.push('✓ Hecha'); }
  else if(a.date&&a.date<today){ parts.push(`⏰ Atrasada ${daysBetween(a.date,today)} día(s)`); } else parts.push('Programada');
  return parts.join(' · '); }
function pdfHtml(p,from,to,flags){ const c=store.client(p.clientId)||{name:''}; const today=todayISO(); const fmt=iso=>iso?dLabel(iso)+' '+iso.slice(0,4):'';
  let acts=pdfActivities(p,from,to); const undated=acts.filter(a=>!a.date); acts=acts.filter(a=>a.date); if(from) acts=acts.filter(a=>a.date>=from); if(to) acts=acts.filter(a=>a.date<=to);
  const frs=store.frentesOf(p.id);
  // rango del diagrama
  const all=acts.map(a=>a.date).sort(); let rs=from||all[0]||p.startDate, re=to||all[all.length-1]||p.endDate; rs=mondayOf(rs); re=addDaysISO(mondayOf(re),6);
  const nW=Math.round((daysBetween(rs,re)+1)/7), D=daysBetween(rs,re)+1; const pct=n=>(n/D*100).toFixed(3);
  const clip=(a,b)=>{ const s0=a<rs?rs:a, e0=b>re?re:b; return s0>e0?null:[s0,e0]; };
  const step=Math.max(1,Math.ceil(nW/28)); const axis=Array.from({length:nW},(_,i)=>{ const mo=addDaysISO(rs,i*7); const w=isoWeekOf(mo).w; return `<div class="ax" style="width:${100/nW}%">${i%step===0?'S'+w:''}</div>`; }).join('');
  const todayPct=(today>=rs&&today<=re)?pct(daysBetween(rs,today)):null; const bg=`background-size:${100/nW}% 100%`;
  const blocks=frs.map(f=>{ const tasks=ganttOrdered(p,f.id); if(!tasks.length) return ''; let rows='';
    tasks.forEach(t=>{ const subs=(t.subtasks||[]).filter(x=>!x.isSeries); const sp=taskSpan(t); const clp=sp&&clip(sp.start,sp.end);
      const tdone=t.status==='done'||(subs.length&&subs.every(x=>x.done));
      rows+=`<div class="gr gt"><div class="gl">${tdone?'✓ ':''}${hx(t.name)}</div><div class="gcell" style="${bg}">${clp?`<div class="bar" style="left:${pct(daysBetween(rs,clp[0]))}%;width:${Math.max(0.6,(daysBetween(clp[0],clp[1])+1)/D*100).toFixed(3)}%;background:${f.color}"></div>`:''}</div></div>`;
      subs.filter(x=>!x.parentId).forEach(x=>{ const kids=subs.filter(k=>k.parentId===x.id); const ds=[x.date,...kids.map(k=>k.date)].filter(Boolean).sort(); const cl=ds.length&&clip(ds[0],ds[ds.length-1]); const done=kids.length?kids.every(k=>k.done)&&x.done!==false:x.done;
        rows+=`<div class="gr gs"><div class="gl">${done?'✓ ':''}${hx(x.name)}</div><div class="gcell" style="${bg}">${cl?`<div class="bar sb" style="left:${pct(daysBetween(rs,cl[0]))}%;width:${Math.max(0.5,(daysBetween(cl[0],cl[1])+1)/D*100).toFixed(3)}%;background:${f.color}"></div>`:''}</div></div>`; }); });
    return `<div class="fb"><div class="fh" style="border-left:5px solid ${f.color}"><div class="gl">${hx(f.name)}</div><div class="gcell axis">${axis}</div></div>${rows}${todayPct!=null?`<div class="tl" style="left:calc(26% + ${todayPct}% * .74)"></div>`:''}</div>`; }).join('');
  // detalle por semana
  const weeks={}; acts.forEach(a=>{ const w=isoWeekOf(a.date); const k=w.y*100+w.w; (weeks[k]=weeks[k]||{y:w.y,w:w.w,mon:mondayOf(a.date),items:[]}).items.push(a); });
  const keys=Object.keys(weeks).map(Number).sort((a,b)=>a-b); const DN=['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];
  const wkHtml=keys.map(k=>{ const W=weeks[k]; const list=W.items.sort((a,b)=>a.date.localeCompare(b.date)||(a.time||'99').localeCompare(b.time||'99')); const notes=flags?pdfFlagItems(list):[];
    const days={}; list.forEach(a=>(days[a.date]=days[a.date]||[]).push(a));
    const body=Object.keys(days).sort().map(day=>{ const arr=days[day]; const nPers=new Set(arr.map(a=>a.person&&a.person.id||'-')).size;
      return `<tr class="dh"><td colspan="6">${DN[isoWeekday(day)]} ${dLabel(day)} <span class="mut">· ${arr.length} actividad(es) · ${nPers} persona(s)</span></td></tr>`+arr.map(a=>{ const path=[a.t.name,a.sub?a.sub.name:null,a.ss?a.ss.name:null].filter(Boolean).map(hx);
        const tp=(a.dur?fmtDurShort(a.dur):'—')+' / '+(a.spent?fmtTime(a.spent):'—');
        return `<tr class="${flags&&(a.flagC||a.flagH)?'fl':''}"><td class="tm">${a.time||'—'}</td><td><span class="dot" style="background:${a.f.color}"></span>${hx(a.f.name)}</td><td>${path.join(' <span class="mut">›</span> ')}${a.lim?' <span class="mut">(fecha límite)</span>':''}${a.sesion?' <span class="se">sesión con cliente</span>':''}${flags&&a.flagC?' <span class="wn">⚠ dos caminos</span>':''}${flags&&a.flagH?' <span class="wn">⚠ horas encimadas</span>':''}</td><td>${a.person&&a.person.id?hx(a.person.name):'<span class="mut">Sin asignar</span>'}</td><td class="tm">${tp}</td><td>${hx(pdfStatus(a,today))}</td></tr>`; }).join(''); }).join('');
    return `<section class="wk"><h2>Semana ${W.w} <span class="mut">· ${dLabel(W.mon)} – ${dLabel(addDaysISO(W.mon,6))} ${W.y} · ${list.length} actividad(es)</span></h2>${notes.length?`<div class="nt">${notes.map(n=>`<div>⚠ <b>${hx(n.who)}</b> · ${DN[isoWeekday(n.day)]} ${dLabel(n.day)}: ${hx(n.txt)}</div>`).join('')}</div>`:''}
      <table><thead><tr><th>Hora</th><th>Camino</th><th>Tarea › Subtarea › Sub-subtarea</th><th>Responsable</th><th>Programado / Real</th><th>Estatus</th></tr></thead><tbody>${body}</tbody></table></section>`; }).join('');
  const css=`@page{size:A4 landscape;margin:10mm 10mm 12mm}*{box-sizing:border-box}body{font-family:Inter,Arial,sans-serif;font-size:9px;color:#223c36;margin:0;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .top{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:2px solid #223c36;padding-bottom:6px;margin-bottom:8px}.top h1{margin:0;font-size:18px}.top .sub{color:#6b7d76;font-size:10px}.logo{max-height:34px;max-width:120px}
  .leg{color:#6b7d76;font-size:8px;margin:2px 0 8px}.fb{position:relative;margin-bottom:8px;border:1px solid #e4e2d8;break-inside:auto}.fh,.gr{display:flex;height:14px;align-items:stretch;break-inside:avoid}.fh{height:16px;background:#f2f1ea}
  .gl{width:26%;padding:0 5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:flex;align-items:center}.fh .gl{font-weight:700;font-size:10px}.gt .gl{font-weight:700}.gs .gl{padding-left:16px;color:#4b5b54}
  .gcell{width:74%;position:relative;background-image:linear-gradient(to right,#e4e2d8 1px,transparent 1px)}.axis{display:flex;background-image:none}.ax{font-size:6px;color:#6b7d76;border-left:1px solid #d9d7cb;padding-left:1px;overflow:hidden;white-space:nowrap}
  .bar{position:absolute;top:3px;height:8px;border-radius:2px}.bar.sb{opacity:.55;top:4px;height:6px}.tl{position:absolute;top:0;bottom:0;border-left:1.5px solid #e7b800;pointer-events:none}
  h2{font-size:12px;margin:12px 0 4px;border-bottom:1px solid #223c36;padding-bottom:2px;break-after:avoid}.mut{color:#6b7d76;font-weight:400}.wk{break-inside:auto}
  table{width:100%;border-collapse:collapse}th{text-align:left;font-size:8px;text-transform:uppercase;color:#6b7d76;border-bottom:1px solid #cfcdc2;padding:2px 4px}td{padding:2px 4px;border-bottom:1px solid #eeede6;vertical-align:top}tr{break-inside:avoid}
  tr.dh td{background:#f2f1ea;font-weight:700;padding:3px 4px}.tm{white-space:nowrap}.dot{display:inline-block;width:7px;height:7px;border-radius:50%;margin-right:4px}.se{background:#e8f0ff;color:#2a4fa3;border-radius:6px;padding:0 4px;font-size:8px}
  tr.fl td{background:#fff3e0}.wn{color:#b34700;font-weight:700;font-size:8px}.nt{background:#fff3e0;border:1px solid #f0c27a;border-radius:4px;padding:3px 6px;margin:3px 0;font-size:8.5px;color:#7a3d00}
  .sec{break-before:page}@media screen{body{padding:14px;max-width:1200px;margin:auto}}`;
  const undH=undated.length?`<section class="wk"><h2>Sin fecha asignada <span class="mut">· ${undated.length} actividad(es)</span></h2><table><thead><tr><th></th><th>Camino</th><th>Tarea › Subtarea › Sub-subtarea</th><th>Responsable</th><th></th><th>Estatus</th></tr></thead><tbody>${undated.map(a=>`<tr><td></td><td><span class="dot" style="background:${a.f.color}"></span>${hx(a.f.name)}</td><td>${[a.t.name,a.sub&&a.sub.name,a.ss&&a.ss.name].filter(Boolean).map(hx).join(' › ')}</td><td>${a.person&&a.person.id?hx(a.person.name):'Sin asignar'}</td><td></td><td>${a.done?'✓ Hecha':'Pendiente'}</td></tr>`).join('')}</tbody></table></section>`:'';
  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><title>${hx(p.name)} · Gantt</title><link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap" rel="stylesheet"><style>${css}</style></head><body>
    <div class="top"><div><h1>${hx(c.name)} · ${hx(p.name)}</h1><div class="sub">Diagrama de Gantt y calendario semanal · ${hx(fmt(rs))} a ${hx(fmt(re))} · generado el ${hx(fmt(today))}</div></div>${c.logo&&/^(https?:|data:image)/.test(c.logo)?`<img class="logo" src="${hx(c.logo)}">`:''}</div>
    <div class="leg">Cada barra va del inicio al fin de la tarea o subtarea. Barras claras = subtareas. ✓ = realizada. La línea amarilla es hoy. Las columnas S42, S43… son los números de semana del año.</div>
    ${blocks||'<p>No hay actividades en este rango.</p>'}
    <div class="sec">${wkHtml}${undH}</div></body></html>`; }
function pdfGo(){ const p=store.project(pdfS.pid); if(!p) return; if(pdfS.from&&pdfS.to&&pdfS.from>pdfS.to){ alert('La fecha «Desde» debe ser anterior a «Hasta».'); return; }
  const html=pdfHtml(p,pdfS.from,pdfS.to,pdfS.flags); const w=window.open('','_blank'); if(!w){ alert('El navegador bloqueó la ventana. Permite las ventanas emergentes de este sitio e inténtalo de nuevo.'); return; }
  w.document.open(); w.document.write(html); w.document.close(); setTimeout(()=>{ try{ w.focus(); w.print(); }catch(_){} },900); pdfS=null; render(); }

/* ================== EXPORTAR TAREAS DEL PROYECTO (CSV / Excel, mismo formato que la importación) ================== */
let expS=null;
const EXP_EXTRA=['estado','fecha_hecha','tiempo_real_min','equipo','links'];
function expOpen(pid){ if(!canCopy()) return; expS={pid}; render(); }
function expClose(){ expS=null; render(); }
function expModal(){ const p=store.project(expS.pid); if(!p){ expS=null; return ''; } const n=store.tasksOf(p.id).length;
  return `<div class="modal active" style="z-index:150" onclick="if(event.target===this)expClose()"><div class="modal-card" style="max-width:460px"><div class="m-head"><div class="m-top"><h3 style="margin:0">⬇ Exportar tareas</h3><button class="x" onclick="expClose()">×</button></div></div><div class="m-body">
    <p class="muted" style="margin-top:0">Descarga las <b>${n} tarea(s)</b> de «${esc(p.name)}» con sus subtareas y sub-subtareas: nombre, fechas, horas, duración, responsables, dependencias, sesiones con cliente, estado, tiempo real y más. Usa las <b>mismas columnas que la importación</b>: editas el archivo y lo subes con <b>⬆ Importar</b>.</p>
    <div class="hint">Las tareas con repetición automática (series) no se incluyen. Si lo importas en el <b>mismo proyecto</b> se duplicaría; el modo «Actualizar» todavía no existe. Para copiar a otro proyecto o cliente, sí funciona.</div>
    <div class="wiz-actions"><button class="btn ghost" onclick="expClose()">Cancelar</button><button class="btn ghost" onclick="expGo('xlsx')">Descargar Excel</button><button class="btn" onclick="expGo('csv')">Descargar CSV</button></div></div></div></div>`; }
function expRows(p){ const c=store.client(p.clientId)||{people:[]}; const nm=id=>{ const x=id?store.person(id):null; return x&&x.id?x.name:''; };
  const rows=[]; const used=new Set(); let ti=0;
  const code=(cand,fallback)=>{ let k=cand&&!used.has(cand)?cand:fallback; let i=0; while(used.has(k)) k=fallback+'_'+(++i); used.add(k); return k; };
  const cmap={}; const frs=store.frentesOf(p.id); const order=[]; frs.forEach(f=>ganttOrdered(p,f.id).forEach(t=>order.push(t))); store.tasksOf(p.id).forEach(t=>{ if(!order.includes(t)) order.push(t); });
  order.forEach(t=>{ ti++; const tc=code(t.impCode,'T'+ti); cmap['t:'+t.id]=tc; const f=frs.find(z=>z.id===t.frenteId);
    const subs=subOrder(t,true).map(o=>o.s).filter(x=>!x.isSeries&&!x.seriesId); let si=0; const kids={};
    const top=subs.filter(x=>!x.parentId); top.forEach(x=>{ si++; cmap[x.id]=code(x.impCode,tc+'.'+si); let ki=0; subs.filter(k=>k.parentId===x.id).forEach(k=>{ ki++; cmap[k.id]=code(k.impCode,cmap[x.id]+'.'+ki); }); });
    const ws=subs; const spent=ws.reduce((a,z)=>a+(+z.timeSpent||0),0); const dn=ws.length&&ws.every(z=>z.done);
    rows.push({codigo:tc,nivel:'Tarea',padre:'',frente:f?f.name:'',nombre:t.name,descripcion:t.description||'',etiquetas:(t.tags||[]).join('; '),fecha:t.dueDate||'',hora:'',duracion_min:'',responsable:nm(t.responsibleId),depende_de:'',fecha_fija:'',urgente:t.urgente?'SI':'',estado:(t.status==='done'||dn)?'Hecha':'Pendiente',fecha_hecha:'',tiempo_real_min:spent||'',equipo:'',links:(t.links||[]).map(l=>(l.title?l.title+': ':'')+l.url).join(' | ')});
    const emit=x=>{ const par=x.parentId?cmap[x.parentId]:tc; const ses=x.sesion||{}; const lug=ses.lugar||{}; const pres=lug.tipo==='presencial';
      rows.push({codigo:cmap[x.id],nivel:x.parentId?'Subsubtarea':'Subtarea',padre:par,frente:'',nombre:x.name,descripcion:'',etiquetas:'',fecha:x.date||'',hora:x.time||'',duracion_min:x.durMin||'',responsable:nm(x.personId),depende_de:x.dependsOn&&cmap[x.dependsOn]?cmap[x.dependsOn]:'',fecha_fija:x.fija?'SI':'',urgente:x.urgent?'SI':'',
        cita_objetivo:ses.objetivo||'',cita_lugar:(ses.objetivo||lug.link||lug.direccion||(ses.temario||[]).length)?(pres?'presencial':'videollamada'):'',cita_link:lug.link||'',cita_direccion:lug.direccion||'',cita_temario:(ses.temario||[]).map(z=>z.titulo).filter(Boolean).join('; '),
        invitados:(x.invitados||[]).map(id=>{ const q=(c.people||[]).find(z=>z.id===id); return q?q.name:''; }).filter(Boolean).join('; '),
        estado:x.done?'Hecha':'Pendiente',fecha_hecha:x.done&&x.doneAt&&x.doneAt.slice(0,4)!=='2020'?x.doneAt.slice(0,10):'',tiempo_real_min:x.timeSpent||'',equipo:(x.team||[]).map(nm).filter(Boolean).join('; '),links:(x.links||[]).map(l=>(l.title?l.title+': ':'')+l.url).join(' | ')}); };
    top.forEach(x=>{ emit(x); subs.filter(k=>k.parentId===x.id).forEach(emit); }); });
  return rows; }
function expGo(fmt){ const p=store.project(expS.pid); if(!p) return; const cols=[...IMP_COLS,...EXP_EXTRA]; const rows=expRows(p).map(r=>cols.map(k=>r[k]==null?'':r[k]));
  const c=store.client(p.clientId)||{name:''}; const base='Tareas-'+(c.name+'-'+p.name).replace(/[^\wÁÉÍÓÚáéíóúñÑ-]+/g,'-')+'-'+todayISO();
  if(fmt==='xlsx'){ if(typeof XLSX==='undefined'){ alert('No se pudo cargar el generador de Excel. Revisa tu conexión.'); return; } const wb=XLSX.utils.book_new(); const ws=XLSX.utils.aoa_to_sheet([cols,...rows]); ws['!cols']=cols.map(k=>({wch:({nombre:46,descripcion:30,cita_objetivo:30,cita_link:30,cita_temario:30,links:30}[k])||14})); XLSX.utils.book_append_sheet(wb,ws,'Importar'); XLSX.writeFile(wb,base+'.xlsx'); }
  else { const q=v=>{ v=String(v); return /[",\n\r;]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v; }; const csv='﻿'+[cols,...rows].map(r=>r.map(q).join(',')).join('\r\n'); const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'})); a.download=base+'.csv'; document.body.appendChild(a); a.click(); setTimeout(()=>{ URL.revokeObjectURL(a.href); a.remove(); },500); }
  shareToast('⬇ Se exportaron '+rows.length+' fila(s)'); expS=null; render(); }

/* ================== MOVER UNA TAREA COMPLETA A OTRO PROYECTO / CLIENTE (Dirección y Gerencia) ================== */
let movT=null;
function openMovT(tid){ if(!canCopy()) return; const t=store.task(tid); const p=t&&store.project(t.projectId); if(!p) return; movT={tid,destClient:p.clientId,destPid:p.id,frenteId:'',copyFr:false,mode:'same',start:''}; render(); }
function closeMovT(){ movT=null; render(); }
function movTSet(k,v){ const t=store.task(movT.tid); movT[k]=v; if(k==='destClient'){ const ps=store.d.projects.filter(x=>x.clientId===v); movT.destPid=ps[0]?ps[0].id:''; movT.frenteId=''; } if(k==='destClient'||k==='destPid'){ movT.frenteId=''; movT.copyFr=!!movT.destPid&&movT.destPid!==t.projectId&&store.frentesOf(movT.destPid).length===0; } render(); }
function movTEff(){ const t=store.task(movT.tid); return !!movT.copyFr&&!!movT.destPid&&movT.destPid!==t.projectId; }
function movTModal(){ const t=store.task(movT.tid); const p=t&&store.project(t.projectId); if(!p){ movT=null; return ''; }
  const nSub=(t.subtasks||[]).filter(x=>!x.isSeries&&!x.seriesId).length; const dest=store.project(movT.destPid); const dFr=movT.destPid?store.frentesOf(movT.destPid):[];
  const clients=store.d.clients.slice().sort((a,b)=>a.name.localeCompare(b.name)); const projs=store.d.projects.filter(x=>x.clientId===movT.destClient);
  const other=movT.destPid&&movT.destPid!==t.projectId; const sameClient=dest&&dest.clientId===p.clientId;
  const frUi=other?`<div class="field" style="margin:8px 0 0"><label>¿Qué hacemos con el frente?</label><label class="gf-opt" style="margin:3px 0"><input type="radio" name="mt-fr" ${movTEff()?'checked':''} onchange="movT.copyFr=true;render()"> Llevar el mismo frente <span class="muted">(se crea en el destino si no existe, con su nombre y color)</span></label><label class="gf-opt" style="margin:3px 0"><input type="radio" name="mt-fr" ${!movTEff()?'checked':''} onchange="movT.copyFr=false;render()"> Elegir un frente que ya tenga el proyecto destino</label></div>`:'';
  return `<div class="modal active" style="z-index:150" onclick="if(event.target===this)closeMovT()"><div class="modal-card" style="max-width:520px"><div class="m-head"><div class="m-top"><h3 style="margin:0">↦ Mover «${esc(t.name)}»</h3><button class="x" onclick="closeMovT()">×</button></div></div><div class="m-body">
    <p class="muted" style="margin-top:0">Se mueve la tarea completa con sus <b>${nSub}</b> subtareas y sub-subtareas. <b>Conserva</b> avance, tiempos, comentarios, sesiones y dependencias; <b>no</b> se deja una copia en «${esc(p.name)}».</p>
    <div class="field"><label>Mover a</label><div style="display:flex;gap:8px;flex-wrap:wrap"><select onchange="movTSet('destClient',this.value)">${clients.map(c=>`<option value="${c.id}" ${c.id===movT.destClient?'selected':''}>${esc(c.name)}</option>`).join('')}</select><select onchange="movTSet('destPid',this.value)">${projs.map(x=>`<option value="${x.id}" ${x.id===movT.destPid?'selected':''}>${esc(x.name)}</option>`).join('')}</select></div></div>
    ${frUi}${movTEff()?'':`<div class="field"><label>Frente destino</label><select onchange="movT.frenteId=this.value"><option value="">Frente…</option>${dFr.map(f=>`<option value="${f.id}" ${f.id===(movT.frenteId||(!other?t.frenteId:''))?'selected':''}>${esc(f.name)}</option>`).join('')}</select>${dFr.length?'':'<div class="hint">Ese proyecto no tiene frentes: elige «Llevar el mismo frente».</div>'}</div>`}
    <div class="field"><label>Fechas</label>${[['same','Dejar las mismas fechas'],['start','Fecha nueva de inicio (respeta los días hábiles entre ellas)']].map(([k,l])=>`<label class="gf-opt" style="margin:3px 0"><input type="radio" name="mt-mode" ${movT.mode===k?'checked':''} onchange="movT.mode='${k}';render()"> ${l}</label>`).join('')}${movT.mode==='start'?`<input type="date" value="${movT.start}" onchange="movT.start=this.value" style="margin-top:6px">`:''}</div>
    ${!sameClient&&dest?'<div class="ses-resp" style="background:#fff7e0;color:#7a5f00">Es otro cliente: los invitados del cliente anterior se quitan de las sesiones, porque no existen en el nuevo.</div>':''}
    <div class="wiz-actions"><button class="btn ghost" onclick="closeMovT()">Cancelar</button><button class="btn" onclick="movTDo()" ${movT.destPid?'':'disabled'}>Mover</button></div></div></div></div>`; }
function movTDo(){ const M=movT; if(!M||!canCopy()) return; const t=store.task(M.tid); const dp=store.project(M.destPid); const sp=t&&store.project(t.projectId); if(!t||!dp||!sp) return;
  const other=dp.id!==sp.id; const eff=movTEff(); if(!eff&&!M.frenteId&&other){ alert('Elige el frente destino.'); return; }
  if(M.mode==='start'&&!M.start){ alert('Escribe la fecha de inicio.'); return; }
  if(!other&&!M.frenteId&&M.mode==='same'){ alert('Elige otro frente u otro proyecto para mover la tarea.'); return; }
  let fid=M.frenteId||t.frenteId; const created=[];
  if(eff){ const src=store.frentesOf(sp.id).find(f=>f.id===t.frenteId); const nm=(src&&src.name)||'General'; let f=store.frentesOf(dp.id).find(x=>impNz(x.name)===impNz(nm)); if(!f){ f=store.addFrente(dp.id,nm,src&&src.color); created.push(f.id); } fid=f.id; }
  const subs=(t.subtasks||[]).filter(x=>!x.isSeries&&!x.seriesId); const mapD=copyDateMapper([{t,subs}],M.mode,M.start);
  const dc=store.client(dp.clientId), sameClient=sp.clientId===dp.clientId;
  t.projectId=dp.id; t.frenteId=fid; t.subtitle=dc.name; delete t.ord;
  if(M.mode==='start'){ t.dueDate=mapD(t.dueDate); (t.subtasks||[]).forEach(x=>{ if(x.date) x.date=mapD(x.date); if(x.isSeries&&x.series&&x.series.startDate) x.series=Object.assign({},x.series,{startDate:mapD(x.series.startDate)}); }); }
  if(!sameClient) (t.subtasks||[]).forEach(x=>{ x.invitados=[]; if(x.isSeries&&x.series&&x.series.tpl) x.series=Object.assign({},x.series,{tpl:Object.assign({},x.series.tpl,{invitados:[]})}); });
  store.save(); if(typeof dbSaveTask==='function') dbSaveTask(t); logEvent(t.id,'Movió la tarea de «'+sp.name+'» a «'+dp.name+'»');
  movT=null; render(); shareToast('↦ «'+t.name+'» ahora está en «'+dp.name+'»'); }

/* ================== CÓDIGO DEL CLIENTE: CAMBIAR (lo sabe) y RESTAURAR (lo olvidó) ================== */
const RESET_CODE='123456';
let cpChg=null, cpChgShown=false, cpRecS=null;
function cpChgOpen(forced){ cpChg={forced:!!forced}; render(); setTimeout(()=>{ const e=document.getElementById('ch-cur'); if(e) e.focus(); },60); }
function cpChgClose(){ cpChg=null; render(); }
function cpChgModal(){ const ctx=cpCtx(); const forced=cpChg.forced||(ctx&&ctx.me.portal&&ctx.me.portal.reset);
  const inp=(id,l,ph)=>`<div class="field"><label>${l}</label><input id="${id}" type="password" inputmode="numeric" maxlength="6" autocomplete="off" placeholder="${ph||'••••••'}" onkeydown="if(event.key==='Enter')cpChgSave()"></div>`;
  return `<div class="modal active" style="z-index:150" onclick="if(event.target===this&&!${forced?'true':'false'})cpChgClose()"><div class="modal-card" style="max-width:420px"><div class="m-head"><div class="m-top"><h3 style="margin:0">🔑 Cambiar mi código</h3><button class="x" onclick="cpChgClose()">×</button></div></div><div class="m-body">
    <p class="muted" style="margin-top:0">${forced?'El equipo de Nuwek restableció tu código a uno temporal. <b>Escríbelo abajo y elige uno nuevo</b> que solo tú conozcas.':'Escribe tu código actual y elige uno nuevo de 6 números. Tendrás que escribir el nuevo dos veces para confirmarlo.'}</p>
    ${inp('ch-cur',forced?'Código temporal':'Código actual')}${inp('ch-new','Código nuevo (6 números)')}${inp('ch-new2','Repite el código nuevo')}
    <div id="ch-err" class="pin-err" style="color:#c0392b;min-height:18px;margin-bottom:6px"></div>
    <div class="wiz-actions"><button class="btn ghost" onclick="cpChgClose()">${forced?'Después':'Cancelar'}</button><button class="btn" onclick="cpChgSave()">Guardar código</button></div></div></div></div>`; }
function cpChgSave(){ const ctx=cpCtx(); if(!ctx) return; const po=ctx.me.portal; const cur=(val('ch-cur')||'').trim(), n1=(val('ch-new')||'').trim(), n2=(val('ch-new2')||'').trim(); const err=m=>{ const e=document.getElementById('ch-err'); if(e) e.textContent=m; };
  if(String(po.code)!==cur){ err('El código actual no coincide.'); return; }
  if(!/^\d{6}$/.test(n1)){ err('El código nuevo debe ser de exactamente 6 números.'); return; }
  if(n1===cur||n1===RESET_CODE){ err('Elige un código distinto al actual y al temporal.'); return; }
  if(n1!==n2){ err('Los dos códigos nuevos no son iguales.'); return; }
  store.updateClientPerson(ctx.c.id,ctx.me.id,{portal:Object.assign({},po,{code:n1,reset:false,recover:null})}); cpChg=null; render(); shareToast('🔑 Tu código se cambió correctamente'); }
/* restauración: el cliente avisa y el equipo (Dirección y Michelle) le pone el código temporal */
function cpRecOpen(){ cpRecS={done:false,err:''}; render(); setTimeout(()=>{ const e=document.getElementById('rc-user'); if(e) e.focus(); },60); }
function cpRecClose(){ cpRecS=null; render(); }
function cpRecModal(){ return `<div class="modal active" style="z-index:150" onclick="if(event.target===this)cpRecClose()"><div class="modal-card" style="max-width:420px"><div class="m-head"><div class="m-top"><h3 style="margin:0">¿Olvidaste tu código?</h3><button class="x" onclick="cpRecClose()">×</button></div></div><div class="m-body">
  ${cpRecS.done?`<div class="ses-resp" style="background:#e6f6ec;color:#1d6b3a">✅ Listo. Avisamos al equipo de Nuwek. En cuanto lo restablezcan te darán un <b>código temporal</b> y, al entrar, podrás elegir el tuyo.</div><div class="wiz-actions"><span></span><button class="btn" onclick="cpRecClose()">Entendido</button></div>`
  :`<p class="muted" style="margin-top:0">Escribe tu <b>usuario</b> y avisamos a Dirección y a Michelle para que restablezcan tu código. Cuando lo tengan te dirán cuál es el temporal.</p><div class="field"><label>Usuario</label><input id="rc-user" autocapitalize="off" onkeydown="if(event.key==='Enter')cpRecSend()"></div><div class="pin-err" style="color:#c0392b;min-height:18px">${esc(cpRecS.err||'')}</div><div class="wiz-actions"><button class="btn ghost" onclick="cpRecClose()">Cancelar</button><button class="btn" onclick="cpRecSend()">Avisar al equipo</button></div>`}</div></div></div>`; }
function cpRecSend(){ const u=(val('rc-user')||'').trim(); if(!u){ cpRecS.err='Escribe tu usuario.'; render(); return; }
  const f=findPortalUser(u); if(f&&f.p.portal.activo!==false){ const po=f.p.portal; const last=po.recover&&po.recover.ts; if(!last||Date.now()-new Date(last)>30*60000) store.updateClientPerson(f.c.id,f.p.id,{portal:Object.assign({},po,{recover:{ts:new Date().toISOString()}})}); }
  cpRecS.done=true; render(); }
/* lado Nuwek: Dirección y Michelle reciben el aviso y pueden restablecer */
function canRecover(){ const me=store.person(currentUser)||{}; return role==='gerencia'||/^michell/.test(impNz(me.name||'')); }
function pendingRecovery(){ if(!session||!canRecover()) return []; const out=[]; store.d.clients.forEach(c=>(c.people||[]).forEach(p=>{ const r=p.portal&&p.portal.recover; if(r&&p.portal.activo!==false) out.push({c,p,ts:r.ts}); })); return out; }
function resetClientCode(cid,pid,fromNotif){ const c=store.client(cid); const p=c&&(c.people||[]).find(x=>x.id===pid); if(!p||!p.portal) return; if(!confirm('¿Restablecer el código de '+p.name+' ('+c.name+') a '+RESET_CODE+'? Al entrar, el sistema le pedirá elegir uno nuevo.')) return;
  store.updateClientPerson(cid,pid,{portal:Object.assign({},p.portal,{code:RESET_CODE,reset:true,recover:null})}); shareToast('🔑 Código restablecido a '+RESET_CODE+'. Avísale a '+p.name+'.'); render(); }
function dismissRecovery(cid,pid){ const c=store.client(cid); const p=c&&(c.people||[]).find(x=>x.id===pid); if(!p||!p.portal) return; store.updateClientPerson(cid,pid,{portal:Object.assign({},p.portal,{recover:null})}); render(); }

/* ================== MINUTAS: cita (con cliente o interna) + burbuja flotante con cronómetro ================== */
/* Una cita nace sola: fecha + hora + más de una persona. Con invitados del cliente es «con cliente»; solo equipo Nuwek, «interna».
   Las minutas viven dentro de la subtarea (sin tablas nuevas): s.minutas=[{id,by,start,end,estado,asist,lines,links}] */
const MN_KEY='nuwekMinutaV';
let mnV=null, mnOpen=false, mnRev=null, mnKind='n', mnPrompt=null, mnNew=null, mnLinksOpen=false; const mnSeen=new Set();
function subPeopleN(s){ return (s.personId?1:0)+(s.team||[]).length+(s.invitados||[]).length; }
function citaKind(s){ if(!s||s.isSeries) return null; if((s.invitados||[]).length) return 'cliente'; if(s.date&&s.time&&subPeopleN(s)>=2) return 'interna'; return null; }
function mnClockTxt(ms){ const t=Math.max(0,Math.floor(ms/1000)); const h=Math.floor(t/3600), m=Math.floor(t%3600/60), x=t%60; return (h?h+':':'')+String(m).padStart(2,'0')+':'+String(x).padStart(2,'0'); }
function mnGet(){ if(!mnV) return null; const t=store.task(mnV.tid); const s=t&&(t.subtasks||[]).find(x=>x.id===mnV.sid); const m=s&&(s.minutas||[]).find(x=>x.id===mnV.mid); return (t&&s&&m)?{t,s,m}:null; }
function mnSave(mut,label){ const g=mnGet(); if(!g) return; if(!mnCanEdit(g.m)){ shareToast('Solo Dirección puede editar una minuta cerrada.'); return; } if(g.m.estado!=='curso') mnLogEdit(label||'cambios'); const arr=(g.s.minutas||[]).map(x=>x.id===g.m.id?mut(JSON.parse(JSON.stringify(x))):x); store.updateSubtask(g.t.id,g.s.id,{minutas:arr}); mnRender(); }
function mnActive(){ for(const t of store.d.tasks){ for(const s of (t.subtasks||[])){ const m=(s.minutas||[]).find(x=>x.estado==='curso'&&x.by===currentUser); if(m) return {tid:t.id,sid:s.id,mid:m.id}; } } return null; }
function mnRoleOk(){ return ['pm','gerente','gerencia'].includes(role); }
function mnStart(tid,sid){ const t=store.task(tid), s=t&&(t.subtasks||[]).find(x=>x.id===sid); if(!s) return;
  if(!mnRoleOk()){ shareToast('Solo PM, Gerencia o Dirección pueden tomar la minuta.'); return; }
  const open=(s.minutas||[]).find(x=>x.estado==='curso'&&x.by!==currentUser);
  if(open){ const who=store.person(open.by).name||'otra persona'; if(role!=='gerencia'){ alert('Esta cita ya tiene una minuta abierta por '+who+'. Solo una persona a la vez puede tomarla; debe cerrarla primero (o Dirección puede tomarla).'); return; } if(!confirm('La minuta está abierta por '+who+'. ¿Cerrarla y abrir una nueva a tu nombre?')) return; mnV={tid,sid,mid:open.id}; mnStopNow(true); }
  const act=mnActive(); if(act&&!(act.tid===tid&&act.sid===sid)){ if(!confirm('Ya tienes una minuta en curso. ¿Detenerla y empezar esta?')) return; mnV=act; mnStopNow(true); }
  const cur=(s.minutas||[]).find(x=>x.estado==='curso'); let mid;
  if(cur) mid=cur.id; else { const m={id:uid('mn_'),by:currentUser,start:new Date().toISOString(),end:null,estado:'curso',kind:citaKind(s)||'interna',asist:[],lines:[],links:[]}; store.updateSubtask(tid,sid,{minutas:[...(s.minutas||[]),m]}); mid=m.id; logEvent(tid,'Inició la minuta de «'+s.name+'»'); }
  mnPre=null; mnV={tid,sid,mid}; mnOpen=true; mnRev=null; mnPrompt=null; try{ localStorage.setItem(MN_KEY,JSON.stringify(mnV)); }catch(_){} mnRender(); }
let mnPre=null;
function mnOpenCita(tid,sid){ if(!mnRoleOk()) return; const t=store.task(tid); const s=t&&(t.subtasks||[]).find(x=>x.id===sid); if(!s) return; const cur=(s.minutas||[]).find(x=>x.estado==='curso'&&x.by===currentUser); if(cur){ mnPre=null; mnView(tid,sid,cur.id); return; } mnV=null; mnPre={tid,sid}; mnOpen=true; mnRev=null; mnRender(); }
function mnPrePanel(){ const t=store.task(mnPre.tid); const s=t&&(t.subtasks||[]).find(x=>x.id===mnPre.sid); if(!s){ mnPre=null; return ''; } const p=store.project(t.projectId)||{}; const c=store.client(p.clientId)||{name:''}; const k=citaKind(s)||(subHasCita(s)?'cliente':'interna'); const ms=(s.minutas||[]).slice().sort((a,b)=>a.start<b.start?1:-1);
  return `<div class="mn-panel"><div class="mn-h"><div><div class="mn-t">${esc(s.name)}</div><div class="mn-m">${k==='cliente'?'Con cliente':'Interna'} · ${esc(c.name)} · ${s.date?esc(dLabel(s.date)):''} ${esc(s.time||'')}</div></div><div class="mn-hr"><button class="mn-x" title="Cerrar" onclick="mnPre=null;mnOpen=false;mnRender()">×</button></div></div>
    <div class="mn-body"><button class="mn-play" onclick="mnStart('${t.id}','${s.id}')">▶ Iniciar minuta</button><div class="mn-sec">Minutas de esta cita</div>${ms.map(m=>`<div class="mn-lkrow"><span>${esc(dLabel(m.start.slice(0,10)))} · ${m.end?mnClockTxt(new Date(m.end)-new Date(m.start)):'en curso'} · ${m.lines.filter(l=>l.kind==='n').length} nota(s) · ${m.lines.filter(l=>l.kind==='a').length} actividad(es)</span><a onclick="mnView('${t.id}','${s.id}','${m.id}')">abrir</a></div>`).join('')||'<div class="muted" style="padding:4px 0">Aún no hay minutas de esta cita.</div>'}</div></div>`; }
function mnView(tid,sid,mid){ mnPre=null; mnV={tid,sid,mid}; mnOpen=true; mnRev=null; mnRender(); }
function mnToggle(){ mnOpen=!mnOpen; mnRender(); }
function mnStopNow(silent){ const g=mnGet(); if(!g) return; mnSave(m=>Object.assign(m,{end:new Date().toISOString(),estado:'cerrada'})); try{ localStorage.removeItem(MN_KEY); }catch(_){} logEvent(g.t.id,'Cerró la minuta de «'+g.s.name+'»'); if(!silent){ mnRev={}; mnOpen=true; mnRender(); } }
function mnClose(){ mnRev=null; mnV=null; mnOpen=false; try{ localStorage.removeItem(MN_KEY); }catch(_){} mnRender(); }
function mnAsistToggle(id,tipo,name){ mnSave(m=>{ const i=m.asist.findIndex(a=>a.id===id); if(i>=0) m.asist.splice(i,1); else m.asist.push({id,name,tipo,at:new Date().toISOString()}); return m; }); }
function mnAsistAdd(sel){ const id=sel.value; if(!id) return; const u=store.person(id); mnAsistToggle(id,'n',u.name); }
let mnDragId=null;
function mnDragStart(e,id){ mnDragId=id; try{ e.dataTransfer.effectAllowed='move'; e.dataTransfer.setData('text/plain',id); }catch(_){} const r=e.target.closest('.mn-ln'); if(r){ try{ e.dataTransfer.setDragImage(r,10,10); }catch(_){} r.classList.add('drag'); } }
function mnDragEnd(){ mnDragId=null; document.querySelectorAll('.mn-ln.drag,.mn-ln.over').forEach(x=>x.classList.remove('drag','over')); }
function mnDragOver(e){ if(!mnDragId) return; e.preventDefault(); e.currentTarget.classList.add('over'); }
function mnDrop(e,toId){ e.preventDefault(); const from=mnDragId; mnDragEnd(); if(!from||from===toId) return;
  mnSave(m=>{ const i=m.lines.findIndex(x=>x.id===from); const j0=m.lines.findIndex(x=>x.id===toId); if(i<0||j0<0) return m; const [it]=m.lines.splice(i,1); const j=m.lines.findIndex(x=>x.id===toId); m.lines.splice(i<j0?j+1:j,0,it); return m; },'reordenó líneas'); }
function mnAdd(){ const el=document.getElementById('mn-in'); const v=(el&&el.value||'').trim(); if(!v) return; mnSave(m=>{ m.lines.push({id:uid('ml_'),kind:mnKind,txt:v,done:false,link:null,resp:'',ts:new Date().toISOString()}); return m; }); setTimeout(()=>{ const e=document.getElementById('mn-in'); if(e){ e.value=''; e.focus(); const b=document.querySelector('.mn-lines'); if(b) b.scrollTop=b.scrollHeight; } },0); }
function mnKindSet(k){ mnKind=k; mnRender(); setTimeout(()=>{ const e=document.getElementById('mn-in'); if(e) e.focus(); },0); }
function mnLineKind(lid){ mnSave(m=>{ const l=m.lines.find(x=>x.id===lid); if(l){ l.kind=l.kind==='a'?'n':'a'; if(l.kind==='n') l.done=false; } return m; }); }
function mnLineDone(lid){ mnSave(m=>{ const l=m.lines.find(x=>x.id===lid); if(l) l.done=!l.done; return m; }); }
function mnLineDel(lid){ mnSave(m=>{ m.lines=m.lines.filter(x=>x.id!==lid); return m; }); }
function mnLineTxt(lid,v){ const g=mnGet(); if(!g) return; const arr=(g.s.minutas||[]).map(x=>{ if(x.id!==g.m.id) return x; const y=JSON.parse(JSON.stringify(x)); const l=y.lines.find(z=>z.id===lid); if(l) l.txt=v; return y; }); store.updateSubtask(g.t.id,g.s.id,{minutas:arr}); }
function mnLineResp(lid,v){ mnSave(m=>{ const l=m.lines.find(x=>x.id===lid); if(l) l.resp=v; return m; }); }
function mnLineDate(lid,v){ const ok=okDate(v); if(v&&ok!==v) shareToast(ok?'Corregí el año de la fecha a '+ok.slice(0,4)+'.':'Esa fecha no es válida; revisa el año.'); mnSave(m=>{ const l=m.lines.find(x=>x.id===lid); if(l) l.date=ok; return m; }); }
function mnLinkAdd(){ const t=(document.getElementById('mn-lt')||{}).value||'', u=(document.getElementById('mn-lu')||{}).value||''; if(!u.trim()) return; const url=/^https?:\/\//i.test(u.trim())?u.trim():'https://'+u.trim(); mnSave(m=>{ m.links.push({t:t.trim()||url.replace(/^https?:\/\//,'').slice(0,40),u:url}); return m; }); }
function mnLinkDel(i){ mnSave(m=>{ m.links.splice(i,1); return m; }); }
/* ligar un acuerdo con una tarea / subtarea / sub-subtarea */
function mnLinkTo(lid,tid,sid){ const g=mnGet(); if(!g) return; const tt=store.task(tid); const ss=sid&&tt&&(tt.subtasks||[]).find(x=>x.id===sid); let txt='';
  mnSave(m=>{ const l=m.lines.find(x=>x.id===lid); if(l){ txt=l.txt; l.link={tid,sid:sid||''}; } return m; }); logEvent(tid,'Acuerdo de minuta: «'+txt.slice(0,80)+'»'+(ss?' (ligado a «'+ss.name+'»)':'')); mnRev&&(mnRev.pick=null); mnRender(); }
function mnUnlink(lid){ mnSave(m=>{ const l=m.lines.find(x=>x.id===lid); if(l) l.link=null; return m; }); }
function mnCreateSub(lid,tid){ if(!canSubDate()){ alert('Crear subtareas es de PM, Gerencia o Dirección. Deja el acuerdo ligado a una existente o pídeselo a alguien de ese nivel.'); return; }
  const g=mnGet(); const l=g&&g.m.lines.find(x=>x.id===lid); if(!l) return; const t=store.task(tid); if(!t) return;
  const st={name:l.txt,personId:l.resp||currentUser,date:l.date||'',time:'',durMin:null,invitados:[]}; store.addSubtask(tid,st); logEvent(tid,'Creó la subtarea «'+st.name+'» desde la minuta de «'+g.s.name+'»'); mnLinkTo(lid,tid,st.id); }
function mnPickOpen(lid){ mnRev=mnRev||{}; const g=mnGet(); mnRev.pick={lid,pid:g?g.t.projectId:'',tid:g?g.t.id:'',sid:''}; mnRender(); }
function mnPickSet(k,v){ const P=mnRev.pick; P[k]=v; if(k==='pid'){ P.tid=''; P.sid=''; } if(k==='tid') P.sid=''; mnRender(); }
function mnReviewOpen(){ mnRev=mnRev||{}; mnRender(); }
function mnReviewClose(){ mnRev=null; mnRender(); }
function mnShareSet(v){ mnSave(m=>{ m.share=!!v; return m; }); }
/* panel flotante */
let mnGeo=(()=>{ try{ return JSON.parse(localStorage.getItem('nuwekMinutaGeo')||'null')||{}; }catch(_){ return {}; } })();
function mnGeoSave(){ try{ localStorage.setItem('nuwekMinutaGeo',JSON.stringify(mnGeo)); }catch(_){} }
function mnGeoApply(){ const r=document.getElementById('mn-root'); if(!r) return;
  if(mnGeo.x!=null){ const x=Math.max(0,Math.min(mnGeo.x,window.innerWidth-90)), y=Math.max(0,Math.min(mnGeo.y,window.innerHeight-60)); r.style.left=x+'px'; r.style.top=y+'px'; r.style.bottom='auto'; }
  const pn=r.querySelector('.mn-panel'); if(pn&&mnGeo.w){ pn.style.width=Math.min(mnGeo.w,window.innerWidth-16)+'px'; pn.style.maxHeight='none'; if(mnGeo.h) pn.style.height=Math.min(mnGeo.h,window.innerHeight-16)+'px'; } }
(function(){ if(window.__mnDrag) return; window.__mnDrag=1; let d=null;
  document.addEventListener('pointerdown',e=>{ const pn=document.querySelector('#mn-root .mn-panel'); if(pn&&e.target===pn){ const b=pn.getBoundingClientRect(); window.__mnRz=(e.clientX>b.right-26&&e.clientY>b.bottom-26); } const h=e.target.closest&&e.target.closest('#mn-root .mn-h,#mn-root .mn-fab'); if(!h||e.target.closest('button.mn-x,.mn-hr button,.mn-hr a')) return; const r=document.getElementById('mn-root'); const b=r.getBoundingClientRect(); d={h,sx:e.clientX,sy:e.clientY,ox:b.left,oy:b.top,moved:false}; });
  document.addEventListener('pointermove',e=>{ if(!d) return; const dx=e.clientX-d.sx, dy=e.clientY-d.sy; if(!d.moved&&Math.abs(dx)+Math.abs(dy)<6) return; d.moved=true; e.preventDefault(); mnGeo.x=d.ox+dx; mnGeo.y=d.oy+dy; mnGeoApply(); },{passive:false});
  document.addEventListener('pointerup',e=>{ const rs=document.querySelector('#mn-root .mn-panel'); if(d&&d.moved){ if(d.h.classList.contains('mn-fab')) window.__mnNoClick=Date.now(); mnGeo.x=Math.max(0,Math.min(mnGeo.x,window.innerWidth-90)); mnGeo.y=Math.max(0,Math.min(mnGeo.y,window.innerHeight-60)); mnGeoSave(); }
    else if(rs&&window.__mnRz){ mnGeo.w=rs.offsetWidth; mnGeo.h=rs.offsetHeight; mnGeoSave(); }
    window.__mnRz=false; d=null; });
  document.addEventListener('click',e=>{ if(window.__mnNoClick&&Date.now()-window.__mnNoClick<400&&e.target.closest&&e.target.closest('.mn-fab')){ e.stopPropagation(); e.preventDefault(); } },true);
})();
function mnGeoReset(){ mnGeo={}; mnGeoSave(); const r=document.getElementById('mn-root'); if(r){ r.style.left=r.style.top=r.style.bottom=''; } mnRender(); }
function mnRoot(){ let r=document.getElementById('mn-root'); if(!r){ r=document.createElement('div'); r.id='mn-root'; document.body.appendChild(r); } return r; }
function mnLinkHtml(g,l){ const k=l.link; const tt=k&&store.task(k.tid); const ss=k&&k.sid&&tt&&(tt.subtasks||[]).find(x=>x.id===k.sid);
  const P=mnRev&&mnRev.pick&&mnRev.pick.lid===l.id?mnRev.pick:null;
  if(k&&tt) return `<div class="mn-lk ok">✔ Ligado a <b>${esc(tt.name)}</b>${ss?' › '+esc(ss.name):''} <a onclick="mnUnlink('${l.id}')">quitar</a></div>`;
  if(P){ const projs=store.d.projects.slice().sort((a,b)=>(store.client(a.clientId).name+a.name).localeCompare(store.client(b.clientId).name+b.name)); const tasks=P.pid?store.tasksOf(P.pid):[]; const tk=P.tid&&store.task(P.tid); const subs=tk?(tk.subtasks||[]).filter(x=>!x.isSeries&&!x.seriesId):[];
    return `<div class="mn-pick"><select onchange="mnPickSet('pid',this.value)"><option value="">Proyecto…</option>${projs.map(x=>`<option value="${x.id}" ${x.id===P.pid?'selected':''}>${esc(store.client(x.clientId).name)} · ${esc(x.name)}</option>`).join('')}</select>
      <select onchange="mnPickSet('tid',this.value)"><option value="">Tarea…</option>${tasks.map(x=>`<option value="${x.id}" ${x.id===P.tid?'selected':''}>${esc(x.name)}</option>`).join('')}</select>
      <select onchange="mnPickSet('sid',this.value)"><option value="">(toda la tarea)</option>${subs.map(x=>`<option value="${x.id}" ${x.id===P.sid?'selected':''}>${x.parentId?'↳ ':''}${esc(x.name)}</option>`).join('')}</select>
      <div class="mn-btns"><button class="mn-b" ${P.tid?'':'disabled'} onclick="mnLinkTo('${l.id}','${P.tid}','${P.sid}')">Ligar</button><button class="mn-b ghost" ${P.tid?'':'disabled'} onclick="mnCreateSub('${l.id}','${P.tid}')">+ Crear subtarea aquí</button><button class="mn-b ghost" onclick="mnRev.pick=null;mnRender()">Cancelar</button></div></div>`; }
  return `<div class="mn-btns"><button class="mn-b" onclick="mnLinkTo('${l.id}','${g.t.id}','${g.s.id}')">Ligar a esta cita</button><button class="mn-b ghost" onclick="mnCreateSub('${l.id}','${g.t.id}')">+ Subtarea nueva</button><button class="mn-b ghost" onclick="mnPickOpen('${l.id}')">Elegir otra…</button></div>`; }
function mnPanelHtml(g){ const {t,s,m}=g; const rec=m.estado==='curso'; if(!mnCanEdit(m)) return mnPanelRO(g); const p=store.project(t.projectId)||{}; const c=store.client(p.clientId)||{name:''}; const kind=m.kind==='cliente'?'Con cliente':'Interna';
  const planned=[]; if(s.personId) planned.push({id:s.personId,tipo:'n'}); (s.team||[]).forEach(id=>planned.push({id,tipo:'n'})); (s.invitados||[]).forEach(id=>planned.push({id,tipo:'c'}));
  const here=new Set(m.asist.map(a=>a.id)); const names=(id,tipo)=>tipo==='c'?(((c.people||[]).find(x=>x.id===id)||{}).name||'Cliente'):(store.person(id).name||'—');
  const chips=[...planned.map(x=>({id:x.id,tipo:x.tipo,name:names(x.id,x.tipo)})),...m.asist.filter(a=>!planned.some(x=>x.id===a.id)).map(a=>({id:a.id,tipo:a.tipo,name:a.name}))];
  const staffOpts=store.activeStaff().filter(u=>!chips.some(x=>x.id===u.id)).map(u=>`<option value="${u.id}">${esc(u.name)}</option>`).join('');
  const acts=m.lines.filter(l=>l.kind==='a'); const unl=acts.filter(l=>!l.link).length;
  const dur=(m.end?new Date(m.end):new Date())-new Date(m.start);
  const head=`<div class="mn-h"><div><div class="mn-t">${esc(s.name)}</div><div class="mn-m">${kind} · ${esc(c.name)} · ${esc(t.name)}</div></div><div class="mn-hr"><div class="mn-clk" data-start="${m.start}" data-end="${m.end||''}">${mnClockTxt(dur)}</div>${rec?'<button class="mn-stop" title="Detener y revisar" onclick="mnStopNow()">■ Stop</button>':'<span class="mn-fin">terminada</span>'}<button class="mn-x" title="Minimizar" onclick="mnToggle()">–</button></div></div>`;
  if(mnRev){ return head+`<div class="mn-body"><div class="mn-sec">Revisión de acuerdos <span class="muted">· ${acts.length} actividad(es), ${unl} sin ligar</span></div>
    ${acts.map(l=>`<div class="mn-rv"><div class="mn-rt">○ ${esc(l.txt)} <span class="muted">${l.resp?'· '+esc(store.person(l.resp).name):''}${l.date?' · '+esc(dLabel(l.date)):''}</span></div>
      <div class="mn-opt"><select onchange="mnLineResp('${l.id}',this.value)"><option value="">Responsable…</option>${store.activeStaff().map(u=>`<option value="${u.id}" ${l.resp===u.id?'selected':''}>${esc(u.name)}</option>`).join('')}</select><input type="date" value="${l.date||''}" onchange="mnLineDate('${l.id}',this.value)"></div>${mnLinkHtml(g,l)}</div>`).join('')||'<div class="muted" style="padding:8px">No marcaste actividades en esta minuta.</div>'}
    <div class="mn-sec">Enlaces trabajados</div>${m.links.map((x,i)=>`<div class="mn-lkrow"><a href="${esc(x.u)}" target="_blank" rel="noopener noreferrer">🔗 ${esc(x.t)}</a><a class="mn-del" onclick="mnLinkDel(${i})">✕</a></div>`).join('')}
    <div class="mn-add"><input id="mn-lt" placeholder="Título (Notion, documento…)"><input id="mn-lu" placeholder="https://…" onkeydown="if(event.key==='Enter')mnLinkAdd()"><button class="mn-b" onclick="mnLinkAdd()">＋</button></div>
    ${m.kind==='cliente'?`<label class="mn-chk"><input type="checkbox" ${m.share?'checked':''} onchange="mnShareSet(this.checked)"> Marcar para compartir con el cliente <span class="muted">(próximamente en su portal)</span></label>`:''}
    <div class="mn-btns" style="margin-top:8px"><button class="mn-b" onclick="mnReviewClose()">Listo</button></div></div>`; }
  return head+`<div class="mn-body"><div class="mn-sec">¿Quién está?</div><div class="mn-chips">${chips.map(x=>`<button class="mn-chip ${here.has(x.id)?'on':''} ${x.tipo==='c'?'cli':''}" onclick="mnAsistToggle('${x.id}','${x.tipo}','${esc(x.name)}')">${here.has(x.id)?'✔ ':''}${esc(x.name)}</button>`).join('')}${staffOpts?`<select class="mn-addp" onchange="mnAsistAdd(this);this.value=''"><option value="">＋ Agregar</option>${staffOpts}</select>`:''}</div>
    <div class="mn-sec">Notas y actividades <span class="muted">· ○ actividad · • nota</span></div>
    <div class="mn-lines">${m.lines.map(l=>`<div class="mn-ln ${l.kind==='a'?'act':''} ${l.done?'done':''}" data-lid="${l.id}" ondragover="mnDragOver(event)" ondragleave="this.classList.remove('over')" ondrop="mnDrop(event,'${l.id}')"><span class="mn-hd" title="Arrastra para cambiar de lugar" draggable="true" ondragstart="mnDragStart(event,'${l.id}')" ondragend="mnDragEnd()">⠿</span><button class="mn-mk" title="${l.kind==='a'?'Marcar hecha':'Es una nota'}" onclick="${l.kind==='a'?`mnLineDone('${l.id}')`:`mnLineKind('${l.id}')`}">${l.kind==='a'?(l.done?'◉':'○'):'•'}</button><input class="mn-tx" value="${esc(l.txt)}" onchange="mnLineTxt('${l.id}',this.value)"><button class="mn-sw" title="${l.kind==='a'?'Convertir en nota':'Convertir en actividad'}" onclick="mnLineKind('${l.id}')">${l.kind==='a'?'•':'○'}</button><button class="mn-del" onclick="mnLineDel('${l.id}')">✕</button>${l.link?'<span class="mn-ok" title="Ligada">🔗</span>':''}</div>`).join('')||'<div class="muted" style="padding:6px 2px">Escribe abajo. Enter agrega la línea.</div>'}</div>
    <div class="mn-inrow"><div class="mn-kd"><button class="${mnKind==='n'?'on':''}" onclick="mnKindSet('n')">• Nota</button><button class="${mnKind==='a'?'on':''}" onclick="mnKindSet('a')">○ Actividad</button></div><input id="mn-in" placeholder="${mnKind==='a'?'Nueva actividad…':'Nueva nota…'}" onkeydown="if(event.key==='Enter'){event.preventDefault();mnAdd()}"><button class="mn-b" onclick="mnAdd()">↵</button></div>
    <div class="mn-foot"><a onclick="mnLinksOpen=!mnLinksOpen;mnRender()">🔗 Enlaces (${m.links.length})</a><a onclick="mnReviewOpen()">Revisar acuerdos${unl?` (${unl} sin ligar)`:''}</a><a onclick="mnClose()">Cerrar panel</a></div>
    ${mnLinksOpen?`<div class="mn-sec">Enlaces</div>${m.links.map((x,i)=>`<div class="mn-lkrow"><a href="${esc(x.u)}" target="_blank" rel="noopener noreferrer">🔗 ${esc(x.t)}</a><a class="mn-del" onclick="mnLinkDel(${i})">✕</a></div>`).join('')}<div class="mn-add"><input id="mn-lt" placeholder="Título"><input id="mn-lu" placeholder="https://…" onkeydown="if(event.key==='Enter')mnLinkAdd()"><button class="mn-b" onclick="mnLinkAdd()">＋</button></div>`:''}</div>`; }
function mnPanelRO(g){ const esc=mnEsc; const {t,s,m}=g; const p=store.project(t.projectId)||{}; const c=store.client(p.clientId)||{name:''};
  return `<div class="mn-h"><div><div class="mn-t">${esc(s.name)}</div><div class="mn-m">${m.kind==='cliente'?'Con cliente':'Interna'} · ${esc(c.name)} · solo lectura</div></div><div class="mn-hr"><button class="mn-x" title="Minimizar" onclick="mnToggle()">–</button></div></div><div class="mn-body">${mnSumBody(g)}<div class="mn-btns" style="margin-top:8px"><button class="mn-b" onclick="mnSumOpen('${t.id}','${s.id}','${m.id}')">Ver resumen / imprimir</button></div><div class="muted" style="font-size:.74rem;margin-top:6px">Solo Dirección puede editar una minuta cerrada.</div></div>`; }
function mnRender(){ if(!session){ const r=document.getElementById('mn-root'); if(r) r.innerHTML=''; return; } const r=mnRoot(); if(!mnV){ try{ const o=JSON.parse(localStorage.getItem(MN_KEY)||'null'); if(o) mnV=o; }catch(_){} }
  const g=mnGet(); if(mnV&&!g) mnV=null;
  const inEl=document.getElementById('mn-in'); const keep=inEl?{v:inEl.value,f:document.activeElement===inEl,s:inEl.selectionStart}:null; const ls=document.querySelector('.mn-lines'); const lt=ls?ls.scrollTop:0;
  let h='';
  if(mnPrompt&&!g){ h+=`<div class="mn-prompt"><b>📝 Es hora de «${esc(mnPrompt.title)}»</b><div class="muted">¿Iniciamos la minuta?</div><div class="mn-btns"><button class="mn-b" onclick="mnStart('${mnPrompt.tid}','${mnPrompt.sid}')">▶ Iniciar minuta</button><button class="mn-b ghost" onclick="mnPrompt=null;mnRender()">Ahora no</button></div></div>`; }
  if(mnPre&&!g&&mnOpen) h+=mnPrePanel();
  if(g){ const rec=g.m.estado==='curso'; if(mnOpen) h+=`<div class="mn-panel">${mnPanelHtml(g)}</div>`;
    h+=`<button class="mn-fab ${rec?'rec':''}" title="${rec?'Minuta en curso':'Minuta'}" onclick="mnToggle()"><span class="mn-dot"></span><span class="mn-clk" data-start="${g.m.start}" data-end="${g.m.end||''}">${mnClockTxt((g.m.end?new Date(g.m.end):new Date())-new Date(g.m.start))}</span><span class="mn-ico">📝</span></button>`; }
  r.innerHTML=h; mnGeoApply();
  const ni=document.getElementById('mn-in'); if(ni&&keep){ ni.value=keep.v; if(keep.f){ ni.focus(); try{ ni.setSelectionRange(keep.s,keep.s); }catch(_){} } } const nl=document.querySelector('.mn-lines'); if(nl) nl.scrollTop=lt; }
setInterval(()=>{ document.querySelectorAll('.mn-clk').forEach(e=>{ if(e.dataset.end) return; e.textContent=mnClockTxt(Date.now()-new Date(e.dataset.start)); }); },1000);
/* ---- Resumen imprimible, permisos y acceso por código desde el link de la sesión ---- */
let mnSum=null, mnAuth=null; const mnFails={};
function mnCanEdit(m){ return m.estado==='curso'?(m.by===currentUser||role==='gerencia'):role==='gerencia'; }
function mnLogEdit(label){ const g=mnGet(); if(g&&g.m.estado!=='curso') logEvent(g.t.id,'Editó la minuta cerrada de «'+g.s.name+'»'+(label?': '+label:'')); }
function mnSumOpen(tid,sid,mid){ mnSum={tid,sid,mid:mid||''}; mnPre=null; render(); }
function mnSumClose(){ mnSum=null; render(); }
function mnSumPick(mid){ mnSum.mid=mid; mnSum.askDel=false; render(); }
function mnDel(){ const g=mnSumGet(); if(!g||!g.m) return; if(!['gerente','gerencia'].includes(role)){ shareToast('Solo Gerencia o Dirección pueden eliminar una minuta.'); return; }
  if(!mnSum.askDel){ mnSum.askDel=true; render(); return; }
  store.updateSubtask(g.t.id,g.s.id,{minutas:(g.s.minutas||[]).filter(x=>x.id!==g.m.id)}); logEvent(g.t.id,'Eliminó la minuta del '+dLabel(g.m.start.slice(0,10))+' de «'+g.s.name+'»');
  if(mnV&&mnV.mid===g.m.id){ mnV=null; try{ localStorage.removeItem(MN_KEY); }catch(_){} } mnSum=null; mnRender(); render(); shareToast('Minuta eliminada.'); }
function mnDelNo(){ if(mnSum){ mnSum.askDel=false; render(); } }
function mnSumStart(){ const {tid,sid}=mnSum; mnSum=null; mnStart(tid,sid); render(); }
function mnSumEdit(){ const g=mnSumGet(); if(!g||!g.m) return; mnSum=null; mnView(g.t.id,g.s.id,g.m.id); render(); }
function mnSumGet(){ if(!mnSum) return null; const t=store.task(mnSum.tid); const s=t&&(t.subtasks||[]).find(x=>x.id===mnSum.sid); if(!s) return null; const ms=(s.minutas||[]).slice().sort((a,b)=>a.start<b.start?1:-1); const m=mnSum.mid?ms.find(x=>x.id===mnSum.mid):ms[0]; return {t,s,ms,m:m||null}; }
function mnLinkTxt(l){ const k=l.link; const tt=k&&store.task(k.tid); const ss=k&&k.sid&&tt&&(tt.subtasks||[]).find(x=>x.id===k.sid); return tt?(tt.name+(ss?' › '+ss.name:'')):''; }
function mnEsc(v){ return String(v==null?'':v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function mnSumBody(g){ const esc=mnEsc; const {t,s,m}=g; const by=store.person(m.by).name||'—'; const dur=(m.end?new Date(m.end):new Date())-new Date(m.start); const notes=m.lines.filter(l=>l.kind==='n'), acts=m.lines.filter(l=>l.kind==='a');
  return `<div class="mn-sm"><div class="mn-sm-meta"><span>🗓 ${esc(dLabel(m.start.slice(0,10)))} · ${new Date(m.start).toLocaleTimeString('es-MX',{hour:'2-digit',minute:'2-digit'})}${m.end?' – '+new Date(m.end).toLocaleTimeString('es-MX',{hour:'2-digit',minute:'2-digit'}):' · en curso'}</span><span>⏱ ${mnClockTxt(dur)}</span><span>✍️ Tomó la minuta: <b>${esc(by)}</b></span></div>
    <h5>Asistentes</h5><div>${m.asist.map(a=>`<span class="mn-chip on ${a.tipo==='c'?'cli':''}">${esc(a.name)}</span>`).join('')||'<span class="muted">Sin registro de asistentes.</span>'}</div>
    <h5>Notas</h5>${notes.map(l=>`<div class="mn-sl">• ${esc(l.txt)}</div>`).join('')||'<div class="muted">Sin notas.</div>'}
    <h5>Actividades y acuerdos</h5>${acts.map(l=>`<div class="mn-sl">${l.done?'◉':'○'} ${esc(l.txt)} <span class="muted">${l.resp?'· '+esc(store.person(l.resp).name):''}${l.date?' · '+esc(dLabel(l.date)):''}${l.link?' · 🔗 '+esc(mnLinkTxt(l)):' · sin ligar'}</span></div>`).join('')||'<div class="muted">Sin actividades.</div>'}
    <h5>Enlaces</h5>${m.links.map(x=>`<div class="mn-sl"><a href="${esc(x.u)}" target="_blank" rel="noopener noreferrer">🔗 ${esc(x.t)}</a></div>`).join('')||'<div class="muted">Sin enlaces.</div>'}</div>`; }
function mnSumModal(){ const esc=mnEsc; const g=mnSumGet(); if(!g){ mnSum=null; return ''; } const {t,s,ms,m}=g; const p=store.project(t.projectId)||{}; const c=store.client(p.clientId)||{name:''}; const k=citaKind(s)||(subHasCita(s)?'cliente':'interna');
  let tok=s.shareToken; const url=tok?sessionShareUrl(t.id,s.id,tok):''; 
  return `<div class="modal active" style="z-index:150" onclick="if(event.target===this)mnSumClose()"><div class="modal-card" style="max-width:640px"><div class="m-head"><div class="m-top"><div><div class="pill ${k==='cliente'?'green':'yellow'}">${k==='cliente'?'con cliente':'interna'}</div><h3 style="margin:6px 0 0">📝 ${esc(s.name)}</h3><div class="muted" style="font-size:.8rem">${esc(c.name)} · ${esc(p.name)} · ${esc(t.name)}${s.date?' · '+esc(dLabel(s.date)):''} ${esc(s.time||'')}</div></div><button class="x" onclick="mnSumClose()">×</button></div></div><div class="m-body">
    <div class="field"><label>🔗 Link de la sesión</label><div style="display:flex;gap:6px"><input readonly value="${esc(url||'Se genera al copiarlo')}" style="flex:1;font-size:.78rem" onfocus="this.select()"><button class="btn ghost sm" onclick="copySessionLink('${t.id}','${s.id}');setTimeout(render,300)">Copiar</button></div></div>
    ${m?`${ms.length>1?`<div class="mn-chips" style="margin-bottom:8px">${ms.map(x=>`<button class="mn-chip ${x.id===m.id?'on':''}" onclick="mnSumPick('${x.id}')">${esc(dLabel(x.start.slice(0,10)))} · ${x.estado==='curso'?'en curso':mnClockTxt(new Date(x.end)-new Date(x.start))}</button>`).join('')}</div>`:''}${mnSumBody(g)}
      <div class="wiz-actions"><span class="muted" style="font-size:.74rem;margin-right:auto">${role==='gerencia'?'Solo Dirección edita; cada cambio queda en el log.':'Solo Dirección puede editar una minuta cerrada.'}</span>
        ${m.estado==='curso'&&mnCanEdit(m)?`<button class="btn ghost" onclick="mnSumEdit()">▶ Continuar</button>`:''}${m.estado!=='curso'&&role==='gerencia'?`<button class="btn ghost" onclick="mnSumEdit()">✏️ Editar</button>`:''}${['gerente','gerencia'].includes(role)?(mnSum.askDel?`<span style="color:#c0392b;font-weight:700;font-size:.8rem">¿Eliminar esta minuta? No se puede deshacer.</span><button class="btn" style="background:#c0392b" onclick="mnDel()">Sí, eliminar</button><button class="btn ghost" onclick="mnDelNo()">No</button>`:`<button class="btn ghost" style="color:#c0392b" onclick="mnDel()">🗑 Eliminar</button>`):''}<button class="btn" onclick="mnPrint()">🖨 Imprimir / PDF</button></div>`
    :`<div class="ses-resp" style="background:#f2f1ea;color:#4b5b54;margin:8px 0">Esta cita todavía no tiene minuta.</div>${mnRoleOk()?`<button class="mn-play" onclick="mnSumStart()">▶ Iniciar minuta</button>`:'<div class="muted" style="font-size:.78rem">Solo PM, Gerencia o Dirección pueden iniciarla.</div>'}`}
    ${m&&m.estado!=='curso'&&mnRoleOk()?`<div style="margin-top:8px"><a style="cursor:pointer;color:var(--green);font-weight:700;font-size:.8rem" onclick="mnSumStart()">＋ Iniciar otra minuta de esta cita</a></div>`:''}</div></div></div>`; }
function mnPrint(){ const g=mnSumGet(); if(!g||!g.m) return; const {t,s,m}=g; const p=store.project(t.projectId)||{}; const c=store.client(p.clientId)||{name:''}; const by=store.person(m.by).name||'—'; const hx=v=>String(v==null?'':v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const dur=(m.end?new Date(m.end):new Date())-new Date(m.start); const tm=d=>new Date(d).toLocaleTimeString('es-MX',{hour:'2-digit',minute:'2-digit'});
  const notes=m.lines.filter(l=>l.kind==='n'), acts=m.lines.filter(l=>l.kind==='a');
  const html=`<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><title>Minuta · ${hx(s.name)}</title><style>@page{size:A4;margin:16mm}body{font-family:Inter,Arial,sans-serif;color:#223c36;font-size:12px;-webkit-print-color-adjust:exact}h1{font-size:20px;margin:0}h2{font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:#6b7d76;margin:18px 0 6px;border-bottom:1px solid #d9d7cb;padding-bottom:3px}.top{border-bottom:2px solid #223c36;padding-bottom:8px;margin-bottom:10px;display:flex;justify-content:space-between;align-items:flex-end}.meta{display:flex;gap:18px;flex-wrap:wrap;margin:8px 0;color:#4b5b54}table{width:100%;border-collapse:collapse}td,th{border-bottom:1px solid #eeede6;padding:4px 6px;text-align:left;vertical-align:top}th{font-size:10px;text-transform:uppercase;color:#6b7d76}.ch{display:inline-block;border:1px solid #cfcdc2;border-radius:12px;padding:2px 9px;margin:2px 4px 2px 0}li{margin:3px 0}.foot{margin-top:24px;color:#6b7d76;font-size:10px}@media screen{body{max-width:800px;margin:20px auto;padding:0 16px}}</style></head><body>
  <div class="top"><div><h1>Minuta · ${hx(s.name)}</h1><div style="color:#6b7d76">${hx(c.name)} · ${hx(p.name)} · ${hx(t.name)}</div></div><div style="font-weight:800">Grupo Nuwek</div></div>
  <div class="meta"><span>🗓 ${hx(dLabel(m.start.slice(0,10)))} ${new Date(m.start).getFullYear()}</span><span>🕒 ${tm(m.start)}${m.end?' – '+tm(m.end):''}</span><span>⏱ ${mnClockTxt(dur)}</span><span>Tipo: ${m.kind==='cliente'?'con cliente':'interna'}</span><span>Tomó la minuta: <b>${hx(by)}</b></span></div>
  <h2>Asistentes</h2><div>${m.asist.map(a=>'<span class="ch">'+hx(a.name)+(a.tipo==='c'?' (cliente)':'')+'</span>').join('')||'—'}</div>
  <h2>Notas</h2>${notes.length?'<ul>'+notes.map(l=>'<li>'+hx(l.txt)+'</li>').join('')+'</ul>':'<div>—</div>'}
  <h2>Actividades y acuerdos</h2>${acts.length?'<table><tr><th></th><th>Acuerdo</th><th>Responsable</th><th>Fecha</th><th>Ligado a</th></tr>'+acts.map(l=>'<tr><td>'+(l.done?'☑':'☐')+'</td><td>'+hx(l.txt)+'</td><td>'+hx(l.resp?store.person(l.resp).name:'')+'</td><td>'+hx(l.date?dLabel(l.date):'')+'</td><td>'+hx(l.link?mnLinkTxt(l):'sin ligar')+'</td></tr>').join('')+'</table>':'<div>—</div>'}
  <h2>Enlaces</h2>${m.links.length?'<ul>'+m.links.map(x=>'<li>'+hx(x.t)+' — '+hx(x.u)+'</li>').join('')+'</ul>':'<div>—</div>'}
  <div class="foot">Generada por el portal de Grupo Nuwek el ${hx(dLabel(todayISO()))} ${new Date().getFullYear()}.</div></body></html>`;
  const w=window.open('','_blank'); if(!w){ alert('El navegador bloqueó la ventana. Permite las ventanas emergentes de este sitio.'); return; } w.document.open(); w.document.write(html); w.document.close(); setTimeout(()=>{ try{ w.focus(); w.print(); }catch(_){} },700); }
/* acceso del equipo desde el link público de la sesión: pide el código de un PM, Gerencia o Dirección */
function mnAuthOpen(){ mnAuth={err:'',opts:null}; render(); setTimeout(()=>{ const e=document.getElementById('au-code'); if(e) e.focus(); },60); }
function mnAuthClose(){ mnAuth=null; render(); }
function mnAuthModal(){ const esc=mnEsc; return `<div class="modal active" style="z-index:150" onclick="if(event.target===this)mnAuthClose()"><div class="modal-card" style="max-width:380px"><div class="m-head"><div class="m-top"><h3 style="margin:0">🔐 Acceso del equipo Nuwek</h3><button class="x" onclick="mnAuthClose()">×</button></div></div><div class="m-body">
  ${mnAuth.opts?`<p class="muted" style="margin-top:0">Ese código coincide con más de una persona. ¿Quién eres?</p><div class="mn-chips">${mnAuth.opts.map(u=>`<button class="mn-chip" onclick="mnAuthLogin('${u.id}')">${esc(u.name)}</button>`).join('')}</div>`
  :`<p class="muted" style="margin-top:0">Escribe tu <b>código de 6 cifras</b> (PM, Gerencia o Dirección). Así queda registrado quién toma la minuta.</p><div class="field"><input id="au-code" type="password" inputmode="numeric" maxlength="6" placeholder="••••••" autocomplete="off" onkeydown="if(event.key==='Enter')mnAuthSubmit()"></div><div class="pin-err" style="color:#c0392b;min-height:18px">${esc(mnAuth.err||'')}</div><div class="wiz-actions"><button class="btn ghost" onclick="mnAuthClose()">Cancelar</button><button class="btn" onclick="mnAuthSubmit()">Entrar</button></div>`}</div></div></div>`; }
function mnAuthSubmit(){ const code=((document.getElementById('au-code')||{}).value||'').trim(); const lock=mnFails.x; if(lock&&lock.until&&Date.now()<lock.until){ mnAuth.err='Demasiados intentos. Espera unos minutos.'; render(); return; }
  const el=store.activeStaff().filter(u=>['pm','gerente','gerencia'].includes(u.perm)&&String(u.password||'')===code&&code);
  if(!el.length){ const a=mnFails.x||{fails:0,until:0}; a.fails++; if(a.fails>=3){ a.until=Date.now()+5*60*1000; a.fails=0; mnAuth.err='Demasiados intentos. Espera 5 minutos.'; } else mnAuth.err='Código incorrecto o sin permiso (solo PM, Gerencia o Dirección).'; mnFails.x=a; render(); return; }
  mnFails.x=null; if(el.length>1){ mnAuth.opts=el; render(); return; } mnAuthLogin(el[0].id); }
function mnAuthLogin(uid){ const u=store.person(uid); const ps=publicSes; if(!['pm','gerente','gerencia'].includes(u.perm)) return; session=u.id; currentUser=u.id; role=u.perm||'colab'; kbPerson=u.id; modalTask=null; opSelTask=null; mnAuth=null; saveSession(); render(); if(ps) mnSumOpen(ps.tid,ps.sid); }

/* aviso a la hora de una cita */
function mnTodayCitas(){ const td=todayISO(); const out=[]; store.d.tasks.forEach(t=>{ if(!store.project(t.projectId)) return; (t.subtasks||[]).forEach(s=>{ if(s.isSeries||s.done||s.date!==td) return; const k=citaKind(s)||(subHasCita(s)&&s.time?'cliente':null); if(!k) return; if(role==='colab'&&!subInvolves(s,currentUser)) return; out.push({t,s,k}); }); }); return out.sort((a,b)=>(a.s.time||'99')<(b.s.time||'99')?-1:1); }
function mnWatch(){ if(!session||document.hidden||mnPrompt||mnActive()) return; const now=new Date(), nm=now.getHours()*60+now.getMinutes();
  for(const {t,s} of mnTodayCitas()){ if(!s.time||!subInvolves(s,currentUser)) continue; const k=s.id+':'+todayISO(); if(mnSeen.has(k)) continue; const mm=toMin(s.time); if(mm==null) continue; if(nm>=mm-5&&nm<=mm+20){ mnSeen.add(k); mnPrompt={tid:t.id,sid:s.id,title:s.name}; mnRender(); return; } } }
setInterval(mnWatch,30000);
/* bloque dentro de la subtarea (pestaña Sesión) */
function mnBlock(t,s){ const ms=(s.minutas||[]).slice().sort((a,b)=>a.start<b.start?1:-1); const act=ms.find(m=>m.estado==='curso'); const k=citaKind(s)||(subHasCita(s)?'cliente':null);
  return `<div class="field"><label>📝 Minutas de esta cita ${k?`<span class="pill ${k==='cliente'?'green':'yellow'}">${k==='cliente'?'con cliente':'interna'}</span>`:''}</label>${ms.map(m=>`<div class="dep-row"><span>${esc(dLabel(m.start.slice(0,10)))} · ${m.end?mnClockTxt(new Date(m.end)-new Date(m.start)):'en curso'} · ${m.lines.filter(l=>l.kind==='n').length} nota(s) · ${m.lines.filter(l=>l.kind==='a').length} actividad(es)</span><a style="cursor:pointer;color:var(--green)" onclick="mnView('${t.id}','${s.id}','${m.id}')">abrir</a></div>`).join('')||'<div class="hint">Aún no hay minutas de esta cita.</div>'}<button type="button" class="btn sm" style="margin-top:6px" onclick="mnStart('${t.id}','${s.id}')">${act?'▶ Continuar minuta':'▶ Iniciar minuta'}</button></div>`; }
/* Gestión → Minutas */
function mnAll(){ const out=[]; store.d.tasks.forEach(t=>{ const p=store.project(t.projectId); if(!p) return; (t.subtasks||[]).forEach(s=>(s.minutas||[]).forEach(m=>out.push({t,s,m,p,c:store.client(p.clientId)||{name:''}}))); }); return out.sort((a,b)=>a.m.start<b.m.start?1:-1); }
let mnFilK='', mnFilQ='';
function mnQFocus(){ const e=document.getElementById('mn-q'); if(e){ e.focus(); const n=e.value.length; try{ e.setSelectionRange(n,n); }catch(_){} } }
function gestMinutas(){ const R=gestRange(); const td=todayISO(); const pers=x=>!gestPerson||x.s.personId===gestPerson||x.m&&(x.m.by===gestPerson||(x.m.asist||[]).some(a=>a.id===gestPerson))||(!x.m&&((x.s.team||[]).includes(gestPerson)));
  let today=(td>=R.start&&td<=R.end)?mnTodayCitas().map(x=>Object.assign(x,{p:store.project(x.t.projectId)||{},c:store.client((store.project(x.t.projectId)||{}).clientId)||{name:''}})).filter(gestPass).filter(x=>!gestProject||x.p.id===gestProject).filter(pers):[];
  let all=mnAll().filter(x=>{ const d=x.m.start.slice(0,10); return d>=R.start&&d<=R.end; }).filter(gestPass).filter(x=>!gestProject||x.p.id===gestProject).filter(pers); if(mnFilK) all=all.filter(x=>x.m.kind===mnFilK); if(mnFilQ){ const q=impNz(mnFilQ); all=all.filter(x=>impNz(x.s.name+' '+x.c.name+' '+x.t.name+' '+x.m.lines.map(l=>l.txt).join(' ')).includes(q)); }
  const rowT=x=>`<div class="cita-row"><div class="cita-when"><b>${x.s.time||'hoy'}</b><span>${x.k==='cliente'?'cliente':'interna'}</span></div><div class="cita-main"><div class="cita-nm">${esc(x.s.name)}</div><div class="muted" style="font-size:.78rem">${esc((store.client((store.project(x.t.projectId)||{}).clientId)||{}).name||'')} · ${esc(x.t.name)}</div></div><div class="cita-side"><button class="btn sm" onclick="mnSumOpen('${x.t.id}','${x.s.id}')">📝 Ver minuta</button></div></div>`;
  return `<div class="sec-title"><h2 style="font-size:1.1rem">Citas de hoy${(R.start>td||R.end<td)?' <span class="muted" style="font-weight:400">(fuera del periodo)</span>':''}</h2><button class="btn sm" onclick="mnNewOpen()">+ Nueva minuta</button></div><div class="cita-list">${today.map(rowT).join('')||'<div class="muted">Hoy no hay citas con hora y más de una persona.</div>'}</div>
    <div class="sec-title" style="margin-top:18px"><h2 style="font-size:1.1rem">Historial de minutas <span class="muted" style="font-weight:400">· ${all.length} · ${esc(gestRangeLabel(R))}</span></h2><div style="display:flex;gap:8px"><select onchange="mnFilK=this.value;render()"><option value="">Todas</option><option value="cliente" ${mnFilK==='cliente'?'selected':''}>Con cliente</option><option value="interna" ${mnFilK==='interna'?'selected':''}>Internas</option></select><input id="mn-q" placeholder="Buscar…" value="${esc(mnFilQ)}" oninput="mnFilQ=this.value;render();mnQFocus()" style="width:180px"></div></div>
    <div class="cita-list">${all.map(x=>{ const a=x.m.lines.filter(l=>l.kind==='a'); const dur=x.m.end?mnClockTxt(new Date(x.m.end)-new Date(x.m.start)):'en curso';
      return `<div class="cita-row" style="cursor:pointer" onclick="mnSumOpen('${x.t.id}','${x.s.id}','${x.m.id}')"><div class="cita-when"><b>${dLabel(x.m.start.slice(0,10))}</b><span>${dur}</span></div><div class="cita-main"><div class="cita-nm">${esc(x.s.name)} <span class="pill ${x.m.kind==='cliente'?'green':'yellow'}">${x.m.kind==='cliente'?'con cliente':'interna'}</span></div><div class="muted" style="font-size:.78rem">${esc(x.c.name)} · ${esc(x.p.name)} · ${esc(x.t.name)}</div></div><div class="cita-side"><div class="muted" style="font-size:.76rem">${x.m.lines.length-a.length} nota(s) · ${a.length} actividad(es) · ${a.filter(l=>l.link).length} ligada(s)${x.m.links.length?' · 🔗 '+x.m.links.length:''}</div></div></div>`; }).join('')||'<div class="muted">No hay minutas con estos filtros. Prueba con «Todo» o quita filtros. Se crean desde una cita o con «+ Nueva minuta».</div>'}</div>`; }
/* nueva minuta interna (Daily / Weekly / Monthly / otra) */
function mnNewOpen(){ mnNew={tipo:'Daily',nombre:'',team:[]}; render(); }
function mnNewClose(){ mnNew=null; render(); }
function mnNewModal(){ const staff=store.activeStaff().filter(u=>u.id!==currentUser);
  return `<div class="modal active" style="z-index:150" onclick="if(event.target===this)mnNewClose()"><div class="modal-card" style="max-width:460px"><div class="m-head"><div class="m-top"><h3 style="margin:0">📝 Nueva minuta interna</h3><button class="x" onclick="mnNewClose()">×</button></div></div><div class="m-body">
    <div class="field"><label>Tipo</label><select onchange="mnNew.tipo=this.value">${['Daily','Weekly','Monthly','Reunión'].map(x=>`<option ${mnNew.tipo===x?'selected':''}>${x}</option>`).join('')}</select></div>
    <div class="field"><label>Nombre (opcional)</label><input value="${esc(mnNew.nombre)}" onchange="mnNew.nombre=this.value" placeholder="Ej. Daily comercial"></div>
    <div class="field"><label>¿Quiénes participan?</label><div class="mn-chips">${staff.map(u=>`<button type="button" class="mn-chip ${mnNew.team.includes(u.id)?'on':''}" onclick="mnNew.team=mnNew.team.includes('${u.id}')?mnNew.team.filter(x=>x!=='${u.id}'):[...mnNew.team,'${u.id}'];render()">${mnNew.team.includes(u.id)?'✔ ':''}${esc(u.name)}</button>`).join('')}</div><div class="hint">Se crea una cita interna de hoy, a esta hora, dentro del proyecto «Gestión interna» (frente «Reuniones»).</div></div>
    <div class="wiz-actions"><button class="btn ghost" onclick="mnNewClose()">Cancelar</button><button class="btn" onclick="mnNewGo()">▶ Crear e iniciar</button></div></div></div></div>`; }
function mnNewGo(){ const N=mnNew; const ic=store.d.clients.find(c=>c.tipo==='interno'); if(!ic){ alert('No hay un cliente interno. Crea el cliente «Grupo Nuwek» de tipo Interno y su proyecto «Gestión interna».'); return; }
  const projs=store.d.projects.filter(x=>x.clientId===ic.id); const p=projs.find(x=>/gesti[oó]n interna/i.test(x.name))||projs[0]; if(!p){ alert('Crea el proyecto «Gestión interna» dentro de «'+ic.name+'» para colgar las reuniones.'); return; }
  let f=store.frentesOf(p.id).find(x=>/^reuniones/i.test(x.name)); if(!f) f=store.addFrente(p.id,'Reuniones');
  let t=store.tasksOf(p.id).find(x=>x.frenteId===f.id&&/^reuniones/i.test(x.name)); if(!t) t=store.addTask({projectId:p.id,frenteId:f.id,name:'Reuniones internas',subtitle:ic.name,description:'Daily, Weekly, Monthly y demás reuniones internas del equipo.',tags:[],workLink:'',deliverables:[],responsibleId:currentUser,status:'to-do',dueDate:p.endDate||todayISO(),viaticos:0,subtasks:[]});
  const now=new Date(); const hm=String(now.getHours()).padStart(2,'0')+':'+String(now.getMinutes()).padStart(2,'0'); const nm=(N.nombre||'').trim()||N.tipo; const nowIso=now.toISOString(); const info={}; N.team.forEach(id=>info[id]={by:currentUser,ts:nowIso});
  const st={name:nm+' · '+dLabel(todayISO()),personId:currentUser,date:todayISO(),time:hm,durMin:30,team:N.team.slice(),teamInfo:info,teamAck:{},invitados:[]}; store.addSubtask(t.id,st); logEvent(t.id,'Creó la reunión «'+st.name+'»');
  mnNew=null; render(); mnStart(t.id,st.id); }

/* ================== MODAL DE EDICIÓN DE SUBTAREA + PARTICIPACIÓN DEL CLIENTE ================== */
function openSubEdit(tid,sid){ subEd={tid,sid,tab:'datos'}; clientPop=null; render(); setTimeout(()=>{ smTab('datos'); smFreqChange(); smCount(); smLugarChange(); },0); }
function closeSubEdit(){ subEd=null; render(); }
let attLoading={};
function ensureAttNow(){ const id=modalTask||opSelTask; if(id) ensureAtt(id); }
async function ensureAtt(tid){
  if(attLoading[tid]||typeof dbLoadCommentAttachments!=='function') return; const need=(store.commentsOf(tid)||[]).filter(c=>c.attachments===undefined); if(!need.length) return;
  attLoading[tid]=1;
  try{ const rows=await dbLoadCommentAttachments(tid); let any=false; rows.forEach(r=>{ const c=(store.d.comments||[]).find(x=>x.id===r.id); if(c&&c.attachments===undefined){ c.attachments=Array.isArray(r.attachments)?r.attachments:[]; if(c.attachments.length) any=true; } });
    (store.commentsOf(tid)||[]).forEach(c=>{ if(c.attachments===undefined) c.attachments=[]; });
    if(any){ syncDirty=true; syncFlush(); } }catch(e){ console.warn('Adjuntos:',e&&e.message||e); }
  finally{ delete attLoading[tid]; } }
function openClientPop(tid,sid){ const t=store.task(tid); const sub=t&&(t.subtasks||[]).find(x=>x.id===sid); clientPop={tid,sid,sel:((sub&&sub.invitados)||[]).slice(),team:(((sub&&(sub.isSeries?seriesTpl(sub):sub).team)||[]).slice()),tab:'cli',adding:false}; render(); }
function closeClientPop(){ clientPop=null; render(); }
function subEditModal(){
  const t=store.task(subEd.tid); const s0=t&&(t.subtasks||[]).find(x=>x.id===subEd.sid); if(!s0){ subEd=null; return ''; }
  const s=s0.isSeries?Object.assign({},s0,{personId:seriesTpl(s0).personId,date:(s0.series||{}).startDate,time:seriesTpl(s0).time,durMin:seriesTpl(s0).durMin,team:seriesTpl(s0).team,invitados:seriesTpl(s0).invitados}):s0; const sr=s0.series||{};
  const p=store.project(t.projectId)||{id:''}; const c=store.client(p.clientId)||{people:[]}; const people=c.people||[];
  const dateLocked=!canSubDate(); const et=store.etapaOfDate(p.id,s.date); const etapas=store.etapasOf(p.id);
  const persOpts=['<option value="">— Sin responsable —</option>',staffOptEls(s.personId,' (Nuwek)'),...people.map(pp=>`<option value="${pp.id}" ${pp.id===s.personId?'selected':''}>${esc(pp.name)} (Cliente)</option>`)].join('');
  const durSet=[...new Set([...DUR_OPTS,...(s.durMin?[+s.durMin]:[])])].sort((a,b)=>a-b);
  const durOpts=`<option value="">— Sin estimación —</option>`+durSet.map(m=>`<option value="${m}" ${m===(+s.durMin)?'selected':''}>${fmtDurShort(m)}</option>`).join('');
  const team=store.activeStaff().map(u=>`<label class="gf-opt"><input type="checkbox" class="sm-team" value="${u.id}" ${(s.team||[]).includes(u.id)?'checked':''}> ${esc(u.name)}</label>`).join('');
  const cli=people.length?people.map(pp=>`<label class="gf-opt"><input type="checkbox" class="sm-cli" value="${pp.id}" ${(s.invitados||[]).includes(pp.id)?'checked':''}> ${esc(pp.name)}${pp.role?` <span class="muted">· ${esc(pp.role)}</span>`:''}</label>`).join(''):'<span class="muted">Este cliente aún no tiene contactos capturados.</span>';
  const etOpts=`<option value="" ${et?'':'selected'}>${etapas.length?'— Fuera de las etapas —':'— Sin etapas —'}</option>`+etapas.map(e=>`<option value="${e.id}" ${et&&et.id===e.id?'selected':''}>${esc(e.name)} (${dLabel(e.start)}–${dLabel(e.end)})</option>`).join('');
  const kids=subKids(t,s.id).length; const canParent=!s0.isSeries&&!s0.seriesId&&(!subIsChild(t,s)&&!kids || subIsChild(t,s));
  const wdBox=[1,2,3,4,5,6,0].map(d=>`<label class="gf-opt"><input type="checkbox" class="sm-wd" value="${d}" ${(sr.days||[]).includes(d)?'checked':''}> ${WD_LETTER[d]}</label>`).join('');
  const serSec=(!s0.parentId&&!s0.seriesId)?`<div class="field sm-series"><label>↻ Repetir por calendario</label><select id="sm-freq" onchange="smFreqChange()" ${canSubDate()?'':`disabled title="${SUB_DATE_MSG}"`}><option value="" ${sr.freq?'':'selected'}>No se repite</option><option value="daily" ${sr.freq==='daily'?'selected':''}>Todos los días hábiles (L–V)</option><option value="weekly" ${sr.freq==='weekly'?'selected':''}>Cada semana, en los días que elija</option><option value="monthly" ${sr.freq==='monthly'?'selected':''}>Cada mes</option></select>
      <div id="sm-ser" style="display:none;margin-top:8px">
        <div id="sm-ser-wk" style="display:none"><div class="gf-scope" style="flex-wrap:wrap;gap:6px 14px">${wdBox}</div><div class="rep-row" style="margin-top:6px"><span class="muted">Cada</span><input id="sm-int" type="number" min="1" value="${sr.interval||1}"><span class="muted">semana(s)</span></div></div>
        <div id="sm-ser-mo" style="display:none"><div class="rep-row"><span class="muted">El día</span><input id="sm-md" type="number" min="1" max="31" value="${sr.monthDay||(s.date?+s.date.split('-')[2]:1)}"><span class="muted">de cada</span><input id="sm-int2" type="number" min="1" value="${sr.interval||1}"><span class="muted">mes(es)</span></div></div>
        <div class="rep-row" style="margin-top:8px"><span class="muted">Termina</span><select id="sm-end" onchange="smFreqChange()"><option value="never" ${(!sr.endType||sr.endType==='never')?'selected':''}>Nunca (se generan 8 semanas por adelantado)</option><option value="date" ${sr.endType==='date'?'selected':''}>En una fecha</option><option value="count" ${sr.endType==='count'?'selected':''}>Después de N veces</option><option value="deadline" ${sr.endType==='deadline'?'selected':''}>Al llegar al deadline de la tarea</option></select><input id="sm-until" type="date" value="${sr.until||''}" style="display:none"><input id="sm-count" type="number" min="1" placeholder="N" value="${sr.count||''}" style="display:none;width:80px"></div>
        <div class="hint">La <b>fecha</b> de arriba es el inicio de la serie. Cada repetición queda como una subtarea con el mismo responsable, hora y duración; si la borras, solo se omite esa. Al cambiar la regla se regeneran las repeticiones futuras que aún no están hechas.</div></div></div>`:'';
  const parentOpts=`<option value="">— Ninguna (nivel principal) —</option>`+(t.subtasks||[]).filter(m=>!subIsChild(t,m)&&m.id!==s.id).map(m=>`<option value="${m.id}" ${s.parentId===m.id?'selected':''}>${esc(m.name)}</option>`).join('');
  const bad=(v)=>v?'':' sm-miss';
  const repAllowed=!s0.parentId&&!s0.seriesId; const repMode=(s0.isSeries||sr.freq)?'cal':(s.repeatAfter?'after':'none'); const missN=subMissing(s0).length; const tab=subEd.tab||'datos';
  const smTabsBar=`<div class="sm-tabs"><button type="button" class="sm-tab ${tab==='datos'?'on':''}" data-tab="datos" onclick="smTab('datos')">📝 Datos${missN?'<b class="sm-dot"></b>':''}</button><button type="button" class="sm-tab ${tab==='nuwek'?'on':''}" data-tab="nuwek" onclick="smTab('nuwek')">👥 Equipo Nuwek <i id="sm-n-nuwek"></i></button><button type="button" class="sm-tab ${tab==='cli'?'on':''}" data-tab="cli" onclick="smTab('cli')">🤝 Cliente <i id="sm-n-cli"></i></button>${repAllowed?`<button type="button" class="sm-tab ${tab==='rep'?'on':''}" data-tab="rep" onclick="smTab('rep')">↻ Repetir <i id="sm-n-rep"></i></button>`:''}${!s0.isSeries?`<button type="button" class="sm-tab ${tab==='ses'?'on':''}" data-tab="ses" onclick="smTab('ses')">📅 Sesión</button>`:''}</div>`;
  return `<div class="modal active" style="z-index:120" onclick="if(event.target===this)closeSubEdit()"><div class="modal-card" style="max-width:640px">
    <div class="m-head"><div class="m-top"><div><div class="pill yellow">${esc(t.name)}</div><h3 style="margin:8px 0 0">Editar ${s.parentId?'sub-subtarea':'subtarea'}</h3></div><button class="x" onclick="closeSubEdit()">×</button></div></div>
    <div class="m-body">
      ${smTabsBar}
      <div class="sm-pane" data-pane="datos">
        <div class="field"><label>Nombre</label><input id="sm-name" value="${esc(s.name)}"></div>
        <div class="sm-req-note">Obligatorios: responsable, fecha, hora y estimación de tiempo. Si falta alguno, el lápiz se queda en rojo.</div>
        <div class="field row"><div><label>Responsable *</label><select id="sm-person" class="${bad(s.personId).trim()}">${persOpts}</select></div>
          <div><label>${s0.isSeries?'Inicio de la serie *':'Fecha *'}</label><input id="sm-date" type="date" value="${s.date||''}" class="${bad(s.date).trim()}" oninput="smDateChange()" ${dateLocked?`disabled title="${SUB_DATE_MSG}"`:''}></div></div>
        <div class="field row"><div><label>Hora *</label><input id="sm-time" type="time" value="${s.time||''}" class="${bad(s.time).trim()}"></div>
          <div><label>Cuánto tardará *</label><select id="sm-dur" class="${bad(s.durMin).trim()}">${durOpts}</select></div></div>
        <div class="field"><label>Color en los calendarios</label><div class="tp-pick"><label title="Según la actividad: con cliente = verde, con el equipo = azul, trabajo solo = amarillo"><input type="radio" name="sm-col" value="" ${!s0.color?'checked':''}><span class="tp-sw auto">Auto</span></label>${Object.keys(SUBCOL).map(k=>`<label title="${SUBCOL[k][1]}"><input type="radio" name="sm-col" value="${k}" ${s0.color===k?'checked':''}><span class="tp-sw" style="background:${SUBCOL[k][0]}"></span></label>`).join('')}</div><div class="hint">«Auto» pinta verde si es con cliente, azul si es con el equipo y amarillo si es trabajo solo. Rojo está pensado para vacaciones o incapacidades.</div></div>
        <div class="field"><label>Etapa</label><select id="sm-etapa" onchange="smEtapaChange(this.value)" ${dateLocked||!etapas.length?'disabled':''}>${etOpts}</select><div class="hint">La etapa sale de la fecha; al elegir otra, la fecha se mueve al inicio de esa etapa.</div></div>
        ${canParent?`<div class="field"><label>Dentro de</label><select id="sm-parent">${parentOpts}</select></div>`:''}
        ${(!s0.isSeries&&!s0.seriesId)?`<div class="field"><label>⛓ Empieza cuando termina…</label><select id="sm-dep" ${dateLocked?'disabled':''}><option value="">— No depende de nada —</option>${(t.subtasks||[]).filter(m=>m.id!==s0.id&&!m.isSeries&&!m.seriesId&&!depWouldCycle(t,s0.id,m.id)).map(m=>`<option value="${m.id}" ${s0.dependsOn===m.id?'selected':''}>${esc(m.name)}${m.parentId?' (sub-subtarea)':''}</option>`).join('')}</select><div class="hint">Solo una. Si esa otra subtarea se mueve, esta (y las que dependan de esta) se acomodan en días y horas laborales (lunes a viernes, 9:00 a 18:00).</div>
          <label class="gf-opt" style="margin-top:6px"><input type="checkbox" id="sm-fija" ${s0.fija?'checked':''} ${dateLocked?'disabled':''}> 📌 Fecha fija: no se mueve con las dependencias (ej. sesiones diarias a la misma hora)</label></div>`:''}
      </div>
      <div class="sm-pane" data-pane="nuwek" style="display:none"><div class="field"><label>Quién más del equipo Nuwek participa</label><div class="gf-list" onchange="smCount()">${team}</div><div class="hint">Les aparece en su calendario y les llega un aviso para confirmar que la vieron.</div></div></div>
      <div class="sm-pane" data-pane="cli" style="display:none"><div class="field"><label>Quién del equipo del cliente participa</label><div class="gf-list" onchange="smCount()">${cli}</div></div></div>
      ${!s0.isSeries?smSesionPane(s0,t,c):''}
      ${repAllowed?`<div class="sm-pane" data-pane="rep" style="display:none">
        <input type="hidden" id="sm-mode" value="${repMode}">
        <div class="sm-subtabs"><button type="button" class="sm-sub ${repMode==='none'?'on':''}" data-mode="none" onclick="smRepMode('none')">No se repite</button><button type="button" class="sm-sub ${repMode==='cal'?'on':''}" data-mode="cal" onclick="smRepMode('cal')">📅 Por calendario</button><button type="button" class="sm-sub ${repMode==='after'?'on':''}" data-mode="after" onclick="smRepMode('after')">⏱ Después de terminarla</button></div>
        <div class="sm-rpane" data-rpane="none" style="${repMode==='none'?'':'display:none'}"><div class="muted" style="padding:10px 2px">Esta subtarea no se repite. Elige una de las otras pestañas para que se repita.</div></div>
        <div class="sm-rpane" data-rpane="cal" style="${repMode==='cal'?'':'display:none'}">${serSec}</div>
        <div class="sm-rpane" data-rpane="after" style="${repMode==='after'?'':'display:none'}"><div class="field"><label>↻ Repetir después de terminarla</label><div class="rep-row"><input id="sm-rep" type="number" min="1" placeholder="Días" value="${s.repeatAfter||''}"><span class="muted">días después de terminar</span>${[7,15,30,45,60].map(n=>`<button type="button" class="rep-chip" onclick="document.getElementById('sm-rep').value=${n}">${n}</button>`).join('')}<button type="button" class="rep-chip" onclick="document.getElementById('sm-rep').value=''">Quitar</button></div><div class="hint">Al palomearla, se crea la siguiente con su fecha = el día que la termines + N días, sin importar el calendario.</div></div></div>
      </div>`:''}
      <div class="wiz-actions">${canCopy()&&!s0.isSeries&&!s0.seriesId?'<button class="btn ghost" title="Crear una copia dentro de esta misma tarea" onclick="openDup()">⧉ Duplicar</button><button class="btn ghost" style="margin-right:auto" title="Mover a otra tarea de este proyecto" onclick="openMov()">↦ Mover</button>':''}<button class="btn ghost" onclick="closeSubEdit()">Cancelar</button><button class="btn" onclick="saveSubModal()">Guardar</button></div>
    </div></div></div>`;
}
function smTab(name){ if(subEd) subEd.tab=name;
  document.querySelectorAll('.sm-tab').forEach(b=>b.classList.toggle('on',b.dataset.tab===name));
  document.querySelectorAll('.sm-pane').forEach(p=>{ p.style.display=(p.dataset.pane===name)?'block':'none'; }); if(name==='rep') smFreqChange(); }
function smRepMode(mode){ const h=document.getElementById('sm-mode'); if(h) h.value=mode;
  document.querySelectorAll('.sm-sub').forEach(b=>b.classList.toggle('on',b.dataset.mode===mode));
  document.querySelectorAll('.sm-rpane').forEach(p=>{ p.style.display=(p.dataset.rpane===mode)?'block':'none'; });
  if(mode==='cal'){ const f=document.getElementById('sm-freq'); if(f&&!f.value&&!f.disabled) f.value='weekly'; smFreqChange(); } smCount(); }
function smCount(){ const set=(id,n,txt)=>{ const e=document.getElementById(id); if(e){ e.textContent=n?(txt||n):''; e.style.display=n?'inline-flex':'none'; } };
  set('sm-n-nuwek',document.querySelectorAll('.sm-team:checked').length); set('sm-n-cli',document.querySelectorAll('.sm-cli:checked').length);
  const m=(document.getElementById('sm-mode')||{}).value; set('sm-n-rep',(m&&m!=='none')?1:0,'●'); }
function smFreqChange(){ const f=val('sm-freq'); const box=document.getElementById('sm-ser'); if(!box) return; box.style.display=f?'block':'none';
  const wk=document.getElementById('sm-ser-wk'), mo=document.getElementById('sm-ser-mo'); if(wk) wk.style.display=(f==='weekly')?'block':'none'; if(mo) mo.style.display=(f==='monthly')?'block':'none';
  const e=val('sm-end'); const u=document.getElementById('sm-until'), c=document.getElementById('sm-count'); if(u) u.style.display=(e==='date')?'inline-block':'none'; if(c) c.style.display=(e==='count')?'inline-block':'none'; }
function smDateChange(){ const t=store.task(subEd.tid); const e=store.etapaOfDate(t.projectId,val('sm-date')); const sel=document.getElementById('sm-etapa'); if(sel) sel.value=e?e.id:''; }
function smEtapaChange(id){ if(!id) return; const t=store.task(subEd.tid); const e=store.etapasOf(t.projectId).find(x=>x.id===id); if(!e) return; const d=val('sm-date'); if(!(d>=e.start&&d<=e.end)){ const inp=document.getElementById('sm-date'); if(inp) inp.value=e.start; } }
function saveSubModal(){
  const {tid,sid}=subEd; const t=store.task(tid); const s=t.subtasks.find(x=>x.id===sid); const name=(val('sm-name')||'').trim(); if(!name){ alert('La subtarea necesita nombre.'); return; }
  const person=val('sm-person')||'';
  const team=[...document.querySelectorAll('.sm-team:checked')].map(i=>i.value).filter(id=>id!==person);
  const cli=[...document.querySelectorAll('.sm-cli:checked')].map(i=>i.value);
  const patch={name,personId:person,date:val('sm-date')||t.dueDate||'',time:val('sm-time')||'',durMin:+val('sm-dur')||null,team,invitados:cli}; { const ce=document.querySelector('input[name="sm-col"]:checked'); if(ce) patch.color=SUBCOL[ce.value]?ce.value:undefined; }
  const repMode=document.getElementById('sm-mode')?document.getElementById('sm-mode').value:null;
  if(document.getElementById('sm-rep')) patch.repeatAfter=(repMode==='after')?(Math.max(0,parseInt(val('sm-rep'),10)||0)||null):null;
  // a quién se le avisa: los que se agregaron ahora (por quién y cuándo); si alguien sale, se limpia su aviso
  const srcOld=s.isSeries?seriesTpl(s):s; const oldTeam=srcOld.team||[]; const info=Object.assign({},srcOld.teamInfo||{}); const ack=Object.assign({},srcOld.teamAck||{}); const now=new Date().toISOString();
  team.filter(id=>!oldTeam.includes(id)).forEach(id=>{ info[id]={by:currentUser,ts:now}; delete ack[id]; });
  oldTeam.filter(id=>!team.includes(id)).forEach(id=>{ delete info[id]; delete ack[id]; });
  patch.teamInfo=info; patch.teamAck=ack;
  if(document.getElementById('sm-obj')){   // sesión con el cliente
    const old=sesOf(s); const tem=[...document.querySelectorAll('#sm-tem .tem-row')].map(r=>{ const ti=(r.querySelector('.tem-t').value||'').trim(); if(!ti) return null; const por=r.querySelector('.tem-p').value;
      return {id:r.dataset.id||('tm_'+Math.random().toString(36).slice(2,8)),titulo:ti,por:por==='cliente'?'cliente':'nuwek',personId:por==='cliente'?'':por,by:r.dataset.by||currentUser,ts:r.dataset.ts||new Date().toISOString()}; }).filter(Boolean);
    const sesNew=Object.assign({},s.sesion||{},{objetivo:(val('sm-obj')||'').trim(),lugar:{tipo:val('sm-ltipo')||'meet',link:(val('sm-llink')||'').trim(),direccion:(val('sm-ldir')||'').trim()},temario:tem});
    if(sesNew.objetivo||sesNew.lugar.link||sesNew.lugar.direccion||tem.length||(s.sesion&&(s.sesion.respuestas||[]).length)) patch.sesion=sesNew;
  }
  { const lr=sesLast(s); if(lr&&lr.estado==='reprogramar'&&(patch.date!==s.date||patch.time!==s.time)){ patch.sesion=Object.assign({},patch.sesion||s.sesion||{},{reabierta:Date.now()}); } }   // nueva fecha: el cliente vuelve a poder confirmar
  const pe=document.getElementById('sm-parent'); if(pe){ const np=pe.value||''; const okP=!np||(t.subtasks.some(m=>m.id===np&&!m.parentId)&&!subKids(t,sid).length&&np!==sid); if(okP) patch.parentId=np; }
  let freq=document.getElementById('sm-freq')?val('sm-freq'):null; const ruleLocked=!canSubDate(); if(!ruleLocked&&repMode&&repMode!=='cal') freq=''; if(ruleLocked) freq=s.isSeries?s.series.freq:null;   // las reglas de calendario son fechas: solo PM/Gerencia/Dirección
  if(freq){   // ---- serie por calendario ----
    const days=[...document.querySelectorAll('.sm-wd:checked')].map(i=>+i.value);
    if(!ruleLocked&&freq==='weekly'&&!days.length){ alert('Elige al menos un día de la semana.'); return; }
    if(!patch.date){ alert('Pon la fecha de inicio de la serie.'); return; }
    const endType=val('sm-end')||'never'; if(!ruleLocked&&endType==='date'&&!val('sm-until')){ alert('Pon la fecha en que termina la serie.'); return; } if(!ruleLocked&&endType==='count'&&!(parseInt(val('sm-count'),10)>0)){ alert('Pon cuántas veces se repite.'); return; }
    const oldSr=s.series||{};
    const sr=ruleLocked?Object.assign({},oldSr,{startDate:oldSr.startDate,tpl:{personId:patch.personId,time:patch.time,durMin:patch.durMin,team:patch.team,invitados:patch.invitados,teamInfo:patch.teamInfo,teamAck:patch.teamAck}}):{freq,interval:Math.max(1,parseInt(val(freq==='monthly'?'sm-int2':'sm-int'),10)||1),days:freq==='weekly'?days:[],monthDay:freq==='monthly'?(parseInt(val('sm-md'),10)||1):0,endType,until:endType==='date'?val('sm-until'):'',count:endType==='count'?parseInt(val('sm-count'),10):0,startDate:patch.date,skip:oldSr.skip||[],
      tpl:{personId:patch.personId,time:patch.time,durMin:patch.durMin,team:patch.team,invitados:patch.invitados,teamInfo:patch.teamInfo,teamAck:patch.teamAck}};
    const sp={name,isSeries:true,series:sr,personId:'',date:'',time:'',durMin:null,team:[],invitados:[],teamInfo:{},teamAck:{},repeatAfter:null,done:false,doneAt:null,timeSpent:0}; if(patch.parentId!==undefined) sp.parentId=patch.parentId;
    // las repeticiones futuras todavía pendientes se regeneran con la regla nueva
    const today=todayISO(); t.subtasks=t.subtasks.filter(x=>!(x.seriesId===sid&&!x.done&&(x.date||'')>=today));
    s.name=name; store.updateSubtask(tid,sid,sp); syncSeriesOf(t); store.save(); if(typeof dbSaveTask==='function') dbSaveTask(t);
    // el nombre también cambia en las repeticiones que ya existen
    t.subtasks.filter(x=>x.seriesId===sid).forEach(x=>{ x.name=name; }); logEvent(tid,(s.isSeries?'Editó':'Creó')+' la serie «'+name+'» ('+seriesLabel(sr)+')'); subEd=null; render(); return;
  }
  if(s.isSeries&&!ruleLocked){   // se quitó la repetición: la madre vuelve a ser una subtarea normal y sus repeticiones se quedan
    const tp=seriesTpl(s); Object.assign(patch,{isSeries:false,series:null,personId:patch.personId,done:false}); t.subtasks.filter(x=>x.seriesId===sid).forEach(x=>{ delete x.seriesId; delete x.occDate; });
  }
  if(document.getElementById('sm-dep')){ patch.dependsOn=val('sm-dep')||null; patch.fija=!!(document.getElementById('sm-fija')||{}).checked; }
  depApply(tid,sid,patch,()=>{ logEvent(tid,'Editó la subtarea «'+name+'»'); subEd=null; render(); });
}
function cpToggle(id){ if(!clientPop) return; const i=clientPop.sel.indexOf(id); if(i>=0) clientPop.sel.splice(i,1); else clientPop.sel.push(id); }
function cpShowAdd(){ clientPop.adding=true; render(); setTimeout(()=>{ const el=document.getElementById('cp-name'); if(el) el.focus(); },0); }
function cpCancelAdd(){ clientPop.adding=false; render(); }
function cpAddContact(){ const n=(val('cp-name')||'').trim(); if(!n){ alert('El contacto necesita un nombre.'); return; }
  const t=store.task(clientPop.tid); const cid=(store.project(t.projectId)||{}).clientId; const np=store.addClientPerson(cid,{name:n,role:(val('cp-role')||'').trim(),email:(val('cp-email')||'').trim(),phone:(val('cp-phone')||'').trim()});
  if(np){ clientPop.sel.push(np.id); logEvent(clientPop.tid,'Agregó al contacto «'+n+'» de '+(store.client(cid)||{}).name); }
  clientPop.adding=false; render(); }
function cpTab(k){ clientPop.tab=k; render(); }
function cpTeamToggle(id){ const i=clientPop.team.indexOf(id); if(i>=0) clientPop.team.splice(i,1); else clientPop.team.push(id); const n=document.getElementById('cp-tn'); if(n) n.textContent=clientPop.team.length; }
function cpSave(){ const {tid,sid,sel}=clientPop; const t=store.task(tid); const sub=t&&(t.subtasks||[]).find(x=>x.id===sid); if(!sub) return;
  const src=sub.isSeries?seriesTpl(sub):sub; const old=src.team||[]; const info=Object.assign({},src.teamInfo||{}); const ack=Object.assign({},src.teamAck||{}); const now=new Date().toISOString(); const team=clientPop.team.filter(id=>id!==src.personId);
  team.forEach(id=>{ if(!old.includes(id)){ info[id]={by:currentUser,ts:now}; delete ack[id]; } }); old.forEach(id=>{ if(!team.includes(id)){ delete info[id]; delete ack[id]; } });
  if(sub.isSeries){ const sr=Object.assign({},sub.series); sr.tpl=Object.assign({},sr.tpl,{invitados:sel.slice(),team,teamInfo:info,teamAck:ack}); store.updateSubtask(tid,sid,{series:sr}); }
  else store.updateSubtask(tid,sid,{invitados:sel.slice(),team,teamInfo:info,teamAck:ack});
  logEvent(tid,'Actualizó los participantes de una subtarea (cliente y equipo Nuwek)'); clientPop=null; render(); }
function clientPopModal(){
  const t=store.task(clientPop.tid); const s=t&&(t.subtasks||[]).find(x=>x.id===clientPop.sid); if(!s){ clientPop=null; return ''; }
  const c=store.client((store.project(t.projectId)||{}).clientId)||{name:'',people:[]}; const people=c.people||[];
  const list=people.map(pp=>`<label class="cp-row"><input type="checkbox" ${clientPop.sel.includes(pp.id)?'checked':''} onchange="cpToggle('${pp.id}')">${avatar(pp,true)}<span><b>${esc(pp.name)}</b>${pp.role?`<span class="muted" style="font-size:.76rem"> · ${esc(pp.role)}</span>`:''}</span></label>`).join('');
  const addForm=clientPop.adding?`<div class="cp-add"><div class="field"><label>Nombre</label><input id="cp-name" placeholder="Nombre completo"></div>
      <div class="field row"><div><label>Cargo</label><input id="cp-role" placeholder="Ej. Coord. Marketing"></div><div><label>Correo</label><input id="cp-email"></div></div>
      <div class="field"><label>Teléfono</label><input id="cp-phone"></div>
      <div style="display:flex;gap:8px;justify-content:flex-end"><button class="btn ghost sm" onclick="cpCancelAdd()">Cancelar</button><button class="btn sm" onclick="cpAddContact()">Agregar y seleccionar</button></div></div>`:'';
  const empty=people.length?'':`<div class="muted" style="padding:6px 0 10px">${esc(c.name)} aún no tiene contactos capturados. Agrégalos aquí mismo.</div>`;
  return `<div class="modal active" style="z-index:120" onclick="if(event.target===this)closeClientPop()"><div class="modal-card" style="max-width:480px">
    <div class="m-head"><div class="m-top"><div><div class="pill green">${esc(c.name)}</div><h3 style="margin:8px 0 0">🤝 Participa del cliente</h3></div><button class="x" onclick="closeClientPop()">×</button></div></div>
    <div class="m-body"><div class="muted" style="margin-bottom:8px;font-size:.84rem">${esc(s.name)}</div>
      <div class="sm-tabs" style="margin-bottom:10px"><button type="button" class="sm-tab ${clientPop.tab==='cli'?'on':''}" onclick="cpTab('cli')">🤝 Cliente (${clientPop.sel.length})</button><button type="button" class="sm-tab ${clientPop.tab==='nuw'?'on':''}" onclick="cpTab('nuw')">👥 Equipo Nuwek (<span id="cp-tn">${clientPop.team.length}</span>)</button></div>
      ${clientPop.tab==='nuw'?`<div class="cp-list">${store.activeStaff().filter(u=>u.id!==(s.isSeries?seriesTpl(s):s).personId).map(u=>`<label class="cp-row"><input type="checkbox" ${clientPop.team.includes(u.id)?'checked':''} onchange="cpTeamToggle('${u.id}')">${avatar(u,true)}<span><b>${esc(u.name)}</b><span class="muted" style="font-size:.76rem"> · ${esc(u.role||'')}</span></span></label>`).join('')}</div><div class="hint">El responsable de la subtarea ya participa. Con fecha, hora y más de una persona, la subtarea se vuelve una cita (interna si no hay gente del cliente).</div>
      <div class="wiz-actions"><span></span><span style="display:flex;gap:8px"><button class="btn ghost" onclick="closeClientPop()">Cancelar</button><button class="btn" onclick="cpSave()">Guardar</button></span></div>`:`
      ${empty}<div class="cp-list">${list}</div>${addForm}
      <div class="wiz-actions">${clientPop.adding?'<span></span>':`<button class="btn ghost" ${people.length?'':'style="border-color:var(--green);color:var(--green);font-weight:700"'} onclick="cpShowAdd()">＋ Agregar contacto</button>`}
        <span style="display:flex;gap:8px"><button class="btn ghost" onclick="closeClientPop()">Cancelar</button><button class="btn" onclick="cpSave()">Guardar</button></span></div>
      <div style="margin-top:12px;border-top:1px solid var(--line);padding-top:10px"><button class="btn ghost sm" onclick="copySessionLink('${t.id}','${s.id}')">🔗 Copiar link de la sesión</button> <button class="btn ghost sm" onclick="closeClientPop();openSubEdit('${t.id}','${s.id}');setTimeout(()=>smTab('ses'),40)">📅 Configurar sesión</button></div>`}</div></div></div>`;
}

/* ===== Citas con el cliente: subtareas / sub-subtareas con participantes del cliente o sesión configurada ===== */
function subHasCita(s){ const src=s.isSeries?seriesTpl(s):s; return !!((src.invitados||[]).length); }   // cita con cliente = hay invitados del cliente
function citaEstadoInfo(s){ const l=sesLast(s); return l?{k:l.estado,t:({confirmado:'Confirmada',cancelado:'Cancelada',reprogramar:'Pide reprogramar'})[l.estado],c:SES_ST[l.estado].c,bg:SES_ST[l.estado].bg,razon:l.razon,prop:l.propuestas||[],ts:l.ts}:{k:'pendiente',t:'Sin respuesta',c:'#6b7a73',bg:'#eef0ec',razon:'',prop:[],ts:''}; }
function citasAll(){ const out=[]; store.d.tasks.forEach(t=>{ const p=store.project(t.projectId); if(!p) return; const c=store.client(p.clientId)||{name:'',id:''};
  (t.subtasks||[]).forEach(s=>{ if(s.isSeries||!subHasCita(s)||!(s.invitados||[]).length) return; out.push({s,t,p,c,est:citaEstadoInfo(s)}); }); });
  return out; }
function fmtPropuesta(pr){ if(!pr||!pr.fecha) return ''; const d=new Date(pr.fecha+'T00:00:00'); return ['dom','lun','mar','mié','jue','vie','sáb'][d.getDay()]+' '+d.getDate()+' '+MESES[d.getMonth()].slice(0,3).toLowerCase()+(pr.hora?' · '+pr.hora:''); }
let citaFilter='todas', subOnlyCita=false;
function setCitaFilter(v){ citaFilter=v; render(); }
function toggleCitaFilter(){ subOnlyCita=!subOnlyCita; render(); }
function citaCard(it,showClient,cp){ const {s,t,p,c,est}=it; const link=s.shareToken?'':'';
  return `<div class="cita-row" style="border-left:4px solid ${est.c}"><div class="cita-when"><b>${s.date?dLabel(s.date):'sin fecha'}</b><span>${s.time||''}</span></div>
    <div class="cita-main"><div class="cita-nm">${esc(s.name)}</div><div class="muted" style="font-size:.76rem">${showClient?esc(c.name)+' · ':''}${esc(p.name)} · ${esc(t.name)}</div>
      ${est.razon?`<div class="cita-razon">«${esc(est.razon)}»</div>`:''}${est.prop.length?`<div class="cita-prop">Propone: ${est.prop.map(x=>`<span>${esc(fmtPropuesta(x))}</span>`).join('')}</div>`:''}</div>
    <div class="cita-side"><span class="cita-st" style="background:${est.bg};color:${est.c}">${est.t}</span>${cp?`<div style="display:flex;gap:5px;margin-top:6px;justify-content:flex-end"><button class="btn sm" onclick="openCpSesion('${t.id}','${s.id}')">Ver y responder</button></div>`:`<div style="display:flex;gap:5px;margin-top:6px;justify-content:flex-end"><button class="btn ghost sm" title="Abrir la tarea" onclick="openTask('${t.id}')">Abrir</button><button class="btn ghost sm" title="Editar la sesión (objetivo, lugar, temario)" onclick="editCita('${t.id}','${s.id}')">✏️</button><button class="btn ghost sm" title="Ver la página que ve el cliente" onclick="visitSession('${t.id}','${s.id}')">👁</button><button class="btn ghost sm" title="Copiar link de la sesión" onclick="copySessionLink('${t.id}','${s.id}')">🔗</button></div>`}</div></div>`; }
let citaSel=null;
function selectCitaGrp(k){ citaSel=(citaSel===k?null:k); render(); }
function visitSession(tid,sid){ const t=store.task(tid); const s=t&&(t.subtasks||[]).find(x=>x.id===sid); if(!s) return; let tok=s.shareToken; if(!tok){ tok=Math.random().toString(36).slice(2,8)+Math.random().toString(36).slice(2,8); store.updateSubtask(tid,sid,{shareToken:tok}); } window.open(sessionShareUrl(tid,sid,tok),'_blank','noopener'); }
function editCita(tid,sid){ openSubEdit(tid,sid); setTimeout(()=>smTab('ses'),40); }
function citasHistorialHtml(c,cp){
  let all=citasAll().filter(x=>x.c.id===c.id&&(!cp||cp.filter(x))).sort((a,b)=>((b.s.date||'')+(b.s.time||''))<((a.s.date||'')+(a.s.time||''))?-1:1);
  if(cp){ const td=todayISO(), k=x=>(x.s.date||'')+(x.s.time||''); const fut=all.filter(x=>(x.s.date||'')>=td).sort((a,b)=>k(a)<k(b)?-1:1); const past=all.filter(x=>(x.s.date||'')<td); all=[...fut,...past]; }
  const groups=[['todas','📅 Todas las citas','#2c6b4c',all],['pendiente','Sin respuesta','#6b7a73',all.filter(x=>x.est.k==='pendiente')],['reprogramar','Piden reprogramar','#9a7a00',all.filter(x=>x.est.k==='reprogramar')],['confirmado','Confirmadas','#1f7a44',all.filter(x=>x.est.k==='confirmado')],['cancelado','Canceladas','#c0392b',all.filter(x=>x.est.k==='cancelado')]];
  const cur=groups.find(g=>g[0]===citaSel);
  const fichas=groups.map(([k,l,col,arr])=>`<div class="lib-side-it${citaSel===k?' on':''}" onclick="selectCitaGrp('${k}')"><span class="lib-side-nm"><i class="cita-dot" style="background:${col}"></i>${l}</span><span class="lib-side-n">${arr.length}</span></div>`).join('');
  const det=cur?`<div class="lib-det-h"><h3>${cur[1]} · ${cur[3].length}</h3></div><div class="lib-det-b">${cur[3].map(x=>citaCard(x,false,!!cp)).join('')||'<div class="muted" style="padding:10px">No hay citas en este estado.</div>'}</div>`
    :`<div class="muted" style="padding:22px;text-align:center">Elige una ficha para ver las citas con su estado.${cp?'':'<br><span style="font-size:.78rem">Se crean al agregar participantes del cliente (🤝) a una subtarea.</span>'}</div>`;
  return `${cp?'':'<div class="sec-title"><h2>📅 Citas</h2></div>'}${all.length?`<div class="lib-split"><div class="lib-side">${fichas}</div><div class="lib-det">${det}</div></div>`:(cp?'<div class="muted">Aún no hay citas programadas.</div>':'<div class="muted">Este cliente aún no tiene citas. Se crean al agregar participantes del cliente (🤝) a una subtarea.</div>')}`; }

/* ================== FINANZAS POR CLIENTE (solo Dirección): programado · facturado · cobrado parcialmente · cobrado · conciliado ================== */
const PAY_ST={programado:{t:'Programado',c:'#6b7a73',bg:'#eef0ec'},facturado:{t:'Facturado',c:'#2f5fa8',bg:'#eaf1fb'},parcial:{t:'Cobrado parcialmente',c:'#9a7a00',bg:'#fff7e0'},cobrado:{t:'Cobrado',c:'#1f7a44',bg:'#e8f6ee'},conciliado:{t:'Conciliado',c:'#5b4fc9',bg:'#efecfb'}};
function canSeeFinance(){ return role==='gerencia'; }
function payEstado(x){ return x.estado||(x.paid?'cobrado':'programado'); }
function payCobrado(x){ const e=payEstado(x); if(e==='cobrado'||e==='conciliado') return x.cobro&&x.cobro.monto!=null?+x.cobro.monto:(+x.amount||0); if(e==='parcial') return +(x.cobro&&x.cobro.monto)||0; return 0; }
function paySaldo(x){ return Math.max(0,(+x.amount||0)-payCobrado(x)); }
function payVencido(x){ const e=payEstado(x); return (e!=='cobrado'&&e!=='conciliado')&&x.dueDate&&x.dueDate<todayISO()&&paySaldo(x)>0; }
let finSel=null;
function selectFinGrp(k){ finSel=(finSel===k?null:k); render(); }
function payRowHtml(x,p,cp){ const e=payEstado(x), st=PAY_ST[e]; const det=[];
  if(x.factura&&(x.factura.folio||x.factura.fecha)) det.push('🧾 Factura '+(x.factura.folio?esc(x.factura.folio):'')+(x.factura.fecha?' · '+dLabel(x.factura.fecha):''));
  if(e==='parcial'||e==='cobrado'||e==='conciliado') det.push('💵 Cobrado '+money(payCobrado(x))+(x.cobro&&x.cobro.fecha?' · '+dLabel(x.cobro.fecha):''));
  if(e==='conciliado'&&x.conciliadoFecha) det.push('✔ Conciliado '+dLabel(x.conciliadoFecha));
  if(paySaldo(x)>0&&(e==='parcial'||e==='facturado')) det.push('Saldo '+money(paySaldo(x)));
  return `<div class="cita-row" style="border-left:4px solid ${st.c}"><div class="cita-when"><b>${x.dueDate?dLabel(x.dueDate):'sin fecha'}</b><span>${payVencido(x)?'<span style="color:#c0392b;font-weight:700">vencido</span>':'vence'}</span></div>
    <div class="cita-main"><div class="cita-nm">${money(x.amount)}</div><div class="muted" style="font-size:.76rem">${esc(p.name)}</div>${det.map(d=>`<div class="fin-det">${d}</div>`).join('')}${x.nota?`<div class="cita-razon">«${esc(x.nota)}»</div>`:''}</div>
    <div class="cita-side"><span class="cita-st" style="background:${st.bg};color:${st.c}">${st.t}</span>${cp?'':`<div style="display:flex;gap:5px;margin-top:6px;justify-content:flex-end"><button class="btn ghost sm" title="Cambiar estado o registrar factura, cobro o conciliación" onclick="openPayEstado('${x.id}')">✏️ Editar</button></div>`}</div></div>`; }
function finanzasHtml(c,cp){
  if(!cp&&!canSeeFinance()) return '';
  const rows=[]; store.projectsOf(c.id).forEach(p=>store.paymentsOf(p.id).forEach(x=>rows.push({x,p}))); rows.sort((a,b)=>(a.x.dueDate||'')<(b.x.dueDate||'')?-1:1);
  const sum=a=>a.reduce((n,r)=>n+(+r.x.amount||0),0); const by=k=>rows.filter(r=>payEstado(r.x)===k);
  const groups=[['todos','💰 Todos los pagos','#2c6b4c',rows],['programado','Programados',PAY_ST.programado.c,by('programado')],['facturado','Facturados',PAY_ST.facturado.c,by('facturado')],['parcial','Cobrados parcialmente',PAY_ST.parcial.c,by('parcial')],['cobrado','Cobrados',PAY_ST.cobrado.c,by('cobrado')],['conciliado','Conciliados',PAY_ST.conciliado.c,by('conciliado')]];
  const cur=groups.find(g=>g[0]===finSel);
  const contratado=sum(rows), cobrado=rows.reduce((n,r)=>n+payCobrado(r.x),0), saldo=contratado-cobrado, vencido=rows.filter(r=>payVencido(r.x)).reduce((n,r)=>n+paySaldo(r.x),0);
  const alCorriente=vencido===0;
  const fichas=groups.map(([k,l,col,arr])=>`<div class="lib-side-it${finSel===k?' on':''}" onclick="selectFinGrp('${k}')"><span class="lib-side-nm"><i class="cita-dot" style="background:${col}"></i>${l}</span><span class="lib-side-n" title="${money(sum(arr))}">${arr.length}</span></div>`).join('');
  const det=cur?`<div class="lib-det-h"><h3>${cur[1]} · ${cur[3].length} · ${money(sum(cur[3]))}</h3></div><div class="lib-det-b">${cur[3].map(r=>payRowHtml(r.x,r.p,!!cp)).join('')||'<div class="muted" style="padding:10px">No hay pagos en este estado.</div>'}</div>`:`<div class="muted" style="padding:22px;text-align:center">Elige una ficha para ver los pagos y su estado.</div>`;
  return `${cp?'':'<div class="sec-title"><h2>💰 Finanzas</h2></div>'}
    <div class="fin-sum"><div><span>Contratado</span><b>${money(contratado)}</b></div><div><span>Cobrado</span><b style="color:#1f7a44">${money(cobrado)}</b></div><div><span>Saldo pendiente</span><b>${money(saldo)}</b></div><div><span>Vencido</span><b style="color:${vencido?'#c0392b':'#1f7a44'}">${money(vencido)}</b></div><div class="fin-flag" style="background:${alCorriente?'#e8f6ee':'#fdeceb'};color:${alCorriente?'#1f7a44':'#c0392b'}">${rows.length?(alCorriente?'✅ Al corriente':'⚠️ Con saldo vencido'):'Sin pagos programados'}</div></div>
    ${rows.length?`<div class="lib-split"><div class="lib-side">${fichas}</div><div class="lib-det">${det}</div></div>`:(cp?'<div class="muted">Aún no hay pagos programados.</div>':'<div class="muted">Este cliente aún no tiene pagos programados. Se crean con el calendario de pagos de cada proyecto.</div>')}`; }
function openPayEstado(id){ if(!canSeeFinance()) return; qm={kind:'pagoEstado',payId:id}; render(); setTimeout(payEstadoChange,0); }
function payEstadoChange(){ const e=val('pe-estado'); const show=(id,on)=>{ const el=document.getElementById(id); if(el) el.style.display=on?'block':'none'; };
  show('pe-fac',['facturado','parcial','cobrado','conciliado'].includes(e)); show('pe-cob',['parcial','cobrado','conciliado'].includes(e)); show('pe-con',e==='conciliado');
  const m=document.getElementById('pe-cmonto'); const amt=+((store.d.payments.find(z=>z.id===qm.payId)||{}).amount)||0; if(m&&(e==='cobrado'||e==='conciliado')&&(!m.value||+m.value<amt)&&!m.dataset.touched) m.value=amt;
  const f=document.getElementById('pe-cfecha'); if(f&&!f.value&&['parcial','cobrado','conciliado'].includes(e)) f.value=todayISO(); const cf=document.getElementById('pe-confecha'); if(cf&&!cf.value&&e==='conciliado') cf.value=todayISO(); }
function savePayEstado(){ const x=store.d.payments.find(z=>z.id===qm.payId); if(!x||!canSeeFinance()) return; const e=val('pe-estado'); const amt=+x.amount||0;
  const fac=['facturado','parcial','cobrado','conciliado'].includes(e)?{folio:(val('pe-folio')||'').trim(),fecha:val('pe-ffecha')||''}:null;
  let cobro=null; if(['parcial','cobrado','conciliado'].includes(e)){ const m=+val('pe-cmonto')||0; if(e==='parcial'&&!(m>0&&m<amt)){ alert('En un cobro parcial el monto debe ser mayor a 0 y menor al total ('+money(amt)+').'); return; } if(e!=='parcial'&&m<=0){ alert('Escribe el monto cobrado.'); return; } cobro={monto:e==='parcial'?m:Math.max(m,amt),fecha:val('pe-cfecha')||todayISO()}; }
  const patch={estado:e,factura:fac,cobro,conciliadoFecha:e==='conciliado'?(val('pe-confecha')||todayISO()):null,nota:(val('pe-nota')||'').trim(),paid:(e==='cobrado'||e==='conciliado'),paidDate:cobro?cobro.fecha:null};
  store.updatePayment(x.id,patch); qm=null; render(); }

/* ================== SESIÓN CON EL CLIENTE (página pública de una subtarea con participantes del cliente) ================== */
function sesOf(s){ const x=s.sesion||{}; return {objetivo:x.objetivo||'',lugar:Object.assign({tipo:'meet',link:'',direccion:''},x.lugar||{}),temario:x.temario||[],respuestas:x.respuestas||[],reabierta:x.reabierta||0,respAck:x.respAck||{}}; }
function sesLast(s){ const r=sesOf(s).respuestas; return r.length?r[r.length-1]:null; }
function sesCanRespond(s){ const x=sesOf(s); const last=sesLast(s); return !last||(x.reabierta&&x.reabierta>last.tsN); }
function sessionShareUrl(tid,sid,token){ return location.origin+location.pathname+'#/sesion/'+encodeURIComponent(tid)+'/'+encodeURIComponent(sid)+'/'+encodeURIComponent(token); }
function copySessionLink(tid,sid){ const t=store.task(tid); const s=t&&(t.subtasks||[]).find(x=>x.id===sid); if(!s) return;
  let tok=s.shareToken; if(!tok){ tok=Math.random().toString(36).slice(2,8)+Math.random().toString(36).slice(2,8); store.updateSubtask(tid,sid,{shareToken:tok}); }
  const url=sessionShareUrl(tid,sid,tok); const done=()=>shareToast(citaKind(s)==='interna'?'🔗 Link de la cita interna copiado.':'🔗 Link de la sesión copiado. Cualquiera con el link la ve sin iniciar sesión.');
  if(navigator.clipboard&&navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(done,()=>prompt('Copia el link:',url)); else prompt('Copia el link:',url); }
const SES_ST={confirmado:{t:'✅ El cliente confirmó',c:'#1f7a44',bg:'#e8f6ee'},cancelado:{t:'❌ El cliente canceló',c:'#c0392b',bg:'#fdeceb'},reprogramar:{t:'🔁 El cliente pidió reprogramar',c:'#9a7a00',bg:'#fff7e0'}};
function smTemRow(it,i,staffOpts){ const fromClient=it.por==='cliente'&&it.by==='cliente';
  return `<div class="tem-row" data-id="${esc(it.id||'')}" data-by="${esc(it.by||'')}" data-ts="${esc(it.ts||'')}">
    <input class="tem-t" value="${esc(it.titulo||'')}" placeholder="Tema" ${fromClient?'readonly':''}>
    ${fromClient?`<span class="tem-badge">Agregado por el cliente</span><input type="hidden" class="tem-p" value="cliente">`:`<select class="tem-p"><option value="cliente" ${it.por==='cliente'?'selected':''}>Cliente (logo)</option>${staffOpts.replace('value="'+(it.personId||'')+'"','value="'+(it.personId||'')+'" selected')}</select>`}
    <button type="button" class="sub-ib" title="Quitar tema" onclick="this.closest('.tem-row').remove()">🗑️</button></div>`; }
function smTemAdd(){ const box=document.getElementById('sm-tem'); if(!box) return; const t=store.task(subEd.tid); const staffOpts=store.activeStaff().map(u=>`<option value="${u.id}">${esc(u.name)}</option>`).join('');
  const div=document.createElement('div'); div.innerHTML=smTemRow({id:'tm_'+Date.now().toString(36),titulo:'',por:'nuwek',by:currentUser,ts:new Date().toISOString()},0,staffOpts); box.appendChild(div.firstElementChild); const inp=box.lastElementChild.querySelector('.tem-t'); if(inp) inp.focus(); }
function smLugarChange(){ const k=val('sm-ltipo'); const a=document.getElementById('sm-l-meet'), b=document.getElementById('sm-l-pres'); if(a) a.style.display=(k==='meet')?'block':'none'; if(b) b.style.display=(k==='presencial')?'block':'none'; }
function smUseDate(f,h){ const d=document.getElementById('sm-date'); if(d&&!d.disabled){ d.value=f; } else { alert(SUB_DATE_MSG); return; } const t=document.getElementById('sm-time'); if(t&&h) t.value=h; smDateChange(); smTab('datos'); shareToast('📅 Fecha cargada. Guarda para reprogramar y reabrir la sesión al cliente.'); }
function smReopen(){ const {tid,sid}=subEd; const t=store.task(tid); const s=t.subtasks.find(x=>x.id===sid); const ses=Object.assign({},s.sesion||{}); ses.reabierta=Date.now(); store.updateSubtask(tid,sid,{sesion:ses}); logEvent(tid,'Permitió que el cliente responda de nuevo la sesión «'+s.name+'»'); openSubEdit(tid,sid); setTimeout(()=>smTab('ses'),30); }
function smSesionPane(s0,t,c){
  const ses=sesOf(s0); const staffOpts=store.activeStaff().map(u=>`<option value="${u.id}">${esc(u.name)}</option>`).join(''); const last=sesLast(s0);
  const st=last&&SES_ST[last.estado];
  const resp=last?`<div class="ses-resp" style="background:${st.bg};color:${st.c}"><b>${st.t}</b> · ${esc(new Date(last.ts).toLocaleString('es-MX',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}))}${last.razon?`<div style="margin-top:4px;color:#333">«${esc(last.razon)}»</div>`:''}${(last.propuestas||[]).length?`<div style="margin-top:8px"><b style="font-size:.8rem">Fechas que propone:</b>${last.propuestas.map(x=>`<div class="rep-row" style="margin-top:4px"><span class="cita-prop"><span>${esc(fmtPropuesta(x))}</span></span><button type="button" class="rep-chip" onclick="smUseDate('${x.fecha}','${x.hora||''}')">Usar esta fecha</button></div>`).join('')}<div class="hint">Al guardar con la fecha nueva, la sesión se reabre para que el cliente la confirme.</div></div>`:''}${sesCanRespond(s0)?'':`<div style="margin-top:6px"><button type="button" class="btn ghost sm" onclick="smReopen()">Permitir que responda de nuevo</button></div>`}</div>`:'<div class="muted" style="font-size:.82rem">El cliente aún no responde.</div>';
  const rows=ses.temario.map((it,i)=>smTemRow(it,i,staffOpts)).join('');
  return `<div class="sm-pane" data-pane="ses" style="display:none">
    <div class="field"><label>Objetivo de la reunión</label><textarea id="sm-obj" rows="3" style="width:100%;padding:9px;border:2px solid var(--line);border-radius:8px;font-family:inherit">${esc(ses.objetivo)}</textarea></div>
    <div class="field"><label>Lugar</label><select id="sm-ltipo" onchange="smLugarChange()"><option value="meet" ${ses.lugar.tipo==='presencial'?'':'selected'}>Videollamada (Meet, Zoom, Teams…)</option><option value="presencial" ${ses.lugar.tipo==='presencial'?'selected':''}>Presencial</option></select>
      <div id="sm-l-meet" style="margin-top:8px"><input id="sm-llink" placeholder="https://meet.google.com/…" value="${esc(ses.lugar.link)}"></div>
      <div id="sm-l-pres" style="margin-top:8px;display:none"><input id="sm-ldir" placeholder="Dirección (calle, número, colonia, ciudad)" value="${esc(ses.lugar.direccion||c.location||'')}"><div class="hint">Con esta dirección se arma el mapa de la página del cliente. Si la dejas vacía se usa la ubicación de la ficha del cliente.</div></div></div>
    <div class="field"><label>Temario (quién presenta cada tema)</label><div id="sm-tem">${rows}</div><button type="button" class="btn ghost sm" style="margin-top:6px" onclick="smTemAdd()">＋ Agregar tema</button></div>
    <div class="field"><label>Respuesta del cliente</label>${resp}</div>
    <div class="field"><button type="button" class="btn ghost" onclick="copySessionLink('${t.id}','${s0.id}')">🔗 Copiar link de la sesión para el cliente</button><div class="hint">El cliente ve esta información sin iniciar sesión y puede confirmar, reprogramar o cancelar (con razón).</div></div>
  </div>`; }
/* ================== PÁGINA PÚBLICA DE LA SESIÓN (la ve el cliente sin iniciar sesión) ================== */
let publicSes=null, sesModal=null;
function takeSesionHash(){ const m=(location.hash||'').match(/^#\/sesion\/([^/]+)\/([^/]+)\/([^/]+)$/); if(!m) return null; const d=x=>{ try{ return decodeURIComponent(x); }catch(_){ return x; } };
  try{ history.replaceState(null,'',location.pathname+location.search); }catch(_){} return {tid:d(m[1]),sid:d(m[2]),token:d(m[3])}; }
let shareSesionAtLoad=takeSesionHash();
function sesFind(){ if(!publicSes) return null; const t=store.task(publicSes.tid); const s=t&&(t.subtasks||[]).find(x=>x.id===publicSes.sid); if(!s||!s.shareToken||s.shareToken!==publicSes.token) return {ok:false};
  const p=store.project(t.projectId)||{}; const c=store.client(p.clientId)||{people:[],name:''}; return {ok:true,t,s,p,c}; }
function sesWhen(s){ if(!s.date) return 'Fecha por confirmar'; const d=new Date(s.date+'T00:00:00'); const wd=['domingo','lunes','martes','miércoles','jueves','viernes','sábado'][d.getDay()]; let r=wd+' '+d.getDate()+' de '+MESES[d.getMonth()].toLowerCase()+' de '+d.getFullYear();
  if(s.time){ r+=' · '+s.time; if(s.durMin){ const [h,m]=s.time.split(':').map(Number); const e=h*60+m+(+s.durMin); r+=' – '+String(Math.floor(e/60)%24).padStart(2,'0')+':'+String(e%60).padStart(2,'0'); } } return r; }
function sesProvider(url){ try{ const h=new URL(/^https?:\/\//i.test(url)?url:'https://'+url).hostname; if(/meet\.google/.test(h)) return 'Google Meet'; if(/zoom\./.test(h)) return 'Zoom'; if(/teams\./.test(h)) return 'Microsoft Teams'; return h; }catch(_){ return 'videollamada'; } }
function sesAv(person,size){ person=person||{}; const st=`width:${size}px;height:${size}px`; return person.photo?`<span class="ps-av" style="${st};background-image:url('${person.photo}')"></span>`:`<span class="ps-av" style="${st};background:${person.color||'#3f7d6e'}">${mdEsc((person.name||'?')[0])}</span>`; }
function sesClientLogo(c,size){ const st=`width:${size}px;height:${size}px`; return c.logo?`<span class="ps-av ps-logo" style="${st};background-image:url('${c.logo}')"></span>`:`<span class="ps-av" style="${st};background:#8a9a93">${mdEsc((c.name||'?')[0])}</span>`; }
function viewPublicSession(){
  const f=sesFind(); const _mt=session&&f&&f.ok&&mnRoleOk()?`<button class="pub-back pub-min" onclick="mnAuthOpen()">📝 ${(f.s.minutas||[]).length?'Ver minuta':'Minuta'}</button>`:''; const _au=(!session&&!clientSess&&f&&f.ok)?`<button class="pub-back pub-min" onclick="mnAuthOpen()">🔐 Acceso Nuwek</button>`:''; const top=`<div class="pub-top"><div class="brand"><span class="mark">N</span> Nuwek <span class="slash">╱</span> Portal</div>${(session||clientSess)?`<div class="pub-acts">${_mt}<button class="pub-back" onclick="closePublicSes()">← Volver al portal</button></div>`:(_au?`<div class="pub-acts">${_au}</div>`:'')}</div>`;
  if(!f||!f.ok) return `<div class="pub-wrap">${top}<div class="pub-card"><h2>Este link no es válido</h2><p class="muted">Pudo haber cambiado o estar incompleto. Pídele a tu contacto en Nuwek que te lo vuelva a enviar.</p></div></div>`;
  const {t,s,c}=f; const ses=sesOf(s); const last=sesLast(s); const staffIds=[...new Set([s.personId,...(s.team||[])].filter(Boolean))].filter(id=>store.d.staff.some(u=>u.id===id));
  const nuwek=staffIds.map(id=>{ const u=store.person(id); return `<button class="ps-p" onclick="openSesContact('${id}')" title="${esc(u.name)} · clic para contactar">${sesAv(u,64)}<span class="ps-pn">${mdEsc((u.name||'').split(' ')[0])}</span></button>`; }).join('')||'<span class="muted">Por definir</span>';
  const cli=(c.people||[]).filter(pp=>(s.invitados||[]).includes(pp.id)).map(pp=>`<div class="ps-cl">${sesAv(pp,34)}<span><b>${mdEsc(pp.name)}</b>${pp.role?`<span class="muted"> · ${mdEsc(pp.role)}</span>`:''}</span></div>`).join('');
  const lug=ses.lugar; let lugarHtml;
  if(lug.tipo==='presencial'){ const dir=lug.direccion||c.location||''; lugarHtml=dir?`<div class="ps-lug"><b>📍 Presencial</b><div>${mdEsc(dir)}</div><iframe class="ps-map" loading="lazy" referrerpolicy="no-referrer-when-downgrade" src="https://maps.google.com/maps?q=${encodeURIComponent(dir)}&z=15&output=embed"></iframe><a class="btn ghost sm" target="_blank" rel="noopener noreferrer" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(dir)}">Abrir en Google Maps ↗</a></div>`:'<div class="muted">Dirección por confirmar.</div>'; }
  else lugarHtml=lug.link?`<div class="ps-lug"><b>💻 Videollamada · ${mdEsc(sesProvider(lug.link))}</b><a class="btn" target="_blank" rel="noopener noreferrer" href="${esc(/^https?:\/\//i.test(lug.link)?lug.link:'https://'+lug.link)}">Unirse a la reunión ↗</a><div class="muted" style="word-break:break-all;font-size:.76rem">${mdEsc(lug.link)}</div></div>`:'<div class="muted">El link de la reunión se compartirá pronto.</div>';
  const tem=ses.temario.map((it,i)=>{ const pr=it.por==='cliente'?{logo:true}:store.person(it.personId); return `<div class="ps-tem"><span class="ps-n">${i+1}</span><div class="ps-tt">${mdEsc(it.titulo)}</div>${it.por==='cliente'?`<span class="ps-by" title="${mdEsc(c.name)}">${sesClientLogo(c,34)}<span>${mdEsc(c.name)}</span></span>`:`<span class="ps-by">${sesAv(pr,34)}<span>${mdEsc((pr.name||'').split(' ')[0])}</span></span>`}</div>`; }).join('')||'<div class="muted">Aún sin temario.</div>';
  const canAdd=!(last&&last.estado==='cancelado');
  let actions;
  if(last&&!sesCanRespond(s)){ const st=SES_ST[last.estado]; actions=`<div class="ps-done" style="background:${st.bg};color:${st.c}"><b>${st.t.replace('El cliente','Tu respuesta:')}</b> · ${mdEsc(new Date(last.ts).toLocaleString('es-MX',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}))}${last.razon?`<div class="ps-razon">Razón: «${mdEsc(last.razon)}»</div>`:''}${(last.propuestas||[]).length?`<div class="ps-razon">Fechas que propusiste: ${(last.propuestas||[]).map(x=>`<b>${mdEsc(fmtPropuesta(x))}</b>`).join(' · ')}</div>`:''}<div class="muted" style="font-size:.78rem;margin-top:6px">Tu respuesta ya quedó registrada y no se puede modificar. Si necesitas algo más, escríbele a tu contacto en Nuwek.</div></div>`; }
  else actions=`<div class="ps-actions"><button class="ps-btn cancel" onclick="openSesModal('cancelado')">CANCELAR</button><button class="ps-btn repro" onclick="openSesModal('reprogramar')">REPROGRAMAR</button><button class="ps-btn ok" onclick="sesConfirmar()">CONFIRMAR</button></div>`;
  return `<div class="pub-wrap">${top}<div class="ps-page">
    <div class="ps-head"><div class="ps-hl">${sesClientLogo(c,54)}<div><div class="ps-eye">${citaKind(s)==='interna'?'Sesión interna del equipo Nuwek':'Sesión con '+mdEsc(c.name)}</div><h1>${mdEsc(s.name)}</h1></div></div><div class="ps-when">🗓️ ${mdEsc(sesWhen(s))}</div></div>
    <div class="ps-grid"><div class="ps-card"><h4>🎯 Objetivo de la reunión</h4>${ses.objetivo?`<div class="md">${mdRender(ses.objetivo)}</div>`:'<div class="muted">Por definir.</div>'}</div>
      <div class="ps-card"><h4>👥 Quiénes participan por Nuwek</h4><div class="ps-people">${nuwek}</div><div class="muted" style="font-size:.74rem;margin-top:4px">Toca una foto para escribirles o llamarles.</div>${cli?`<h4 style="margin-top:14px">Por parte de ${mdEsc(c.name)}</h4>${cli}`:''}</div>
      <div class="ps-card"><h4>📍 Lugar</h4>${lugarHtml}</div>
      <div class="ps-card"><h4>📋 Temario</h4>${tem}${canAdd?`<button class="btn ghost sm" style="margin-top:10px" onclick="openSesModal('tema')">＋ Agregar un tema</button>`:''}</div></div>
    ${citaKind(s)==='interna'?'':actions}</div>${''}</div>`; }
function closePublicSes(){ publicSes=null; render(); }
function openSesModal(type,extra){ sesModal=Object.assign({type},extra||{}); render(); setTimeout(()=>{ const el=document.getElementById('ps-in'); if(el) el.focus(); },30); }
function closeSesModal(){ sesModal=null; render(); }
function sesPubModal(){ if(!sesModal) return ''; const f=sesFind(); if(!f||!f.ok) return '';
  const wrap=(title,body)=>`<div class="modal active" style="z-index:150" onclick="if(event.target===this)closeSesModal()"><div class="modal-card" style="max-width:440px"><div class="m-head"><div class="m-top"><h3 style="margin:0">${title}</h3><button class="x" onclick="closeSesModal()">×</button></div></div><div class="m-body">${body}</div></div></div>`;
  if(sesModal.type==='cancelado'||sesModal.type==='reprogramar'){ const cancel=sesModal.type==='cancelado';
    return wrap(cancel?'Cancelar la sesión':'Pedir reprogramación',cancel
      ?`<p class="muted" style="margin-top:0">Cuéntanos la <b>razón o circunstancia</b> de la cancelación. <b>Es obligatoria</b> y, una vez enviada, no se puede editar.</p><textarea id="ps-in" rows="4" style="width:100%;padding:10px;border:2px solid var(--line);border-radius:10px;font-family:inherit" placeholder="Motivo de la cancelación…"></textarea><div class="wiz-actions"><button class="btn ghost" onclick="closeSesModal()">Volver</button><button class="btn" style="background:#c0392b;border-color:#c0392b" onclick="sesEnviar('cancelado')">Enviar cancelación</button></div>`
      :`<p class="muted" style="margin-top:0">Escribe la <b>razón, motivo o circunstancia</b> por la que necesitas reprogramar y <b>propón las fechas y horarios</b> que te acomodan. <b>Es obligatorio</b> y, una vez enviado, no se puede editar.</p><textarea id="ps-in" rows="5" style="width:100%;padding:10px;border:2px solid var(--line);border-radius:10px;font-family:inherit" placeholder="Ej. Ese día estaré de viaje. Podría ser el jueves 22 a las 11:00 o el viernes 23 por la tarde."></textarea><div class="wiz-actions"><button class="btn ghost" onclick="closeSesModal()">Volver</button><button class="btn" onclick="sesEnviar('reprogramar')">Enviar solicitud</button></div>`); }
  if(sesModal.type==='tema') return wrap('Agregar un tema a la agenda',`<p class="muted" style="margin-top:0">Se agregará con el logo de ${mdEsc(f.c.name)}.</p><input id="ps-in" placeholder="Tema que quieres tratar" maxlength="140" onkeydown="if(event.key==='Enter'){event.preventDefault();sesAgregarTema()}"><div class="wiz-actions"><button class="btn ghost" onclick="closeSesModal()">Cancelar</button><button class="btn" onclick="sesAgregarTema()">Agregar</button></div>`);
  if(sesModal.type==='contacto'){ const u=store.person(sesModal.id); const raw=(u.phoneWork||u.phonePersonal||'').replace(/[^\d]/g,''); const num=raw.length===10?'52'+raw:raw;
    return wrap(mdEsc(u.name),`<div style="display:flex;align-items:center;gap:14px;margin-bottom:14px">${sesAv(u,64)}<div><b>${mdEsc(u.name)}</b><div class="muted">${mdEsc(u.role||'Nuwek')}</div></div></div>${num?`<div class="ps-contact"><a class="ps-cbtn wa" target="_blank" rel="noopener noreferrer" href="https://wa.me/${num}?text=${encodeURIComponent('Hola '+(u.name||'').split(' ')[0]+', te escribo sobre la sesión «'+(f.s.name)+'».')}">💬 WhatsApp</a><a class="ps-cbtn call" href="tel:+${num}">📞 Llamar</a></div>`:'<div class="muted">Esta persona aún no tiene teléfono registrado.</div>'}`); }
  return ''; }
async function dbPatchSubtask(tid,sid,fn){
  const { data, error } = await sb.from('tareas').select('*').eq('id',tid).single(); if(error) throw error;
  const t=dbToAppTask(data); const sub=(t.subtasks||[]).find(x=>x.id===sid); if(!sub) throw new Error('La sesión ya no existe'); fn(sub,t);
  const r=await sb.from('tareas').upsert(appToDbTask(t)); if(r.error) throw r.error;
  const i=store.d.tasks.findIndex(x=>x.id===tid); if(i>=0) store.d.tasks[i]=t; return t; }
async function sesRespond(estado,razon,propuestas){ const f=sesFind(); if(!f||!f.ok) return;
  try{ await dbPatchSubtask(f.t.id,f.s.id,(sub)=>{ if(sesLast(sub)&&!sesCanRespond(sub)) throw new Error('Esta sesión ya tiene una respuesta registrada.');
      const ses=Object.assign({},sub.sesion||{}); const now=new Date(); ses.respuestas=(ses.respuestas||[]).concat([{id:'rs_'+Date.now().toString(36),ts:now.toISOString(),tsN:now.getTime(),estado,razon:razon||'',propuestas:propuestas||[]}]); sub.sesion=ses; });
    sesModal=null; render(); }catch(e){ alert('No se pudo enviar tu respuesta: '+(e.message||e)); render(); } }
function sesEnviar(estado){ const r=(val('ps-in')||'').trim(); if(r.length<(estado==='reprogramar'?10:3)){ alert(estado==='reprogramar'?'Cuéntanos la razón y propón las fechas que te acomodan (escríbelo con un poco más de detalle).':'Escribe la razón (es obligatoria).'); return; } sesRespond(estado,r,[]); }
function sesConfirmar(){ if(confirm('¿Confirmas tu asistencia a esta sesión?')) sesRespond('confirmado',''); }
async function sesAgregarTema(){ const ti=(val('ps-in')||'').trim(); if(ti.length<2){ alert('Escribe el tema.'); return; } const f=sesFind(); if(!f||!f.ok) return;
  try{ await dbPatchSubtask(f.t.id,f.s.id,(sub)=>{ const ses=Object.assign({},sub.sesion||{}); ses.temario=(ses.temario||[]).concat([{id:'tm_'+Date.now().toString(36),titulo:ti,por:'cliente',personId:'',by:'cliente',ts:new Date().toISOString()}]); sub.sesion=ses; });
    sesModal=null; render(); }catch(e){ alert('No se pudo agregar el tema: '+(e.message||e)); } }
function openSesContact(id){ openSesModal('contacto',{id}); }

/* ================== PORTAL DEL CLIENTE (maqueta con funciones reales) ==================
   Usuario + código de 6 cifras. Dos roles: Administrador (todo) y Colaborador (solo lo suyo).
   OJO: todavía no hay seguridad a nivel de base de datos (eso es la siguiente etapa). */
let clientSess=null, showClientLogin=false, cpView='inicio', cpTaskId=null, cpUserEd=null, cpLoginErr='', cpFails={}, cpProj='';
const normU=s=>String(s||'').trim().toLowerCase();
function findPortalUser(user){ const u=normU(user); if(!u) return null; for(const c of store.d.clients){ if(c.activo===false) continue; for(const p of (c.people||[])){ if(p.portal&&p.portal.user&&normU(p.portal.user)===u) return {c,p}; } } return null; }
function openClientLogin(){ showClientLogin=true; cpLoginErr=''; render(); setTimeout(()=>{ const e=document.getElementById('cl-user'); if(e) e.focus(); },30); }
function closeClientLogin(){ showClientLogin=false; render(); }
function clientLoginScreen(){
  return `<div class="login-wrap" style="background-image:linear-gradient(rgba(10,20,15,.45),rgba(10,20,15,.65)),url('${getLoginBg()}')"><div class="cl-card">
    <div class="brand" style="justify-content:center;color:var(--green)"><span class="mark">N</span> Nuwek <span class="slash">╱</span> Portal</div>
    <h2>Portal de clientes</h2><div class="muted" style="margin-bottom:14px">Entra con tu usuario y tu código de 6 cifras.</div>
    <div class="field"><label>Usuario</label><input id="cl-user" autocomplete="username" autocapitalize="off" onkeydown="if(event.key==='Enter')document.getElementById('cl-code').focus()"></div>
    <div class="field"><label>Código de 6 cifras</label><input id="cl-code" type="password" inputmode="numeric" maxlength="6" autocomplete="current-password" placeholder="••••••" onkeydown="if(event.key==='Enter')clientLogin()"></div>
    ${cpLoginErr?`<div class="pin-err" style="color:#c0392b;margin-bottom:8px">${esc(cpLoginErr)}</div>`:''}
    <button class="btn" style="width:100%" onclick="clientLogin()">Entrar</button>
    <div style="text-align:center;margin-top:10px"><a class="cl-link" onclick="cpRecOpen()">¿Olvidaste tu código?</a></div>
    ${window.CLIENT_ONLY?'':'<div style="text-align:center;margin-top:12px"><a class="cl-link" onclick="closeClientLogin()">← Soy del equipo Nuwek</a></div>'}</div></div>`; }
function clientLogin(){
  const u=normU(val('cl-user')), code=(val('cl-code')||'').trim(); const lock=cpFails[u]; if(lock&&lock.until&&Date.now()<lock.until){ cpLoginErr='Demasiados intentos. Espera unos minutos.'; render(); return; }
  const f=findPortalUser(u);
  if(f&&f.p.portal.activo!==false&&String(f.p.portal.code)===code){ clientSess={cid:f.c.id,pid:f.p.id}; saveClientSession(); cpView=f.p.portal.rol==='admin'?'inicio':'tareas'; cpTaskId=null; citaSel=null; finSel=null; cpProj=''; cpFails[u]=null; cpLoginErr=''; showClientLogin=false; render(); return; }
  const a=cpFails[u]||{fails:0,until:0}; a.fails++; if(a.fails>=3){ a.until=Date.now()+5*60*1000; a.fails=0; cpLoginErr='Demasiados intentos. Espera 5 minutos.'; } else cpLoginErr='Usuario o código incorrecto.'; cpFails[u]=a; render(); }
function saveClientSession(){ try{ if(clientSess) localStorage.setItem('nuwekClient',JSON.stringify(Object.assign({},clientSess,{exp:Date.now()+SESSION_TTL_MS}))); }catch(_){} }
function restoreClientSession(){ try{ const o=JSON.parse(localStorage.getItem('nuwekClient')||'null'); if(!o||Date.now()>o.exp){ localStorage.removeItem('nuwekClient'); return; } clientSess={cid:o.cid,pid:o.pid}; if(!cpCtx()){ clientSess=null; localStorage.removeItem('nuwekClient'); return; } const s=sessionStorage.getItem('nuwekCpView'); if(s) cpView=s; else cpView=cpCtx().isAdmin?'inicio':'tareas'; }catch(_){} }
function clientLogout(){ clientSess=null; cpChg=null; cpChgShown=false; cpTaskId=null; cpUserEd=null; try{ localStorage.removeItem('nuwekClient'); sessionStorage.removeItem('nuwekCpView'); }catch(_){} render(); }
function cpCtx(){ if(!clientSess) return null; const c=store.client(clientSess.cid); const me=c&&(c.people||[]).find(x=>x.id===clientSess.pid); if(!c||c.activo===false||!me||!me.portal||me.portal.activo===false) return null; return {c,me,isAdmin:me.portal.rol==='admin'}; }
function setCpView(v){ cpView=v; try{ sessionStorage.setItem('nuwekCpView',v); }catch(_){} render(); window.scrollTo(0,0); }
function cpSecs(ctx){ return ctx.isAdmin?[['inicio','🏠 Inicio'],['tareas','✅ Mis tareas'],['citas','📅 Citas'],['gantt','📊 Gantt'],['finanzas','💰 Finanzas'],['tiempos','⏱ Tiempos'],['notas','📝 Notas'],['score','🏆 Scorecard'],['usuarios','👥 Usuarios']]:[['tareas','✅ Mis tareas'],['citas','📅 Mis citas']]; }
function cpGroups(ctx){ if(!ctx.isAdmin) return [{t:'',items:cpSecs(ctx)}]; const m={}; cpSecs(ctx).forEach(x=>m[x[0]]=x);
  return [{t:'Seguimiento',items:['inicio','tareas','citas','gantt'].map(k=>m[k])},{t:'Resultados',items:['tiempos','score','notas'].map(k=>m[k])},{t:'Administración',items:['finanzas','usuarios'].map(k=>m[k])}]; }
function renderClientPortal(){
  const app=document.getElementById('app'); const ctx=cpCtx(); if(!ctx){ clientSess=null; try{ localStorage.removeItem('nuwekClient'); }catch(_){} app.innerHTML=loginScreen(); document.getElementById('modal-root').innerHTML=''; return; }
  if(ctx.me.portal&&ctx.me.portal.reset&&!cpChg&&!cpChgShown){ cpChgShown=true; cpChg={forced:true}; }
  saveClientSession(); const secs=cpSecs(ctx); if(!secs.some(x=>x[0]===cpView)) cpView=secs[0][0];
  const {c,me}=ctx; const logo=c.logo?`<span class="cp-logo" style="background-image:url('${esc(c.logo)}')"></span>`:`<span class="cp-logo none">${esc((c.name||'?')[0])}</span>`;
  const body=({inicio:cpInicio,tareas:cpTareas,citas:cpCitas,gantt:cpGantt,finanzas:cpFinanzas,tiempos:cpTiempos,notas:cpNotas,score:cpScore,usuarios:cpUsuarios})[cpView](ctx);
  app.innerHTML=`<div class="topbar"><div class="topbar-in"><div class="brand"><span class="mark">N</span> Nuwek <span class="slash">╱</span> Portal</div>
      <div class="sessbar">${avatar(me,true)}<div class="sess-info"><div class="sess-nm">${esc(me.name)}</div><div class="sess-rl">${ctx.isAdmin?'Administrador':'Colaborador'} · ${esc(c.name)}</div></div><button class="sess-out cp-key" title="Cambiar mi código" onclick="cpChgOpen()">🔑<span class="hide-sm"> Cambiar código</span></button><button class="sess-out cp-out" onclick="clientLogout()">Salir</button></div></div></div>
    <div class="cp-wrap"><div class="cp-head">${logo}<div><div class="cp-eye">Portal del cliente</div><h1>${esc(c.name)}</h1></div></div>
      <div class="cp-nav2">${cpGroups(ctx).map(g=>`<div class="cp-grp">${g.t?`<div class="cp-gt">${g.t}</div>`:''}<div class="cp-gb">${g.items.map(([k,l])=>`<button class="${cpView===k?'active':''}" onclick="setCpView('${k}')">${l}</button>`).join('')}</div></div>`).join('')}</div>
      <div class="cp-body">${body}</div></div>`;
  document.getElementById('modal-root').innerHTML=(cpTaskId?cpTaskModal(ctx):'')+(cpUserEd?cpUserModal(ctx):'')+(cpKpiInfo?cpKpiModal():'')+(cpChg?cpChgModal():'');
}
/* ---- datos del cliente ---- */
function cpProjects(ctx){ return store.projectsOf(ctx.c.id); }
function cpAllSubs(ctx){ const out=[]; cpProjects(ctx).forEach(p=>store.tasksOf(p.id).forEach(t=>(t.subtasks||[]).forEach(s=>{ if(!s.isSeries) out.push({s,t,p}); }))); return out; }
function cpMySubs(ctx){ return cpAllSubs(ctx).filter(({s})=>s.personId===ctx.me.id||(s.invitados||[]).includes(ctx.me.id)); }
function cpProgress(p){ let d=0,n=0; store.tasksOf(p.id).forEach(t=>workSubs(t).forEach(s=>{ n++; if(s.done) d++; })); return {d,n,pct:n?Math.round(d/n*100):0}; }
function cpSubRow(it,ctx){ const {s,t,p}=it; const per=store.person(s.personId); const today=todayISO(); const late=!s.done&&s.date&&s.date<today; const cita=subHasCita(s); const est=citaEstadoInfo(s);
  const when=s.date?(s.date===today?'hoy':dLabel(s.date)):'sin fecha';
  return `<div class="cita-row" style="border-left:4px solid ${s.done?'#3f9d6d':late?'#c0392b':kbFrente(t).color}"><div class="cita-when"><b>${when}</b><span>${s.time||''}</span></div>
    <div class="cita-main"><div class="cita-nm" style="${s.done?'text-decoration:line-through;color:#8a948e':''}">${cita?'📅 ':''}${esc(s.name)}</div><div class="muted" style="font-size:.76rem">${esc(p.name)} · ${esc(t.name)}</div>${cita&&est.k!=='pendiente'?`<span class="cita-st" style="background:${est.bg};color:${est.c};margin-top:4px;display:inline-block">${est.t}</span>`:''}${late?'<span class="late-tag" style="margin-top:4px;display:inline-block">Atrasada</span>':''}</div>
    <div class="cita-side" style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;justify-content:flex-end">${s.personId?`${avatar(per,true)}<span style="font-size:.76rem;font-weight:600">${esc((per.name||'').split(' ')[0])}</span>`:''}${cita?`<button class="btn sm" onclick="openCpSesion('${t.id}','${s.id}')">Ver sesión</button>`:''}<button class="btn ghost sm" onclick="openCpTask('${t.id}')">Detalle</button></div></div>`; }
function openCpTask(tid){ cpTaskId=tid; render(); }
function closeCpTask(){ cpTaskId=null; render(); }
function openCpSesion(tid,sid){ const t=store.task(tid); const s=t&&(t.subtasks||[]).find(x=>x.id===sid); if(!s) return; let tok=s.shareToken; if(!tok){ tok=Math.random().toString(36).slice(2,8)+Math.random().toString(36).slice(2,8); const subs=t.subtasks; s.shareToken=tok; if(typeof dbSaveTask==='function') dbSaveTask(t); }
  cpTaskId=null; publicSes={tid,sid,token:tok}; render(); window.scrollTo(0,0); }
function cpTaskModal(ctx){ const t=store.task(cpTaskId); if(!t||!cpProjects(ctx).some(p=>p.id===t.projectId)){ cpTaskId=null; return ''; } const p=store.project(t.projectId); const f=kbFrente(t);
  let subs=subOrder(t,true).filter(x=>true); if(!ctx.isAdmin) subs=subs.filter(x=>x.s.personId===ctx.me.id||(x.s.invitados||[]).includes(ctx.me.id));
  const rows=subs.map(({s,depth})=>{ const per=store.person(s.personId); return `<div class="pub-sub${s.done?' done':''}" style="${depth?'margin-left:26px;':''}"><span class="pub-chk">${s.done?'✓':''}</span><span class="pub-sn">${subHasCita(s)?'📅 ':''}${esc(s.name)}</span><span class="pub-sm">${s.personId?esc((per.name||'').split(' ')[0]):'Sin asignar'}${s.date?' · '+dLabel(s.date):''}${s.time?' '+s.time:''}</span>${subHasCita(s)?`<button class="btn ghost sm" onclick="openCpSesion('${t.id}','${s.id}')">Ver sesión</button>`:''}</div>`; }).join('');
  const done=workSubs(t).filter(x=>x.done).length, tot=workSubs(t).length;
  return `<div class="modal active" onclick="if(event.target===this)closeCpTask()"><div class="modal-card" style="max-width:640px"><div class="m-head"><div class="m-top"><div><div class="pill yellow">${esc(p.name)}</div><h3 style="margin:8px 0 0">${esc(t.name)}</h3><div class="muted" style="font-size:.8rem"><span style="color:${f.color};font-weight:600">${esc(f.name)}</span>${t.dueDate?' · 🏁 '+dLabel(t.dueDate):''}</div></div><button class="x" onclick="closeCpTask()">×</button></div></div>
    <div class="m-body"><div class="pub-meta"><span class="badge s-${t.status}">${statusLabel[t.status]||t.status}</span><span>Avance: <b>${done}/${tot}</b></span></div>${t.description?`<div class="md pub-desc">${mdRender(t.description)}</div>`:''}<h4 style="margin:14px 0 6px">${ctx.isAdmin?'Subtareas':'Tus subtareas'}</h4>${rows||'<div class="muted">Sin subtareas.</div>'}</div></div></div>`; }
/* ---- Inicio ---- */
let cpHome='', cpKpiInfo=null;
function cpPickHome(pid){ cpHome=(cpHome===pid)?'':pid; render(); }
function cpOpenKpi(k){ cpKpiInfo=k; render(); }
function cpCloseKpi(){ cpKpiInfo=null; render(); }
function cpKpiModal(){ const T={proyectos:['Proyectos activos','Cuenta los proyectos que tienes con Grupo Nuwek. Si eliges un proyecto en la lista de arriba, el número se refiere solo a ese proyecto.'],
  avance:['Avance general','Se calcula dividiendo las actividades <b>ya realizadas</b> entre el <b>total de actividades</b> (subtareas y sub-subtareas) de los proyectos mostrados. Ejemplo: 26 hechas de 579 son 4%.'],
  cita:['Próxima cita','Es la sesión más cercana a partir de hoy en la que estás invitado, con su fecha y hora. Si no hay ninguna programada, aparece una raya.'],
  confirmar:['Citas por confirmar','Cuenta las sesiones futuras a las que <b>aún no has respondido</b> (confirmar, reprogramar o cancelar). Entra a «Citas» para responderlas.'],
  pagos:['Estado de pagos','Si algún pago programado ya pasó su fecha y no se ha cobrado completo, aparece <b>Saldo vencido</b>; si no, <b>Al corriente</b>. El monto pendiente suma lo que falta por cobrar de los pagos de los proyectos mostrados.']}[cpKpiInfo]; if(!T) return '';
  return `<div class="modal active" style="z-index:150" onclick="if(event.target===this)cpCloseKpi()"><div class="modal-card" style="max-width:420px"><div class="m-head"><div class="m-top"><h3 style="margin:0">ⓘ ${T[0]}</h3><button class="x" onclick="cpCloseKpi()">×</button></div></div><div class="m-body"><p style="margin:0;line-height:1.5">${T[1]}</p><div class="wiz-actions"><span></span><button class="btn" onclick="cpCloseKpi()">Entendido</button></div></div></div></div>`; }
function cpInicio(ctx){ const {c}=ctx; const projs=cpProjects(ctx); if(cpHome&&!projs.some(p=>p.id===cpHome)) cpHome=''; const sel=cpHome?projs.filter(p=>p.id===cpHome):projs; const ids=new Set(sel.map(p=>p.id));
  const work=cpAllSubs(ctx).filter(x=>ids.has(x.p.id)); const d=work.filter(x=>x.s.done).length; const pct=work.length?Math.round(d/work.length*100):0;
  const today=todayISO(); const citas=citasAll().filter(x=>x.c.id===c.id&&ids.has(x.p.id)); const sinResp=citas.filter(x=>x.est.k==='pendiente'&&x.s.date&&x.s.date>=today);
  const proxCita=citas.filter(x=>x.s.date&&x.s.date>=today).sort((a,b)=>((a.s.date+(a.s.time||''))<(b.s.date+(b.s.time||''))?-1:1))[0];
  const pays=[]; sel.forEach(p=>store.paymentsOf(p.id).forEach(x=>pays.push(x))); const venc=pays.filter(payVencido).reduce((n,x)=>n+paySaldo(x),0); const saldo=pays.reduce((n,x)=>n+paySaldo(x),0);
  const pcards=projs.map(p=>{ const g=cpProgress(p); const sv=store.service(p.serviceId); const on=cpHome===p.id;
    return `<div class="card click cp-pc${on?' sel':''}" onclick="cpPickHome('${p.id}')" title="${on?'Toca otra vez para ver todos':'Toca para ver solo este proyecto'}"><div class="pill yellow">${esc(sv?sv.name:'Proyecto')}</div>${on?'<span class="cp-pc-on">✔ Viendo este proyecto</span>':''}<h3 style="margin:8px 0 6px">${esc(p.name)}</h3><div class="muted" style="font-size:.8rem">${dLabel(p.startDate)} – ${dLabel(p.endDate)}</div><div class="bar sm" style="margin:10px 0 4px"><i style="width:${g.pct}%"></i></div><div class="muted" style="font-size:.78rem">${g.pct}% · ${g.d}/${g.n} actividades hechas</div></div>`; }).join('');
  const st=(k,big,lbl,style)=>`<div class="cp-stat"><button type="button" class="cp-stat-i" title="¿Cómo se calcula?" onclick="cpOpenKpi('${k}')">i</button><div class="cp-stat-big" ${style?`style="${style}"`:''}>${big}</div><div class="cp-stat-lbl">${lbl}</div></div>`;
  const hoy=citasAll().filter(x=>x.c.id===c.id&&ids.has(x.p.id)&&x.s.date===today).sort((a,b)=>(a.s.time||'99')<(b.s.time||'99')?-1:1);
  const hoyHtml=hoy.length?`<div class="sec-title" style="margin-top:22px"><h2>📅 Hoy · ${hoy.length} cita${hoy.length===1?'':'s'}</h2></div><div class="cp-hoy">${hoy.map(x=>`<div class="cp-hoy-it"><div class="cp-hoy-t">${x.s.time||'Hoy'}</div><div class="cp-hoy-b">${citaCard(x,false,true)}${(x.s.sesion&&x.s.sesion.objetivo)?`<div class="cp-hoy-o">🎯 ${esc(String(x.s.sesion.objetivo).replace(/\s+/g,' ').slice(0,160))}</div>`:''}</div></div>`).join('')}</div>`:'';
  const next=clientNextSubs(c,cpHome||null).map(it=>cpSubRow(it,ctx)).join('');
  return `<div class="sec-title"><h2>Tus proyectos</h2>${cpHome?'<button class="btn ghost sm" onclick="cpPickHome(\''+cpHome+'\')">Ver todos los proyectos</button>':'<span class="muted" style="font-size:.8rem">Toca un proyecto para ver solo sus indicadores y actividades</span>'}</div><div class="grid cols-2">${pcards||'<div class="muted">Aún no hay proyectos.</div>'}</div>
    <div class="sec-title" style="margin-top:22px"><h2>Indicadores${cpHome?' · '+esc((store.project(cpHome)||{}).name||''):''}</h2></div>
    <div class="cp-kpis">${st('proyectos',sel.length,'Proyectos activos')}${st('avance',pct+'%','Avance general')}${st('cita',proxCita?dLabel(proxCita.s.date)+(proxCita.s.time?' · '+proxCita.s.time:''):'—','Próxima cita','font-size:1.1rem')}${st('confirmar',sinResp.length,'Citas por confirmar','color:'+(sinResp.length?'#9a7a00':'#1f7a44'))}${st('pagos',pays.length?(venc?'⚠️ Saldo vencido':'✅ Al corriente'):'—','Estado de pagos · pendiente '+money(saldo),'font-size:1.1rem;color:'+(venc?'#c0392b':'#1f7a44'))}</div>
    ${hoyHtml}
    <div class="sec-title" style="margin-top:22px"><h2>🧭 Lo que sigue</h2></div><div class="cita-list">${next||'<div class="muted">No hay actividades próximas programadas.</div>'}</div>`; }
function cpNextHtml(ctx){ const items=clientNextSubs(ctx.c); const rows=items.map(({s,t,p})=>cpSubRow({s,t,p},ctx)).join(''); return `<div class="cita-list">${rows||'<div class="muted">No hay actividades próximas programadas.</div>'}</div>`; }
/* ---- Mis tareas ---- */
function cpTareas(ctx){ const mine=cpMySubs(ctx); const today=todayISO(); const pend=mine.filter(x=>!x.s.done).sort((a,b)=>((a.s.date||'9')+(a.s.time||''))<((b.s.date||'9')+(b.s.time||''))?-1:1); const hechas=mine.filter(x=>x.s.done).slice(-8).reverse();
  const g=(t,arr)=>arr.length?`<div class="sec-title"><h2 style="font-size:1.05rem">${t} <span class="muted" style="font-size:.8rem">${arr.length}</span></h2></div><div class="cita-list">${arr.map(x=>cpSubRow(x,ctx)).join('')}</div>`:'';
  return `<div class="muted" style="margin-bottom:10px">Las actividades en las que participas${ctx.isAdmin?'':' (solo ves lo tuyo)'}.</div>`+(mine.length?g('🔴 Atrasadas',pend.filter(x=>x.s.date&&x.s.date<today))+g('🟡 Hoy',pend.filter(x=>x.s.date===today))+g('🗓️ Próximas',pend.filter(x=>x.s.date&&x.s.date>today))+g('⚪ Sin fecha',pend.filter(x=>!x.s.date))+g('✅ Hechas recientemente',hechas):'<div class="muted">Por ahora no tienes actividades asignadas. 🎉</div>'); }
/* ---- Citas ---- */
function cpCitas(ctx){ return citasHistorialHtml(ctx.c,{filter:x=>ctx.isAdmin||(x.s.invitados||[]).includes(ctx.me.id)}); }
/* ---- Gantt ---- */
function cpGantt(ctx){ const projs=cpProjects(ctx).filter(p=>store.tasksOf(p.id).length); if(!projs.length) return '<div class="muted">Aún no hay tareas para mostrar.</div>'; if(!projs.some(p=>p.id===cpProj)) cpProj=projs[0].id; const p=store.project(cpProj);
  const sel=projs.length>1?`<label class="filt"><span class="glabel">Proyecto</span><select class="filter-val" onchange="cpProj=this.value;render()">${projs.map(x=>`<option value="${x.id}" ${x.id===cpProj?'selected':''}>${esc(x.name)}</option>`).join('')}</select></label>`:`<h3 style="margin:0">${esc(p.name)}</h3>`;
  return `<div style="margin-bottom:10px">${sel}</div>${tabGantt(p,{cp:true,admin:!!ctx.isAdmin})}`; }
/* ---- Finanzas ---- */
function cpFinanzas(ctx){ return finanzasHtml(ctx.c,{cp:true}); }
/* ---- Tiempos ---- */
function cpTiempos(ctx){ const projs=cpProjects(ctx); const byMonth={}, byPerson={}; let total=0;
  const rows=projs.map(p=>{ let min=0,hechas=0,n=0; store.tasksOf(p.id).forEach(t=>workSubs(t).forEach(s=>{ n++; if(s.done){ hechas++; const m=+s.timeSpent||0; min+=m; if(m){ const day=s.doneAt?localISO(s.doneAt):(s.date||''); const mo=day.slice(0,7); if(mo) byMonth[mo]=(byMonth[mo]||0)+m; const pn=store.person(s.personId); if(s.personId&&store.d.staff.some(u=>u.id===s.personId)) byPerson[pn.name]=(byPerson[pn.name]||0)+m; } } })); total+=min; return {p,min,hechas,n}; });
  const mx=Math.max(1,...Object.values(byMonth)), mp=Math.max(1,...Object.values(byPerson)); const h=m=>(m/60).toFixed(1).replace(/\.0$/,'')+' h';
  const months=Object.keys(byMonth).sort().slice(-6).map(k=>`<div class="tm-row"><span class="tm-l">${monthLabel(k)}</span><div class="tm-bar"><i style="width:${Math.round(byMonth[k]/mx*100)}%"></i></div><b>${h(byMonth[k])}</b></div>`).join('');
  const people=Object.entries(byPerson).sort((a,b)=>b[1]-a[1]).map(([n,m])=>`<div class="tm-row"><span class="tm-l">${esc(n)}</span><div class="tm-bar"><i style="width:${Math.round(m/mp*100)}%"></i></div><b>${h(m)}</b></div>`).join('');
  return `<div class="cp-kpis"><div class="perf-card"><div class="perf-big">${h(total)}</div><div class="perf-lbl">Horas invertidas en total</div></div></div>
    <div class="sec-title"><h2>Por proyecto</h2></div><div class="cita-list">${rows.map(r=>`<div class="cita-row"><div class="cita-main"><div class="cita-nm">${esc(r.p.name)}</div><div class="muted" style="font-size:.76rem">${r.hechas}/${r.n} actividades hechas</div></div><div class="cita-side"><b style="font-size:1.1rem">${h(r.min)}</b></div></div>`).join('')||'<div class="muted">Sin proyectos.</div>'}</div>
    <div class="grid cols-2" style="margin-top:14px"><div class="card"><h3 style="margin-top:0">Por mes</h3>${months||'<div class="muted">Aún no hay horas registradas.</div>'}</div><div class="card"><h3 style="margin-top:0">Por persona del equipo</h3>${people||'<div class="muted">Aún no hay horas registradas.</div>'}</div></div>`; }
/* ---- Notas ---- */
function cpNotas(ctx){ const rows=[]; cpProjects(ctx).forEach(p=>(p.notasCliente||[]).forEach(n=>rows.push({n,p}))); rows.sort((a,b)=>(a.n.fecha||'')<(b.n.fecha||'')?1:-1);
  return rows.length?`<div class="cita-list">${rows.map(({n,p})=>`<div class="card"><div style="display:flex;justify-content:space-between;gap:8px"><b>${esc(n.titulo||'Nota')}</b><span class="muted" style="font-size:.76rem">${esc(p.name)} · ${n.fecha?dLabel(n.fecha):''}</span></div><div class="md" style="margin-top:6px">${mdRender(n.texto||'')}</div></div>`).join('')}</div>`:'<div class="muted">Aún no hay notas del equipo de Nuwek.</div>'; }
/* ---- Scorecard ---- */
function cpScore(ctx){ return clientScoreHtml(ctx.c); }
/* ---- Usuarios (solo administrador) ---- */
function cpUsuarios(ctx){ const rows=(ctx.c.people||[]).map(p=>{ const po=p.portal; const me=p.id===ctx.me.id;
    return `<div class="cita-row"><div class="cita-main" style="display:flex;gap:10px;align-items:center">${avatar(p,true)}<div><div class="cita-nm">${esc(p.name)} ${me?'<span class="muted" style="font-size:.7rem">(tú)</span>':''}</div><div class="muted" style="font-size:.76rem">${esc(p.role||'Sin puesto')}${p.phone?' · 📞 '+esc(p.phone):''}${p.email?' · ✉ '+esc(p.email):''}</div></div></div>
      <div class="cita-side">${po?`<span class="cita-st" style="background:${po.activo===false?'#eef0ec':po.rol==='admin'?'#efecfb':'#e8f6ee'};color:${po.activo===false?'#6b7a73':po.rol==='admin'?'#5b4fc9':'#1f7a44'}">${po.activo===false?'Inactivo':po.rol==='admin'?'Administrador':'Colaborador'}</span><div class="muted" style="font-size:.72rem;margin-top:3px">usuario: <b>${esc(po.user)}</b></div>`:'<span class="cita-st" style="background:#eef0ec;color:#6b7a73">Sin acceso</span>'}<div style="margin-top:6px"><button class="btn ghost sm" onclick="openCpUser('${p.id}')">${po?'✏️ Editar':'Dar acceso'}</button></div></div></div>`; }).join('');
  return `<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:12px;flex-wrap:wrap"><div class="muted">Crea a tu gente, define su puesto, rol y su código de acceso.</div><button class="btn" onclick="openCpUser(null)">＋ Nuevo usuario</button></div><div class="cita-list">${rows||'<div class="muted">Aún no hay usuarios.</div>'}</div>`; }
function openCpUser(pid){ cpUserEd={pid}; render(); }
function closeCpUser(){ cpUserEd=null; render(); }
function cpUserModal(ctx){ const p=cpUserEd.pid?(ctx.c.people||[]).find(x=>x.id===cpUserEd.pid):null; const po=(p&&p.portal)||{rol:'colab',activo:true}; const self=p&&p.id===ctx.me.id;
  return `<div class="modal active" onclick="if(event.target===this)closeCpUser()"><div class="modal-card" style="max-width:520px"><div class="m-head"><div class="m-top"><h3 style="margin:0">${p?(p.portal?'Editar usuario':'Dar acceso'):'Nuevo usuario'}</h3><button class="x" onclick="closeCpUser()">×</button></div></div><div class="m-body">
    <div class="field"><label>Nombre *</label><input id="cu-name" value="${esc(p?p.name:'')}"></div>
    <div class="field row"><div><label>Usuario *</label><input id="cu-user" value="${esc(po.user||'')}" autocapitalize="off" placeholder="ej. maria.lopez"></div><div><label>Código de 6 cifras *</label><input id="cu-code" inputmode="numeric" maxlength="6" value="${esc(po.code||'')}" placeholder="123456"></div></div>
    <div class="field row"><div><label>Teléfono</label><input id="cu-phone" value="${esc(p&&p.phone||'')}"></div><div><label>Correo</label><input id="cu-mail" value="${esc(p&&p.email||'')}"></div></div>
    <div class="field row"><div><label>Puesto</label><input id="cu-puesto" value="${esc(p&&p.role||'')}"></div><div><label>Rol</label><select id="cu-rol" ${self?'disabled title="No puedes cambiar tu propio rol"':''}><option value="admin" ${po.rol==='admin'?'selected':''}>Administrador (Gantt, finanzas, tiempos, notas, scorecard, usuarios)</option><option value="colab" ${po.rol!=='admin'?'selected':''}>Colaborador (solo sus tareas y citas)</option></select></div></div>
    <label class="gf-opt"><input type="checkbox" id="cu-act" ${po.activo!==false?'checked':''} ${self?'disabled':''}> Usuario activo</label>
    <div class="wiz-actions">${p&&p.portal&&!self?'<button class="btn ghost" style="margin-right:auto;color:#c0392b" onclick="cpQuitarAcceso()">Quitar acceso</button>':''}<button class="btn ghost" onclick="closeCpUser()">Cancelar</button><button class="btn" onclick="saveCpUser()">Guardar</button></div></div></div></div>`; }
function cpValidateUser(name,user,code,exceptPid){ if(!name){ alert('Escribe el nombre.'); return false; } if(!user||!/^[a-z0-9._-]{3,}$/i.test(user)){ alert('El usuario debe tener al menos 3 caracteres (letras, números, punto, guion).'); return false; } if(!/^\d{6}$/.test(code)){ alert('El código debe ser de exactamente 6 números.'); return false; }
  const f=findPortalUser(user); if(f&&f.p.id!==exceptPid){ alert('Ese usuario ya existe. Elige otro.'); return false; } return true; }
function saveCpUser(){ const ctx=cpCtx(); if(!ctx||!ctx.isAdmin) return; const name=(val('cu-name')||'').trim(), user=(val('cu-user')||'').trim(), code=(val('cu-code')||'').trim(); const pid=cpUserEd.pid; const self=pid===ctx.me.id;
  if(!cpValidateUser(name,user,code,pid)) return;
  const rol=self?ctx.me.portal.rol:(val('cu-rol')||'colab'); const act=self?true:!!document.getElementById('cu-act').checked;
  const data={name,phone:(val('cu-phone')||'').trim(),email:(val('cu-mail')||'').trim(),role:(val('cu-puesto')||'').trim(),portal:{user,code,rol,activo:act}};
  if(pid) store.updateClientPerson(ctx.c.id,pid,data); else store.addClientPerson(ctx.c.id,data); cpUserEd=null; render(); }
function cpQuitarAcceso(){ const ctx=cpCtx(); if(!ctx||!ctx.isAdmin||!cpUserEd||!cpUserEd.pid||cpUserEd.pid===ctx.me.id) return; if(!confirm('¿Quitarle el acceso al portal? Seguirá como contacto.')) return; store.updateClientPerson(ctx.c.id,cpUserEd.pid,{portal:null}); cpUserEd=null; render(); }

/* ================== LINK COMPARTIBLE POR TAREA ==================
   Formato: <portal>#/tarea/<id>. Al abrirlo se ve la tarea SIN iniciar sesión (solo lectura);
   la dirección se limpia de inmediato; para editar o comentar hay que iniciar sesión. */
let publicTaskId=null, afterLoginTask=null;
function taskShareUrl(id){ return location.origin+location.pathname+'#/tarea/'+encodeURIComponent(id); }
function copyTaskLink(id){ const url=taskShareUrl(id);
  const done=()=>shareToast('🔗 Link copiado. Cualquiera puede ver la tarea; para editar debe iniciar sesión.');
  if(navigator.clipboard&&navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(done,()=>prompt('Copia el link:',url));
  else prompt('Copia el link:',url); }
function shareToast(msg){ const t=document.createElement('div'); t.className='nf-toast'; t.textContent=msg; notifRoot().appendChild(t); setTimeout(()=>t.remove(),4500); }
function takeShareHash(){   // lee el id del hash y quita el link de la barra de direcciones
  const m=(location.hash||'').match(/^#\/tarea\/(.+)$/); if(!m) return null;
  let id=m[1]; try{ id=decodeURIComponent(id); }catch(_){}
  try{ history.replaceState(null,'',location.pathname+location.search); }catch(_){}
  return id; }
function openSharedTask(id){ const t=store.task(id); if(!t){ alert('Esa tarea ya no existe.'); return; }
  const p=store.project(t.projectId); if(p){ selClient=p.clientId; selProject=p.id; }
  view='proyecto'; selTab='gestor'; modalTask=id; timingSub=null; editingTask=null; editingSub=null; opSelTask=null; }
function handleShareLink(id){ if(!id) return; if(session){ openSharedTask(id); render(); } else { publicTaskId=id; afterLoginTask=id; render(); } }
function goLoginFromShare(){ publicTaskId=null; render(); }
function viewPublicTask(){
  const t=store.task(publicTaskId);
  const head=`<div class="pub-top"><div class="brand"><span class="mark">N</span> Nuwek <span class="slash">╱</span> Portal</div></div>`;
  if(!t) return `<div class="pub-wrap">${head}<div class="pub-card"><h2>Esta tarea ya no existe</h2><p class="muted">Pudo haberse eliminado o el link está incompleto.</p><button class="btn" onclick="goLoginFromShare()">Ir al portal</button></div></div>`;
  const p=store.project(t.projectId)||{name:''}; const c=store.client(p.clientId)||{name:''}; const f=kbFrente(t); const resp=store.person(t.responsibleId);
  const subs=subOrder(t,true).map(({s:x,depth})=>{ const per=x.personId?store.person(x.personId):null;
    return `<div class="pub-sub${x.done?' done':''}" style="${depth?'margin-left:26px;':''}"><span class="pub-chk">${x.done?'✓':''}</span><span class="pub-sn">${x.urgent?URG+' ':''}${mdEsc(x.name)}</span><span class="pub-sm">${per?mdEsc(per.name||''):'Sin responsable'}${x.date?' · '+dLabel(x.date):''}</span></div>`; }).join('');
  const tags=(t.tags||[]).map(g=>`<span class="agp-chip" style="background:${store.tagColor(g)}">${mdEsc(g)}</span>`).join('');
  const done=workSubs(t).filter(x=>x.done).length, tot=workSubs(t).length;
  return `<div class="pub-wrap">${head}<div class="pub-card">
    <div class="pub-crumb">${mdEsc(c.name)} » ${mdEsc(p.name)} » <span style="color:${f.color};font-weight:600">${mdEsc(f.name)}</span></div>
    <h2>${urgMark(t.urgent)}${dk(t)}${mdEsc(t.name)}</h2>
    <div class="pub-meta"><span class="badge s-${t.status}">${statusLabel[t.status]||t.status}</span>${t.dueDate?`<span>🏁 Fecha límite: <b>${dLabel(t.dueDate)}</b></span>`:''}<span>Responsable: <b>${mdEsc(resp.name||'—')}</b></span>${tags}</div>
    ${t.description?`<div class="md pub-desc">${mdRender(t.description)}</div>`:''}
    <h4 style="margin:18px 0 6px">Subtareas (${done}/${tot})</h4>${subs||'<div class="muted">Sin subtareas.</div>'}
    <div class="pub-cta"><div class="muted">Vista de solo lectura. Para editar, comentar o marcar avances, inicia sesión.</div><button class="btn" onclick="goLoginFromShare()">Iniciar sesión para editar</button></div>
  </div></div>`; }
window.addEventListener('hashchange',()=>{ const ss=takeSesionHash(); if(ss){ publicSes=ss; render(); return; } const id=takeShareHash(); if(id) handleShareLink(id); });

/* ================== AVISO DE VERSIÓN NUEVA ==================
   Cada push cambia la versión en index.html (meta app-version + ?v= en los archivos). Si alguien tiene abierta una versión
   vieja, sale un aviso para recargar y no se queda sin las mejoras. */
const APP_VERSION=(document.querySelector('meta[name="app-version"]')||{}).content||'';
async function checkNewVersion(){
  if(!APP_VERSION||document.hidden||document.getElementById('ver-banner')) return;
  try{ const r=await fetch(location.pathname+'?_='+Date.now(),{cache:'no-store'}); const t=await r.text(); const m=t.match(/<meta name="app-version" content="([^"]*)"/);
    if(m&&m[1]&&m[1]!==APP_VERSION){ const b=document.createElement('div'); b.id='ver-banner'; b.innerHTML='🆕 Hay una versión nueva del portal. <button onclick="location.reload()">Recargar ahora</button>'; document.body.appendChild(b); } }catch(_){}
}
setInterval(checkNewVersion,60000); setTimeout(checkNewVersion,8000);
document.addEventListener('visibilitychange',()=>{ if(!document.hidden) setTimeout(checkNewVersion,500); });

boot();