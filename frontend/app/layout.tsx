import type { Metadata } from "next"
import { Manrope } from "next/font/google"
import Notificaciones from "@/components/ui/Notificaciones"
import "./globals.css"

const manrope = Manrope({ subsets: ["latin"] })

export const metadata: Metadata = {
  title: "Nodex Tutelas",
  description: "Gestión de tutelas, acciones de cumplimiento y PQRS · GPA Legal"
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body className={manrope.className}>
        {children}
        <Notificaciones />
      </body>
    </html>
  )
}
