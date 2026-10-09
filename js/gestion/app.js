/* ================== SEED / STORE ================== */
const DV = 5;
function iso(y,m,d){return new Date(y,m-1,d).toISOString().split('T')[0];}
function todayISO(){return new Date().toISOString().split('T')[0];}

const FRENTE_PALETTE = ['#223c36','#3f7d6e','#C0553B','#4a6fa5','#8a6d3b','#6b8e23','#9c5a8a','#2c8ca0'];

let _uidSeq=0;
function uid(pfx){ _uidSeq++; return pfx+Date.now().toString(36)+_uidSeq.toString(36); }
const DUR_OPTS=[15,30,45,60,90,120,180,240];
function fmtDurShort(m){ m=+m||0; if(m<60) return m+' min'; const h=Math.floor(m/60), r=m%60; return h+'h'+(r?' '+r:''); }
function durOptsEl(sel){ return DUR_OPTS.map(m=>`<option value="${m}" ${m===(+sel)?'selected':''}>${fmtDurShort(m)}</option>`).join(''); }
class Store{
  constructor(){ this.load(); }
  load(){
    const s = localStorage.getItem('nuwekPortal');
    if(s){ const p=JSON.parse(s); if(p.v===DV){ this.d=p; this.normalize(); return; } }
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
  save(){ this.d.v=DV; localStorage.setItem('nuwekPortal', JSON.stringify(this.d)); }
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
  togglePayment(payId){ const x=this.d.payments.find(p=>p.id===payId); if(x){ x.paid=!x.paid; x.paidDate=x.paid?todayISO():null; this.save(); if(typeof dbSavePayment==='function') dbSavePayment(x); } }
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
  addSubtask(tid,st){ const t=this.task(tid); st.id=uid('s_'); st.invitados=st.invitados||[]; st.timeSpent=0; st.done=false; st.links=st.links||[]; t.subtasks.push(st); this.save(); if(typeof dbSaveTask==='function') dbSaveTask(t); }
  subAddLink(tid,sid){ const t=this.task(tid); const s=t.subtasks.find(x=>x.id===sid); if(s){ s.links=s.links||[]; s.links.push({title:'',url:''}); this.save(); if(typeof dbSaveTask==='function') dbSaveTask(t); } }
  subSetLink(tid,sid,idx,field,val){ const t=this.task(tid); const s=t.subtasks.find(x=>x.id===sid); if(s&&s.links&&s.links[idx]){ s.links[idx][field]=val; this.save(); if(typeof dbSaveTask==='function') dbSaveTask(t); } }
  subDelLink(tid,sid,idx){ const t=this.task(tid); const s=t.subtasks.find(x=>x.id===sid); if(s&&s.links){ s.links.splice(idx,1); this.save(); if(typeof dbSaveTask==='function') dbSaveTask(t); } }
  updateSubtask(tid,sid,patch){ const t=this.task(tid); const s=(t.subtasks||[]).find(x=>x.id===sid); if(s){ if(patch&&patch.date!==undefined&&patch.date!==s.date){ if(!canSubDate()){ patch=Object.assign({},patch); delete patch.date; } else s.dateConflict=false; } Object.assign(s,patch); this.save(); if(typeof dbSaveTask==='function') dbSaveTask(t);} }
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
  moveSubtask(tid,sid,targetSid,after){ const t=this.task(tid); if(!t||!t.subtasks) return; const a=t.subtasks; const i=a.findIndex(x=>x.id===sid); if(i<0) return; const [it]=a.splice(i,1);
    let j=a.findIndex(x=>x.id===targetSid); if(j<0){ a.push(it); } else a.splice(after?j+1:j,0,it);
    this.save(); if(typeof dbSaveTask==='function') dbSaveTask(t); }
  removeSubtask(tid,sid){ const t=this.task(tid); t.subtasks=t.subtasks.filter(x=>x.id!==sid); this.save(); if(typeof dbSaveTask==='function') dbSaveTask(t); }
  projectStats(pid){ const ts=this.tasksOf(pid); return {tareas:ts.length,subtareas:ts.reduce((a,t)=>a+(t.subtasks||[]).length,0),pagos:(this.d.payments||[]).filter(x=>x.projectId===pid).length,frentes:this.frentesOf(pid).length,etapas:this.etapasOf(pid).length}; }
  async removeProject(pid){ const ids=this.tasksOf(pid).map(t=>t.id);
    if(typeof dbDeleteProjectCascade==='function'){ const ok=await dbDeleteProjectCascade(pid,ids); if(!ok) return false; }
    const idSet=new Set(ids);
    this.d.tasks=this.d.tasks.filter(t=>t.projectId!==pid); this.d.comments=(this.d.comments||[]).filter(c=>!idSet.has(c.taskId)); this.d.log=(this.d.log||[]).filter(l=>!idSet.has(l.taskId));
    this.d.payments=(this.d.payments||[]).filter(x=>x.projectId!==pid); this.d.frentes=this.d.frentes.filter(f=>f.projectId!==pid); this.d.etapas=this.d.etapas.filter(e=>e.projectId!==pid);
    this.d.projects=this.d.projects.filter(p=>p.id!==pid); this.save(); return true; }
  removeTask(id){ this.d.tasks=this.d.tasks.filter(t=>t.id!==id); this.d.comments=this.d.comments.filter(c=>c.taskId!==id); this.save(); if(typeof dbDeleteTask==='function') dbDeleteTask(id); }
  updateTask(tid,patch){ const t=this.task(tid); if(t){Object.assign(t,patch); this.save(); if(typeof dbSaveTask==='function') dbSaveTask(t);} }
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
function canSubDate(){ return role==='pm' || role==='gerencia'; }
const SUB_DATE_MSG='Solo el PM puede cambiar las fechas de las subtareas.';
function isColab(){ return role==='colab'; }
function isPM(){ return role==='pm'; }
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
  t=t.replace(/(^|[\s(])(https?:\/\/[^\s<)]+)/g,(_,pre,u)=>pre+hold('<a href="'+u+'" target="_blank" rel="noopener noreferrer">'+u+'</a>'));
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
function render(){
  const app=document.getElementById('app');
  if(session){ saveSession(); saveNav(); }
  if(!session){
    app.innerHTML = loginScreen();
    document.getElementById('modal-root').innerHTML = loginUser ? pinModal() : '';
    return;
  }
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
    else if(view==='gestion') body=viewGestion();
    else body=viewClientes();
    app.innerHTML = shell(body);
  }
  // modal
  document.getElementById('modal-root').innerHTML = (modalTask ? taskModal() : (qm ? quickModal() : '')) + (libModal ? libraryModal() : '') + (lightbox ? lightboxModal() : '');
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
    ${tab('op_kanban','Kanban',"openKanban()")}
    ${tab('op_agenda','Agenda',"openAgenda()")}
    ${tab('op_desempeno','Mi desempeño',"go('op_desempeno')")}
  </div>${inner}`;
}
function whoSelector(){
  const opts=store.activeStaff().map(u=>`<option value="${u.id}" ${currentUser===u.id?'selected':''}>${u.name}</option>`).join('');
  return `<div class="role"><select onchange="setUser(this.value)" title="Quién soy">${opts}</select>
    <select onchange="setRole(this.value)"><option value="gerencia" ${role==='gerencia'?'selected':''}>Gerencia</option><option value="pm" ${role==='pm'?'selected':''}>Project Manager</option><option value="colab" ${role==='colab'?'selected':''}>Colaborador</option></select></div>`;
}
function sessionBar(){
  const u=store.person(session)||{name:'?'};
  const rl=u.perm==='gerencia'?'Gerencia':u.perm==='pm'?'Project Manager':'Colaborador';
  return `<div class="sessbar">${avatar(u,true)}<div class="sess-info"><div class="sess-nm">${u.name}</div><div class="sess-rl">${rl}</div></div><button class="sess-out" onclick="logout()">Salir</button></div>`;
}
/* ===== LOGIN ===== */
function getLoginBg(){ return (store.d.settings && store.d.settings.loginBg) || LOGIN_BG; }
function loginScreen(){
  const LOGIN_ORDER=['carlos','estrella','gerardo','jaime']; const rank=u=>{ const i=LOGIN_ORDER.indexOf((u.name||'').trim().toLowerCase()); return i<0?99:i; };
  const pills=store.activeStaff().map((u,i)=>({u,i})).sort((a,b)=>rank(a.u)-rank(b.u)||a.i-b.i).map(x=>x.u).map(u=>`<button class="login-pill" onclick="openPin('${u.id}')" title="${u.name}"><span class="login-av">${u.photo?`<img src="${u.photo}" alt="">`:esc((u.name||'?')[0])}</span></button>`).join('');
  return `<div class="login-wrap" style="background-image:linear-gradient(rgba(10,20,15,.35),rgba(10,20,15,.55)),url('${getLoginBg()}')">
    <div class="login-grid">${pills}</div>
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
  if(lightbox){ closeLightbox(); return; }
  if(qm){ closeQM(); return; }
  if(libModal){ closeLibModal(); return; }
  if(modalTask){ if(timingSub){ cancelSubTime(); return; } if(editingSub){ cancelSubEdit(); return; } if(editingTask===modalTask){ cancelTaskEdit(); return; } closeTask(); return; }
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
    session=u.id; currentUser=u.id; role=u.perm||'colab';
    view=(role==='colab')?'op_pendientes':'clientes';
    selProject=null; modalTask=null; opSelTask=null;
    loginAttempts[u.id]=null; loginUser=null; loginPin=''; loginErr='';
    saveSession(); render(); return;
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
    session=u.id; currentUser=u.id; role=u.perm||'colab';
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
        <button class="${view==='op_kanban'?'active':''}" onclick="openKanban()">Kanban</button>
        <button class="${view==='op_agenda'?'active':''}" onclick="openAgenda()">Agenda</button>
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
function viewClientes(){
  const cards=store.d.clients.map(c=>{
    const n=store.projectsOf(c.id).length;
    return `<div class="card click" onclick="openClient('${c.id}')">
      <div class="pill ${c.tipo==='interno'?'yellow':'green'}">${c.tipo==='interno'?'Interno':'Cliente'}</div>
      <h3 style="margin:8px 0 4px">${c.name}</h3>
      <div class="muted" style="font-size:.85rem">${c.location} · ${n} proyecto${n===1?'':'s'} vivo${n===1?'':'s'}</div>
    </div>`;
  }).join('');
  return `<div class="crumb">Clientes</div>
    <div class="sec-title"><h2>Clientes</h2></div>
    <div class="grid cols-3">${cards}
      ${isGerencia()?`<div class="card click" style="display:flex;align-items:center;justify-content:center;color:var(--muted);border-style:dashed" onclick="openClientForm()">+ Nuevo cliente</div>`:''}
    </div>`;
}

/* ================== CLIENTE ================== */
function viewCliente(){
  const c=store.client(selClient); if(!c) return '';
  const resp=store.person(c.generalResponsibleId);
  const people=c.people.map(p=>`<span class="chip tag-chip">${avatar(p,true)} ${p.name}${p.role?' · '+p.role:''} <button class="chip-e" title="Editar" onclick="openContactEdit('${c.id}','${p.id}')">✏️</button><button class="chip-x" title="Quitar" onclick="delContact('${c.id}','${p.id}')">×</button></span>`).join('') || '<span class="muted" style="font-size:.85rem">Sin contactos aún</span>';
  const projs=store.projectsOf(c.id).map(p=>{
    const sv=store.service(p.serviceId); const health=projectHealth(p.id);
    return `<div class="card click" onclick="openProject('${p.id}')">
      <div style="display:flex;justify-content:space-between;align-items:start">
        <div><div class="pill yellow">${sv?sv.name:'Servicio'}</div><h3 style="margin:8px 0 2px">${p.name}</h3></div>
        <span style="display:flex;align-items:center;gap:6px"><span class="pill ${health.cls}">${health.icon} ${health.pct}%</span>${isGerencia()?`<button class="btn ghost sm" title="Editar proyecto" onclick="event.stopPropagation();openProjectEdit('${p.id}')">✏️</button>`:''}</span>
      </div>
      <div class="muted" style="font-size:.85rem;margin-top:6px">${money(p.price)} · ${p.months} meses · ${dLabel(p.startDate)}–${dLabel(p.endDate)}</div>
    </div>`;
  }).join('');
  return `<div class="crumb"><a onclick="go('clientes')">Clientes</a> › ${c.name}</div>
    <div class="card">
      <div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:14px">
        <div><div class="pill green">Cliente</div><h2 style="margin:8px 0 2px;font-size:1.5rem">${c.name}</h2><div class="muted">${c.razon||''}</div></div>
        <div style="display:flex;gap:8px">${isGerencia()?`<button class="btn ghost" onclick="openClientEdit('${c.id}')">✏️ Editar</button>`:''}<button class="btn" onclick="startWizard('${c.id}')">+ Nuevo proyecto</button></div>
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
    <div class="grid cols-2">${projs||'<div class="muted">Sin proyectos aún. Usa “+ Nuevo proyecto”.</div>'}</div>`;
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
function startWizard(cid){
  wiz={step:1,clientId:cid,serviceId:store.d.services[0].id,price:'',monthlyPay:'',months:'',paymentDay:'',startDate:'',endDate:'',
       alcances:[],loadTemplate:true,etapas:[],frentes:[]};
  view='wizard'; render();
}
function viewWizard(){
  const c=store.client(wiz.clientId);
  const stepbar=[1,2,3].map(n=>{const cls=wiz.step===n?'on':(wiz.step>n?'done':'');const lab=['Elegir cliente','Parámetros','Etapas y Frentes'][n-1];return `<div class="ws ${cls}">${wiz.step>n?'✓ ':n+' · '}${lab}</div>`;}).join('');
  let step='';
  if(wiz.step===1) step=wizStep1();
  else if(wiz.step===2) step=wizStep2();
  else step=wizStep3();
  return `<div class="crumb"><a onclick="go('clientes')">Clientes</a> › <a onclick="openClient('${wiz.clientId}')">${c.name}</a> › Nuevo proyecto</div>
    <div class="sec-title"><h2>Nace un proyecto</h2></div>
    <div class="wiz-steps">${stepbar}</div>
    <div class="card">${step}</div>`;
}
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
  const svc=store.d.services.map(s=>`<option value="${s.id}" ${wiz.serviceId===s.id?'selected':''}>${s.name}</option>`).join('');
  const svcObj=store.service(wiz.serviceId)||{};
  const priceVal=wiz.price || (svcObj.listPrice||'');
  const alc=wiz.alcances.map((a,i)=>`<span class="chip">${a.item} — ${a.qty}/${a.period} <button onclick="wizDelAlc(${i})">×</button></span>`).join('');
  return `<p class="muted">Parámetros del proyecto. Un proyecto = un servicio.</p>
    <div class="field"><label>Servicio</label><select id="w-svc" onchange="wizPickService(this.value)">${svc}</select></div>
    <div class="field row"><div><label>Precio total</label><input id="w-price" type="number" placeholder="162500" value="${priceVal}"></div>
      <div><label>Pago por mes</label><input id="w-monthly" type="number" placeholder="27083" value="${wiz.monthlyPay}"></div></div>
    <div class="field row"><div><label># meses</label><input id="w-months" type="number" placeholder="6" value="${wiz.months}"></div>
      <div><label>Día de pago</label><input id="w-payday" type="number" placeholder="5" value="${wiz.paymentDay}"></div></div>
    <div class="field row"><div><label>Inicio</label><input id="w-start" type="date" value="${wiz.startDate}"></div>
      <div><label>Cierre planeado</label><input id="w-end" type="date" value="${wiz.endDate}"></div></div>
    <div class="field"><label>Alcances (con cantidad)</label>
      <div class="alc-row"><input id="w-alc-item" placeholder="Reels"><input id="w-alc-qty" class="q" type="number" placeholder="4">
        <select id="w-alc-per"><option>mes</option><option>proyecto</option></select>
        <button class="btn ghost sm" onclick="wizAddAlc()">+ Agregar</button></div>
      <div class="chiplist">${alc}</div></div>
    <div class="field"><label><input type="checkbox" id="w-tpl" ${wiz.loadTemplate?'checked':''} style="width:auto"> Cargar Frentes y tareas base del servicio (plantilla)</label></div>
    <div class="wiz-actions"><button class="btn ghost" onclick="wizBack()">← Atrás</button><button class="btn" onclick="wizNext()">Continuar →</button></div>`;
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
  wiz.monthlyPay=+val('w-monthly')||0; wiz.months=+val('w-months')||0; wiz.paymentDay=+val('w-payday')||5;
  wiz.startDate=val('w-start'); wiz.endDate=val('w-end'); const tpl=document.getElementById('w-tpl'); if(tpl) wiz.loadTemplate=tpl.checked;
  const cur=+val('w-price')||0; const s=store.service(sid);
  wiz.price = (!cur && s && s.listPrice) ? s.listPrice : cur;
  render();
}
function wizPick(id){wiz.clientId=id; render();}
function wizSaveStep2(){wiz.serviceId=val('w-svc');wiz.price=+val('w-price')||0;wiz.monthlyPay=+val('w-monthly')||0;wiz.months=+val('w-months')||0;wiz.paymentDay=+val('w-payday')||5;wiz.startDate=val('w-start');wiz.endDate=val('w-end');wiz.loadTemplate=document.getElementById('w-tpl').checked;}
function wizNext(){ if(wiz.step===2){wizSaveStep2(); if(wiz.loadTemplate&&wiz.frentes.length===0){const sv=store.service(wiz.serviceId); sv.frentes.forEach((f,i)=>wiz.frentes.push({name:f.name,color:f.color||FRENTE_PALETTE[i%FRENTE_PALETTE.length]}));}} wiz.step=Math.min(3,wiz.step+1); render(); }
function wizBack(){ if(wiz.step===2)wizSaveStep2(); wiz.step=Math.max(1,wiz.step-1); render(); }
function wizAddAlc(){const it=val('w-alc-item');const q=val('w-alc-qty');if(!it||!q)return;wiz.alcances.push({item:it,qty:+q,period:val('w-alc-per')});render();}
function wizDelAlc(i){wiz.alcances.splice(i,1);render();}
function wizAddEt(){const n=val('w-et-name'),s=val('w-et-start'),e=val('w-et-end');if(!n||!s||!e){alert('Nombre y fechas de la etapa.');return;}wiz.etapas.push({name:n,start:s,end:e});render();}
function wizDelEt(i){wiz.etapas.splice(i,1);render();}
function wizAddFr(){const n=val('w-fr-name');if(!n)return;wiz.frentes.push({name:n,color:FRENTE_PALETTE[wiz.frentes.length%FRENTE_PALETTE.length]});render();}
function wizDelFr(i){wiz.frentes.splice(i,1);render();}
async function wizCreate(){
  wizSaveStep2 && (wiz.step===2&&wizSaveStep2());
  if(wiz.frentes.length===0){alert('Agrega al menos un frente.');return;}
  if((!wiz.price||wiz.price===0) && wiz.monthlyPay && wiz.months) wiz.price=wiz.monthlyPay*wiz.months;
  const p=store.addProject({clientId:wiz.clientId,serviceId:wiz.serviceId,name:store.service(wiz.serviceId).name,price:wiz.price,monthlyPay:wiz.monthlyPay,months:wiz.months,paymentDay:wiz.paymentDay,startDate:wiz.startDate,endDate:wiz.endDate,status:'active',alcances:wiz.alcances});
  // Guardar el PROYECTO en Supabase y ESPERAR a que exista antes de crear sus frentes/etapas
  // (frentes y etapas dependen del proyecto por llave foránea).
  if(typeof dbSaveProject==='function'){ try{ await dbSaveProject(p); }catch(e){ console.error(e); } }
  store.generatePayments(p);
  wiz.frentes.forEach(f=>store.addFrente(p.id,f.name,f.color));
  wiz.etapas.forEach(e=>store.addEtapa(p.id,e.name,e.start,e.end));
  // Nota: las TAREAS se conectarán en el Sub-paso B (módulo de Tareas).
  store.save(); openProject(p.id);
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
  const mineSub=(t.subtasks||[]).filter(s=>!s.done && (s.personId===currentUser||(s.invitados||[]).includes(currentUser)));
  const doneS=(t.subtasks||[]).filter(s=>s.done).length, totS=(t.subtasks||[]).length;
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
function mySubDate(t){ const ds=(t.subtasks||[]).filter(s=>!s.done&&s.date&&(s.personId===currentUser||(s.invitados||[]).includes(currentUser))).map(s=>s.date).sort(); return ds[0]||''; }
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
function kbInvolves(t,pid){ return t.responsibleId===pid || (t.subtasks||[]).some(s=>s.personId===pid||(s.invitados||[]).includes(pid)); }
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
function openKanban(){kbGroup='frente';kbAnchor=todayISO();view='op_kanban';modalTask=null;render();}
function kbCard(t){
  const p=store.project(t.projectId), c=store.client(p.clientId), f=kbFrente(t), resp=store.person(t.responsibleId);
  const done=(t.subtasks||[]).filter(s=>s.done).length, tot=(t.subtasks||[]).length;
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
function setGestSub(v){ gestSub=v; render(); }
function setGestScope(s){ gestScope=s; render(); }
function setGestProject(v){ gestProject=v; render(); }
function setGestPerson(v){ gestPerson=v; render(); }
function sundayOf(iso){ return addDaysISO(iso, -isoWeekday(iso)); }
function gestRange(){
  const pad=n=>String(n).padStart(2,'0');
  if(gestScope==='dia') return {start:gestAnchor,end:gestAnchor};
  if(gestScope==='semana'){ const s=sundayOf(gestAnchor); return {start:s,end:addDaysISO(s,6)}; }
  const [y,m]=gestAnchor.split('-').map(Number); const last=new Date(Date.UTC(y,m,0)).getUTCDate();
  return {start:`${y}-${pad(m)}-01`,end:`${y}-${pad(m)}-${pad(last)}`};
}
function gestRangeLabel(R){
  const ab=iso=>MESES[(+iso.split('-')[1])-1].slice(0,3).toLowerCase();
  const WD=['Dom','Lun','Mar','Mié','Jue','Vie','Sáb']; const dn=iso=>+iso.split('-')[2];
  if(gestScope==='dia') return `${WD[isoWeekday(gestAnchor)]} ${dn(gestAnchor)} ${ab(gestAnchor)} ${gestAnchor.slice(0,4)}`;
  if(gestScope==='semana'){ const s=R.start,e=R.end; return `${dn(s)} ${ab(s)} – ${dn(e)} ${ab(e)}`; }
  const [y,m]=gestAnchor.split('-').map(Number); return `${MESES[m-1]} ${y}`;
}
function gestShift(dir){
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
  const body = gestSub==='asig' ? gestAsignaciones(R) : gestCalendar(R);
  return `<div class="op-hello"><h2>Gestión</h2><div class="muted">Vista de mando · ${gestSub==='asig'?'quién trabaja en qué':'calendario del equipo'}</div></div>
    <div class="subtoggle gest-tabs"><button class="${gestSub==='cal'?'on':''}" onclick="setGestSub('cal')">Calendario</button><button class="${gestSub==='asig'?'on':''}" onclick="setGestSub('asig')">Asignaciones</button></div>
    <div class="gf-bar"><span class="glabel">Vistas</span>
      <button class="gf-chip${gestFilterId?'':' on'}" onclick="clearGestFilter()">Todo</button>
      ${gestFilters().map(f=>`<button class="gf-chip${f.id===gestFilterId?' on':''}" onclick="applyGestFilter('${f.id}')">${esc(f.name)}${f.id===gestFilterId?` <span class="gf-ed" title="Editar vista" onclick="event.stopPropagation();openGestFilterForm('${f.id}')">✏️</span>`:''}</button>`).join('')}
      <button class="gf-chip gf-new" onclick="openGestFilterForm()">+ Nueva vista</button>
    </div>
    <div class="kb-ctl">
      <div class="subtoggle"><button class="${gestScope==='dia'?'on':''}" onclick="setGestScope('dia')">Hoy</button><button class="${gestScope==='semana'?'on':''}" onclick="setGestScope('semana')">Semana</button><button class="${gestScope==='mes'?'on':''}" onclick="setGestScope('mes')">Mes</button></div>
      <label class="filt"><span class="glabel">Proyecto</span><select class="filter-val" onchange="setGestProject(this.value)">${projOpts}</select></label>
      <label class="filt"><span class="glabel">Persona</span><select class="filter-val" onchange="setGestPerson(this.value)">${persOpts}</select></label>
      <div class="kb-month"><button onclick="gestShift(-1)" title="Anterior">‹</button><span class="kb-month-lbl">${gestRangeLabel(R)}</span><button onclick="gestShift(1)" title="Siguiente">›</button></div>
      <button class="btn sm" style="margin-left:auto" onclick="openKbTask()">+ Tarea</button>
    </div>
    ${body}`;
}
function gestChip(it){ const fr=kbFrente(it.t); return `<div class="gc-chip" style="border-left:3px solid ${fr.color}" title="${esc(it.s.name)} · ${it.c.name} · ${it.p.name}" onclick="openTask('${it.t.id}')">${it.s.time?`<b>${it.s.time}</b> `:''}${esc(it.s.name)}</div>`; }
function gestCalendar(R){
  let all=gestSubs().filter(gestPass); if(gestProject) all=all.filter(x=>x.p.id===gestProject); if(gestPerson) all=all.filter(x=>x.s.personId===gestPerson);
  const byDay={}; all.forEach(x=>{ (byDay[x.s.date]=byDay[x.s.date]||[]).push(x); });
  if(gestScope==='dia') return gestDayView(byDay);
  if(gestScope==='semana') return gestWeekView(byDay);
  return gestMonthView(byDay);
}
function gestMonthView(byDay){
  const pad=n=>String(n).padStart(2,'0'); const [y,m]=gestAnchor.split('-').map(Number);
  const last=new Date(Date.UTC(y,m,0)).getUTCDate();
  const firstISO=`${y}-${pad(m)}-01`, lastISO=`${y}-${pad(m)}-${pad(last)}`;
  const startSun=addDaysISO(firstISO,-isoWeekday(firstISO)), endSat=addDaysISO(lastISO,6-isoWeekday(lastISO));
  const WD=['DOM','LUN','MAR','MIÉ','JUE','VIE','SÁB']; const today=todayISO();
  let cells=''; let cur=startSun;
  while(cur<=endSat){
    const inMonth=cur.slice(0,7)===`${y}-${pad(m)}`; const items=byDay[cur]||[]; const MAXC=3;
    const shown=items.slice(0,MAXC).map(gestChip).join('');
    const more=items.length>MAXC?`<div class="gc-more" onclick="gestGoDay('${cur}')">+${items.length-MAXC} más</div>`:'';
    cells+=`<div class="gc-cell ${inMonth?'':'out'} ${cur===today?'today':''}"><div class="gc-dn">${+cur.split('-')[2]}</div>${shown}${more}</div>`;
    cur=addDaysISO(cur,1);
  }
  return `<div class="gc-grid"><div class="gc-wdhead">${WD.map(d=>`<div class="gc-wd">${d}</div>`).join('')}</div><div class="gc-cells">${cells}</div></div>`;
}
function gestWeekView(byDay){
  const s=sundayOf(gestAnchor); const WD=['DOM','LUN','MAR','MIÉ','JUE','VIE','SÁB']; const today=todayISO();
  let cols='';
  for(let i=0;i<7;i++){ const day=addDaysISO(s,i); const items=(byDay[day]||[]).slice().sort((a,b)=>(a.s.time||'')<(b.s.time||'')?-1:1);
    const chips=items.map(gestChip).join('')||'<div class="gc-none">—</div>';
    cols+=`<div class="gc-wcol"><div class="gc-wh ${day===today?'today':''}">${WD[i]} ${+day.split('-')[2]}</div><div class="gc-wbody">${chips}</div></div>`;
  }
  return `<div class="gc-week">${cols}</div>`;
}
function gestDayView(byDay){
  const day=gestAnchor; const items=(byDay[day]||[]).slice().sort((a,b)=>(a.s.time||'')<(b.s.time||'')?-1:1);
  if(!items.length) return `<div class="gc-day"><div class="muted" style="padding:24px;text-align:center">Sin actividades este día.</div></div>`;
  const rows=items.map(it=>{ const fr=kbFrente(it.t); const per=store.person(it.s.personId);
    return `<div class="gc-drow" onclick="openTask('${it.t.id}')" style="border-left:4px solid ${fr.color}">
      <div class="gc-dtime">${it.s.time||'—'}</div>
      <div class="gc-dmain"><div class="gc-dname">${it.s.done?'✓ ':''}${esc(it.s.name)}</div><div class="gc-dmeta">${it.c.name} · ${it.p.name} · ${fr.name} · ${avatar(per,true)} ${per.name}</div></div>
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
      const chips=items.map(it=>`<div class="ga-chip" title="${esc(it.s.name)} · ${it.s.date}${it.s.time?' '+it.s.time:''}" onclick="openTask('${it.t.id}')">${esc(it.s.name)}</div>`).join('')||'<div class="ga-none">—</div>';
      return `<td class="ga-cell">${chips}</td>`; }).join('');
    return `<tr><td class="ga-proj"><span class="ga-dot" style="background:${fc}"></span><div class="ga-pinfo"><div class="ga-pn">${c.name}</div><div class="ga-ps">${sv?sv.name:''}</div></div></td>${cells}</tr>`;
  }).join('');
  return `<div class="ga-scroll"><table class="ga-tbl"><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table></div>`;
}

/* ============ AGENDA (carga por persona) ============ */
function addDaysISO(iso,n){ const [y,m,d]=iso.split('-').map(Number); const dt=new Date(Date.UTC(y,m-1,d)); dt.setUTCDate(dt.getUTCDate()+n); return dt.toISOString().slice(0,10); }
function isoWeekday(iso){ const [y,m,d]=iso.split('-').map(Number); return new Date(Date.UTC(y,m-1,d)).getUTCDay(); }
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
    const subs=[]; store.d.tasks.forEach(t=>(t.subtasks||[]).forEach(s=>{ if(s.personId===pid && s.date===day && s.time) subs.push({s,t}); }));
    const off=[];
    const blocks=subs.map(it=>{ const [hh,mm]=(it.s.time||'10:00').split(':').map(Number); const startMin=hh*60+mm; if(startMin<H0*60||startMin>=H1*60){ off.push(it); return ''; }
      const top=(startMin-H0*60)/60*rowH; const dur=+it.s.durMin||30; const height=Math.max(dur/60*rowH,20); const f=kbFrente(it.t); const c=store.client(store.project(it.t.projectId).clientId);
      const sel=agSel&&agSel.sid===it.s.id;
      return `<div class="ag-block${sel?' sel':''}${it.s.done?' done':''}" data-tid="${it.t.id}" data-sid="${it.s.id}" style="top:${top}px;height:${height}px;background:${f.color}" title="${esc(it.s.name)} · ${c.name} · ${f.name} · ${it.s.time} · ${fmtDurShort(dur)}" ${canEdit?`onpointerdown="agBlockDown(event)"`:`onclick="openAgItem('${it.t.id}','${it.s.id}')"`}><div class="ag-bl-nm">${urgMark(it.s.urgent||it.t.urgent)}${it.s.done?'✓ ':''}${esc(it.s.name)}</div><div class="ag-bl-sub">${c.name} · ${f.name}</div><div class="ag-bl-mt">${it.s.time} · ${fmtDurShort(dur)}</div>${canEdit?'<div class="ag-rs" title="Arrastra para cambiar la duración" onpointerdown="agResizeDown(event)"></div>':''}</div>`;
    }).join('');
    if(off.length) anyOff=true;
    const lines=[]; for(let k=0;k<slots;k++) lines.push(`<div class="ag-line" style="top:${k*rowH}px"></div>`);
    const load=subs.reduce((a,it)=>a+(+it.s.durMin||30),0);
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
    store.updateSubtask(tid,sid,{date:body.dataset.day,time}); logEvent(tid,'Movió la subtarea «'+sub.name+'» a '+body.dataset.day+' '+time); agSel={tid,sid}; render(); };
  document.addEventListener('pointermove',onMove); document.addEventListener('pointerup',onUp);
}
function agResizeDown(ev){
  ev.stopPropagation(); ev.preventDefault(); const blk=ev.currentTarget.parentElement; const tid=blk.dataset.tid, sid=blk.dataset.sid; const y0=ev.clientY; const h0=blk.getBoundingClientRect().height;
  const mt=blk.querySelector('.ag-bl-mt'); const t0=(blk.querySelector('.ag-bl-mt').textContent.split(' · ')[0]||''); blk.classList.add('resizing');
  const onMove=e=>{ const dur=Math.max(15,agSnap((h0+(e.clientY-y0))/AG.rowH*60)); blk.style.height=(dur/60*AG.rowH)+'px'; if(mt) mt.textContent=t0+' · '+fmtDurShort(dur); };
  const onUp=e=>{ document.removeEventListener('pointermove',onMove); document.removeEventListener('pointerup',onUp);
    const h=blk.getBoundingClientRect().height; let dur=Math.max(15,agSnap(h/AG.rowH*60));
    const t=store.task(tid); const sub=t.subtasks.find(x=>x.id===sid); const [hh,mm]=(sub.time||'10:00').split(':').map(Number); dur=Math.min(dur,AG.H1*60-(hh*60+mm));
    blk.classList.remove('resizing'); store.updateSubtask(tid,sid,{durMin:dur}); logEvent(tid,'Cambió la duración de «'+sub.name+'» a '+fmtDurShort(dur)); render(); };
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
  store.updateSubtask(d.tid,d.sid,{date:body.dataset.day,time}); logEvent(d.tid,'Agendó la subtarea «'+sub.name+'» el '+body.dataset.day+' '+time); agSel=d; render(); }
function agNotes(days){ let h=''; const si=agSelInfo();
  if(si&&si.t.dueDate&&!days.includes(si.t.dueDate)) h+=`<button class="ag-note dl" onclick="agGoDeadline()" title="Ir a la semana del deadline">🏁 Deadline de «${esc(si.t.name)}»: ${dLabel(si.t.dueDate)} ${si.t.dueDate<days[0]?'←':'→'}</button>`;
  const wk=[]; store.d.tasks.forEach(t=>(t.subtasks||[]).forEach(x=>{ if(x.personId===agPerson&&x.date&&x.time&&!x.done&&[0,6].includes(isoWeekday(x.date))&&x.date>=addDaysISO(days[0],-1)&&x.date<=addDaysISO(days[4],2)) wk.push(x); }));
  const wkIn=wk.filter(x=>x.date>=days[0]&&x.date<=addDaysISO(days[4],2)); if(wkIn.length) h+=`<span class="ag-note" title="${esc(wkIn.map(x=>x.name).join(' · '))}">🗓️ ${wkIn.length} subtarea${wkIn.length>1?'s':''} en fin de semana</span>`;
  return h; }
function viewAgenda(){
  const per=store.person(agPerson);
  const persOpts=store.activeStaff().map(u=>`<option value="${u.id}" ${agPerson===u.id?'selected':''}>${u.name}</option>`).join('');
  const days=[0,1,2,3,4].map(i=>addDaysISO(agStart,i));
  const items=personSubtasks(agPerson,true);
  const today=todayISO(); const wkStr=addDaysISO(today,7);
  const buckets={venc:[],hoy:[],sem:[],resto:[],sinf:[]};
  items.forEach(it=>{const d=it.s.date; if(!d)buckets.sinf.push(it); else if(d<today)buckets.venc.push(it); else if(d===today)buckets.hoy.push(it); else if(d<=wkStr)buckets.sem.push(it); else buckets.resto.push(it);});
  Object.values(buckets).forEach(a=>a.sort((x,y)=>(((x.s.date||'9')+(x.s.time||''))<((y.s.date||'9')+(y.s.time||'')))?-1:1));
  const row=it=>{const p=store.project(it.t.projectId),c=store.client(p.clientId),f=kbFrente(it.t);const overdue=it.s.date&&it.s.date<today;
    const pend=(it.t.subtasks||[]).filter(x=>!x.done), sched=pend.filter(x=>x.date&&x.time).length; const sel=agSel&&agSel.sid===it.s.id; const canEdit=agCanEdit();
    return `<div class="ag-item${sel?' sel':''}" ${canEdit?`draggable="true" ondragstart="agListStart(event,'${it.t.id}','${it.s.id}')" ondragend="agListEnd()"`:''} onclick="openAgItem('${it.t.id}','${it.s.id}')" style="border-left:3px solid ${f.color}">
      <div class="ag-it-nm">${urgMark(it.s.urgent||it.t.urgent)}${esc(it.s.name)} <span class="ag-cnt" title="Subtareas pendientes de esta tarea que ya tienen fecha y hora, de las pendientes totales">📅 ${sched}/${pend.length}</span></div>
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
  if(isGerencia()) tabs=['gestor','gantt','tareas','kpis','biblioteca','datos','scorecard'];
  else if(isPM()) tabs=['gestor','gantt','tareas','biblioteca','scorecard'];
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
  const hubBtns = colab ? '' : `<div style="display:flex;gap:8px">${isGerencia()?`<button class="btn ghost sm" onclick="openProjectEdit('${p.id}')">✏️ Editar</button><button class="btn ghost sm" title="Eliminar proyecto" style="color:#c0392b" onclick="openProjectDel('${p.id}')">🗑️</button>`:''}<button class="btn ghost sm" onclick="openEtapaForm('${p.id}')">+ Etapa</button><button class="btn ghost sm" onclick="openFrenteForm('${p.id}')">+ Frente</button><button class="btn ghost sm" onclick="openKbTask('${p.id}')">+ Tarea</button></div>`;
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
        const done=(t.subtasks||[]).filter(s=>s.done).length, tot=(t.subtasks||[]).length;
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
function tabGantt(p){
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
    for(let o=0;o<total;o++){ const dt=addDays(dISO(rangeStart),o); ticks.push({off:o,w:1,label:String(dt.getDate()),strong:dt.getDate()===1}); }
  }
  const axis=ticks.map(tk=>`<div class="g-tick ${tk.strong?'strong':''}" style="left:${tk.off*PX}px;width:${tk.w*PX}px">${tk.label}</div>`).join('');
  const grid=ticks.map(tk=>`<div class="g-line ${tk.strong?'strong':''}" style="left:${tk.off*PX}px"></div>`).join('');
  // marcador de hoy
  const today=todayISO(); let todayMark='';
  if(today>=rangeStart&&today<=rangeEnd){ todayMark=`<div class="g-today" style="left:${diffDays(rangeStart,today)*PX}px"></div>`; }

  // filas
  let labels='<div class="g-lh">Tarea</div>', lanes=`<div class="g-axis">${axis}</div>`;
  frentes.forEach(f=>{
    labels+=`<div class="g-fr" style="border-left:4px solid ${f.color}">${f.name}</div>`;
    lanes+=`<div class="g-frrow"></div>`;
    tasks.filter(t=>t.frenteId===f.id).forEach(t=>{
      const sp=taskSpan(t);
      labels+=`<div class="g-ll" title="${esc(t.name)}">${t.name}</div>`;
      if(!sp){ lanes+=`<div class="g-lane"></div>`; return; }
      const left=Math.max(0,diffDays(rangeStart,sp.start))*PX;
      const wdt=Math.max(PX*0.7,(diffDays(sp.start,sp.end)+1)*PX);
      const done=(t.subtasks||[]).filter(s=>s.done).length, tot=(t.subtasks||[]).length;
      const pct=tot?Math.round(done/tot*100):(t.status==='done'?100:0);
      lanes+=`<div class="g-lane"><div class="g-bar" style="left:${left}px;width:${wdt}px;background:${f.color}" title="${esc(t.name)} · ${dLabel(sp.start)}–${dLabel(sp.end)}" onclick="openTask('${t.id}')"><div class="g-fill" style="width:${pct}%"></div><span class="g-bl">${dk(t)}${t.name}</span></div></div>`;
    });
  });

  const zoomBtns=[['day','Día'],['week','Semana'],['month','Mes']].map(([k,l])=>`<button class="${ganttZoom===k?'on':''}" onclick="setGanttZoom('${k}')">${l}</button>`).join('');
  return `<div class="tareas-ctl"><div class="group-ctl"><span class="glabel">Zoom</span><div class="subtoggle sm">${zoomBtns}</div></div>
      <span class="muted" style="font-size:.82rem">${dLabel(rangeStart)} – ${dLabel(rangeEnd)}</span></div>
    <div class="gc">
      <div class="g-labels">${labels}</div>
      <div class="g-scroll"><div class="g-inner" style="width:${W}px">
        <div class="g-grid">${grid}${todayMark}</div>
        ${lanes}
      </div></div>
    </div>
    <div class="hint" style="margin-top:10px">Cada barra va del inicio al fin de las subtareas de la tarea. El relleno muestra el avance. La línea amarilla es hoy. Clic en una barra para abrir la tarea.</div>`;
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
  if((t.subtasks||[]).some(s=>!s.done && (s.personId===pid || (s.invitados||[]).includes(pid)))) return true; // subtarea PENDIENTE
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

function taskRow(p,t){const r=store.person(t.responsibleId);const done=(t.subtasks||[]).filter(s=>s.done).length,tot=(t.subtasks||[]).length;
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
  const done=(t.subtasks||[]).filter(s=>s.done).length,tot=(t.subtasks||[]).length;
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
  const doneSub=tasks.reduce((a,t)=>a+(t.subtasks||[]).filter(s=>s.done).length,0);
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
      <div class="field"><label>Color</label><input id="qm-color" type="color" value="${nextColor}" style="width:60px;height:38px;padding:2px"></div>
      <div class="hint">Los frentes son las filas del Gantt.</div>
      <div class="wiz-actions"><button class="btn ghost" onclick="closeQM()">Cancelar</button><button class="btn" onclick="saveFrente()">Crear frente</button></div>`;
  } else if(qm.kind==='frenteEdit'){
    const f=store.frentesOf(qm.pid).find(x=>x.id===qm.fid)||{name:'',color:'#223c36'};
    inner=`<h3>Editar frente</h3>
      <div class="field"><label>Nombre</label><input id="qm-name" value="${esc(f.name)}"></div>
      <div class="field"><label>Color</label><input id="qm-color" type="color" value="${f.color}" style="width:60px;height:38px;padding:2px"></div>
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
      <div class="field"><label>Tipo de cliente</label><select id="qm-tipo"><option value="externo" ${c.tipo==='interno'?'':'selected'}>Externo (genera ingreso y costo)</option><option value="interno" ${c.tipo==='interno'?'selected':''}>Interno (capacitaciones, juntas, RH… cuenta horas, no costo)</option></select></div>
      <div class="field row"><div><label>Razón social</label><input id="qm-razon" value="${esc(c.razon||'')}"></div>
        <div><label>RFC</label><input id="qm-rfc" value="${esc(c.rfc||'')}"></div></div>
      <div class="field row"><div><label>Ubicación</label><input id="qm-loc" value="${esc(c.location||'')}"></div>
        <div><label>Responsable Nuwek</label><select id="qm-resp2">${respOpts}</select></div></div>
      <div class="field"><label>Web</label><input id="qm-web" value="${esc(c.web||'')}" placeholder="sitio.mx"></div>
      <div class="se-lbl" style="margin-bottom:8px">Redes sociales</div>
      <div class="field row"><div><label>Instagram</label><input id="qm-ig" value="${esc(c.ig||'')}" placeholder="@cuenta"></div>
        <div><label>Facebook</label><input id="qm-fb" value="${esc(c.fb||'')}"></div></div>
      <div class="field row"><div><label>YouTube</label><input id="qm-yt" value="${esc(c.youtube||'')}"></div>
        <div><label>TikTok</label><input id="qm-tt" value="${esc(c.tiktok||'')}"></div></div>
      <div class="field row"><div><label>LinkedIn</label><input id="qm-in" value="${esc(c.linkedin||'')}"></div>
        <div><label>Otro</label><input id="qm-otro" value="${esc(c.otro||'')}"></div></div>
      <div class="wiz-actions"><button class="btn ghost" onclick="closeQM()">Cancelar</button><button class="btn" onclick="${qm.kind==='clienteEdit'?'saveClientEdit()':'saveClient()'}">Guardar</button></div>`;
  } else if(qm.kind==='contacto' || qm.kind==='contactoEdit'){
    const p=qm.kind==='contactoEdit'?(store.client(qm.cid).people.find(x=>x.id===qm.pid)||{}):{};
    inner=`<h3>${qm.kind==='contactoEdit'?'Editar contacto':'Nuevo contacto'}</h3>
      <div class="field"><label>Nombre</label><input id="qm-name" value="${esc(p.name||'')}"></div>
      <div class="field row"><div><label>Teléfono</label><input id="qm-phone" value="${esc(p.phone||'')}"></div>
        <div><label>Correo</label><input id="qm-email" value="${esc(p.email||'')}"></div></div>
      <div class="field row"><div><label>Rol</label><input id="qm-crole" value="${esc(p.role||'')}" placeholder="Ej. Coord. Marketing"></div>
        <div><label>Cumpleaños (MM-DD)</label><input id="qm-bday" value="${esc(p.birthday||'')}" placeholder="03-14"></div></div>
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
      <div class="field"><label>Color</label><input id="qm-color" type="color" value="${cur.color}" style="width:60px;height:38px;padding:2px"></div>
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
          <div><label>Color</label><input id="qm-color" type="color" value="${u.color||'#3f7d6e'}" style="width:60px;height:38px;padding:2px"></div></div>
        <div class="field row"><div><label>Fecha de ingreso</label><input id="qm-join" type="date" value="${esc(u.joinDate||'')}"></div>
          <div><label>Estado</label><select id="qm-active"><option value="1" ${u.active!==false?'selected':''}>Activo</option><option value="0" ${u.active===false?'selected':''}>Inactivo</option></select></div></div>
        <div class="pers-div">Acceso al sistema</div>
        <div class="field row"><div><label>Contraseña de ingreso (6 dígitos)</label><input id="qm-pass" inputmode="numeric" maxlength="6" pattern="[0-9]*" value="${esc(u.password||'')}" placeholder="••••••" style="letter-spacing:3px;max-width:160px"></div>
          <div><label>Permiso</label><select id="qm-perm"><option value="gerencia" ${u.perm==='gerencia'?'selected':''}>Gerencia</option><option value="pm" ${u.perm==='pm'?'selected':''}>Project Manager</option><option value="colab" ${(u.perm==='colab'||!u.perm)?'selected':''}>Colaborador</option></select></div></div>
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
      <div class="field"><label>Color</label><input id="qm-color" type="color" value="${curColor}" style="width:60px;height:38px;padding:2px"></div>
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
function saveClient(){const n=val('qm-name');if(!n){alert('El cliente necesita un nombre.');return;}const c=store.addClient({name:n,razon:val('qm-razon'),rfc:val('qm-rfc'),location:val('qm-loc'),web:val('qm-web'),ig:val('qm-ig'),fb:val('qm-fb'),youtube:val('qm-yt'),tiktok:val('qm-tt'),linkedin:val('qm-in'),otro:val('qm-otro'),generalResponsibleId:val('qm-resp2')||null,tipo:val('qm-tipo')==='interno'?'interno':'externo'});qm=null;openClient(c.id);}
function openClientEdit(cid){qm={kind:'clienteEdit',cid};render();}
function saveClientEdit(){const n=val('qm-name');if(!n){alert('El cliente necesita un nombre.');return;}store.updateClient(qm.cid,{name:n,razon:val('qm-razon'),rfc:val('qm-rfc'),location:val('qm-loc'),web:val('qm-web'),ig:val('qm-ig'),fb:val('qm-fb'),youtube:val('qm-yt'),tiktok:val('qm-tt'),linkedin:val('qm-in'),otro:val('qm-otro'),generalResponsibleId:val('qm-resp2')||null,tipo:val('qm-tipo')==='interno'?'interno':'externo'});qm=null;render();}
function openContactForm(cid){qm={kind:'contacto',cid};render();}
function saveContact(){const n=val('qm-name');if(!n){alert('El contacto necesita un nombre.');return;}store.addClientPerson(qm.cid,{name:n,phone:val('qm-phone'),email:val('qm-email'),role:val('qm-crole'),birthday:val('qm-bday')});qm=null;render();}
function openContactEdit(cid,pid){qm={kind:'contactoEdit',cid,pid};render();}
function saveContactEdit(){const n=val('qm-name');if(!n){alert('El contacto necesita un nombre.');return;}store.updateClientPerson(qm.cid,qm.pid,{name:n,phone:val('qm-phone'),email:val('qm-email'),role:val('qm-crole'),birthday:val('qm-bday')});qm=null;render();}
function delContact(cid,pid){if(confirm('¿Quitar este contacto?')){store.removeClientPerson(cid,pid);render();}}
function togglePay(payId,pid){store.togglePayment(payId);render();}
function openPayForm(pid){qm={kind:'pago',pid};render();}
function savePay(){const d=val('qm-pdate'),a=val('qm-pamount');if(!d||!a){alert('Fecha y monto.');return;}store.addPayment(qm.pid,d,a);qm=null;render();}
function openPayEdit(pid,payId){qm={kind:'pagoEdit',pid,payId};render();}
function savePayEdit(){const d=val('qm-pdate'),a=val('qm-pamount');if(!d||!a){alert('Fecha y monto.');return;}store.updatePayment(qm.payId,{dueDate:d,amount:a});qm=null;render();}
function delPay(payId,pid){if(confirm('¿Eliminar este pago?')){store.removePayment(payId);render();}}
function openGenPagos(pid){qm={kind:'genPagos',pid};render();}function runGenPagos(){const freq=val('qm-freq'),count=+val('qm-count'),total=+val('qm-total'),start=val('qm-pstart');if(!count||!total||!start){alert('Completa frecuencia, número, total y fecha.');return;}if(!confirm('Esto reemplaza el calendario de pagos actual. ¿Continuar?'))return;store.generatePaymentsCustom(qm.pid,freq,count,total,start);qm=null;render();}
function openProjectEdit(pid){qm={kind:'proyectoEdit',pid};render();}
function openProjectDel(pid){ if(!isGerencia()) return; qm={kind:'proyectoDel',pid}; render(); }
async function confirmProjectDel(){ if(!isGerencia()||!qm||qm.kind!=='proyectoDel') return; const p=store.project(qm.pid); if(!p) return;
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
  const subs=(t.subtasks||[]).map(s=>{
    const per=store.person(s.personId); const e=store.etapaOfDate(p.id,s.date);
    const timing=timingSub===t.id+':'+s.id;
    const editing=editingSub===t.id+':'+s.id;
    if(editing){
      const persOpts2=[`<option value="" ${s.personId?'':'selected'}>— Sin responsable —</option>`,staffOptEls(s.personId,' (Nuwek)'),...clientPeople2.map(pp=>`<option value="${pp.id}" ${pp.id===s.personId?'selected':''}>${pp.name} (Cliente)</option>`)].join('');
      return `<div class="sub-item editing"><div class="sub-edit">
        <input id="se-name-${s.id}" value="${esc(s.name)}" placeholder="Nombre de la subtarea">
        <div class="se-row"><select id="se-person-${s.id}">${persOpts2}</select><input type="date" id="se-date-${s.id}" value="${s.date||''}" ${canSubDate()?'':`disabled title="${SUB_DATE_MSG}"`}><input type="time" id="se-time-${s.id}" value="${s.time||''}"><select id="se-dur-${s.id}"><option value="" ${s.durMin?'':'selected'}>— Sin duración —</option>${durOptsEl(s.durMin||0)}</select></div>
        <div class="se-actions"><button class="btn ghost sm" onclick="cancelSubEdit()">Cancelar</button><button class="btn sm" onclick="saveSubEdit('${t.id}','${s.id}')">Guardar</button></div>
      </div></div>`;
    }
    const inv=(s.invitados||[]).map(id=>avatar(store.person(id),true)).join('');
    const right= timing
      ? `<div class="sub-time"><input type="number" min="1" id="stime-${s.id}" placeholder="min"><button class="mini ok" onclick="confirmSubTime('${t.id}','${s.id}')">✓</button><button class="mini no" onclick="cancelSubTime()">×</button></div>`
      : `<div class="sub-btns"><button class="btn ghost sm" onclick="editSub('${t.id}','${s.id}')">✏️</button><button class="btn ghost sm" onclick="delSub('${t.id}','${s.id}')">🗑️</button></div>`;
    const canChk=canCheckSub(s);
    const locked=isColab()&&subTimeLocked(s);
    const chkClickable=canChk&&!locked;
    const lockTag = (s.done&&isColab()) ? (subTimeLocked(s)?` · <span class="sub-lock">🔒 tiempo fijo</span>`:(s.doneAt?` · <span class="sub-editable">✏️ editable hasta ${subEditUntil(s)}</span>`:'')) : '';
    const lateD=(!s.done&&s.date&&s.date<todayISO())?Math.round((new Date(todayISO()+'T00:00:00')-new Date(s.date+'T00:00:00'))/86400000):0;
    return `<div class="sub-item${lateD?' is-late':''}" data-sid="${s.id}" ondragover="sbOver(event,'${t.id}')" ondragleave="sbLeave(event)" ondrop="sbDrop(event,'${t.id}','${s.id}')">
      <span class="sub-grip" title="Arrastra para reordenar" draggable="true" ondragstart="sbStart(event,'${t.id}','${s.id}')" ondragend="sbEnd()">☰</span>
      <span class="check ${s.done?'done':''} ${chkClickable?'':'locked'}" ${chkClickable?`onclick="toggleSub('${t.id}','${s.id}')"`:`title="${locked?'Tiempo fijo: pasaron los 10 minutos':'Solo palomeas tus subtareas'}"`}>${s.done?'✓':''}</span>
      <span class="sub-nm ${s.done?'done':''}">${s.name}</span>
      <span class="sub-mt"><span class="urg-av" title="${s.urgent?'Urgente: clic para quitar':'Clic para marcar como urgente'}" onclick="event.stopPropagation();toggleSubUrgent('${t.id}','${s.id}')">${s.urgent?'<span class="urg">⚠️</span>':avatar(per,true)}</span> ${s.personId?per.name:'<i class="muted">Sin responsable</i>'} · ${dLabel(s.date)}${lateD?` <span class="late-tag" title="Venció el ${dLabel(s.date)} y sigue pendiente">⚠ ${lateD===1?'1 día':lateD+' días'} de retraso</span>`:''}${s.dateConflict?' <span class="date-bad" title="La fecha original no cabía en la nueva etapa; se puso hoy. Edítala.">🔴</span>':''} ${s.time||''} <span class="etapa-badge ${e?'':'out'}">${e?e.name:'fuera'}</span>${s.durMin?` · ⏳ ${fmtDurShort(s.durMin)}`:''}${s.done&&s.timeSpent?` · ⏱ ${fmtTime(s.timeSpent)}`:''}${lockTag}${inv?` · 👥 ${inv}`:''}</span>
      ${right}</div>`;
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
          ${(editingTask!==t.id)?`<button class="btn ghost sm" onclick="editTask('${t.id}')">✏️ Editar</button><button class="btn ghost sm" onclick="deleteTask('${t.id}')">🗑️</button>`:''}
          ${(panel&&editingTask!==t.id)?'':`<button class="x" onclick="${editingTask===t.id?'cancelTaskEdit()':'closeTask()'}">×</button>`}
        </div></div>
      ${editingTask===t.id ? `
        <div class="field"><label>Nombre de la tarea</label><input id="et-name" value="${esc(t.name)}"></div>
        <div class="field"><label>Descripción general</label><textarea id="et-desc" style="width:100%;min-height:70px;padding:9px;border:2px solid var(--line);border-radius:7px" placeholder="Objetivo, contexto, lineamientos…">${esc(t.description||'')}</textarea></div>
        <div class="field row"><div><label>Frente</label><select id="et-frente">${store.frentesOf(p.id).map(f=>`<option value="${f.id}" ${f.id===t.frenteId?'selected':''}>${f.name}</option>`).join('')}</select></div>
          <div><label>Responsable</label><select id="et-resp">${staffOptEls(t.responsibleId)}</select></div></div>
        <div class="field row"><div><label>Fecha límite</label><input id="et-date" type="date" value="${t.dueDate}"></div>
          <div><label>Viáticos</label><input id="et-viat" type="number" value="${t.viaticos||0}"></div></div>
        <div class="field"><label>Etiquetas (del catálogo)</label>${tagPicker('et-tags-box', t.tags||[])}</div>
        <div class="wiz-actions"><button class="btn ghost" onclick="cancelTaskEdit()">Cancelar</button><button class="btn" onclick="saveTaskEdit('${t.id}')">Guardar</button></div>
      ` : `
        <div class="m-title"><button class="urg-btn${t.urgent?' on':''}" title="${t.urgent?'Urgente: clic para quitar':'Marcar tarea como urgente'}" onclick="toggleTaskUrgent('${t.id}')">⚠️</button><h3>${dk(t)}${t.name}</h3></div>
        <div class="m-crumb-row"><div class="m-crumb">${c.name} » ${p.name} » <span style="color:${fr.color};font-weight:600">${fr.name}</span></div>${tags?`<div class="m-tags">${tags}</div>`:''}</div>
        <div class="m-meta"><span>${avatar(resp,true)} <b>${resp.name}</b></span>
          <select ${(isColab()&&!canEditTask(t))?'disabled title="Solo el responsable cambia el estado"':''} onchange="setTaskStatus('${t.id}',this.value)" style="padding:6px 10px;border-radius:7px;border:2px solid var(--line)">
            ${['to-do','in-progress','done','ajuste','on-hold'].map(s=>`<option value="${s}" ${t.status===s?'selected':''}>${statusLabel[s]}</option>`).join('')}
          </select></div>
        <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:10px">
          <div class="muted" style="font-size:.85rem">📅 Fecha límite: ${dLabel(t.dueDate)} ${t.viaticos?`· 🧾 viáticos ${money(t.viaticos)}`:''}</div>
          <button class="lib-btn" title="Biblioteca del proyecto (${store.linksOf(p.id).length})" onclick="openLibModal('${p.id}')">📚</button>
        </div>
        ${etNote}
      `}
    </div>
    <div class="m-body" ${editingTask===t.id?'style="display:none"':''}>
      <div class="m-sec"><h4>Descripción</h4><div class="md ${t.description?'':'muted'}">${t.description?mdRender(t.description):(isColab()?'Sin descripción.':'Sin descripción. Usa ✏️ Editar para agregarla.')}</div></div>
      <div class="m-sec"><div class="subs-head"><h4 style="margin:0">Subtareas (${(t.subtasks||[]).filter(s=>s.done).length}/${(t.subtasks||[]).length})</h4>
        <div class="subs-tabs"><button class="${subView==='list'?'on':''}" onclick="setSubView('list')">Subtareas</button><button class="${subView==='links'?'on':''}" onclick="setSubView('links')">🔗 Links</button>${!isColab()?`<button class="${subView==='log'?'on':''}" onclick="setSubView('log')">📋 Log</button>`:''}</div></div>
        ${(subView==='log'&&!isColab())?taskLogPanel(t):(subView==='links')?taskLinksPanel(t):`${subs||'<div class="muted">Sin subtareas.</div>'}
        <div class="inline-add">
          <input class="grow" id="ns-name" placeholder="Nueva subtarea...">
          <span class="ns-field"><button type="button" class="ns-ico" title="Responsable" onclick="nsReveal('ns-person')">👤</button><select id="ns-person" class="ns-ctl hidden">${persOpts}</select></span>
          ${canSubDate()?`<span class="ns-field"><button type="button" class="ns-ico" title="Fecha" onclick="nsReveal('ns-date')">📅</button><input type="date" id="ns-date" class="ns-ctl hidden" value="${t.dueDate}"></span>`:`<span class="ns-field"><button type="button" class="ns-ico" title="${SUB_DATE_MSG} Se usará la fecha límite de la tarea." style="opacity:.4;cursor:not-allowed" onclick="alert('${SUB_DATE_MSG} Se usará la fecha límite de la tarea.')">📅</button></span>`}
          <span class="ns-field"><button type="button" class="ns-ico" title="Hora" onclick="nsReveal('ns-time')">🕐</button><input type="time" id="ns-time" class="ns-ctl hidden" value=""></span>
          <span class="ns-field"><button type="button" class="ns-ico" title="Duración aprox." onclick="nsReveal('ns-dur')">⏳</button><select id="ns-dur" class="ns-ctl hidden"><option value="" selected>— Sin duración —</option>${durOptsEl(0)}</select></span>
          <button class="btn sm" onclick="addSub('${t.id}')">+ Agregar</button>
        </div>
        <div class="hint">Toca un círculo para elegir responsable, fecha, hora o duración. Si no lo abres, se usan los valores por defecto.</div>`}
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
function saveTaskEdit(id){
  const name=(val('et-name')||'').trim(); if(!name){alert('La tarea necesita nombre.');return;}
  const tags=readTags('et-tags-box');
  store.updateTask(id,{name,description:val('et-desc'),frenteId:val('et-frente'),responsibleId:val('et-resp'),dueDate:val('et-date'),viaticos:+val('et-viat')||0,tags});
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
function toggleSub(tid,sid){const t=store.task(tid);const s=t.subtasks.find(x=>x.id===sid);if(!canCheckSub(s)){return;}if(s.done){if(isColab()&&subTimeLocked(s)){alert('Ya pasaron los 10 minutos: el tiempo de esta subtarea quedó fijo y no puede editarse.');return;}store.updateSubtask(tid,sid,{done:false,timeSpent:0,doneAt:null});logEvent(tid,'Reabrió la subtarea «'+s.name+'»');render();}else{timingSub=tid+':'+sid;render();setTimeout(()=>{const el=document.getElementById('stime-'+sid);if(el)el.focus();},0);}}
function confirmSubTime(tid,sid){const el=document.getElementById('stime-'+sid);const m=parseInt(el&&el.value,10);if(!m||m<=0){alert('Escribe los minutos.');return;}const s0=store.task(tid).subtasks.find(x=>x.id===sid);store.updateSubtask(tid,sid,{done:true,timeSpent:m,doneAt:new Date().toISOString()});logEvent(tid,'Completó la subtarea «'+s0.name+'» ('+fmtTime(m)+')');timingSub=null;render();}
function cancelSubTime(){timingSub=null;render();}
function delSub(tid,sid){const s=store.task(tid).subtasks.find(x=>x.id===sid);if(confirm('¿Eliminar subtarea?')){const nm=s?s.name:'';store.removeSubtask(tid,sid);logEvent(tid,'Eliminó la subtarea «'+nm+'»');render();}}
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
function editSub(tid,sid){editingSub=tid+':'+sid;timingSub=null;render();}
function cancelSubEdit(){editingSub=null;render();}
function saveSubEdit(tid,sid){
  const name=(val('se-name-'+sid)||'').trim(); if(!name){alert('La subtarea necesita nombre.');return;}
  store.updateSubtask(tid,sid,{name,personId:val('se-person-'+sid)||'',date:val('se-date-'+sid)||(store.task(tid)||{}).dueDate||'',time:val('se-time-'+sid)||'',durMin:+val('se-dur-'+sid)||null});
  logEvent(tid,'Editó la subtarea «'+name+'»');
  editingSub=null;render();
}
function nsReveal(id){const ctl=document.getElementById(id);if(!ctl)return;ctl.classList.remove('hidden');const btn=ctl.parentElement.querySelector('.ns-ico');if(btn)btn.style.display='none';if(ctl.showPicker){try{ctl.showPicker();}catch(e){ctl.focus();}}else{ctl.focus();}}
function addSub(tid){const n=val('ns-name');if(!n)return;const tk=store.task(tid);store.addSubtask(tid,{name:n,personId:val('ns-person')||'',date:(canSubDate()?val('ns-date'):'')||(tk&&tk.dueDate)||'',time:val('ns-time')||'',durMin:+val('ns-dur')||null,invitados:[]});logEvent(tid,'Agregó la subtarea «'+n+'»');render();}
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
function addCmt(tid){
  const el=document.getElementById('cmt-'+tid); const tx=(el.value||'').trim();
  if(!tx && draftAtt.length===0){return;}
  const ments=draftMentions.filter(id=>tx.includes('@'+store.person(id).name));
  try{ store.addComment(tid,currentUser,tx,draftAtt.slice(),ments); }
  catch(e){ alert('No se pudo guardar: los adjuntos superan el espacio local. Prueba con archivos más pequeños.'); return; }
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
  return `<div class="crumb">Catálogos</div><div class="sec-title"><h2>Catálogos</h2></div>
    <p class="muted">La base reutilizable. Los <b>Servicios</b> son plantillas: al crear un proyecto precargan sus frentes y tareas.</p>
    <div class="sec-title"><h2 style="font-size:1.1rem">Servicios</h2><button class="btn sm" onclick="openSvcForm()">+ Nuevo servicio</button></div>
    <div class="svc-list">${svc||'<div class="muted">Sin servicios.</div>'}</div>
    <div class="sec-title"><h2 style="font-size:1.1rem">Personal Nuwek</h2><button class="btn sm" onclick="openStaffForm()">+ Nueva persona</button></div>
    <div class="team-list">${staff}</div>
    <div class="sec-title"><h2 style="font-size:1.1rem">Etiquetas</h2><button class="btn sm" onclick="openTagForm()">+ Nueva etiqueta</button></div>
    <div class="chiplist">${tags}</div>
    <div class="sec-title"><h2 style="font-size:1.1rem">Apariencia del login</h2></div>
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
    </div>`;
}

/* ================== NAV ================== */
function go(v){view=v;modalTask=null;render();}
function openClient(id){selClient=id;view='cliente';render();}
function openProject(id){selProject=id;selTab='gestor';view='proyecto';render();}
function setTab(t){selTab=t;render();}
function setGanttZoom(z){ganttZoom=z;render();}
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
  restoreSession();
  render();
}
boot();