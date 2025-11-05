// src/modules/auth/Login.tsx
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import supabase from "../../lib/supabaseClient";

export default function Login() {
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  // Si ya hay sesión, mandar al Home
  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (data.session) nav("/home", { replace: true });
    })();
  }, [nav]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);

    if (error) {
      setMsg(error.message);
      return;
    }

    // Listo: ir al Home
    nav("/home", { replace: true });
  };

  return (
    <div className="min-h-screen grid place-content-center p-4 bg-gray-50">
      <div className="w-[360px] max-w-full border rounded-2xl p-5 bg-white shadow-sm">
        <div className="text-center mb-4">
          <div className="mx-auto w-12 h-12 rounded-2xl bg-gray-900 text-white grid place-content-center font-semibold">
            RG
          </div>
          <h1 className="mt-2 text-lg font-semibold">Iniciar sesión</h1>
        </div>

        <form onSubmit={onSubmit} className="space-y-3">
          <label className="flex flex-col">
            <span className="text-xs text-gray-500">Correo</span>
            <input
              type="email"
              required
              className="border rounded-xl px-3 py-2"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="tucorreo@empresa.com"
              autoComplete="username"
            />
          </label>

          <label className="flex flex-col">
            <span className="text-xs text-gray-500">Contraseña</span>
            <input
              type="password"
              required
              className="border rounded-xl px-3 py-2"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="********"
              autoComplete="current-password"
            />
          </label>

          {msg && <div className="text-red-600 text-sm">{msg}</div>}

          <button
            type="submit"
            disabled={loading}
            className="w-full px-3 py-2 rounded-xl bg-emerald-600 text-white disabled:opacity-60"
          >
            {loading ? "Ingresando..." : "Ingresar"}
          </button>
        </form>
      </div>
    </div>
  );
}
