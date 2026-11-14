# 03 · Plan de tareas — WindCloud

Cada tarea indica los requisitos que cumple (`→ RF-x`) y su criterio de "hecho".
Orden recomendado de ejecución: por fases. Marcar `[x]` al terminar.

## Fase 0 · Cimientos
- [x] **T-01** Crear monorepo (`web/`, `pipeline/`, `.github/`), licencia MIT, README con atribuciones. → P7
- [x] **T-02** `web/`: Vite + React + TS, oxlint, Prettier, Vitest; tema oscuro con variables CSS. → RNF-4
- [x] **T-03** `pipeline/`: Python 3.12, `uv`/pip, pytest, eccodes instalado en CI (`ci.yml`). → —
- [ ] **T-04** Workflow `deploy.yml`: build de `web/` y publicación en Cloudflare Pages en cada push a `main`. → RNF-1
  *Hecho:* URL pública con "Hola WindCloud". 🟡 Workflow listo y en modo manual; **pospuesta** hasta decidir publicar (falta secretos de Cloudflare).

## Fase 1 · MVP: mapa + panel de precisión por punto
- [x] **T-10** MapView con MapLibre + overlay deck.gl, centrado en Colombia, bases oscuro/satélite/relieve. → RF-1
- [x] **T-11** Límites departamentales (geoBoundaries ADM1 simplificado, ≤ 300 KB). → RF-1
      268 KB (102 KB gzip), generado por `pipeline/…/geo.py`; resaltado y nombre al pasar el cursor.
- [x] **T-12** Capa de nubes NASA GIBS (GOES-East visible e IR); leer IDs reales de GetCapabilities; animación 3 h. → RF-3
      10 cuadros cada 20 min, fondo transparente por brillo, hora UTC/local y antigüedad visibles. Nubosidad *pronosticada* queda para T-36.
- [x] **T-13** Shell de UI: menú lateral colapsable, pestañas, buscador (Geocoding), "Usar mi ubicación", reloj UTC/local. → RF-13, RF-6
      Menú `web/src/shell/` con las 5 pestañas de RF-13, indicador de conexión, cajón en móvil y Metodología preliminar.
- [x] **T-20** `api/openMeteo.ts`: petición multi-modelo (lista §5.1 del diseño), parseo por modelo, caché 30 min. → RF-6, RNF-5
      8 modelos independientes validados contra la API real; hora del run por `meta.json`; Bogotá en ~0,5 s.
- [x] **T-21** `core/consensus.ts` + `core/agreement.ts` con pruebas (u/v, mediana ponderada, nulos, pesos iguales). → RF-7, RF-8
      Cobertura de `core/` 97,7 % (umbral 90 % en `npm run test:coverage`).
- [x] **T-22** PointPanel: gráfica 7 días (una línea por modelo + consenso + banda), tarjetas con badge de acuerdo. → RF-6, RF-8
      uPlot (carga diferida); clic en Bogotá → 8 modelos, consenso y acuerdo en 449 ms (criterio de fase 1: < 3 s).
- [x] **T-23** Probabilidad de lluvia por ensamble (ECMWF 51 / GFS 31 miembros). → RF-6
      Barras por día y ensamble (sin mezclarlos), "hoy" desde la hora en curso, acuerdo entre ensambles, run de cada uno.
- [x] **T-24** Chips Observado/Pronóstico/Estimado y "fuente + hora" en todo dato. → P2, P3, RNF-9
      `ui/DataChip` + `ui/SourceLine` (con `<time>`); acuerdo rotulado "Estimado"; runs > 30 h marcados "atrasado". Auditado en Chrome.
  *Hecho fase 1:* clic en Bogotá muestra ≥ 5 modelos, consenso y acuerdo en < 3 s. ✅ **Fase 1 completa (2026-11-13): 8 modelos en 449 ms.**

## Fase 2 · Viento animado y capas de pronóstico
- [x] **T-30** `pipeline/grids.py`: bajar GFS 0.25° (u/v 10 m, 850, 500 hPa, GUST, TCDC, PRATE) vía filtro NOMADS. → RF-2
      Región Colombia ampliada por defecto; run completo real: 25 pasos, 16,5 MB, 41 s. Valores instantáneos.
- [x] **T-31** Añadir ECMWF Open Data (u/v) al mismo pipeline. → RF-2
      Más allá de u/v: ráfagas, nubes, lluvia, temperatura y presión (todas las capas). Descarga por rangos (~6 MB/paso); selector GFS/ECMWF.
- [x] **T-32** Codificar PNG (R=u, G=v) + `meta.json`; escalares (ráfaga, nubes, lluvia) como PNG coloreable. → RF-2, RF-3, RF-4
      `pipeline/…/encode.py`: filas remuestreadas a Mercator; run real = 150 PNG, 5,7 MB, 2,7 s; verificado contra el GRIB.
- [x] **T-33** Workflow `grids.yml` cada 6 h (≈ 3,5 h después de cada run); no borra la versión anterior si falla. → RNF-5
      `pipeline/…/update.py` + rama `grids` (commit único, 2 últimos runs). Verificado en local; **primera ejecución real en GitHub al subir el código**.
- [x] **T-34** `WindLayer` WebGL de partículas (técnica webgl-wind), color por velocidad, ajuste por dispositivo. → RF-2, RNF-3
      `web/src/wind/`: 60 fps con 40 000 partículas (WebGL2, retina); 8 000 en móvil y reducción automática si < 30 fps.
- [x] **T-35** Línea de tiempo 0–72 h y selector de modelo/nivel. → RF-2
      Altura 10 m / ~1,5 km / ~5,5 km, 25 pasos precargados, reproducir (48 fps), marca «ahora». Modelo: solo GFS hasta T-31.
- [x] **T-36** Capas escalares: ráfagas, nubosidad pronosticada, lluvia, temperatura, isobaras. → RF-4, RF-5
      Coloreadas en el navegador (MapLibre 6 sin `raster-color`); isobaras suavizadas (ruido de montaña); línea de tiempo común.
- [x] **T-37** Radar: evaluar términos actuales de RainViewer; integrar o documentar ausencia. → RF-4
      **Ausencia documentada:** RainViewer no cubre las ciudades colombianas (su máscara: solo Leticia). Aviso + enlaces a SAB y SIATA.
  *Hecho fase 2:* viento animado ≥ 30 fps en portátil, datos con < 9 h de antigüedad. ✅ **Fase 2 completa (2026-11-13): 60 fps (48 reproduciendo); GFS 12Z con 5 h.** ECMWF llega con ~7,5 h de latencia (aviso a 14 h).

## Fase 3 · Precisión verificada
- [x] **T-40** `stations.json`: aeropuertos METAR de Colombia y vecinos (código ICAO, lat, lon, altitud). → RF-9
  _Hecho: `pipeline/data/stations.json` (43: 37 CO + 6 vecinos ≤ 100 km), generado con `windcloud_pipeline.stations`._
- [x] **T-41** `pipeline/verify.py`: observaciones METAR (aviationweather.gov) + Previous Runs API de Open-Meteo. → RF-9
  _Hecho: `metar.py` (tope de 400 registros) + `verify.py` → `out/verify/pares/AAAA-MM-DD.csv`; 12/11: 2 583 pares de 42 estaciones._
- [x] **T-46** Investigar acceso a datos de cada red local (SAB, SIATA, CDIAC, CVC): ¿API o descarga abierta? ¿términos de uso? ¿licencia?
      Registrar resultado en `04-fuentes-de-datos.md`. Si no hay acceso permitido → solo enlace. → RF-9, RF-14
  _Hecho: solo IDEAM (datos.gov.co, CC BY-SA, ~500 estaciones, diario) es integrable; SAB en vivo sin histórico (CC BY-NC); SIATA, CDIAC y CVC → solo enlace. T-47 empieza por IDEAM._
- [x] **T-47** Adaptadores `pipeline/sources/<red>.py` para las redes con acceso permitido + control de calidad + métricas por red. → RF-9
  _Hecho: `sources/ideam.py` + `data/stations-ideam.json` (211 estaciones) + verificación por red, selector de red en Precisión, ritmo y presupuesto de Open-Meteo. SAB no (sin histórico)._
- [x] **T-48** Reconfirmar Pereira (redhidro.org) y Bucaramanga (CDMB); actualizar estado. → RF-14
  _Hecho (2026-11-14): ambas **no verificadas** → sin enlace. redhidro.org no resuelve DNS; CDMB no publica visor. Detalle en spec 04._
- [x] **T-49** `cityNetworks.json` + enlace "Red oficial de tu ciudad" en el panel de punto y listado en Precisión. → RF-14
  _Hecho: `web/src/data/cityNetworks.{json,ts}`; enlace solo si la red está `verificada` (SAB, SIATA, CDIAC, CVC); Pereira y Bucaramanga listadas sin enlace._
- [x] **T-42** Métricas MAE/sesgo/RMSE y POD/FAR/CSI, ventanas 7 y 30 días; pruebas con fixtures. → RF-9
  _Hecho: `metrics.py` → `precision.json` (schema 1). Lluvia en bloques de 6 h (por hora no discrimina: FAR ≈ 0,9 en todos)._
- [x] **T-43** Workflow `verify.yml` diario; histórico en rama `data`; publicar `precision.json`. → RF-9
  _Hecho en local: `daily.py` + `verify.yml` (03:30 UTC) + paso en `deploy.yml`. **Primera corrida en GitHub pendiente** (código sin subir)._
- [x] **T-44** Página **Precisión**: ranking de modelos, mapa de estaciones por mejor modelo, detalle por estación. → RF-9
  _Hecho: `web/src/precision/` (pestaña diferida, 2,8 KB gzip) + `map/stations.ts`. Verificado en Chrome con 7 días reales._
- [x] **T-45** Conectar pesos de `precision.json` al consenso + "¿Por qué este número?". → RF-7
  _Hecho: `core/verifiedWeights.ts`; se activa sola al llegar a 14 días de verificación (hoy 10 → pesos iguales con aviso)._
  *Hecho fase 3:* tras 14 días, ranking visible y consenso ponderado activo.

## Fase 4 · Riesgo, incendios y alertas
- [x] **T-50** `pipeline/risk.py`: Fosberg + viento fuerte + lluvia intensa + calor → `risk.geojson` (H3). → RF-10
  _Hecho: `risk.json` por run de GFS (1 622 celdas 0,25° sobre Colombia × 25 pasos); **sin H3** (ver diseño §7). Se añadió RH a 2 m a la descarga._
- [x] **T-51** Página **Riesgo** con H3HexagonLayer y aviso "indicador propio" + enlace IDEAM. → RF-10, P3
  _Hecho: `web/src/risk/` (pestaña diferida, 2,1 KB gzip) + `map/risk.ts`: celdas de la rejilla (sin H3) como capa nativa de MapLibre; incendio/viento/lluvia/calor, peor de 72 h o por hora, resumen por departamento._
- [x] **T-52** Focos NASA FIRMS (clave gratuita MAP_KEY) con vector de viento por foco. → RF-11
  _Hecho: `fires.py` (NOAA-20, NOAA-21, MODIS; 48 h; solo Colombia) en `grids.yml` con el secreto `FIRMS_MAP_KEY`; capa en Riesgo; al tocar un foco, viento del consenso ahora/+6/+12/+24 h y flecha hacia donde lo empujaría._
- [x] **T-53** Alertas con página abierta (Notification API). → RF-12
  _Hecho: `core/alerts.ts` + `alerts/` (sección en «Mi punto» y aviso en la página); consenso de 24 h cada 15 min, un aviso por regla y día; configuración solo en el navegador._
- [ ] **T-54** (Opcional) Push con página cerrada vía Cloudflare Worker + Cron + KV. → RF-12
- [x] **T-55** Rayos GOES GLM (si cabe en minutos de Actions). → RF-5
  _Hecho: `lightning.py` (GOES-19 GLM, 15 min, Colombia ampliada) + `rayos.yml` cada 10 min → rama `rayos` (commit único), leída por la web desde raw.githubusercontent.com; capa «Rayos» en Mapa. Repo público: minutos sin costo._

## Fase 5 · Calidad y lanzamiento
- [x] **T-60** Página **Metodología** completa con fórmulas y referencias. → RF-13, P3
  _Hecho: 13 secciones con índice (tipos de dato, consenso, acuerdo, probabilidad, verificación, riesgo, focos, rayos, capas, alertas, limitaciones, fuentes, referencias con DOI verificados). Umbrales del pipeline en `core/methodology.ts`, sincronía comprobada por `test_methodology_sync.py`. Pestaña diferida (6,3 KB gzip)._
- [x] **T-61** Accesibilidad AA, paletas aptas para daltonismo, prueba en móvil 360 px. → RNF-4, RNF-7
  _Hecho: `a11y.test.tsx` (axe-core en cada vista, 0 violaciones), `ui/contrast.test.ts` (contraste WCAG desde el CSS real + simulación de daltonismo Machado 2009, ΔE ≥ 12 entre tonos vecinos). Insignias de acuerdo recoloreadas (alto/bajo se confundían con deuteranopía). 360 px sin desbordes en las 5 pestañas. Selector de focos por teclado._
- [x] **T-62** Presupuesto de rendimiento (bundle, fps) y de llamadas a APIs (≤ 10 000/día). → RNF-2, RNF-3, RNF-6
  _Hecho: bundle inicial 90,5 KB gzip (CI ≤ 150 KB). Viento: 40 000 partículas a 60 fps medidos en Chrome (adaptación a la mitad bajo 30 fps, T-34). Llamadas: `core/apiBudget.ts` calcula el peso de las URL reales (punto 5,8; alertas ≤ 230/día; trabajos ≤ 4 000/día) con prueba; sincronía con `daily.CALL_BUDGET`._
- [ ] **T-63** E2E Playwright y verificación manual SKBO 14 días. → Diseño §11
- [x] **T-64** Atribuciones y licencias de todas las fuentes en el pie de página. → P1, P7
  _Hecho: `ui/sources.ts` (13 fuentes con uso, licencia y enlace, todos con 200 el 14/11) → pie plegable del menú (`ui/Attributions`) y sección de Metodología._
