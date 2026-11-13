import type { ReactNode } from 'react'

/** Sección aún no construida: dice qué tendrá y cuándo, sin datos de relleno (P3: honestidad). */
export function ComingSoon({
  title,
  phase,
  children,
}: {
  title: string
  phase: string
  children: ReactNode
}) {
  return (
    <section className="coming-soon">
      <span className="coming-soon__tag">En construcción · {phase}</span>
      <h2>{title}</h2>
      {children}
    </section>
  )
}
