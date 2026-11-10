"use client"

import { Dialog, DialogPanel, DialogTitle } from "@headlessui/react"
import { X } from "lucide-react"

// Ventana de Nodex: fondo grafito translúcido, tarjeta blanca centrada, título y cierre
export default function Modal({ abierto, alCerrar, titulo, subtitulo, ancho = "max-w-md", children }: {
  abierto: boolean, alCerrar: () => void, titulo: string, subtitulo?: string, ancho?: string, children: React.ReactNode
}) {
  return (
    <Dialog open={abierto} onClose={alCerrar} className="relative z-50">
      <div className="fixed inset-0 bg-slate-900/30 backdrop-blur-[1px]" aria-hidden="true" />
      <div className="fixed inset-0 flex items-center justify-center overflow-y-auto p-4">
        <DialogPanel className={`w-full ${ancho} rounded-xl bg-white shadow-xl`}>
          <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-6 py-4">
            <div className="min-w-0">
              <DialogTitle className="text-sm font-semibold text-slate-800">{titulo}</DialogTitle>
              {subtitulo && <p className="mt-0.5 truncate text-xs text-slate-400">{subtitulo}</p>}
            </div>
            <button type="button" onClick={alCerrar} className="boton-icono -mr-2 -mt-1" aria-label="Cerrar"><X size={16} /></button>
          </div>
          <div className="px-6 py-5">{children}</div>
        </DialogPanel>
      </div>
    </Dialog>
  )
}
