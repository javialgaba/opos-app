# Opos App

Aplicación web personal para estudiar oposiciones tipo test.

## Stack

- Next.js App Router
- Supabase para progreso e intentos
- Preguntas definitivas en JSON versionado
- CLI local para convertir PDFs con texto seleccionable en JSON compatible

## Primer arranque

```bash
npm install
cp .env.example .env.local
npm run dev
```

La app principal queda en `http://localhost:3000` y el admin en `http://localhost:3000/admin`.

## Supabase

1. Crea un proyecto en Supabase.
2. Ejecuta `supabase/schema.sql` en el SQL editor.
3. Rellena en `.env.local`:

```bash
SUPABASE_URL="..."
SUPABASE_SERVICE_ROLE_KEY="..."
```

Si no configuras Supabase, la app usa memoria temporal para pruebas locales.

## Preguntas

Los packs JSON viven en:

- `content/oppositions/*.json`
- `content/imported/*.json`

Valida el contenido con:

```bash
npm run validate:content
```

## Importar PDF

Coloca PDFs con texto seleccionable en `imports/pdfs/` y ejecuta:

```bash
npm run import:pdf -- imports/pdfs/mi-test.pdf
```

La CLI detecta preguntas candidatas, te permite revisarlas en terminal y genera un JSON definitivo compatible.

## Admin y GitHub

El admin necesita una clave simple:

```bash
ADMIN_SECRET="..."
```

Para guardar cambios haciendo commit directo al repo privado:

```bash
GITHUB_TOKEN="..."
GITHUB_OWNER="..."
GITHUB_REPO="..."
GITHUB_BRANCH="main"
```

El token debe tener permiso de lectura/escritura sobre contenidos del repositorio.

En desarrollo, si quieres que el admin escriba directamente en el sistema de archivos local:

```bash
ALLOW_LOCAL_CONTENT_WRITES="true"
```
