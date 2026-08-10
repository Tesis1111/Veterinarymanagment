/**
 * Módulo Atención Clínica — Capa de Servicios
 *
 * Gestores implementados:
 *   • Gestor Alta Historial   — validarTamañoFormato(), registrarHistorial(), guardarArchivo()
 *   • Gestor Listar Historial — traerHistorial(), exportarCSV()
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
import {
  MedicalRecord,
  MedicalRecordFormData,
  MedicalAttachment,
  FormValidationResult,
} from "../types";
import { audit } from "./auditoriaService";

const COL = "historiales";

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/gif", "application/pdf", "text/plain"];
const MAX_FILE_SIZE_MB = 1;

// ── Conversion ──────────────────────────────────────────────────────────────

function toRecord(id: string, data: Record<string, any>): MedicalRecord {
  return {
    id,
    petId: data.petId ?? "",
    professionalId: data.professionalId ?? "",
    serviceId: data.serviceId,
    date: (data.date as Timestamp)?.toDate() ?? new Date(),
    eventType: data.eventType ?? "Consulta",
    description: data.description ?? "",
    weight: data.weight,
    temperature: data.temperature,
    heartRate: data.heartRate,
    respiratoryRate: data.respiratoryRate,
    diagnosis: data.diagnosis,
    treatment: data.treatment,
    medication: data.medication,
    nextAppointmentDate: (data.nextAppointmentDate as Timestamp)?.toDate(),
    notes: data.notes,
    clientIdAtTime: data.clientIdAtTime,
    clientNameAtTime: data.clientNameAtTime,
    createdAt: (data.createdAt as Timestamp)?.toDate() ?? new Date(),
    createdBy: data.createdBy ?? "",
    updatedAt: (data.updatedAt as Timestamp)?.toDate(),
    updatedBy: data.updatedBy,
    deleted: data.deleted ?? false,
    deletedAt: (data.deletedAt as Timestamp)?.toDate(),
    deletedBy: data.deletedBy,
    attachments: data.attachments ?? [],
  };
}

function requireDb(op: string) { if (!db) throw new Error(`[historialService] Firebase no configurado: ${op}`); }

// ─────────────────────────────────────────────────────────────────────────
// Gestor Alta Historial
// ─────────────────────────────────────────────────────────────────────────

/** Valida tipo y tamaño de archivos adjuntos. */
export function validarTamañoFormato(file: File): FormValidationResult {
  const errors = [];

  if (!ALLOWED_TYPES.includes(file.type)) {
    errors.push({
      field: "file",
      message: `Tipo de archivo no permitido: ${file.type}. Permitidos: JPG, PNG, GIF, PDF, TXT.`,
    });
  }
  if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
    errors.push({
      field: "file",
      message: `El archivo supera el límite de ${MAX_FILE_SIZE_MB} MB.`,
    });
  }

  return { valid: errors.length === 0, errors };
}

/** Persiste un nuevo registro de historial clínico. */
export async function registrarHistorial(
  data: MedicalRecordFormData,
  createdBy: string,
  clientIdAtTime?: string,
  clientNameAtTime?: string,
  attachments: MedicalAttachment[] = []
): Promise<MedicalRecord> {
  requireDb("registrarHistorial");
  const payload = {
    ...data,
    date: data.date ? new Date(data.date) : new Date(),
    nextAppointmentDate: data.nextAppointmentDate ? new Date(data.nextAppointmentDate) : undefined,
    clientIdAtTime,
    clientNameAtTime,
    attachments,
    deleted: false,
    createdBy,
    createdAt: serverTimestamp(),
  };

  const ref = await addDoc(collection(db!, COL), payload);
  // El eventType distingue registro de vacuna / peluquería / guardería / consulta.
  await audit({
    action: "CREATE", module: "medical_records", entityType: "historia_clinica", entityId: ref.id,
    details: `Registró "${data.eventType ?? "historia clínica"}" para la mascota ${data.petId}`,
    newValues: { petId: data.petId, eventType: data.eventType, professionalId: data.professionalId },
  });
  return { id: ref.id, ...payload, createdAt: new Date() } as MedicalRecord;
}

/**
 * Guarda un archivo adjunto: lee como base64 y lo almacena en el registro.
 * En producción con Firebase Storage, subiría el archivo y devolvería la URL.
 */
export async function guardarArchivo(
  file: File,
  recordId: string,
  uploadedBy: string
): Promise<MedicalAttachment> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      const attachment: MedicalAttachment = {
        id: Date.now().toString(),
        medicalRecordId: recordId,
        fileName: file.name,
        fileType: file.type,
        fileSize: file.size,
        fileUrl: e.target?.result as string, // base64 DataURL
        uploadedAt: new Date(),
        uploadedBy,
        deleted: false,
      };

      // Patch the record in Firestore with the new attachment
      if (db) {
        const { arrayUnion } = await import("firebase/firestore");
        await updateDoc(doc(db!, COL, recordId), { attachments: arrayUnion(attachment) });
      }

      resolve(attachment);
    };
    reader.onerror = () => reject(new Error("Error al leer el archivo"));
    reader.readAsDataURL(file);
  });
}

// ─────────────────────────────────────────────────────────────────────────
// Gestor Listar Historial
// ─────────────────────────────────────────────────────────────────────────

/** Trae el historial clínico de una mascota, ordenado por fecha descendente. */
export async function traerHistorial(petId: string): Promise<MedicalRecord[]> {
  requireDb("traerHistorial");
  const snap = await getDocs(query(collection(db!, COL), where("petId", "==", petId)));
  return snap.docs.map(d => toRecord(d.id, d.data()))
    .filter(r => !r.deleted)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

/** Trae todos los registros (para reportes/auditoría). */
export async function traerTodosLosHistoriales(): Promise<MedicalRecord[]> {
  requireDb("traerTodosLosHistoriales");
  const snap = await getDocs(collection(db!, COL));
  return snap.docs.map(d => toRecord(d.id, d.data()))
    .filter(r => !r.deleted)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

/** Exporta una lista de registros como CSV y descarga el archivo. */
export function exportarCSV(records: MedicalRecord[], filename = "historial_clinico.csv"): void {
  const headers = [
    "ID", "Mascota", "Fecha", "Tipo de Evento", "Profesional",
    "Peso (kg)", "Temperatura", "Descripción", "Diagnóstico", "Tratamiento",
  ];

  const rows = records.map((r) => [
    r.id,
    r.petId,
    new Date(r.date).toLocaleDateString("es-AR"),
    r.eventType,
    r.professionalId,
    r.weight ?? "",
    r.temperature ?? "",
    `"${(r.description ?? "").replace(/"/g, '""')}"`,
    `"${(r.diagnosis ?? "").replace(/"/g, '""')}"`,
    `"${(r.treatment ?? "").replace(/"/g, '""')}"`,
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

/** Soft-delete de registro. */
export async function eliminarHistorial(id: string, deletedBy: string): Promise<void> {
  requireDb("eliminarHistorial");
  await updateDoc(doc(db!, COL, id), { deleted: true, deletedBy, deletedAt: serverTimestamp() });
  await audit({
    action: "DELETE", module: "medical_records", entityType: "historia_clinica", entityId: id,
    details: `Eliminó la historia clínica ${id}`,
  });
}

export async function traerHistorialPorId(id: string): Promise<MedicalRecord | null> {
  requireDb("traerHistorialPorId");
  const snap = await getDoc(doc(db!, COL, id));
  return snap.exists() ? toRecord(snap.id, snap.data()) : null;
}
