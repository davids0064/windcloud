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
| Mapa base | **MapLibre GL JS** | Libre (BSD), sin token |
| Capas de datos | **deck.gl** (`MapboxOverlay` sobre MapLibre) | Hexágonos, heatmaps, GeoJSON, 3D |
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
│  └─ public/geo/             # departamentos Colombia (geoBoundaries ADM1, simplificado)
├─ pipeline/                  # Python (proyecto uv, paquete windcloud_pipeline)
│  ├─ src/windcloud_pipeline/
│  │  ├─ grids.py             # GRIB → PNG viento
│  │  ├─ verify.py            # verificación de modelos
│  │  ├─ risk.py              # índices de riesgo
│  │  └─ sources/             # adaptadores de redes locales
│  └─ tests/
└─ .github/workflows/{ci,deploy,grids,verify,risk}.yml
```

## 4. Capas del mapa

### 4.1 Viento (RF-2)
- **Fuente:** GFS 0.25° (NOMADS, filtro `filter_gfs_0p25.pl` para bajar solo `UGRD`/`VGRD` a 10 m, 850, 500 hPa)
  y ECMWF Open Data 0.25° (`10u`, `10v`, `u`, `v` en niveles de presión).
- **Codificación PNG:** R = u, G = v normalizados a [0,255] con `min/max` guardados en `meta.json`
  (técnica de webgl-wind). Una imagen por modelo/run/nivel/paso (0–72 h cada 3 h = 25 imágenes).
- **Render:** partículas en GPU (shaders de posición + desvanecimiento), color por velocidad (escala
  viridis-like apta para daltonismo). Móvil: 8 000 partículas; escritorio: 40 000 (RNF-3).
- **Ráfagas:** de Open-Meteo no hay grid; usar `GUST` de GFS como textura escalar coloreada.

### 4.2 Nubes observadas (RF-3)
- **NASA GIBS WMTS** (sin clave): capas GOES-East/West ABI (visible e infrarrojo banda 13) y Himawari.
  Los identificadores exactos se toman del `GetCapabilities` de GIBS en la tarea T-12 (no codificarlos a ciegas).
- Animación: pedir los últimos N `TIME=` disponibles (resolución temporal 10 min).
- Nubosidad **pronosticada**: textura escalar de `TCDC` (GFS) rotulada "pronóstico".

### 4.3 Lluvia (RF-4)
- Radar observado: **RainViewer** tiles (verificar términos vigentes: en 2025 redujo su API gratuita).
  Si no es viable → mostrar solo precipitación de modelo + satélite IR, y declararlo.
- Precipitación pronosticada: textura escalar `PRATE`/`APCP` de GFS.

### 4.4 Otras (RF-5)
- Rayos: GOES **GLM** (NOAA Open Data en AWS, `noaa-goes19` / `noaa-goes18`) → puntos últimos 15 min (job opcional cada 10 min; si excede minutos, omitir).
- Calidad del aire: Open-Meteo Air Quality API por punto (solo en panel de punto en v1).

## 5. Motor de consenso y acuerdo (RF-6, RF-7, RF-8) — `web/src/core/`

### 5.1 Modelos consultados (Open-Meteo, parámetro `models=`)
`ecmwf_ifs025, ecmwf_aifs025_single, gfs_seamless, icon_seamless, gem_seamless, jma_seamless,
meteofrance_seamless, ukmo_seamless, metno_seamless` (+ `best_match` como referencia).
Validar la lista contra la documentación vigente de Open-Meteo en T-20; modelos sin cobertura
devuelven `null` y se excluyen del consenso para esa hora.

Una sola petición HTTP con todos los modelos (cuenta como varias llamadas en el límite; ver RNF-6).

### 5.2 Consenso ponderado
```
w_m = 1 / (MAE_m(estación_más_cercana, variable, lead) + ε)      ε = 0.1
w_m = 1 para todos si no hay verificación a < 150 km o < 14 días de datos
consenso = Σ w_m · x_m / Σ w_m     (sobre modelos con valor no nulo)
```
- Dirección del viento: promediar **componentes u/v**, nunca grados directamente.
- Precipitación: mediana ponderada (robusta a un modelo que exagera).

### 5.3 Acuerdo
Dispersión `s` = desviación estándar entre modelos (para viento: de la velocidad).
| Variable | Alto | Medio | Bajo |
|---|---|---|---|
| Temperatura | s ≤ 1,0 °C | ≤ 2,5 °C | > 2,5 °C |
| Viento | s ≤ 3 km/h | ≤ 8 km/h | > 8 km/h |
| Nubosidad | s ≤ 15 % | ≤ 30 % | > 30 % |
| Lluvia (sí/no >0,5 mm) | ≥ 80 % de modelos de acuerdo | ≥ 60 % | < 60 % |
Umbrales en `core/agreement.ts`, ajustables y documentados en Metodología.

### 5.4 Probabilidad por ensamble
Open-Meteo **Ensemble API** (`ecmwf_ifs025` 51 miembros, `gfs025` 31 miembros):
`P(lluvia) = miembros con precip > 1 mm / total`. Mostrar como barra por día.

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
- Layout tipo fuego.huella.world: mapa a pantalla completa, **menú lateral colapsable** con pestañas, panel inferior
  deslizable en móvil.
- Barra superior: buscador de lugar (Open-Meteo Geocoding API), "Usar mi ubicación", selector de modelo, reloj UTC/local.
- Línea de tiempo inferior para capas de pronóstico (0–72 h).
- Cada capa: chip "Observado" (verde) / "Pronóstico" (azul) / "Estimado" (ámbar) — P3.
- Indicador "Conectado / Datos de hace X min" como en la referencia.

## 10. Manejo de errores
- Cada fuente envuelta en `fetchWithTimeout(8 s)` + 1 reintento; si falla → estado "sin datos" en la capa (P4).
- Si un modelo devuelve `null`, se excluye y se lista como "sin cobertura aquí".
- Los jobs de Actions fallan sin borrar la última versión publicada; `meta.json` incluye `generated_at` y la UI
  marca como "desactualizado" si > 9 h.

## 11. Pruebas
- `core/` (consenso, acuerdo, u/v, unidades): Vitest, cobertura ≥ 90 %.
- `pipeline/`: pytest con GRIB y respuestas METAR de ejemplo guardados en `tests/fixtures`.
- E2E: Playwright — cargar mapa, clic en Bogotá, ver ≥ 5 modelos y badge de acuerdo.
- Verificación manual de precisión: comparar el consenso de WindCloud contra METAR de SKBO (Bogotá) 14 días.
