import type { AgreementLevel } from '../core/agreement'

const LABEL: Record<AgreementLevel, string> = {
  alto: 'Acuerdo alto',
  medio: 'Acuerdo medio',
  bajo: 'Acuerdo bajo',
}

/** Insignia de acuerdo entre modelos (RF-8). Texto + icono, no solo color (RNF-7). */
export function AgreementBadge({ level }: { level: AgreementLevel | null }) {
  if (!level) return <span className="agreement agreement--na">Sin comparación</span>
  const icon = level === 'alto' ? '●●●' : level === 'medio' ? '●●○' : '●○○'
  return (
    <span className={`agreement agreement--${level}`}>
      <span aria-hidden="true">{icon}</span> {LABEL[level]}
    </span>
  )
}
