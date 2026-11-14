# CONTEXTO · Bitácora viva de WindCloud

> Memoria del proyecto entre sesiones. **Se lee al empezar y se actualiza al terminar cada iteración.**
> Los specs (`specs/`) dicen *qué* construir; este archivo dice *dónde vamos, qué se decidió y por qué*.
> Regla: lo más reciente arriba en la bitácora; nunca borrar entradas, solo corregir con una nueva.

---

## 1. Estado actual (sobrescribir en cada iteración)

| Campo | Valor |
|---|---|
| Última actualización | 2026-11-14 |
| Fase | Fase 1 ✅. Fase 2 ✅ (8/8; T-33 aún sin 1.ª corrida en GitHub). **Fase 3: 10/10 ✅ en código** (T-40 a T-49; criterio de los 14 días corre desde el 14/11). El consenso ponderado se activa solo con 14 días de verificación. Fase 0: 4/4 ✅. **Fase 4: 5/6** (T-50 a T-53 y T-55 ✅; T-54 opcional). **Fase 5: 4/5** (T-60 a T-62 y T-64 ✅; T-63: E2E ✅, falta SKBO 14 días) |
| Modo de trabajo | Código en GitHub (`main`) y sitio publicado. Commits con correo noreply. Secretos en GitHub: `FIRMS_MAP_KEY`, `CLOUDFLARE_API_TOKEN` (el ID de cuenta lo deduce wrangler) |
| Última tarea cerrada | T-04 (despliegue en Cloudflare Workers desde Actions) |
| Siguiente tarea | Esperar 14 días de `verify.yml` (desde el 14/11): cierran la fase 3 y la T-63 (comparar consenso vs. SKBO). Opcional: T-54 (push con página cerrada). |
| Código existente | `web/src/map/` (MapView, basemaps, palette, departments, BasemapSwitcher, deckCompat, locale) · `web/src/map/` (+ clouds, cloudAlpha) · `web/src/api/` (http, geocoding, gibs) · `web/src/clouds/` (CloudPanel, useCloudAnimation, time) · `web/src/core/` (models, variables, consensus, agreement) · `web/src/api/openMeteo.ts` · `web/src/point/` (PointPanel, ModelChart, AgreementBadge, summary, usePointForecast, colors) · `web/src/search/PlaceSearch` · `web/public/geo/` · `web/src/api/ensemble.ts` · `web/src/core/` (+ probability, runs) · `web/src/ui/` (DataChip, SourceLine) · `web/src/shell/` (SideMenu, Clock, LocateButton, tabs/) · `web/src/precision/` (data, usePrecision, PrecisionTab) · `web/src/map/stations.ts` · `web/src/data/cityNetworks` · `web/src/risk/` + `map/risk.ts` · `ui/Segmented` · `core/alerts` + `web/src/alerts/` · `web/src/fires/` + `map/fires.ts` · `web/src/lightning/` + `map/lightning.ts` · `core/methodology.ts` · `a11y.test.tsx` + `ui/contrast.test.ts` · `core/apiBudget.ts` · `ui/sources.ts` + `ui/Attributions` · 275 pruebas web + 7 E2E (`web/e2e/`, `npm run e2e`) (core 98,7 % cobertura) · `pipeline/` (geo, grids, encode, ecmwf, update, stations, metar, verify, metrics, daily, sources/ideam, risk, fires, lightning) 121 pruebas · CI |
| Cómo ver | `cd web && npm run dev` → http://localhost:5173 |
| Pruebas de punta a punta | `cd web && npm run e2e` (compila y sirve en :4173; usa el Chrome instalado) |
| Regenerar estaciones METAR | `cd pipeline && uv run python -m windcloud_pipeline.stations` (→ `pipeline/data/stations.json`, sí va en git) |
| Regenerar estaciones IDEAM | `cd pipeline && uv run python -m windcloud_pipeline.sources.ideam --estaciones` (→ `data/stations-ideam.json`) |
| Verificar un día | `cd pipeline && uv run python -m windcloud_pipeline.verify [--fecha AAAA-MM-DD] [--red METAR|IDEAM|todas]` (METAR ~1 min, IDEAM ~3 min; ojo con el límite de Open-Meteo) |
| Verificación diaria (lo que hará Actions) | `cd pipeline && uv run python -m windcloud_pipeline.daily` (completa días faltantes → `out/verify/pares/*.csv.gz` y `out/web/data/precision*.json`) |
| Regenerar departamentos | `cd pipeline && uv run python -m windcloud_pipeline.geo` |
| Focos de calor FIRMS | `cd pipeline && set -a && . ./.env && set +a && uv run python -m windcloud_pipeline.fires` (→ `out/web/data/fires.json`) |
| Rayos GLM (15 min) | `cd pipeline && uv run python -m windcloud_pipeline.lightning` (→ `out/web/data/rayos.json`, ~30 s) |
| Bajar rejillas GFS | `cd pipeline && uv run python -m windcloud_pipeline.grids` (→ `pipeline/out/gfs/<run>/`, ignorado en git) |
| Codificar a PNG | `uv run python -m windcloud_pipeline.encode --entrada out/gfs/<run>` (→ `pipeline/out/web/data/gfs/<run>/`) |
| Actualizar todo (lo que hará Actions) | `cd pipeline && uv run python -m windcloud_pipeline.update` (GFS y ECMWF; no hace nada si el run ya está publicado; ECMWF tarda ~10 min) |
| Repositorio git | Público: https://github.com/davids0064/windcloud (rama `main`). Commits firmados con correo noreply de GitHub. Local va por delante del remoto |
| URL pública | https://windcloud.windcloudcol.workers.dev (Cloudflare Workers, se redespliega tras CI, rejillas y verificación) |
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
| 2026-11-13 | ECMWF con **todas** las capas (no solo u/v) y descarga por rangos HTTP | El índice trae ráfaga, nubes, lluvia, temperatura y presión por ~6 MB/paso | 02 §4.1.0 |
| 2026-11-13 | Aviso de antigüedad por modelo (GFS 9 h, ECMWF 14 h) | ECMWF publica ~7,5 h tras el run: con 9 h el aviso saldría casi siempre | 02 §4.1.0 |
| 2026-11-13 | Licencia MIT a nombre de "Contribuidores de WindCloud"; sin datos personales en archivos públicos | Privacidad en repo público | — |

- **2026-11-13 · Estaciones de verificación (T-40):** METAR activos (≥ 6 reportes/24 h) en Colombia o a ≤ 100 km;
  lista fija en git (`pipeline/data/stations.json`), regenerada a mano. Así las métricas no cambian de muestra cada día.

- **2026-11-13 · Emparejado de verificación (T-41):** hora en punto UTC, METAR de rutina ± 20 min; lluvia sí/no por
  hora con METAR+SPECI+RE…; pronóstico de Previous Runs con `elevation` de la estación. Pares en CSV largo por variable
  (métricas en T-42; dónde vive el histórico se decide en T-43).

- **2026-11-13 · Lluvia verificada en bloques de 6 h ≥ 1 mm (T-42):** por hora todos los modelos salían iguales de malos
  (FAR ≈ 0,9), así que no servía para ordenarlos. Se publica también el sesgo de frecuencia (AIFS anuncia lluvia 3×).
  Solo cuentan horas con los 8 modelos; ranking con ≥ 24 pares.

- **2026-11-13 · Histórico de verificación en CSV.gz, no parquet (T-43):** biblioteca estándar, sin pandas/pyarrow;
  rama `data` con historial (solo crece); se completan días faltantes de los últimos 10; `precision.json` se parte en
  resumen + detalle por estación.

- **2026-11-13 · Pesos del consenso (T-45):** solo temperatura y viento (ráfagas y dirección con los de viento), con
  el MAE a 1 día de la estación verificada más cercana (≤ 150 km, ventana 30 días, ≥ 14 días). Nubosidad y lluvia
  siempre pesos iguales. Se activa sola; mientras tanto el panel dice cuántos días lleva.

- **2026-11-13 · Redes locales (T-46):** solo enlace para SAB, SIATA, CDIAC y CVC (sin histórico abierto vigente); la
  verificación suma **IDEAM** (datos.gov.co, CC BY-SA) como segunda red. No se raspa ninguna página.

- **2026-11-13 · IDEAM como 2.ª red (T-47):** 211 estaciones (una por celda de 0,25°, lejos de los METAR), métricas
  por red y selector en la web; región = todas las redes juntas, siempre con la opción de verlas por separado.
- **2026-11-13 · Ritmo y presupuesto de Open-Meteo:** ≤ 500 llamadas ponderadas/min y ≤ 4 000 por corrida diaria.

- **2026-11-14 · Pereira y Bucaramanga sin enlace (T-48):** RF-14 prohíbe enlazar redes no verificadas o caídas.
  Ambas quedan en `cityNetworks` (T-49) como «no verificada» para listarlas con honestidad; se cubren con METAR
  (SKPE, SKBG) e IDEAM (Potreros a 17 km de Pereira; Llano Grande a 11 km de Bucaramanga).

- **2026-11-14 · Riesgo sin H3 (T-50):** celdas de la rejilla GFS 0,25° en vez de hexágonos H3 res 5 (no inventar
  resolución, sin `h3`/`h3-js`). El riesgo no bloquea la publicación de las capas si falla.

- **2026-11-14 · Clave de FIRMS:** solo en el pipeline (secreto de Actions / `pipeline/.env` local), nunca en el
  navegador ni en el repo público; la web lee `fires.json` ya filtrado. El usuario la compartió en el chat: puede
  pedir otra gratis en FIRMS cuando quiera.

- **2026-11-14 · Rayos fuera del deploy (T-55):** rama `rayos` leída desde raw.githubusercontent.com, porque el
  sitio solo se redespliega a mano y los rayos caducan en minutos. Dependencia nueva: `h5py` (BSD, gratis).

- **2026-11-14 · Despliegue (T-04):** Workers con archivos estáticos desplegado por Actions (no el build Git de
  Cloudflare): el sitio necesita los datos de las ramas `grids` y `data`, que cambian 8 y 1 veces al día. Subdominio
  `windcloudcol` (el anterior mostraba parte del correo del usuario). Los tokens nunca en el chat: el usuario los
  guarda desde la web de GitHub (el `!` no permite pegar en preguntas interactivas).

## 4. Preguntas abiertas / riesgos

- [ ] ¿Las redes urbanas (SAB, SIATA, CDIAC, CVC) tienen API o descarga abierta con licencia? → T-46
- [x] ~~Pereira (redhidro.org) sin respuesta y Bucaramanga (CDMB) sin visor público → T-48~~ Resuelto (2026-11-14):
  ambas no verificadas, sin enlace; se reintenta solo si aparece un sitio nuevo.
- [ ] GitHub desactiva los cron de un repo sin actividad en 60 días (`rayos.yml`, `grids.yml`, `verify.yml`):
  reactivar en Actions si pasa.
- [ ] Términos actuales de RainViewer para radar → T-37
- [ ] ¿Las texturas de viento caben en los límites de Pages (25 MiB/archivo, 20 000 archivos) o hace falta R2? → T-32/T-33
- [x] ~~Hosting definitivo~~ Resuelto (14/11): Cloudflare Workers, archivos estáticos (T-04).

- ~~¿Partir `precision.json`?~~ Resuelto en T-43: resumen 64 KB + detalle por estación ~12 KB.
- La rama `data` crece ~40 MB/año (pares + JSON reescritos a diario). Si algún día molesta: sacar `web/` del
  historial (rama aparte de commit único, como `grids`) y dejar con historial solo `pares/`.

- ¿Pedir acceso a datos a SIATA (`solicitud.datos@siata.gov.co`) y CDIAC (`idea_man@unal.edu.co`)? Lo decide y envía
  el usuario. ¿Capturar cada noche el acumulado diario del SAB (frágil) o basta IDEAM en Bogotá?

- La rama `data` crecerá ~150 MB/año con IDEAM (~300 KB/día de pares). Si molesta: guardar IDEAM agregado o
  recortar a las estaciones con mejor cobertura.

## 5. Aprendizajes y trampas conocidas

- **Open-Meteo desde GitHub Actions:** la IP del runner es compartida y el 429 llega antes que en local (14/11: IDEAM del
  12/11 falló con 3 intentos). `fetch_json` espera 65 s, 2 min y 4 min ante 429 seguidos y el error dice la causa.
- **Cron de GitHub:** tras el primer push, ningún workflow programado corrió en ~2 h. Se movió `rayos.yml` a
  `5-59/10` (evita los minutos redondos) para forzar el registro. Comprobar con `gh run list --event schedule`.

- **El build conectado a Git de Cloudflare** detecta `web/` como «sitio estático» y sube el código sin compilar
  (incluido `package.json`). Desplegar desde Actions con `wrangler deploy` y `assets.directory: ./dist`.
- **El subdominio `*.workers.dev`** sale del nombre de la cuenta (puede incluir el correo): cambiarlo antes de publicar.
- **`! gh secret set X` sin valor** crea el secreto vacío (no hay TTY para la pregunta): guardarlo desde la web de GitHub.

- **`npm install` en macOS borra del lock `@emnapi/core` y `@emnapi/runtime`** (opcionales que solo pide Linux) y
  `npm ci` falla en CI. Tras instalar cualquier paquete, comprobar que siguen en `web/package-lock.json`; si no,
  reinsertar esas dos entradas (versión 2.0.0-beta.2). No usar `--package-lock-only`: quita `resolved`/`integrity`.

- **Chrome en macOS no baja de ~500 px de ancho:** `resize_window` a 360 deja el viewport ancho. Para probar
  360 px, cargar la app en un `<iframe>` de 360 × 780 en la misma página (mismo origen) e inspeccionarla (T-61).
- **Verde/rojo-naranja con luminancia parecida** se confunden con deuteranopía (ΔE 6–7): medirlo con la simulación
  de Machado, no a ojo.

- **Constantes repetidas entre Python y TS:** una prueba de Python que lee el `.ts` con regex (como la de modelos)
  evita que Metodología muestre un umbral distinto del real (T-60). Ojo: las listas `[a, b]` necesitan su propio
  patrón en la regex.

- **Hooks con una función como dependencia:** crearla dentro de `renderHook(() => useX(fn()))` la cambia en cada
  render y el efecto se relanza sin fin (prueba colgada a los 15 s). Crearla fuera (T-53).

- **GFS: lluvia acumulada sin APCP:** el PRATE promedio (`stepType=avg`) trae su ventana en `stepRange` (0-3, 0-6,
  6-9…); ventana × promedio = mm. En eccodes la HR a 2 m es `2r` (no `r`, que es la de niveles de presión).
- Python: `flags & bit > 0` es `flags & (bit > 0)`; poner paréntesis.

- **Pruebas con fechas fijas caducan:** un run «de ayer» pasa a «atrasado» al día siguiente. Usar horas relativas a
  `Date.now()` (T-49).
- **Clases con `white-space: nowrap` fuera de su lista** ensanchan el panel lateral: no reutilizarlas en texto largo.

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
- **ECMWF Open Data:** GRIB global ~101 MB/paso con `.index` JSON y rangos HTTP; `tcc` en fracción, `10fg` ráfaga
  máx. de la última hora (nula en f000), `tprate` instantánea, `entireAtmosphere`. 00Z completo ~07:30 UTC.
- Fixtures de ECMWF: se recortan mensajes reales con eccodes (`codes_clone` + Ni/Nj/lat/lon + valores): 6 KB.
- La guarda de seguridad bloquea `rm -rf $VAR`: para pruebas usar `mktemp -d` y no borrar.
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

- **aviationweather.gov corta en 400 registros por respuesta sin avisar** (20 aeropuertos × 25 h → 400, uno fuera).
  `metar.fetch_metars` parte el lote si toca el tope. Lotes grandes también dan 504 → reintentos. Muchos aeropuertos colombianos
  solo reportan de día (7–26 METAR/día): el control de "≥ 80 % de datos" debe contar horas esperadas, no 24.
  Viento en nudos; sin campo de lluvia (hay que leer el tiempo presente: RA, SHRA, TSRA…).

- **Verificar lluvia por hora contra un aeropuerto no discrimina modelos:** un desfase de 1 h o de unos km es a la vez
  fallo y falsa alarma. En bloques de 6 h el CSI se duplica y el ranking tiene sentido.

- `Intl.DateTimeFormat('es-CO', {day: '2-digit'})` da «6/11» (sin cero) en Node: las fechas de datos se arman a mano
  desde el ISO para que pruebas y navegador coincidan.

- **IDEAM en datos.gov.co publica la hora LOCAL (UTC−5) sin zona** y con filas duplicadas; datos preliminares.
  Comprobado contra el METAR de El Dorado.
- El catálogo de datos.gov.co se consulta mejor con `api.us.socrata.com/api/catalog/v1?domains=www.datos.gov.co&q=…`.

- **Open-Meteo cuenta llamadas ponderadas** (ubicaciones × variables × modelos / 10) con límites de 600/min, 5 000/h y
  10 000/día: 10 ubicaciones × 48 variables por segundo dieron HTTP 429. Hay que ir a ritmo y presupuestar.
- **SoQL de datos.gov.co:** no hay `date_trunc_ymdh` ni `date_extract_mi`; sí `date_extract_hh`, `date_extract_mm`
  y `date_trunc_ymd`.

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

### 2026-11-14 · Código en GitHub y T-04 → **sitio publicado**
- **Push** de 49 commits (correo noreply comprobado, sin claves). El 1.er CI falló en `npm ci`: el lock generado
  en macOS había perdido `@emnapi/core` y `@emnapi/runtime` → reinsertadas (25 líneas, integridad verificada).
- **T-04:** el usuario conectó el repo en Cloudflare (build Git) y publicó `web/` sin compilar; se cambió el
  subdominio a `windcloudcol` y se reescribió `deploy.yml` para Workers (`wrangler deploy`, tras CI/rejillas/
  verificación). Primer despliegue OK; `/package.json` y `/src/*` ya dan 404.
- **Primeras corridas en GitHub:** `rayos.yml` OK (21 s, 2 872 descargas); `grids.yml` y `verify.yml` lanzados a mano.
- **Seguridad:** el token de Cloudflare se pegó en el chat → no se usó; el usuario lo rotó y lo guardó en GitHub.

### 2026-11-14 · T-63 E2E con Playwright (parcial)
- **Hecho:** `@playwright/test` (Apache-2.0, devDependency) con `channel: 'chrome'` (sin descargar navegadores),
  `playwright.config.ts` (escritorio + móvil 360), `e2e/mocks.ts` (reusa los fixtures de las unitarias),
  `e2e/app.spec.ts` (6) y `e2e/movil.spec.ts` (1), `tsconfig.e2e.json`, Vitest limitado a `src/`, trabajo `e2e` en CI.
- **Encontró un fallo real:** las pestañas no respondían a Inicio/Fin (patrón ARIA) → añadido en `SideMenu`.
- **Verificado:** 7/7 E2E en 16 s, 275 unitarias, tsc (incluye e2e), lint, prettier.
- **Pendiente:** verificación manual SKBO 14 días (requiere el código subido).

### 2026-11-14 · T-64 Atribuciones y licencias
- **Hecho:** `ui/sources.ts` (Open-Meteo, GFS, ECMWF, GIBS/GOES, GLM, FIRMS, AWC, IDEAM, OpenFreeMap/OSM,
  geoBoundaries, EOX, AWS Terrain, GeoNames: uso, licencia, enlace), pie plegable `Attributions` en el menú y la
  sección «Fuentes y licencias» de Metodología generada de la misma lista. Los 13 enlaces respondieron 200.
- **Verificado:** 275 pruebas web, tsc, lint; en Chrome el pie se despliega con desplazamiento propio.
- **Siguiente:** T-63.

### 2026-11-14 · T-62 Presupuestos de rendimiento y de llamadas
- **Bundle:** inicial 90,5 KB gzip (límite de CI 150; RNF-2 pide ≤ 600).
- **fps (RNF-3):** en Chrome (Mac de 10 núcleos), página y capa de viento a 60 fps con 40 000 partículas
  (`__wcWind`). En equipos lentos, `AdaptiveCount` (T-34) reduce a la mitad tras 2 ventanas < 30 fps (mín. 2 000);
  móvil arranca con 8 000. No se pudo medir un equipo lento real.
- **Llamadas (RNF-6):** `core/apiBudget.ts` + prueba. Peso = (variables × modelos / 10) × (días / 14): pronóstico
  de punto 4,8 + ensambles 1 = 5,8; alertas todo el día ≤ 230 (caché de 30 min); un usuario muy activo (300 puntos,
  200 búsquedas, alertas) < 2 500/día de su IP. Trabajos: tope 4 000/día (`daily.CALL_BUDGET`, sincronía probada).
  Supuesto no verificado: los ensambles cuentan por modelo, no por miembro.
- **Siguiente:** T-64 y T-63.

### 2026-11-14 · T-61 Accesibilidad, daltonismo y móvil
- **Hecho:** `axe-core` (devDependency, MPL-2.0) en `a11y.test.tsx`: app, Precisión, Riesgo + focos, rayos, alertas
  y Metodología sin violaciones. `ui/contrast.test.ts`: contraste AA leído del CSS (texto ≥ 4,5:1, marcas ≥ 3:1) y
  simulación de daltonismo (protanopía, deuteranopía, tritanopía) con ΔE ≥ 12 entre tonos vecinos.
- **Cambios:** insignias de acuerdo `#34c3a0` / `#f0e442` / `#f28c64` (antes alto/bajo ΔE 6 con deuteranopía y
  medio/bajo ΔE 4 con protanopía); casillas de 18 px y deslizadores de 24 px; selector «Ver un foco» (20 más
  intensos) como alternativa de teclado al mapa; texto de Riesgo para pantallas táctiles.
- **Móvil 360 px** (iframe en Chrome): ninguna pestaña se desborda; solo enlaces dentro del texto quedan < 24 px
  (exentos en WCAG).
- **Verificado:** 270 pruebas web, tsc, lint, build.
- **Siguiente:** T-62.

### 2026-11-14 · T-60 Metodología completa → **Fase 5 iniciada**
- **Hecho:** `MethodologyTab` reescrita (13 secciones e índice), diferida; `core/methodology.ts` con las constantes del
  pipeline y `pipeline/tests/test_methodology_sync.py`. Referencias con DOI comprobados en Crossref/Zenodo (GLM,
  VIIRS, MODIS, Open-Meteo) y obras de verificación y de Fosberg/Simard.
- **Verificado:** 120 pruebas del pipeline, 261 web, tsc, lint, build (inicial **90,5 KB**, baja 3,7 KB al diferir
  Metodología). En Chrome: índice con anclas, sin desborde horizontal.
- **Siguiente:** T-61.

### 2026-11-14 · T-55 Rayos GOES-19 GLM
- **Hecho:** `lightning.py` (+ `h5py`), `rayos.yml` (cada 10 min, rama `rayos`), `web/src/lightning/` (datos,
  `useLightning` con refresco y conservación ante fallos, `LightningPanel` en Mapa), `map/lightning.ts`.
- **Con datos reales:** 43–44 archivos por ventana de 15 min, 0 fallidos, 1 270–1 400 descargas a mediodía, ~30 KB,
  ~28 s. En Chrome los rayos caen sobre los topes fríos del infrarrojo (Caribe, Pacífico, Vichada); consola limpia.
- **Verificado:** 118 pruebas del pipeline, 260 web, tsc, lint, build (inicial 94,2 KB). raw.githubusercontent:
  `access-control-allow-origin: *`, `max-age=300`.
- **Siguiente:** T-54 (opcional) o fase 5.

### 2026-11-14 · T-52 Focos de calor NASA FIRMS
- **Hecho:** `fires.py` (3 sensores, 48 h, recorte a Colombia, departamento, confianza, clave oculta en errores),
  paso en `grids.yml` (sin secreto: aviso y se omite), `web/src/fires/` (datos, `useFires`, `useFireWind` con
  `loadPointForecast` diferido, `FiresSection`), `map/fires.ts` (círculos + flecha de líneas), clic y rótulo en
  `MapView`.
- **Con datos reales (14/11):** 291 focos en Colombia en 48 h (Vichada 78, Antioquia 44, Meta 42…); 278 de confianza
  nominal. `fires.json` 45 KB; comprobado que no contiene la clave. SNPP sin datos desde el 02/11.
- **Verificado:** 113 pruebas del pipeline, 252 web, tsc, lint, build (inicial 93,2 KB; Riesgo 3,5 KB). En Chrome:
  foco en Meta → «tendería a avanzar hacia el este», tabla +6/+12/+24 h y flecha; consola limpia.
- **Secreto:** `FIRMS_MAP_KEY` guardado en el repositorio con `gh secret set` (valor por stdin desde `pipeline/.env`).

### 2026-11-14 · T-53 Alertas por punto (página abierta)
- **Hecho:** `core/alerts.ts` (reglas, `checkAlerts` 24 h, clave por día local, texto), `alerts/useAlerts.ts`
  (revisión al activar y cada 15 min, `localStorage`, Notification si hay permiso), `AlertsSection` en «Mi punto» y
  `AlertBanner` en `App`. `loadPointForecast` se extrajo de `usePointForecast` (mismo consenso que el panel) y se
  importa en diferido.
- **Verificado:** 240 pruebas web, tsc, lint, build (inicial 91,6 KB gzip). En Chrome con Cali y umbral de 20 °C: aviso
  en la página («Temperatura de hasta 28 °C desde sáb 11:00 a. m.»), al recargar la configuración sigue y no se repite
  el aviso; desactivada y `localStorage` limpio después. No se pidió el permiso de avisos del sistema (diálogo del
  navegador): queda para que el usuario lo pruebe.
- **Siguiente:** T-52 (MAP_KEY de FIRMS del usuario) o T-55.

### 2026-11-14 · T-51 Pestaña Riesgo
- **Hecho:** `risk/data.ts` (niveles por vista y momento, GeoJSON de celdas, resumen, rótulo), `useRisk`,
  `RiskTab` (diferida), `map/risk.ts` (capa `fill` bajo departamentos; rótulo al pasar el cursor en `MapView`).
  `Segmented` pasó a `ui/` (lo usan Precisión y Riesgo). El pipeline añade el departamento de cada celda.
- **Con el run real 14/11 12Z:** peor de 72 h → 98 celdas con incendio moderado (Vichada 52, La Guajira 21, Meta
  20…), ninguna alta; calor > 35 °C sobre todo en Amazonas y Caquetá (GFS; tomarlo como orientación).
- **Verificado:** 227 pruebas web, tsc, lint, build (inicial 90,2 KB gzip; Riesgo 2,1 KB aparte); 106 del pipeline.
  En Chrome: celdas, rótulo («Vichada · máx. 72 h · Fosberg 26 (moderado)…»), vistas y deslizador; consola limpia.
- **Siguiente:** T-52 (FIRMS, requiere MAP_KEY del usuario) o T-53.

### 2026-11-14 · T-50 Riesgo meteorológico (pipeline) → **Fase 4 iniciada**
- **Hecho:** `risk.py` (Fosberg/Simard, lluvia en 3 h desde PRATE promedio, peligros por umbral, celdas sobre
  Colombia) integrado en `encode_run` (GFS) y en `validate_run`; RH a 2 m y PRATE promedio en `grids.FIELDS`
  (`GridStep.windows` guarda la ventana de los promedios). Fixtures nuevas `gfs_bogota_rh_f003/f006`.
- **Con el run real 14/11 12Z:** 1 622 celdas × 25 pasos; FFWI mediana 1–3 (temporada de lluvias), máx. 44 en La
  Guajira; lluvia > 20 mm/3 h en ≤ 3 celdas; calor > 35 °C en hasta 189 celdas (Caribe/Llanos); viento > 60 km/h en
  ninguna. `risk.json` 685 KB (140 KB gzip). Actualización completa en 50 s.
- **Verificado:** 105 pruebas del pipeline, ruff.
- **Siguiente:** T-51 (pestaña Riesgo).

### 2026-11-14 · T-49 Red oficial de tu ciudad → **código de la fase 3 completo**
- **Hecho:** `web/src/data/cityNetworks.json` + `cityNetworks.ts` (`officialNetworkAt`, `citiesByStatus`); enlace en el
  panel de punto bajo el encabezado; sección «Redes locales de ciudad» en Precisión (también si falla `precision.json`).
- **Regla RF-14 en código:** solo `estado: "verificada"` se enlaza; Pereira (`caida`) y Bucaramanga (`no_verificada`)
  aparecen sin enlace. Los 4 sitios enlazados respondieron 200 el 14/11.
- **De paso:** la prueba de hora de run del panel usaba un run fijo (13/11 06:00) que hoy ya era «atrasado» → ahora
  relativo a la hora actual. Texto obsoleto en Precisión («pasará a ponderar (T-45)») actualizado.
- **Verificado:** 214 pruebas web, tsc, lint, build (inicial 87,2 KB gzip); en Chrome, Medellín muestra el enlace a
  SIATA y la lista de Precisión no se desborda; consola limpia.
- **Siguiente:** subir el código (cuando el usuario lo pida) o fase 4.

### 2026-11-14 · T-48 Reconfirmar Pereira y Bucaramanga
- **Hecho:** comprobación HTTP/DNS y búsqueda web de ambas redes; spec 04 actualizado con el estado y la fecha.
- **Pereira (UTP/CARDER):** `redhidro.org` sigue registrado (whois ACTIVE) pero sin registros DNS; las rutas de UTP dan
  404 y no apareció un sitio sucesor. → **No verificada.**
- **Bucaramanga (CDMB):** la web (SPA Angular) no enlaza visor ni datos de sus 19 estaciones; el propio plan de acción
  2024–2027 de la CDMB cita la falta de información en tiempo real. → **No verificada.**
- **Consecuencia:** sin enlace en el panel de punto (RF-14); en Precisión se listarán como «sin red local verificada».
- **Siguiente:** T-49.

### 2026-11-13 · T-47 Red IDEAM y verificación por red
- **Tareas:** T-47 ✅
- **Hecho:** `sources/ideam.py` (SoQL hora en punto, lluvia por hora, hora local → UTC, m/s → km/h, QC, selección
  de estaciones con altitud del DEM, nombres limpios); `data/stations-ideam.json` (211 estaciones); `verify.py`
  por red (`--red`, `pares/<red>/`, `load_stations`); `metrics` con `dias_por_red` y fuentes por red; `daily.py` por
  red con retraso de IDEAM, ritmo de Open-Meteo, espera tras 429 y presupuesto por corrida; web: selector de red;
  Metodología y `verify.yml` (45 min) actualizados.
- **Datos reales:** IDEAM 8–11/11 (~14 800 pares/día, 3–4 min/día); un intento sin ritmo dio HTTP 429 (de ahí el
  ritmo). Hora verificada: MAE ICON 1,6 °C con conversión vs 3,2 sin ella. IDEAM 7 días: ICON 1,6 · IFS 1,6 · UKMO
  1,7 … JMA 2,3 °C (algo peor que METAR, estaciones rurales y datos preliminares).
- **Verificado:** pipeline 94 ✓, web 205 ✓, lint, build; Chrome: selector IDEAM (211 estaciones en mapa y lista,
  «Preliminar: 4 días», fuente IDEAM), detalle de Lloro (GEM 0,9 °C primero); consola limpia.
- **Pendiente / siguiente paso:** T-48, T-49.

### 2026-11-13 · T-46 Acceso a datos de redes locales
- **Tareas:** T-46 ✅
- **Método:** consultas directas a CKAN de Bogotá, catálogo Socrata y SoQL de datos.gov.co, endpoints del SAB; lectura
  de los sitios de SIATA y CDIAC con dos subagentes web; búsquedas.
- **Resultado:** IDEAM integrable (CC BY-SA 4.0, ~500/326/324 estaciones de lluvia/temperatura/viento, lote diario);
  SAB con foto en vivo CC BY-NC sin histórico; SIATA sin API ni licencia (descarga deshabilitada, datos por correo);
  CDIAC con login y «algunos derechos reservados»; CVC con dataset abierto detenido en mayo de 2025.
- **Hallazgos para T-47:** hora local en IDEAM (verificado con METAR SKBO), duplicados, viento en m/s, cobertura
  desigual, datos preliminares.
- **Pendiente / siguiente paso:** T-47 `sources/ideam.py`; decidir si se piden accesos por correo.

### 2026-11-13 · T-45 Consenso ponderado por precisión
- **Tareas:** T-45 ✅ (activación real cuando la verificación llegue a 14 días)
- **Hecho:** `core/verifiedWeights.ts` (distancia, estación más cercana, reglas de activación con motivo exacto,
  pesos por variable, normalización); `consensusSeries(forecast, base, byVariable)`; `usePointForecast` carga
  resumen + detalle de la estación (fallos → pesos iguales); panel: «ponderado por precisión» y tabla de pesos en
  «¿Por qué este número?»; Metodología explica la regla con las constantes del código.
- **Verificado:** 204 pruebas web ✓ (10 nuevas: reglas, peso medio para modelos sin muestra, consenso por variable,
  panel con 14 días → pesos 16 % vs 13 % igual y temperatura 15,3 vs 15,4), lint, build, bundle 87,5 KB, cobertura
  core 98,7 %. Chrome (Bogotá, datos reales): «SKBO a 13 km… lleva 10 de 14 días: por ahora todos pesan igual»;
  consola limpia.
- **Pendiente / siguiente paso:** T-46…T-49 (redes locales) o subir el código para que la verificación acumule días.

### 2026-11-13 · T-44 Pestaña Precisión
- **Tareas:** T-44 ✅
- **Hecho:** `web/src/precision/` (tipos y carga con caché, ranking recalculado en el cliente para día 1 y 2, mejor
  modelo por estación, formato es-CO), `PrecisionTab` diferida (ventana/variable/lead, tabla regional, aviso
  preliminar, fuente+red+ventana+hora, leyenda, lista de 43 estaciones, detalle por estación), `map/stations.ts`
  (círculos por mejor modelo, hueco si no hay muestra, clic y rótulo); `App` conecta pestaña ↔ mapa.
- **Verificado:** 194 pruebas web ✓ (14 nuevas), lint, formato, build; bundle inicial 85,4 KB (pestaña: chunk de
  2,8 KB); cobertura core 98,35 %. Chrome con 7 días reales: ranking ICON 1,3 · UKMO 1,4 · AIFS 1,5 °C; clic en el
  mapa abre SKVV (ICON/UKMO 1,1 °C); lluvia igual a la del pipeline (UKMO CSI 0,30); 10 estaciones sin muestra de
  lluvia en 7 días; consola limpia.
- **Pendiente / siguiente paso:** T-45 (pesos del consenso + «¿Por qué este número?»).

### 2026-11-13 · T-43 Verificación diaria (en local)
- **Tareas:** T-43 ✅ (código y workflow; 1.ª corrida en GitHub pendiente por decisión de seguir en local)
- **Hecho:** pares en `.csv.gz` reproducible (`verify.write_pairs/read_pairs`, archivos locales convertidos: 2,8 MB →
  572 KB); `metrics.write_web` (resumen + `precision/<ICAO>.json`, borra estaciones retiradas); `daily.py` (días
  faltantes de los últimos 10, tolera fallos, `verificacion-status.json`, código 1 si algo falló); `verify.yml` (03:30
  UTC, rama `data` con historial); `deploy.yml` copia `data/web/` a `/data`.
- **Verificado:** 81 pruebas pipeline ✓; `daily` real → `out/web/data/precision.json` 64 KB (6 KB gzip) + 43 estaciones;
  simulación local del workflow (rama `data` nueva en carpeta temporal, commit, segunda corrida) ✓.
- **Pendiente / siguiente paso:** T-44 página Precisión.

### 2026-11-13 · T-42 Métricas de precisión
- **Tareas:** T-42 ✅
- **Hecho:** `metrics.py`: MAE/sesgo/RMSE, POD/FAR/CSI/sesgo de frecuencia; región, red y estación; ventanas 7 y 30 días;
  solo horas con los 8 modelos; ranking (≥ 24 pares) → `out/verify/precision.json` (schema 1).
- **Datos reales:** pares del 3 al 12/11 (10 días, ~2 600 pares/día). Se probaron umbrales de lluvia con datos reales
  (por hora 0,1–1 mm vs bloques de 6 h 0,5–3 mm) → bloques de 6 h ≥ 1 mm.
- **Resultado 7 días (6–12/11, día 1, no definitivo):** temperatura ICON 1,34 · UKMO 1,43 · AIFS 1,45 · IFS 1,49 · GEM
  1,66 · Météo-France 1,71 · JMA 1,93 · GFS 2,12 °C. Viento ICON 3,57 … JMA 4,64 km/h (todos subestiman). Lluvia CSI
  UKMO 0,30 · AIFS 0,28 (pero anuncia lluvia 3,2×) · IFS 0,26 … Météo-France 0,20. Mejor modelo de temperatura por
  estación: AIFS en 14, ICON en 9, Météo-France en 7.
- **Verificado:** 78 pruebas pipeline ✓ (valores calculados a mano).
- **Pendiente / siguiente paso:** subir el código + T-43 para que el histórico empiece a crecer solo.

### 2026-11-13 · T-41 Pares observación–pronóstico
- **Tareas:** T-41 ✅
- **Exploración real:** Previous Runs acepta los 8 modelos con `_previous_day1/2` y varias ubicaciones por llamada;
  METAR histórico con `date=…&hours=…`; **tope oculto de 400 registros** (afectaba también a T-40: se regeneró
  `stations.json`, misma lista de 43).
- **Hecho:** `metar.py` (cliente compartido: lotes, tope, reintentos; lluvia desde `wxString` y RE…; nudos→km/h),
  `verify.py` (observación horaria con QC, Previous Runs con altitud, pares CSV); `stations.py` usa `metar.py`.
- **Verificado:** 71 pruebas pipeline ✓ (incl. sincronía de modelos con `web/src/core/models.ts`). Corrida real del
  12/11: 2 583 pares, 42 estaciones (SETU sin METAR en punto), 54 s. Muestra de un día (no concluyente): MAE
  temperatura día 1 de ICON 1,37 · AIFS 1,45 · UKMO 1,49 · IFS 1,52 … GFS 2,14 (sesgo −1,1 °C); viento 3,6–4,8 km/h,
  todos subestiman.
- **Pendiente / siguiente paso:** T-46 (redes locales) o T-42 (métricas y ventanas 7/30 días).

### 2026-11-13 · T-40 Estaciones METAR → **Fase 3 iniciada**
- **Tareas:** T-40 ✅
- **Exploración real:** `stationinfo?bbox` = 134 estaciones en la región (47 CO); METAR 24 h: 37/38 de Colombia
  reportan (solo SKSV muda); un lote de 40 ids respondió 504.
- **Hecho:** `pipeline/src/windcloud_pipeline/stations.py` (catálogo + conteo de reportes en lotes de 20 con
  reintentos, distancia a la frontera con la unión de departamentos, departamento por punto) →
  `pipeline/data/stations.json`: 43 estaciones (37 CO en 27 departamentos + SETU, SENL, SECO, SETN, SVMC, SBTT).
  Specs 02 §6, 03, 04 actualizados.
- **Verificado:** 6 pruebas nuevas (sin red) ✓; corrida real ✓.
- **Pendiente / siguiente paso:** T-41 `verify.py`.

### 2026-11-13 · T-31 ECMWF Open Data → **Fase 2 completa**
- **Tareas:** T-31 ✅ — fase 2 queda 8/8.
- **Exploración real:** índice JSON + rangos; 11 campos disponibles (incl. ráfaga, nubes, lluvia, temperatura, presión);
  metadatos distintos a GFS (tcc fracción, 10fg máx. 1 h, entireAtmosphere); latencia ~7,5 h.
- **Hecho:** `grids.read_step(fields)` con tipo de paso, `grids.crop`; `ecmwf.py` (run, índice, rangos con reintentos,
  validación GRIB, lector que recorta y normaliza); `encode_run(reader=…)` y escalares opcionales; `update --modelo`
  (ambos modelos, validación desde `meta.json`, borrado de GRIB crudos); `grids.yml` publica ambos; web con selector
  GFS/ECMWF (`useForecastGrid(model)`), aviso por modelo, Metodología, README y 04 con atribución «© ECMWF».
- **Verificado:** pipeline 46 ✓ (fixtures ECMWF reales recortados de 6 KB), web 180 ✓. Run real ECMWF 06Z publicado
  (25 pasos, 6,8 MB, 10,5 min). Chrome: GFS 12Z (+6 h) y ECMWF 06Z (+12 h) a la misma hora válida, sin avisos,
  temperatura/viento ECMWF coherentes, consola limpia.
- **Pendiente:** subir código (T-33/T-04); fase 3.

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
