/**
 * Firebase Admin SDK — inicialización única para las funciones serverless.
 *
 * ¿Por qué el Admin SDK y no el cliente web?
 * La recuperación de contraseña es el ÚNICO flujo que se ejecuta sin sesión:
 * quien olvidó su contraseña no está autenticado. Con el SDK web eso significa
 * `request.auth == null` y, por lo tanto, escritura denegada en /auditoria y
 * /email_logs por las reglas de seguridad (que exigen `userId == request.auth.uid`).
 *
 * El Admin SDK opera con una service account y NO pasa por las reglas de
 * Firestore, así que puede dejar el rastro de auditoría sin que haya que
 * aflojar ni una regla. Las reglas siguen siendo tan estrictas como antes.
 *
 * Configuración (Vercel → Settings → Environment Variables):
 *   FIREBASE_SERVICE_ACCOUNT_B64  service account JSON codificado en base64
 *     Consola Firebase → Configuración del proyecto → Cuentas de servicio →
 *     Generar nueva clave privada, y después:
 *       base64 -w0 serviceAccountKey.json
 *
 * Se usa base64 y no el JSON crudo porque la clave privada contiene saltos de
 * línea (`\n`) que los paneles de variables de entorno suelen mutilar.
 */
import { initializeApp, getApps, cert, type App } from 'firebase-admin/app';
import { getAuth, type Auth } from 'firebase-admin/auth';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';

let cachedApp: App | null = null;

/**
 * Devuelve la app de Admin ya inicializada, creándola en el primer uso.
 *
 * La inicialización es perezosa (no a nivel de módulo) para que la falta de
 * credenciales se manifieste como un error controlado dentro del handler —con
 * su log y su respuesta— y no como un crash en el arranque de la función, que
 * en Vercel se ve como un 500 opaco sin rastro útil.
 */
function getAdminApp(): App {
  if (cachedApp) return cachedApp;

  const existing = getApps();
  if (existing.length > 0) {
    cachedApp = existing[0];
    return cachedApp;
  }

  const b64 = process.env.FIREBASE_SERVICE_ACCOUNT_B64;
  if (!b64) {
    throw new Error(
      'Falta la variable de entorno FIREBASE_SERVICE_ACCOUNT_B64. ' +
      'Sin ella no se puede auditar ni generar enlaces de recuperación.'
    );
  }

  let serviceAccount: { project_id?: string; client_email?: string; private_key?: string };
  try {
    serviceAccount = JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
  } catch {
    throw new Error(
      'FIREBASE_SERVICE_ACCOUNT_B64 no contiene un JSON válido en base64.'
    );
  }

  if (!serviceAccount.project_id || !serviceAccount.client_email || !serviceAccount.private_key) {
    throw new Error(
      'La service account de FIREBASE_SERVICE_ACCOUNT_B64 está incompleta ' +
      '(faltan project_id, client_email o private_key).'
    );
  }

  cachedApp = initializeApp({ credential: cert(serviceAccount as any) });
  return cachedApp;
}

export const adminAuth = (): Auth => getAuth(getAdminApp());
export const adminDb = (): Firestore => getFirestore(getAdminApp());

/** True si la service account está configurada (para degradar con elegancia). */
export const ADMIN_CONFIGURED = Boolean(process.env.FIREBASE_SERVICE_ACCOUNT_B64);
