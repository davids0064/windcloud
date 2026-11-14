/**
 * Fuentes de datos y sus licencias (T-64, RF-13, P1, P7). Lista única: la usan el pie del menú y la página
 * Metodología. Los enlaces a redes oficiales de ciudad no van aquí: WindCloud no usa sus datos.
 */
export interface DataSource {
  name: string
  /** Para qué se usa en WindCloud. */
  use: string
  license: string
  url: string
}

export const SOURCES: DataSource[] = [
  {
    name: 'Open-Meteo',
    use: 'pronóstico de 8 modelos, ensambles, verificación y buscador',
    license: 'datos CC BY 4.0; API gratuita solo para uso no comercial',
    url: 'https://open-meteo.com/',
  },
  {
    name: 'NOAA GFS',
    use: 'capas de viento, ráfagas, nubes, lluvia, temperatura y riesgo',
    license: 'dominio público',
    url: 'https://www.nco.ncep.noaa.gov/pmb/products/gfs/',
  },
  {
    name: 'ECMWF Open Data',
    use: 'capas del modelo europeo (© ECMWF)',
    license: 'CC BY 4.0',
    url: 'https://www.ecmwf.int/en/forecasts/datasets/open-data',
  },
  {
    name: 'NASA GIBS · NOAA GOES-East',
    use: 'nubes observadas',
    license: 'abierta, con atribución a NASA',
    url: 'https://nasa-gibs.github.io/gibs-api-docs/',
  },
  {
    name: 'NOAA GOES-19 GLM (NOAA Open Data en AWS)',
    use: 'rayos',
    license: 'dominio público',
    url: 'https://registry.opendata.aws/noaa-goes/',
  },
  {
    name: 'NASA FIRMS (LANCE)',
    use: 'focos de calor',
    license: 'uso libre con atribución',
    url: 'https://firms.modaps.eosdis.nasa.gov/',
  },
  {
    name: 'NOAA Aviation Weather Center',
    use: 'METAR para la verificación',
    license: 'dominio público',
    url: 'https://aviationweather.gov/',
  },
  {
    name: 'IDEAM (datos.gov.co)',
    use: 'estaciones automáticas para la verificación',
    license: 'CC BY-SA 4.0',
    url: 'https://www.datos.gov.co/',
  },
  {
    name: 'OpenFreeMap · © colaboradores de OpenStreetMap',
    use: 'mapa base oscuro, fronteras y nombres',
    license: 'ODbL 1.0',
    url: 'https://www.openstreetmap.org/copyright',
  },
  {
    name: 'geoBoundaries',
    use: 'límites departamentales (de OpenStreetMap)',
    license: 'ODbL 1.0',
    url: 'https://www.geoboundaries.org/',
  },
  {
    name: 'EOX Sentinel-2 cloudless 2020 (datos Copernicus modificados)',
    use: 'mapas base satélite y relieve',
    license: 'CC BY-NC-SA 4.0',
    url: 'https://s2maps.eu/',
  },
  {
    name: 'AWS Terrain Tiles (Mapzen)',
    use: 'elevación del relieve 3D',
    license: 'abierta, varias fuentes con atribución',
    url: 'https://registry.opendata.aws/terrain-tiles/',
  },
  {
    name: 'GeoNames (vía Open-Meteo Geocoding)',
    use: 'nombres de lugares del buscador',
    license: 'CC BY 4.0',
    url: 'https://www.geonames.org/',
  },
]
