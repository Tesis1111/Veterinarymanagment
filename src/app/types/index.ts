// ============================================
// TIPOS DEL SISTEMA VETERINARIO - VERSIÓN MEJORADA
// ============================================

// ============================================
// MÓDULO DE SEGURIDAD
// ============================================

export interface Role {
  id: string;
  name: 'admin' | 'veterinario' | 'recepcionista' | 'peluquero';
  displayName: string;
  description?: string;
  isSystem: boolean;
  active: boolean;
  createdAt: Date;
  updatedAt?: Date;
}

export interface Permission {
  id: string;
  name: string;
  displayName: string;
  description?: string;
  module: string;
  createdAt: Date;
}

export interface RolePermission {
  id: string;
  roleId: string;
  permissionId: string;
  grantedAt: Date;
}

export interface User {
  id: string;
  username: string;
  password?: string; // No se envía desde backend
  passwordHash?: string; // Solo para backend
  email: string;
  fullName: string;
  roleId: string;
  role?: Role; // Populated cuando se necesita
  // Populated at auth time from Firestore /usuarios/{uid} for fast access
  roleName?: 'admin' | 'veterinario' | 'recepcionista' | 'peluquero';
  permissions?: PermissionName[];
  phone?: string;
  active: boolean;
  // Campos extendidos persistidos en /usuarios (usuarioService)
  uid?: string;
  nombre?: string;
  apellido?: string;
  sexo?: string;
  domicilio?: string;
  profesion?: string;
  passwordResetToken?: string;
  passwordResetExpires?: Date;
  createdAt: Date;
  updatedAt?: Date;
  lastLogin?: Date;
}

// Tipos de permisos disponibles
export type PermissionName =
  | 'view_clients'
  | 'manage_clients'
  | 'view_pets'
  | 'manage_pets'
  | 'view_medical_history'
  | 'manage_medical_history'
  | 'delete_medical_history'
  | 'view_appointments'
  | 'manage_appointments'
  | 'view_users'
  | 'manage_users'
  | 'manage_roles'
  | 'view_audit'
  | 'manage_system_config'
  | 'manage_services';

// ============================================
// MÓDULO DE CLIENTES Y MASCOTAS
// ============================================

export interface Client {
  id: string;
  fullName: string;
  dniCuit: string;
  phone: string;
  address?: string;
  email?: string;
  observations?: string;
  createdAt: Date;
  createdBy: string;
  updatedAt?: Date;
  updatedBy?: string;
  deleted: boolean;
  deletedAt?: Date;
  deletedBy?: string;
}

export interface Species {
  id: string;
  name: string;
  description?: string;
  active: boolean;
  createdAt: Date;
}

export interface Breed {
  id: string;
  speciesId: string;
  species?: Species; // Populated cuando se necesita
  name: string;
  description?: string;
  active: boolean;
  createdAt: Date;
}

export interface PetOwnershipChange {
  id: string;
  petId: string;
  previousClientId: string;
  previousClientName: string;
  newClientId: string;
  newClientName: string;
  changeDate: Date;
  reason?: string;
  notes?: string;
  recordedBy: string;
}

export interface Pet {
  id: string;
  name: string;
  breedId: string;
  breed?: Breed; // Populated cuando se necesita
  sex: 'Macho' | 'Hembra' | 'Desconocido';
  birthDate?: Date;
  color?: string;
  observations?: string;
  imageUrl?: string;
  clientId: string;
  client?: Client; // Populated cuando se necesita

  // Estado de fallecimiento
  deceased: boolean;
  deceasedDate?: Date;
  deceasedReason?: string;
  deceasedNotes?: string;

  // Historial de cambios de dueño
  ownershipHistory?: PetOwnershipChange[];

  createdAt: Date;
  createdBy: string;
  updatedAt?: Date;
  updatedBy?: string;
  deleted: boolean;
  deletedAt?: Date;
  deletedBy?: string;
}

// ============================================
// MÓDULO CLÍNICO
// ============================================

export interface Service {
  id: string;
  name: string;
  description?: string;
  estimatedDuration?: number; // en minutos
  requiresProfessional: boolean;
  serviceType: 'clinic' | 'grooming' | 'daycare' | 'surgery' | 'other';
  active: boolean;
  createdAt: Date;
  updatedAt?: Date;
}

export type MedicalEventType =
  | 'Consulta'
  | 'Vacunación'
  | 'Cirugía'
  | 'Tratamiento'
  | 'Desparasitación'
  | 'Control'
  | 'Emergencia'
  | 'Peluquería'
  | 'Otros';

export interface MedicalRecord {
  id: string;
  petId: string;
  pet?: Pet; // Populated cuando se necesita
  professionalId: string;
  professional?: User; // Populated cuando se necesita
  serviceId?: string;
  service?: Service; // Populated cuando se necesita
  date: Date;
  eventType: MedicalEventType;
  description: string;

  // Datos clínicos
  weight?: number; // ⚠️ PESO AHORA AQUÍ
  temperature?: number;
  heartRate?: number;
  respiratoryRate?: number;

  // Diagnóstico y tratamiento
  diagnosis?: string;
  treatment?: string;
  medication?: string;

  // Seguimiento
  nextAppointmentDate?: Date;
  notes?: string;

  // Dueño vigente al momento del registro (para historial)
  clientIdAtTime?: string;
  clientNameAtTime?: string;

  // Auditoría
  createdAt: Date;
  createdBy: string;
  updatedAt?: Date;
  updatedBy?: string;
  deleted: boolean;
  deletedAt?: Date;
  deletedBy?: string;

  // Relación con archivos
  attachments?: MedicalAttachment[];
}

export interface MedicalAttachment {
  id: string;
  medicalRecordId: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  fileUrl: string;
  uploadedAt: Date;
  uploadedBy: string;
  deleted: boolean;
}

// ============================================
// MÓDULO DE TURNOS
// ============================================

export interface Doctor {
  id: string;
  userId: string;
  user?: User; // Populated cuando se necesita
  name: string;
  /** Profesión (de Parámetros) — describe la actividad; criterio profesional, nunca el Rol. */
  profesion?: string;
  specialty?: string;
  licenseNumber?: string;
  available: boolean;
  createdAt: Date;
  updatedAt?: Date;
  schedules?: DoctorSchedule[];
}

export interface DoctorSchedule {
  id: string;
  doctorId: string;
  dayOfWeek: number; // 0=Domingo, 1=Lunes, ..., 6=Sábado
  startTime: string; // Formato HH:mm
  endTime: string; // Formato HH:mm
  active: boolean;
  createdAt: Date;
  updatedAt?: Date;
}

export type AppointmentStatus =
  | 'Programado'
  | 'Confirmado'
  | 'Completado'
  // El turno venció sin que el cliente se presentara. Cierra el turno igual que
  // 'Completado' (libera el slot, no admite edición) pero deja constancia de la
  // inasistencia en lugar de registrar una atención que no ocurrió.
  | 'No asistió'
  | 'Cancelado';

export interface Appointment {
  id: string;
  clientId: string;
  client?: Client; // Populated cuando se necesita
  petId: string;
  pet?: Pet; // Populated cuando se necesita
  /** @deprecated legado: guardaba el tipo de turno; usar `type` */
  serviceId?: string;
  service?: Service; // Populated cuando se necesita
  doctorId?: string;
  doctor?: Doctor; // Populated cuando se necesita

  // Tipo de turno: 'clinic' | 'grooming' | 'daycare' (o id de tipoServicio)
  type?: string;
  // Motivos de consulta (ids de tiposEvento)
  tiposEvento?: string[];

  // Fecha y hora
  date: Date;
  startTime: string; // Formato HH:mm
  endTime: string; // Formato HH:mm
  // Rango de estadía (solo guardería)
  dateFrom?: Date;
  dateTo?: Date;

  // Estado
  status: AppointmentStatus;
  deleted?: boolean;

  // Información adicional
  reason?: string;
  notes?: string;
  cancellationReason?: string;
  cancelledAt?: Date;

  // Auditoría
  createdAt: Date;
  createdBy: string;
  updatedAt?: Date;
  updatedBy?: string;
}

// ============================================
// MÓDULO DE SISTEMA
// ============================================

export type AuditAction =
  | 'CREATE'
  | 'UPDATE'
  | 'DELETE'
  | 'LOGIN'
  | 'LOGOUT'
  | 'VIEW'
  | 'EXPORT'
  | 'PRINT'
  | 'CONFIG_CHANGE'
  // ── Recuperación de contraseña ──────────────────────────────────────────
  // Las escribe /api/password-recovery con el Admin SDK. No pueden generarse
  // desde el navegador: quien recupera su contraseña no tiene sesión, y las
  // reglas de Firestore exigen `userId == request.auth.uid` para escribir en
  // /auditoria. Por eso, hasta que el flujo pasó al servidor, la recuperación
  // era la única operación del sistema que no dejaba rastro.
  | 'PASSWORD_RESET_REQUEST'   // se procesó una solicitud (haya o no cuenta)
  | 'PASSWORD_RESET_BLOCKED';  // se rechazó por superar el cupo de solicitudes

export type AuditModule =
  | 'clients'
  | 'pets'
  | 'medical_records'
  | 'appointments'
  | 'users'
  | 'roles'
  | 'services'
  | 'security'
  | 'system';

export interface AuditLog {
  id: string;
  userId: string;
  userName: string;
  userRole: string;
  action: AuditAction;
  module: AuditModule;
  entityType?: string;
  entityId?: string;
  oldValues?: Record<string, any>;
  newValues?: Record<string, any>;
  details?: string;
  ipAddress?: string;
  userAgent?: string;
  sessionId?: string;
  timestamp: Date;
}

// ============================================
// PREFERENCIAS DE INTERFAZ (APA)
// ============================================

export interface UIPreferences {
  id: string;
  userId?: string;
  isGlobal: boolean;
  
  // Tipografía
  fontSize: 'small' | 'medium' | 'large' | 'extra-large';
  fontFamily: string;
  lineHeight: 'compact' | 'normal' | 'relaxed' | 'loose';
  letterSpacing: 'tight' | 'normal' | 'wide';
  
  // Contraste y color
  contrastMode: 'normal' | 'high' | 'inverted';
  colorBlindMode: 'none' | 'protanopia' | 'deuteranopia' | 'tritanopia';
  theme: 'light' | 'dark' | 'auto';
  
  // Accesibilidad
  reduceMotion: boolean;
  screenReaderOptimized: boolean;
  focusIndicators: boolean;
  keyboardNavigation: boolean;
  
  // Formato
  textAlignment: 'left' | 'center' | 'right' | 'justify';
  
  // Auditoría
  createdAt: Date;
  updatedAt?: Date;
}

// ============================================
// PREFERENCIAS DEL DASHBOARD
// ============================================

export interface DashboardPreferences {
  showTotalClients: boolean;
  showTotalPets: boolean;
  showTodayAppointments: boolean;
  showUpcomingAppointments: boolean;
  showTodayDetails: boolean;
  showRecentActivity: boolean;
  showQuickActions: boolean;
  showAuditChart?: boolean;
  chartType?: 'bar' | 'line' | 'pie';
  dateRange?: number;
}

// ============================================
// VISTAS Y DATOS DERIVADOS
// ============================================

export interface PetWithFullInfo extends Pet {
  client: Client;
  breed: Breed & {
    species: Species;
  };
  ageYears?: number;
}

export interface AppointmentWithFullInfo extends Appointment {
  client: Client;
  pet: Pet & {
    breed: Breed & {
      species: Species;
    };
  };
  service: Service;
  doctor?: Doctor & {
    user: User;
  };
}

export interface MedicalRecordWithFullInfo extends MedicalRecord {
  pet: Pet & {
    client: Client;
    breed: Breed & {
      species: Species;
    };
  };
  professional: User;
  service?: Service;
  attachments: MedicalAttachment[];
}

// ============================================
// TIPOS PARA FORMULARIOS
// ============================================

export interface ClientFormData {
  fullName: string;
  dniCuit: string;
  phone: string;
  address?: string;
  email?: string;
  observations?: string;
}

export interface PetFormData {
  name: string;
  breedId: string;
  sex: 'Macho' | 'Hembra' | 'Desconocido';
  birthDate?: string; // ISO string
  color?: string;
  observations?: string;
  imageUrl?: string;
  clientId: string;
}

export interface MedicalRecordFormData {
  petId: string;
  professionalId: string;
  serviceId?: string;
  date: string; // ISO string
  eventType: MedicalEventType;
  description: string;
  weight?: number;
  temperature?: number;
  heartRate?: number;
  respiratoryRate?: number;
  diagnosis?: string;
  treatment?: string;
  medication?: string;
  nextAppointmentDate?: string; // ISO string
  notes?: string;
}

export interface AppointmentFormData {
  clientId: string;
  petId: string;
  serviceId: string;
  doctorId?: string;
  date: string; // ISO string (YYYY-MM-DD)
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  status: AppointmentStatus;
  reason?: string;
  notes?: string;
}

export interface UserFormData {
  username: string;
  password?: string;
  email: string;
  fullName: string;
  roleId: string;
  phone?: string;
  active: boolean;
  // ── Datos profesionales (opcionales, independientes del Rol) ──────────────
  // Si `profesion` está definida, el usuario es un profesional y se crea/sincroniza
  // automáticamente su documento en la colección `doctores`. La profesión proviene
  // exclusivamente de Parámetros (colección `profesiones`).
  profesion?: string;
  especialidad?: string;
  matricula?: string;
}

export interface ServiceFormData {
  name: string;
  description?: string;
  estimatedDuration?: number;
  requiresProfessional: boolean;
  serviceType: 'clinic' | 'grooming' | 'daycare' | 'surgery' | 'other';
  active: boolean;
}

// ============================================
// TIPOS PARA RESPUESTAS DE API
// ============================================

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// ============================================
// TIPOS PARA FILTROS Y BÚSQUEDA
// ============================================

export interface ClientFilters {
  search?: string;
  deleted?: boolean;
}

export interface PetFilters {
  clientId?: string;
  speciesId?: string;
  breedId?: string;
  search?: string;
  deleted?: boolean;
}

export interface AppointmentFilters {
  clientId?: string;
  petId?: string;
  doctorId?: string;
  serviceId?: string;
  status?: AppointmentStatus;
  dateFrom?: string;
  dateTo?: string;
}

export interface MedicalRecordFilters {
  petId?: string;
  professionalId?: string;
  eventType?: MedicalEventType;
  dateFrom?: string;
  dateTo?: string;
  deleted?: boolean;
}

export interface AuditLogFilters {
  userId?: string;
  module?: AuditModule;
  action?: AuditAction;
  dateFrom?: string;
  dateTo?: string;
}

// ============================================
// TIPOS PARA VALIDACIONES
// ============================================

export interface ValidationError {
  field: string;
  message: string;
}

export interface FormValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

// ============================================
// TIPOS PARA ESTADÍSTICAS Y REPORTES
// ============================================

export interface DashboardStats {
  totalClients: number;
  totalPets: number;
  todayAppointments: number;
  upcomingAppointments: number;
  recentActivity: AuditLog[];
}

export interface AppointmentStats {
  total: number;
  programados: number;
  confirmados: number;
  completados: number;
  cancelados: number;
  byService: Record<string, number>;
  byDoctor: Record<string, number>;
}

export interface MedicalStats {
  totalRecords: number;
  byEventType: Record<MedicalEventType, number>;
  byProfessional: Record<string, number>;
}

// ============================================
// TIPOS PARA NAVEGACIÓN
// ============================================

export type ModuleType =
  | 'dashboard'
  | 'clients'
  | 'pets'
  | 'medical'
  | 'appointments'
  | 'users'
  | 'audit'
  | 'profile'
  | 'services';

// ============================================
// TIPOS AUXILIARES
// ============================================

export interface TimeSlot {
  startTime: string;
  endTime: string;
  available: boolean;
  appointmentId?: string;
}

export interface DoctorAvailability {
  doctorId: string;
  doctorName: string;
  date: string;
  slots: TimeSlot[];
}

// ============================================
// TIPOS PARA RECUPERACIÓN DE CONTRASEÑA
// ============================================

export interface PasswordResetRequest {
  email: string;
}

export interface PasswordResetConfirm {
  token: string;
  newPassword: string;
}

export interface UsernameRecoveryRequest {
  email: string;
}

// ============================================
// TIPOS PARA NAVEGACIÓN CON ENTER
// ============================================

export interface FormFieldConfig {
  id: string;
  type: 'input' | 'select' | 'textarea' | 'date' | 'time';
  nextFieldId?: string;
  onEnter?: () => void;
}

// ============================================
// MÓDULO DE PARÁMETROS DINÁMICOS
// ============================================

export interface EspecieParametro {
  id: string;
  name: string;
  icon?: string;
  description?: string;
  active: boolean;
  createdAt: Date;
  updatedAt?: Date;
  createdBy?: string;
}

export interface RazaParametro {
  id: string;
  especieId: string;
  name: string;
  description?: string;
  active: boolean;
  createdAt: Date;
  updatedAt?: Date;
  createdBy?: string;
}

export interface TipoEvento {
  id: string;
  name: string;
  color: string;
  requiresVaccineTracking?: boolean;
  active: boolean;
  createdAt: Date;
  updatedAt?: Date;
  createdBy?: string;
}

export interface VacunaParametro {
  id: string;
  especieId: string;
  especieName?: string;
  nombreVacuna: string;
  dosis: number;
  periodicidadDias: number;
  descripcion?: string;
  active: boolean;
  createdAt: Date;
  updatedAt?: Date;
  createdBy?: string;
}

export interface DoctorPerfil {
  id: string;
  userId?: string;
  fullName: string;
  /** Nombre (opcional, separado de apellido). */
  nombre?: string;
  /** Apellido (opcional, separado de nombre). */
  apellido?: string;
  /**
   * Profesión que describe la actividad laboral (Veterinario, Peluquero, etc.).
   * Se obtiene EXCLUSIVAMENTE de la colección `profesiones` (Parámetros).
   * Es el criterio que define quién es profesional — nunca el Rol.
   */
  profesion?: string;
  /** Especialidad dentro de la profesión (p. ej. "Felinos", "Cardiología"). */
  specialty: string;
  /** Matrícula profesional. */
  licenseNumber?: string;
  phone?: string;
  /** Estado (activo/inactivo). */
  available: boolean;
  createdAt: Date;
  updatedAt?: Date;
  createdBy?: string;
}

export interface ProfesionParametro {
  id: string;
  name: string;
  description?: string;
  active: boolean;
  createdAt: Date;
  updatedAt?: Date;
  createdBy?: string;
}

export interface TipoServicioParametro {
  id: string;
  name: string;
  color?: string;
  description?: string;
  /**
   * Profesión requerida para atender este servicio (nombre, de Parámetros → Profesiones).
   * Se guarda el NOMBRE para matchear directo contra `Doctor.profesion`. Opcional:
   * si está vacío, cualquier profesional puede tomar el turno.
   */
  profesion?: string;
  active: boolean;
  createdAt: Date;
  updatedAt?: Date;
  createdBy?: string;
}

// ============================================
// EXPORTACIONES DE COMPATIBILIDAD
// ============================================

// Mantener tipos antiguos para compatibilidad
export type UserRole = Role['name'];

// Re-exportar tipos comunes
export type { Client as ClientType };
export type { Pet as PetType };
export type { MedicalRecord as MedicalRecordType };
export type { Appointment as AppointmentType };
export type { User as UserType };
