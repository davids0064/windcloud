# 00 · Constitución del proyecto — WindCloud

> Principios que **no se negocian**. Toda decisión de requisitos, diseño o código debe respetarlos.
> Si una tarea entra en conflicto con este documento, gana este documento.

## Visión
WindCloud es un **observatorio meteorológico abierto** (Colombia primero, mundo después), inspirado en la
estructura de *Memoria del Fuego* (fuego.huella.world), pero dedicado al **clima: viento, nubes, lluvia,
temperatura y riesgo**. Su diferencia: **no muestra un solo pronóstico**, sino el **consenso de todos los
modelos gratuitos disponibles**, cuánto coinciden y **qué tan precisos han sido de verdad** en cada lugar.

## Principios

### P1 · Solo herramientas y datos gratuitos
- Toda fuente de datos, librería y servicio de hosting debe tener un plan **gratuito permanente** (no de prueba).
- Prohibido depender de una API con tarjeta de crédito obligatoria.
- Cada fuente documenta su licencia y límites en `04-fuentes-de-datos.md`.
- **Advertencia de licencia:** la API gratuita de Open-Meteo es **solo para uso no comercial**. Si el proyecto
  llega a ser comercial, la alternativa gratuita es **auto-alojar Open-Meteo** (código AGPLv3, datos CC BY 4.0).

### P2 · Precisión demostrable, no prometida
- Ningún número se muestra sin su **fuente** y su **hora de emisión** (run del modelo).
- Toda predicción muestra su **incertidumbre** (dispersión entre modelos y/o ensamble).
- La precisión de cada modelo se **mide contra observaciones reales** (estaciones METAR/IDEAM) y se publica.

### P3 · Honestidad metodológica (heredado de fuego.huella.world)
- Separar visualmente: **observado** (satélite, estaciones) · **pronosticado** (modelos) · **estimado** (índices propios).
- Los índices propios (p. ej. riesgo) se rotulan "indicador propio, no es el pronóstico oficial del IDEAM".
- Pestaña **Metodología** obligatoria con fórmulas, fuentes y limitaciones.

### P4 · Tiempo real con honestidad sobre la latencia
- Cada capa indica su **antigüedad** ("satélite hace 10 min", "modelo de las 06 UTC").
- Si una fuente falla, se muestra "sin datos" y nunca un valor viejo como si fuera actual.

### P5 · Costo cero de operación
- Preferir **sitio estático + trabajos programados** (GitHub Actions) sobre servidores siempre encendidos.
- El navegador llama directo a APIs con CORS abierto cuando sea posible.

### P6 · Accesible y en español
- Interfaz en español (es-CO), unidades métricas, hora local con UTC visible.
- Funciona en móvil (≥ 360 px), modo oscuro por defecto, contraste AA.

### P7 · Código y datos abiertos
- Repositorio público, licencia MIT para el código propio, atribución visible de cada fuente.

## Glosario
| Término | Significado |
|---|---|
| Modelo | Sistema de predicción numérica (ECMWF IFS, GFS, ICON, AIFS, etc.) |
| Run | Ejecución de un modelo a una hora (00, 06, 12, 18 UTC) |
| Ensamble | Conjunto de ejecuciones perturbadas de un modelo para estimar probabilidad |
| Consenso | Promedio ponderado de modelos que hace WindCloud |
| Acuerdo | Qué tanto coinciden los modelos (inverso de la dispersión) |
| Verificación | Comparar pronóstico pasado vs. observación real (MAE, sesgo) |
| MAE | Error absoluto medio |
