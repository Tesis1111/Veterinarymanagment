# Despliegue

El sistema se despliega en **Vercel**: el frontend como sitio estático y las
funciones de `api/` como funciones serverless. La base de datos y la
autenticación las provee **Firebase**.

Vercel es la única plataforma soportada. Las funciones de `api/` usan el runtime
de Vercel (`@vercel/node`), así que un hosting puramente estático dejaría sin
funcionar el envío de correo y la recuperación de contraseña.

---

## 1. Firebase

Antes del primer despliegue hay que dejar el proyecto de Firebase listo.

**Habilitar los servicios.** En la consola de Firebase: Authentication (con el
proveedor Email/Contraseña) y Cloud Firestore.

**Publicar las reglas y los índices.** Están versionados en el repositorio y son
la frontera de seguridad real del sistema:

```bash
firebase deploy --only firestore:rules,firestore:indexes
```

> Sin los índices de `firestore.indexes.json`, las consultas de historiales y
> turnos fallan en tiempo de ejecución. Firestore devuelve el error con un enlace
> para crear el índice faltante, pero conviene publicarlos de entrada.

**Autorizar el dominio.** En Authentication → Settings → Dominios autorizados,
agregar el dominio de producción. Si falta, `generatePasswordResetLink()` rechaza
las solicitudes de recuperación de contraseña.

---

## 2. Variables de entorno en Vercel

En Settings → Environment Variables, cargar todas las claves de
[`.env.example`](../.env.example) para los entornos Production y Preview.

| Variable | Obligatoria | Para qué |
|---|---|---|
| `VITE_FIREBASE_*` (6 claves) | Sí | Conexión del navegador con Firebase |
| `RESEND_API_KEY` | Sí | Envío de correo |
| `FIREBASE_SERVICE_ACCOUNT_B64` | Sí | Admin SDK en `/api/password-recovery` |
| `EMAIL_FROM` | No | Remitente; el dominio debe estar verificado en Resend |
| `APP_URL` | No | Enlace de regreso tras restablecer la contraseña. Si falta, se deduce del header `Host` |
| `ADMIN_NOTIFICATION_EMAIL` | No | Casilla adicional para los avisos de seguridad |

La service account se carga en base64 porque la clave privada contiene saltos de
línea que los paneles de variables de entorno suelen mutilar:

```bash
base64 -w0 serviceAccountKey.json
```

> El JSON original **nunca** se commitea ni se sube a Vercel: da acceso total al
> proyecto de Firebase. `.gitignore` ya excluye `scripts/serviceAccount*.json`.

---

## 3. Despliegue

Vercel toma la configuración de [`vercel.json`](../vercel.json): build con
`npm run build`, salida en `dist/`, rewrite de SPA para todo lo que no sea
`/api/*`, cabeceras de seguridad y política de caché.

Con el repositorio conectado a Vercel, cada push a la rama principal despliega a
producción y cada rama genera un preview. Para desplegar a mano:

```bash
npm install -g vercel
vercel        # preview
vercel --prod # producción
```

---

## 4. Verificación posterior

- Iniciar sesión y comprobar que los módulos cargan datos.
- Revisar que la consola del navegador no muestre errores de CSP. La política de
  `vercel.json` permite `'self'` más los dominios de Google/Firebase; cualquier
  servicio externo nuevo hay que agregarlo ahí explícitamente.
- Confirmar que `/sw.js` se sirve con `Content-Type: application/javascript`. Si
  devuelve el HTML de `index.html`, el rewrite de SPA se lo está comiendo y el
  service worker no se registra.
- Probar el flujo de recuperación de contraseña de punta a punta: es el único que
  depende del Admin SDK y falla con 500 si `FIREBASE_SERVICE_ACCOUNT_B64` está
  mal cargada.
- Verificar que quedó registro en la colección `auditoria`.

---

## 5. Migraciones

Los cambios de estructura sobre datos ya cargados se hacen con los scripts de
[`scripts/`](../scripts/README.md), que corren localmente contra la service
account. El orden importa: primero las reglas, después la migración, después el
código.
