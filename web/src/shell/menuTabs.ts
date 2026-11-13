/** Pestañas del menú (RF-13). */
export type TabId = 'mapa' | 'punto' | 'precision' | 'riesgo' | 'metodologia'

/** Pestañas de RF-13. */
export const TABS: { id: TabId; label: string }[] = [
  { id: 'mapa', label: 'Mapa' },
  { id: 'punto', label: 'Mi punto' },
  { id: 'precision', label: 'Precisión' },
  { id: 'riesgo', label: 'Riesgo' },
  { id: 'metodologia', label: 'Metodología' },
]
