# WindCloud

Observatorio meteorológico abierto (Colombia primero): viento, nubes, lluvia, temperatura y riesgo.
En vez de un solo pronóstico, WindCloud muestra el **consenso de los modelos gratuitos**, **cuánto coinciden** y
**qué tan precisos han sido de verdad** frente a estaciones reales.

> Estado: en construcción (Fase 0 · Cimientos). Ver [`CONTEXTO.md`](CONTEXTO.md) y [`specs/03-tareas.md`](specs/03-tareas.md).

## Estructura

| Carpeta | Contenido |
|---|---|
| `specs/` | Especificaciones (desarrollo guiado por especificaciones): constitución, requisitos, diseño, tareas, fuentes |
| `web/` | App React + TypeScript + Vite (mapa, panel de punto, precisión) |
| `pipeline/` | Trabajos Python 3.12 (texturas de viento, verificación, riesgo) que corren en GitHub Actions |
| `.github/workflows/` | Despliegue y trabajos programados |

## Desarrollo local

```bash
# Web
cd web && npm install && npm run dev      # http://localhost:5173
npm test                                   # Vitest
npm run lint && npm run format:check

# Pipeline
cd pipeline && uv sync && uv run pytest
```

## Principios

Solo herramientas y datos **gratuitos**; todo número con **fuente y hora**; observado, pronosticado y estimado
siempre **separados**. Detalle en [`specs/00-constitucion.md`](specs/00-constitucion.md).

## Fuentes de datos y atribuciones

WindCloud no produce pronósticos propios: reúne y compara los de estas fuentes abiertas.

| Fuente | Uso | Licencia / términos |
|---|---|---|
| [Open-Meteo](https://open-meteo.com/) | Pronóstico multi-modelo, ensambles, runs anteriores, geocodificación | Datos CC BY 4.0; API gratuita **solo para uso no comercial** |
| [NOAA GFS / NOMADS](https://nomads.ncep.noaa.gov/) | Rejillas de viento, nubes y lluvia | Dominio público |
| [ECMWF Open Data](https://www.ecmwf.int/en/forecasts/datasets/open-data) | Rejillas de viento IFS / AIFS | CC BY 4.0 |
| [NASA GIBS](https://www.earthdata.nasa.gov/engage/open-data-services-software/earthdata-developer-portal/gibs-api) | Imágenes satelitales GOES de nubes | Abierta, con atribución a NASA |
| [aviationweather.gov](https://aviationweather.gov/data/api/) | Observaciones METAR para verificar modelos | Dominio público (NOAA) |
| [IDEAM / datos.gov.co](https://www.datos.gov.co/) | Estaciones hidrometeorológicas de Colombia | Datos abiertos de Colombia |
| [geoBoundaries](https://www.geoboundaries.org/) | Límites departamentales | CC BY 4.0 |
| [MapLibre GL JS](https://maplibre.org/) | Motor de mapa | BSD-3-Clause |
| [deck.gl](https://deck.gl/) | Capas de datos | MIT |
| [webgl-wind](https://github.com/mapbox/webgl-wind) | Técnica de partículas de viento | ISC |

Los índices de riesgo de WindCloud son **indicadores propios, no el pronóstico oficial del IDEAM**.
La lista se amplía a medida que se integra cada fuente (ver [`specs/04-fuentes-de-datos.md`](specs/04-fuentes-de-datos.md)).

## Licencia

Código propio bajo [MIT](LICENSE). Los datos conservan la licencia de su fuente.
