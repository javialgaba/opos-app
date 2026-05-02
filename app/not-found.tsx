import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-3xl font-semibold text-ink">No encuentro esa página</h1>
      <p className="text-ink/70">Vuelve al panel de estudio para seguir con tus tests.</p>
      <Link
        className="rounded-md bg-tide px-4 py-2 font-medium text-white shadow-soft transition hover:bg-tide/90"
        href="/"
      >
        Ir al estudio
      </Link>
    </main>
  );
}
