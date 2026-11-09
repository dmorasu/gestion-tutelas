// =====================================
// RADICADO JUDICIAL DE 23 DÍGITOS
// En los correos y los PDF aparece de muchas formas: seguido (11001310300120260012300),
// con guiones (11001-31-03-001-2026-00123-00), con puntos o con espacios. Se buscan tramos de
// dígitos y separadores y se aceptan los que suman exactamente 23 dígitos.
// =====================================

const TRAMO = /\d(?:[\d]|[ .\-–](?=\d)){21,40}/g

export const normalizarRadicado = (texto: string) => texto.replace(/\D/g, '')

export const esRadicadoValido = (radicado: string) => /^\d{23}$/.test(radicado)

// Radicados distintos en el orden en que aparecen
export const buscarRadicados = (...textos: (string | null | undefined)[]): string[] => {
  const encontrados = new Set<string>()
  for (const texto of textos) {
    if (!texto) continue
    for (const tramo of texto.match(TRAMO) ?? []) {
      // "…0012300 2026" junta el radicado con el número siguiente: se prueba también cada
      // pedazo separado por espacios
      for (const candidato of [tramo, ...tramo.split(/\s+/)]) {
        const digitos = normalizarRadicado(candidato)
        if (digitos.length === 23) encontrados.add(digitos)
      }
    }
  }
  return [...encontrados]
}

// 11001-31-03-001-2026-00123-00: ciudad (5), entidad (2), especialidad (2), despacho (3),
// año (4), consecutivo (5), recurso (2)
export const formatoRadicado = (radicado: string) =>
  esRadicadoValido(radicado)
    ? [radicado.slice(0, 5), radicado.slice(5, 7), radicado.slice(7, 9), radicado.slice(9, 12), radicado.slice(12, 16), radicado.slice(16, 21), radicado.slice(21)].join('-')
    : radicado
