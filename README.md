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

`SUPABASE_SERVICE_ROLE_KEY` debe ser la clave `service_role`/secret del servidor. No uses la `anon` ni la `publishable` (`sb_publishable_...`) porque con RLS activo Supabase bloqueará la creación de perfiles.

Si no configuras Supabase, la app usa memoria temporal para pruebas locales.

La misma base de datos puede funcionar como espejo runtime de las preguntas. Los JSON siguen siendo la fuente de verdad, pero puedes volcarlos a Supabase con:

```bash
npm run sync:content:supabase
```

La app usa `CONTENT_SOURCE="auto"` por defecto: si la tabla `question_packs` tiene datos, lee desde Supabase; si no, cae a los JSON del repo. Usa `CONTENT_SOURCE="files"` para forzar JSON o `CONTENT_SOURCE="supabase"` para fallar si Supabase no tiene preguntas.

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

Para generar el JSON sin confirmar pregunta por pregunta:

```bash
npm run import:pdf -- imports/pdfs/mi-test.pdf --no-wizard --opposition "Administrativo" --topic "Constitución"
```

También puedes fijar la salida y otros metadatos:

```bash
npm run import:pdf -- imports/pdfs/mi-test.pdf --no-wizard \
  --opposition "Administrativo" \
  --opposition-id administrativo \
  --title "Test Constitución" \
  --pack-id test-constitucion \
  --topic "Constitución" \
  --wrong -0.33 \
  --output content/imported/test-constitucion.json
```

En modo `--no-wizard`, la CLI solo exporta preguntas cuya respuesta correcta se haya detectado en el PDF. Las preguntas sin solución detectable se saltan para no inventar respuestas.

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

## Despliegue en Vercel

La aplicación está pensada para desplegarse como proyecto Next.js conectado al repositorio de GitHub.

Antes de subir:

```bash
npm run test
npm run validate:content
npm run typecheck
npm run lint
npm run build
```

En Vercel, crea un proyecto desde el repositorio y deja los comandos por defecto de Next.js:

- Install Command: `npm install`
- Build Command: `npm run build`
- Output Directory: `.next`

Configura estas variables en Vercel para Production y Preview:

```bash
NEXT_PUBLIC_APP_NAME="Opos App"
SUPABASE_URL="..."
SUPABASE_SERVICE_ROLE_KEY="..."
ADMIN_SECRET="..."
GITHUB_TOKEN="..."
GITHUB_OWNER="..."
GITHUB_REPO="..."
GITHUB_BRANCH="main"
ALLOW_LOCAL_CONTENT_WRITES="false"
CONTENT_SOURCE="auto"
```

No subas `.env.local` al repositorio. En producción, `ALLOW_LOCAL_CONTENT_WRITES` debe quedar en `false`: Vercel no debe usarse como almacenamiento editable. El admin guardará los cambios haciendo commit en GitHub y el despliegue se actualizará cuando Vercel reciba el cambio del repositorio.

El token de GitHub debe permitir leer y escribir contenidos del repositorio. Para un token fine-grained, dale acceso solo a este repositorio y permisos `Contents: Read and write`.
