/**
 * Naturaleza del dato (constitución P3): observado (satélite, estaciones) · pronóstico (modelos) ·
 * estimado (indicadores propios de WindCloud). Mismos colores en toda la app (variables CSS).
 */
export type DataKind = 'observado' | 'pronostico' | 'estimado'

const LABEL: Record<DataKind, string> = {
  observado: 'Observado',
  pronostico: 'Pronóstico',
  estimado: 'Estimado',
}

const TITLE: Record<DataKind, string> = {
  observado: 'Dato medido u observado (satélite o estación)',
  pronostico: 'Dato pronosticado por modelos numéricos',
  estimado:
    'Indicador propio de WindCloud calculado a partir de otros datos; no es un pronóstico oficial',
}

export function DataChip({ kind }: { kind: DataKind }) {
  return (
    <span className={`chip chip--${kind}`} title={TITLE[kind]}>
      {LABEL[kind]}
    </span>
  )
}
