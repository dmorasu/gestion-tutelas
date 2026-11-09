// Copia de backend/src/utils/politicaContrasena.ts para mostrar las reglas mientras se escribe
export const REGLAS_CONTRASENA: { cumple: (c: string) => boolean, texto: string }[] = [
  { cumple: c => c.length >= 8, texto: "Mínimo 8 caracteres" },
  { cumple: c => /[A-ZÁÉÍÓÚÑ]/.test(c), texto: "Una mayúscula" },
  { cumple: c => /[a-záéíóúñ]/.test(c), texto: "Una minúscula" },
  { cumple: c => /\d/.test(c), texto: "Un número" },
  { cumple: c => /[^A-Za-zÁÉÍÓÚÑáéíóúñ0-9\s]/.test(c), texto: "Un carácter especial (ej: ! @ # $ % * . -)" },
  { cumple: c => c.length > 0 && c === c.trim(), texto: "Sin espacios al inicio ni al final" }
]
