import type { VercelRequest, VercelResponse } from '@vercel/node';
import { adminAuth, adminDb, ADMIN_CONFIGURED } from './_lib/firebase-admin.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Solo permitir solicitudes POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  if (!ADMIN_CONFIGURED) {
    console.error('Firebase Admin SDK no está configurado.');
    return res.status(500).json({ error: 'Configuración del servidor incompleta (Admin SDK).' });
  }

  try {
    // Autenticar al llamador (debe ser un administrador del sistema)
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No autorizado' });
    }

    const idToken = authHeader.split('Bearer ')[1];
    let decodedToken;
    try {
      decodedToken = await adminAuth().verifyIdToken(idToken);
    } catch (err: any) {
      console.error('Error al verificar el token del administrador:', err);
      return res.status(401).json({ error: 'Token de sesión inválido o expirado' });
    }

    const callerUid = decodedToken.uid;

    // Verificar si el usuario llamador tiene rol de administrador en Firestore
    const callerDoc = await adminDb().collection('usuarios').doc(callerUid).get();
    if (!callerDoc.exists) {
      return res.status(403).json({ error: 'El usuario administrador no existe en la base de datos' });
    }

    const callerData = callerDoc.data();
    const isCallerAdmin = callerData?.roleId === 'admin' || callerData?.permissions?.includes('manage_users');
    if (!isCallerAdmin) {
      return res.status(403).json({ error: 'No tiene permisos de administrador para realizar esta operación' });
    }

    const { targetUid, newPassword } = req.body;
    if (!targetUid || !newPassword) {
      return res.status(400).json({ error: 'Faltan campos obligatorios: targetUid, newPassword' });
    }

    if (typeof newPassword !== 'string' || newPassword.length < 6) {
      return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
    }

    // Actualizar la contraseña del usuario objetivo usando el Admin SDK
    await adminAuth().updateUser(targetUid, { password: newPassword });

    return res.status(200).json({ ok: true, message: 'Contraseña actualizada exitosamente' });
  } catch (err: any) {
    console.error('Error en /api/update-user-password:', err);
    return res.status(500).json({ error: err.message || 'Error interno del servidor' });
  }
}
