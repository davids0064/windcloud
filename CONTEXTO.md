# CONTEXTO · Bitácora viva de WindCloud

> Memoria del proyecto entre sesiones. **Se lee al empezar y se actualiza al terminar cada iteración.**
> Los specs (`specs/`) dicen *qué* construir; este archivo dice *dónde vamos, qué se decidió y por qué*.
> Regla: lo más reciente arriba en la bitácora; nunca borrar entradas, solo corregir con una nueva.

---

## 1. Estado actual (sobrescribir en cada iteración)

| Campo | Valor |
|---|---|
| Última actualización | 2026-11-13 |
| Fase | Fase 1 · MVP — **3/9 tareas** (T-10, T-11, T-12 ✅; T-13 🟡 buscador). Fase 0: 3/4 (T-04 pospuesta) |
| Modo de trabajo | **Todo en local** hasta decidir publicar. Commits locales; no hacer push sin pedirlo. Deploy solo manual |
| Última tarea cerrada | T-12 (nubes observadas GOES-East visible/IR animadas 3 h, fondo transparente) |
| Siguiente tarea | **T-13** completar shell (menú lateral, "Usar mi ubicación", reloj UTC/local) o **T-20** Open-Meteo multi-modelo |
| Código existente | `web/src/map/` (MapView, basemaps, palette, departments, BasemapSwitcher, deckCompat, locale) · `web/src/map/` (+ clouds, cloudAlpha) · `web/src/api/` (http, geocoding, gibs) · `web/src/clouds/` (CloudPanel, useCloudAnimation, time) · `web/src/search/PlaceSearch` · `web/public/geo/` · 63 pruebas web · `pipeline/` (geo.py) 9 pruebas · CI |
| Cómo ver | `cd web && npm run dev` → http://localhost:5173 |
| Regenerar departamentos | `cd pipeline && uv run python -m windcloud_pipeline.geo` |
| Repositorio git | Público: https://github.com/davids0064/windcloud (rama `main`). Commits firmados con correo noreply de GitHub. Local va por delante del remoto |
| URL pública | — (T-04 pospuesta) |
| Bloqueos | Ninguno para trabajo local |

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
| 2026-11-13 | Desarrollo 100 % local antes de desplegar; `deploy.yml` solo manual (`workflow_dispatch`); CI se mantiene | Pedido del usuario: revisar todo local primero | 03 T-04 |
| 2026-11-13 | MapLibre **6** + adaptador `deckCompat.ts` en vez de bajar a v5 | v5 tiene XSS crítico (GHSA-jrc7-96c5-q579); deck.gl 9.4 aún lee `map.transform` | 02 §2 |
| 2026-11-13 | Satélite = EOX Sentinel-2 cloudless (CC BY-NC-SA); Esri descartado | Esri exige cuenta ArcGIS; EOX sin clave | 04 Cartografía |
| 2026-11-13 | Mapas base por visibilidad de capas sobre un solo estilo, sin `setStyle` | No perder capas de datos/deck.gl al cambiar base | 02 §4.0 |
| 2026-11-13 | Mapa cargado con `React.lazy` | Bundle inicial 70 KB gz; mapa 410 KB gz aparte (RNF-2) | — |
| 2026-11-13 | Paleta propia más clara sobre `dark` (gris pizarra) con contraste AA probado | Usuario: "se ve muy oscuro" | 02 §4.0 |
| 2026-11-13 | Nombres de lugares en español (`name:es`) | Interfaz es-CO (P6); el estilo forzaba inglés | 02 §4.0 |
| 2026-11-13 | Buscador adelantado de T-13 con Open-Meteo Geocoding; países solo centran, ciudades marcan punto | Pedido del usuario | 02 §4.0.1 |
| 2026-11-13 | Sombreado del relieve con tonos de la paleta (`HILLSHADE_PAINT`), no negro | Usuario: "en relieve se ve oscuro, mantén los colores" | 02 §4.0 |
| 2026-11-13 | Paleta 2.ª iteración más clara (tierra `#36424f`); sombreado bajo el agua; cámara del relieve a 45° | Usuario: "aún se ve oscuro". Medido: brillo medio 53→65 (oscuro) y 51→63 (relieve) | 02 §4.0 |
| 2026-11-13 | **Relieve 3D = imagen satelital sobre terreno 3D**, sin sombreado artificial (se elimina la capa `hillshade`) | Usuario: "mejor los colores de satélite, mantenlos en relieve 3D" | 02 §4.0 |
| 2026-11-13 | Departamentos generados por script reproducible (`geo.py`, shapely `coverage_simplify`) en vez de conversión manual | Reproducible, probado, con presupuesto de tamaño | 02 §4.0.2 |
| 2026-11-13 | geoBoundaries COL ADM1 es **ODbL** (viene de OSM), no CC BY; corregido en 04 y README | Licencia real según la API | 04 |
| 2026-11-13 | Nubes: DescribeDomains + comprobación de la hora más reciente con tesela z2 | GetCapabilities pesa 5,8 MB; GIBS declara horas aún no publicadas (404) | 02 §4.2 |
| 2026-11-13 | Nubes con fondo transparente por brillo vía protocolo `wcnubes://` (solo presentación) | Las teselas GIBS son opacas y tapaban el mapa | 02 §4.2 |
| 2026-11-13 | Animación 3 h en 10 cuadros de 20 min (no 19 de 10 min); capa IR encendida por defecto | Mitad de peticiones; IR sirve día y noche | 02 §4.2 |
| 2026-11-13 | Cuadros de nubes bajo demanda (visible al abrir, resto al reproducir) y nubes IR en blanco | Usuario: "en 3D no veo las nubes con infrarrojo". Medido: 15 s → 0,5 s | 02 §4.2 |
| 2026-11-13 | `window.__wcMap` expuesto solo en desarrollo (`import.meta.env.DEV`) | Depurar el mapa desde la consola / Chrome | — |
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
- Lockfile npm generado en macOS omite deps opcionales de Linux (`@emnapi/*`) → `npm ci` falla en CI.
  Solución: borrar `node_modules` + `package-lock.json` y `npm install`; comprobar con `npm ci --dry-run --os=linux --cpu=x64`.
- `gh auth login` por defecto no da el scope `workflow`: hace falta `gh auth refresh -h github.com -s workflow` para subir `.github/workflows/`.
- **MapLibre 6 + Vite:** el worker se resuelve con `import.meta.url` y el pre-empaquetado de Vite lo rompe
  ("Worker failed to load"). Solución: `setWorkerUrl(import 'maplibre-gl/dist/maplibre-gl-worker.mjs?url')`.
- **MapLibre 6 no tiene export por defecto:** usar imports con nombre (`import { Map } from 'maplibre-gl'`).
- **deck.gl 9.4 + MapLibre 6:** `map.transform` ya no existe (Map no hereda de Camera) → `TypeError ... 'elevation'`
  con terreno 3D y al dibujar capas. Adaptador en `web/src/map/deckCompat.ts`; quitarlo cuando deck.gl soporte v6.
- MapLibre trae textos en inglés ("Zoom in", "Map"): se traducen con la opción `locale` (`map/locale.ts`).
- jsdom no tiene WebGL: probar la lógica de mapa con mapas falsos y mockear `MapView` en pruebas de `App`.
- El estilo `dark` de OpenFreeMap usa `name_en` (nombres en inglés) → se reemplaza `text-field` en `place_*`/`water_name`.
- Open-Meteo Geocoding sí devuelve países (`feature_code` `PCLI`) y responde nombres/contexto en español con `language=es`.
- oxlint (react) avisa `set-state-in-effect`: derivar estado al renderizar en vez de `setState` síncrono en efectos.
- Sombreado (`hillshade`) con `shadow-color` negro oscurece todo el mapa; con sombra y luz demasiado suaves el relieve
  desaparece. Equilibrio: sombra ~1,3:1 y luz ~1,9:1 frente a la tierra (probado en `palette.test.ts`).
- Terrarium incluye **batimetría**: si el sombreado va sobre el agua, el océano queda rayado y más oscuro → ponerlo debajo de `water`.
- Para "se ve oscuro", medir en vez de adivinar: capturas con `save_to_disk` + luminancia media con Pillow
  (`uv run python -I` desde `pipeline/`), separando agua y tierra. En el relieve la cámara inclinada muestra más mar
  (30 % vs 12 % del área), y eso, no el color, era lo que lo hacía ver más oscuro.
- **Prettier formatea `public/geo/*.geojson`** y lo infla (268 KB → 431 KB): `public/geo` va en `.prettierignore`.
- El Python de python.org en macOS no trae certificados CA → `CERTIFICATE_VERIFY_FAILED`. Usar
  `ssl.create_default_context(cafile=certifi.where())`; nunca desactivar la verificación.
- `shapely.coverage_simplify` simplifica fronteras compartidas igual en ambos lados (sin huecos/solapes), a
  diferencia de simplificar polígono por polígono.
- No usar `cat > archivo` sin heredoc en comandos: espera teclado y bloquea la terminal.
- **GIBS DescribeDomains adelanta horas** cuyas teselas aún dan 404 (p. ej. declara 13:10 a las 13:38 sin imagen).
  Comprobar la última con una tesela antes de animar. Visible e IR publican a ritmos distintos (13:00 vs 13:10).
- Las teselas GOES de GIBS son **opacas** (visible gris LA, IR RGBA). Transparencia hecha en cliente con
  `addProtocol` + `OffscreenCanvas` → `ImageBitmap`.
- El manejador `map.on('error')` recibe también errores de teselas (con `sourceId`): no confundirlos con fallo del
  estilo base (antes mostraba "No se pudo cargar el mapa base" por un 404 de nubes).
- GIBS respondió un 503 puntual en DescribeDomains; el reintento de `fetchText` lo resolvió.
- **Relieve 3D pide muchas más teselas** (cámara inclinada + horizonte). Con 10 fuentes de nubes precargadas, la
  visible (añadida al final) quedaba en cola ~15 s. Regla: crear primero lo que se ve; precargar solo al animar.
- Nubes IR en gris semitransparente desaparecen sobre la imagen satelital: aclararlas a blanco.
- Para depurar en Chrome: `window.__wcMap` (solo dev) → `getStyle().layers`, `isSourceLoaded(id)`, `getPaintProperty`.
- `performance.getEntriesByType('resource')` tiene tope de 250 entradas: no sirve para contar >250 teselas.
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

### 2026-11-13 · Nubes en Relieve 3D (corrección de T-12)
- **Reporte del usuario:** en 3D no se ven las nubes con infrarrojo.
- **Diagnóstico (Chrome, `__wcMap`):** capas correctas (cuadro 9 a opacidad 0,9) pero fuentes 5–9 sin cargar tras
  5 s: los 10 cuadros se precargaban y el visible iba último en la cola; en 3D hay muchas más teselas → ~15 s.
  Además las nubes IR grises casi no contrastaban sobre el satélite.
- **Hecho:** `clouds.ts` con `ensureCloudFrame`/`ensureAllCloudFrames` (bajo demanda, visible primero); `MapView`
  recibe `preloadAll` (= reproduciendo); `cloudAlpha` aclara el gris IR a blanco sin tocar colores de tormenta.
- **Verificado:** 65/65 pruebas ✓, typecheck, lint ✓. En Chrome, Relieve 3D → Apagado → Infrarrojo: nubes en
  0,5 s (antes ~15 s), blancas y visibles sobre el satélite; reproducir crea y carga los 10 cuadros y los muestra
  todos en 9 s; consola sin errores.

### 2026-11-13 · T-12 Nubes observadas (NASA GIBS)
- **Tareas:** T-12 ✅
- **Hecho:** `api/gibs.ts` (IDs reales, DescribeDomains, `pickFrames`, `dropUnpublished`), `api/http.ts` (+`fetchText`,
  cuerpo dentro del tiempo límite), `map/cloudAlpha.ts` (protocolo `wcnubes://`, brillo→opacidad),
  `map/clouds.ts` (fuentes por cuadro, opacidad), `clouds/` (CloudPanel, useCloudAnimation, time). `MapView` acepta
  `clouds`; el manejo de errores ya no confunde teselas con el estilo base.
- **Verificado:** 63/63 pruebas ✓, typecheck, lint ✓. En Chrome: IR 13:10 UTC "hace 30 min" con núcleos convectivos
  en el Pacífico frente al Chocó; animación 10:50→13:10 en bucle; visible 13:00 UTC (8:00 a. m.) con nubes blancas;
  cuadro de las 5:20 a. m. oscuro (noche, correcto); todas las teselas 200; consola sin errores.
- **Encontrado y corregido:** 404 por horas declaradas sin publicar; falsa alarma de "mapa base".
- **Pendiente / siguiente paso:** T-13 (shell) o T-20 (Open-Meteo multi-modelo). Metodología (T-60) debe explicar la
  transparencia por brillo.

### 2026-11-13 · T-11 Límites departamentales
- **Tareas:** T-11 ✅
- **Hecho:** `pipeline/src/windcloud_pipeline/geo.py` (+ `shapely`, `certifi`; 5 pruebas: reducción de vértices,
  sin huecos ni solapes, nombres, redondeo) → `web/public/geo/colombia-departamentos.geojson` (33 unidades,
  268 KB, 102 KB gzip). `web/src/map/departments.ts` (relleno para hover, halo + línea, `departmentAt`); `MapView`
  resalta y muestra tooltip; el clic pasa el departamento y el chip dice "Punto en Meta".
- **Verificado:** pipeline 9/9 ✓ + ruff; web 37/37 ✓, typecheck, lint, build ✓. Geometría: 33/33 válidas, solapes 0,
  área +0,00 %. En Chrome: líneas legibles en oscuro y satélite, hover "Meta", chip "Punto en Meta", atribución
  ODbL visible, consola sin errores.
- **Decisiones:** script reproducible; licencia ODbL corregida en specs y README.
- **Pendiente / siguiente paso:** T-12 nubes NASA GIBS.

### 2026-11-13 · Relieve 3D con colores del satélite
- **Tareas:** ajuste de T-10 pedido por el usuario.
- **Hecho:** `basemaps.ts`: `usesSatellite()` (satélite y relieve muestran la imagen EOX y ocultan rellenos); se
  eliminan capa/fuente de sombreado y `HILLSHADE_PAINT`. Relieve = satélite + `setTerrain` + cámara 45°.
- **Verificado:** 32/32 pruebas ✓, typecheck, lint, build ✓. En Chrome: Andes en 3D con bosques verdes, nevados y
  mar azul; fronteras y nombres en español visibles; consola sin errores.
- **Pendiente / siguiente paso:** T-11 límites departamentales; completar T-13.

### 2026-11-13 · Relieve aún oscuro → medición y corrección
- **Tareas:** ajuste de T-10 pedido por el usuario.
- **Medido (brillo medio 0–255, Chrome):** antes oscuro 53,4 / relieve 50,9 (mitad superior 47,7). Causas: sombreado
  sobre la batimetría del Caribe y mayor proporción de mar con la cámara inclinada; colores agua/tierra idénticos.
- **Hecho:** paleta un paso más clara; sombreado debajo de `water`; `RELIEF_PITCH` 55° → 45°.
- **Resultado:** oscuro 65,4 · relieve 62,6. 32/32 pruebas ✓, typecheck, lint, build ✓.
- **Pendiente / siguiente paso:** T-11 límites departamentales; completar T-13.

### 2026-11-13 · Relieve 3D con los colores del modo oscuro
- **Tareas:** ajuste de T-10 pedido por el usuario.
- **Hecho:** `HILLSHADE_PAINT` en `map/palette.ts` (sombra `#1c242e`, luz `#52606f`, acento = tierra, ×0,6), usado por
  `basemaps.ts`. Primer intento demasiado suave (relieve casi invisible) → reequilibrado.
- **Verificado:** 32/32 pruebas ✓ (nueva prueba de contraste del sombreado), typecheck, lint y build ✓. En Chrome:
  relieve mantiene el gris pizarra y las tres cordilleras se distinguen.
- **Pendiente / siguiente paso:** T-11 límites departamentales; completar T-13.

### 2026-11-13 · Mapa más claro + buscador de ciudad/país
- **Tareas:** T-13 🟡 (solo buscador). Pedido directo del usuario.
- **Hecho:** `map/palette.ts` (paleta gris pizarra + nombres `name:es`), `api/http.ts` (`fetchJson` 8 s + 1 reintento),
  `api/geocoding.ts`, `search/PlaceSearch.tsx` (combobox ARIA con bandera, contexto, tipo y fuente). `MapView` acepta
  `flyTo`; `App` pone el buscador en la cabecera y el chip muestra el nombre del lugar.
- **Verificado:** typecheck ✓, lint ✓, 31/31 pruebas ✓ (incluye contraste AA de nombres), build ✓ (inicial 72 KB gz).
  En Chrome: "Medellín" → lista con 6+ resultados, Enter vuela a Medellín (Antioquia) y marca punto; "España" →
  vista de país sin marcador; nombres en español (ESPAÑA, LISBOA, ARGEL); consola sin errores.
- **Pendiente / siguiente paso:** T-11 límites departamentales; completar T-13 (menú lateral, ubicación, reloj).

### 2026-11-13 · T-10 MapView (Fase 1)
- **Tareas:** T-10 ✅
- **Hecho:** `web/src/map/MapView.tsx` (MapLibre 6 + `MapboxOverlay` intercalado, navegación, escala métrica,
  atribución compacta, marcador en el punto clicado), `basemaps.ts` (oscuro / satélite / relieve 3D, vista inicial
  4.5, −74, z5), `BasemapSwitcher.tsx`, `deckCompat.ts`, `locale.ts` (controles en español). `App.tsx` ahora es el
  mapa a pantalla completa con cabecera y chip de coordenadas (es-CO) que anuncia el panel de T-22.
  `deploy.yml` pasa a solo manual.
- **Verificado:** typecheck ✓, lint ✓, 11/11 pruebas ✓, build ✓, `npm audit` 0 vulnerabilidades. En Chrome:
  los 3 mapas base cargan, relieve muestra los Andes en 3D, clic marca el punto, consola sin errores.
- **Decisiones:** ver §3 (todo local, MapLibre 6 + adaptador, EOX, sin setStyle, lazy).
- **Pendiente / siguiente paso:** T-11 límites departamentales. Aviso de Vite por chunk > 500 KB del mapa: revisar en T-62.

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
- **Publicación:** repo público `davids0064/windcloud` creado y subido; primer CI falló por el lockfile (corregido), ahora CI ✅. Deploy ❌ esperado: faltan secretos de Cloudflare.
- **Pendiente / siguiente paso:** usuario guarda secretos Cloudflare → relanzar `deploy.yml` → URL pública cierra T-04. Después T-10.

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
