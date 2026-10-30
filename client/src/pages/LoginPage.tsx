import React, { useState } from "react";
import { useAuthStore } from "../store/auth.store.ts";
import TitleBackdrop from "../components/TitleBackdrop.tsx";

export default function LoginPage() {
  const { signIn, signUp } = useAuthStore();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"login" | "register">("login");
  const [error, setError] = useState<string | null>(null);
  const [shakeKey, setShakeKey] = useState(0);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const err = mode === "login" ? await signIn(email, password) : await signUp(email, password);

    setLoading(false);
    if (err) {
      setError(err);
      setShakeKey((k) => k + 1);
    }
  };

  const tab = (active: boolean) =>
    `flex-1 py-2 text-sm font-semibold tracking-wide transition-all duration-300 ${
      active
        ? "bg-parchment-500 text-dungeon-900 shadow-[0_0_18px_rgba(212,168,67,0.45)]"
        : "text-parchment-300 hover:bg-white/10"
    }`;

  return (
    <div className="fixed inset-0 overflow-hidden bg-[#0b0614]">
      <TitleBackdrop />

      {/* Cinematic grading: vignette + readable bottom */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_35%,rgba(8,4,16,0.75)_100%)]" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/70 to-transparent" />

      <div className="relative z-10 flex h-full flex-col items-center justify-between px-4 py-8 sm:py-12">
        <header className="mt-2 text-center" style={{ animation: "fade-down 1.2s ease-out both" }}>
          <div className="title-sub mb-1 text-xs uppercase tracking-[0.5em] text-parchment-300/80 sm:text-sm">
            ⚔ &nbsp;La aventura comienza en&nbsp; ⚔
          </div>
          <h1 className="title-logo font-title text-6xl font-black leading-none sm:text-8xl">D&amp;D Web</h1>
          <div className="mx-auto mt-3 flex items-center justify-center gap-3 text-parchment-300/80">
            <span className="h-px w-16 bg-gradient-to-r from-transparent to-parchment-400/70" />
            <span className="font-title text-sm tracking-[0.35em] sm:text-base">LA TABERNA DEL GRIFO</span>
            <span className="h-px w-16 bg-gradient-to-l from-transparent to-parchment-400/70" />
          </div>
        </header>

        <main
          key={shakeKey}
          className="w-full max-w-sm rounded-xl border border-parchment-400/30 bg-dungeon-900/55 p-5 shadow-[0_20px_80px_rgba(0,0,0,0.65)] backdrop-blur-md"
          style={{
            animation: shakeKey
              ? "shake-x 0.45s ease-in-out"
              : "fade-up 0.9s 0.35s cubic-bezier(0.2,0.8,0.2,1) both",
          }}
        >
          <div className="mb-5 flex overflow-hidden rounded-lg border border-parchment-400/30">
            <button type="button" className={tab(mode === "login")} onClick={() => setMode("login")}>
              Iniciar Sesión
            </button>
            <button type="button" className={tab(mode === "register")} onClick={() => setMode("register")}>
              Registrarse
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <label className="block">
              <span className="mb-1 block text-xs uppercase tracking-widest text-parchment-400">Email</span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                className="w-full rounded-lg border border-parchment-400/25 bg-black/35 px-3 py-2.5 text-parchment-100 outline-none transition-all placeholder:text-parchment-500/60 focus:border-parchment-300 focus:shadow-[0_0_0_3px_rgba(212,168,67,0.25)]"
                placeholder="aventurero@correo.com"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs uppercase tracking-widest text-parchment-400">Contraseña</span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                className="w-full rounded-lg border border-parchment-400/25 bg-black/35 px-3 py-2.5 text-parchment-100 outline-none transition-all placeholder:text-parchment-500/60 focus:border-parchment-300 focus:shadow-[0_0_0_3px_rgba(212,168,67,0.25)]"
                placeholder="Mínimo 8 caracteres"
              />
            </label>

            {error && (
              <div className="rounded-lg border border-red-500/50 bg-red-950/60 px-3 py-2 text-sm text-red-200">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="btn-shine relative w-full overflow-hidden rounded-lg bg-gradient-to-b from-parchment-400 to-parchment-500 py-3 font-title text-lg font-bold tracking-wide text-dungeon-900 shadow-[0_6px_24px_rgba(212,168,67,0.4)] transition-transform hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-60"
            >
              {loading ? "Abriendo las puertas..." : mode === "login" ? "Entrar al Reino" : "Forjar mi Leyenda"}
            </button>
          </form>
        </main>

        <footer className="text-center text-xs text-parchment-300/60" style={{ animation: "fade-up 1.4s 0.9s both" }}>
          Un mundo low-poly para jugar con amigos · v0.1
        </footer>
      </div>
    </div>
  );
}
