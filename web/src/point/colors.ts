/**
 * Colores de los modelos: paleta Okabe-Ito (apta para daltonismo, RNF-7), legible sobre fondo oscuro.
 * El consenso va en blanco grueso para destacar sobre todas las líneas.
 */
export const MODEL_COLORS = [
  '#E69F00', // naranja
  '#56B4E9', // azul cielo
  '#009E73', // verde azulado
  '#F0E442', // amarillo
  '#0072B2', // azul
  '#D55E00', // bermellón
  '#CC79A7', // púrpura rojizo
  '#B0B0B0', // gris
]
export const CONSENSUS_COLOR = '#ffffff'
export const BAND_FILL = 'rgba(79, 195, 247, 0.16)'

export const modelColor = (i: number) => MODEL_COLORS[i % MODEL_COLORS.length]
