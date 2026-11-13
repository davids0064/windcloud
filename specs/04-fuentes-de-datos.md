# 04 · Catálogo de fuentes gratuitas — WindCloud

Regla (P1): solo fuentes con plan gratuito permanente. **Verificar límites y términos vigentes antes de
implementar cada una** (columna "Verificar"), porque cambian con el tiempo.

## Pronóstico por punto
| Fuente | Qué da | Clave | Límite / licencia | Uso en WindCloud | Verificar |
|---|---|---|---|---|---|
| **Open-Meteo Forecast API** | ECMWF IFS, AIFS, GFS, ICON, GEM, JMA, Météo-France, UKMO, MET Norway, KMA y más; `best_match`. *MET Norway solo es independiente en Escandinavia: en Colombia repite a ECMWF y WindCloud no lo usa (diseño §5.1)* | No | ~10 000 llamadas/día, **solo no comercial**; datos CC BY 4.0 | Panel de punto multi-modelo | Lista de modelos y nombres |
| **Open-Meteo Ensemble API** | ECMWF ENS (51), GFS ENS (31), ICON-EPS | No | Igual | Probabilidad de lluvia ✅ en uso | ✅ 51 y 31 miembros verificados 2026-11-13; coste 8,2/consulta |
| **Open-Meteo Previous Runs API** | Pronósticos pasados por lead time | No | Igual | Verificación sin archivar runs | Variables `_previous_dayN`; varias ubicaciones por llamada (listas en `latitude`/`longitude`/`elevation`). Verificado 13/11/2026 con los 8 modelos, día 1 y 2 |
| **Open-Meteo Geocoding** | Buscar lugares (ciudades, regiones, países; datos GeoNames) | No | Igual | Buscador ✅ en uso | — |
| **Open-Meteo Air Quality** | PM2.5, PM10, O₃ (CAMS) | No | Igual | Panel de punto | — |
| **MET Norway Locationforecast** | Modelo noruego / ECMWF | No (exige `User-Agent` identificable genérico) | Gratis, CC BY 4.0 | Respaldo si Open-Meteo falla | Política de uso |
| **Self-host Open-Meteo** | Todo lo anterior | No | AGPLv3 | **Plan B si el proyecto se vuelve comercial** | Requisitos de disco |

## Grids para mapas (viento, nubes, lluvia)
| Fuente | Qué da | Clave | Licencia | Uso | Verificar |
|---|---|---|---|---|---|
| **NOAA GFS 0.25° (NOMADS)** | GRIB2 global cada 6 h, 384 h | No | Dominio público | Texturas de viento, ráfagas, nubes, lluvia ✅ descarga en uso | ✅ 2026-11-13: filtro con subregión OK; run 06Z con f072 publicado a las ~15:00 UTC; 404 + HTML si no existe; se usa 1 s entre peticiones. Alternativa: bucket `noaa-gfs-bdp-pds` en AWS |
| **ECMWF Open Data** | GRIB2 0.25° IFS y AIFS | No | CC BY 4.0 («© ECMWF») | ✅ Segundo modelo de las capas del mapa (T-31) | ✅ 2026-11-13: GRIB global ~101 MB/paso con índice JSON y rangos HTTP (se bajan 11 campos, ~6 MB/paso); runs 00/06/12/18; 00Z completo a las ~07:30 UTC; `10fg` = ráfaga máx. última hora; `tcc` en fracción; `tprate` tasa instantánea |
| **DWD ICON (opendata.dwd.de)** | GRIB2 global ICON | No | Abierta con atribución | Opcional, tercer modelo en mapa | Formato de rejilla icosaédrica (requiere regridding) |

## Observación (lo que realmente pasó)
| Fuente | Qué da | Clave | Licencia | Uso | Verificar |
|---|---|---|---|---|---|
| **NASA GIBS (WMTS)** | Imágenes GOES-East/West, Himawari, Meteosat; ~10 min | No | Abierta (atribuir NASA) | Capa de nubes observadas ✅ en uso (GOES-East banda 2 y 13) | ✅ IDs verificados 2026-11-13; latencia real 30–50 min; DescribeDomains adelanta horas aún no publicadas; a veces 503 puntual (el reintento lo resuelve) |
| **aviationweather.gov Data API** | METAR de aeropuertos en JSON | No | Dominio público (NOAA) | Verificación de modelos | Límite de peticiones; **tope de 400 registros por respuesta, sin aviso** → lotes de 10 que se parten si lo tocan; lotes grandes dan 504 → reintentos. Historial con `date=AAAAMMDD_HHMM&hours=N` (≥ 12 días). Viento en nudos, sin campo de lluvia (sale del tiempo presente del `rawOb`). Verificado 13/11/2026: 37/38 METAR de Colombia activos |
| **IDEAM / datos.gov.co (Socrata)** | Estaciones automáticas de Colombia: precipitación `s54a-sgyg`, temperatura `sbwg-7ju4`, viento `sgfv-3yp8` | No (token gratuito opcional, sube el límite) | **CC BY-SA 4.0** | Verificación (2.º nivel de RF-9) | Ver §«Acceso a datos de redes locales» (T-46): hora **local**, datos preliminares, publicación diaria |
| **RainViewer** | Tiles de radar mundial | No | Gratis solo uso personal/educativo, atribución con enlace | ❌ **No se usa** (T-37) | ✅ 2026-11-13: zoom máx. 7, 2 h, sin nowcast/satélite, 100 pet./min/IP; **sin cobertura en ciudades colombianas** (máscara: solo Leticia). Reevaluar |
| **NOAA GOES GLM (AWS Open Data)** | Rayos | No | Dominio público | Capa de rayos | Volumen de datos |
| **NASA FIRMS** | Focos de calor VIIRS/MODIS | Sí, MAP_KEY gratuita | Abierta | Integración incendios (fase 4) | Límite de transacciones por 10 min |

## Redes locales de ciudad (Colombia) — máxima precisión urbana
Más densas y precisas que METAR (decenas de estaciones dentro de la ciudad vs. 1 aeropuerto).
Uso doble: **(a) verificación de modelos** (RF-9) y **(b) enlace "Red oficial de tu ciudad"** (RF-14).
Estado comprobado el 2026-11-12 (código HTTP). **Antes de usar datos: confirmar acceso programático y términos de uso**;
si solo se pueden ver en pantalla, usar únicamente como enlace (nunca extraer datos raspando la página contra sus términos).

| Ciudad | Red / sitio | Operador | Contenido | Estado | Uso previsto |
|---|---|---|---|---|---|
| Bogotá | `https://app.sab.gov.co/sab/lluvias.htm` | IDIGER – Sistema de Alerta de Bogotá (SAB) | Pluviómetros en vivo, acumulado desde 0:00, últimas 6 h por estación, radar IDIGER | ✅ 200 | Enlace (T-49); datos en vivo CC BY-NC sin histórico → ver T-46 |
| Medellín / Valle de Aburrá | `https://siata.gov.co/siata_nuevo/` | SIATA (AMVA, Alcaldía de Medellín, EAFIT) | Radar propio (~5 min), >140 estaciones, pluviómetros, niveles de quebradas, pronóstico | ✅ 200 | Solo enlace (sin API ni licencia; datos por solicitud) → ver T-46 |
| Manizales / Caldas | `https://cdiac.manizales.unal.edu.co/` (Geoportal SIMAC, "Listado de Estaciones") | IDEA–CDIAC, Universidad Nacional sede Manizales | Estaciones urbanas cada 5 min (lluvia, T, HR, radiación…) | ✅ 200 (el enlace antiguo `idea…/estado-tiempo-manizales` da 404) | Solo enlace (consulta con login, sin licencia abierta) → ver T-46 |
| Cali / Valle del Cauca | `https://portal-hidroclimatologico.cvc.gov.co/` | CVC | Red regional (~280 estaciones según prensa; estaciones en cuenca del río Cali) | ✅ 200 | Solo enlace (dataset abierto detenido en mayo de 2025) → ver T-46 |
| Pereira / Risaralda | `redhidro.org` (UTP) | Universidad Tecnológica de Pereira | ~75 puntos de monitoreo | ⚠️ Sin respuesta; `utp.edu.co/hidroclimatologica` 404 | Pendiente de confirmar |
| Bucaramanga | `https://www.cdmb.gov.co/` | CDMB | 19 estaciones automáticas, alerta > 60 mm/h | ⚠️ Sin visor público en vivo encontrado | Pendiente de confirmar |
| Barranquilla, Cartagena, Cúcuta, Ibagué, Armenia, Popayán, Pasto | — | — | Sin red pública urbana en vivo encontrada | — | Usar IDEAM + METAR |

**Respaldo nacional:** IDEAM (2.854 estaciones, 310 automáticas con transmisión) vía datos.gov.co.

### Acceso a datos de redes locales (T-46, comprobado 2026-11-13)
Consultas directas a los catálogos (CKAN de Bogotá, API de catálogo de Socrata para datos.gov.co, SoQL) y lectura de
los sitios de cada red. Resumen:

| Red | Acceso programático | Licencia / términos | Frescura | Decisión |
|---|---|---|---|---|
| **IDEAM** (datos.gov.co) | ✅ API SODA/SoQL: `https://www.datos.gov.co/resource/<id>.json?$query=…`. 12/11: precipitación ~84 000 filas de **~500 estaciones**, temperatura ~20 000 de **326**, viento de **324** (m/s). Estaciones aeroportuarias y urbanas cada 2 min (744 registros/día). | **CC BY-SA 4.0** (atribución: IDEAM) | Lote diario: el 13/11 ya estaba completo el 12/11 hasta 23:59; el día en curso aún no | **Integrar (T-47)**, primer adaptador. |
| **SAB** Bogotá (IDIGER) | 🟡 JSON en vivo `app.sab.gov.co/sab/ServletTipoSensores?idtiposensor=5`: **foto actual** de ~cada pluviómetro (`VALORLECTURA`, `ACUMULADODIA`, `FECHALECTURA` en hora local, lat/lon). Sin consulta de histórico. CKAN `datosabiertos.bogota.gov.co`: acumulados diarios en CSV por año (último hasta dic-2025) y catálogo de estaciones. | **CC BY-NC 4.0** (no comercial: compatible con WindCloud, que no tiene fines de lucro) | En vivo (5 min); el CSV histórico se publica con meses de retraso | **Enlace (T-49)**. Verificación diaria solo capturando `ACUMULADODIA` justo antes de medianoche local (frágil: un cron que falle pierde el día). IDEAM ya trae estaciones en Bogotá (p. ej. El Dorado CATAM, Pasquilla). Reevaluar en T-47. |
| **SIATA** Medellín | ❌ Sin API ni descarga pública: el menú «Descargar información» dice que está deshabilitado temporalmente; `descarga_siata/` y la página de términos dan 404. El sitio indica pedir datos a `solicitud.datos@siata.gov.co`. Medata (portal de Medellín) se renderiza con JS y no expone CKAN. | Sin licencia publicada | — | **Solo enlace.** Acceso a datos únicamente si SIATA lo autoriza por solicitud. |
| **CDIAC** Manizales (UNAL/Corpocaldas) | ❌ Consulta web con usuario y contraseña (`sistema-consultas-webapp`); solo el listado de estaciones (.xlsx) es descargable. | «Algunos derechos reservados», sin licencia abierta | — | **Solo enlace.** Preguntar a `idea_man@unal.edu.co` si se desea usar datos. |
| **CVC** Valle del Cauca | 🟡 datos.gov.co `avya-p282` (precipitación, caudal, nivel; 231 estaciones) y catálogo `kfsz-ija2`. | **CC BY-SA 4.0** | **Detenido:** datos del 01/01/2024 al 12/05/2025, sin actualizar desde mayo de 2025 | **Solo enlace** para la verificación diaria; el histórico podría servir para estudios. |

Notas para el adaptador IDEAM (T-47):
- `fechaobservacion` está en **hora local de Colombia (UTC−5)**, sin zona: El Dorado CATAM marca 18,6 °C a las «13:00» y el
  METAR SKBO 19 °C a las 18Z (= 13:00 local); a las 18Z, en cambio, IDEAM «18:00» = 16,7 °C y METAR 23Z ≈ 15 °C.
- Hay **filas duplicadas** (misma estación y hora dos veces) → deduplicar.
- IDEAM advierte que los datos de estaciones automáticas son **preliminares, sin validación técnica** → control de calidad
  propio y publicarlo como red aparte (RF-9: métricas por red).
- Viento en **m/s** (× 3,6 → km/h). Hay estaciones con 1–4 registros al día: exigir cobertura mínima.
- Volumen: filtrar en el servidor (SoQL) por hora en punto y por estaciones elegidas, no descargar el día completo.
- Sin token, Socrata limita las peticiones por IP; con el token gratuito el límite sube. Empezar sin token.

Correos para pedir acceso (los envía el usuario, no WindCloud): SIATA `solicitud.datos@siata.gov.co`, CDIAC
`idea_man@unal.edu.co`.

## Cartografía
| Fuente | Uso | Licencia |
|---|---|---|
| **MapLibre GL JS** | Motor de mapa | BSD-3 |
| **OpenFreeMap** (estilo `dark`, vector OpenMapTiles) | Mapa base oscuro, fronteras, nombres | Libre, sin clave; datos © OpenStreetMap (ODbL) |
| **EOX Sentinel-2 cloudless 2020** (`tiles.maps.eox.at`) | Mapas base satélite y relieve 3D | CC BY-NC-SA 4.0 (no comercial, igual que Open-Meteo); atribución EOX + Copernicus |
| ~~Esri World Imagery~~ | Descartado | Sus términos exigen cuenta de ArcGIS |
| **AWS Terrain Tiles (Terrarium)** | Relieve 3D (elevación del terreno) | Abierta (Mapzen / AWS Open Data) |
| **geoBoundaries** gbOpen COL ADM1 (commit `9469f09`) | Límites departamentales (`web/public/geo/colombia-departamentos.geojson`) | Para Colombia proviene de **OpenStreetMap → ODbL 1.0** (no CC BY): atribuir "© colaboradores de OpenStreetMap" y compartir derivados con la misma licencia |
| **deck.gl** | Capas de datos | MIT |
| **webgl-wind** (técnica / código) | Partículas de viento | ISC |

## Infraestructura
| Servicio | Plan gratis | Uso |
|---|---|---|
| GitHub (repo público) | Actions ilimitado en repos públicos | Pipelines cron |
| Cloudflare Pages | Sitios estáticos, ancho de banda ilimitado | Hosting web + `/data` |
| Cloudflare R2 | 10 GB, sin costo de salida | Texturas si exceden Pages |
| Cloudflare Workers + KV | Plan gratuito diario | Push opcional (fase 4) |

## Presupuesto de llamadas diario a Open-Meteo (RNF-6)
| Consumidor | Estimado |
|---|---|
| Verificación (40 estaciones × ~9 modelos) | ~360 |
| Usuarios (caché 30 min; por punto: multi-modelo **5,4** + ensambles **8,2** = **13,6** según `X-RateLimit-Cost`) | ~700 consultas ≈ 9 500 |
| **Total** | **≤ 10 000** → si se supera: proxy con caché en Cloudflare Worker o self-host |

> **Medido 2026-11-13:** cabeceras `X-RateLimit-Limit: 600` por ventana de 60 s y `X-RateLimit-Cost: 5.4` por consulta.
> **Nota:** el límite gratuito se aplica por IP del cliente, así que en la práctica cada usuario consume su
> propia cuota. Aun así se diseña como si fuera global, para no depender de ello.
