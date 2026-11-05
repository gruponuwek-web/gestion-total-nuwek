# Puente del portal con Notion (Google Apps Script)

Las citas del portal se copian solas a una tabla de Notion. El navegador nunca ve la llave de Notion: la guarda este
script de Google Apps Script en sus **Propiedades del script**.

```
Portal (navegador)  →  Apps Script «notion-puente» (guarda la llave)  →  API de Notion
```

Reemplaza a la función `supabase/functions/notion` (que necesitaba acceso al proyecto de Supabase). Ya **no** hace falta
publicar `google-auth` para Notion: el script da su propio pase al entrar con usuario y código.

## 1. Notion (una vez)
- Integración creada en **notion.so/my-integrations** → de ahí sale la llave (`ntn_…` o `secret_…`).
  En «Capacidades» deben estar activas **Leer, Actualizar e Insertar contenido**.
- En la tabla de citas: **⋯ → Conexiones → tu integración**.
- Database ID: los 32 caracteres de la URL de la tabla, antes del `?v=`. (También sirve pegar la URL completa.)
- La columna **«ID portal»** (tipo Texto) la crea el script sola si no existe.

## 2. Crear el script (script.google.com, con la cuenta de Google de Nuwek)
1. **Nuevo proyecto** → nómbralo `notion-puente`.
2. Borra el contenido de `Código.gs` y pega **todo** `Code.gs` de esta carpeta. Guarda (Ctrl+S).
3. ⚙️ **Configuración del proyecto**:
   - Activa **«Mostrar el archivo de manifiesto appsscript.json»** y pega el contenido de `appsscript.json`.
   - En **Propiedades del script → Agregar propiedad del script**:
     - `NOTION_TOKEN` = la llave de la integración
     - `NOTION_DB_CITAS` = el Database ID (o la URL de la tabla)
4. Vuelve al editor, elige la función **`probarConexion`** y presiona **▶ Ejecutar**. Acepta los permisos
   («Conectarse a un servicio externo»). En el registro debe decir «Tabla OK» y las columnas que usará el portal.

## 3. Publicar
1. **Implementar → Nueva implementación → ⚙️ Aplicación web**.
   - Ejecutar como: **Yo**
   - Quién tiene acceso: **Cualquier usuario** (sin esto el portal no puede llamarlo; el script igual exige el pase)
2. **Implementar** y copia la **URL de la aplicación web** (termina en `/exec`).
3. Pégala en `js/core/notion.js`, en `const NOTION_URL = '…';`, y sube el cambio a GitHub.

> Si después cambias `Code.gs`: **Implementar → Administrar implementaciones → ✏️ → Versión: Nueva versión → Implementar**.
> Así la URL sigue igual. («Nueva implementación» crearía otra URL.)

## 4. Probar
1. Abre el portal y entra con tu usuario y código. Si ya tenías sesión abierta: **Salir** y volver a entrar una vez
   (así tu navegador recibe su pase).
2. **F12 → Consola** → escribe `notionProbar()` → debe salir la tabla de columnas.
3. A los pocos segundos tus citas aparecen en Notion y en **Citas** se ve **«Notion ✓»**.
   - «Notion: vuelve a entrar» → sal y vuelve a entrar con tu código.
   - «La llave de Notion no es válida» → revisa `NOTION_TOKEN`.
   - «Notion no encuentra la tabla» → revisa `NOTION_DB_CITAS` y la conexión de la tabla con la integración.

## Columnas que se llenan
Se reconocen por nombre (sin importar acentos ni mayúsculas). Las que tu tabla no tenga simplemente se omiten.

| Dato del portal | Nombres de columna que reconoce | Tipos aceptados |
|---|---|---|
| Nombre de la cita | la columna de título (la principal) | título |
| Fecha y hora (con fin) | Fecha, Fecha y hora, Cuándo, Horario | fecha |
| Cliente | Cliente, Empresa, Nombre del cliente | texto, selección |
| Proyecto | Proyecto, Servicio | texto, selección |
| Responsable | Responsable, Asesor, Consultor, Encargado | texto, selección |
| Enlace de Meet | Enlace de Google Meet, Meet, Link Meet, Videollamada | URL, texto |
| Estado | Estado, Estatus, Status | selección, status, texto |
| Lugar | Lugar, Modalidad, Ubicación, Dirección | texto, selección |
| Objetivo | Objetivo, Notas, Descripción, Tema, Motivo | texto |
| Teléfono / correo del cliente | Teléfono, Celular, WhatsApp / Correo, Email | teléfono / email, texto |
| Link para abrir en el portal | Link al portal, Portal | URL |
| Id de la cita | **ID portal** (se crea sola) | texto |

**Estado:** el portal usa Pendiente, Confirmada, Reprogramar, Cancelada y Realizada. Si tu columna ya tiene opciones
parecidas (por ejemplo «Confirmado»), se usan esas. En una columna de tipo *status* de Notion solo se escriben opciones
que ya existan.

## Seguridad
- La llave de Notion vive solo en las propiedades del script. **Nunca** la pegues en archivos del proyecto ni en GitHub.
- Para usar el script hace falta un **pase** firmado que se da solo a quien escribe su usuario y código correctos
  (dura 30 días; «Salir» lo borra; si cambia el código de la persona o se da de baja, deja de servir).
  5 códigos equivocados seguidos bloquean a ese usuario 10 minutos.
- Para invalidar **todos** los pases a la vez: borra la propiedad `PASS_SECRET` (se crea sola otra vez).
- El script solo lee `id`, `password` y `active` de la tabla `personal`, con la misma llave pública que ya usa el portal.
  Mientras los códigos del personal se sigan descargando en el navegador (el problema de seguridad pendiente), alguien
  con malas intenciones podría leerlos y pedir un pase; al resolver esa tarea, el puente queda protegido sin cambios.
- Nunca borra nada en Notion. Una cita cancelada queda con estado «Cancelada».

## Minutas de Notion (AI Meeting Notes) — 2026-10-29
Si la reunión se graba con las **notas de reunión con IA** de Notion (desde Notion Calendar o un bloque de notas de
reunión), el portal liga sola esa nota a la cita:
- Cada 10 min, el navegador del responsable le pide al puente (`action: "minutas"`) las notas de sus citas ya pasadas
  (últimos 7 días). El puente las busca con la API `meeting_notes` (versión `2026-03-11`) y las empareja por el evento
  de Google, por la hora del evento (±15 min) o por la hora de la grabación.
- El portal guarda en la subtarea `notionMinuta` (link, estado, resumen y duración) y lo muestra en la tarjeta de la
  cita y en «📝 Minutas de esta cita» (nunca en el portal de clientes).
- El link llega a la columna **«Minuta»** (URL) de la tabla de citas; se crea sola la primera vez.
- Solo lee: la grabación siempre se inicia en Notion.

**Requisito:** el espacio de Notion donde está la tabla debe tener un plan con **AI Meeting Notes**. Si no lo tiene,
Notion responde «This endpoint requires a plan with AI meeting notes enabled» y el portal deja de preguntar por 6 h
(las citas se siguen copiando normal). Después de cambiar `Code.gs`: Implementar → Administrar implementaciones → ✏️ →
Nueva versión → Implementar (la URL no cambia).

## Cambiar a otra cuenta de Notion (por ejemplo la cuenta Pro) — 2026-11-02
1. En la cuenta nueva: **notion.so/profile/integrations → Nueva integración** (Interna, en el espacio correcto) con
   **Leer, Actualizar e Insertar contenido**. Copia su llave con el botón Copiar.
2. Crea (o elige) una página, por ejemplo «Portal Nuwek», y conéctala a la integración: **⋯ → Conexiones**.
3. En el script, **Propiedades del script**: cambia `NOTION_TOKEN` por la llave nueva, pon `NOTION_PAGINA` = URL de esa
   página y **borra** `NOTION_DB_CITAS`.
4. Ejecuta **`crearTablaCitas`**: crea «Citas · Portal Nuwek» con todas las columnas (Estado como selección con
   Pendiente, Confirmada, Reprogramar, Cancelada y Realizada) y llena `NOTION_DB_CITAS` solo.
5. Ejecuta **`probarConexion`**: debe decir «Tabla OK» y «Notas de reunión con IA: acceso OK».
6. No hay que publicar otra versión ni tocar el portal: cada navegador nota que cambió la tabla (su «huella») y vuelve a
   mandar todas sus citas. Los pases siguen sirviendo.

**Minutas para todos los perfiles:** cada persona del portal liga sola las minutas de sus propias citas. Para que Notion
genere la minuta, la videollamada se graba con las notas de reunión con IA **dentro del mismo espacio de Notion** de la
tabla (la persona debe ser miembro de ese espacio y abrir la reunión desde Notion Calendar o un bloque de notas de reunión).

## Videollamadas de Google Calendar y aviso para grabar — 2026-11-02
- Además de las citas del portal, se mandan a la tabla **todas tus videollamadas**: subtareas del portal con fecha, hora
  y Meet (aunque sean internas) y los **eventos de tu Google Calendar con Meet** creados fuera del portal (los que el
  portal lee al conectar Google en ⏰). Estos últimos llegan con Proyecto «Google Calendar» y su minuta se liga por el id
  del evento; el link queda en la columna «Minuta».
- **Aviso «🎙 ¿Grabar con Notion?»**: de 5 min antes a 20 min después del inicio de cada videollamada, el portal muestra un
  aviso abajo a la izquierda. «Entrar y grabar» abre el Meet y la página de la reunión en la **app de escritorio de
  Notion**; ahí se escribe `/meeting` → **Empezar a transcribir**.
- El aviso propio de Notion Calendar («Unirse y tomar notas») sigue dependiendo de Notion Calendar: app abierta, cuenta de
  Google conectada, notificaciones activas y evento con link de Meet.

## Google Calendar sin desconexiones (mismo puente)

El portal conecta Google Calendar **una sola vez** por persona. El permiso permanente de Google se guarda aquí (propiedad
`GTOKEN:<id>`), nunca en el navegador, y el portal pide un permiso nuevo de 1 h sin ventanas: al recargar, al salir y
volver a entrar con tu código, o desde otra computadora. Solo «Desconectar» lo quita.

Configuración (una vez):
1. Google Cloud Console → APIs y servicios → Credenciales → cliente OAuth `750897224529-ubbga1c9…lcn.apps.googleusercontent.com`
   → copiar **Secreto del cliente**.
2. Apps Script → Configuración del proyecto → Propiedades del script → agregar `GOOGLE_CLIENT_SECRET` = ese secreto.
3. Pantalla de consentimiento OAuth → **Publicar app** (estado «En producción»). En «Prueba», Google vence el permiso
   permanente a los 7 días.
4. Implementar → Administrar implementaciones → ✏️ → Versión: Nueva → Implementar (misma URL).
5. ▶ `probarGoogle` en el editor: debe decir «Secreto del cliente OK».

Acciones: `gtoken` (permiso nuevo de 1 h), `glink` (guarda el permiso permanente con el código de Google, redirect `postmessage`),
`gunlink` (revoca y borra). Todas piden el pase. Sin `GOOGLE_CLIENT_SECRET`, el portal sigue con la conexión de 1 h de antes.
Solo el equipo (portal con código); el portal de clientes sigue con la conexión de 1 h.
