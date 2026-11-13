# 04 · Catálogo de fuentes gratuitas — WindCloud

Regla (P1): solo fuentes con plan gratuito permanente. **Verificar límites y términos vigentes antes de
implementar cada una** (columna "Verificar"), porque cambian con el tiempo.

## Pronóstico por punto
| Fuente | Qué da | Clave | Límite / licencia | Uso en WindCloud | Verificar |
|---|---|---|---|---|---|
| **Open-Meteo Forecast API** | ECMWF IFS, AIFS, GFS, ICON, GEM, JMA, Météo-France, UKMO, MET Norway, KMA y más; `best_match` | No | ~10 000 llamadas/día, **solo no comercial**; datos CC BY 4.0 | Panel de punto multi-modelo | Lista de modelos y nombres |
| **Open-Meteo Ensemble API** | ECMWF ENS (51), GFS ENS (31), ICON-EPS | No | Igual | Probabilidad de lluvia | Miembros disponibles |
| **Open-Meteo Previous Runs API** | Pronósticos pasados por lead time | No | Igual | Verificación sin archivar runs | Variables `_previous_dayN` |
| **Open-Meteo Geocoding** | Buscar lugares | No | Igual | Buscador | — |
| **Open-Meteo Air Quality** | PM2.5, PM10, O₃ (CAMS) | No | Igual | Panel de punto | — |
| **MET Norway Locationforecast** | Modelo noruego / ECMWF | No (exige `User-Agent` identificable genérico) | Gratis, CC BY 4.0 | Respaldo si Open-Meteo falla | Política de uso |
| **Self-host Open-Meteo** | Todo lo anterior | No | AGPLv3 | **Plan B si el proyecto se vuelve comercial** | Requisitos de disco |

## Grids para mapas (viento, nubes, lluvia)
| Fuente | Qué da | Clave | Licencia | Uso | Verificar |
|---|---|---|---|---|---|
| **NOAA GFS 0.25° (NOMADS)** | GRIB2 global cada 6 h, 384 h | No | Dominio público | Texturas de viento, ráfagas, nubes, lluvia | Límite de peticiones de NOMADS; alternativa: bucket `noaa-gfs-bdp-pds` en AWS |
| **ECMWF Open Data** | GRIB2 0.25° IFS y AIFS | No | CC BY 4.0 | Texturas de viento ECMWF | Variables y resolución abiertas actuales |
| **DWD ICON (opendata.dwd.de)** | GRIB2 global ICON | No | Abierta con atribución | Opcional, tercer modelo en mapa | Formato de rejilla icosaédrica (requiere regridding) |

## Observación (lo que realmente pasó)
| Fuente | Qué da | Clave | Licencia | Uso | Verificar |
|---|---|---|---|---|---|
| **NASA GIBS (WMTS)** | Imágenes GOES-East/West, Himawari, Meteosat; ~10 min | No | Abierta (atribuir NASA) | Capa de nubes observadas | IDs de capa en GetCapabilities |
| **aviationweather.gov Data API** | METAR de aeropuertos en JSON | No | Dominio público (NOAA) | Verificación de modelos | Límite de peticiones |
| **IDEAM / datos.gov.co (Socrata)** | Estaciones hidrometeorológicas de Colombia | No (token opcional) | Datos abiertos Colombia | Verificación local extra | Latencia y frecuencia de los datasets |
| **RainViewer** | Tiles de radar mundial | No | Gratis con atribución | Capa de radar | **Términos 2025+ redujeron la API gratuita** |
| **NOAA GOES GLM (AWS Open Data)** | Rayos | No | Dominio público | Capa de rayos | Volumen de datos |
| **NASA FIRMS** | Focos de calor VIIRS/MODIS | Sí, MAP_KEY gratuita | Abierta | Integración incendios (fase 4) | Límite de transacciones por 10 min |

## Redes locales de ciudad (Colombia) — máxima precisión urbana
Más densas y precisas que METAR (decenas de estaciones dentro de la ciudad vs. 1 aeropuerto).
Uso doble: **(a) verificación de modelos** (RF-9) y **(b) enlace "Red oficial de tu ciudad"** (RF-14).
Estado comprobado el 2026-11-12 (código HTTP). **Antes de usar datos: confirmar acceso programático y términos de uso**;
si solo se pueden ver en pantalla, usar únicamente como enlace (nunca extraer datos raspando la página contra sus términos).

| Ciudad | Red / sitio | Operador | Contenido | Estado | Uso previsto |
|---|---|---|---|---|---|
| Bogotá | `https://app.sab.gov.co/sab/lluvias.htm` | IDIGER – Sistema de Alerta de Bogotá (SAB) | Pluviómetros en vivo, acumulado desde 0:00, últimas 6 h por estación, radar IDIGER | ✅ 200 | Enlace + verificación si hay acceso a datos |
| Medellín / Valle de Aburrá | `https://siata.gov.co/siata_nuevo/` | SIATA (AMVA, Alcaldía de Medellín, EAFIT) | Radar propio (~5 min), >140 estaciones, pluviómetros, niveles de quebradas, pronóstico | ✅ 200 | Enlace + verificación (red más completa del país) |
| Manizales / Caldas | `https://cdiac.manizales.unal.edu.co/` (Geoportal SIMAC, "Listado de Estaciones") | IDEA–CDIAC, Universidad Nacional sede Manizales | Estaciones urbanas cada 5 min (lluvia, T, HR, radiación…) | ✅ 200 (el enlace antiguo `idea…/estado-tiempo-manizales` da 404) | Enlace + verificación |
| Cali / Valle del Cauca | `https://portal-hidroclimatologico.cvc.gov.co/` | CVC | Red regional (~280 estaciones según prensa; estaciones en cuenca del río Cali) | ✅ 200 | Enlace + verificación; red departamental, no exclusiva de Cali |
| Pereira / Risaralda | `redhidro.org` (UTP) | Universidad Tecnológica de Pereira | ~75 puntos de monitoreo | ⚠️ Sin respuesta; `utp.edu.co/hidroclimatologica` 404 | Pendiente de confirmar |
| Bucaramanga | `https://www.cdmb.gov.co/` | CDMB | 19 estaciones automáticas, alerta > 60 mm/h | ⚠️ Sin visor público en vivo encontrado | Pendiente de confirmar |
| Barranquilla, Cartagena, Cúcuta, Ibagué, Armenia, Popayán, Pasto | — | — | Sin red pública urbana en vivo encontrada | — | Usar IDEAM + METAR |

**Respaldo nacional:** IDEAM (2.854 estaciones, 310 automáticas con transmisión) vía datos.gov.co.

## Cartografía
| Fuente | Uso | Licencia |
|---|---|---|
| **MapLibre GL JS** | Motor de mapa | BSD-3 |
| **OpenFreeMap** o tiles de Esri (como usa la referencia) | Mapa base oscuro | OpenFreeMap: libre; Esri: revisar términos de uso gratuito |
| **AWS Terrain Tiles (Terrarium)** | Relieve 3D | Abierta |
| **geoBoundaries** | Límites departamentales | CC BY 4.0 |
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
| Usuarios (caché 30 min, ~9 llamadas por consulta multi-modelo) | ~1 000 consultas ≈ 9 000 |
| **Total** | **≤ 10 000** → si se supera: proxy con caché en Cloudflare Worker o self-host |

> **Nota:** el límite gratuito se aplica por IP del cliente, así que en la práctica cada usuario consume su
> propia cuota. Aun así se diseña como si fuera global, para no depender de ello.
