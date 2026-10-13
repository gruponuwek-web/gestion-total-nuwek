// ============================================================
//  Pagos ↔ Supabase (tabla "pagos")
//  El calendario de cobranza de cada proyecto.
// ============================================================

function dbToAppPago(row){
  return {
    id: row.id,
    projectId: row.proyecto_id || null,
    dueDate: row.due_date || '',
    amount: row.amount || 0,
    paid: row.paid === true,
    paidDate: row.paid_date || null,
    // estado de cobranza: programado · facturado · parcial · cobrado · conciliado (guardado en la columna jsonb "detalle")
    estado: (row.detalle && row.detalle.estado) || (row.paid === true ? 'cobrado' : 'programado'),
    factura: (row.detalle && row.detalle.factura) || null,
    cobro: (row.detalle && row.detalle.cobro) || null,
    conciliadoFecha: (row.detalle && row.detalle.conciliadoFecha) || null,
    nota: (row.detalle && row.detalle.nota) || ''
  };
}
function appToDbPago(x){
  const est = x.estado || (x.paid === true ? 'cobrado' : 'programado');
  const pagado = (est === 'cobrado' || est === 'conciliado');
  return {
    id: x.id,
    proyecto_id: x.projectId || null,
    due_date: x.dueDate || null,
    amount: +x.amount || 0,
    paid: pagado,
    paid_date: pagado ? ((x.cobro && x.cobro.fecha) || x.paidDate || null) : null,
    detalle: { estado: est, factura: x.factura || null, cobro: x.cobro || null, conciliadoFecha: x.conciliadoFecha || null, nota: x.nota || '' }
  };
}

// --- LEER todos los pagos ---
async function dbLoadPagos(){
  const { data, error } = await sb.from('pagos').select('*').order('due_date', { ascending: true });
  if (error) throw error;
  return (data || []).map(dbToAppPago);
}

// --- GUARDAR (crear o actualizar) un pago ---
async function dbSavePayment(x){
  try{
    const row = appToDbPago(x);
    let { error } = await sb.from('pagos').upsert(row);
    if (error && /detalle/i.test(error.message||'')){   // la columna "detalle" aún no existe: guardar sin ella
      delete row.detalle; ({ error } = await sb.from('pagos').upsert(row));
    }
    if (error){ console.error('Error guardando pago:', error.message); alert('Ojo: no se pudo guardar el pago.\n\n'+error.message); }
    else console.log('💾 Pago guardado en Supabase');
  }catch(e){ console.error('Red al guardar pago:', e); alert('Sin conexión para guardar el pago.'); }
}

// --- ELIMINAR un pago ---
async function dbDeletePayment(id){
  try{ const { error } = await sb.from('pagos').delete().eq('id', id); if (error) console.error('Error borrando pago:', error.message); }
  catch(e){ console.error('Red al borrar pago:', e); }
}

// --- REEMPLAZAR todo el calendario de un proyecto (borra los suyos y guarda los nuevos) ---
async function dbReplacePayments(projectId, payments){
  try{
    await sb.from('pagos').delete().eq('proyecto_id', projectId);
    if (payments && payments.length){
      let rows = payments.map(appToDbPago);
      let { error } = await sb.from('pagos').upsert(rows);
      if (error && /detalle/i.test(error.message||'')){ rows = rows.map(r => { const c = Object.assign({}, r); delete c.detalle; return c; }); ({ error } = await sb.from('pagos').upsert(rows)); }
      if (error) console.error('Error guardando calendario de pagos:', error.message);
    }
    console.log('💾 Calendario de pagos actualizado en Supabase');
  }catch(e){ console.error('Red al reemplazar pagos:', e); }
}
