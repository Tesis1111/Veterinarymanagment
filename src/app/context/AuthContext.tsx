import {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from "react";
import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile,
  setPersistence,
  browserSessionPersistence,
  type User as FirebaseUser,
} from "firebase/auth";
import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
} from "firebase/firestore";
import { auth, db, FIREBASE_CONFIGURED } from "../firebase/config";
import { User, PermissionName } from "../types";
import { setAuditActor, audit, type AuditActor } from "../services/auditoriaService";
import { logger } from "../utils/logger";

// Construye el actor de auditoría a partir del usuario de la app.
function toAuditActor(u: User): AuditActor {
  return { id: u.id, fullName: u.fullName, role: u.roleName ?? u.roleId ?? "" };
}

// ─────────────────────────────────────────────────────────────────────────────
// Default permissions per role — single source of truth
// ─────────────────────────────────────────────────────────────────────────────
export const ROLE_PERMISSIONS: Record<string, PermissionName[]> = {
  admin: [
    "view_clients", "manage_clients",
    "view_pets", "manage_pets",
    "view_medical_history", "manage_medical_history", "delete_medical_history",
    "view_appointments", "manage_appointments",
    "view_users", "manage_users", "manage_roles",
    "view_audit", "manage_system_config", "manage_services",
  ],
  veterinario: [
    "view_clients", "manage_clients",
    "view_pets", "manage_pets",
    "view_medical_history", "manage_medical_history",
    "view_appointments", "manage_appointments",
  ],
  recepcionista: [
    "view_clients", "manage_clients",
    "view_pets", "manage_pets",
    "view_medical_history",
    "view_appointments", "manage_appointments",
  ],
  peluquero: [
    "view_clients",
    "view_pets",
    "view_appointments", "manage_appointments",
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// OWNER_EMAIL — dueño del sistema (bootstrap del primer administrador)
// La primera vez que este email inicia sesión y todavía no tiene documento en
// /usuarios, se auto-provisiona como admin. La MISMA condición está replicada en
// firestore.rules (match /usuarios), por eso la escritura está permitida.
// ⚠️ Si cambiás este valor, actualizá también firestore.rules.
// ─────────────────────────────────────────────────────────────────────────────
export const OWNER_EMAIL = "mateob7505@gmail.com";

// ─────────────────────────────────────────────────────────────────────────────
// Context interface
// ─────────────────────────────────────────────────────────────────────────────
interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  updateUser: (updates: Partial<User>) => Promise<void>;
  hasPermission: (permission: PermissionName) => boolean;
  isAdmin: boolean;
  isVeterinario: boolean;
  isRecepcionista: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// ─────────────────────────────────────────────────────────────────────────────
// Firestore helper — build app User from a Firebase Auth user
// ─────────────────────────────────────────────────────────────────────────────
async function loadUserFromFirestore(fbUser: FirebaseUser): Promise<User | null> {
  if (!db) return null;
  try {
    const snap = await getDoc(doc(db, "usuarios", fbUser.uid));
    if (!snap.exists()) {
      // Document missing: user exists in Auth but not in Firestore.
      // This can happen if the admin was created directly via Firebase Console.
      // Return a minimal profile so the session doesn't break; admin should
      // run bootstrapFirstAdmin() to create the Firestore document.
      return null;
    }

    const data = snap.data();
    const roleName = (data.roleName ?? data.roleId ?? "recepcionista") as User["roleName"];

    return {
      id: fbUser.uid,
      username: data.username ?? fbUser.email ?? fbUser.uid,
      email: fbUser.email ?? data.email ?? "",
      fullName: data.fullName ?? fbUser.displayName ?? "",
      roleId: data.roleId ?? roleName ?? "",
      roleName,
      permissions: (data.permissions as PermissionName[]) ?? ROLE_PERMISSIONS[roleName ?? "recepcionista"] ?? [],
      phone: data.phone,
      active: data.active !== false,
      createdAt: data.createdAt?.toDate() ?? new Date(),
      updatedAt: data.updatedAt?.toDate(),
      lastLogin: new Date(),
    };
  } catch (err) {
    // La UI muestra un mensaje genérico; en dev queda visible la causa real
    // (p. ej. permission-denied si las reglas no están publicadas).
    logger.warn("[AuthContext] loadUserFromFirestore falló:", err);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Provider
// ─────────────────────────────────────────────────────────────────────────────
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // ── Subscribe to Firebase Auth state ───────────────────────────────────────
  useEffect(() => {
    if (!FIREBASE_CONFIGURED || !auth) {
      // Firebase not configured: no session, show login immediately.
      setLoading(false);
      return;
    }

    // La guarda de arriba ya descartó `null`, pero el estrechamiento no
    // sobrevive al closure asíncrono: se captura en una constante local.
    const firebaseAuth = auth;

    const unsubscribe = onAuthStateChanged(firebaseAuth, async (fbUser) => {
      if (fbUser) {
        const appUser = await loadUserFromFirestore(fbUser);
        if (appUser && appUser.active) {
          setUser(appUser);
          setAuditActor(toAuditActor(appUser));
        } else {
          // User exists in Auth but is inactive or has no Firestore doc.
          await signOut(firebaseAuth);
          setUser(null);
          setAuditActor(null);
        }
      } else {
        setUser(null);
        setAuditActor(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // ── login ───────────────────────────────────────────────────────────────────
  const login = async (email: string, password: string): Promise<boolean> => {
    if (!FIREBASE_CONFIGURED || !auth) {
      // Firebase not configured — cannot authenticate.
      // Do NOT fall back to hardcoded credentials in production.
      console.warn(
        "[AuthContext] Firebase is not configured. " +
        "Set the VITE_FIREBASE_* environment variables to enable login."
      );
      return false;
    }

    try {
      // Persistencia de SESIÓN: la sesión se descarta al cerrar la pestaña/el
      // navegador, obligando a iniciar sesión de nuevo. Un refresh de la misma
      // pestaña la mantiene (sessionStorage sobrevive al recargar, no al cerrar).
      await setPersistence(auth, browserSessionPersistence);
      const cred = await signInWithEmailAndPassword(auth, email, password);
      let appUser = await loadUserFromFirestore(cred.user);

      if (!appUser) {
        // ── BOOTSTRAP del primer admin ──────────────────────────────────────
        // Auth OK pero no existe documento en /usuarios. Si es el email del dueño
        // (OWNER_EMAIL), se auto-provisiona como admin. La regla de Firestore
        // permite esta escritura solo para ese email verificado por Auth.
        if (db && cred.user.email?.toLowerCase() === OWNER_EMAIL.toLowerCase()) {
          await setDoc(
            doc(db, "usuarios", cred.user.uid),
            {
              uid: cred.user.uid,
              email: cred.user.email,
              username: (cred.user.email ?? "admin").split("@")[0],
              fullName: cred.user.displayName ?? "Administrador",
              roleId: "admin",
              roleName: "admin",
              permissions: ROLE_PERMISSIONS.admin,
              active: true,
              createdAt: serverTimestamp(),
            },
            { merge: true }
          );
          appUser = await loadUserFromFirestore(cred.user);
        }

        if (!appUser) {
          // Sigue sin documento (no es el dueño, o falló el bootstrap).
          await signOut(auth);
          return false;
        }
      }

      if (!appUser.active) {
        await signOut(auth);
        return false;
      }

      // Update lastLogin in Firestore (non-blocking)
      if (db) {
        setDoc(
          doc(db, "usuarios", cred.user.uid),
          { lastLogin: serverTimestamp() },
          { merge: true }
        ).catch(() => { /* ignore */ });
      }

      setUser(appUser);
      const actor = toAuditActor(appUser);
      setAuditActor(actor);
      audit({
        action: "LOGIN",
        module: "security",
        details: `${appUser.email} inició sesión`,
        entityType: "usuario",
        entityId: appUser.id,
        actor,
      });

      return true;
    } catch (err: any) {
      // Firebase auth errors (wrong password, user not found, etc.) are
      // intentionally swallowed here — the UI shows a generic message.
      logger.warn("[AuthContext] login falló:", err?.code || err?.message || err);
      return false;
    }
  };

  // ── logout ──────────────────────────────────────────────────────────────────
  const logout = async () => {
    if (user) {
      await audit({
        action: "LOGOUT",
        module: "security",
        details: `${user.email} cerró sesión`,
        entityType: "usuario",
        entityId: user.id,
        actor: toAuditActor(user),
      });
    }

    if (FIREBASE_CONFIGURED && auth) {
      await signOut(auth);
    }
    setUser(null);
    setAuditActor(null);
  };

  // ── updateUser ──────────────────────────────────────────────────────────────
  const updateUser = async (updates: Partial<User>) => {
    if (!user) return;

    const merged: User = { ...user, ...updates, updatedAt: new Date() };

    if (FIREBASE_CONFIGURED && auth?.currentUser && db) {
      try {
        if (updates.fullName) {
          await updateProfile(auth.currentUser, { displayName: updates.fullName });
        }
        await setDoc(
          doc(db, "usuarios", user.id),
          { fullName: updates.fullName, phone: updates.phone, updatedAt: serverTimestamp() },
          { merge: true }
        );
      } catch { /* best-effort */ }
    }

    setUser(merged);
    setAuditActor(toAuditActor(merged));
    audit({
      action: "UPDATE",
      module: "users",
      details: `Actualizó su propio perfil`,
      entityType: "usuario",
      entityId: user.id,
      oldValues: { fullName: user.fullName, phone: user.phone },
      newValues: { fullName: merged.fullName, phone: merged.phone },
    });
  };

  // ── hasPermission ────────────────────────────────────────────────────────────
  const hasPermission = (permission: PermissionName): boolean => {
    if (!user) return false;
    return (user.permissions ?? []).includes(permission);
  };

  const isAdmin = user?.roleName === "admin";
  const isVeterinario = user?.roleName === "veterinario";
  const isRecepcionista = user?.roleName === "recepcionista";

  return (
    <AuthContext.Provider value={{
      user,
      loading,
      login,
      logout,
      updateUser,
      hasPermission,
      isAdmin,
      isVeterinario,
      isRecepcionista,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
