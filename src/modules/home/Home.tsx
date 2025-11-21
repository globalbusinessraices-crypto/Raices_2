// src/pages/Home.tsx  (reemplazo completo)
import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import {
  LogOut,
  Search,
  Sparkles,
  Users,
  UserCog,
  ShoppingCart,
  CreditCard,
  PackageOpen,
  Wrench,
  ClipboardList,
  Truck,
  Gift,
  Tag,
  Wallet,        // icono para Gastos
  BarChart3,     // 👈 NUEVO icono para Resumen general
} from "lucide-react";
import supabase from "../../lib/supabaseClient";
import usePerms, { ModuleKey } from "../../app/hooks/usePerms";

type Card = {
  to: string;
  title: string;
  desc: string;
  perm: ModuleKey;
  icon: React.ElementType;
};

const ALL_CARDS: Card[] = [
  {
    to: "/summary",
    title: "Resumen general",
    desc: "Vista consolidada de ventas, compras y gastos.",
    perm: "summary",
    icon: BarChart3,
  }, // 👈 NUEVA tarjeta de resumen
  { to: "/sales",        title: "Ventas",              desc: "Registrar y cobrar ventas.",            perm: "sales",        icon: ShoppingCart },
  { to: "/receivables",  title: "Cobros",              desc: "Cuentas por cobrar y pagos.",           perm: "receivables",  icon: CreditCard },
  { to: "/purchases",    title: "Compras",             desc: "Órdenes y facturas a proveedores.",     perm: "purchases",    icon: ClipboardList },
  { to: "/expenses",     title: "Gastos",              desc: "Registro y control de gastos.",         perm: "expenses",     icon: Wallet },
  { to: "/inventory",    title: "Inventario",          desc: "Stock, kardex y movimientos.",          perm: "inventory",    icon: PackageOpen },
  { to: "/services",     title: "Servicios",           desc: "Órdenes y atenciones de servicio.",     perm: "services",     icon: Wrench },
  { to: "/maintenance",  title: "Mantenimiento",       desc: "Órdenes y repuestos.",                  perm: "maintenance",  icon: ToolIcon },
  { to: "/clients",      title: "Clientes",            desc: "Gestión de clientes.",                  perm: "clients",      icon: Users },
  { to: "/suppliers",    title: "Proveedores",         desc: "Gestión de proveedores.",               perm: "suppliers",    icon: Truck },
  { to: "/products",     title: "Productos",           desc: "Catálogo, variantes y precios.",        perm: "products",     icon: Tag },
  { to: "/rewards",      title: "Premios",             desc: "Metas y recompensas por proveedor.",    perm: "rewards",      icon: Gift },
  { to: "/users",        title: "Usuarios y permisos", desc: "Roles y accesos por módulos.",          perm: "users",        icon: UserCog },
];

// Fallback simple para “Mantenimiento” si quieres distinguirlo de “Servicios”
function ToolIcon(props: React.SVGProps<SVGSVGElement>) {
  return <Wrench {...props} />;
}

const RECENTS_KEY = "rg:recentModules";

export default function Home() {
  const navigate = useNavigate();
  const { role, can } = usePerms();
  const prefersReducedMotion = useReducedMotion();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/login", { replace: true });
  };

  // --- Permisos -> tarjetas visibles
  const permittedCards = useMemo(() => ALL_CARDS.filter((c) => can(c.perm)), [can]);

  // --- Búsqueda simple
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return permittedCards;
    return permittedCards.filter(
      (c) =>
        c.title.toLowerCase().includes(s) ||
        c.desc.toLowerCase().includes(s)
    );
  }, [q, permittedCards]);

  // --- Recientes (persistidos)
  const [recents, setRecents] = useState<string[]>([]);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(RECENTS_KEY);
      if (raw) setRecents(JSON.parse(raw));
    } catch {}
  }, []);

  const pushRecent = (path: string) => {
    const next = [path, ...recents.filter((p) => p !== path)].slice(0, 6);
    setRecents(next);
    try {
      localStorage.setItem(RECENTS_KEY, JSON.stringify(next));
    } catch {}
  };

  // --- Atajos 1..9 para abrir la tarjeta i-ésima del listado filtrado
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      if (e.key >= "1" && e.key <= "9") {
        const idx = Number(e.key) - 1;
        if (filtered[idx]) {
          e.preventDefault();
          pushRecent(filtered[idx].to);
          navigate(filtered[idx].to);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [filtered, navigate]); // eslint-disable-line

  // --- Variants para motion
  const cardVariants = {
    hidden: { opacity: 0, y: prefersReducedMotion ? 0 : 10 },
    show: { opacity: 1, y: 0, transition: { duration: 0.25 } },
  };

  return (
    <div className="min-h-[100dvh] bg-gradient-to-b from-slate-50 to-white">
      {/* Topbar */}
      <header className="border-b bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/70 sticky top-0 z-20">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-2xl bg-gray-900 text-white grid place-content-center font-semibold select-none">
              RG
            </div>
            <div>
              <div className="font-semibold leading-none">Raíces Global</div>
              <div className="mt-1 flex items-center gap-2 text-xs text-gray-500">
                <span>Inicio</span>
                <span aria-hidden>·</span>
                <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2 py-[2px] text-[11px] font-medium text-slate-700">
                  Rol: {role}
                </span>
              </div>
            </div>
          </div>

          <button
            onClick={handleLogout}
            className="flex items-center gap-2 bg-white text-slate-700 border border-slate-200 rounded-lg px-3 py-1.5 shadow-sm hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 transition"
            title="Cerrar sesión"
          >
            <LogOut className="w-4 h-4" />
            <span className="text-sm font-medium">Cerrar sesión</span>
          </button>
        </div>
      </header>

      {/* Main */}
      <main className="max-w-6xl mx-auto px-4 py-6">
        {/* Hero + búsqueda */}
        <section className="mb-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900">
                Selecciona un módulo
              </h1>
              <p className="text-sm text-slate-600 mt-1">
                Usa la búsqueda o los atajos{" "}
                <kbd className="rounded border px-1 text-[11px]">1–9</kbd> para
                abrir rápidamente.
              </p>
            </div>

            <label className="relative w-full sm:w-80">
              <span className="sr-only">Buscar módulos</span>
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Buscar: ventas, inventario…"
                className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm shadow-sm outline-none ring-0 placeholder:text-slate-400 focus:border-blue-300 focus:ring-2 focus:ring-blue-600/30"
                type="search"
                aria-label="Buscar módulos"
              />
            </label>
          </div>

          {/* Recientes */}
          {recents.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="text-[11px] uppercase tracking-wide text-slate-500">
                Recientes
              </span>
              {recents.map((path) => {
                const c = ALL_CARDS.find((x) => x.to === path);
                if (!c || !can(c.perm)) return null;
                return (
                  <Link
                    key={path}
                    to={path}
                    onClick={() => pushRecent(path)}
                    className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                  >
                    <c.icon className="size-3.5" />
                    {c.title}
                  </Link>
                );
              })}
              <button
                onClick={() => {
                  setRecents([]);
                  try {
                    localStorage.removeItem(RECENTS_KEY);
                  } catch {}
                }}
                className="ml-1 text-[11px] text-blue-700 hover:underline"
              >
                limpiar
              </button>
            </div>
          )}
        </section>

        {/* Grid de tarjetas */}
        <section aria-live="polite">
          {filtered.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filtered.map((card, i) => {
                const Icon = card.icon;
                return (
                  <motion.div
                    key={card.to}
                    initial="hidden"
                    animate="show"
                    variants={cardVariants}
                    transition={{
                      delay: prefersReducedMotion ? 0 : i * 0.03,
                    }}
                    className="h-full"
                  >
                    <Link
                      to={card.to}
                      onClick={() => pushRecent(card.to)}
                      className="group block h-full rounded-2xl border border-slate-200 bg-white shadow-sm hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 transition"
                      aria-label={`Abrir módulo ${card.title}`}
                    >
                      <div className="p-4">
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-2">
                            <div className="grid place-content-center rounded-xl border border-slate-200 bg-slate-50 p-2">
                              <Icon className="size-5 text-slate-700" />
                            </div>
                            <h3 className="text-base font-semibold text-slate-900">
                              {card.title}
                            </h3>
                          </div>
                          <Sparkles className="size-4 opacity-0 transition group-hover:opacity-100 text-amber-500" />
                        </div>

                        <p className="text-sm mt-2 text-slate-600">
                          {card.desc}
                        </p>

                        <div className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-emerald-700">
                          Entrar <span aria-hidden>→</span>
                        </div>
                      </div>
                    </Link>
                  </motion.div>
                );
              })}
            </div>
          ) : (
            <EmptyState query={q} />
          )}
        </section>
      </main>
    </div>
  );
}

/* --------- Subcomponentes --------- */

function EmptyState({ query }: { query: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
      <div className="mx-auto mb-3 grid size-10 place-content-center rounded-full border border-slate-200 bg-slate-50">
        <Search className="size-5 text-slate-500" />
      </div>
      <h3 className="font-semibold text-slate-900">Sin resultados</h3>
      <p className="mt-1 text-sm text-slate-600">
        {query
          ? `No encontramos módulos que coincidan con “${query}”.`
          : "Tu cuenta aún no tiene módulos habilitados."}
      </p>
      <p className="mt-1 text-xs text-slate-500">
        Verifica tus permisos o ajusta la búsqueda.
      </p>
    </div>
  );
}
