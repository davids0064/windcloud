# 03 · Plan de tareas — WindCloud

Cada tarea indica los requisitos que cumple (`→ RF-x`) y su criterio de "hecho".
Orden recomendado de ejecución: por fases. Marcar `[x]` al terminar.

## Fase 0 · Cimientos
- [x] **T-01** Crear monorepo (`web/`, `pipeline/`, `.github/`), licencia MIT, README con atribuciones. → P7
- [x] **T-02** `web/`: Vite + React + TS, oxlint, Prettier, Vitest; tema oscuro con variables CSS. → RNF-4
- [x] **T-03** `pipeline/`: Python 3.12, `uv`/pip, pytest, eccodes instalado en CI (`ci.yml`). → —
- [ ] **T-04** Workflow `deploy.yml`: build de `web/` y publicación en Cloudflare Pages en cada push a `main`. → RNF-1
  *Hecho:* URL pública con "Hola WindCloud". 🟡 Workflow listo; falta repo en GitHub + secretos de Cloudflare.

## Fase 1 · MVP: mapa + panel de precisión por punto
- [ ] **T-10** MapView con MapLibre + overlay deck.gl, centrado en Colombia, bases oscuro/satélite/relieve. → RF-1
- [ ] **T-11** Límites departamentales (geoBoundaries ADM1 simplificado, ≤ 300 KB). → RF-1
- [ ] **T-12** Capa de nubes NASA GIBS (GOES-East visible e IR); leer IDs reales de GetCapabilities; animación 3 h. → RF-3
- [ ] **T-13** Shell de UI: menú lateral colapsable, pestañas, buscador (Geocoding), "Usar mi ubicación", reloj UTC/local. → RF-13, RF-6
- [ ] **T-20** `api/openMeteo.ts`: petición multi-modelo (lista §5.1 del diseño), parseo por modelo, caché 30 min. → RF-6, RNF-5
- [ ] **T-21** `core/consensus.ts` + `core/agreement.ts` con pruebas (u/v, mediana ponderada, nulos, pesos iguales). → RF-7, RF-8
- [ ] **T-22** PointPanel: gráfica 7 días (una línea por modelo + consenso + banda), tarjetas con badge de acuerdo. → RF-6, RF-8
- [ ] **T-23** Probabilidad de lluvia por ensamble (ECMWF 51 / GFS 31 miembros). → RF-6
- [ ] **T-24** Chips Observado/Pronóstico/Estimado y "fuente + hora" en todo dato. → P2, P3, RNF-9
  *Hecho fase 1:* clic en Bogotá muestra ≥ 5 modelos, consenso y acuerdo en < 3 s.

## Fase 2 · Viento animado y capas de pronóstico
- [ ] **T-30** `pipeline/grids.py`: bajar GFS 0.25° (u/v 10 m, 850, 500 hPa, GUST, TCDC, PRATE) vía filtro NOMADS. → RF-2
- [ ] **T-31** Añadir ECMWF Open Data (u/v) al mismo pipeline. → RF-2
- [ ] **T-32** Codificar PNG (R=u, G=v) + `meta.json`; escalares (ráfaga, nubes, lluvia) como PNG coloreable. → RF-2, RF-3, RF-4
- [ ] **T-33** Workflow `grids.yml` cada 6 h (≈ 3,5 h después de cada run); no borra la versión anterior si falla. → RNF-5
- [ ] **T-34** `WindLayer` WebGL de partículas (técnica webgl-wind), color por velocidad, ajuste por dispositivo. → RF-2, RNF-3
- [ ] **T-35** Línea de tiempo 0–72 h y selector de modelo/nivel. → RF-2
- [ ] **T-36** Capas escalares: ráfagas, nubosidad pronosticada, lluvia, temperatura, isobaras. → RF-4, RF-5
- [ ] **T-37** Radar: evaluar términos actuales de RainViewer; integrar o documentar ausencia. → RF-4
  *Hecho fase 2:* viento animado ≥ 30 fps en portátil, datos con < 9 h de antigüedad.

## Fase 3 · Precisión verificada
- [ ] **T-40** `stations.json`: aeropuertos METAR de Colombia y vecinos (código ICAO, lat, lon, altitud). → RF-9
- [ ] **T-41** `pipeline/verify.py`: observaciones METAR (aviationweather.gov) + Previous Runs API de Open-Meteo. → RF-9
- [ ] **T-46** Investigar acceso a datos de cada red local (SAB, SIATA, CDIAC, CVC): ¿API o descarga abierta? ¿términos de uso? ¿licencia?
      Registrar resultado en `04-fuentes-de-datos.md`. Si no hay acceso permitido → solo enlace. → RF-9, RF-14
- [ ] **T-47** Adaptadores `pipeline/sources/<red>.py` para las redes con acceso permitido + control de calidad + métricas por red. → RF-9
- [ ] **T-48** Reconfirmar Pereira (redhidro.org) y Bucaramanga (CDMB); actualizar estado. → RF-14
- [ ] **T-49** `cityNetworks.json` + enlace "Red oficial de tu ciudad" en el panel de punto y listado en Precisión. → RF-14
- [ ] **T-42** Métricas MAE/sesgo/RMSE y POD/FAR/CSI, ventanas 7 y 30 días; pruebas con fixtures. → RF-9
- [ ] **T-43** Workflow `verify.yml` diario; histórico en rama `data`; publicar `precision.json`. → RF-9
- [ ] **T-44** Página **Precisión**: ranking de modelos, mapa de estaciones por mejor modelo, detalle por estación. → RF-9
- [ ] **T-45** Conectar pesos de `precision.json` al consenso + "¿Por qué este número?". → RF-7
  *Hecho fase 3:* tras 14 días, ranking visible y consenso ponderado activo.

## Fase 4 · Riesgo, incendios y alertas
- [ ] **T-50** `pipeline/risk.py`: Fosberg + viento fuerte + lluvia intensa + calor → `risk.geojson` (H3). → RF-10
- [ ] **T-51** Página **Riesgo** con H3HexagonLayer y aviso "indicador propio" + enlace IDEAM. → RF-10, P3
- [ ] **T-52** Focos NASA FIRMS (clave gratuita MAP_KEY) con vector de viento por foco. → RF-11
- [ ] **T-53** Alertas con página abierta (Notification API). → RF-12
- [ ] **T-54** (Opcional) Push con página cerrada vía Cloudflare Worker + Cron + KV. → RF-12
- [ ] **T-55** Rayos GOES GLM (si cabe en minutos de Actions). → RF-5

## Fase 5 · Calidad y lanzamiento
- [ ] **T-60** Página **Metodología** completa con fórmulas y referencias. → RF-13, P3
- [ ] **T-61** Accesibilidad AA, paletas aptas para daltonismo, prueba en móvil 360 px. → RNF-4, RNF-7
- [ ] **T-62** Presupuesto de rendimiento (bundle, fps) y de llamadas a APIs (≤ 10 000/día). → RNF-2, RNF-3, RNF-6
- [ ] **T-63** E2E Playwright y verificación manual SKBO 14 días. → Diseño §11
- [ ] **T-64** Atribuciones y licencias de todas las fuentes en el pie de página. → P1, P7
