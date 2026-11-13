import './App.css'

export default function App() {
  return (
    <main className="hello">
      <h1>Hola WindCloud</h1>
      <p>
        Observatorio meteorológico abierto: consenso de modelos, acuerdo entre ellos y precisión
        verificada contra estaciones reales.
      </p>
      <div className="chips" aria-label="Tipos de dato">
        <span className="chip chip--observed">Observado</span>
        <span className="chip chip--forecast">Pronóstico</span>
        <span className="chip chip--estimated">Estimado</span>
      </div>
    </main>
  )
}
