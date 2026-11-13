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
 │  /data/wind/{model}/{run}/{level}/{hhh}.png + meta.json                               │
 │  /data/precision.json  /data/risk.geojson  /data/stations.json                        │
 └──────────────┬───────────────────────────────────────────────────────────────────────┘
                ▼
 ┌─────────────────────────────── Navegador del usuario ────────────────────────────────┐
 │  MapLibre GL + deck.gl ── capas: viento (WebGL), nubes (NASA GIBS), radar, riesgo     │
 │  Panel de punto ── fetch directo a Open-Meteo (CORS abierto): forecast + ensemble     │
 │  Motor de consenso (TS puro) ── usa precision.json para ponderar                      │
 └───────────────────────────────────────────────────────────────────────────────────────┘
```

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
| Verificación | Python + `pandas`; datos en `data/verify/*.parquet` en rama `data` | Sin base de datos |
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
- **Codificación PNG:** R = u, G = v normalizados a [0,255] con `min/max` guardados en `meta.json`
  (técnica de webgl-wind). Una imagen por modelo/run/nivel/paso (0–72 h cada 3 h = 25 imágenes).
- **Render:** partículas en GPU (shaders de posición + desvanecimiento), color por velocidad (escala
  viridis-like apta para daltonismo). Móvil: 8 000 partículas; escritorio: 40 000 (RNF-3).
- **Ráfagas:** de Open-Meteo no hay grid; usar `GUST` de GFS como textura escalar coloreada.

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
- Radar observado: **RainViewer** tiles (verificar términos vigentes: en 2025 redujo su API gratuita).
  Si no es viable → mostrar solo precipitación de modelo + satélite IR, y declararlo.
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
1. **Estaciones:** lista de aeropuertos METAR de Colombia (y región) en `stations.json` (~40 estaciones).
2. **Observaciones**, por prioridad de precisión:
   1. **Redes locales de ciudad** (SAB Bogotá, SIATA Medellín, CDIAC Manizales, CVC Cali) — ver
      `04-fuentes-de-datos.md`. Solo si ofrecen acceso programático permitido por sus términos.
      Cada red se integra con un adaptador `pipeline/sources/<red>.py` que normaliza a
      `{station_id, red, lat, lon, alt, time_utc, temp_c, precip_mm, wind_kmh}`.
   2. Estaciones **IDEAM** vía datos.gov.co (Socrata) si la frecuencia y latencia sirven.
   3. **METAR** `aviationweather.gov/api/data/metar` (JSON, gratis) cada hora — cobertura mínima garantizada.
   - Control de calidad: descartar valores fuera de rango físico, saltos imposibles y estaciones con < 80 % de datos en la ventana.
   - Las métricas se publican **por red**, para no mezclar redes de distinta calidad sin decirlo.
3. **Pronósticos archivados:** Open-Meteo **Previous Runs API** (`temperature_2m_previous_day1`, `..._day2`)
   por modelo y estación → evita tener que guardar nosotros cada run.
4. **Métricas** por estación × modelo × variable × lead (24 h, 48 h), ventanas 7 y 30 días:
   MAE, sesgo, RMSE; lluvia: POD (aciertos), FAR (falsas alarmas), CSI.
5. Salida `precision.json` (resumen ligero para el cliente) + histórico parquet en rama `data`.
6. Presupuesto de llamadas: 40 estaciones × 1 llamada multi-modelo/día ≈ 40×9 = 360 llamadas → dentro de RNF-6.
   Las redes locales pueden sumar ~100 estaciones más: agrupar por celda de 0,1° (≈ 11 km), porque los modelos no
   distinguen estaciones más cercanas entre sí, y así se mantiene ≤ ~1 500 llamadas/día.

### 6.1 Enlace a la red oficial de la ciudad (RF-14)
`web/src/data/cityNetworks.json`: `{ciudad, bbox, red, operador, url, estado_verificado}`. Si el punto del
usuario cae dentro del `bbox`, el panel de punto muestra "Red oficial de lluvias de <ciudad>: ver en vivo →".

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
