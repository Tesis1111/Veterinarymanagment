# Modelo de base de datos

El sistema usa **Cloud Firestore**, una base de datos de documentos. No hay
tablas ni JOINs: los datos se organizan en colecciones de documentos y las
relaciones se representan guardando el id del documento referenciado.

La fuente de verdad de los campos es [`src/app/types/index.ts`](../src/app/types/index.ts);
este documento describe la estructura y las decisiones de diseño.

---

## Convenciones generales

**Nombres.** Las colecciones están en español (`clientes`, `mascotas`, `turnos`)
y los campos de los documentos en inglés (`fullName`, `createdAt`). Es una
inconsistencia heredada que se mantiene por compatibilidad con los datos ya
cargados: renombrar campos exigiría migrar todos los documentos existentes.

**Borrado lógico.** Las colecciones con datos de negocio no borran documentos:
marcan `deleted: true` junto con `deletedAt` y `deletedBy`. Esto conserva la
trazabilidad de las historias clínicas, que es un requisito del dominio.

> Toda consulta filtra por `where("deleted", "==", false)`. Firestore **excluye**
> los documentos donde el campo no existe, así que cada alta debe escribir
> `deleted: false` explícitamente; si no, el documento queda invisible sin que se
> produzca ningún error.

**Auditoría por documento.** Los documentos de negocio llevan `createdAt`,
`createdBy`, `updatedAt` y `updatedBy` (los `*By` guardan el uid del usuario).

**Fechas.** Se persisten como `Timestamp` de Firestore y se convierten a `Date`
de JavaScript en la capa de servicios.

---

## Colecciones

### Seguridad

#### `usuarios`

El id del documento es el **uid de Firebase Authentication**, lo que permite que
las reglas de seguridad comparen contra `request.auth.uid` sin lecturas extra.

| Campo | Tipo | Notas |
|---|---|---|
| `email` | string | Coincide con el de Authentication |
| `fullName` / `nombre` / `apellido` | string | |
| `roleName` | `'admin' \| 'veterinario' \| 'recepcionista' \| 'peluquero'` | Determina los permisos |
| `permissions` | string[] | Permisos efectivos, resueltos al iniciar sesión |
| `phone`, `sexo`, `domicilio`, `profesion` | string | Opcionales |
| `active` | boolean | Un usuario inactivo no puede operar |
| `createdAt`, `updatedAt`, `lastLogin` | Timestamp | |

Las contraseñas **no** se almacenan acá: las gestiona Firebase Authentication.

#### `auditoria`

Registro inmutable de acciones. Las reglas permiten crear pero no modificar ni
borrar.

| Campo | Tipo | Notas |
|---|---|---|
| `userId`, `userName`, `userRole` | string | Se desnormaliza el nombre y el rol para que el registro siga siendo legible aunque el usuario cambie o se desactive |
| `action` | enum | `CREATE`, `UPDATE`, `DELETE`, `LOGIN`, `LOGOUT`, `VIEW`, `EXPORT`, `PRINT`, `CONFIG_CHANGE`, `PASSWORD_RESET_REQUEST`, `PASSWORD_RESET_BLOCKED` |
| `module` | enum | `clients`, `pets`, `medical_records`, `appointments`, `users`, `roles`, `services`, `security`, `system` |
| `entityType`, `entityId` | string | Documento afectado |
| `oldValues`, `newValues` | map | Estado antes y después |
| `details`, `ipAddress`, `userAgent` | string | |
| `timestamp` | Timestamp | |

Las acciones `PASSWORD_RESET_*` las escribe la función serverless con el Admin
SDK: quien recupera su contraseña no tiene sesión iniciada, y las reglas exigen
`userId == request.auth.uid` para escribir desde el navegador.

---

### Clientes y mascotas

#### `clientes`

| Campo | Tipo | Notas |
|---|---|---|
| `fullName` | string | |
| `dniCuit` | string | Identificador fiscal |
| `phone` | string | |
| `address`, `email`, `observations` | string | Opcionales |
| `deleted` + auditoría | | Borrado lógico |

#### `mascotas`

| Campo | Tipo | Notas |
|---|---|---|
| `name` | string | |
| `clientId` | ref → `clientes` | Dueño actual |
| `breedId` | ref → `razas` | La especie se deduce a través de la raza |
| `sex` | `'Macho' \| 'Hembra' \| 'Desconocido'` | |
| `birthDate`, `color`, `observations`, `imageUrl` | | Opcionales |
| `deceased` | boolean | Estado de fallecimiento |
| `deceasedDate`, `deceasedReason`, `deceasedNotes` | | Sólo si `deceased` |
| `ownershipHistory` | array de cambios de dueño | Ver abajo |
| `deleted` + auditoría | | Borrado lógico |

`ownershipHistory` se guarda **embebido** en el documento de la mascota en lugar
de en una colección aparte: son pocos elementos por mascota y siempre se leen
junto con ella, así que embeberlos evita una consulta adicional. Cada entrada
conserva `previousClientName` y `newClientName` porque el historial debe seguir
siendo legible aunque después se borre un cliente.

---

### Clínico

#### `historiales`

| Campo | Tipo | Notas |
|---|---|---|
| `petId` | ref → `mascotas` | |
| `professionalId` | ref → `usuarios` | Quien atendió |
| `date` | Timestamp | Fecha de la atención |
| `eventType` | enum | `Consulta`, `Vacunación`, `Cirugía`, `Tratamiento`, `Desparasitación`, `Control`, `Emergencia`, `Peluquería`, `Otros` |
| `description` | string | |
| `weight`, `temperature`, `heartRate`, `respiratoryRate` | number | Signos vitales de esa atención |
| `diagnosis`, `treatment`, `medication` | string | |
| `nextAppointmentDate`, `notes` | | Seguimiento |
| `clientIdAtTime`, `clientNameAtTime` | string | Dueño vigente al momento del registro |
| `deleted` + auditoría | | Borrado lógico |

Dos decisiones importantes:

- **El peso vive en el historial, no en la mascota.** Un peso único en la ficha
  se sobrescribiría en cada control y se perdería la evolución. Guardándolo por
  atención, la curva de peso queda disponible.
- **Se congela el dueño del momento** (`clientIdAtTime`). Si la mascota cambia de
  dueño, el historial anterior debe seguir mostrando quién la llevó a esa
  consulta, no el dueño actual.

Índice compuesto requerido: `deleted` ASC + `date` DESC.

---

### Turnos

#### `doctores`

| Campo | Tipo | Notas |
|---|---|---|
| `userId` | ref → `usuarios` | |
| `name` | string | |
| `profesion` | string | Criterio profesional, tomado de `profesiones`. Distinto del rol de seguridad |
| `specialty`, `licenseNumber` | string | |
| `available` | boolean | |

#### `horarios`

Disponibilidad semanal de cada profesional.

| Campo | Tipo | Notas |
|---|---|---|
| `doctorId` | ref → `doctores` | |
| `dayOfWeek` | number | 0 = domingo … 6 = sábado |
| `startTime`, `endTime` | string | Formato `HH:mm` |
| `active` | boolean | Baja lógica del horario |

#### `turnos`

| Campo | Tipo | Notas |
|---|---|---|
| `clientId`, `petId` | ref | |
| `doctorId` | ref → `doctores` | |
| `type` | string | Tipo de turno: `clinic`, `grooming`, `daycare` o id de `tiposServicio` |
| `tiposEvento` | string[] | Motivos de consulta (ids de `tiposEvento`). Un turno admite varios |
| `date` | Timestamp | |
| `startTime`, `endTime` | string | `HH:mm` |
| `dateFrom`, `dateTo` | Timestamp | Rango de estadía, sólo guardería |
| `status` | enum | `Programado`, `Confirmado`, `Completado`, `No asistió`, `Cancelado` |
| `reason`, `notes`, `cancellationReason`, `cancelledAt` | | |
| `deleted` + auditoría | | |

`No asistió` cierra el turno igual que `Completado` (libera el horario, no admite
edición) pero deja constancia de la inasistencia en lugar de registrar una
atención que no ocurrió.

Índices compuestos requeridos: `petId` + `date`, y `doctorId` + `date`.

#### `slots`

Bloqueos que garantizan que un profesional no tenga dos turnos en el mismo
horario.

El **id del documento es determinista**: `{doctorId}_{YYYY-MM-DD}_{HH:mm}`. Ese
es el mecanismo entero: crear un turno implica crear el slot, y si el documento
ya existe la escritura falla. Firestore no tiene restricciones de unicidad, así
que la unicidad se codifica en el id. Las reglas prohíben `update` justamente
para que un slot no pueda reasignarse en silencio; se crea o se borra.

---

### Parámetros

Colecciones que alimentan los desplegables del sistema y se administran desde el
módulo de Parámetros. Todas comparten el campo `active` (baja lógica) y se
consultan con `where("active", "==", true)`.

| Colección | Contenido | Relación |
|---|---|---|
| `especies` | Especies de animales | — |
| `razas` | Razas | `especieId` → `especies` |
| `tiposEvento` | Motivos de consulta | — |
| `tiposServicio` | Tipos de turno | — |
| `arbolVacunacion` | Plan de vacunación: vacuna, dosis, periodicidad | `especieId` → `especies` |
| `profesiones` | Profesiones asignables a un profesional | — |

No hay datos precargados: si una colección está vacía, la interfaz muestra el
estado vacío correspondiente en lugar de datos de ejemplo.

---

### Infraestructura

#### `email_logs`

Registro de correos enviados. Lectura sólo para `admin`; sin modificación ni
borrado.

#### `rate_limits`

Contadores de la limitación de solicitudes de recuperación de contraseña.

Está **cerrada a todo cliente** en las reglas (`allow read, write: if false`).
Sólo la escribe el Admin SDK desde la función serverless, que no pasa por las
reglas. Si el navegador pudiera escribirla, podría reiniciar su propio contador y
el límite no serviría de nada.

---

## Seguridad

Las reglas de [`firestore.rules`](../firestore.rules) son la frontera real: el
control de permisos del frontend sólo decide qué se muestra, y un cliente
modificado puede saltearlo.

Criterios aplicados:

- Toda operación exige sesión iniciada; el catch-all final niega cualquier ruta
  no contemplada.
- `usuarios` y los parámetros del sistema son de escritura exclusiva de `admin`.
- `auditoria` y `email_logs` permiten crear pero no modificar ni borrar, y sólo
  con `userId == request.auth.uid`: nadie puede escribir registros a nombre de
  otro ni alterar los propios.
- `rate_limits` está cerrada a todo cliente.

## Relaciones

```
usuarios ──< auditoria
   │
   └──< doctores ──< horarios
             │
             └──< turnos >── clientes ──< mascotas ──< historiales
                                              │
                                           razas >── especies
```

Las referencias se guardan como ids planos. Firestore no valida integridad
referencial: es la capa de servicios la que resuelve las referencias y contempla
el caso de que el documento apuntado ya no exista.
