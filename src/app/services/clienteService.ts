/**
 * clienteService.ts — Gestión de Clientes
 * Fuente de datos: exclusivamente Firebase Firestore.
 * No hay fallback a localStorage ni datos estáticos.
 */
import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  query,
  where,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import { db } from "../firebase/config";
import { Client, ClientFormData, FormValidationResult } from "../types";
import { audit } from "./auditoriaService";
import {
  commitInChunks,
  opsCascadaSoftCliente,
  opsCascadaFisicaCliente,
  contarDependenciasCliente,
} from "./cascadeHelpers";

export { contarDependenciasCliente };

const COL = "clientes";

function toClient(id: string, data: Record<string, any>): Client {
  return {
    id,
    fullName: data.fullName ?? "",
    dniCuit: data.dniCuit ?? "",
    phone: data.phone ?? "",
    address: data.address,
    email: data.email,
    observations: data.observations,
    createdAt: (data.createdAt as Timestamp)?.toDate() ?? new Date(),
    createdBy: data.createdBy ?? "",
    updatedAt: (data.updatedAt as Timestamp)?.toDate(),
    updatedBy: data.updatedBy,
    deleted: data.deleted ?? false,
    deletedAt: (data.deletedAt as Timestamp)?.toDate(),
    deletedBy: data.deletedBy,
  };
}

function requireDb(op: string) {
  if (!db) throw new Error(`[clienteService] Firebase no configurado. Operación: ${op}`);
}

export function validarDatos(data: ClientFormData): FormValidationResult {
  const errors = [];
  if (!data.fullName?.trim()) errors.push({ field: "fullName", message: "El nombre completo es obligatorio." });
  if (!data.dniCuit?.trim()) {
    errors.push({ field: "dniCuit", message: "El DNI/CUIT es obligatorio." });
  } else if (!/^[\d\-\.]{7,13}$/.test(data.dniCuit.replace(/\s/g, ""))) {
    errors.push({ field: "dniCuit", message: "El DNI/CUIT tiene un formato inválido." });
  }
  if (!data.phone?.trim()) errors.push({ field: "phone", message: "El teléfono es obligatorio." });
  if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
    errors.push({ field: "email", message: "El email no tiene un formato válido." });
  }
  return { valid: errors.length === 0, errors };
}

export async function ValidarUnicidadCliente(dniCuit: string, excludeId?: string): Promise<boolean> {
  requireDb("ValidarUnicidadCliente");
  // Filter client-side to avoid composite index requirement
  const snap = await getDocs(query(collection(db!, COL), where("dniCuit", "==", dniCuit)));
  return snap.docs.every((d) => d.id === excludeId || d.data().deleted === true);
}

export async function registrarCliente(data: ClientFormData, createdBy: string): Promise<Client> {
  requireDb("registrarCliente");
  const payload = { ...data, deleted: false, createdBy, createdAt: serverTimestamp() };
  const ref = await addDoc(collection(db!, COL), payload);
  await audit({
    action: "CREATE", module: "clients", entityType: "cliente", entityId: ref.id,
    details: `Registró al cliente "${data.fullName}"`, newValues: { ...data },
  });
  return { id: ref.id, ...data, deleted: false, createdBy, createdAt: new Date() };
}

export async function asociarCliente(id: string, data: Partial<ClientFormData>, updatedBy: string): Promise<Client> {
  requireDb("asociarCliente");
  const ref = doc(db!, COL, id);
  await updateDoc(ref, { ...data, updatedBy, updatedAt: serverTimestamp() });
  const snap = await getDoc(ref);
  const updated = toClient(id, snap.data() as Record<string, any>);
  await audit({
    action: "UPDATE", module: "clients", entityType: "cliente", entityId: id,
    details: `Modificó al cliente "${updated.fullName}"`, newValues: { ...data },
  });
  return updated;
}

/**
 * Baja lógica (soft-delete) EN CASCADA: marca deleted al cliente y a sus
 * mascotas, y cancela sus turnos vigentes (liberando los slots). Reversible
 * para cliente/mascotas (reactivar); los turnos cancelados no se restauran.
 */
export async function eliminarCliente(id: string, deletedBy: string): Promise<void> {
  requireDb("eliminarCliente");
  const ops = await opsCascadaSoftCliente(id, deletedBy);
  ops.unshift({
    type: "update",
    ref: doc(db!, COL, id),
    data: { deleted: true, deletedBy, deletedAt: serverTimestamp() },
  });
  await commitInChunks(ops);
  await audit({
    action: "DELETE", module: "clients", entityType: "cliente", entityId: id,
    details: `Dio de baja (lógica) al cliente ${id} y sus mascotas/turnos asociados`,
  });
}

/** Reactiva un cliente dado de baja (deshace el soft-delete). */
export async function reactivarCliente(id: string, updatedBy: string): Promise<void> {
  requireDb("reactivarCliente");
  await updateDoc(doc(db!, COL, id), { deleted: false, updatedBy, updatedAt: serverTimestamp() });
  await audit({
    action: "UPDATE", module: "clients", entityType: "cliente", entityId: id,
    details: `Reactivó al cliente ${id}`,
  });
}

/**
 * Borrado FÍSICO EN CASCADA: elimina permanentemente al cliente junto con sus
 * mascotas, historiales, turnos y slots asociados. Irreversible.
 * (El delete de turnos requiere rol admin según firestore.rules.)
 */
export async function eliminarClienteFisico(id: string): Promise<void> {
  requireDb("eliminarClienteFisico");
  const ops = await opsCascadaFisicaCliente(id);
  ops.push({ type: "delete", ref: doc(db!, COL, id) });
  await commitInChunks(ops);
  await audit({
    action: "DELETE", module: "clients", entityType: "cliente", entityId: id,
    details: `Eliminó FÍSICAMENTE al cliente ${id} con sus mascotas, historiales y turnos`,
  });
}

export async function traerClientes(includeDeleted = false): Promise<Client[]> {
  requireDb("traerClientes");
  // Filtro server-side (where de un solo campo, sin índice compuesto)
  const q = includeDeleted
    ? collection(db!, COL)
    : query(collection(db!, COL), where("deleted", "==", false));
  const snap = await getDocs(q);
  return snap.docs.map((d) => toClient(d.id, d.data()));
}

export async function traerClientePorId(id: string): Promise<Client | null> {
  requireDb("traerClientePorId");
  const snap = await getDoc(doc(db!, COL, id));
  return snap.exists() ? toClient(snap.id, snap.data()) : null;
}
