/**
 * Limitación de solicitudes persistente, respaldada por Firestore.
 *
 * Reemplaza a los `Map` en memoria que se usaban antes. En Vercel, cada función
 * serverless corre en instancias efímeras y múltiples: un `Map` a nivel de
 * módulo vive por instancia, se pierde en cada arranque en frío y no se ve
 * desde las demás. Un límite de "5 solicitudes cada 5 minutos" implementado así
 * es, en la práctica, "5 por instancia": basta con que Vercel escale a diez
 * instancias para que el techo real sea cincuenta.
 *
 * Al guardar el contador en Firestore, el límite es único y compartido por
 * todas las instancias, y sobrevive a los arranques en frío.
 *
 * La colección /rate_limits está cerrada a cal y canto en firestore.rules
 * (`allow read, write: if false`): solo la alcanza el Admin SDK, que no pasa
 * por las reglas.
 */
import { createHash } from 'node:crypto';
import { FieldValue, type Firestore } from 'firebase-admin/firestore';

const COLLECTION = 'rate_limits';

export interface RateLimitResult {
  /** true si la solicitud está permitida; false si superó el límite. */
  allowed: boolean;
  /** Solicitudes restantes en la ventana actual. */
  remaining: number;
}

/**
 * Consume una unidad del cupo identificado por `scope` + `value`.
 *
 * El identificador se guarda hasheado (SHA-256): así la colección no acumula
 * direcciones IP ni correos en claro, que son datos personales y no hacen
 * ninguna falta para contar.
 *
 * Se resuelve dentro de una transacción para que dos solicitudes simultáneas
 * no puedan leer el mismo contador y escribir ambas el mismo valor incrementado
 * (la condición de carrera clásica que deja pasar el doble del cupo).
 */
export async function consumeRateLimit(
  db: Firestore,
  scope: string,
  value: string,
  max: number,
  windowMs: number
): Promise<RateLimitResult> {
  const id = createHash('sha256').update(`${scope}:${value}`).digest('hex');
  const ref = db.collection(COLLECTION).doc(id);

  try {
    return await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const now = Date.now();
      const data = snap.exists ? snap.data() : null;
      const windowStart: number = data?.windowStart ?? 0;
      const count: number = data?.count ?? 0;

      // Ventana vencida (o primera solicitud): se abre una nueva.
      if (!data || now - windowStart > windowMs) {
        tx.set(ref, {
          scope,
          windowStart: now,
          count: 1,
          // Campo para la política de TTL de Firestore: la consola permite
          // configurar el borrado automático de documentos por este campo, así
          // la colección se poda sola en lugar de crecer sin techo.
          expiresAt: new Date(now + windowMs * 2),
        });
        return { allowed: true, remaining: max - 1 };
      }

      if (count >= max) {
        return { allowed: false, remaining: 0 };
      }

      tx.update(ref, { count: FieldValue.increment(1) });
      return { allowed: true, remaining: max - (count + 1) };
    });
  } catch (err) {
    // Si Firestore no responde, se deja pasar la solicitud. Es una decisión
    // deliberada: un fallo de la base de datos no debe dejar sin recuperar la
    // contraseña a un usuario legítimo. El resto de defensas (App Check, las
    // cuotas propias de Firebase Auth y el aviso al administrador) siguen en pie.
    console.error('[rate-limit] Fallo al consultar el cupo, se permite la solicitud:', err);
    return { allowed: true, remaining: 0 };
  }
}
