# CONTEXTO · Bitácora viva de WindCloud

> Memoria del proyecto entre sesiones. **Se lee al empezar y se actualiza al terminar cada iteración.**
> Los specs (`specs/`) dicen *qué* construir; este archivo dice *dónde vamos, qué se decidió y por qué*.
> Regla: lo más reciente arriba en la bitácora; nunca borrar entradas, solo corregir con una nueva.

---

## 1. Estado actual (sobrescribir en cada iteración)

| Campo | Valor |
|---|---|
| Última actualización | 2026-11-13 |
| Fase | Fase 0 · Cimientos — **3/4 tareas cerradas** (T-04 en código, falta publicar) |
| Última tarea cerrada | T-03 (pipeline Python) |
| Siguiente tarea | **Cerrar T-04**: crear repo público en GitHub, añadir secretos `CLOUDFLARE_API_TOKEN` y `CLOUDFLARE_ACCOUNT_ID`, hacer push → URL pública. Luego **T-10** (MapView) |
| Código existente | `web/` (página "Hola WindCloud", tema oscuro, 2 pruebas) · `pipeline/` (paquete uv, 4 pruebas de humo) · `.github/workflows/{ci,deploy}.yml` |
| Repositorio git | Inicializado en local (rama `main`), **sin remoto** ni commits |
| URL pública | — (pendiente de T-04) |
| Bloqueos | T-04 necesita acciones del usuario: cuenta Cloudflare + repo GitHub (`gh auth login`) |

## 2. Resumen del proyecto (cambia poco)

- **Qué es:** observatorio meteorológico abierto (viento, nubes, lluvia, temperatura, riesgo), Colombia primero.
  Inspirado en la estructura de fuego.huella.world.
- **Diferencial:** no un pronóstico, sino el **consenso multi-modelo** + **acuerdo** entre modelos + **precisión
  verificada** contra estaciones reales (METAR, IDEAM, redes urbanas).
- **Arquitectura ($0):** GitHub Actions (cron: `grids` 6 h, `verify` diario, `risk` 6 h) → archivos estáticos en
  Cloudflare Pages (R2 si crece) → navegador con React + MapLibre + deck.gl; el panel de punto llama directo a Open-Meteo.
- **Stack:** React 18 + TS + Vite · MapLibre GL · deck.gl · capa WebGL de viento (técnica webgl-wind) · TanStack Query +
  Zustand · Python 3.12 + xarray/cfgrib/numpy/Pillow · pandas/parquet en rama `data`.
- **Principios innegociables:** solo gratis (P1), todo dato con fuente + hora del run (P2), observado/pronóstico/estimado
  separados (P3), latencia visible y "sin datos" antes que dato viejo (P4), es-CO + métrico + móvil 360 px (P6).

## 3. Decisiones tomadas (registro acumulativo)

| Fecha | Decisión | Motivo | Spec afectado |
|---|---|---|---|
| 2026-11-12 | Sin servidor siempre encendido; todo pre-calculado en Actions y servido estático | Costo cero (P5) | 02 §1 |
| 2026-11-12 | Open-Meteo API gratuita solo mientras el proyecto sea no comercial; plan B: auto-alojar | Licencia de Open-Meteo | 00 P1 |
| 2026-11-12 | Redes urbanas (SAB, SIATA, CDIAC, CVC) solo como enlace hasta confirmar acceso y términos; nunca raspar | Legalidad / honestidad | 04 |
| 2026-11-13 | Contexto vivo en `CONTEXTO.md`, actualizado en cada iteración | Continuidad entre sesiones | CLAUDE.md |
| 2026-11-13 | React 19 + TS 7 + Vite 8 (lo que trae el template actual) en vez de React 18 | Versiones vigentes | 02 §2 |
| 2026-11-13 | **oxlint** en vez de ESLint | typescript-eslint solo soporta TS < 6.1; oxlint viene con el template | 02 §2, 03 T-02 |
| 2026-11-13 | Pipeline como paquete uv `pipeline/src/windcloud_pipeline/`; ruff para estilo | Imports limpios y pruebas | 02 §3 |
| 2026-11-13 | eccodes por ruedas pip (`eccodes` + `eccodeslib`), sin `apt` en CI | Más simple y reproducible | 02 §2 |
| 2026-11-13 | Workflow `ci.yml` separado de `deploy.yml` (lint, formato, pruebas, build en PR y main) | Calidad antes de publicar | 02 §3 |
| 2026-11-13 | Licencia MIT a nombre de "Contribuidores de WindCloud"; sin datos personales en archivos públicos | Privacidad en repo público | — |

## 4. Preguntas abiertas / riesgos

- [ ] ¿Las redes urbanas (SAB, SIATA, CDIAC, CVC) tienen API o descarga abierta con licencia? → T-46
- [ ] Pereira (redhidro.org) sin respuesta y Bucaramanga (CDMB) sin visor público → T-48
- [ ] Términos actuales de RainViewer para radar → T-37
- [ ] ¿Las texturas de viento caben en los límites de Pages (25 MiB/archivo, 20 000 archivos) o hace falta R2? → T-32/T-33
- [ ] Hosting definitivo: Cloudflare Pages vs. GitHub Pages (preferido Cloudflare) → T-04

## 5. Aprendizajes y trampas conocidas

<!-- Cosas no obvias descubiertas al implementar: errores de APIs, IDs reales de capas, límites reales, etc. -->
- El paquete pip `eccodes` ≥ 2.4x **ya no trae la librería nativa**: sin `eccodeslib` falla con
  `RuntimeError: Cannot find the ecCodes library` y cfgrib no aparece en `xr.backends.list_engines()`.
- `uv init` mete nombre y correo del usuario en `pyproject.toml` → borrarlos (repo público).
- `npm create vite` (2026) usa oxlint, React 19 y TS 7; `--no-interactive` evita los prompts.
- `wrangler pages deploy` falla si el proyecto no existe → `deploy.yml` intenta `pages project create` antes (ignora error si ya existe).

---

## 6. Bitácora de iteraciones (más reciente arriba)

<!--
Plantilla — copiar al inicio de esta sección en cada iteración:

### AAAA-MM-DD · <título corto>
- **Tareas:** T-xx (✅ cerrada / 🟡 parcial / ❌ bloqueada)
- **Hecho:** qué se construyó o cambió (archivos clave)
- **Verificado:** pruebas/comandos ejecutados y resultado
- **Decisiones:** (también copiarlas a §3)
- **Pendiente / siguiente paso:** …
-->

### 2026-11-13 · Fase 0 · Cimientos (T-01 a T-04)
- **Tareas:** T-01 ✅ · T-02 ✅ · T-03 ✅ · T-04 🟡 (workflow escrito, sin publicar)
- **Hecho:** `git init` (main), `LICENSE` MIT, `README.md` con atribuciones, `.gitignore`.
  `web/`: Vite + React 19 + TS, oxlint, Prettier, Vitest + Testing Library, tema oscuro con variables CSS
  (`src/index.css`, incluye colores observado/pronóstico/estimado), página "Hola WindCloud", `lang="es-CO"`.
  `pipeline/`: proyecto uv Python 3.12 con xarray, cfgrib, eccodes + eccodeslib, numpy, Pillow; pruebas de humo.
  `.github/workflows/ci.yml` (web + pipeline) y `deploy.yml` (Cloudflare Pages vía wrangler-action v4).
- **Verificado:** `npm run lint` ✓, `format:check` ✓, `npm test` 2/2 ✓, `npm run build` ✓ (JS 68,8 KB gzip);
  `uv run pytest` 4/4 ✓ (eccodes + cfgrib cargan), `ruff check` y `ruff format --check` ✓. Workflows no ejecutados aún.
- **Decisiones:** ver §3 (React 19/TS 7, oxlint, paquete uv, eccodeslib, ci.yml).
- **Pendiente / siguiente paso:** usuario crea repo en GitHub + secretos Cloudflare → push → URL pública cierra T-04. Después T-10.

### 2026-11-13 · Creación del documento de contexto
- **Tareas:** ninguna de `03-tareas.md` (iteración de organización)
- **Hecho:** creado `CONTEXTO.md`; `CLAUDE.md` ahora exige leerlo al inicio y actualizarlo al final de cada iteración.
- **Verificado:** n/a (solo documentación)
- **Pendiente / siguiente paso:** empezar **T-01** (monorepo + MIT + README con atribuciones).

### 2026-11-12 · Especificaciones iniciales
- **Tareas:** definición SDD previa al código
- **Hecho:** `specs/00-constitucion.md`, `01-requisitos.md`, `02-diseno.md`, `03-tareas.md`, `04-fuentes-de-datos.md`.
  Estado HTTP de redes urbanas comprobado (SAB, SIATA, CDIAC, CVC ✅; Pereira y Bucaramanga ⚠️).
- **Pendiente / siguiente paso:** Fase 0.
