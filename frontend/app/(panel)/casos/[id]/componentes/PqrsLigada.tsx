"use client"

import Link from "next/link"
import { useState } from "react"
import FormPqrs from "@/components/pqrs/FormPqrs"
import { ESTADOS_ACTUACION, TIPOS_PETICION } from "@/src/lib/formato"

export type CasoRelacionado = {
  id: number, numeroInterno: string | null, radicado: string, tipoSolicitud: string, estado: string
  actuaciones: { id: number, etapa: string, estado: string, tipoPeticion: string | null }[]
}

// D24: la tutela por un derecho de petición sin responder lleva una PQRS ligada (se responde y en la
// contestación se pide hecho superado). En la PQRS se muestra la tutela de la que nace
export default function PqrsLigada({ casoId, esPqrs, relacionados, tiposPeticion, puedeCrear }: {
  casoId: number, esPqrs: boolean, relacionados: CasoRelacionado[], tiposPeticion: Record<string, string>, puedeCrear: boolean
}) {
  const [abierto, setAbierto] = useState(false)
  const pqrs = relacionados.filter(r => r.tipoSolicitud === "PQRS")
  const tutela = relacionados.find(r => r.tipoSolicitud !== "PQRS")

  if (esPqrs) {
    return tutela
      ? <p className="text-sm">Nace de la tutela <Link href={`/casos/${tutela.id}`} className="enlace font-semibold">{tutela.numeroInterno ?? tutela.radicado}</Link>, que pide hecho superado con esta respuesta.</p>
      : <p className="text-sm text-slate-500">PQRS sin tutela relacionada.</p>
  }

  return (
    <div className="space-y-3">
      {pqrs.length === 0 && <p className="text-sm text-slate-500">Sin PQRS ligada.</p>}
      {pqrs.map(p => {
        const a = p.actuaciones[0]
        return (
          <p key={p.id} className="text-sm">
            <Link href={`/casos/${p.id}`} className="enlace font-semibold">{p.numeroInterno ?? p.radicado}</Link>
            <span className="text-slate-500"> · {TIPOS_PETICION[a?.tipoPeticion ?? ""] ?? "PQRS"} · {ESTADOS_ACTUACION[a?.estado ?? ""] ?? p.estado}</span>
          </p>
        )
      })}
      {puedeCrear && !abierto && (
        <button className="boton-secundario py-1.5 text-xs" onClick={() => setAbierto(true)}>Tutela por derecho de petición: crear PQRS ligada</button>
      )}
      {abierto && <FormPqrs modo="ligada" casoId={casoId} tiposPeticion={tiposPeticion} alTerminar={() => setAbierto(false)} />}
    </div>
  )
}
