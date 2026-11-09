"use client"

// La contraseña temporal se muestra una sola vez: el administrador la copia y se la entrega al usuario
export default function ContrasenaTemporal({ correo, contrasena, alCerrar }: { correo: string, contrasena: string, alCerrar: () => void }) {
  return (
    <div className="rounded border border-slate-300 bg-slate-50 p-4 text-sm space-y-2">
      <p>Contraseña temporal de <span className="font-medium">{correo}</span>. Entréguela al usuario: al entrar se le pedirá cambiarla. No se volverá a mostrar.</p>
      <div className="flex items-center gap-2">
        <code className="rounded bg-white border border-slate-200 px-3 py-1.5 text-base font-semibold tracking-wide">{contrasena}</code>
        <button type="button" className="boton-secundario py-1.5" onClick={() => navigator.clipboard?.writeText(contrasena)}>Copiar</button>
        <button type="button" className="text-xs text-slate-600 hover:underline" onClick={alCerrar}>Listo</button>
      </div>
    </div>
  )
}
