import { CITY_NETWORKS_CHECKED, STATUS_LABEL, citiesByStatus } from '../data/cityNetworks'
import { DataChip } from '../ui/DataChip'
import { Segmented } from '../ui/Segmented'
import { SourceLine } from '../ui/SourceLine'
import {
  PRELIMINARY_DAYS,
  UNIT,
  VARIABLES,
  WINDOWS,
  NETWORK_LABEL,
  bestByStation,
  daysFor,
  fmt,
  generatedLabel,
  modelColorOf,
  modelLabel,
  networksOf,
  rankModels,
  scoresFor,
  stationsOf,
  windowRange,
  type ContinuousScore,
  type Lead,
  type NetworkFilter,
  type PrecisionSummary,
  type RainScore,
  type RankRow,
  type Scores,
  type VerifVariable,
  type WindowId,
} from './data'
import { useStationDetail, type Loadable } from './usePrecision'
import './precision.css'

export interface PrecisionSelection {
  win: WindowId
  variable: VerifVariable
  lead: Lead
  red: NetworkFilter
}

interface Props {
  state: Loadable<PrecisionSummary>
  selection: PrecisionSelection
  onSelection: (s: PrecisionSelection) => void
  station: string | null
  onStation: (icao: string | null) => void
}

/** Pestaña Precisión (T-44, RF-9): ranking de modelos, estaciones por mejor modelo y detalle. */
export default function PrecisionTab({ state, selection, onSelection, station, onStation }: Props) {
  if (state.status === 'off' || state.status === 'loading') {
    return <p className="tab-section">Cargando la verificación…</p>
  }
  if (state.status === 'error') {
    return (
      <section className="tab-section">
        <h2>Precisión verificada</h2>
        <p role="alert">
          Sin datos de verificación ({state.message}). El consenso usa pesos iguales mientras tanto.
        </p>
        <CityNetworks />
      </section>
    )
  }
  const summary = state.data
  const { win, variable, lead, red } = selection
  const w = summary.ventanas[win]
  const set = (patch: Partial<PrecisionSelection>) => onSelection({ ...selection, ...patch })
  const minPairs = summary.umbrales.min_pares_ranking
  const rows = rankModels(scoresFor(summary, win, red), variable, lead, summary.modelos, minPairs)
  const best = bestByStation(summary, win, variable)
  const info = summary.estaciones.find((s) => s.icao === station)
  const networks = networksOf(summary)
  const listed = stationsOf(summary, red)
  const days = daysFor(summary, win, red)
  const source =
    red === 'todas'
      ? summary.fuentes.observacion
      : (summary.fuentes.redes?.[red] ?? summary.fuentes.observacion)
  const counts = networks.map((n) => {
    const k = summary.estaciones.filter((s) => s.red === n).length
    return `${k} ${NETWORK_LABEL[n] ?? n}`
  })

  return (
    <section className="tab-section precision">
      <header className="precision__head">
        <h2>Precisión verificada</h2>
        <DataChip kind="estimado" />
      </header>
      <p>
        Cada día se compara lo que cada modelo pronosticó con lo que midieron {counts.join(' y ')}.
        Menor error = mejor. Las redes se pueden ver por separado: no tienen la misma calidad (los
        datos del IDEAM son preliminares).
      </p>

      <div className="precision__controls">
        {networks.length > 1 && (
          <Segmented
            label="Red"
            value={red}
            options={[
              { id: 'todas', label: 'Todas' },
              ...networks.map((n) => ({ id: n, label: n })),
            ]}
            onChange={(v) => set({ red: v })}
          />
        )}
        <Segmented
          label="Ventana"
          value={win}
          options={WINDOWS}
          onChange={(v) => set({ win: v })}
        />
        <Segmented
          label="Variable"
          value={variable}
          options={VARIABLES}
          onChange={(v) => set({ variable: v })}
        />
        <Segmented
          label="Pronóstico emitido"
          value={String(lead) as '1' | '2'}
          options={[
            { id: '1', label: '1 día antes' },
            { id: '2', label: '2 días antes' },
          ]}
          onChange={(v) => set({ lead: Number(v) as Lead })}
        />
      </div>

      {days < PRELIMINARY_DAYS && (
        <p className="precision__notice" role="note">
          Preliminar: {days} {days === 1 ? 'día' : 'días'} con datos
          {Number(win) > days ? ` de ${win}` : ''}. El ranking se estabiliza con al menos{' '}
          {PRELIMINARY_DAYS} días.
        </p>
      )}

      {info ? (
        <StationView
          summary={summary}
          station={info.icao}
          selection={selection}
          onBack={() => onStation(null)}
        />
      ) : (
        <>
          <h3>
            Ranking en toda la región
            {red === 'todas' ? (networks.length > 1 ? ' (todas las redes)' : '') : ` · ${red}`}
          </h3>
          <ScoreTable variable={variable} rows={rows} />
          <MetricHelp variable={variable} summary={summary} />
        </>
      )}

      <SourceLine
        source={`${source} (red: ${red === 'todas' ? networks.join(' + ') || '—' : red}) · pronósticos: ${summary.fuentes.pronostico}`}
        time={{
          label: `ventana ${windowRange(w.dias)} UTC (${days} días) · calculado ${generatedLabel(summary.generatedAt)}`,
          dateTime: summary.generatedAt,
        }}
      />

      <h3>Estaciones</h3>
      <p className="precision__hint">
        En el mapa, cada aeropuerto toma el color del modelo con menor error allí (
        {VARIABLES.find((v) => v.id === variable)?.label.toLowerCase()}, 1 día antes). Gris hueco =
        aún sin muestra suficiente.
      </p>
      <Legend models={[...new Set([...best.values()].filter((m): m is string => !!m))]} />
      <ul className="precision__stations">
        {listed.map((s) => {
          const m = best.get(s.icao) ?? null
          return (
            <li key={s.icao}>
              <button
                type="button"
                aria-pressed={station === s.icao}
                onClick={() => onStation(station === s.icao ? null : s.icao)}
              >
                <Dot model={m} />
                <span className="precision__icao" title={s.icao}>
                  {s.red === 'METAR' ? s.icao : s.red}
                </span>
                <span className="precision__name">
                  {s.nombre}
                  {s.departamento ? ` · ${s.departamento}` : ` · ${s.pais}`}
                </span>
                <span className="precision__best">{m ? modelLabel(m) : 'sin muestra'}</span>
              </button>
            </li>
          )
        })}
      </ul>
      <p className="precision__hint">
        El consenso del panel de punto pondera temperatura y viento por esta precisión (estación
        verificada más cercana, a menos de 150 km) cuando la verificación lleva al menos 14 días.
      </p>
      <CityNetworks />
    </section>
  )
}

function StationView({
  summary,
  station,
  selection,
  onBack,
}: {
  summary: PrecisionSummary
  station: string
  selection: PrecisionSelection
  onBack: () => void
}) {
  const detail = useStationDetail(station)
  const info = summary.estaciones.find((s) => s.icao === station)!
  const scores: Scores | undefined =
    detail.status === 'ready' ? detail.data.ventanas[selection.win]?.metricas : undefined
  return (
    <div className="precision__station">
      <div className="precision__station-head">
        <h3>
          {info.icao} · {info.nombre}
        </h3>
        <button type="button" className="precision__back" onClick={onBack}>
          Ver toda la región
        </button>
      </div>
      <p className="precision__hint">
        {info.departamento ?? info.pais} · red {info.red}
      </p>
      {detail.status === 'loading' && <p>Cargando estación…</p>}
      {detail.status === 'error' && <p role="alert">Sin datos de esta estación.</p>}
      {detail.status === 'ready' && !scores && <p>Sin datos en esta ventana.</p>}
      {scores && (
        <ScoreTable
          variable={selection.variable}
          rows={rankModels(
            scores,
            selection.variable,
            selection.lead,
            summary.modelos,
            summary.umbrales.min_pares_ranking,
          )}
        />
      )}
    </div>
  )
}

function ScoreTable({ variable, rows }: { variable: VerifVariable; rows: RankRow[] }) {
  const rain = variable === 'lluvia'
  const unit = rain ? '' : UNIT[variable]
  const positions = rows.map((_, i) => rows.slice(0, i + 1).filter((r) => r.ranked).length)
  return (
    <table className="precision__table">
      <thead>
        <tr>
          <th scope="col">#</th>
          <th scope="col">Modelo</th>
          {rain ? (
            <>
              <th scope="col" title="Índice de éxito crítico: 1 = perfecto">
                CSI
              </th>
              <th scope="col" title="Fracción de lluvias que el modelo anunció">
                Aciertos
              </th>
              <th scope="col" title="Fracción de anuncios de lluvia en que no llovió">
                Falsas al.
              </th>
              <th scope="col" title="Veces que anuncia lluvia por cada vez que llueve: 1 = ideal">
                Frec.
              </th>
            </>
          ) : (
            <>
              <th scope="col" title="Error absoluto medio">
                Error ({unit})
              </th>
              <th scope="col" title="Pronóstico menos observado: + = se pasa, − = se queda corto">
                Sesgo
              </th>
            </>
          )}
          <th scope="col" title={rain ? 'Bloques de 6 h comparados' : 'Horas comparadas'}>
            n
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map(({ model, score, ranked }, i) => {
          const r = score as RainScore
          const c = score as ContinuousScore
          return (
            <tr key={model} className={ranked ? undefined : 'precision__unranked'}>
              <td>{ranked ? positions[i] : '–'}</td>
              <td>
                <Dot model={model} /> {modelLabel(model)}
              </td>
              {rain ? (
                <>
                  <td>{fmt.ratio(r.csi)}</td>
                  <td>{fmt.pct(r.pod)}</td>
                  <td>{fmt.pct(r.far)}</td>
                  <td>{fmt.value(r.sesgo_frecuencia)}×</td>
                </>
              ) : (
                <>
                  <td>{fmt.value(c.mae)}</td>
                  <td>{fmt.signed(c.sesgo)}</td>
                </>
              )}
              <td>{score.n}</td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

function MetricHelp({ variable, summary }: { variable: VerifVariable; summary: PrecisionSummary }) {
  const u = summary.umbrales
  if (variable === 'lluvia') {
    return (
      <p className="precision__hint">
        Lluvia sí/no en bloques de {u.lluvia_bloque_h} h: llovió si algún reporte del aeropuerto lo
        indicó; el modelo «anunció lluvia» si sumaba al menos {fmt.value(u.lluvia_mm_bloque)} mm.
        Por hora no se compara: un desfase de una hora o de unos kilómetros contaría como error
        doble.
      </p>
    )
  }
  return (
    <p className="precision__hint">
      Error = diferencia media entre pronóstico y medición. Sesgo negativo = el modelo se queda
      corto ({variable === 'temperatura' ? 'más frío' : 'menos viento'} de lo medido). Solo cuentan
      las horas en que los 8 modelos tenían pronóstico; un modelo entra al ranking con ≥{' '}
      {u.min_pares_ranking} horas.
    </p>
  )
}

function Dot({ model }: { model: string | null }) {
  return (
    <span
      className={model ? 'precision__dot' : 'precision__dot precision__dot--empty'}
      style={model ? { background: modelColorOf(model) } : undefined}
      aria-hidden="true"
    />
  )
}

function Legend({ models }: { models: string[] }) {
  if (!models.length) return null
  return (
    <ul className="precision__legend" aria-label="Colores de los modelos en el mapa">
      {models.map((m) => (
        <li key={m}>
          <Dot model={m} /> {modelLabel(m)}
        </li>
      ))}
    </ul>
  )
}

const ddmmyyyy = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`

/** Ciudades con red local y las que dependen solo de IDEAM/METAR (RF-14). */
function CityNetworks() {
  const { verified, unverified, without } = citiesByStatus()
  return (
    <section className="precision__cities" aria-labelledby="precision-cities-title">
      <h3 id="precision-cities-title">Redes locales de ciudad</h3>
      <p className="precision__hint">
        Redes oficiales más densas que los aeropuertos. WindCloud solo enlaza a ellas (sus datos no
        tienen licencia abierta ni descarga); no entran en la verificación.
      </p>
      <ul className="precision__city-list">
        {verified.map((c) => (
          <li key={c.ciudad}>
            <strong>{c.ciudad}</strong>:{' '}
            <a href={c.url} target="_blank" rel="noopener noreferrer">
              {c.red}
            </a>{' '}
            <span className="precision__city-op">({c.operador})</span>
          </li>
        ))}
        {unverified.map((c) => (
          <li key={c.ciudad}>
            <strong>{c.ciudad}</strong>: {c.red} ({c.operador}) — <em>{STATUS_LABEL[c.estado]}</em>
            {c.nota ? `. ${c.nota}` : ''} Sin enlace; usa IDEAM y METAR.
          </li>
        ))}
      </ul>
      <p className="precision__hint">
        Sin red local pública: {without.map((c) => c.ciudad).join(', ')}. Dependen solo de IDEAM y
        METAR. Estado de las redes comprobado el {ddmmyyyy(CITY_NETWORKS_CHECKED)}.
      </p>
    </section>
  )
}
