# Google Calendar sin desconexiones

**Problema:** Google da al navegador permisos de solo 1 hora y el navegador no puede renovarlos solo. Además, la
vinculación se guardaba en un solo navegador. Por eso, al dejar el portal abierto un rato o cambiar de navegador, había
que volver a conectar.

**Solución:** al conectar, Google entrega un permiso **permanente** que esta función guarda en Supabase (nunca en el
navegador). El portal le pide aquí un permiso nuevo de 1 hora por su cuenta, sin ventanas, 5 minutos antes de que venza,
y en cualquier navegador donde entres con tu usuario y código.

```
Portal  →  función «google-auth» (guarda el permiso permanente)  →  Google
```

Hasta que completes estos pasos, el portal sigue funcionando exactamente como antes.

## 1. Crear la tabla (Supabase → SQL Editor → New query → Run)

```sql
create table if not exists public.google_tokens (
  who           text primary key,          -- id del usuario del portal (o cli:cliente:contacto)
  refresh_token text not null,             -- permiso permanente de Google
  email         text,
  scope         text,
  updated_at    timestamptz default now()
);
-- Nadie la puede leer desde el navegador: solo la función (con la llave de servicio).
alter table public.google_tokens enable row level security;
revoke all on public.google_tokens from anon, authenticated;
```

Es una tabla **nueva**: no toca ninguna de las existentes.

## 2. Secreto de Google (Google Cloud Console)
1. **console.cloud.google.com → APIs y servicios → Credenciales**.
2. Abre el cliente OAuth `750897224529-ubbga1c9…` (el mismo que ya usa el portal).
3. Copia el **Secreto del cliente** (Client secret). Si no aparece, usa «Agregar secreto».

## 3. Publicar la función (Supabase → Edge Functions)
1. **Deploy a new function → Via Editor**, nombre **`google-auth`** (exactamente así).
2. Pega **todo** el contenido de `supabase/functions/google-auth/index.ts` y presiona **Deploy**.
3. **Edge Functions → Secrets → Add**:
   - `GOOGLE_CLIENT_SECRET` = el secreto del paso 2
4. Deja activado «Verify JWT» (viene así por defecto).

No hace falta poner `SUPABASE_URL` ni `SUPABASE_SERVICE_ROLE_KEY`: Supabase los da solo.

## 4. ⚠️ Publicar la app de Google («En producción»)
Si en **Google Cloud → Pantalla de consentimiento de OAuth** el estado dice **«Prueba» (Testing)**, Google borra los
permisos permanentes **cada 7 días** y habría que reconectar una vez por semana. Para que no venzan:
- Presiona **«Publicar app»** para pasarla a **«En producción»**.
- Como el portal pide acceso al calendario, Google mostrará la advertencia «Google no verificó esta app» al conectar.
  Se presiona **Configuración avanzada → Ir a…** y listo. Funciona igual con hasta 100 usuarios sin verificar.

## 5. Probar
1. Sube los cambios a GitHub (el portal publicado necesita la versión `20261027a`).
2. **Cada persona: Salir y volver a entrar con su código, una sola vez.** Así su navegador recibe el «pase» con el que
   pide los permisos.
3. En Agenda: **Desconectar** y **Conectar Google Calendar** una vez, para que el permiso permanente quede guardado en el
   servidor.
4. Listo. Abre el portal en otro navegador y entra con tu código: Google aparece conectado solo, sin ventanas.

## Cómo funciona por dentro
- Al entrar con usuario y código, la función comprueba el código y le da a ese navegador un **pase firmado** que dura
  30 días. **Salir** lo borra.
- **Conectar** abre la ventana de Google una sola vez y la función guarda el permiso permanente en `google_tokens`.
- Cada minuto, el portal revisa si al permiso le faltan menos de 5 minutos y pide uno nuevo con el pase. Es una llamada
  invisible.
- **Desconectar** quita el vínculo en todos los navegadores y se lo revoca a Google.
- Si Google retira el permiso (desde myaccount.google.com, por un cambio de contraseña, etc.), el portal muestra
  «Reconectar».

## Seguridad
El pase se da solo a quien escribe el código correcto, y la función lo comprueba en el servidor. Pero mientras los
códigos del personal se sigan descargando en el navegador (el problema de seguridad pendiente), alguien con malas
intenciones podría leerlos y pedir un pase. Al resolver esa tarea, esta función queda protegida sin cambios.
