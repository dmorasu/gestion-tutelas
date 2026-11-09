import { DiaNoHabil } from '../models'
import { fijarDiasNoHabiles } from '../utils/diasHabiles'

let cargadoEn = 0

// La tabla de días no hábiles se mantiene en memoria: los cálculos de plazos son síncronos
export const cargarCalendario = async (forzar = false) => {
  if (!forzar && Date.now() - cargadoEn < 60_000) return
  const dias = await DiaNoHabil.findAll({ attributes: ['fecha', 'etapas'] })
  fijarDiasNoHabiles(dias.map(d => ({ fecha: d.fecha, etapas: d.etapas })))
  cargadoEn = Date.now()
}
