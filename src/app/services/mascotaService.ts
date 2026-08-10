/**
 * mascotaService.ts — Gestión de Mascotas
 * Fuente de datos: exclusivamente Firebase Firestore.
 */
import {
  collection, doc, getDoc, getDocs, addDoc, updateDoc,
  query, where, serverTimestamp, Timestamp,
} from "firebase/firestore";
import { db } from "../firebase/config";
import { Pet, PetFormData, FormValidationResult } from "../types";
import { audit } from "./auditoriaService";
import {
  commitInChunks,
  opsCascadaSoftMascota,
  opsCascadaFisicaMascota,
  contarDependenciasMascota,
} from "./cascadeHelpers";

export { contarDependenciasMascota };

const COL = "mascotas";

function toPet(id: string, data: Record<string, any>): Pet {
  return {
    id,
    name: data.name ?? "",
    breedId: data.breedId ?? "",
    sex: data.sex ?? "Desconocido",
    birthDate: (data.birthDate as Timestamp)?.toDate(),
    color: data.color,
    observations: data.observations,
    imageUrl: data.imageUrl,
    clientId: data.clientId ?? "",
    deceased: data.deceased ?? false,
    deceasedDate: (data.deceasedDate as Timestamp)?.toDate(),
    deceasedReason: data.deceasedReason,
    deceasedNotes: data.deceasedNotes,
    ownershipHistory: data.ownershipHistory ?? [],
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
  if (!db) throw new Error(`[mascotaService] Firebase no configurado. Operación: ${op}`);
}

export function validarDatos(data: PetFormData): FormValidationResult {
  const errors = [];
  if (!data.name?.trim()) errors.push({ field: "name", message: "El nombre de la mascota es obligatorio." });
  if (!data.clientId?.trim()) errors.push({ field: "clientId", message: "Debe asociar la mascota a un cliente." });
  if (!data.sex) errors.push({ field: "sex", message: "El sexo es obligatorio." });
  return { valid: errors.length === 0, errors };
}

export async function ValidarUnicidadMascota(name: string, clientId: string, excludeId?: string): Promise<boolean> {
  requireDb("ValidarUnicidadMascota");
  const snap = await getDocs(query(collection(db!, COL), where("name", "==", name), where("clientId", "==", clientId)));
  return snap.docs.every((d) => d.id === excludeId || d.data().deleted === true);
}

export async function registrarMascota(data: PetFormData, createdBy: string): Promise<Pet> {
  requireDb("registrarMascota");
  const payload = { ...data, deceased: false, deleted: false, createdBy, createdAt: serverTimestamp() };
  const ref = await addDoc(collection(db!, COL), payload);
  await audit({
    action: "CREATE", module: "pets", entityType: "mascota", entityId: ref.id,
    details: `Registró la mascota "${data.name}"`, newValues: { ...data },
  });
  return {
    ...data,
    // `PetFormData.birthDate` es un ISO string (viene del <input type="date">),
    // pero `Pet` la expone como Date.
    birthDate: data.birthDate ? new Date(data.birthDate) : undefined,
    id: ref.id, deceased: false, deleted: false, createdBy, createdAt: new Date(),
  };
}

export async function modificarMascota(id: string, data: Partial<PetFormData>, updatedBy: string): Promise<Pet> {
  requireDb("modificarMascota");
  const ref = doc(db!, COL, id);
  await updateDoc(ref, { ...data, updatedBy, updatedAt: serverTimestamp() });
  const snap = await getDoc(ref);
  const updated = toPet(id, snap.data() as Record<string, any>);
  await audit({
    action: "UPDATE", module: "pets", entityType: "mascota", entityId: id,
    details: `Modificó la mascota "${updated.name}"`, newValues: { ...data },
  });
  return updated;
}

export async function marcarFallecida(id: string, reason: string, notes: string, updatedBy: string): Promise<Pet> {
  requireDb("marcarFallecida");
  await updateDoc(doc(db!, COL, id), {
    deceased: true, deceasedDate: serverTimestamp(),
    deceasedReason: reason, deceasedNotes: notes, updatedBy, updatedAt: serverTimestamp(),
  });
  const snap = await getDoc(doc(db!, COL, id));
  const updated = toPet(id, snap.data() as Record<string, any>);
  await audit({
    action: "UPDATE", module: "pets", entityType: "mascota", entityId: id,
    details: `Marcó como fallecida la mascota "${updated.name}"`,
    newValues: { deceased: true, deceasedReason: reason },
  });
  return updated;
}

/**
 * Baja lógica (soft-delete) EN CASCADA: marca deleted la mascota y cancela sus
 * turnos vigentes (liberando los slots). Reversible para la mascota.
 */
export async function eliminarMascota(id: string, deletedBy: string): Promise<void> {
  requireDb("eliminarMascota");
  const ops = await opsCascadaSoftMascota(id, deletedBy);
  ops.unshift({
    type: "update",
    ref: doc(db!, COL, id),
    data: { deleted: true, deletedBy, deletedAt: serverTimestamp() },
  });
  await commitInChunks(ops);
  await audit({
    action: "DELETE", module: "pets", entityType: "mascota", entityId: id,
    details: `Dio de baja (lógica) la mascota ${id} y canceló sus turnos vigentes`,
  });
}

/** Reactiva una mascota dada de baja (deshace el soft-delete). */
export async function reactivarMascota(id: string, updatedBy: string): Promise<void> {
  requireDb("reactivarMascota");
  await updateDoc(doc(db!, COL, id), { deleted: false, updatedBy, updatedAt: serverTimestamp() });
  await audit({
    action: "UPDATE", module: "pets", entityType: "mascota", entityId: id,
    details: `Reactivó la mascota ${id}`,
  });
}

/**
 * Borrado FÍSICO EN CASCADA: elimina permanentemente la mascota junto con sus
 * historiales, turnos y slots asociados. Irreversible.
 * (El delete de turnos requiere rol admin según firestore.rules.)
 */
export async function eliminarMascotaFisica(id: string): Promise<void> {
  requireDb("eliminarMascotaFisica");
  const ops = await opsCascadaFisicaMascota(id);
  ops.push({ type: "delete", ref: doc(db!, COL, id) });
  await commitInChunks(ops);
  await audit({
    action: "DELETE", module: "pets", entityType: "mascota", entityId: id,
    details: `Eliminó FÍSICAMENTE la mascota ${id} con sus historiales y turnos`,
  });
}

export async function traerMascotas(clientId?: string): Promise<Pet[]> {
  requireDb("traerMascotas");
  // Filtros server-side de igualdad (Firestore los resuelve sin índice compuesto)
  const constraints = [where("deleted", "==", false)];
  if (clientId) constraints.push(where("clientId", "==", clientId));
  const snap = await getDocs(query(collection(db!, COL), ...constraints));
  return snap.docs.map((d) => toPet(d.id, d.data()));
}

export async function traerMascotaPorId(id: string): Promise<Pet | null> {
  requireDb("traerMascotaPorId");
  const snap = await getDoc(doc(db!, COL, id));
  return snap.exists() ? toPet(snap.id, snap.data()) : null;
}
