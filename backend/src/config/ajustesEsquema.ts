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
  `ALTER TABLE radicados_otros_operadores ADD COLUMN IF NOT EXISTS tipo VARCHAR(10) DEFAULT 'JUDICIAL'`,
  // 2026-11-19 · Reunión 18-nov: facturación por radicado y casos unidos
  `ALTER TABLE casos ADD COLUMN IF NOT EXISTS "fechaFacturacion" TIMESTAMPTZ`,
  `ALTER TABLE casos ADD COLUMN IF NOT EXISTS "radicadosAlternos" VARCHAR(40)[] NOT NULL DEFAULT '{}'`,
  `ALTER TABLE casos ADD COLUMN IF NOT EXISTS "numerosInternosAlternos" VARCHAR(20)[] NOT NULL DEFAULT '{}'`,
  // Correos con los modelos de la firma: hechos, derechos, tipo de respuesta, matriz y entregas
  `ALTER TABLE casos ADD COLUMN IF NOT EXISTS "resumenHechos" TEXT`,
  `ALTER TABLE casos ADD COLUMN IF NOT EXISTS "derechosIds" INTEGER[] NOT NULL DEFAULT '{}'`,
  `ALTER TABLE actuaciones ADD COLUMN IF NOT EXISTS "datosSolicitados" JSONB NOT NULL DEFAULT '[]'`,
  `ALTER TABLE actuaciones ADD COLUMN IF NOT EXISTS "tipoRespuestaId" INTEGER`,
  `ALTER TABLE solicitudes_insumos ADD COLUMN IF NOT EXISTS "itemCatalogoId" INTEGER`,
  `ALTER TABLE solicitudes_insumos ADD COLUMN IF NOT EXISTS clase VARCHAR(12)`,
  `ALTER TABLE escritos ADD COLUMN IF NOT EXISTS "documentosEntregados" JSONB NOT NULL DEFAULT '[]'`,
  `ALTER TABLE escritos ADD COLUMN IF NOT EXISTS "anexosEntregados" JSONB NOT NULL DEFAULT '[]'`,
  `ALTER TABLE plantillas_correo ADD COLUMN IF NOT EXISTS editada BOOLEAN NOT NULL DEFAULT false`,
  // Nulidades
  `ALTER TABLE actuaciones ADD COLUMN IF NOT EXISTS "origenNulidad" BOOLEAN NOT NULL DEFAULT false`,
  `ALTER TABLE actuaciones ADD COLUMN IF NOT EXISTS "fechaClasificacion" TIMESTAMPTZ`,
  // 2026-11-22 · Alertas al cliente en dos cortes al día (la tabla cortes_alertas la crea sync)
  `ALTER TABLE alertas ADD COLUMN IF NOT EXISTS "corteId" INTEGER REFERENCES cortes_alertas(id) ON DELETE SET NULL`,
  `ALTER TABLE alertas ADD COLUMN IF NOT EXISTS "vecesEnviada" INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE alertas ADD COLUMN IF NOT EXISTS "ultimoEnvio" TIMESTAMPTZ`,
  // Las emitidas antes de los cortes ya salieron una vez
  `UPDATE alertas SET "vecesEnviada" = 1, "ultimoEnvio" = "fechaEmision" WHERE estado = 'EMITIDA' AND "vecesEnviada" = 0`
]

// Una tabla que aún no existe se salta: sync() la acaba de crear completa con el modelo
export const aplicarAjustesEsquema = async () => {
  for (const sql of AJUSTES) {
    const tabla = /(?:ALTER TABLE|UPDATE) (\w+)/.exec(sql)?.[1]
    const [[existe]] = await db.query(`SELECT to_regclass('public.${tabla}') IS NOT NULL AS existe`) as [{ existe: boolean }[], unknown]
    if (existe?.existe) await db.query(sql)
  }
}
