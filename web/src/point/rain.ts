/** Probabilidades diarias por ensamble listas para mostrar (T-23). */
import type { EnsembleForecast, EnsembleInfo } from '../api/ensemble'
import type { AgreementLevel } from '../core/agreement'
import {
  dailyRainProbability,
  probabilityAgreement,
  type DayProbability,
} from '../core/probability'
import { currentIndex } from './summary'

export interface RainDay {
  day: string
  partial: boolean
  /** Una entrada por ensamble, en el orden de ENSEMBLES. */
  byEnsemble: { ensemble: EnsembleInfo; prob: DayProbability }[]
  agreement: AgreementLevel | null
}

export function rainDays(ens: EnsembleForecast, now: Date): RainDay[] {
  const from = currentIndex(ens.times, now)
  const per = ens.ensembles.map((e) => ({
    ensemble: e.ensemble,
    days: dailyRainProbability(ens.times, e.members, ens.utcOffsetSeconds, from),
  }))
  const days = per[0]?.days ?? []
  return days.map((d, k) => {
    const byEnsemble = per.map((p) => ({ ensemble: p.ensemble, prob: p.days[k] }))
    return {
      day: d.day,
      partial: d.partial,
      byEnsemble,
      agreement: probabilityAgreement(byEnsemble.map((b) => b.prob?.p ?? null)),
    }
  })
}

const pct = (p: number | null) => (p === null ? '—' : `${Math.round(p * 100)} %`)
export const formatPct = pct
