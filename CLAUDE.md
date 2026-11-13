# WindCloud

Observatorio meteorológico abierto (viento, nubes, lluvia) con consenso multi-modelo y precisión verificada.
Inspirado en la estructura de fuego.huella.world. **Desarrollo guiado por especificaciones (SDD).**

## Antes de escribir código
0. Leer `CONTEXTO.md` (estado actual, decisiones, preguntas abiertas y bitácora).
1. Leer `specs/00-constitucion.md` (principios: solo herramientas gratis, precisión demostrable, honestidad).
2. Tomar la siguiente tarea pendiente de `specs/03-tareas.md` y leer los requisitos (`RF-x`) que referencia.
3. Seguir `specs/02-diseno.md`; las fuentes y sus límites están en `specs/04-fuentes-de-datos.md`.
4. Al terminar: marcar la tarea `[x]`; si el diseño cambió, actualizar el spec en el mismo cambio.
5. **Al cerrar cada iteración, alimentar `CONTEXTO.md`:** reescribir §1 Estado actual, añadir una entrada
   arriba en §6 Bitácora (plantilla incluida), y registrar decisiones (§3), preguntas (§4) y aprendizajes (§5).

## Reglas
- Interfaz en español (es-CO), unidades métricas.
- Todo dato visible lleva fuente + hora del run/observación.
- Nunca agregar una dependencia o API de pago.
