import { ItemCatalogo } from '../models'
import type { TipoCatalogo } from '../models/catalogos'

// =====================================
// CONTENIDO INICIAL DE LOS CATÁLOGOS (reunión del 18-nov)
// Cada catálogo se carga solo si está vacío: después lo administra la firma en Configuración y la
// semilla no vuelve a tocarlo (ni revive lo que se apagó o se renombró).
// =====================================

type Item = { grupo?: string, clase?: 'DOCUMENTO' | 'INFORMACION', nombre: string, codigo?: string }

// Supuesto: los derechos que más aparecen en las tutelas contra la entidad. La firma los confirma o cambia
const DERECHOS: Item[] = [
  'Petición', 'Debido proceso', 'Defensa y contradicción', 'Habeas data', 'Igualdad', 'Mínimo vital',
  'Trabajo', 'Libre locomoción', 'Acceso a la administración de justicia', 'Buen nombre', 'Vida digna'
].map(nombre => ({ nombre }))

// Supuesto: el sentido de la respuesta que proyecta el auxiliar. EMERGENCIA y FALTA_LEGITIMACION
// tienen plantilla propia; EMERGENCIA no deja avanzar sin insumos pedidos
const TIPOS_RESPUESTA: Item[] = [
  { nombre: 'Respuesta de fondo' },
  { nombre: 'Carencia actual de objeto (hecho superado)' },
  { nombre: 'Improcedencia de la acción' },
  { nombre: 'Falta de legitimación en la causa por pasiva', codigo: 'FALTA_LEGITIMACION' },
  { nombre: 'Escrito de emergencia', codigo: 'EMERGENCIA' },
  { nombre: 'Temeridad' },
  { nombre: 'Remisión por competencia' },
  { nombre: 'Acreditación de cumplimiento' }
]

// Matriz de insumos y anexos V1 del cliente (Docs/insumos). Las filas "Otros: [INDICAR]" no van:
// la pantalla siempre ofrece un campo libre
const INSUMOS: Item[] = [
  { grupo: "Generales de la acción", clase: 'DOCUMENTO', nombre: "Auto admisorio de la acción de tutela." },
  { grupo: "Generales de la acción", clase: 'DOCUMENTO', nombre: "Escrito de tutela completo." },
  { grupo: "Generales de la acción", clase: 'DOCUMENTO', nombre: "Anexos aportados con la tutela." },
  { grupo: "Generales de la acción", clase: 'DOCUMENTO', nombre: "Fallo de primera instancia." },
  { grupo: "Generales de la acción", clase: 'DOCUMENTO', nombre: "Escrito de impugnación." },
  { grupo: "Generales de la acción", clase: 'DOCUMENTO', nombre: "Fallo de segunda instancia." },
  { grupo: "Generales de la acción", clase: 'DOCUMENTO', nombre: "Requerimiento de cumplimiento." },
  { grupo: "Generales de la acción", clase: 'DOCUMENTO', nombre: "Incidente y/o auto de apertura de desacato." },
  { grupo: "Generales de la acción", clase: 'DOCUMENTO', nombre: "Pronunciamientos o memoriales adicionales presentados por el accionante." },
  { grupo: "Generales de la acción", clase: 'DOCUMENTO', nombre: "Constancias de notificación." },
  { grupo: "Proceso contravencional", clase: 'DOCUMENTO', nombre: "Comparendo" },
  { grupo: "Proceso contravencional", clase: 'INFORMACION', nombre: "Fecha, número, infracción y estado actual del comparendo." },
  { grupo: "Proceso contravencional", clase: 'DOCUMENTO', nombre: "Imagen de la infracción" },
  { grupo: "Proceso contravencional", clase: 'INFORMACION', nombre: "Procedimiento de notificación realizado, indicando fecha, dirección o datos utilizados, medio de notificación y resultado." },
  { grupo: "Proceso contravencional", clase: 'DOCUMENTO', nombre: "Video, si existe" },
  { grupo: "Proceso contravencional", clase: 'INFORMACION', nombre: "Actuaciones administrativas adelantadas desde su imposición." },
  { grupo: "Proceso contravencional", clase: 'DOCUMENTO', nombre: "Constancia de consulta datos Runt: propiedad y dirección" },
  { grupo: "Proceso contravencional", clase: 'INFORMACION', nombre: "Si el accionante presentó solicitudes, recursos, compareció o controvirtió la infracción, indicar el trámite y respuesta otorgados." },
  { grupo: "Proceso contravencional", clase: 'DOCUMENTO', nombre: "Guía de envío correspondencia con resultado de la gestión" },
  { grupo: "Proceso contravencional", clase: 'INFORMACION', nombre: "Si se expidió resolución sancionatoria u otro acto administrativo, indicar su fecha, notificación y estado actual." },
  { grupo: "Proceso contravencional", clase: 'DOCUMENTO', nombre: "Constancia de notificación por aviso" },
  { grupo: "Proceso contravencional", clase: 'INFORMACION', nombre: "Si existe proceso de cobro, precisar su estado y las actuaciones adelantadas." },
  { grupo: "Proceso contravencional", clase: 'DOCUMENTO', nombre: "Constancia de notificación personal" },
  { grupo: "Proceso contravencional", clase: 'INFORMACION', nombre: "Informar cualquier circunstancia relevante que permita acreditar que al accionante se le garantizó la oportunidad de conocer y controvertir la actuación." },
  { grupo: "Proceso contravencional", clase: 'DOCUMENTO', nombre: "Constancia de notificación por mail con autorización" },
  { grupo: "Proceso contravencional", clase: 'DOCUMENTO', nombre: "Constancia de notificación por conducta concluyente" },
  { grupo: "Proceso contravencional", clase: 'DOCUMENTO', nombre: "Solicitud de audiencia" },
  { grupo: "Proceso contravencional", clase: 'DOCUMENTO', nombre: "Notificación programación de audiencia" },
  { grupo: "Proceso contravencional", clase: 'DOCUMENTO', nombre: "Constancia de audiencia" },
  { grupo: "Proceso contravencional", clase: 'DOCUMENTO', nombre: "Pruebas practicadas en el proceso" },
  { grupo: "Proceso contravencional", clase: 'DOCUMENTO', nombre: "Fallo audiencia + notificación" },
  { grupo: "Proceso contravencional", clase: 'DOCUMENTO', nombre: "Resolución sanción + notificación" },
  { grupo: "Proceso contravencional", clase: 'DOCUMENTO', nombre: "Si existe cobro coactivo, los actos y comunicaciones relevantes relacionados con dicho trámite." },
  { grupo: "Proceso contravencional", clase: 'DOCUMENTO', nombre: "Cualquier otro soporte que permita acreditar el procedimiento adelantado y el respeto de las oportunidades de defensa y contradicción." },
  { grupo: "Cobro Coactivo", clase: 'DOCUMENTO', nombre: "Mandamiento de Pago" },
  { grupo: "Cobro Coactivo", clase: 'INFORMACION', nombre: "Se ha iniciado proceso de cobro coactivo?" },
  { grupo: "Cobro Coactivo", clase: 'DOCUMENTO', nombre: "Citación para notificación + guía" },
  { grupo: "Cobro Coactivo", clase: 'INFORMACION', nombre: "Cuál es el acto que contiene la sanción clara, expresa y exigible objeto de cobro, es decir, cuál es el origen del cobro." },
  { grupo: "Cobro Coactivo", clase: 'DOCUMENTO', nombre: "Notificación personal" },
  { grupo: "Cobro Coactivo", clase: 'INFORMACION', nombre: "Forma y fecha de notificación del mandamiento de pago" },
  { grupo: "Cobro Coactivo", clase: 'DOCUMENTO', nombre: "Notificación por aviso" },
  { grupo: "Cobro Coactivo", clase: 'INFORMACION', nombre: "Bien embargado, entidad y fecha" },
  { grupo: "Cobro Coactivo", clase: 'DOCUMENTO', nombre: "Notificación por mail con autorización" },
  { grupo: "Cobro Coactivo", clase: 'INFORMACION', nombre: "Razón jurídica y/o administrativa de la permanencia del cobro o embargo" },
  { grupo: "Cobro Coactivo", clase: 'DOCUMENTO', nombre: "Oficio de embargo" },
  { grupo: "Cobro Coactivo", clase: 'INFORMACION', nombre: "Origen, fecha y estado actual del embargo, identificando el proceso de cobro al que corresponde." },
  { grupo: "Cobro Coactivo", clase: 'DOCUMENTO', nombre: "Oficio de levantamiento de embargo" },
  { grupo: "Cobro Coactivo", clase: 'INFORMACION', nombre: "Si se ordenó el levantamiento de la medida, indicar fecha de la orden y gestión realizada para hacerla efectiva." },
  { grupo: "Cobro Coactivo", clase: 'DOCUMENTO', nombre: "Comunicación de levantamiento de embargo con constancia de envío" },
  { grupo: "Cobro Coactivo", clase: 'INFORMACION', nombre: "Precisar a qué entidad fue comunicado el levantamiento, indicando fecha y medio de envío" },
  { grupo: "Cobro Coactivo", clase: 'INFORMACION', nombre: "Si existe solicitud previa de desembargo presentada por el accionante, informar fecha de radicación, trámite otorgado y respuesta emitida." },
  { grupo: "Cobro Coactivo", clase: 'INFORMACION', nombre: "Remitir copia de la orden de embargo, orden de desembargo, comunicaciones enviadas, constancias de envío o recepción y demás soportes relacionados." },
  { grupo: "Cumplimiento, desacatos y requerimientos previos", clase: 'DOCUMENTO', nombre: "Respuesta a Derecho de Petición y constancia de envío." },
  { grupo: "Cumplimiento, desacatos y requerimientos previos", clase: 'INFORMACION', nombre: "Validar la trazabilidad del derecho de petición en cuestión e informar las actuaciones realizadas y estado actual de su trámite." },
  { grupo: "Cumplimiento, desacatos y requerimientos previos", clase: 'DOCUMENTO', nombre: "Acto administrativo de revocatoria o de revocatoria y restablecimiento de términos con constancia de notificación" },
  { grupo: "Cumplimiento, desacatos y requerimientos previos", clase: 'INFORMACION', nombre: "Precisar las circunstancias que han impedido la atención de la solicitud, en caso de que aplique." },
  { grupo: "Cumplimiento, desacatos y requerimientos previos", clase: 'DOCUMENTO', nombre: "Constancias de nueva notificación de comparendo" },
  { grupo: "Cumplimiento, desacatos y requerimientos previos", clase: 'INFORMACION', nombre: "Prueba de actualización de la información sobre la multa en Runt y el Simit" },
  { grupo: "Cumplimiento, desacatos y requerimientos previos", clase: 'DOCUMENTO', nombre: "Acto administrativo que define responsabilidad contravencional" },
  { grupo: "Cumplimiento, desacatos y requerimientos previos", clase: 'DOCUMENTO', nombre: "Levantamiento de embargo y constancia de envío" },
  { grupo: "Cumplimiento, desacatos y requerimientos previos", clase: 'DOCUMENTO', nombre: "Acto administrativo de prescripción" },
  { grupo: "Generales de cada cámara Resolución 20203040011245 de 2020", clase: 'DOCUMENTO', nombre: "Autorización ANSV Resolución 20203040011245 de 2020" },
  { grupo: "Generales de cada cámara Resolución 20203040011245 de 2020", clase: 'DOCUMENTO', nombre: "Certificado de calibración" },
  { grupo: "Generales de cada cámara Resolución 20203040011245 de 2020", clase: 'DOCUMENTO', nombre: "Verificación de calibración por año" },
  { grupo: "Generales de cada cámara Resolución 20203040011245 de 2020", clase: 'DOCUMENTO', nombre: "Bitácora de mantenimiento" },
  { grupo: "Generales de cada cámara Resolución 20203040011245 de 2020", clase: 'DOCUMENTO', nombre: "Evidencia de instalación de señalización" },
  { grupo: "Generales de cada cámara Resolución 718 de 2018", clase: 'DOCUMENTO', nombre: "Autorización Ministerio de Transporte Resolución 718 de 2018" },
  { grupo: "Generales de cada cámara Resolución 718 de 2018", clase: 'DOCUMENTO', nombre: "Certificado de calibración" },
  { grupo: "Generales de cada cámara Resolución 718 de 2018", clase: 'DOCUMENTO', nombre: "Verificación de calibración por año" },
  { grupo: "Generales de cada cámara Resolución 718 de 2018", clase: 'DOCUMENTO', nombre: "Bitácora de mantenimiento" },
  { grupo: "Generales de cada cámara Resolución 718 de 2018", clase: 'DOCUMENTO', nombre: "Evidencia de instalación de señalización" }

]

const BASE: { catalogo: TipoCatalogo, items: Item[], supuesto: boolean }[] = [
  { catalogo: 'DERECHO', items: DERECHOS, supuesto: true },
  { catalogo: 'TIPO_RESPUESTA', items: TIPOS_RESPUESTA, supuesto: true },
  { catalogo: 'INSUMO', items: INSUMOS, supuesto: false }
]

export const sembrarCatalogos = async () => {
  for (const { catalogo, items, supuesto } of BASE) {
    if (await ItemCatalogo.count({ where: { catalogo } })) continue
    await ItemCatalogo.bulkCreate(items.map((i, orden) => ({
      catalogo, grupo: i.grupo ?? null, clase: i.clase ?? null, nombre: i.nombre, codigo: i.codigo ?? null, supuesto, orden
    })))
  }
}
