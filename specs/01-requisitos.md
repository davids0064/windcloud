# 01 · Requisitos — WindCloud

Formato: historias de usuario + criterios de aceptación en notación **EARS**
(`CUANDO <evento> EL SISTEMA DEBE <respuesta>`, `MIENTRAS <estado> ...`, `SI <condición> ...`).
Cada requisito tiene un ID (`RF-x` funcional, `RNF-x` no funcional) que las tareas referencian.

---

## Módulo A · Mapa principal

### RF-1 · Mapa interactivo base
**Como** visitante **quiero** un mapa oscuro de Colombia y el mundo **para** explorar el clima.
- EL SISTEMA DEBE abrir centrado en Colombia (lat 4.5, lon −74.0, zoom 5).
- EL SISTEMA DEBE permitir alternar mapa base: oscuro, satélite, relieve 3D.
- EL SISTEMA DEBE mostrar límites departamentales de Colombia y fronteras de países.
- CUANDO el usuario haga clic en el mapa EL SISTEMA DEBE abrir el **panel de punto** (RF-6) para esas coordenadas.

### RF-2 · Capa de viento animado
- EL SISTEMA DEBE dibujar partículas animadas que siguen el viento a 10 m (dirección y velocidad por color).
- EL SISTEMA DEBE permitir elegir altura: 10 m, 850 hPa (~1,5 km), 500 hPa (~5,5 km).
- EL SISTEMA DEBE permitir elegir el modelo fuente (GFS, ECMWF IFS) y mostrar la hora del run.
- EL SISTEMA DEBE tener un control de tiempo para ver las próximas 72 h en pasos de 3 h.
- Capa opcional de **ráfagas** (gusts) como mapa de color.

### RF-3 · Capa de nubes (satélite real)
- EL SISTEMA DEBE mostrar imágenes satelitales **observadas** de nubes (GOES-East para América, Himawari/Meteosat para el resto).
- EL SISTEMA DEBE permitir elegir: visible (día), infrarrojo (día y noche).
- EL SISTEMA DEBE mostrar la hora de la imagen y animar las últimas 3 h.
- EL SISTEMA DEBE ofrecer además **nubosidad pronosticada** (%) por modelo como capa separada, rotulada "pronóstico".

### RF-4 · Capa de lluvia
- EL SISTEMA DEBE mostrar radar de precipitación observado donde exista cobertura gratuita.
- EL SISTEMA DEBE mostrar precipitación pronosticada (mm/h) por modelo.
- SI no hay radar en la zona, EL SISTEMA DEBE indicarlo y ofrecer la estimación satelital/modelo.

### RF-5 · Otras capas
- Temperatura 2 m, humedad relativa, presión a nivel del mar (isobaras), rayos (GOES GLM), calidad del aire (PM2.5).
- Cada capa muestra leyenda, unidad, fuente y antigüedad (P4).

## Módulo B · Pronóstico de precisión por punto

### RF-6 · Panel de punto multi-modelo
**Como** usuario **quiero** ver qué dicen todos los modelos para mi ubicación **para** decidir con confianza.
- CUANDO se seleccione un punto EL SISTEMA DEBE consultar en paralelo **todos los modelos gratuitos** disponibles para esa ubicación (mín.: ECMWF IFS, ECMWF AIFS, GFS, ICON, GEM, JMA, Météo-France, UKMO, MET Norway).
- EL SISTEMA DEBE mostrar una gráfica de 7 días con una línea por modelo + la línea de **consenso** + banda de dispersión.
- EL SISTEMA DEBE mostrar para cada variable (temperatura, viento, ráfagas, nubosidad, lluvia, prob. de lluvia) el **valor de consenso** y el **acuerdo** (alto/medio/bajo).
- EL SISTEMA DEBE mostrar probabilidad de lluvia basada en **ensambles** (p. ej. "62 % de 51 miembros ECMWF prevén lluvia > 1 mm").
- EL SISTEMA DEBE permitir "Usar mi ubicación" (geolocalización del navegador) y buscar por nombre de lugar.

### RF-7 · Consenso ponderado por precisión
- EL SISTEMA DEBE calcular el consenso como promedio ponderado donde el peso de cada modelo es inverso a su error reciente (RF-9) en la zona más cercana.
- SI no hay datos de verificación cercanos, EL SISTEMA DEBE usar pesos iguales y decirlo.
- EL SISTEMA DEBE mostrar "¿Por qué este número?" con los pesos usados.

### RF-8 · Indicador de acuerdo entre modelos
- EL SISTEMA DEBE clasificar el acuerdo por variable: **Alto** (dispersión ≤ umbral bajo), **Medio**, **Bajo** (ver umbrales en diseño §5).
- MIENTRAS el acuerdo sea Bajo EL SISTEMA DEBE mostrar un aviso "los modelos no coinciden: pronóstico incierto".

## Módulo C · Verificación pública de precisión

### RF-9 · Tablero de precisión de modelos
**Como** usuario **quiero** saber qué modelo acierta más en mi región **para** confiar en el correcto.
- EL SISTEMA DEBE comparar cada día los pronósticos de 24 h y 48 h de cada modelo contra observaciones reales de estaciones, priorizando las **redes locales de ciudad** (SAB Bogotá, SIATA Medellín, CDIAC Manizales, CVC Cali) cuando su acceso esté permitido, luego IDEAM y por último aeropuertos METAR.
- EL SISTEMA DEBE indicar qué red respalda cada métrica.
- EL SISTEMA DEBE publicar por estación y por región: MAE y sesgo de temperatura, MAE de viento, acierto de lluvia sí/no (tasa de aciertos y falsas alarmas).
- EL SISTEMA DEBE mostrar un ranking de modelos (últimos 7 y 30 días) y un mapa de estaciones coloreadas por el mejor modelo.
- EL SISTEMA DEBE guardar el histórico para que el ranking mejore con el tiempo.

## Módulo D · Riesgo y alertas

### RF-10 · Riesgo meteorológico
- EL SISTEMA DEBE calcular por celda: riesgo de incendio (índice de Fosberg), viento fuerte (ráfagas > 60 km/h), lluvia intensa (> 20 mm/3 h) y calor (T > 35 °C).
- EL SISTEMA DEBE rotularlo como **indicador propio**, con enlace a las alertas oficiales del IDEAM.

### RF-11 · Integración con incendios (opcional, fase 3)
- EL SISTEMA DEBE poder superponer focos de calor NASA FIRMS y, al tocar un foco, mostrar viento actual y pronosticado (**hacia dónde se propagaría**).

### RF-12 · Alertas por ubicación (opcional, fase 3)
- CUANDO el usuario fije un punto y umbrales EL SISTEMA DEBE avisar en el navegador (página abierta) si el consenso supera el umbral.
- Push con la página cerrada solo si existe un mecanismo gratuito viable (ver diseño §8).

### RF-14 · Red oficial de la ciudad
**Como** habitante de una ciudad con red propia **quiero** acceder a ella desde WindCloud **para** contrastar con la medición oficial local.
- CUANDO el punto seleccionado esté dentro de una ciudad con red local registrada EL SISTEMA DEBE mostrar un enlace "Red oficial de lluvias de <ciudad>" con su operador.
- SI la red está marcada como no verificada o caída, EL SISTEMA NO DEBE mostrar el enlace.
- EL SISTEMA DEBE mostrar, en la pestaña Precisión, qué ciudades tienen red local y cuáles dependen solo de IDEAM/METAR.

## Módulo E · Contenido

### RF-13 · Metodología y fuentes
- Pestañas: **Mapa**, **Mi punto**, **Precisión**, **Riesgo**, **Metodología**.
- Metodología explica fórmulas de consenso, acuerdo, verificación y riesgo, con referencias y limitaciones.
- Pie de página con atribución de cada fuente y licencia.

---

## No funcionales
| ID | Requisito |
|---|---|
| RNF-1 | **Costo $0**: solo planes gratuitos permanentes (P1). |
| RNF-2 | Carga inicial ≤ 3 s en 4G; bundle JS inicial ≤ 600 KB gzip (mapas con carga diferida). |
| RNF-3 | Animación de viento ≥ 30 fps en un portátil medio, degradar a menos partículas en móvil. |
| RNF-4 | Responsive desde 360 px; menú colapsable como en fuego.huella.world. |
| RNF-5 | Caché: respuestas de modelos 30 min en el navegador; capas de viento se regeneran cada 6 h. |
| RNF-6 | Respetar límites: ≤ 10 000 llamadas/día a Open-Meteo en total (cliente + trabajos). |
| RNF-7 | Accesibilidad WCAG 2.1 AA; colores de leyendas aptos para daltonismo. |
| RNF-8 | Sin cookies de rastreo; ubicación del usuario nunca sale del navegador salvo para la consulta meteorológica. |
| RNF-9 | Todo dato muestra fuente + hora (P2, P4). |

## Fuera de alcance (v1)
- Cuentas de usuario, pagos, app nativa, pronósticos propios con IA, radar de Colombia del IDEAM (no es abierto).
