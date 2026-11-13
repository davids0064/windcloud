# CONTEXTO · Bitácora viva de WindCloud

> Memoria del proyecto entre sesiones. **Se lee al empezar y se actualiza al terminar cada iteración.**
> Los specs (`specs/`) dicen *qué* construir; este archivo dice *dónde vamos, qué se decidió y por qué*.
> Regla: lo más reciente arriba en la bitácora; nunca borrar entradas, solo corregir con una nueva.

---

## 1. Estado actual (sobrescribir en cada iteración)

| Campo | Valor |
|---|---|
| Última actualización | 2026-11-13 |
| Fase | Fase 1 ✅ completa. **Fase 2 · viento y capas: 7/8** (T-30, T-32…T-37 ✅; T-33 verificado en local, falta 1.ª corrida en GitHub). Falta T-31 (ECMWF). Fase 0: 3/4 (T-04 pospuesta) |
| Modo de trabajo | **Todo en local** hasta decidir publicar. Commits locales; no hacer push sin pedirlo. Deploy solo manual |
| Última tarea cerrada | T-37 (radar: ausencia documentada para Colombia, aviso + enlaces SAB/SIATA) |
| Siguiente tarea | **T-31** ECMWF Open Data (última de la fase 2); o subir el código para que `grids.yml` corra |
| Código existente | `web/src/map/` (MapView, basemaps, palette, departments, BasemapSwitcher, deckCompat, locale) · `web/src/map/` (+ clouds, cloudAlpha) · `web/src/api/` (http, geocoding, gibs) · `web/src/clouds/` (CloudPanel, useCloudAnimation, time) · `web/src/core/` (models, variables, consensus, agreement) · `web/src/api/openMeteo.ts` · `web/src/point/` (PointPanel, ModelChart, AgreementBadge, summary, usePointForecast, colors) · `web/src/search/PlaceSearch` · `web/public/geo/` · `web/src/api/ensemble.ts` · `web/src/core/` (+ probability, runs) · `web/src/ui/` (DataChip, SourceLine) · `web/src/shell/` (SideMenu, Clock, LocateButton, tabs/) · 140 pruebas web (core 98,4 % cobertura) · `pipeline/` (geo.py) 9 pruebas · CI |
| Cómo ver | `cd web && npm run dev` → http://localhost:5173 |
| Regenerar departamentos | `cd pipeline && uv run python -m windcloud_pipeline.geo` |
| Bajar rejillas GFS | `cd pipeline && uv run python -m windcloud_pipeline.grids` (→ `pipeline/out/gfs/<run>/`, ignorado en git) |
| Codificar a PNG | `uv run python -m windcloud_pipeline.encode --entrada out/gfs/<run>` (→ `pipeline/out/web/data/gfs/<run>/`) |
| Actualizar todo (lo que hará Actions) | `cd pipeline && uv run python -m windcloud_pipeline.update` (no hace nada si el run ya está publicado) |
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
| 2026-11-13 | 8 modelos: `ecmwf_ifs` 9 km en vez de `ecmwf_ifs025`; **sin `metno_seamless`** (idéntico a ECMWF en Colombia) + salvaguarda anti-duplicados | Evitar contar ECMWF dos veces; más resolución | 02 §5.1, 01 RF-6 |
| 2026-11-13 | Hora del run por `meta.json` de cada modelo (componente global) | La Forecast API no la trae; P2 la exige | 02 §5.1 |
| 2026-11-13 | Caché propia en `api/openMeteo.ts` (30 min); TanStack Query se evaluará en T-22 | Funciona y se prueba sin React | 02 §2 |
| 2026-11-13 | Velocidad de consenso = media de velocidades; dirección = media u/v | El vector medio subestima la velocidad cuando discrepan | 02 §5.2 |
| 2026-11-13 | Gráficas con uPlot (carga diferida) | Ligero (~50 KB), maneja 8 × 168 puntos sin esfuerzo | 02 §9.1 |
| 2026-11-13 | Sin TanStack Query: hook propio sobre la caché de `api/openMeteo.ts` | Suficiente; una dependencia menos | 02 §2, §9.1 |
| 2026-11-13 | Tarjeta de lluvia = acumulado próximas 24 h (las demás, hora en curso) | La lluvia horaria suele ser 0 y dice poco | 02 §9.1 |
| 2026-11-13 | El punto clicado se muestra en el panel lateral (reemplaza el chip de coordenadas) | RF-6 | 02 §9.1 |
| 2026-11-13 | Ensambles **sin mezclar**: una barra por ensamble y día + acuerdo entre ellos | Calibraciones distintas; en Bogotá ECMWF ~59 % vs GEFS 100 %: la discrepancia es información | 02 §5.4 |
| 2026-11-13 | "Hoy" de la probabilidad = desde la hora en curso | Si no, contaría lluvia ya caída (88 % día completo vs 51 % resto del día) | 02 §5.4 |
| 2026-11-13 | El acuerdo entre modelos se rotula "Estimado" (indicador propio), no "Pronóstico" | P3: separar índices propios de pronósticos | 02 §9 |
| 2026-11-13 | Run con > 30 h = "atrasado": se avisa pero sigue en el consenso | P4 sin descartar datos válidos; caso real `cmc_gem_gdps` congelado | 02 §9 |
| 2026-11-13 | Controles de capas (mapa base, nubes) dentro del menú lateral, no flotando | Diseño §9; libera el mapa | 02 §9.0 |
| 2026-11-13 | Precisión y Riesgo como «en construcción» con fase, sin datos de relleno | Honestidad (P3) | 02 §9.0 |
| 2026-11-13 | Metodología preliminar ya publicada, con umbrales leídos del código | RF-13 y explicar la transparencia de nubes (pendiente de T-12) | 02 §9.0 |
| 2026-11-13 | Presupuesto de JS inicial ≤ 150 KB gzip verificado en CI (`npm run check:bundle`, cuenta entrada + modulepreload) | Una importación de `cloudAlpha` desde Metodología coló MapLibre y subió la carga inicial de 74 a 376 KB | 03 T-62 |
| 2026-11-13 | Rejillas GFS por región «colombia» (−100…−50, −20…25) por defecto, global opcional | 16,5 MB/run frente a ~216 MB; misma resolución; Colombia primero | 02 §4.1 |
| 2026-11-13 | Campos GFS **instantáneos** (no promedios de intervalo) | Promedios reinician cada 6 h (ventanas 3/6 h mezcladas); el instantáneo existe en todos los pasos | 02 §4.1 |
| 2026-11-13 | PNG con filas remuestreadas a Web Mercator | Una imagen lat/lon pegada por esquinas se desplaza hasta ~42 km (medido) | 02 §4.1 |
| 2026-11-13 | Escalares con rango fijo y lluvia en raíz cuadrada; ráfaga = máx(GUST, viento 10 m) | Colores comparables entre pasos; lloviznas visibles; GFS da GUST < viento | 02 §4.1 |
| 2026-11-13 | Línea de tiempo por pasos con precarga del nivel (no interpolación temporal entre pasos) | Simple, inmediato al mover; 48 fps reproduciendo | 02 §4.1 |
| 2026-11-13 | Capas de color coloreadas en el navegador con protocolo propio | MapLibre 6 no tiene `raster-color` | 02 §4.1.1 |
| 2026-11-13 | Isobaras con presión suavizada antes de trazar | Reducción al nivel del mar sobre los Andes crea líneas falsas (visto en Chrome) | 02 §4.1.1 |
| 2026-11-13 | Una sola línea de tiempo para todas las capas de pronóstico | Viento, color e isobaras siempre de la misma hora | 02 §4.1.1 |
| 2026-11-13 | Rejillas publicadas en rama `grids` con un único commit reemplazado (no en main, no artefactos) | Sin historial que crezca (~26 MB/día); accesible para deploy; si falla no se toca | 02 §1 |
| 2026-11-13 | Cron +4 h 45 min tras cada run + reintento +1,5 h | Medido: 12Z completo ~17:00 UTC (≈ 5 h) | 02 §1 |
| 2026-11-13 | **No integrar RainViewer**; documentar ausencia de radar en Colombia y enlazar SAB/SIATA | Su máscara no cubre ninguna ciudad colombiana (solo Leticia); licencia personal/educativa, zoom 7, 100 pet./min | 02 §4.3, 04 |
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
- **Open-Meteo:** `metno_seamless` fuera de Escandinavia = `ecmwf_ifs` exacto. `gfs_seamless` = `gfs_global`
  (`ncep_gfs013`). `cmc_gem_gdps` está congelado (último run mayo 2026); el vigente es `cmc_gem_gdps_15km`.
  AIFS y JMA sin ráfagas; ARPEGE ~104 h. Coste por consulta 5,4 de 600/min (`X-RateLimit-*`).
- Probar módulos reales en el navegador: con el dev server, `await import('/src/api/openMeteo.ts')` en
  `javascript_tool` ejecuta el código TS de verdad contra la API (útil para verificación de punta a punta).
- **Caché de promesas + AbortSignal = bug:** con StrictMode (doble montaje) la 1.ª petición se abortaba y la caché
  entregaba esa promesa abortada ("signal is aborted without reason"). Las funciones cacheadas no aceptan `signal`.
- **Mocks de `fetch` deben respetar `signal`** (tardar y rechazar con AbortError); si no, la prueba de regresión
  pasaba igual con el bug. Comprobar que la prueba falla con el bug reintroducido antes de darla por buena.
- uPlot arma la leyenda como `<table><tbody><tr>`: la rejilla CSS va en el `tbody`, no en la tabla.
- **Ensemble API:** las claves no usan el id pedido (`ecmwf_ifs025` → `…_ecmwf_ifs025_ensemble`, `gfs025` →
  `…_ncep_gefs025`); agrupar por patrón. Esos sufijos sirven como id de `meta.json` en `ensemble-api.open-meteo.com`.
- Coste real por punto abierto: 5,4 (multi-modelo) + 8,2 (ensambles) = 13,6 de 600/min.
- **macOS no distingue mayúsculas en nombres de archivo:** `clock.ts` y `Clock.tsx` chocan (`./Clock` resolvía al .ts).
  Usar nombres distintos (`clockFormat.ts`). Igual con `tabs.ts` vs carpeta `tabs/` → `menuTabs.ts`.
- oxlint `only-export-components`: un archivo de componente no debe exportar constantes (rompe recarga en caliente).
- Intl es-CO formatea «a. m.» con espacio duro (U+00A0): normalizar espacios en pruebas.
- **Probar móvil sin redimensionar Chrome** (la ventana maximizada ignora `resize_window`): reemplazar el body por un
  `<iframe src="/" style="width:390px">` del mismo origen; dentro, `matchMedia` y el CSS responden como en un teléfono.
- Simular «Usar mi ubicación» sin diálogo de permisos: `Object.defineProperty(navigator, 'geolocation', …)` en la página.
- **Una sola importación puede arrastrar MapLibre al bundle inicial** (MapLibre tiene efectos secundarios y no se
  elimina por tree-shaking): constantes compartidas en módulos sin dependencias (`clouds/alphaRamp.ts`).
  Medir solo el archivo de entrada no basta: sumar los chunks `modulepreload` de `index.html`. Verificado que el
  chequeo falla (363 KB, código 1) al importar MapLibre en `App.tsx`.
- **GFS en NOMADS:** el filtro hace producto cartesiano variables × niveles (llega TCDC a 500/850 hPa de más). PRATE y
  TCDC llegan instantáneo **y** promedio desde f003 → elegir por `stepType`. PRATE en f000 **no es 0** (instantánea,
  7,5 mm/h máx. en Bogotá): mi supuesto inicial era falso y una prueba lo detectó. La subregión llega sur → norte.
  Archivo inexistente = 404 con HTML. Run 12Z aún sin f072 a las 15:01 UTC.
- GFS puede dar ráfaga (GUST) **menor** que el viento medio a 10 m (f072 Bogotá 4,4 vs 4,9 km/h): revisar en T-36.
- **Verificar codificaciones con una imagen de control:** decodificar el PNG y mirarlo. En GFS f024 se ven los
  alisios del Caribe (21 km/h del ESE), calma amazónica y el chorro de Tehuantepec: orientación y detalle correctos.
- `.gitignore` ignora `*.grib2`: los fixtures necesitan `!pipeline/tests/fixtures/*.grib2`.
- **MapLibre 6 no trae `raster-color`** (no está en el style-spec instalado): colorear PNG grises en el navegador.
- GFS: temperatura 2 m = `2t` (K), presión = `prmsl` en `meanSea` (Pa). Isobaras crudas sobre los Andes = maraña de
  líneas falsas: suavizar (los mapas sinópticos lo hacen).
- **El chequeo de bundle volvió a salvar:** `App` importaba `scalarUrl` desde un módulo que importa MapLibre (368 KB).
  Regla: helpers de URL/constantes en módulos sin dependencias (`layers/scalarUrl.ts`).
- **RainViewer 2026:** API viva pero recortada (zoom > 7 → imagen «Zoom Level Not Supported»; todas las teselas de
  ese zoom tienen el mismo número de píxeles). En su máscara de cobertura **negro opaco = SIN radar** (al revés de lo
  que sugiere la imagen); comprobarlo con una zona de control (EE. UU.). Lista 8 radares colombianos que no aparecen.
- zsh no separa `$var` en palabras (`set -- $u` no funciona como en bash): usar comandos explícitos o arreglos.
- **Pruebas que dependen del reloj:** construir los tiempos relativos a `now` exacto, no redondeados a la hora (la
  prueba de T-35 fallaba pasado el minuto 30). Y **encadenar el commit con `&&` tras las pruebas**: dos commits (T-34,
  T-33) se hicieron con pruebas en rojo porque el comando seguía aunque fallaran.
- **Pruebas lentas, no rotas:** con Chrome + servidor abiertos (o un build en paralelo), la 1.ª prueba de cada archivo
  pasaba de 5 s (entorno jsdom ~46 % del tiempo). `testTimeout: 15_000` en `vite.config.ts`. Correr la suite completa
  antes de cada commit (el de T-34 se hizo con 5 fallos por tiempo, corregido justo después).
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

### 2026-11-13 · T-37 Radar de lluvia → ausencia documentada
- **Tareas:** T-37 ✅
- **Evaluación (API real + términos):** RainViewer vivo pero solo uso personal/educativo, 13 cuadros (2 h), sin nowcast
  ni satélite, zoom máx. 7, 100 pet./min/IP (términos leídos con un subagente web: api.html, transition-faq,
  coverage). Máscara de cobertura a zoom 6: sin radar en 10 de 11 ciudades colombianas (solo Leticia); Panamá y
  Maracaibo sí (controles).
- **Decisión:** no integrar; aviso «Radar de lluvia: No disponible para Colombia» en la pestaña Mapa con alternativas
  (Lluvia GFS, infrarrojo) y enlaces a IDIGER-SAB y SIATA; entrada en Metodología. También se corrigió un texto
  desactualizado de la pestaña Mapa («ráfagas… próximas versiones»).
- **Verificado:** 177 pruebas web ✓, typecheck, lint ✓; aviso visible en Chrome.

### 2026-11-13 · T-33 Actualización programada de rejillas
- **Tareas:** T-33 ✅ (en código y en local; la primera corrida real en GitHub ocurrirá al subir el código).
- **Hecho:** `pipeline/src/windcloud_pipeline/update.py` (run más reciente → omitir si ya publicado → descargar →
  codificar sin tocar `latest.json` → validar → publicar → podar conservando 2 y nunca el vigente → `status.json`);
  `encode_run(update_latest=False)`; `.github/workflows/grids.yml` (cron, clon de la rama `grids`, update, commit único
  y `push --force` solo si «actualizado»); `deploy.yml` copia la rama `grids` a `web/dist/data`. 7 pruebas nuevas.
- **Verificado:** pipeline 38/38 ✓ + ruff; web 175 ✓. `update` real contra carpeta vacía: run 12Z publicado en 64 s
  (6,7 MB); segunda corrida «sin-cambios» sin descargar. YAML de los 3 workflows válido. Paso de publicación simulado
  en local (sin push): 1 commit, 203 archivos, 6,6 MB.
- **Pendiente:** primera corrida en GitHub (requiere push y, si se quiere ya, `workflow_dispatch`).

### 2026-11-13 · T-36 Capas de color e isobaras
- **Tareas:** T-36 ✅
- **Pipeline:** TMP 2 m y PRMSL añadidos (fixtures reales actualizados); temperatura como PNG; isobaras GeoJSON con
  contourpy tras suavizado binomial y simplificación (2,0 MB → 480 KB/run). 31 pruebas ✓.
- **Web:** `layers/` (scalarStyles: escalas y tabla de colores; scalarProtocol: coloreo en el navegador; scalarUrl;
  forecastLayers: imagen por esquinas e isobaras con etiquetas); `wind/useForecastGrid.ts` (antes useWindField; línea
  de tiempo común, sin bajar viento si está apagado); `wind/ForecastPanel.tsx` (reemplaza WindPanel); Metodología
  ampliada. 175 pruebas ✓, JS inicial 83 KB.
- **Verificado en Chrome:** temperatura sigue las tres cordilleras (Andes azules, llanuras rojas: imagen bien
  colocada); lluvia tipo radar con núcleo intenso cerca de Cali; ráfagas transparentes en tierra y naranja sobre los
  alisios; nubosidad como velo blanco; isobaras limpias 1008–1014 hPa tras suavizar (antes, maraña sobre los Andes).
- **Encontrado y corregido:** isobaras falsas por la reducción al nivel del mar; MapLibre colado al bundle (368 KB).

### 2026-11-13 · T-35 Línea de tiempo y altura del viento
- **Tareas:** T-35 ✅
- **Hecho:** `wind/useWindField.ts` reescrito (meta una vez, caché de imágenes por nivel/paso, precarga del nivel,
  reproducción cada 0,9 s), `wind/timeline.ts` (etiquetas puras), `wind/WindPanel.tsx` (modelo, altura, deslizador con
  marca «ahora», leyenda por nivel); `WindLayer.setField` conserva la estela si solo cambia la hora. Run 12Z bajado y
  codificado (5 h de antigüedad: cumple < 9 h).
- **Verificado:** 161 pruebas web ✓ (texto de horas, hook con red simulada: paso inicial más cercano a ahora, 25
  precargas, cambio de nivel; panel), pipeline 27 ✓, JS inicial 80,7 KB. Chrome: 500 hPa muestra el flujo de gran
  escala, leyenda ≥ 144 km/h; reproducción recorre pasos 3→9 en 6 s a 48 fps; 25 PNG de 500 hPa precargados.
- **Pendiente:** T-36 capas escalares; T-33 publicación automática; T-31 ECMWF; T-37 radar.

### 2026-11-13 · T-34 Partículas de viento animadas
- **Tareas:** T-34 ✅
- **Hecho:** pipeline escribe `latest.json`; plugin Vite `web/vite-plugin-local-data.ts` sirve `pipeline/out/web/data`
  en `/data` (bloquea `..`); `web/src/wind/` (meta, colorRamp, motion, particles, shaders, glUtil, WindLayer
  WebGL2, useWindField, WindPanel); sección «Viento a 10 m» en la pestaña Mapa con leyenda, fuente, run y aviso > 9 h.
- **Verificado:** 152 pruebas web ✓, JS inicial 78,7 KB. Chrome: 60 fps con 40 000 partículas (2500×1858, WebGL2);
  alisios del Caribe, remolino frente a Panamá; viento flojo visible sobre Colombia tras aclarar la rampa (antes
  invisible); funciona en Oscuro, Satélite y Relieve 3D; consola sin errores.
- **Encontrado:** la rampa viridis original no contrastaba con la tierra (1,1:1) → rampa aclarada con prueba ≥ 3:1.
  Cambiar la rampa requiere recarga completa (se crea en `onAdd`).
- **Pendiente:** T-35 línea de tiempo y nivel; T-33 publicar rejillas cada 6 h; partículas sobre terreno en 3D.

### 2026-11-13 · T-32 Rejillas a PNG + meta.json
- **Tareas:** T-32 ✅
- **Medido antes de decidir:** pegar una imagen lat/lon por esquinas en Mercator desplaza hasta 42 km (región −20…25°).
- **Hecho:** `pipeline/src/windcloud_pipeline/encode.py` (filas Mercator, remuestreo lineal, viento RGBA con rangos
  por imagen, escalares gris+alfa con rango fijo y raíz cuadrada para lluvia, ráfaga ≥ viento, `meta.json` schema 1,
  escritura atómica, CLI). 8 pruebas nuevas (incl. valor decodificado = GRIB en Bogotá).
- **Verificado:** pipeline 26/26 ✓ + ruff. Run real 2026111306: 150 PNG, 5,7 MB, 201 × 186, 2,7 s. Imagen de control
  decodificada: alisios del Caribe 21 km/h del ESE, Amazonía 3,9 km/h, chorro de Tehuantepec visible.
- **Pendiente / siguiente paso:** T-34 WindLayer (consumirá `meta.json`); T-33 publicación cada 6 h; T-31 ECMWF.

### 2026-11-13 · T-30 Descarga de rejillas GFS (inicio de la fase 2)
- **Tareas:** T-30 ✅
- **Exploración real de NOMADS:** filtro y subregión OK; global 8,6 MB/paso vs región 570–660 KB; mensajes duplicados
  (TCDC por nivel, PRATE/TCDC instantáneo + promedio); orientación sur → norte; 404 HTML si no existe.
- **Hecho:** `pipeline/src/windcloud_pipeline/grids.py` (selección de run por `.idx`, URL del filtro, descarga con
  reintentos/pausas/validación/escritura atómica/reanudación, `download.json`, lectura eccodes a filas norte → sur con
  campos instantáneos, CLI). Fixtures GRIB2 reales de ~6 KB alrededor de Bogotá (f000 y f003). 10 pruebas nuevas.
- **Verificado:** pipeline 18/18 ✓ + ruff. Descarga real: run 2026111306, 25 pasos, 16,5 MB en 41 s; rejilla 181 × 201
  sin NaN; Bogotá f000 viento 3,1 km/h, nubes 100 % (1 a. m. local, plausible).
- **Corregido en el camino:** supuesto falso «PRATE en f000 = 0» y lectura no determinista de PRATE/TCDC duplicados.
- **Pendiente / siguiente paso:** T-32 (PNG + meta.json) o T-31 (ECMWF Open Data).

### 2026-11-13 · T-13 Shell de la interfaz → **Fase 1 completa**
- **Tareas:** T-13 ✅ — con esto la fase 1 queda 9/9.
- **Hecho:** `shell/SideMenu.tsx` (+CSS), `menuTabs.ts`, `Clock.tsx`/`clockFormat.ts`, `useOnline.ts`,
  `geolocation.ts`, `LocateButton.tsx`, `tabs/` (MapTab, PointTab, ComingSoon, MethodologyTab). `App` reorganizado:
  menú + panel de punto cerrable (el punto se conserva en «Mi punto»); `MapView` recibe `basemap` como prop y pone la
  escala abajo a la derecha; CloudPanel y BasemapSwitcher pasan a la pestaña Mapa.
- **Verificado:** 140/140 pruebas ✓ (reloj, geolocalización y errores, menú, flechas, sin conexión, Metodología con
  umbrales reales, flujo de ubicación en App), typecheck, lint, build ✓. En Chrome escritorio: menú + mapa + panel a
  la vez, pestañas sin desbordar, plegar/desplegar, ubicación simulada (Cali) → panel en 2,8 s. Móvil 390 px (iframe):
  menú cerrado al inicio, cajón de 340 px sin desborde horizontal, créditos plegados, al ubicar (Medellín) se cierra
  el menú y aparece la hoja del pronóstico.
- **Regresión detectada al cerrar:** bundle inicial 74 → 376 KB gzip (Metodología importaba de `cloudAlpha`, que
  importa MapLibre). Corregido con `clouds/alphaRamp.ts` (78,7 KB) y blindado con `scripts/check-bundle.mjs` en CI.
- **Pendiente:** en móvil el marcador queda tras el borde de la hoja (centrar con `padding` en `flyTo`) → T-61.
  Siguiente fase: T-30 (pipeline de rejillas GFS).

### 2026-11-13 · T-24 Naturaleza del dato y fuente + hora en todo dato
- **Tareas:** T-24 ✅
- **Auditoría previa:** nubes completas; faltaban fuente/run junto a tarjetas y gráfica, chip y fuente en
  probabilidad de lluvia, rótulo del acuerdo (indicador propio) y aviso de runs atrasados; CSS de chips duplicado.
- **Hecho:** `ui/DataChip.tsx`, `ui/SourceLine.tsx` (con `<time dateTime>`), `core/runs.ts` (`isRunStale` 30 h,
  `runRange`, `formatRunRange`); aplicados en CloudPanel, PointPanel (tarjetas, gráfica, lista de modelos) y
  RainProbability; estilos de chip unificados en `index.css`.
- **Verificado:** 127/127 pruebas ✓ (incl. modelo con run de 50 h → "⚠ atrasado"), cobertura core 98,4 %, typecheck,
  lint, build ✓. Auditoría en Chrome con JS: nubes, tarjetas, gráfica y probabilidad tienen chip + fuente + `<time>`.
- **Pendiente / siguiente paso:** T-13 (cierra fase 1); revisar móvil 360 px (T-61); Metodología (T-60).

### 2026-11-13 · T-23 Probabilidad de lluvia por ensamble
- **Tareas:** T-23 ✅
- **Validación previa (API real, Bogotá):** 51 + 31 miembros, 168 h completas, sufijos distintos a los pedidos;
  cálculo a mano en Python: ECMWF 57–88 %/día vs GEFS 68–100 %.
- **Hecho:** `api/ensemble.ts` (URL, parseo por patrón, caché, run), `core/probability.ts` (P diaria local,
  cobertura ≥ 90 %, hoy desde ahora, acuerdo por puntos), `api/openMeteo.ts` (+`fetchRunTime`, `cachedForecast`),
  `point/usePointEnsemble.ts`, `point/rain.ts`, `point/RainProbability.tsx`; tarjeta "Prob. de lluvia · resto de hoy".
- **Verificado:** 117/117 pruebas ✓, cobertura core 98,2 %, typecheck, lint, build ✓. En Chrome: valores idénticos
  al cálculo independiente (sáb 59/100, dom 57/100, lun 59/100, mar 82/97, mié 73/84, jue 65/68); hoy resto 51 %
  (26/51) vs 100 %; aviso de discrepancia; runs 00Z/06Z; tarjetas en 896 ms y probabilidades en 1,1 s; sin errores.
- **Pendiente / siguiente paso:** T-24; completar T-13; revisar móvil (T-61).

### 2026-11-13 · T-22 Panel de punto multi-modelo
- **Tareas:** T-22 ✅ (+ nota MET Norway en `04-fuentes-de-datos.md`, que faltaba)
- **Hecho:** `point/summary.ts` (hora en curso, banda, tarjetas, lluvia 24 h, cardinales), `usePointForecast.ts`,
  `ModelChart.tsx` (uPlot), `AgreementBadge.tsx`, `colors.ts` (Okabe-Ito), `PointPanel.tsx` + CSS. `App` abre el
  panel al hacer clic o buscar una ciudad; se eliminó el chip de coordenadas.
- **Bug encontrado en Chrome:** el panel quedaba en "sin datos" por la caché + AbortSignal con StrictMode.
  Corregido y cubierto con prueba que **falla con el bug y pasa con la corrección** (mock de fetch realista).
- **Verificado:** 105/105 pruebas ✓, cobertura core 97,7 %, typecheck, lint, build ✓. En Chrome: clic en Bogotá →
  449 ms hasta tarjetas, 8 modelos; 14,8 °C (alto), viento 9 km/h del SE (medio), ráfagas 13–46 km/h (**bajo + aviso**),
  nubosidad 80 % (medio), lluvia 24 h 0,1 mm (alto); gráfica con leyenda de valores al pasar el cursor; runs listados.
- **Pendiente / siguiente paso:** T-23 ensambles; T-24 chips y fuente+hora en todo dato; T-13 resto; revisar móvil 360 px (T-61).

### 2026-11-13 · T-20 + T-21 Open-Meteo multi-modelo y motor de consenso
- **Tareas:** T-20 ✅ · T-21 ✅
- **Hecho:** `core/models.ts` (8 modelos con `metaId`), `core/variables.ts`, `api/openMeteo.ts` (URL única, parseo por
  sufijo, exclusión sin cobertura/duplicados, caché 30 min, hora de run), `core/consensus.ts` (media/mediana
  ponderadas, u/v, pesos iguales con explicación, `weightsFromMae` para T-45), `core/agreement.ts` (umbrales §5.3,
  lluvia sí/no, resumen pesimista). `npm run test:coverage` con umbral 90 % en `core/`.
- **Validación previa con la API real:** detectado `metno_seamless` = ECMWF y `cmc_gem_gdps` congelado; coste 5,4.
- **Verificado:** 93/93 pruebas ✓, cobertura core 97,7 %, typecheck, lint ✓. En Chrome (módulos reales vía Vite):
  Bogotá 543 ms, 8 modelos con run (06Z, GEM/UKMO 00Z, JMA 18Z), temp. consenso 16,1 °C (14,9–17,9) acuerdo Medio
  (s 1,06); ráfagas 13,7–56,9 km/h acuerdo Bajo (6 modelos); lluvia Alto; 8→6 modelos al final de la semana.
- **Pendiente / siguiente paso:** T-22 PointPanel (mostrar todo esto); T-23 ensambles; T-24 fuente+hora en UI.

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
