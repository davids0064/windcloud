import { useState } from 'react'
import {
  ALERT_HORIZON_H,
  ALERT_RULES,
  CHECK_EVERY_MS,
  DEFAULT_THRESHOLDS,
  describeExceedance,
  pointKey,
  type AlertThresholds,
} from '../core/alerts'
import type { LatLon } from '../map/MapView'
import { DataChip } from '../ui/DataChip'
import { notificationPermission, type AlertsState, type NotifyPermission } from './useAlerts'
import './alerts.css'

const timeFmt = new Intl.DateTimeFormat('es-CO', { hour: 'numeric', minute: '2-digit' })

/** Alertas por ubicación en «Mi punto» (T-53, RF-12). */
export function AlertsSection({
  point,
  alerts,
}: {
  point: (LatLon & { label?: string }) | null
  alerts: AlertsState
}) {
  const { config, setConfig, check } = alerts
  const [draft, setDraft] = useState<AlertThresholds>(config?.thresholds ?? DEFAULT_THRESHOLDS)
  const [permission, setPermission] = useState<NotifyPermission>(notificationPermission)
  const anyRule = ALERT_RULES.some((r) => draft[r.id] !== null)
  const samePoint = config && point && pointKey(config.point) === pointKey(point)

  const askPermission = async () => {
    if (typeof Notification === 'undefined') return
    setPermission(await Notification.requestPermission())
  }

  return (
    <section className="alerts" aria-labelledby="alerts-title">
      <div className="alerts__head">
        <h3 id="alerts-title">Alertas para un punto</h3>
        <DataChip kind="pronostico" />
      </div>
      <p className="alerts__hint">
        Te avisa si el consenso de los modelos supera tus umbrales en las próximas {ALERT_HORIZON_H}{' '}
        h. Solo funciona con esta página abierta (se revisa cada {CHECK_EVERY_MS / 60_000} min). Se
        guarda solo en este navegador.
      </p>

      <fieldset className="alerts__rules">
        <legend>Umbrales</legend>
        {ALERT_RULES.map((r) => {
          const on = draft[r.id] !== null
          return (
            <div key={r.id} className="alerts__rule">
              <label>
                <input
                  type="checkbox"
                  checked={on}
                  onChange={(e) =>
                    setDraft({ ...draft, [r.id]: e.target.checked ? r.default : null })
                  }
                />{' '}
                {r.label} &gt;
              </label>
              <input
                type="number"
                aria-label={`Umbral de ${r.label.toLowerCase()} (${r.unit})`}
                min={r.min}
                max={r.max}
                step={r.step}
                disabled={!on}
                value={draft[r.id] ?? r.default}
                onChange={(e) => {
                  const v = Number(e.target.value)
                  if (Number.isFinite(v)) setDraft({ ...draft, [r.id]: v })
                }}
              />
              <span>{r.unit}</span>
            </div>
          )
        })}
      </fieldset>

      {point ? (
        <button
          type="button"
          className="locate__btn"
          disabled={!anyRule}
          onClick={() =>
            setConfig({
              point: { lat: point.lat, lon: point.lon, label: point.label },
              thresholds: draft,
            })
          }
        >
          {config
            ? samePoint
              ? 'Guardar umbrales'
              : 'Vigilar el punto actual'
            : 'Activar alertas para este punto'}
        </button>
      ) : (
        !config && <p className="alerts__hint">Elige primero un punto en el mapa.</p>
      )}

      {config && (
        <div className="alerts__status" aria-live="polite">
          <p>
            <strong>Vigilando:</strong> {config.point.label ?? 'punto'} (
            {ALERT_RULES.filter((r) => config.thresholds[r.id] !== null)
              .map((r) => r.describe(config.thresholds[r.id]!))
              .join('; ')}
            ).
          </p>
          {!check && <p className="alerts__hint">Revisando…</p>}
          {check?.error && (
            <p role="alert">
              No se pudo revisar ({check.error}). Se reintenta en {CHECK_EVERY_MS / 60_000} min.
            </p>
          )}
          {check && !check.error && (
            <>
              {check.exceedances.length ? (
                <ul className="alerts__list">
                  {check.exceedances.map((e) => (
                    <li key={e.rule}>⚠ {describeExceedance(e)}</li>
                  ))}
                </ul>
              ) : (
                <p>Nada supera tus umbrales en las próximas {ALERT_HORIZON_H} h.</p>
              )}
              <p className="alerts__hint">
                Revisado a las {timeFmt.format(check.at)} · Fuente: consenso de Open-Meteo (los
                datos se renuevan cada 30 min).
              </p>
            </>
          )}
          <button type="button" className="alerts__off" onClick={() => setConfig(null)}>
            Desactivar alertas
          </button>
        </div>
      )}

      <p className="alerts__hint">
        Avisos del navegador: {permission === 'granted' && 'permitidos.'}
        {permission === 'denied' &&
          'bloqueados; solo verás el aviso dentro de la página (puedes cambiarlo en la configuración del sitio).'}
        {permission === 'no-soportado' &&
          'este navegador no los admite; verás el aviso dentro de la página.'}
        {permission === 'default' && (
          <button type="button" className="alerts__perm" onClick={askPermission}>
            Permitir avisos
          </button>
        )}
      </p>
    </section>
  )
}

/** Aviso dentro de la página cuando una revisión encuentra excesos nuevos. */
export function AlertBanner({ alerts, onOpen }: { alerts: AlertsState; onOpen: () => void }) {
  if (!alerts.fresh.length || !alerts.config) return null
  return (
    <div className="alert-banner" role="alert">
      <div>
        <strong>Alerta en {alerts.config.point.label ?? 'tu punto'}</strong>
        <ul>
          {alerts.fresh.map((e) => (
            <li key={e.rule}>{describeExceedance(e)}</li>
          ))}
        </ul>
        <span className="alert-banner__note">
          Pronóstico (consenso de modelos), no alerta oficial.
        </span>
      </div>
      <div className="alert-banner__actions">
        <button type="button" onClick={onOpen}>
          Ver pronóstico
        </button>
        <button type="button" aria-label="Cerrar alerta" onClick={alerts.dismiss}>
          ×
        </button>
      </div>
    </div>
  )
}
