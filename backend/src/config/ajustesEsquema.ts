import { db } from './db'

// =====================================
// AJUSTES DE ESQUEMA EN PRODUCCIÓN (patrón Nodex)
// En producción no se usa sync({ alter }): crea tablas nuevas pero no toca las existentes. Cada
// columna o cambio de tipo que se agregue a una tabla que ya existe va aquí, como sentencia
// idempotente (se puede correr en cada arranque sin efecto si ya se aplicó). Se agregan al final
// y no se borran: una base puede venir de cualquier versión anterior.
// Las vistas del tablero se borran antes y se recrean después (un cambio de tipo no se deja hacer
// sobre una columna que usa una vista).
// =====================================
const AJUSTES: string[] = [
  // 2026-11-10 · Respuestas de las dudas de TI
  `ALTER TABLE dias_no_habiles ADD COLUMN IF NOT EXISTS "medioDia" BOOLEAN NOT NULL DEFAULT false`,
  `ALTER TABLE actuaciones ADD COLUMN IF NOT EXISTS "datosFaltantesPendientes" BOOLEAN NOT NULL DEFAULT false`,
  `ALTER TABLE actuaciones ADD COLUMN IF NOT EXISTS "fechaDatosCompletos" TIMESTAMPTZ`,
  // Flujo del fallo (D12–D14) y descuentos (D29)
  `ALTER TABLE decisiones ADD COLUMN IF NOT EXISTS "notificadaPorCorreo" BOOLEAN NOT NULL DEFAULT false`,
  `ALTER TABLE decisiones ADD COLUMN IF NOT EXISTS "requiereCumplimiento" BOOLEAN NOT NULL DEFAULT false`,
  `ALTER TABLE decisiones ADD COLUMN IF NOT EXISTS "actuacionCumplimientoId" INTEGER REFERENCES actuaciones(id) ON DELETE SET NULL`,
  `ALTER TABLE decisiones ADD COLUMN IF NOT EXISTS "sancionAtribuible" BOOLEAN NOT NULL DEFAULT false`,
  `ALTER TABLE alertas ALTER COLUMN tipo TYPE VARCHAR(30)`,
  // PQRS (D21–D26)
  `ALTER TABLE casos ALTER COLUMN radicado TYPE VARCHAR(40)`,
  `ALTER TABLE casos ADD COLUMN IF NOT EXISTS "porDerechoPeticion" BOOLEAN NOT NULL DEFAULT false`,
  `ALTER TABLE casos ADD COLUMN IF NOT EXISTS "casoRelacionadoId" INTEGER REFERENCES casos(id) ON DELETE SET NULL`,
  `ALTER TABLE actuaciones ADD COLUMN IF NOT EXISTS "tipoPeticion" VARCHAR(15)`,
  `ALTER TABLE radicados_otros_operadores ALTER COLUMN radicado TYPE VARCHAR(40)`,
  `ALTER TABLE radicados_otros_operadores ADD COLUMN IF NOT EXISTS tipo VARCHAR(10) DEFAULT 'JUDICIAL'`
]

// Una tabla que aún no existe se salta: sync() la acaba de crear completa con el modelo
export const aplicarAjustesEsquema = async () => {
  for (const sql of AJUSTES) {
    const tabla = /ALTER TABLE (\w+)/.exec(sql)?.[1]
    const [[existe]] = await db.query(`SELECT to_regclass('public.${tabla}') IS NOT NULL AS existe`) as [{ existe: boolean }[], unknown]
    if (existe?.existe) await db.query(sql)
  }
}
