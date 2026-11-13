import { ENSEMBLES } from '../../api/ensemble'
import { RAIN_AGREEMENT, SPREAD_THRESHOLDS } from '../../core/agreement'
import { MODELS } from '../../core/models'
import { PROB_AGREEMENT_PTS, RAIN_DAY_MM } from '../../core/probability'
import { STALE_RUN_HOURS } from '../../core/runs'
import { ALPHA_RAMP } from '../../clouds/alphaRamp'

/**
 * Metodología (RF-13), versión preliminar con lo ya construido. Los números salen del mismo código que los
 * calcula, para que nunca se desincronicen. La versión completa (verificación, riesgo, referencias) es T-60.
 */
export function MethodologyTab() {
  const [tHi, tMid] = SPREAD_THRESHOLDS.temperature_2m!
  const [wHi, wMid] = SPREAD_THRESHOLDS.wind_speed_10m!
  const [cHi, cMid] = SPREAD_THRESHOLDS.cloud_cover!
  const [rHi, rMid] = RAIN_AGREEMENT
  const [pHi, pMid] = PROB_AGREEMENT_PTS
  return (
    <div className="method">
      <section className="tab-section">
        <h2>Metodología</h2>
        <p>
          Versión preliminar: describe lo que ya funciona. La completa (verificación y riesgo) llega
          en T-60.
        </p>
      </section>

      <dl>
        <dt>Modelos ({MODELS.length})</dt>
        <dd>
          {MODELS.map((m) => m.label).join(', ')}, vía Open-Meteo. MET Norway no se usa fuera de
          Escandinavia porque allí repite a ECMWF y lo contaría dos veces.
        </dd>

        <dt>Consenso</dt>
        <dd>
          Promedio de los modelos con dato en cada hora; la lluvia usa la mediana para que un modelo
          que exagera no la dispare; la dirección del viento se promedia por componentes. Hoy todos
          los modelos pesan igual: los pesos por precisión llegarán con la verificación contra
          estaciones (fase 3).
        </dd>

        <dt>Acuerdo (indicador propio, «Estimado»)</dt>
        <dd>
          Desviación estándar entre modelos; en lluvia, fracción de modelos que coinciden en «llueve
          más de 0,5 mm».
        </dd>
      </dl>
      <table>
        <thead>
          <tr>
            <th>Variable</th>
            <th>Alto</th>
            <th>Medio</th>
            <th>Bajo</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Temperatura</td>
            <td>≤ {tHi} °C</td>
            <td>≤ {tMid} °C</td>
            <td>&gt; {tMid} °C</td>
          </tr>
          <tr>
            <td>Viento y ráfagas</td>
            <td>≤ {wHi} km/h</td>
            <td>≤ {wMid} km/h</td>
            <td>&gt; {wMid} km/h</td>
          </tr>
          <tr>
            <td>Nubosidad</td>
            <td>≤ {cHi} %</td>
            <td>≤ {cMid} %</td>
            <td>&gt; {cMid} %</td>
          </tr>
          <tr>
            <td>Lluvia (sí/no)</td>
            <td>≥ {rHi * 100} %</td>
            <td>≥ {rMid * 100} %</td>
            <td>&lt; {rMid * 100} %</td>
          </tr>
        </tbody>
      </table>

      <dl>
        <dt>Probabilidad de lluvia</dt>
        <dd>
          Fracción de miembros de cada ensamble (
          {ENSEMBLES.map((e) => `${e.label}: ${e.members}`).join(' · ')}) que prevén más de{' '}
          {RAIN_DAY_MM} mm en el día local. Los ensambles no se mezclan; si difieren más de {pMid}{' '}
          puntos se avisa (≤ {pHi} acuerdo alto). «Hoy» cuenta desde la hora en curso.
        </dd>

        <dt>Nubes observadas</dt>
        <dd>
          Imágenes GOES-East de NASA GIBS (visible e infrarrojo, cada 10 min, ~30–50 min de
          retraso). Para ver el mapa debajo, el brillo de cada píxel se convierte en opacidad
          (visible {ALPHA_RAMP.visible.lo}→{ALPHA_RAMP.visible.hi}, infrarrojo{' '}
          {ALPHA_RAMP.infrarrojo.lo}→{ALPHA_RAMP.infrarrojo.hi}) y el gris se aclara a blanco; los
          colores de tormenta del infrarrojo no se tocan. Es solo presentación: el dato no cambia.
        </dd>

        <dt>Capas de pronóstico (GFS y ECMWF)</dt>
        <dd>
          Viento animado, ráfagas, nubosidad, lluvia y temperatura de GFS 0,25° (NOAA) o ECMWF IFS
          0,25° (Open Data, CC BY 4.0; su ráfaga es la máxima de la última hora), cada 3 h hasta 72
          h, sobre Colombia y sus alrededores. Las imágenes se reproyectan a la cuadrícula del mapa
          para no desplazarse (hasta 42 km de error sin hacerlo). Ráfaga = máximo entre la ráfaga
          del modelo y el viento medio (GFS a veces da ráfagas menores). Lluvia: tasa instantánea.
          Isobaras cada 2 hPa con la presión reducida al nivel del mar, suavizada antes de
          trazarlas: sobre los Andes esa reducción es una extrapolación que genera líneas falsas;
          los mapas sinópticos hacen lo mismo.
        </dd>

        <dt>Radar</dt>
        <dd>
          No se muestra radar: el único servicio mundial gratuito (RainViewer) no cubre las ciudades
          colombianas según su propia máscara de cobertura (revisado el 13/11/2026), y su plan
          gratuito es solo para uso personal o educativo con zoom máximo 7. Se enlaza a los radares
          oficiales de Bogotá (IDIGER-SAB) y Medellín (SIATA).
        </dd>

        <dt>Frescura de los datos</dt>
        <dd>
          Cada dato muestra su fuente y la hora del run o de la imagen. Un run de más de{' '}
          {STALE_RUN_HOURS} h se marca «atrasado». Si una fuente falla se muestra «sin datos», nunca
          un valor viejo como actual.
        </dd>

        <dt>Fuentes y licencias</dt>
        <dd>
          Open-Meteo (datos CC BY 4.0; API gratuita solo para uso no comercial) · NASA GIBS / NOAA
          GOES (abierta) · OpenFreeMap y OpenStreetMap (ODbL) · geoBoundaries (ODbL para Colombia) ·
          EOX Sentinel-2 cloudless (CC BY-NC-SA 4.0) · AWS Terrain Tiles · GeoNames vía Open-Meteo
          Geocoding.
        </dd>
      </dl>
    </div>
  )
}
