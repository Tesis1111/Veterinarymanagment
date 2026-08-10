# Veterinaria Leo — Sistema de Gestión

Aplicación web de gestión para una clínica veterinaria: clientes, mascotas,
historias clínicas, turnos, reportes y auditoría, con acceso por roles.

## Stack

| Capa | Tecnología |
|---|---|
| Frontend | React 18 + TypeScript + Vite 6 |
| Estilos | Tailwind CSS 4 + componentes shadcn/ui (Radix UI) |
| Base de datos | Firebase Firestore |
| Autenticación | Firebase Authentication |
| Funciones de servidor | Vercel Serverless Functions (`api/`) |
| Envío de correo | Resend |
| Despliegue | Vercel |

## Puesta en marcha

```bash
npm install
cp .env.example .env    # completar con las credenciales propias
npm run dev             # http://localhost:5173
```

`npm run build` genera el bundle de producción en `dist/`.

Las variables de entorno están documentadas en [`.env.example`](.env.example).
Las que empiezan con `VITE_` se exponen al navegador; el resto sólo las leen las
funciones de `api/`.

## Estructura

```
api/                     Funciones serverless (envío de correo, recuperación de contraseña)
docs/                    Documentación de base de datos y despliegue
scripts/                 Utilidades de administración (migración, generación de íconos)
src/app/
  components/            Componentes de interfaz
    modules/             Un módulo por área funcional (clientes, turnos, reportes…)
    ui/                  Primitivas de shadcn/ui
  context/               Contextos de React (auth, auditoría, preferencias)
  services/              Acceso a Firestore, uno por colección
  types/                 Definiciones de TypeScript del dominio
  public/                Estáticos servidos tal cual (manifest, service worker, íconos)
firestore.rules          Reglas de seguridad de Firestore
firestore.indexes.json   Índices compuestos
```

## Roles

`admin`, `veterinario`, `recepcionista` y `peluquero`. Los permisos se resuelven
en el cliente para la interfaz y se vuelven a exigir en
[`firestore.rules`](firestore.rules), que es la frontera de seguridad real.

## Documentación

- [Modelo de base de datos](docs/README_BASE_DE_DATOS.md)
- [Despliegue](docs/DEPLOYMENT.md)
- [Scripts de administración](scripts/README.md)
