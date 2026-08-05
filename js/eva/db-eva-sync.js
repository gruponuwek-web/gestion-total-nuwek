// ============================================================
//  EVA+ Coach - motor de sincronizacion
//
//  EL PROBLEMA QUE RESUELVE:
//  El portal trabaja en memoria y llama guardar() en ~60 lugares.
//  Convertir cada uno en una llamada a internet seria reescribir
//  medio portal y hacerlo lento.
//
//  COMO FUNCIONA:
//  1. Al cargar, se toma una "foto" de como estaban los datos.
//  2. Cuando el portal llama guardar(), no se manda nada de
//     inmediato: se espera un momento por si vienen mas cambios.
//  3. Al pasar ese momento, se compara contra la foto y solo se
//     mandan los registros que de verdad cambiaron.
//  4. Se toma una foto nueva y a esperar el siguiente cambio.
//
//  Asi el portal se siente igual de rapido y no se reescribe nada.
// ============================================================

var EvaSync = {
  foto: {},            // como estaban los datos la ultima vez que se sincronizo
  pendiente: null,     // temporizador
  sincronizando: false,
  hayCambiosNuevos: false,
  espera: 900,         // ms que espera antes de mandar (junta cambios seguidos)
  onEstado: null,      // callback para pintar "guardando..." en pantalla

  // --- que colecciones se sincronizan y como ---
  tablas: [
    { col:'programas',      tabla:'eva_programas',      map:appToDbPrograma },
    { col:'vendedores',     tabla:'eva_vendedores',     map:appToDbVendedor },
    { col:'metas',          tabla:'eva_metas',          map:appToDbMeta },
    { col:'evaluaciones',   tabla:'eva_evaluaciones',   map:appToDbEvaluacion },
    { col:'temas',          tabla:'eva_temas',          map:appToDbTema },
    { col:'capacitaciones', tabla:'eva_capacitaciones', map:appToDbCapacitacion },
    { col:'tareas',         tabla:'eva_tareas',         map:appToDbTarea },
    { col:'asistencias',    tabla:'eva_asistencias',    map:appToDbAsistencia },
    { col:'sesiones',       tabla:'eva_sesiones',       map:appToDbSesion },
    { col:'entregas',       tabla:'eva_entregas',       map:appToDbEntrega },
    { col:'compromisos',    tabla:'eva_compromisos',    map:appToDbCompromiso },
    { col:'bloqueos',       tabla:'eva_bloqueos',       map:appToDbBloqueo }
  ],

  // ----------------------------------------------------------
  //  Guarda la foto inicial. Se llama justo despues de cargar.
  // ----------------------------------------------------------
  iniciar: function(datos){
    this.foto = this.tomarFoto(datos);
    console.log('Sincronizacion lista');
  },

  tomarFoto: function(datos){
    var f = {};
    this.tablas.forEach(function(t){
      var m = {};
      (datos[t.col] || []).forEach(function(reg){
        m[reg.id] = JSON.stringify(reg);
      });
      f[t.col] = m;
    });
    // los subtemas viven dentro de los temas: se aplanan aparte
    var sub = {};
    (datos.temas || []).forEach(function(tema){
      (tema.subtemas || []).forEach(function(s, i){
        if(s.id) sub[s.id] = JSON.stringify({ t:tema.id, o:i, s:s });
      });
    });
    f.__subtemas = sub;
    // los artefactos son texto, no objetos
    f.__artefactos = (datos.artefactos || []).slice().sort().join('|');
    return f;
  },

  // ----------------------------------------------------------
  //  El portal llama esto en vez de escribir en el navegador
  // ----------------------------------------------------------
  marcarCambio: function(datos){
    var self = this;
    this.datos = datos;
    this.hayCambiosNuevos = true;
    this.avisar('pendiente');
    if (this.pendiente) clearTimeout(this.pendiente);
    this.pendiente = setTimeout(function(){ self.sincronizar(); }, this.espera);
  },

  avisar: function(estado, detalle){
    if (typeof this.onEstado === 'function') this.onEstado(estado, detalle);
  },

  // ----------------------------------------------------------
  //  Compara con la foto y manda solo lo que cambio
  // ----------------------------------------------------------
  sincronizar: async function(){
    if (this.sincronizando){
      // ya hay una en curso: al terminar se vuelve a intentar
      this.hayCambiosNuevos = true;
      return;
    }
    if (!this.datos) return;

    this.sincronizando = true;
    this.hayCambiosNuevos = false;
    this.avisar('guardando');

    var datos = this.datos;
    var errores = [];
    var cambios = 0;

    try {
      // --- tablas normales ---
      for (var i = 0; i < this.tablas.length; i++){
        var t = this.tablas[i];
        var antes = this.foto[t.col] || {};
        var ahora = {};
        var paraGuardar = [];

        (datos[t.col] || []).forEach(function(reg){
          var txt = JSON.stringify(reg);
          ahora[reg.id] = txt;
          if (antes[reg.id] !== txt) paraGuardar.push(reg);
        });

        var paraBorrar = Object.keys(antes).filter(function(id){ return !(id in ahora); });

        if (paraGuardar.length){
          var filas = paraGuardar.map(t.map);
          var up = await sb.from(t.tabla).upsert(filas);
          if (up.error) errores.push(t.tabla + ' (guardar): ' + up.error.message);
          else cambios += filas.length;
        }
        if (paraBorrar.length){
          var del = await sb.from(t.tabla).delete().in('id', paraBorrar);
          if (del.error) errores.push(t.tabla + ' (borrar): ' + del.error.message);
          else cambios += paraBorrar.length;
        }
      }

      // --- subtemas: viven dentro de los temas, se aplanan ---
      var antesSub = this.foto.__subtemas || {};
      var ahoraSub = {};
      var subGuardar = [];
      (datos.temas || []).forEach(function(tema){
        (tema.subtemas || []).forEach(function(s, i){
          if (!s.id) return;
          var txt = JSON.stringify({ t:tema.id, o:i, s:s });
          ahoraSub[s.id] = txt;
          if (antesSub[s.id] !== txt) subGuardar.push(appToDbSubtema(s, tema.id, i));
        });
      });
      var subBorrar = Object.keys(antesSub).filter(function(id){ return !(id in ahoraSub); });

      if (subGuardar.length){
        var upS = await sb.from('eva_subtemas').upsert(subGuardar);
        if (upS.error) errores.push('eva_subtemas (guardar): ' + upS.error.message);
        else cambios += subGuardar.length;
      }
      if (subBorrar.length){
        var delS = await sb.from('eva_subtemas').delete().in('id', subBorrar);
        if (delS.error) errores.push('eva_subtemas (borrar): ' + delS.error.message);
        else cambios += subBorrar.length;
      }

      // --- artefactos: son texto suelto ---
      var artAhora = (datos.artefactos || []).slice().sort().join('|');
      if (artAhora !== this.foto.__artefactos){
        var antesArt = (this.foto.__artefactos || '').split('|').filter(Boolean);
        var ahoraArt = (datos.artefactos || []);
        var nuevos = ahoraArt.filter(function(a){ return antesArt.indexOf(a) < 0; });
        var quitados = antesArt.filter(function(a){ return ahoraArt.indexOf(a) < 0; });
        if (nuevos.length){
          var upA = await sb.from('eva_artefactos')
            .upsert(nuevos.map(function(n){ return { nombre:n }; }), { onConflict:'nombre' });
          if (upA.error) errores.push('eva_artefactos (guardar): ' + upA.error.message);
          else cambios += nuevos.length;
        }
        if (quitados.length){
          var delA = await sb.from('eva_artefactos').delete().in('nombre', quitados);
          if (delA.error) errores.push('eva_artefactos (borrar): ' + delA.error.message);
          else cambios += quitados.length;
        }
      }

      if (errores.length){
        // NO se actualiza la foto: en el siguiente intento se
        // vuelve a mandar lo que no se pudo guardar
        console.error('Fallas al sincronizar:', errores);
        this.avisar('error', errores.join('\n'));
      } else {
        this.foto = this.tomarFoto(datos);
        this.avisar(cambios ? 'guardado' : 'sin-cambios', cambios);
        if (cambios) console.log('Sincronizados ' + cambios + ' registros');
      }

    } catch(e){
      console.error('Error de red al sincronizar:', e);
      this.avisar('error', 'Sin conexion con la base de datos');
    } finally {
      this.sincronizando = false;
      // si mientras tanto hubo mas cambios, se vuelve a correr
      if (this.hayCambiosNuevos){
        var self = this;
        setTimeout(function(){ self.sincronizar(); }, 200);
      }
    }
  },

  // ----------------------------------------------------------
  //  Fuerza el guardado ya (para el boton "Guardar ahora"
  //  o antes de cerrar la pestana)
  // ----------------------------------------------------------
  guardarYa: async function(){
    if (this.pendiente) clearTimeout(this.pendiente);
    await this.sincronizar();
  },

  // ----------------------------------------------------------
  //  Hay algo sin guardar?
  // ----------------------------------------------------------
  hayPendientes: function(){
    return !!this.pendiente || this.sincronizando || this.hayCambiosNuevos;
  }
};


// Aviso al cerrar la pestana si quedo algo sin mandar
window.addEventListener('beforeunload', function(e){
  if (EvaSync.hayPendientes()){
    e.preventDefault();
    e.returnValue = '';
  }
});
