import { ENSEMBLES } from '../../api/ensemble'
import { ALPHA_RAMP } from '../../clouds/alphaRamp'
import { ALERT_HORIZON_H, CHECK_EVERY_MS } from '../../core/alerts'
import { RAIN_AGREEMENT, RAIN_MM, SPREAD_THRESHOLDS } from '../../core/agreement'
import { FIRES_HOURS, LIGHTNING_MINUTES, RISK, VERIFICATION } from '../../core/methodology'
import { MODELS } from '../../core/models'
import { PROB_AGREEMENT_PTS, RAIN_DAY_MM } from '../../core/probability'
import { STALE_RUN_HOURS } from '../../core/runs'
import { MAX_STATION_KM, MIN_VERIFIED_DAYS, VERIFIED_WINDOW } from '../../core/verifiedWeights'
import { ARROW_KM } from '../../fires/data'
import { MAX_DATA_AGE_MIN } from '../../lightning/data'
import { PRELIMINARY_DAYS } from '../../precision/data'
import { DataChip } from '../../ui/DataChip'
import { SOURCES } from '../../ui/sources'
import './MethodologyTab.css'

const SECTIONS = [
  ['datos', 'Tipos de dato'],
  ['consenso', 'Consenso multimodelo'],
  ['acuerdo', 'Acuerdo entre modelos'],
  ['probabilidad', 'Probabilidad de lluvia'],
  ['verificacion', 'Precisión verificada'],
  ['riesgo', 'Riesgo meteorológico'],
  ['focos', 'Focos de calor'],
  ['rayos', 'Rayos'],
  ['capas', 'Nubes, capas y radar'],
  ['alertas', 'Alertas'],
  ['limites', 'Limitaciones'],
  ['fuentes', 'Fuentes y licencias'],
  ['referencias', 'Referencias'],
] as const

const num = (x: number) => x.toLocaleString('es-CO')

/**
 * Metodología completa (T-60, RF-13, P3). Todos los umbrales salen del código que los usa: en la web,
 * importados; los del pipeline, de `core/methodology.ts`, cuya sincronía comprueba una prueba de Python.
 */
export default function MethodologyTab() {
  const [tHi, tMid] = SPREAD_THRESHOLDS.temperature_2m!
  const [wHi, wMid] = SPREAD_THRESHOLDS.wind_speed_10m!
  const [cHi, cMid] = SPREAD_THRESHOLDS.cloud_cover!
  const [rHi, rMid] = RAIN_AGREEMENT
  const [pHi, pMid] = PROB_AGREEMENT_PTS
  const v = VERIFICATION
  const [ffBajo, ffMod, ffAlto, ffMuy] = RISK.ffwiClasses
  return (
    <div className="method">
      <section className="tab-section">
        <h2>Metodología</h2>
        <p>
          Cómo se calcula cada número de WindCloud, con qué datos y qué no puede hacer. Las cifras
          de esta página salen del mismo código que hace los cálculos.
        </p>
        <nav aria-label="Secciones de la metodología">
          <ol className="method__toc">
            {SECTIONS.map(([id, label]) => (
              <li key={id}>
                <a href={`#m-${id}`}>{label}</a>
              </li>
            ))}
          </ol>
        </nav>
      </section>

      <section id="m-datos" aria-labelledby="h-datos">
        <h3 id="h-datos">Tipos de dato</h3>
        <ul className="method__kinds">
          <li>
            <DataChip kind="observado" /> medido por satélite o estación (nubes, rayos, focos de
            calor, METAR, IDEAM).
          </li>
          <li>
            <DataChip kind="pronostico" /> calculado por modelos numéricos (consenso, capas,
            alertas).
          </li>
          <li>
            <DataChip kind="estimado" /> indicador propio de WindCloud a partir de otros datos
            (acuerdo, riesgo, precisión). No es un pronóstico ni una alerta oficial.
          </li>
        </ul>
        <p>
          Todo dato muestra su fuente y la hora del run, la imagen o la observación. Un run de más
          de {STALE_RUN_HOURS} h se marca «atrasado». Si una fuente falla se dice «sin datos»: nunca
          se muestra un valor viejo como actual.
        </p>
      </section>

      <section id="m-consenso" aria-labelledby="h-consenso">
        <h3 id="h-consenso">Consenso multimodelo</h3>
        <p>
          {MODELS.length} modelos vía Open-Meteo: {MODELS.map((m) => m.label).join(', ')}. MET
          Norway no se usa: fuera de Escandinavia repite a ECMWF y lo contaría dos veces.
        </p>
        <p>En cada hora, con los modelos que tienen dato:</p>
        <ul className="method__formulas">
          <li>
            Temperatura, viento, ráfagas y nubosidad: media ponderada{' '}
            <code>c = Σ wᵢ·xᵢ / Σ wᵢ</code>.
          </li>
          <li>Lluvia: mediana ponderada (un modelo que exagera no la dispara).</li>
          <li>
            Dirección del viento: se promedian las componentes{' '}
            <code>u = −s·sen θ, v = −s·cos θ</code> (s, rapidez; θ, de dónde viene) y se vuelve a
            grados; si el viento medio queda casi en calma, la dirección es «variable».
          </li>
          <li>
            Pesos: si hay una estación verificada a menos de {MAX_STATION_KM} km y la verificación
            lleva al menos {MIN_VERIFIED_DAYS} días, en temperatura y viento{' '}
            <code>wᵢ = 1 / (MAEᵢ + 0,1)</code>, con el error medio de cada modelo allí en los
            últimos {VERIFIED_WINDOW} días (pronóstico emitido 1 día antes). Si no, todos pesan
            igual. Nubosidad y lluvia pesan igual siempre. «¿Por qué este número?» muestra los pesos
            usados.
          </li>
        </ul>
      </section>

      <section id="m-acuerdo" aria-labelledby="h-acuerdo">
        <h3 id="h-acuerdo">
          Acuerdo entre modelos <DataChip kind="estimado" />
        </h3>
        <p>
          Desviación estándar poblacional entre modelos, <code>σ = √(Σ(xᵢ − x̄)² / n)</code>. En
          lluvia, fracción de modelos que coinciden con la mayoría en «llueve más de {RAIN_MM} mm».
          Con menos de 2 modelos no se clasifica.
        </p>
        <table>
          <caption className="method__caption">Umbrales de acuerdo</caption>
          <thead>
            <tr>
              <th scope="col">Variable</th>
              <th scope="col">Alto</th>
              <th scope="col">Medio</th>
              <th scope="col">Bajo</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row">Temperatura</th>
              <td>≤ {num(tHi)} °C</td>
              <td>≤ {num(tMid)} °C</td>
              <td>&gt; {num(tMid)} °C</td>
            </tr>
            <tr>
              <th scope="row">Viento y ráfagas</th>
              <td>≤ {wHi} km/h</td>
              <td>≤ {wMid} km/h</td>
              <td>&gt; {wMid} km/h</td>
            </tr>
            <tr>
              <th scope="row">Nubosidad</th>
              <td>≤ {cHi} %</td>
              <td>≤ {cMid} %</td>
              <td>&gt; {cMid} %</td>
            </tr>
            <tr>
              <th scope="row">Lluvia (sí/no)</th>
              <td>≥ {rHi * 100} %</td>
              <td>≥ {rMid * 100} %</td>
              <td>&lt; {rMid * 100} %</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section id="m-probabilidad" aria-labelledby="h-probabilidad">
        <h3 id="h-probabilidad">Probabilidad de lluvia</h3>
        <p>
          Fracción de miembros de cada ensamble (
          {ENSEMBLES.map((e) => `${e.label}: ${e.members}`).join(' · ')}) que suman más de{' '}
          {RAIN_DAY_MM} mm en el día local: <code>p = miembros con lluvia / miembros</code>. Los
          ensambles no se mezclan; si difieren más de {pMid} puntos se avisa (≤ {pHi}: acuerdo
          alto). «Hoy» cuenta desde la hora en curso.
        </p>
      </section>

      <section id="m-verificacion" aria-labelledby="h-verificacion">
        <h3 id="h-verificacion">
          Precisión verificada <DataChip kind="estimado" />
        </h3>
        <p>
          Cada día se compara el pronóstico emitido 1 y 2 días antes (Open-Meteo, «Previous Runs»)
          con lo medido en dos redes, que se pueden ver por separado:
        </p>
        <ul>
          <li>
            <strong>METAR</strong> de ~40 aeropuertos de Colombia y alrededores (reporte a ±
            {v.matchMin} min de la hora en punto; viento de nudos a km/h; lluvia desde el tiempo
            presente y reciente del reporte).
          </li>
          <li>
            <strong>IDEAM</strong>: ~200 estaciones automáticas (datos.gov.co), una por celda de
            0,25°, lejos de los aeropuertos. Son datos preliminares sin validación; se les aplica
            control de calidad propio (rango, sensor pegado, saltos) y se verifican con 2 días de
            retraso.
          </li>
        </ul>
        <p>
          Control de calidad común: temperatura entre {v.qcTemp[0]} y {v.qcTemp[1]} °C, viento entre{' '}
          {v.qcWind[0]} y {v.qcWind[1]} km/h. Solo cuentan las horas en que los {MODELS.length}{' '}
          modelos tienen dato (comparación justa). Con <em>f</em> pronóstico y <em>o</em>{' '}
          observación:
        </p>
        <ul className="method__formulas">
          <li>
            Error medio absoluto <code>MAE = Σ|f − o| / n</code>; sesgo <code>Σ(f − o) / n</code>{' '}
            (positivo = el modelo se pasa); <code>RMSE = √(Σ(f − o)² / n)</code>.
          </li>
          <li>
            Lluvia en bloques de {v.rainBlockH} h (por hora casi ningún modelo acierta): llovió si
            algún reporte del bloque lo indicó; el modelo «anunció lluvia» si sumó ≥ {v.rainMm} mm;
            un bloque vale si tiene al menos {v.rainMinHours} horas. Con <em>a</em> aciertos,{' '}
            <em>b</em> falsas alarmas y <em>c</em> fallos: <code>POD = a/(a+c)</code>,{' '}
            <code>FAR = b/(a+b)</code>, <code>CSI = a/(a+b+c)</code>, sesgo de frecuencia{' '}
            <code>(a+b)/(a+c)</code>.
          </li>
          <li>
            Ventanas de {v.windows.join(' y ')} días. Un modelo con menos de {v.minPairs} pares
            queda fuera del orden. Con menos de {PRELIMINARY_DAYS} días el ranking se marca
            «preliminar».
          </li>
        </ul>
      </section>

      <section id="m-riesgo" aria-labelledby="h-riesgo">
        <h3 id="h-riesgo">
          Riesgo meteorológico <DataChip kind="estimado" />
        </h3>
        <p>
          Indicador propio, no una alerta oficial (las oficiales son del IDEAM). Por celda de 0,25°
          de GFS sobre Colombia, cada 3 h hasta 72 h:
        </p>
        <ul className="method__formulas">
          <li>
            <strong>Incendio, índice de Fosberg (FFWI):</strong> humedad de equilibrio del
            combustible <em>m</em> de Simard con T (°F) y HR (%):
            <ul>
              <li>
                <code>HR &lt; 10: m = 0,03229 + 0,281073·HR − 0,000578·HR·T</code>
              </li>
              <li>
                <code>10 ≤ HR ≤ 50: m = 2,22749 + 0,160107·HR − 0,01478·T</code>
              </li>
              <li>
                <code>HR &gt; 50: m = 21,0606 + 0,005565·HR² − 0,00035·HR·T − 0,483199·HR</code>
              </li>
            </ul>
            Luego <code>η = 1 − 2(m/30) + 1,5(m/30)² − 0,5(m/30)³</code> y{' '}
            <code>FFWI = η·√(1 + U²) / 0,3002</code> (U, viento en mph), de 0 a 100. Clases propias:
            bajo ≥ {ffBajo}, moderado ≥ {ffMod}, alto ≥ {ffAlto}, muy alto ≥ {ffMuy}.
          </li>
          <li>
            <strong>Viento:</strong> ráfaga &gt; {RISK.gustKmh} km/h (máximo entre la ráfaga y el
            viento medio).
          </li>
          <li>
            <strong>Lluvia:</strong> &gt; {RISK.rainMm3h} mm en 3 h, desde la tasa promedio que GFS
            reinicia cada 6 h (ventana de 3 h directa; de 6 h menos el paso anterior). La primera
            hora del run no tiene acumulado.
          </li>
          <li>
            <strong>Calor:</strong> temperatura a 2 m &gt; {RISK.heatC} °C.
          </li>
        </ul>
        <p>
          El índice de Fosberg solo mira el tiempo de esa hora: no sabe cuántos días lleva sin
          llover ni qué tan seca está la vegetación.
        </p>
      </section>

      <section id="m-focos" aria-labelledby="h-focos">
        <h3 id="h-focos">
          Focos de calor <DataChip kind="observado" />
        </h3>
        <p>
          NASA FIRMS, sensores VIIRS (NOAA-20 y NOAA-21, 375 m) y MODIS (1 km), últimas{' '}
          {FIRES_HOURS} h, solo sobre Colombia. Un foco es un píxel anormalmente caliente (incendio,
          quema agrícola, industria…), no un incendio confirmado. La confianza de VIIRS (baja,
          nominal, alta) se conserva; la de MODIS (0–100) se agrupa: &lt; 30 baja, ≥ 80 alta.
        </p>
        <p>
          «Hacia dónde lo empujaría el viento»: dirección de donde viene el viento del consenso +
          180°, ahora y en +6, +12 y +24 h. La flecha mide siempre {ARROW_KM} km: marca la
          dirección, no la distancia ni la velocidad del fuego, que dependen también del terreno, la
          vegetación y la humedad.
        </p>
      </section>

      <section id="m-rayos" aria-labelledby="h-rayos">
        <h3 id="h-rayos">
          Rayos <DataChip kind="observado" />
        </h3>
        <p>
          Descargas del Geostationary Lightning Mapper (GOES-19) de los últimos {LIGHTNING_MINUTES}{' '}
          min, con calidad buena, sobre Colombia y alrededores; se actualizan cada 10 min. GLM ve
          rayos dentro de las nubes y a tierra, de día y de noche, con resolución de unos 8–14 km;
          puede no detectar descargas débiles. Datos de más de {MAX_DATA_AGE_MIN} min no se dibujan.
        </p>
      </section>

      <section id="m-capas" aria-labelledby="h-capas">
        <h3 id="h-capas">Nubes, capas y radar</h3>
        <p>
          <strong>Nubes observadas:</strong> imágenes GOES-East de NASA GIBS (visible e infrarrojo,
          cada 10 min, ~30–50 min de retraso). Para ver el mapa debajo, el brillo de cada píxel se
          convierte en opacidad (visible {ALPHA_RAMP.visible.lo}→{ALPHA_RAMP.visible.hi}, infrarrojo{' '}
          {ALPHA_RAMP.infrarrojo.lo}→{ALPHA_RAMP.infrarrojo.hi}) y el gris se aclara a blanco; los
          colores de tormenta del infrarrojo no se tocan. Es solo presentación: el dato no cambia.
        </p>
        <p>
          <strong>Capas de pronóstico:</strong> viento animado, ráfagas, nubosidad, lluvia y
          temperatura de GFS 0,25° (NOAA) o ECMWF IFS 0,25° (Open Data), cada 3 h hasta 72 h. Las
          imágenes se reproyectan a la cuadrícula del mapa (sin hacerlo habría hasta 42 km de
          error). Lluvia: tasa instantánea. Isobaras cada 2 hPa con la presión reducida al nivel del
          mar y suavizada: sobre los Andes esa reducción es una extrapolación.
        </p>
        <p>
          <strong>Radar:</strong> no se muestra. El único radar mundial gratuito (RainViewer) no
          cubre las ciudades colombianas (revisado el 13/11/2026); se enlaza a los radares oficiales
          de Bogotá (IDIGER-SAB) y Medellín (SIATA).
        </p>
      </section>

      <section id="m-alertas" aria-labelledby="h-alertas">
        <h3 id="h-alertas">Alertas</h3>
        <p>
          Con la página abierta, cada {CHECK_EVERY_MS / 60_000} min se revisa el consenso de las
          próximas {ALERT_HORIZON_H} h del punto elegido contra tus umbrales (supera = estrictamente
          mayor). Cada regla avisa una vez por día. La configuración se guarda solo en tu navegador.
        </p>
      </section>

      <section id="m-limites" aria-labelledby="h-limites">
        <h3 id="h-limites">Limitaciones</h3>
        <ul>
          <li>
            Los modelos globales (9–28 km) no resuelven valles, laderas ni tormentas aisladas: en
            montaña un punto puede diferir mucho de la celda.
          </li>
          <li>
            El consenso no es más preciso por definición: si todos los modelos fallan igual, el
            acuerdo será alto y el pronóstico, malo. La precisión verificada mide eso.
          </li>
          <li>
            La verificación depende de pocas estaciones por región y de datos del IDEAM
            preliminares; los rankings con pocos días son inestables.
          </li>
          <li>El riesgo usa un solo modelo (GFS) y no considera el estado de la vegetación.</li>
          <li>
            WindCloud no emite alertas oficiales. Ante una emergencia sigue al IDEAM, a la UNGRD y a
            las autoridades locales; en Colombia la línea de emergencias es el 123.
          </li>
        </ul>
      </section>

      <section id="m-fuentes" aria-labelledby="h-fuentes">
        <h3 id="h-fuentes">Fuentes y licencias</h3>
        <ul>
          {SOURCES.map((src) => (
            <li key={src.name}>
              <a href={src.url} target="_blank" rel="noopener noreferrer">
                {src.name}
              </a>
              : {src.use} ({src.license}).
            </li>
          ))}
        </ul>
      </section>

      <section id="m-referencias" aria-labelledby="h-referencias">
        <h3 id="h-referencias">Referencias</h3>
        <ul className="method__refs">
          <li>
            Fosberg, M. A. (1978). Weather in wildland fire management: the fire weather index.
            Conference on Sierra Nevada Meteorology, American Meteorological Society.
          </li>
          <li>
            Simard, A. J. (1968). The moisture content of forest fuels. I: A review of the basic
            concepts. Canadian Forest Service, Information Report FF-X-14.
          </li>
          <li>
            Jolliffe, I. T. y Stephenson, D. B. (eds.) (2012).{' '}
            <em>Forecast Verification: A Practitioner&apos;s Guide in Atmospheric Science</em>, 2.ª
            ed. Wiley.
          </li>
          <li>
            Wilks, D. S. (2019). <em>Statistical Methods in the Atmospheric Sciences</em>, 4.ª ed.
            Elsevier.
          </li>
          <li>
            Goodman, S. J. et al. (2013). The GOES-R Geostationary Lightning Mapper (GLM).{' '}
            <em>Atmospheric Research</em>, 125–126.{' '}
            <a
              href="https://doi.org/10.1016/j.atmosres.2013.01.006"
              target="_blank"
              rel="noopener noreferrer"
            >
              doi:10.1016/j.atmosres.2013.01.006
            </a>
          </li>
          <li>
            Schroeder, W. et al. (2014). The New VIIRS 375 m active fire detection data product.{' '}
            <em>Remote Sensing of Environment</em>, 143.{' '}
            <a
              href="https://doi.org/10.1016/j.rse.2013.12.008"
              target="_blank"
              rel="noopener noreferrer"
            >
              doi:10.1016/j.rse.2013.12.008
            </a>
          </li>
          <li>
            Giglio, L., Schroeder, W. y Justice, C. O. (2016). The collection 6 MODIS active fire
            detection algorithm and fire products. <em>Remote Sensing of Environment</em>, 178.{' '}
            <a
              href="https://doi.org/10.1016/j.rse.2016.02.054"
              target="_blank"
              rel="noopener noreferrer"
            >
              doi:10.1016/j.rse.2016.02.054
            </a>
          </li>
          <li>
            Zippenfenig, P. Open-Meteo.com Weather API. Zenodo.{' '}
            <a
              href="https://doi.org/10.5281/zenodo.7970649"
              target="_blank"
              rel="noopener noreferrer"
            >
              doi:10.5281/zenodo.7970649
            </a>
          </li>
        </ul>
      </section>
    </div>
  )
}
