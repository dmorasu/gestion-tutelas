import Image from "next/image"

export default function LogoEncabezado() {
  return <Image src="/logo-nodex-tutelas.png" alt="Nodex Tutelas" width={160} height={58} className="w-[130px] h-auto object-contain" priority />
}
