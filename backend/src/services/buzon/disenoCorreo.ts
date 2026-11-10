import fs from 'node:fs'
import path from 'node:path'

// =====================================
// DISEÑO CORPORATIVO DE LOS CORREOS DE SALIDA
// HTML de correo "a la antigua": tablas y estilos en línea, porque Outlook (el cliente del
// destinatario) ignora casi todo el CSS moderno. Ancho fijo de 600 px, fuentes del sistema.
// El logo va como imagen incrustada (cid) y no como enlace a internet: los clientes de correo
// bloquean las imágenes remotas y el logo no se vería. Pesa 16 KB para no inflar los buzones.
// Colores: grafito (el de la app) y el dorado del logo de la firma.
// =====================================

export const CID_LOGO = 'logo-gpa'
const RUTA_LOGO = path.join(__dirname, '../../../recursos/logo-correo.png')
let logo: Buffer | null = null
const leerLogo = () => (logo ??= fs.existsSync(RUTA_LOGO) ? fs.readFileSync(RUTA_LOGO) : Buffer.alloc(0))

export const logoIncrustado = () => {
  const contenido = leerLogo()
  return contenido.length ? { nombre: 'logo-gpa.png', tipoMime: 'image/png', contenido, contentId: CID_LOGO } : null
}

// En la vista previa del navegador no existe el cid: el logo va en la página misma
export const logoDataUri = () => `data:image/png;base64,${leerLogo().toString('base64')}`

const C = {
  fondo: '#f1f5f9', tarjeta: '#ffffff', grafito: '#1e293b', texto: '#334155', suave: '#64748b',
  linea: '#e2e8f0', dorado: '#c9b46a', fichaFondo: '#f8fafc'
}
const FUENTE = "'Segoe UI', Arial, Helvetica, sans-serif"

const COLOR_CRITICIDAD: Record<string, { fondo: string, texto: string }> = {
  'CRÍTICO': { fondo: '#b91c1c', texto: '#ffffff' },
  ALTO: { fondo: '#fef3c7', texto: '#92400e' },
  ORDINARIO: { fondo: '#e2e8f0', texto: '#334155' }
}

export type DatosDiseno = {
  titulo: string
  cuerpoHtml: string
  // Ficha del caso (solo si el correo es de una actuación)
  ficha?: { etiqueta: string, valor: string }[] | null
  criticidad?: string | null
  boton?: { texto: string, url: string } | null
  // Nombre del buzón para la nota del pie ("asignaciones", "insumos", "entregas")
  buzon: string
  logoSrc: string
}

const escapar = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export const armarCorreoHtml = (d: DatosDiseno) => {
  const chip = d.criticidad && COLOR_CRITICIDAD[d.criticidad]
    ? `<span style="display:inline-block;padding:3px 10px;border-radius:3px;background:${COLOR_CRITICIDAD[d.criticidad].fondo};color:${COLOR_CRITICIDAD[d.criticidad].texto};font-size:11px;font-weight:bold;letter-spacing:.5px;">${escapar(d.criticidad)}</span>`
    : ''
  const ficha = d.ficha?.length
    ? `<tr><td style="padding:0 32px 8px 32px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.fichaFondo};border:1px solid ${C.linea};border-radius:4px;">
          ${d.ficha.map((f, i) => `<tr>
            <td style="padding:8px 14px;font-family:${FUENTE};font-size:12px;color:${C.suave};width:120px;${i ? `border-top:1px solid ${C.linea};` : ''}">${escapar(f.etiqueta)}</td>
            <td style="padding:8px 14px;font-family:${FUENTE};font-size:13px;color:${C.grafito};font-weight:600;${i ? `border-top:1px solid ${C.linea};` : ''}">${f.etiqueta === 'Criticidad' && chip ? chip : escapar(f.valor)}</td>
          </tr>`).join('')}
        </table>
      </td></tr>`
    : ''
  const boton = d.boton
    ? `<tr><td style="padding:8px 32px 8px 32px;">
        <table role="presentation" cellpadding="0" cellspacing="0"><tr>
          <td style="background:${C.grafito};border-radius:4px;">
            <a href="${escapar(d.boton.url)}" style="display:inline-block;padding:11px 22px;font-family:${FUENTE};font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;">${escapar(d.boton.texto)}</a>
          </td>
        </tr></table>
      </td></tr>`
    : ''

  return `<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapar(d.titulo)}</title></head>
<body style="margin:0;padding:0;background:${C.fondo};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.fondo};">
  <tr><td align="center" style="padding:24px 12px;">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:${C.tarjeta};border-top:4px solid ${C.grafito};">
      <tr><td style="padding:22px 32px 18px 32px;border-bottom:2px solid ${C.dorado};">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
          <td valign="middle"><img src="${d.logoSrc}" width="112" alt="Gómez Pineda Abogados" style="display:block;border:0;width:112px;height:auto;"></td>
          <td valign="middle" align="right" style="font-family:${FUENTE};font-size:11px;letter-spacing:1px;color:${C.suave};text-transform:uppercase;">Apoyo jurídico<br>Tutelas y cumplimiento</td>
        </tr></table>
      </td></tr>
      <tr><td style="padding:26px 32px 14px 32px;font-family:${FUENTE};font-size:20px;font-weight:600;color:${C.grafito};">${escapar(d.titulo)}</td></tr>
      ${ficha}
      <tr><td style="padding:10px 32px 6px 32px;font-family:${FUENTE};font-size:14px;line-height:1.6;color:${C.texto};">${d.cuerpoHtml}</td></tr>
      ${boton}
      <tr><td style="padding:22px 32px 26px 32px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="border-top:1px solid ${C.linea};padding-top:14px;font-family:${FUENTE};font-size:11px;line-height:1.5;color:${C.suave};">
          <b style="color:${C.grafito};">Gómez Pineda Abogados · GPA Legal</b><br>
          Enviado desde el buzón de ${escapar(d.buzon)}. Responda en este mismo hilo para que su respuesta quede asociada al caso.<br>
          Este mensaje y sus enlaces contienen información confidencial. Si lo recibió por error, avísenos y elimínelo.
        </td></tr></table>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`
}
