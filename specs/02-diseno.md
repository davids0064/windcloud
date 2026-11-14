# 02 · Diseño técnico — WindCloud

Referencias: requisitos en `01-requisitos.md`, fuentes en `04-fuentes-de-datos.md`.

## 1. Arquitectura general (costo $0)

```
 ┌─────────────────────────── GitHub Actions (cron, gratis) ───────────────────────────┐
 │  job:grids   cada 6 h  → descarga GRIB2 (GFS NOMADS, ECMWF Open Data)               │
 │                        → genera texturas PNG de viento + metadatos JSON              │
 │  job:verify  cada día  → baja observaciones METAR/IDEAM + pronósticos archivados     │
 │                        → calcula MAE/sesgo por modelo → precision.json               │
 │  job:risk    cada 6 h  → índice de Fosberg y alertas por celda → risk.geojson        │
 └──────────────┬───────────────────────────────────────────────────────────────────────┘
                │ publica artefactos estáticos
                ▼
 ┌────────────────────────────── Cloudflare Pages (gratis) ─────────────────────────────┐
 │  /           app React (Vite)                                                         │
 │  /data/{model}/{run}/wind_{nivel}_{hhh}.png · {escalar}_{hhh}.png · meta.json            │
 │  /data/precision.json  /data/risk.geojson  /data/stations.json                        │
 └──────────────┬───────────────────────────────────────────────────────────────────────┘
                ▼
 ┌─────────────────────────────── Navegador del usuario ────────────────────────────────┐
 │  MapLibre GL + deck.gl ── capas: viento (WebGL), nubes (NASA GIBS), radar, riesgo     │
 │  Panel de punto ── fetch directo a Open-Meteo (CORS abierto): forecast + ensemble     │
 │  Motor de consenso (TS puro) ── usa precision.json para ponderar                      │
 └───────────────────────────────────────────────────────────────────────────────────────┘
```

**Publicación de rejillas (T-33):** `grids.yml` (cron +4 h 45 min tras cada run y reintento +1,5 h) ejecuta
`uv run python -m windcloud_pipeline.update`: busca el run más reciente completo; si ya está publicado no hace nada;
si no, descarga, codifica en carpeta nueva, **valida** (todos los PNG/GeoJSON) y solo entonces cambia `latest.json` y
borra runs viejos (conserva 2, nunca el vigente). `status.json` registra cada intento. El resultado vive en la rama
**`grids` con un solo commit** reemplazado con `push --force` (sin historial que crezca: ~6,6 MB). Si falla, el
workflow queda en rojo y la rama no se toca. `deploy.yml` copia esa rama a `/data` del sitio.

**Decisión clave:** no hay servidor siempre encendido. Todo lo pesado se pre-calcula en Actions y se
sirve como archivos estáticos. Lo específico del usuario (su punto) se consulta desde el navegador.

> Si el tamaño de las texturas supera los límites de Pages (archivos ≤ 25 MiB, 20 000 archivos),
> usar **Cloudflare R2** (10 GB gratis) como almacén de `/data`.

## 2. Stack
| Capa | Elección | Motivo |
|---|---|---|
| Frontend | React 19 + TypeScript 7 + Vite 8 | Igual que fuego.huella.world; ecosistema grande |
| Calidad web | oxlint + Prettier + Vitest (jsdom, Testing Library) | oxlint viene con el template de Vite; typescript-eslint aún no soporta TS 7 |
| Mapa base | **MapLibre GL JS 6** (worker vía `setWorkerUrl` + `?url` de Vite) | Libre (BSD), sin token; v5 descartada por aviso crítico de XSS |
| Capas de datos | **deck.gl 9.4** (`MapboxOverlay` intercalado sobre MapLibre) + adaptador `map/deckCompat.ts` | Hexágonos, heatmaps, GeoJSON, 3D; el adaptador cubre `map.transform` que MapLibre 6 quitó |
| Viento animado | Capa WebGL propia basada en la técnica de `webgl-wind` (licencia ISC) | Gratis, sin dependencias comerciales |
| Gráficas | uPlot (ligero) o Recharts | Series multi-modelo |
| Estado/datos | TanStack Query (caché 30 min, RNF-5) + Zustand | Simple |
| Estilos | CSS variables, tema oscuro `#0b0d10` | Coherente con la referencia |
| Procesado GRIB | Python 3.12 (`uv`) + `xarray` + `cfgrib` + `eccodes`/`eccodeslib` (ruedas binarias, sin apt) + `numpy` + `Pillow`; pytest + ruff | Estándar en meteorología |
| Verificación | Python con biblioteca estándar (csv, gzip, statistics); pares `pares/*.csv.gz` en rama `data` (T-43) | Sin base de datos ni pandas/pyarrow |
| Hosting | Cloudflare Pages (o GitHub Pages) | Gratis |
| Programación | GitHub Actions (repo público = minutos ilimitados) | Gratis |

## 3. Estructura del repositorio
```
windcloud/
├─ specs/                     # estos documentos SDD
├─ web/                       # app React
│  ├─ src/
│  │  ├─ map/                 # MapView, layers/{WindLayer,CloudLayer,RadarLayer,RiskLayer}.ts
│  │  ├─ point/               # PointPanel, ModelChart, AgreementBadge
│  │  ├─ precision/           # PrecisionDashboard, StationMap
│  │  ├─ core/                # consensus.ts, agreement.ts, units.ts, sources.ts  (TS puro, testeado)
│  │  ├─ api/                 # openMeteo.ts, gibs.ts, radar.ts, staticData.ts
│  │  └─ pages/               # Mapa, MiPunto, Precision, Riesgo, Metodologia
│  └─ public/geo/             # departamentos Colombia (generado por pipeline geo.py; excluido de Prettier)
├─ pipeline/                  # Python (proyecto uv, paquete windcloud_pipeline)
│  ├─ src/windcloud_pipeline/
│  │  ├─ grids.py             # GRIB → PNG viento
│  │  ├─ verify.py            # verificación de modelos
│  │  ├─ risk.py              # índices de riesgo
│  │  ├─ geo.py               # departamentos: geoBoundaries → coverage_simplify → GeoJSON ≤ 300 KB
│  │  └─ sources/             # adaptadores de redes locales
│  └─ tests/
└─ .github/workflows/{ci,deploy,grids,verify,risk}.yml
```

## 4. Capas del mapa

### 4.0 Mapas base (RF-1) — `web/src/map/basemaps.ts`
Un solo estilo vectorial (OpenFreeMap `dark`) y los modos se alternan con visibilidad de capas, sin `setStyle`
(así no se pierden las capas de datos):
- **Oscuro:** estilo `dark` tal cual (incluye fronteras de países y límites de estado de OSM).
- **Satélite:** raster EOX Sentinel-2 cloudless 2020 justo sobre el fondo; se ocultan los rellenos (`fill`), se
  conservan líneas y nombres (fronteras, ríos, nombres en español).
- **Relieve 3D:** la misma imagen satelital EOX sobre terreno `raster-dem` Terrarium (AWS) → `setTerrain` ×1,5,
  cámara a 45°. Sin sombreado artificial: la imagen ya trae la luz y sombra reales (decisión del usuario: conservar
  los colores del satélite).
- **Paleta propia** (`map/palette.ts`): el `dark` original es casi negro; se aclara a gris pizarra azulado
  (tierra `#36424f`, agua `#1f3044`, fronteras `#aab5c1`, nombres ≥ 4,5:1 de contraste, probado en Vitest).
- **Nombres en español:** capas `place_*` y `water_name` usan `coalesce(name:es, name:latin, name)`; las vías
  conservan su nombre local.

### 4.0.2 Departamentos (RF-1, T-11) — `web/src/map/departments.ts`
- Datos: `pipeline/src/windcloud_pipeline/geo.py` descarga geoBoundaries ADM1 (commit fijo), aplica
  `shapely.coverage_simplify` (0,01° ≈ 1,1 km; fronteras compartidas sin huecos ni solapes), redondea a 4 decimales
  y normaliza nombres ("Bogotá D.C.", "San Andrés y Providencia"). Falla si supera 300 KB.
- Capas nativas MapLibre bajo los nombres: relleno invisible (resaltado con `feature-state` al pasar el cursor),
  halo oscuro + línea clara (legible en oscuro y satélite). Tooltip con el nombre; el clic informa el departamento.

### 4.0.1 Buscador (RF-13) — `web/src/search/PlaceSearch.tsx`, `web/src/api/geocoding.ts`
- Open-Meteo Geocoding (`language=es`, `count=8`), debounce 300 ms, mínimo 2 letras, caché en memoria,
  `fetchJson` con 8 s de tiempo límite + 1 reintento (§10). Solo se envía el texto buscado (RNF-8).
- Combobox ARIA (flechas, Enter, Escape), bandera, contexto "departamento, país", tipo y fuente visible (P2).
- Tipo por código GeoNames: `PCL*` país (zoom 5, sin marcador), `ADM*` región (7), `PPL*` ciudad (10, marca el punto).

### 4.1 Viento (RF-2)
- **Fuente:** GFS 0.25° (NOMADS, filtro `filter_gfs_0p25.pl` para bajar solo `UGRD`/`VGRD` a 10 m, 850, 500 hPa)
  y ECMWF Open Data 0.25° (`10u`, `10v`, `u`, `v` en niveles de presión).
- **Descarga GFS (T-30, `pipeline/src/windcloud_pipeline/grids.py`):** un GRIB2 por paso (0–72 h cada 3 h) con
  UGRD/VGRD (10 m, 850, 500 hPa), GUST, TCDC (atmósfera completa) y PRATE. **Región por defecto «colombia»**
  (lon −100…−50, lat −20…25; rejilla 201 × 181 a 0,25°): ~650 KB/paso, 16,5 MB/run frente a ~216 MB global
  (opción `--region global`). Run = el más reciente cuyo f072 ya tiene `.idx` publicado. Pausa de 1 s entre
  peticiones, reintentos 5/15/45 s ante 5xx/429/red, 404 sin reintento, validación `b"GRIB"` (NOMADS devuelve HTML
  en errores), escritura atómica y reanudación; `download.json` con run, región y pasos.
- **Valores instantáneos:** desde f003 GFS envía PRATE y TCDC dos veces (instantáneo y promedio); los promedios se
  reinician cada 6 h (ventanas de 3 y 6 h mezcladas), así que se usa siempre el instantáneo (también existe en f000).
  La capa de lluvia se rotula «tasa instantánea (mm/h)». Rejilla normalizada a filas norte → sur, lon −180…180.
- **Codificación PNG (T-32, `pipeline/src/windcloud_pipeline/encode.py`):** viento RGBA con R = u, G = v (m/s)
  normalizados a [0,255] con `uMin/uMax/vMin/vMax` **por imagen** en `meta.json` (técnica de webgl-wind), A = 0 sin
  dato; niveles `10m`, `850`, `500`. Escalares en gris + alfa con **rango fijo** para colorear siempre igual con
  `raster-color`: ráfagas 0–150 km/h (= máx(GUST, viento 10 m), porque GFS a veces da GUST < viento), nubosidad
  0–100 %, lluvia 0–50 mm/h en escala **raíz cuadrada** (resolución en lloviznas).
- **Proyección:** filas remuestreadas a espaciado uniforme en **Web Mercator** (`"projection": "mercator-rows"`),
  así la imagen se pega por sus 4 esquinas sin error; una imagen lat/lon se desplazaría hasta ~42 km (> 1 celda).
- **Salida:** `out/web/data/{modelo}/{run}/` con `wind_{nivel}_{hhh}.png`, `{gust|tcc|prate}_{hhh}.png` y
  `meta.json` (schema 1: run, `validTimes`, `bounds`, ancho × alto, rangos por cuadro, escalas y fórmula de
  decodificación). Escritura atómica (carpeta `.tmp` → renombrar). Run real Colombia: 25 pasos × 6 = 150 PNG,
  **5,7 MB**, 201 × 186 px, 2,7 s.
- **Render (T-34, `web/src/wind/`):** `WindLayer` = CustomLayerInterface WebGL2 de MapLibre. En `prerender`:
  estela atenuada (×0,955) + partículas dibujadas en una textura de pantalla, y avance de partículas en la GPU
  (posiciones en RGBA8 con ping-pong); en `render` se compone sobre el mapa (premultiplicado). Matriz:
  `defaultProjectionData.mainMatrix`; posiciones en Mercator 0–1 (exacto porque la rejilla tiene filas Mercator).
  Velocidad: `uv = v·0,18 / (512·2^zoom·span)` → avance constante en pantalla a cualquier zoom. Reaparición solo en la
  zona visible; estela borrada al mover el mapa. Se guarda/restaura framebuffer, viewport y VAO.
- **Color:** viridis aclarada (`#968ce0` → `#fde725`), luminosidad monótona (daltonismo) y contraste ≥ 3:1 con la
  tierra del mapa oscuro (probado): la versión oscura hacía invisible el viento flojo tierra adentro. Máximo de color
  por nivel: 15 / 25 / 40 m/s (10 m / 850 / 500 hPa). Partículas: móvil 8 000, escritorio 40 000, mitad si < 30 fps
  sostenido (RNF-3). Medido: 60 fps con 40 000 a 2500 × 1858 px.
- **Datos:** `/data/{modelo}/latest.json` → `meta.json` → PNG del paso más cercano a ahora (decodificado con
  `premultiplyAlpha: 'none'`, `colorSpaceConversion: 'none'`). En desarrollo los sirve
  `web/vite-plugin-local-data.ts` desde `pipeline/out/web/data`. Sin datos → «Sin datos de viento».
- **Línea de tiempo y nivel (T-35, `useWindField` + `WindPanel`):** selector de altura (10 m · 850 hPa ~1,5 km ·
  500 hPa ~5,5 km; la leyenda usa el máximo de color del nivel), deslizador de los 25 pasos (0–72 h) con hora válida
  local, «dentro de / hace X h», adelanto «+N h del run» y marca de «ahora»; ▶ avanza un paso cada 0,9 s en bucle.
  Las imágenes se guardan en caché por nivel y paso y se precargan los 25 pasos del nivel elegido (~1,2 MB). Cambiar
  solo la hora conserva la estela (sin parpadeo); cambiar de nivel la borra. Selector de modelo: solo GFS (se indica
  que ECMWF llega con T-31). Medido: 48 fps reproduciendo, 60 fps quieto.
- **Limitación conocida:** en Relieve 3D las partículas van a nivel del mar (no siguen el terreno).
- **Ráfagas:** de Open-Meteo no hay grid; usar `GUST` de GFS como textura escalar coloreada.

### 4.1.0 Segundo modelo: ECMWF Open Data (T-31) — `pipeline/src/windcloud_pipeline/ecmwf.py`
- `https://data.ecmwf.int/forecasts/{AAAAMMDD}/{HH}z/ifs/0p25/oper/…-{paso}h-oper-fc.grib2` (~101 MB global por
  paso) + `.index` (JSON por campo con `_offset`/`_length`). Se bajan por **rangos HTTP** solo 11 campos (10u, 10v,
  u/v 850 y 500, 10fg, tcc, tprate, 2t, msl): ~6 MB/paso, ~155 MB/run, ~10 min (275 peticiones, 0,2 s de cortesía).
- Normalización a las convenciones de GFS: `tcc` fracción → %; `10fg` es la **ráfaga máxima de la última hora**
  (`stepType` max) y en f000 no existe (se omite); `tprate` tasa instantánea; rejilla global recortada a la región.
  Mismos nombres de campo → mismo `encode_run` (con `reader`) y mismo `meta.json` (`/data/ecmwf/…`).
- `update --modelo todos` actualiza ambos; un modelo que falla no impide publicar el otro; los GRIB crudos se borran
  tras publicar. Validación basada en lo que declara `meta.json`.
- Web: selector **GFS / ECMWF** que cambia todas las capas de pronóstico; meta e imágenes en caché por modelo; al
  cambiar, se vuelve a la hora más cercana a ahora del run de ese modelo. Aviso de antigüedad por modelo según su
  latencia medida: GFS > 9 h, ECMWF > 14 h.

### 4.1.1 Capas de color e isobaras (T-36, RF-4, RF-5)
- **Pipeline:** además de viento, GFS aporta TMP 2 m (`2t`, K → °C, PNG −10…40 °C) y PRMSL (`prmsl`, Pa). Isobaras cada
  2 hPa con **contourpy** sobre la rejilla en grados, tras **suavizado binomial** (3 pasadas [1,4,6,4,1]/16): la
  presión reducida al nivel del mar sobre los Andes genera líneas falsas apretadas; sin suavizar pesaban 2,0 MB/run,
  suavizadas y simplificadas (shapely, 0,05°, 2 decimales) ~480 KB/run. `isobars_{hhh}.geojson` y bloque `isobars`
  en `meta.json`. Run Colombia completo: ~6,6 MB.
- **Web:** MapLibre 6 **no tiene `raster-color`**: protocolo `wcescalar://{var}/{ruta}` que decodifica el gris con la
  fórmula de `meta.json` (lineal o raíz) y aplica una tabla de 256 colores por variable (`layers/scalarStyles.ts`):
  ráfagas transparentes < 20 km/h → amarillo/rojo/magenta; nubosidad = velo blanco; lluvia tipo radar, transparente
  < 0,1 mm/h; temperatura divergente azul–amarillo–rojo (tipo RdYlBu). Imagen por 4 esquinas (exacta por filas
  Mercator). Isobaras: línea blanca (más gruesa cada 10 hPa) y etiqueta de hPa sobre la línea (Noto Sans).
- **Panel «Pronóstico»:** una sola línea de tiempo (0–72 h) para viento, capa de color (una a la vez) e isobaras;
  leyenda por capa con marcas en su escala; una sola línea de fuente y run. Orden de capas: color < nubes < viento <
  isobaras < departamentos < nombres. Metodología explica la reproyección, la ráfaga y el suavizado.

### 4.2 Nubes observadas (RF-3) — `web/src/api/gibs.ts`, `web/src/map/clouds.ts`, `web/src/map/cloudAlpha.ts`
- **NASA GIBS WMTS EPSG:3857** (sin clave, CORS `*`). IDs leídos del `GetCapabilities` real (2026-11-13):
  `GOES-East_ABI_Band2_Red_Visible_1km` (Level7, zoom máx. 7) y `GOES-East_ABI_Band13_Clean_Infrared` (Level6, zoom máx. 6).
  Himawari/Meteosat para fuera de América: pendiente (Colombia primero).
- **Horas disponibles:** DescribeDomains `…/1.0.0/{capa}/default/{TMS}/all/{inicio}--{fin}.xml` (~400 B; el
  GetCapabilities pesa 5,8 MB). GIBS **declara horas antes de publicar sus teselas** (404): se comprueba la más
  reciente con una tesela z2 (2/1/1, cubre Colombia) y se descartan las no publicadas.
- **Animación:** 10 cuadros (3 h cada 20 min), una fuente raster por cuadro **creada bajo demanda**: al abrir solo el
  cuadro visible (~24 teselas); al reproducir, el resto (el visible primero). Animar = cambiar opacidad (700 ms/cuadro).
  Refresco cada 10 min. Precargar los 10 de entrada retrasaba ~15 s la imagen en Relieve 3D (más teselas por la inclinación).
- **Presentación:** las teselas llegan opacas; el protocolo `wcnubes://` (MapLibre `addProtocol`) convierte brillo en
  opacidad (visible 55→165, IR 105→200, *smoothstep*) y aclara el gris de las nubes hacia blanco (contraste sobre
  el satélite); en IR los píxeles de color (topes fríos/tormentas) quedan opacos e intactos. Solo cambia la visualización, no el dato. Va encima del mapa base y debajo de departamentos y nombres.
- **Panel:** chip "Observado", Apagado/Visible/Infrarrojo, reproducir y línea de tiempo, hora UTC + local + "hace X
  min", aviso "imagen atrasada" si > 2 h, "sin datos" si GIBS falla (nunca una imagen vieja), fuente visible.
- Nubosidad **pronosticada**: textura escalar de `TCDC` (GFS) rotulada "pronóstico".

### 4.3 Lluvia (RF-4)
- **Radar observado: no se integra (T-37, evaluado 2026-11-13).** RainViewer, único radar mundial gratuito, mantiene
  la API `public/weather-maps.json` (CORS `*`) pero desde 2026 solo para uso personal/educativo, 2 h pasadas, zoom
  máx. 7 (por encima devuelve «Zoom Level Not Supported»), un esquema de color, sin nowcast ni satélite, 100
  pet./min/IP. Su **máscara de cobertura** (negro opaco = sin radar; verificado con EE. UU. como control) marca sin
  cobertura Bogotá, Medellín, Cali, Barranquilla, Cartagena, Bucaramanga, Cúcuta, Pereira, Villavicencio y San
  Andrés; solo Leticia (radar de Brasil). Aunque su web lista 8 radares colombianos, no alimentan sus datos.
- En su lugar (RF-4 «si no hay radar, indicarlo y ofrecer alternativa»): aviso «No disponible para Colombia» en la
  pestaña Mapa, alternativas (capa Lluvia de GFS e infrarrojo GOES) y enlaces a radares oficiales (IDIGER-SAB, SIATA).
  Reevaluar si RainViewer recupera radares colombianos o si T-46 confirma acceso abierto a SAB/SIATA.
- Precipitación pronosticada: textura escalar `PRATE`/`APCP` de GFS.

### 4.4 Otras (RF-5)
- Rayos: GOES **GLM** (NOAA Open Data en AWS, `noaa-goes19` / `noaa-goes18`) → puntos últimos 15 min (job opcional cada 10 min; si excede minutos, omitir).
- Calidad del aire: Open-Meteo Air Quality API por punto (solo en panel de punto en v1).

## 5. Motor de consenso y acuerdo (RF-6, RF-7, RF-8) — `web/src/core/`

### 5.1 Modelos consultados (Open-Meteo, parámetro `models=`) — `web/src/core/models.ts`
Validados contra la API real el 2026-11-13 (Bogotá): `ecmwf_ifs` (9 km), `ecmwf_aifs025_single`, `gfs_seamless`,
`icon_seamless`, `gem_seamless`, `jma_seamless`, `meteofrance_seamless`, `ukmo_seamless` → **8 modelos independientes**.
- `ecmwf_ifs` (9 km) en vez de `ecmwf_ifs025` (28 km): mismo modelo, más resolución para terreno montañoso.
- **`metno_seamless` excluido:** fuera de Escandinavia MET Norway rellena con ECMWF IFS; en Bogotá fue idéntico a
  `ecmwf_ifs` (72/72 h) y contaría ECMWF dos veces. Salvaguarda en código: se descarta todo modelo cuya temperatura
  sea idéntica a otro (≥ 24 h comparables) y se informa como "duplicado".
- Sin `best_match` (no aporta un modelo distinto y consume cuota).
- Huecos reales: AIFS y JMA no dan ráfagas; ARPEGE llega a ~104 h y UKMO a ~164 h. Los `null` se excluyen por hora.
- **Hora del run (P2):** `https://api.open-meteo.com/data/{metaId}/static/meta.json` → `last_run_initialisation_time`
  (CORS `*`). `metaId` del componente global: `ecmwf_ifs`, `ecmwf_aifs025_single`, `ncep_gfs013`, `dwd_icon`,
  `cmc_gem_gdps_15km`, `jma_gsm`, `meteofrance_arpege_world025`, `ukmo_global_deterministic_10km`.
- Petición: `timeformat=unixtime`, `timezone=auto`, `wind_speed_unit=kmh`, coordenadas redondeadas a 0,01°, 7 días.
  Caché en memoria 30 min por punto (no se cachean errores).

Una sola petición HTTP con todos los modelos (cuenta como varias llamadas en el límite; ver RNF-6).

### 5.2 Consenso ponderado
```
w_m = 1 / (MAE_m(estación_más_cercana, variable, lead) + ε)      ε = 0.1
w_m = 1 para todos si no hay verificación a < 150 km o < 14 días de datos
consenso = Σ w_m · x_m / Σ w_m     (sobre modelos con valor no nulo)
```
- Dirección del viento: promediar **componentes u/v**, nunca grados directamente. La velocidad de consenso es la
  media ponderada de velocidades (el módulo del vector medio la subestimaría si los modelos discrepan en dirección).
  Vector medio < 0,5 km/h → dirección indefinida (null).
- Precipitación: mediana ponderada (robusta a un modelo que exagera).
- **Implementado (T-45, `core/verifiedWeights.ts`):** estación de `precision.json` más cercana (haversine) a ≤ 150 km;
  ventana de 30 días con ≥ 14 días de datos; MAE del pronóstico emitido 1 día antes (no hay verificación para plazos
  mayores, se usa el mismo peso en los 7 días). Temperatura ← MAE temperatura; viento, ráfagas y dirección ← MAE
  viento. **Nubosidad y lluvia con pesos iguales** (la nubosidad no se verifica; la lluvia solo como sí/no en
  bloques de 6 h, sin MAE comparable). Modelo con < 24 pares en la estación → peso medio del resto. Cualquier
  falta (sin `precision.json`, sin estación cercana, < 14 días, sin detalle) → pesos iguales con el motivo exacto
  («lleva 10 de 14 días»…). La carga de la verificación nunca rompe el panel de punto.
- «¿Por qué este número?»: motivo + tabla de peso normalizado por modelo (temperatura, viento) y referencia
  «igual sería 1/N». Encabezado del panel: «consenso de N modelos · ponderado por precisión».

### 5.3 Acuerdo
Dispersión `s` = desviación estándar entre modelos (para viento: de la velocidad).
| Variable | Alto | Medio | Bajo |
|---|---|---|---|
| Temperatura | s ≤ 1,0 °C | ≤ 2,5 °C | > 2,5 °C |
| Viento | s ≤ 3 km/h | ≤ 8 km/h | > 8 km/h |
| Nubosidad | s ≤ 15 % | ≤ 30 % | > 30 % |
| Lluvia (sí/no >0,5 mm) | ≥ 80 % de modelos de acuerdo | ≥ 60 % | < 60 % |
Ráfagas: mismos umbrales que viento. Resumen de un periodo: nivel más frecuente; empate → el más pesimista.
Umbrales en `core/agreement.ts`, ajustables y documentados en Metodología.

### 5.4 Probabilidad por ensamble — `web/src/api/ensemble.ts`, `web/src/core/probability.ts`
Open-Meteo **Ensemble API** (`models=ecmwf_ifs025,gfs025`, `hourly=precipitation`). Validado 2026-11-13: claves
`precipitation[_memberNN]_<sufijo>` con sufijos `ecmwf_ifs025_ensemble` (control + 50 = 51) y `ncep_gefs025`
(control + 30 = 31); se agrupan por patrón, no por nombre pedido. El sufijo es también el id de
`ensemble-api.open-meteo.com/data/{sufijo}/static/meta.json` (hora del run). Coste: 8,2 por consulta.
- `P(lluvia en el día) = miembros con acumulado diario > 1 mm / miembros con ≥ 90 % de horas con dato`, por día
  **local** del punto. **Hoy cuenta solo desde la hora en curso** ("resto del día"; si no, sumaría lluvia ya caída).
- Los ensambles **no se mezclan** (calibraciones distintas): una barra por ensamble y día.
  Acuerdo entre ensambles por diferencia en puntos: ≤ 15 alto · ≤ 30 medio · > 30 bajo (+ aviso).
- Consulta independiente del multi-modelo: si falla, el panel sigue y la sección dice "sin datos".
- Caso real Bogotá 13/11: ECMWF 51–82 % vs GEFS 97–100 % los primeros días → acuerdo bajo, se muestra el aviso.

## 6. Verificación (RF-9) — `pipeline/verify.py`
1. **Estaciones:** `pipeline/data/stations.json`, generado con `python -m windcloud_pipeline.stations`
   (se regenera a mano cuando cambie la red; no en cada corrida). Criterio: estaciones del catálogo
   `stationinfo` con METAR que dieron **≥ 6 reportes en las últimas 24 h**, en Colombia o a **≤ 100 km**
   de su frontera (unión de departamentos). Resultado 13/11/2026: **43** (37 CO en 27 departamentos,
   4 EC, 1 VE, 1 BR); fuera quedó SKSV (sin reportes). Campos: `icao, nombre, pais, departamento, lat,
   lon, elev_m, km_a_colombia, reportes_24h, red`. Muchos aeropuertos solo reportan de día (7–26/día),
   así que la verificación debe tolerar huecos nocturnos (afecta el umbral de 80 % de datos).
2. **Observaciones**, por prioridad de precisión:
   1. **Redes locales de ciudad** (SAB Bogotá, SIATA Medellín, CDIAC Manizales, CVC Cali) — ver
      `04-fuentes-de-datos.md`. Solo si ofrecen acceso programático permitido por sus términos.
      **Resultado T-46 (13/11/2026):** ninguna ofrece hoy un histórico abierto y vigente. SAB tiene una foto en vivo
      (CC BY-NC) sin histórico; SIATA y CDIAC no tienen API ni licencia abierta; el dataset de la CVC está detenido
      desde mayo de 2025. → Solo enlace (RF-14), salvo acceso concedido por solicitud.
      Cada red se integra con un adaptador `pipeline/sources/<red>.py` que normaliza a
      `{station_id, red, lat, lon, alt, time_utc, temp_c, precip_mm, wind_kmh}`.
   2. Estaciones **IDEAM** vía datos.gov.co (Socrata). **Sirve (T-46):** ~500 estaciones de lluvia y ~325 de
      temperatura y viento, lote diario completo del día anterior, CC BY-SA 4.0; hora local y datos preliminares.
   3. **METAR** `aviationweather.gov/api/data/metar` (JSON, gratis) cada hora — cobertura mínima garantizada.
   - Control de calidad: descartar valores fuera de rango físico, saltos imposibles y estaciones con < 80 % de datos en la ventana.
   - Las métricas se publican **por red**, para no mezclar redes de distinta calidad sin decirlo.
   - **Emparejado METAR (implementado, `metar.py` + `verify.py`):** por hora en punto UTC, el METAR de
     rutina más cercano (± 20 min) da temperatura (°C enteros) y viento (nudos × 1,852); lluvia sí/no =
     algún METAR/SPECI de la hora que termina con precipitación en `wxString` (DZ, RA, SN, GR…, con SH/TS;
     no VC ni TS sola) o tiempo reciente RE… en el reporte (antes de RMK). Sin METAR de rutina → hora sin
     dato. QC mínimo: temperatura −30…50 °C, viento 0…200 km/h. METAR pedido con `date=D_2359&hours=25`
     (la hora previa a 00Z sirve para la lluvia de la primera hora). La API corta en **400 registros**
     por respuesta: lotes de 10 que se parten en dos si tocan el tope.
3. **Pronósticos archivados:** Open-Meteo **Previous Runs API** (`temperature_2m`, `wind_speed_10m`,
   `precipitation` con `_previous_day1` y `_day2`) para los **8 modelos** del panel en una sola llamada por
   cada 10 estaciones, con `elevation=` = altitud de la estación (corrige la temperatura por altura) y
   `timezone=GMT` → evita tener que guardar nosotros cada run. Verificado: los 8 modelos responden.
   Salida diaria `pipeline/out/verify/pares/AAAA-MM-DD.csv`: `hora_utc, icao, red, variable, obs,
   <modelo>_d1, <modelo>_d2…` (lluvia: obs 0/1, pronóstico en mm de la hora anterior).
4. **Métricas** (`metrics.py`) por región, red y estación × modelo × variable × lead (día 1, día 2),
   ventanas 7 y 30 días que terminan ayer (UTC): MAE, sesgo (pronóstico − observado), RMSE; lluvia:
   POD (aciertos), FAR (falsas alarmas), CSI y sesgo de frecuencia.
   - **Mismas horas para todos:** solo cuentan las horas con pronóstico de los 8 modelos en ese lead.
   - **Lluvia en bloques de 6 h UTC**, no por hora: observado «sí» si algún METAR/SPECI del bloque tuvo
     precipitación; pronóstico «sí» si suma ≥ 1 mm en esas mismas horas; bloque válido con ≥ 3 horas de
     METAR. Medido con 7 días reales (6/11–12/11): por hora (≥ 0,1 mm) todos daban FAR 0,87–0,92 y CSI
     0,08–0,14; en bloques de 6 h ≥ 1 mm, CSI 0,20–0,30. Por hora el desfase de 1 h o de unos km cuenta
     como fallo y falsa alarma a la vez.
   - **Ranking:** MAE ascendente (temperatura, viento) y CSI descendente (lluvia), día 1; un modelo entra
     con ≥ 24 pares (horas o bloques). Por estación, la lluvia en 7 días casi nunca llega a 24 bloques →
     sin ranking de lluvia por estación en la ventana corta (honesto: no hay muestra).
   - Esquema `precision.json` v1: `{schema, generatedAt, hasta, fuentes, modelos, leads_dias, umbrales,
     estaciones[], ventanas: {"7"|"30": {dias[], region:{metricas, ranking}, redes:{…}, estaciones:{icao:
     {metricas, ranking}}}}}`. Pesa ~440 KB (~50 KB gzip): T-43/T-44 decide si se parte en resumen + detalle.
5. **Publicación diaria (T-43, `daily.py` + `verify.yml` a las 03:30 UTC):** completa los días sin pares de los
   últimos 10 (se recupera solo si un día falla), recalcula y escribe en la rama `data` (**con historial**, a
   diferencia de `grids`): `pares/AAAA-MM-DD.csv.gz` (~57 KB/día, gzip sin fecha → bytes reproducibles; nunca se
   borra), `web/precision.json` (resumen: región, redes y ranking por estación, ~64 KB / 6 KB gzip),
   `web/precision/<ICAO>.json` (detalle por estación, ~12 KB, se carga al abrirla) y
   `web/verificacion-status.json` (`checkedAt, hasta, verificados, fallidos, dias_ventana`). `deploy.yml` copia
   `web/` a `/data` del sitio; en local, `daily.py` escribe en `pipeline/out/web/data` (lo sirve Vite).
   Se eligió CSV.gz y no parquet: sin dependencias pesadas y suficiente para ~3 000 filas/día.
   Crecimiento de la rama: ~57 KB/día de pares + ~60 KB/día de JSON reescritos ≈ 40 MB/año.
6. Presupuesto de llamadas (medido en T-47): METAR 43 × 4,8 ≈ 210/día + IDEAM 211 × 4,8 ≈ 1 010/día ≈ 1 220/día.
   Las redes locales pueden sumar ~100 estaciones más: agrupar por celda de 0,1° (≈ 11 km), porque los modelos no
   distinguen estaciones más cercanas entre sí, y así se mantiene ≤ ~1 500 llamadas/día.

### 6.0.1 Red IDEAM y varias redes (T-47)
- `pipeline/src/windcloud_pipeline/sources/ideam.py`: SoQL a datos.gov.co (`sbwg-7ju4`, `sgfv-3yp8`, `s54a-sgyg`).
  Temperatura y viento: valor de la hora en punto (`date_extract_mm = 0`, duplicados promediados con `avg`); lluvia:
  `max` de las lecturas de [h, h+1) local → «llovió» en la hora que acaba en h+1. Hora local (UTC−5) → UTC
  (comprobado: sin convertir, el MAE de ICON sería 3,2 °C en vez de 1,6). Viento × 3,6. QC: rango (−10…45 °C,
  0…150 km/h), sensor pegado (todo el día igual), salto > 12 °C / 60 km/h frente a la mediana del día, lectura de
  lluvia > 25 mm.
- Estaciones (`--estaciones` → `pipeline/data/stations-ideam.json`, en git): temperatura, viento y lluvia en ≥ 20 h
  del día de referencia; una por celda de 0,25°; a ≥ 10 km de un METAR; altitud del DEM de Open-Meteo (Elevation
  API). 13/11/2026: **211** de 328 candidatas. Id `IDEAM-<código sin ceros>`.
- `verify.py --red METAR|IDEAM|todas`; pares en `pares/<red>/AAAA-MM-DD.csv.gz`; `NETWORK_LAG_DAYS` = METAR 1,
  IDEAM 2 (IDEAM publica el día local completo al día siguiente). `metrics` suma todas las redes en «región» y las
  separa en `redes`; `dias_por_red` y `fuentes.redes` en `precision.json`.
- **Límites de Open-Meteo (medido: HTTP 429):** 600/min, 5 000/h, 10 000/día en llamadas ponderadas; una ubicación
  de Previous Runs con 3 variables × 2 leads × 8 modelos = 4,8 llamadas. Día METAR ≈ 210, día IDEAM ≈ 1 010.
  `fetch_forecasts` espera `peso × 60 / 500` s tras cada petición; un 429 espera 65 s; `daily.py` gasta ≤ 4 000
  por corrida (lo más reciente primero; el resto queda «aplazado» en `verificacion-status.json`).
- Web: selector «Red» (Todas/METAR/IDEAM) que filtra ranking, aviso de días, fuente, lista y mapa.

### 6.0 Página Precisión (T-44)
- `web/src/precision/data.ts` (tipos, carga con caché sin AbortSignal, `rankModels`, `bestByStation`, formato),
  `usePrecision`/`useStationDetail`, `PrecisionTab` (chunk diferido) y `map/stations.ts` (capa `circle` nativa).
- Controles: ventana (7/30 días), variable (temperatura/viento/lluvia), pronóstico emitido (1 o 2 días antes).
  El ranking se **recalcula en el cliente** desde las métricas con el mismo criterio del pipeline (MAE ↑, CSI ↓,
  ≥ `min_pares_ranking`), así sirve para el día 2; los modelos sin muestra van al final, sin puesto y en gris.
- Tabla regional: temperatura/viento → error (MAE), sesgo, n; lluvia → CSI, aciertos (POD), falsas alarmas (FAR),
  sesgo de frecuencia, n (bloques). Textos de ayuda explican cada métrica en lenguaje llano.
- Aviso «Preliminar» si la ventana tiene < 14 días con datos (criterio de cierre de la fase 3).
- Fuente + red + ventana (dd/mm–dd/mm UTC, días con datos) + hora de cálculo (P2, RF-9 «qué red respalda»).
- Mapa (solo con la pestaña abierta): un círculo por aeropuerto con el color del mejor modelo (día 1, variable y
  ventana elegidas; mismos colores Okabe-Ito que la gráfica del panel de punto), hueco gris si no hay muestra,
  leyenda con los modelos presentes. Clic en el mapa o en la lista → detalle de la estación (`precision/<ICAO>.json`);
  desde la lista además centra el mapa. El clic sobre una estación no abre el panel de pronóstico.
- Sin `precision.json` → «Sin datos de verificación» y recordatorio de que el consenso usa pesos iguales (P4).

### 6.1 Enlace a la red oficial de la ciudad (RF-14)
`web/src/data/cityNetworks.json` (`comprobado` + `ciudades[]`): `{ciudad, bbox [O,S,E,N], red, operador, url,
estado: verificada|no_verificada|caida, nota?}`; ciudades sin red local con `red: null`. Lógica pura en
`cityNetworks.ts` (`officialNetworkAt`, `citiesByStatus`).
- Panel de punto: si el punto cae en el `bbox` de una red **verificada**, bajo el encabezado aparece «Red oficial
  de lluvias de <ciudad>: ver en vivo →» (chip Observado, red + operador, «sitio externo», nueva pestaña). Una red
  no verificada o caída nunca se enlaza (RF-14).
- Pestaña Precisión (también sin `precision.json`): «Redes locales de ciudad» con enlaces a las verificadas, las no
  verificadas con su estado y nota (sin enlace) y las ciudades que dependen solo de IDEAM/METAR, con la fecha de
  comprobación. Solo enlaces: sus datos no entran en la verificación (T-46).
- El estado se revisa a mano (curl + búsqueda) y se registra en `04-fuentes-de-datos.md`.

## 7. Riesgo (RF-10) — `pipeline/risk.py`
- Grid 0,25° sobre Colombia con GFS (T, HR, viento, precip).
- **Fosberg FFWI**: humedad de equilibrio del combustible `m` desde T y HR (Simard 1968), luego
  `η = 1 − 2(m/30) + 1.5(m/30)² − 0.5(m/30)³`, `FFWI = η · √(1 + U²) / 0.3002` (U en mph). Clasificar 0–100.
- Celdas de viento fuerte, lluvia intensa y calor según umbrales de RF-10.
- Salida `risk.geojson` (hexágonos H3 res 5) → `deck.gl H3HexagonLayer`.

## 8. Alertas (RF-12)
- v1: alertas **con la página abierta** (Notification API + revisión cada 15 min en el cliente). Costo 0.
- Push con página cerrada requiere un servidor que envíe Web Push. Opción gratuita: **Cloudflare Worker + Cron Trigger + KV**
  (plan gratuito) que revisa puntos suscritos. Se deja como fase 3 y se valida el límite de CPU del plan gratis.

## 9. Interfaz

### 9.0 Shell (T-13) — `web/src/shell/`
- **Menú lateral izquierdo** (330 px) plegable con botón accesible (`aria-expanded`); en móvil (≤ 640 px) es un
  cajón de `min(340px, 88vw)` que **empieza cerrado** y se cierra al elegir un punto (la hoja del pronóstico necesita
  la pantalla). Cabecera: marca, reloj **UTC + hora local** (cada 15 s), indicador **Conectado / Sin conexión** (P4).
  Siempre visibles: buscador y **«Usar mi ubicación»** (Geolocation API, 10 s, sin alta precisión; la posición no se
  guarda y solo viaja redondeada a ~1 km a la consulta meteorológica, RNF-8; errores traducidos).
- **Pestañas de RF-13:** Mapa (mapa base + nubes; los controles dejaron de flotar sobre el mapa), Mi punto, Precisión
  y Riesgo («en construcción» con su fase y sin datos de relleno; Riesgo enlaza al IDEAM), Metodología (preliminar,
  con umbrales leídos del propio código para que no se desincronicen; la completa es T-60). Flechas para cambiar.
- Escala del mapa abajo a la derecha (el menú ocupa la izquierda); créditos plegados al inicio en móvil.
- Selector de modelo de la barra superior: se hará con la capa de viento (T-35), donde tiene sentido.

### 9.1 Panel de punto (RF-6/7/8, T-22) — `web/src/point/`
- Panel lateral derecho (440 px; hoja inferior de 62 vh en móvil); los controles del mapa a la derecha se corren.
  Chip "Pronóstico", nombre del lugar, coordenadas y altura de la rejilla del modelo.
- Tarjetas "ahora" (hora en curso en la zona del punto): temperatura, viento (+ flecha y punto cardinal en
  español), ráfagas, nubosidad; lluvia como acumulado de las **próximas 24 h** (acuerdo = resumen pesimista).
  Cada una: consenso, rango entre modelos y n.º de modelos, insignia de acuerdo con texto + icono (no solo color);
  si es Bajo, aviso "Los modelos no coinciden: pronóstico incierto".
- Gráfica 7 días con **uPlot** (carga diferida): línea por modelo (paleta Okabe-Ito, apta para daltonismo), consenso
  en blanco, banda mín–máx, línea punteada "ahora", eje en la zona horaria del punto, leyenda con valores al pasar
  el cursor; pestañas por variable.
- Lista de modelos con la hora de su run (UTC) o "run desconocido"; modelos excluidos con su motivo;
  "¿Por qué este número?" con los pesos y cómo se agrega cada variable; fuente y hora de consulta.
- Datos: hook propio `usePointForecast` sobre la caché de `api/openMeteo.ts` (sin TanStack Query: no hizo falta).
  La consulta cacheada **no recibe AbortSignal** (ver §10).
- Layout tipo fuego.huella.world: mapa a pantalla completa, **menú lateral colapsable** con pestañas, panel inferior
  deslizable en móvil.
- Barra superior: buscador de lugar (Open-Meteo Geocoding API), "Usar mi ubicación", selector de modelo, reloj UTC/local.
- Línea de tiempo inferior para capas de pronóstico (0–72 h).
- Cada capa: chip "Observado" (verde) / "Pronóstico" (azul) / "Estimado" (ámbar) — P3. Componente único
  `web/src/ui/DataChip.tsx` (texto + `title` explicativo; estilos en `index.css`).
- **Fuente + hora** (P2, RNF-9): `web/src/ui/SourceLine.tsx` → "Fuente: X · <time>…</time>" junto a cada bloque de datos:
  nubes (hora de la imagen), tarjetas y gráfica del punto (rango de runs + hora de consulta), probabilidad de
  lluvia (runs de ensambles). El **acuerdo** es indicador propio → chip "Estimado" con la aclaración "no es un
  pronóstico oficial".
- **Runs atrasados** (P4): un run que empezó hace > 30 h se marca "⚠ atrasado" y se avisa debajo de la lista de
  modelos (sigue en el consenso, pero se declara). `web/src/core/runs.ts`.
- Cartografía (mapas base, departamentos) y buscador no son datos meteorológicos: solo atribución, sin chip.
- Indicador "Conectado / Datos de hace X min" como en la referencia.

## 10. Manejo de errores
- Promesas compartidas en caché nunca se atan al AbortSignal de un componente: si se cancelara, la caché
  entregaría a otros una petición abortada (bug real con StrictMode). El componente ignora resultados tardíos.
- Cada fuente envuelta en `fetchWithTimeout(8 s)` + 1 reintento; si falla → estado "sin datos" en la capa (P4).
- Si un modelo devuelve `null`, se excluye y se lista como "sin cobertura aquí".
- Los jobs de Actions fallan sin borrar la última versión publicada; `meta.json` incluye `generated_at` y la UI
  marca como "desactualizado" si > 9 h.

## 11. Pruebas
- `core/` (consenso, acuerdo, u/v, unidades): Vitest, cobertura ≥ 90 %.
- `pipeline/`: pytest con GRIB y respuestas METAR de ejemplo guardados en `tests/fixtures`.
- E2E: Playwright — cargar mapa, clic en Bogotá, ver ≥ 5 modelos y badge de acuerdo.
- Verificación manual de precisión: comparar el consenso de WindCloud contra METAR de SKBO (Bogotá) 14 días.
