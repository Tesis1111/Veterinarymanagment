/**
 * Módulo Auditoría — Capa de Servicios
 *
 * Gestores implementados:
 *   • Gestor Auditoria — traerAuditoria(), exportarCSV(), registrarAuditoria()
 */
import {
  collection,
  addDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import { auth, db, FIREBASE_CONFIGURED } from "../firebase/config";
import { AuditLog } from "../types";

const COL = "auditoria";
const LS_KEY = "veterinaria_audit_logs";

// ─────────────────────────────────────────────────────────────────────────
// Actor global (usuario autenticado) — permite auditar desde la capa de
// servicios SIN depender de la interfaz de usuario. AuthContext lo mantiene
// sincronizado en cada cambio de sesión.
// ─────────────────────────────────────────────────────────────────────────
export interface AuditActor {
  id: string;
  fullName: string;
  role: string;
}

let currentActor: AuditActor | null = null;

/** Establece el usuario autenticado actual para la auditoría automática. */
export function setAuditActor(actor: AuditActor | null): void {
  currentActor = actor;
}

/** Devuelve el actor de auditoría vigente (o null si no hay sesión). */
export function getAuditActor(): AuditActor | null {
  return currentActor;
}

/** Navegador / dispositivo, si está disponible. */
function getUserAgent(): string | undefined {
  try {
    return typeof navigator !== "undefined" ? navigator.userAgent : undefined;
  } catch {
    return undefined;
  }
}

export interface AuditEntry {
  action: AuditLog["action"];
  module: AuditLog["module"];
  details?: string;
  entityType?: string;
  entityId?: string;
  oldValues?: Record<string, any>;
  newValues?: Record<string, any>;
  /** Actor explícito (login/logout). Si se omite, usa el actor global. */
  actor?: AuditActor | null;
}

/**
 * Punto de entrada de auditoría para la capa de servicios.
 * Registra automáticamente el actor autenticado, navegador e IP.
 * Nunca lanza: la auditoría no debe romper la operación de negocio.
 */
export async function audit(entry: AuditEntry): Promise<void> {
  try {
    const actor = entry.actor ?? currentActor;
    if (!actor) return; // Sin sesión activa no se registra.

    await registrarAuditoria({
      userId: actor.id,
      userName: actor.fullName,
      userRole: actor.role,
      action: entry.action,
      module: entry.module,
      entityType: entry.entityType,
      entityId: entry.entityId,
      oldValues: entry.oldValues,
      newValues: entry.newValues,
      details: entry.details,
      userAgent: getUserAgent(),
    });
  } catch {
    // La auditoría es best-effort; nunca interrumpe el flujo de negocio.
  }
}

// ── Conversion ──────────────────────────────────────────────────────────────

function toLog(id: string, data: Record<string, any>): AuditLog {
  return {
    id,
    userId: data.userId ?? "",
    userName: data.userName ?? "",
    userRole: data.userRole ?? "",
    action: data.action ?? "VIEW",
    module: data.module ?? "system",
    entityType: data.entityType,
    entityId: data.entityId,
    oldValues: data.oldValues,
    newValues: data.newValues,
    details: data.details,
    ipAddress: data.ipAddress ?? "",
    userAgent: data.userAgent,
    sessionId: data.sessionId,
    timestamp: (data.timestamp as Timestamp)?.toDate() ?? new Date(),
  };
}

// ── localStorage fallback ───────────────────────────────────────────────────

function lsLoad(): AuditLog[] {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) || "[]");
  } catch {
    return [];
  }
}

function lsSave(logs: AuditLog[]) {
  localStorage.setItem(LS_KEY, JSON.stringify(logs.slice(0, 1000)));
}

// ─────────────────────────────────────────────────────────────────────────
// Gestor Auditoria
// ─────────────────────────────────────────────────────────────────────────

/** Registra un evento de auditoría en Firestore o localStorage. */
export async function registrarAuditoria(
  log: Omit<AuditLog, "id" | "timestamp">
): Promise<AuditLog> {
  if (FIREBASE_CONFIGURED && db) {
    // Firestore rechaza campos undefined: los eliminamos del payload.
    const clean: Record<string, any> = {};
    for (const [k, v] of Object.entries(log)) {
      if (v !== undefined) clean[k] = v;
    }
    // Las reglas exigen userId == uid autenticado: el payload no puede
    // suplantar a otro usuario aunque el caller pase un id distinto.
    const uid = auth?.currentUser?.uid;
    if (uid) clean.userId = uid;
    const payload = { ...clean, timestamp: serverTimestamp() };
    const ref = await addDoc(collection(db, COL), payload);
    return { id: ref.id, ...log, timestamp: new Date() };
  }

  const newLog: AuditLog = {
    id: Date.now().toString(),
    ...log,
    timestamp: new Date(),
  };
  const existing = lsLoad();
  lsSave([newLog, ...existing]);
  return newLog;
}

/** Recupera los últimos registros de auditoría. */
export async function traerAuditoria(maxRecords = 500): Promise<AuditLog[]> {
  if (FIREBASE_CONFIGURED && db) {
    const q = query(
      collection(db, COL),
      orderBy("timestamp", "desc"),
      limit(maxRecords)
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => toLog(d.id, d.data()));
  }

  return lsLoad().slice(0, maxRecords);
}

/**
 * Recupera la página siguiente de registros, más antiguos que `before`.
 *
 * Se pagina por `timestamp` (el mismo campo del orderBy) en vez de arrastrar un
 * DocumentSnapshot, para que el llamador no dependa de tipos de Firestore.
 * Devuelve [] cuando ya no queda nada por traer.
 */
export async function traerAuditoriaAnteriorA(
  before: Date,
  pageSize = 50
): Promise<AuditLog[]> {
  if (FIREBASE_CONFIGURED && db) {
    const q = query(
      collection(db, COL),
      orderBy("timestamp", "desc"),
      startAfter(Timestamp.fromDate(before)),
      limit(pageSize)
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => toLog(d.id, d.data()));
  }

  return lsLoad()
    .filter((l) => new Date(l.timestamp).getTime() < before.getTime())
    .slice(0, pageSize);
}

/** Recupera registros filtrados por módulo. */
export async function traerAuditoriaPorModulo(module: string): Promise<AuditLog[]> {
  if (FIREBASE_CONFIGURED && db) {
    const q = query(
      collection(db, COL),
      where("module", "==", module),
      orderBy("timestamp", "desc"),
      limit(200)
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => toLog(d.id, d.data()));
  }

  return lsLoad().filter((l) => l.module === module);
}

/** Recupera registros de un usuario específico. */
export async function traerAuditoriaPorUsuario(userId: string): Promise<AuditLog[]> {
  if (FIREBASE_CONFIGURED && db) {
    const q = query(
      collection(db, COL),
      where("userId", "==", userId),
      orderBy("timestamp", "desc"),
      limit(200)
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => toLog(d.id, d.data()));
  }

  return lsLoad().filter((l) => l.userId === userId);
}

/** Exporta registros de auditoría como CSV y descarga el archivo. */
export function exportarCSV(logs: AuditLog[], filename = "auditoria.csv"): void {
  const headers = [
    "ID", "Fecha/Hora", "Usuario", "Rol", "Acción", "Módulo", "Detalles", "IP",
  ];

  const rows = logs.map((l) => [
    l.id,
    new Date(l.timestamp).toLocaleString("es-AR"),
    l.userName,
    l.userRole,
    l.action,
    l.module,
    `"${(l.details ?? "").replace(/"/g, '""')}"`,
    l.ipAddress ?? "",
  ]);

  const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
