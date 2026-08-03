/**
 * parametrosService.ts — Datos Paramétricos del Sistema
 *
 * Gestiona las colecciones dinámicas administradas por el administrador:
 *   • especies          — Especies de animales
 *   • razas             — Razas vinculadas a una especie
 *   • tiposEvento       — Tipos de evento clínico
 *   • arbolVacunacion   — Vacunas por especie con periodicidad
 *
 * Fuente de datos: exclusivamente Firebase Firestore.
 *
 * IMPORTANTE: Las queries de Firestore usan solo `where("active","==",true)` sin
 * `orderBy` para evitar requerir índices compuestos. El ordenado se hace client-side.
 */

import {
  collection,
  doc,
  getDocs,
  addDoc,
  updateDoc,
  query,
  where,
  onSnapshot,
  serverTimestamp,
  Timestamp,
  type Unsubscribe,
} from "firebase/firestore";
import { db, FIREBASE_CONFIGURED } from "../firebase/config";
import { logger } from "../utils/logger";
import {
  EspecieParametro,
  RazaParametro,
  TipoEvento,
  VacunaParametro,
  ProfesionParametro,
  TipoServicioParametro,
} from "../types";
import { audit } from "./auditoriaService";

/** Auditoría de cambios de parámetros del sistema (best-effort). */
function auditParam(
  action: "CREATE" | "UPDATE" | "DELETE",
  entityType: string,
  entityId: string,
  details: string,
  values?: Record<string, any>
): void {
  audit({ action, module: "system", entityType, entityId, details, newValues: values }).catch(() => {});
}

// ── Firestore ↔ model helpers ─────────────────────────────────────────────────

function ts2date(v: any): Date {
  if (v instanceof Timestamp) return v.toDate();
  if (v instanceof Date) return v;
  return new Date();
}

function toEspecie(id: string, d: any): EspecieParametro {
  return { id, name: d.name ?? "", icon: d.icon, description: d.description, active: d.active !== false, createdAt: ts2date(d.createdAt), updatedAt: d.updatedAt ? ts2date(d.updatedAt) : undefined, createdBy: d.createdBy };
}
function toRaza(id: string, d: any): RazaParametro {
  return { id, especieId: d.especieId ?? "", name: d.name ?? "", description: d.description, active: d.active !== false, createdAt: ts2date(d.createdAt), updatedAt: d.updatedAt ? ts2date(d.updatedAt) : undefined, createdBy: d.createdBy };
}
function toTipo(id: string, d: any): TipoEvento {
  return { id, name: d.name ?? "", color: d.color ?? "bg-gray-100 text-gray-700", requiresVaccineTracking: d.requiresVaccineTracking ?? false, active: d.active !== false, createdAt: ts2date(d.createdAt), updatedAt: d.updatedAt ? ts2date(d.updatedAt) : undefined, createdBy: d.createdBy };
}
function toVacuna(id: string, d: any): VacunaParametro {
  return { id, especieId: d.especieId ?? "", especieName: d.especieName, nombreVacuna: d.nombreVacuna ?? "", dosis: d.dosis ?? 1, periodicidadDias: d.periodicidadDias ?? 365, descripcion: d.descripcion, active: d.active !== false, createdAt: ts2date(d.createdAt), updatedAt: d.updatedAt ? ts2date(d.updatedAt) : undefined, createdBy: d.createdBy };
}
function toTipoServicio(id: string, d: any): TipoServicioParametro {
  return { id, name: d.name ?? "", color: d.color, description: d.description, profesion: d.profesion ?? "", active: d.active !== false, createdAt: ts2date(d.createdAt), updatedAt: d.updatedAt ? ts2date(d.updatedAt) : undefined, createdBy: d.createdBy };
}

// ─────────────────────────────────────────────────────────────────────────────
// onSnapshot exports — para suscripción en tiempo real desde los componentes
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Suscribe en tiempo real a la colección `especies`.
 * Retorna la función de desuscripción (llamar en el cleanup del useEffect).
 * Si Firebase no está configurado, el callback recibe un array vacío.
 */
export function suscribirEspecies(
  callback: (especies: EspecieParametro[]) => void,
  onError?: (err: Error) => void
): Unsubscribe | (() => void) {
  if (FIREBASE_CONFIGURED && db) {
    // Sin orderBy para evitar requerir índice compuesto — ordenamos client-side
    const q = query(collection(db, "especies"), where("active", "==", true));
    return onSnapshot(q, (snap) => {
      const data = snap.docs.map(d => toEspecie(d.id, d.data()));
      data.sort((a, b) => a.name.localeCompare(b.name, "es"));
      callback(data);
    }, (err) => {
      logger.warn("[parametrosService] onSnapshot especies error:", err);
      onError?.(err as Error);
      callback([]);
    });
  }
  // Fallback localStorage
  callback([]);
  return () => {};
}

export function suscribirRazas(
  callback: (razas: RazaParametro[]) => void,
  onError?: (err: Error) => void
): Unsubscribe | (() => void) {
  if (FIREBASE_CONFIGURED && db) {
    const q = query(collection(db, "razas"), where("active", "==", true));
    return onSnapshot(q, (snap) => {
      const data = snap.docs.map(d => toRaza(d.id, d.data()));
      data.sort((a, b) => a.name.localeCompare(b.name, "es"));
      callback(data);
    }, (err) => {
      logger.warn("[parametrosService] onSnapshot razas error:", err);
      onError?.(err as Error);
      callback([]);
    });
  }
  callback([]);
  return () => {};
}

export function suscribirTiposEvento(
  callback: (tipos: TipoEvento[]) => void,
  onError?: (err: Error) => void
): Unsubscribe | (() => void) {
  if (FIREBASE_CONFIGURED && db) {
    const q = query(collection(db, "tiposEvento"), where("active", "==", true));
    return onSnapshot(q, (snap) => {
      const data = snap.docs.map(d => toTipo(d.id, d.data()));
      data.sort((a, b) => a.name.localeCompare(b.name, "es"));
      callback(data);
    }, (err) => {
      logger.warn("[parametrosService] onSnapshot tiposEvento error:", err);
      onError?.(err as Error);
      callback([]);
    });
  }
  callback([]);
  return () => {};
}

export function suscribirVacunas(
  callback: (vacunas: VacunaParametro[]) => void,
  onError?: (err: Error) => void
): Unsubscribe | (() => void) {
  if (FIREBASE_CONFIGURED && db) {
    const q = query(collection(db, "arbolVacunacion"), where("active", "==", true));
    return onSnapshot(q, (snap) => {
      const data = snap.docs.map(d => toVacuna(d.id, d.data()));
      data.sort((a, b) => a.nombreVacuna.localeCompare(b.nombreVacuna, "es"));
      callback(data);
    }, (err) => {
      logger.warn("[parametrosService] onSnapshot vacunas error:", err);
      onError?.(err as Error);
      callback([]);
    });
  }
  callback([]);
  return () => {};
}

// ─────────────────────────────────────────────────────────────────────────────
// One-shot getDocs — para componentes que no necesitan suscripción
// ─────────────────────────────────────────────────────────────────────────────

export async function traerEspecies(): Promise<EspecieParametro[]> {
  if (FIREBASE_CONFIGURED && db) {
    try {
      const snap = await getDocs(query(collection(db, "especies"), where("active", "==", true)));
      const data = snap.docs.map(d => toEspecie(d.id, d.data()));
      return data.sort((a, b) => a.name.localeCompare(b.name, "es"));
    } catch (err) {
      logger.warn("[parametrosService] traerEspecies error:", err);
    }
  }
  return [];
}

export async function traerRazasPorEspecie(especieId: string): Promise<RazaParametro[]> {
  if (FIREBASE_CONFIGURED && db) {
    try {
      const snap = await getDocs(query(collection(db, "razas"), where("especieId", "==", especieId), where("active", "==", true)));
      const data = snap.docs.map(d => toRaza(d.id, d.data()));
      return data.sort((a, b) => a.name.localeCompare(b.name, "es"));
    } catch (err) {
      logger.warn("[parametrosService] traerRazasPorEspecie error:", err);
    }
  }
  return [];
}

export async function traerTodasLasRazas(): Promise<RazaParametro[]> {
  if (FIREBASE_CONFIGURED && db) {
    try {
      const snap = await getDocs(query(collection(db, "razas"), where("active", "==", true)));
      const data = snap.docs.map(d => toRaza(d.id, d.data()));
      return data.sort((a, b) => a.name.localeCompare(b.name, "es"));
    } catch (err) {
      logger.warn("[parametrosService] traerTodasLasRazas error:", err);
    }
  }
  return [];
}

export async function traerTiposEvento(): Promise<TipoEvento[]> {
  if (FIREBASE_CONFIGURED && db) {
    try {
      const snap = await getDocs(query(collection(db, "tiposEvento"), where("active", "==", true)));
      const data = snap.docs.map(d => toTipo(d.id, d.data()));
      return data.sort((a, b) => a.name.localeCompare(b.name, "es"));
    } catch (err) {
      logger.warn("[parametrosService] traerTiposEvento error:", err);
    }
  }
  return [];
}

export async function traerVacunasPorEspecie(especieId: string): Promise<VacunaParametro[]> {
  if (FIREBASE_CONFIGURED && db) {
    try {
      const snap = await getDocs(query(collection(db, "arbolVacunacion"), where("especieId", "==", especieId), where("active", "==", true)));
      const data = snap.docs.map(d => toVacuna(d.id, d.data()));
      return data.sort((a, b) => a.nombreVacuna.localeCompare(b.nombreVacuna, "es"));
    } catch (err) {
      logger.warn("[parametrosService] traerVacunasPorEspecie error:", err);
    }
  }
  return [];
}

export async function traerTodasLasVacunas(): Promise<VacunaParametro[]> {
  if (FIREBASE_CONFIGURED && db) {
    try {
      const snap = await getDocs(query(collection(db, "arbolVacunacion"), where("active", "==", true)));
      const data = snap.docs.map(d => toVacuna(d.id, d.data()));
      return data.sort((a, b) => a.nombreVacuna.localeCompare(b.nombreVacuna, "es"));
    } catch (err) {
      logger.warn("[parametrosService] traerTodasLasVacunas error:", err);
    }
  }
  return [];
}


// ─────────────────────────────────────────────────────────────────────────────
// CRUD — todas las operaciones requieren Firestore configurado
// ─────────────────────────────────────────────────────────────────────────────

function requireDb(op: string) { if (!db) throw new Error(`[parametrosService] Firebase no configurado: ${op}`); }

export async function registrarEspecie(data: Omit<EspecieParametro, "id" | "createdAt">, createdBy: string): Promise<EspecieParametro> {
  requireDb("registrarEspecie");
  // El icono es opcional: se guarda "" si no se eligió ninguno.
  const icon = data.icon ?? "";
  const payload = { ...data, icon, description: data.description ?? "", createdBy, active: true, createdAt: serverTimestamp() };
  const ref = await addDoc(collection(db!, "especies"), payload);
  auditParam("CREATE", "especie", ref.id, `Registró la especie "${data.name}"`, { ...data });
  return { id: ref.id, ...data, icon, active: true, createdAt: new Date(), createdBy };
}
export async function modificarEspecie(id: string, data: Partial<EspecieParametro>): Promise<void> {
  requireDb("modificarEspecie");
  await updateDoc(doc(db!, "especies", id), { ...data, updatedAt: serverTimestamp() });
  auditParam(data.active === false ? "DELETE" : "UPDATE", "especie", id,
    data.active === false ? `Eliminó la especie ${id}` : `Modificó la especie ${id}`, { ...data });
}
export async function eliminarEspecie(id: string): Promise<void> { return modificarEspecie(id, { active: false }); }

export async function registrarRaza(data: Omit<RazaParametro, "id" | "createdAt">, createdBy: string): Promise<RazaParametro> {
  requireDb("registrarRaza");
  const payload = { ...data, description: data.description ?? "", createdBy, active: true, createdAt: serverTimestamp() };
  const ref = await addDoc(collection(db!, "razas"), payload);
  auditParam("CREATE", "raza", ref.id, `Registró la raza "${data.name}"`, { ...data });
  return { id: ref.id, ...data, active: true, createdAt: new Date(), createdBy };
}
export async function modificarRaza(id: string, data: Partial<RazaParametro>): Promise<void> {
  requireDb("modificarRaza");
  await updateDoc(doc(db!, "razas", id), { ...data, updatedAt: serverTimestamp() });
  auditParam(data.active === false ? "DELETE" : "UPDATE", "raza", id,
    data.active === false ? `Eliminó la raza ${id}` : `Modificó la raza ${id}`, { ...data });
}
export async function eliminarRaza(id: string): Promise<void> { return modificarRaza(id, { active: false }); }

export async function registrarTipoEvento(data: Omit<TipoEvento, "id" | "createdAt">, createdBy: string): Promise<TipoEvento> {
  requireDb("registrarTipoEvento");
  const payload = { ...data, createdBy, active: true, createdAt: serverTimestamp() };
  const ref = await addDoc(collection(db!, "tiposEvento"), payload);
  auditParam("CREATE", "tipoEvento", ref.id, `Registró el tipo de evento "${data.name}"`, { ...data });
  return { id: ref.id, ...data, active: true, createdAt: new Date(), createdBy };
}
export async function modificarTipoEvento(id: string, data: Partial<TipoEvento>): Promise<void> {
  requireDb("modificarTipoEvento");
  await updateDoc(doc(db!, "tiposEvento", id), { ...data, updatedAt: serverTimestamp() });
  auditParam(data.active === false ? "DELETE" : "UPDATE", "tipoEvento", id,
    data.active === false ? `Eliminó el tipo de evento ${id}` : `Modificó el tipo de evento ${id}`, { ...data });
}
export async function eliminarTipoEvento(id: string): Promise<void> { return modificarTipoEvento(id, { active: false }); }

export async function registrarVacuna(data: Omit<VacunaParametro, "id" | "createdAt">, createdBy: string): Promise<VacunaParametro> {
  requireDb("registrarVacuna");
  const payload = { ...data, descripcion: data.descripcion ?? "", createdBy, active: true, createdAt: serverTimestamp() };
  const ref = await addDoc(collection(db!, "arbolVacunacion"), payload);
  auditParam("CREATE", "vacuna", ref.id, `Registró la vacuna "${data.nombreVacuna}"`, { ...data });
  return { id: ref.id, ...data, active: true, createdAt: new Date(), createdBy };
}
export async function modificarVacuna(id: string, data: Partial<VacunaParametro>): Promise<void> {
  requireDb("modificarVacuna");
  await updateDoc(doc(db!, "arbolVacunacion", id), { ...data, updatedAt: serverTimestamp() });
  auditParam(data.active === false ? "DELETE" : "UPDATE", "vacuna", id,
    data.active === false ? `Eliminó la vacuna ${id}` : `Modificó la vacuna ${id}`, { ...data });
}
export async function eliminarVacuna(id: string): Promise<void> { return modificarVacuna(id, { active: false }); }

// ─────────────────────────────────────────────────────────────────────────────
// PROFESIONES — nueva categoría paramétrica
// ─────────────────────────────────────────────────────────────────────────────

function toProfesion(id: string, d: any): ProfesionParametro {
  return {
    id,
    name: d.name ?? "",
    description: d.description,
    active: d.active !== false,
    createdAt: ts2date(d.createdAt),
    updatedAt: d.updatedAt ? ts2date(d.updatedAt) : undefined,
    createdBy: d.createdBy,
  };
}

export function suscribirProfesiones(
  callback: (items: ProfesionParametro[]) => void,
  onError?: (err: Error) => void
): Unsubscribe | (() => void) {
  if (FIREBASE_CONFIGURED && db) {
    const q = query(collection(db, "profesiones"), where("active", "==", true));
    return onSnapshot(q, (snap) => {
      const data = snap.docs.map(d => toProfesion(d.id, d.data()));
      data.sort((a, b) => a.name.localeCompare(b.name, "es"));
      callback(data);
    }, (err) => {
      logger.warn("[parametrosService] onSnapshot profesiones error:", err);
      onError?.(err as Error);
      callback([]);
    });
  }
  callback([]);
  return () => {};
}

export async function traerProfesiones(): Promise<ProfesionParametro[]> {
  if (!db) return [];
  try {
    const snap = await getDocs(query(collection(db, "profesiones"), where("active", "==", true)));
    return snap.docs.map(d => toProfesion(d.id, d.data()))
      .sort((a, b) => a.name.localeCompare(b.name, "es"));
  } catch (err) {
    console.error("[parametrosService] traerProfesiones error:", err);
    return [];
  }
}

export async function registrarProfesion(
  data: Omit<ProfesionParametro, "id" | "createdAt">,
  createdBy: string
): Promise<ProfesionParametro> {
  requireDb("registrarProfesion");
  const payload = { ...data, description: data.description ?? "", createdBy, active: true, createdAt: serverTimestamp() };
  const ref = await addDoc(collection(db!, "profesiones"), payload);
  auditParam("CREATE", "profesion", ref.id, `Registró la profesión "${data.name}"`, { ...data });
  return { id: ref.id, ...data, active: true, createdAt: new Date(), createdBy };
}

export async function modificarProfesion(id: string, data: Partial<ProfesionParametro>): Promise<void> {
  requireDb("modificarProfesion");
  await updateDoc(doc(db!, "profesiones", id), { ...data, updatedAt: serverTimestamp() });
  auditParam(data.active === false ? "DELETE" : "UPDATE", "profesion", id,
    data.active === false ? `Eliminó la profesión ${id}` : `Modificó la profesión ${id}`, { ...data });
}

export async function eliminarProfesion(id: string): Promise<void> {
  return modificarProfesion(id, { active: false });
}

// ─────────────────────────────────────────────────────────────────────────────
// TIPOS DE SERVICIO — nueva categoría paramétrica
// ─────────────────────────────────────────────────────────────────────────────

export function suscribirTiposServicio(
  callback: (items: TipoServicioParametro[]) => void,
  onError?: (err: Error) => void
): Unsubscribe | (() => void) {
  if (FIREBASE_CONFIGURED && db) {
    const q = query(collection(db, "tiposServicio"), where("active", "==", true));
    return onSnapshot(q, (snap) => {
      const data = snap.docs.map(d => toTipoServicio(d.id, d.data()));
      data.sort((a, b) => a.name.localeCompare(b.name, "es"));
      callback(data);
    }, (err) => {
      logger.warn("[parametrosService] onSnapshot tiposServicio error:", err);
      onError?.(err as Error);
      callback([]);
    });
  }
  callback([]);
  return () => {};
}

/**
 * Suscribe a TODOS los tipos de servicio, incluidos los inactivos (dados de baja).
 * Se usa solo para resolución de nombres (ej. gráficos históricos): un turno puede
 * referenciar un tipo de servicio que luego fue desactivado, y no debe mostrarse el
 * ID crudo. Para selectores de alta usar `suscribirTiposServicio` (solo activos).
 */
export function suscribirTodosTiposServicio(
  callback: (items: TipoServicioParametro[]) => void,
  onError?: (err: Error) => void
): Unsubscribe | (() => void) {
  if (FIREBASE_CONFIGURED && db) {
    return onSnapshot(collection(db, "tiposServicio"), (snap) => {
      const data = snap.docs.map(d => toTipoServicio(d.id, d.data()));
      data.sort((a, b) => a.name.localeCompare(b.name, "es"));
      callback(data);
    }, (err) => {
      logger.warn("[parametrosService] onSnapshot todos tiposServicio error:", err);
      onError?.(err as Error);
      callback([]);
    });
  }
  callback([]);
  return () => {};
}

export async function traerTiposServicio(): Promise<TipoServicioParametro[]> {
  if (!db) return [];
  try {
    const snap = await getDocs(query(collection(db, "tiposServicio"), where("active", "==", true)));
    return snap.docs.map(d => toTipoServicio(d.id, d.data()))
      .sort((a, b) => a.name.localeCompare(b.name, "es"));
  } catch (err) {
    console.error("[parametrosService] traerTiposServicio error:", err);
    return [];
  }
}

export async function registrarTipoServicio(
  data: Omit<TipoServicioParametro, "id" | "createdAt">,
  createdBy: string
): Promise<TipoServicioParametro> {
  requireDb("registrarTipoServicio");
  const payload = { ...data, description: data.description ?? "", createdBy, active: true, createdAt: serverTimestamp() };
  const ref = await addDoc(collection(db!, "tiposServicio"), payload);
  auditParam("CREATE", "tipoServicio", ref.id, `Registró el tipo de servicio "${data.name}"`, { ...data });
  return { id: ref.id, ...data, active: true, createdAt: new Date(), createdBy };
}

export async function modificarTipoServicio(id: string, data: Partial<TipoServicioParametro>): Promise<void> {
  requireDb("modificarTipoServicio");
  await updateDoc(doc(db!, "tiposServicio", id), { ...data, updatedAt: serverTimestamp() });
  auditParam(data.active === false ? "DELETE" : "UPDATE", "tipoServicio", id,
    data.active === false ? `Eliminó el tipo de servicio ${id}` : `Modificó el tipo de servicio ${id}`, { ...data });
}

export async function eliminarTipoServicio(id: string): Promise<void> {
  return modificarTipoServicio(id, { active: false });
}

