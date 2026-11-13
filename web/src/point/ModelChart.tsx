import { useEffect, useRef } from 'react'
import uPlot from 'uplot'
import 'uplot/dist/uPlot.min.css'
import type { MultiModelForecast } from '../api/openMeteo'
import type { ConsensusSeries } from '../core/consensus'
import { UNITS, type VariableId } from '../core/variables'
import { BAND_FILL, CONSENSUS_COLOR, modelColor } from './colors'
import { bandSeries, formatValue } from './summary'
import './ModelChart.css'

interface Props {
  forecast: MultiModelForecast
  consensus: ConsensusSeries
  variable: VariableId
  /** Hora en curso (línea vertical "ahora"). */
  nowIndex: number
}

/**
 * Gráfica de 7 días (RF-6): una línea por modelo + consenso (blanco) + banda mín–máx entre modelos.
 * Eje de tiempo en la zona horaria del punto.
 */
export function ModelChart({ forecast, consensus, variable, nowIndex }: Props) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const xs = forecast.times.map((t) => t.getTime() / 1000)
    const band = bandSeries(forecast, variable)
    const unit = UNITS[variable]
    const tz = forecast.timezone
    const fmt = (v: number | null) =>
      v === null || v === undefined ? '—' : `${formatValue(variable, v)} ${unit}`

    // Orden: x, máx, mín (banda), consenso, modelos…
    const data: uPlot.AlignedData = [
      xs,
      band.max,
      band.min,
      consensus[variable],
      ...forecast.models.map((m) => m.values[variable]),
    ] as uPlot.AlignedData

    const css = getComputedStyle(document.documentElement)
    const axisColor = css.getPropertyValue('--text-muted').trim() || '#9aa5b1'
    const gridColor = 'rgba(154,165,177,0.12)'

    const opts: uPlot.Options = {
      width: el.clientWidth || 360,
      height: 220,
      tzDate: (ts) => uPlot.tzDate(new Date(ts * 1000), tz),
      cursor: { points: { size: 6 }, drag: { x: false, y: false } },
      legend: { live: true },
      scales: {
        x: { time: true },
        y: { range: variable === 'cloud_cover' ? [0, 100] : undefined },
      },
      axes: [
        {
          stroke: axisColor,
          grid: { stroke: gridColor },
          ticks: { stroke: gridColor },
          values: [
            [86400, '{DD}/{MM}', null, null, null, null, null, null, 0],
            [3600, '{HH}:00', '\n{DD}/{MM}', null, null, null, null, null, 0],
          ],
        },
        {
          stroke: axisColor,
          grid: { stroke: gridColor },
          ticks: { stroke: gridColor },
          size: 44,
          values: (_u, ticks) => ticks.map((t) => formatValue(variable, t)),
        },
      ],
      series: [
        {
          label: 'Hora',
          value: (_u, ts) =>
            ts ? uPlot.fmtDate('{DD}/{MM} {HH}:00')(uPlot.tzDate(new Date(ts * 1000), tz)) : '—',
        },
        {
          label: 'Máx.',
          show: true,
          stroke: 'transparent',
          points: { show: false },
          value: (_u, v) => fmt(v),
        },
        {
          label: 'Mín.',
          show: true,
          stroke: 'transparent',
          points: { show: false },
          value: (_u, v) => fmt(v),
        },
        {
          label: 'Consenso',
          stroke: CONSENSUS_COLOR,
          width: 2.5,
          points: { show: false },
          value: (_u, v) => fmt(v),
        },
        ...forecast.models.map((m, i) => ({
          label: m.model.label,
          stroke: modelColor(i),
          width: 1.2,
          alpha: 0.85,
          points: { show: false },
          value: (_u: uPlot, v: number | null) => fmt(v),
        })),
      ],
      bands: [{ series: [1, 2], fill: BAND_FILL }],
      hooks: {
        draw: [
          (u) => {
            // Línea vertical en la hora en curso.
            const x = u.valToPos(xs[nowIndex], 'x', true)
            const ctx = u.ctx
            ctx.save()
            ctx.strokeStyle = 'rgba(255,255,255,0.35)'
            ctx.setLineDash([4, 4])
            ctx.beginPath()
            ctx.moveTo(x, u.bbox.top)
            ctx.lineTo(x, u.bbox.top + u.bbox.height)
            ctx.stroke()
            ctx.restore()
          },
        ],
      },
    }

    const chart = new uPlot(opts, data, el)
    const resize = new ResizeObserver(() => chart.setSize({ width: el.clientWidth, height: 220 }))
    resize.observe(el)
    return () => {
      resize.disconnect()
      chart.destroy()
    }
  }, [forecast, consensus, variable, nowIndex])

  return (
    <div
      ref={ref}
      className="model-chart"
      role="img"
      aria-label="Gráfica de 7 días por modelo con consenso"
    />
  )
}
