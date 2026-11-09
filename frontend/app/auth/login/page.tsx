import FormLogin from "./FormLogin"

export default function LoginPage() {
  return (
    <div className="w-full max-w-md">
      <div className="mb-9">
        <h1 className="text-3xl font-semibold tracking-tight text-slate-800">Nodex Tutelas</h1>
        <div className="mt-6 h-px w-full bg-slate-200" />
      </div>
      <FormLogin />
    </div>
  )
}
