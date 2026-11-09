// Logo "Nodex Tutelas" a partir del de Nodex Gastos: verdes -> color de la paleta, billetera ->
// documento con balanza, "GASTOS" -> "TUTELAS". También el ícono "N" de la pestaña.
//
// Uso (no es parte del build; necesita sharp en una carpeta aparte):
//   mkdir /tmp/logo && cd /tmp/logo && npm init -y && npm i sharp
//   NODEX_GASTOS=<ruta a TC/Frontend/gastos> PALETA=grafito node <ruta>/Docs/herramientas/crear_logo.js
// Salida en Docs/herramientas/salida-<paleta>/: nodextutelas-640.png va a
// frontend/public/logo-nodex-tutelas.png (si cambia, renombrar el archivo para saltar la caché de
// imágenes); icon.png, apple-icon.png y favicon.ico van a frontend/app/.
// El texto "TUTELAS" usa la fuente Bahnschrift (Windows); en otro sistema cambiar font-family.
const sharp = require('sharp')
const fs = require('fs')
const path = require('path')

const NODEX = process.env.NODEX_GASTOS || 'C:/Users/DiegoAlejandroMoraSu/Documents/Desarrollos GPA/TC/Frontend/gastos'
// Paleta por variable PALETA (vino, cian, grafito, ambar)
const PALETAS = {
  ambar: { claro: 40, oscuro: 18, sat: 1.05, a: "#fbbf24", b: "#c2410c", hoja: "#fff7e6", t1: "#e48a0a", t2: "#b8480c", apple: "#d97706" },
  vino: { claro: 350, oscuro: 336, sat: 0.95, a: "#e11d48", b: "#881337", hoja: "#fff1f2", t1: "#be123c", t2: "#881337", apple: "#9f1239" },
  cian: { claro: 188, oscuro: 198, sat: 1.0, a: "#22d3ee", b: "#155e75", hoja: "#ecfeff", t1: "#0891b2", t2: "#155e75", apple: "#0e7490" },
  grafito: { claro: 215, oscuro: 222, sat: 0.28, a: "#64748b", b: "#1e293b", hoja: "#f8fafc", t1: "#475569", t2: "#1e293b", apple: "#334155" }
}
// grafito es el color elegido para la app (2026-11-09)
const NOMBRE = process.env.PALETA || "grafito"
const PAL = PALETAS[NOMBRE]
const SALIDA = path.join(__dirname, "salida-" + NOMBRE)
fs.mkdirSync(SALIDA, { recursive: true })

// ── Color: tono verde/teal (130–210°) a ámbar/naranja; se conservan saturación y luz ──
const rgbAHsl = (r, g, b) => {
  r /= 255; g /= 255; b /= 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2
  if (max === min) return [0, 0, l]
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  return [h * 60, s, l]
}
const hslARgb = (h, s, l) => {
  const k = n => (n + h / 30) % 12
  const a = s * Math.min(l, 1 - l)
  const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))
  return [f(0) * 255, f(8) * 255, f(4) * 255]
}
// 150° (verde claro) -> 40° (ámbar); 195° (teal oscuro) -> 18° (naranja quemado)
const nuevoTono = h => { const t = Math.max(0, Math.min(1, (h - 150) / 45)); return ((PAL.claro + t * (PAL.oscuro - PAL.claro)) % 360 + 360) % 360 }

const recolorear = async (entrada, opciones = {}) => {
  const { data, info } = await sharp(entrada).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  for (let i = 0; i < data.length; i += 4) {
    const [h, s, l] = rgbAHsl(data[i], data[i + 1], data[i + 2])
    // Fondo casi blanco (traía un tinte verde muy leve): blanco puro
    if (opciones.fondoBlanco && l > 0.93 && data[i + 3] === 255) { data[i] = data[i + 1] = data[i + 2] = 255; continue }
    if (s < 0.08 || h < 100 || h > 230) continue // blancos, grises y lo que no es verde
    // Los tonos oscuros se aclaran: un teal oscuro pasado a ámbar queda café; así queda naranja quemado
    const luz = l < 0.5 ? 0.2 + 0.64 * l : l * 0.97
    const [r, g, b] = hslARgb(nuevoTono(h), Math.min(1, s * PAL.sat), luz)
    data[i] = r; data[i + 1] = g; data[i + 2] = b
  }
  return sharp(data, { raw: info })
}

// ── Ícono nuevo: documento con insignia de balanza (mismo estilo que Trámites) ──
const iconoSvg = (ancho, alto) => `
<svg xmlns="http://www.w3.org/2000/svg" width="${ancho}" height="${alto}" viewBox="0 0 340 380">
  <defs>
    <linearGradient id="borde" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${PAL.a}"/><stop offset="1" stop-color="${PAL.b}"/>
    </linearGradient>
    <linearGradient id="hoja" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="${PAL.hoja}"/>
    </linearGradient>
    <linearGradient id="insignia" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${PAL.a}"/><stop offset="1" stop-color="${PAL.b}"/>
    </linearGradient>
  </defs>
  <!-- Documento -->
  <path d="M40 20 h150 l80 80 v215 a28 28 0 0 1 -28 28 h-202 a28 28 0 0 1 -28 -28 v-267 a28 28 0 0 1 28 -28 z" fill="url(#borde)"/>
  <path d="M52 36 h132 l70 70 v205 a16 16 0 0 1 -16 16 h-186 a16 16 0 0 1 -16 -16 v-259 a16 16 0 0 1 16 -16 z" fill="url(#hoja)"/>
  <path d="M184 36 v54 a16 16 0 0 0 16 16 h54 z" fill="url(#borde)" opacity="0.9"/>
  <rect x="78" y="140" width="130" height="18" rx="9" fill="url(#borde)"/>
  <rect x="78" y="180" width="96" height="18" rx="9" fill="url(#borde)" opacity="0.85"/>
  <rect x="78" y="220" width="56" height="18" rx="9" fill="url(#borde)" opacity="0.7"/>
  <!-- Insignia con balanza -->
  <circle cx="238" cy="272" r="92" fill="#ffffff"/>
  <circle cx="238" cy="272" r="80" fill="url(#insignia)"/>
  <g fill="none" stroke="#ffffff" stroke-width="9" stroke-linecap="round" stroke-linejoin="round">
    <path d="M238 222 v86"/>
    <path d="M206 316 h64"/>
    <path d="M196 240 h84"/>
    <path d="M196 240 l-20 40 M196 240 l20 40"/>
    <path d="M280 240 l-20 40 M280 240 l20 40"/>
  </g>
  <g fill="#ffffff">
    <path d="M172 280 h48 a24 18 0 0 1 -48 0 z"/>
    <path d="M256 280 h48 a24 18 0 0 1 -48 0 z"/>
    <circle cx="238" cy="222" r="9"/>
  </g>
</svg>`

const textoSvg = (texto, ancho, alto) => `
<svg xmlns="http://www.w3.org/2000/svg" width="${ancho}" height="${alto}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${PAL.t1}"/><stop offset="1" stop-color="${PAL.t2}"/>
    </linearGradient>
  </defs>
  <text x="0" y="${alto - 6}" font-family="Bahnschrift" font-weight="700" font-size="${alto * 1.0}" letter-spacing="${alto * 0.62}" fill="url(#g)">${texto}</text>
</svg>`

const main = async () => {
  // 1. Logo horizontal
  const base = await (await recolorear(`${NODEX}/public/nodexgastos.png`, { fondoBlanco: true })).png().toBuffer()
  const meta = await sharp(base).metadata()
  console.log('Tamaño del logo de Gastos:', meta.width, meta.height)

  const blanco = (w, h) => sharp({ create: { width: w, height: h, channels: 4, background: '#ffffff' } }).png().toBuffer()
  const logo = await sharp(base).composite([
    // Tapar la billetera (solo su silueta: recibo y cuerpo) y "GASTOS", sin borrar los anillos de puntos
    { input: await blanco(222, 175), left: 1474, top: 205 },
    { input: await blanco(354, 272), left: 1412, top: 298 },
    { input: await blanco(640, 96), left: 90, top: 520 },
    // Documento con balanza, centrado donde estaba la billetera
    { input: Buffer.from(iconoSvg(340, 380)), left: 1420, top: 196 },
    // "TUTELAS" en el lugar de "GASTOS"
    { input: Buffer.from(textoSvg('TUTELAS', 900, 74)), left: 100, top: 526 }
  ]).png().toBuffer()
  await sharp(logo).toFile(path.join(SALIDA, 'nodextutelas.png'))
  // Versión liviana para el encabezado
  await sharp(logo).resize({ width: 640 }).png({ compressionLevel: 9 }).toFile(path.join(SALIDA, 'nodextutelas-640.png'))

  // 2. Ícono "N" en ámbar
  // Fuente: los íconos ya limpios de Gastos (el favico.png grande trae pintado el cuadriculado)
  const icono = await (await recolorear(`${NODEX}/app/icon.png`)).png().toBuffer()
  await sharp(icono).toFile(path.join(SALIDA, 'icon.png'))
  await (await recolorear(`${NODEX}/app/apple-icon.png`)).png().toFile(path.join(SALIDA, 'apple-icon.png'))

  // favicon.ico con PNG de 16, 32 y 48 adentro
  const tamanos = [16, 32, 48]
  const pngs = await Promise.all(tamanos.map(t => sharp(icono).resize(t, t).png().toBuffer()))
  const cabecera = Buffer.alloc(6 + 16 * pngs.length)
  cabecera.writeUInt16LE(0, 0); cabecera.writeUInt16LE(1, 2); cabecera.writeUInt16LE(pngs.length, 4)
  let desplazamiento = cabecera.length
  pngs.forEach((png, i) => {
    const o = 6 + 16 * i
    cabecera.writeUInt8(tamanos[i], o); cabecera.writeUInt8(tamanos[i], o + 1)
    cabecera.writeUInt16LE(1, o + 4); cabecera.writeUInt16LE(32, o + 6)
    cabecera.writeUInt32LE(png.length, o + 8); cabecera.writeUInt32LE(desplazamiento, o + 12)
    desplazamiento += png.length
  })
  fs.writeFileSync(path.join(SALIDA, 'favicon.ico'), Buffer.concat([cabecera, ...pngs]))
  console.log('Listo en', SALIDA)
}
main().catch(e => { console.error(e); process.exit(1) })
