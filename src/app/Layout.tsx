// src/app/Layout.tsx
import React from "react";
import { NavLink, Outlet, useLocation, Link } from "react-router-dom";
import usePerms, { ModuleKey } from "./hooks/usePerms";

const NAV: Array<{ path: string; label: string; perm?: ModuleKey; onlyManager?: boolean }> = [
  // 👇 Nuevo tab de resumen general
  { path: "/summary",     label: "Resumen general", perm: "summary" },

  { path: "/sales",        label: "Ventas",                perm: "sales" },
  { path: "/receivables",  label: "Cobros",                perm: "receivables" },
  { path: "/purchases",    label: "Compras",               perm: "purchases" },
  { path: "/expenses",     label: "Gastos",                perm: "expenses" },
  { path: "/inventory",    label: "Inventario",            perm: "inventory" },
  { path: "/services",     label: "Servicios",             perm: "services" },
  { path: "/maintenance",  label: "Mantenimiento",         perm: "maintenance" },
  { path: "/clients",      label: "Clientes",              perm: "clients" },
  { path: "/suppliers",    label: "Proveedores",           perm: "suppliers" },
  { path: "/products",     label: "Productos",             perm: "products" },
  { path: "/rewards",      label: "Premios",               perm: "rewards" },
  { path: "/users",        label: "Usuarios y permisos",   onlyManager: true },
];

export default function Layout() {
  const { role, modules = [], signOut } = usePerms() as {
    role: "manager" | "secretary";
    modules: ModuleKey[];
    signOut?: () => Promise<void> | void;
  };

  const location = useLocation();
  const isHome = location.pathname === "/home";

  const visibleNav = NAV.filter((item) => {
    if (item.onlyManager) return role === "manager";
    if (!item.perm) return true;
    return role === "manager" || modules.includes(item.perm);
  });

  const linkClass = (path: string) => {
    const active = location.pathname.startsWith(path);
    return [
      "px-3 py-2 rounded-lg transition whitespace-nowrap",
      active ? "bg-gray-900 text-white" : "hover:bg-gray-100 text-gray-900",
    ].join(" ");
  };

  const onLogout = async () => {
    try {
      await signOut?.();
    } catch {}
  };

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      {/* Header/tabs SOLO en interfaces (oculto en /home) */}
      {!isHome && (
        <header className="sticky top-0 z-40 border-b bg-white/95 backdrop-blur">
          <div className="mx-auto max-w-7xl px-4 py-3 flex items-center justify-between gap-4">
            <Link to="/home" className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-2xl bg-gray-900 text-white grid place-content-center font-semibold">
                RG
              </div>
              <div className="font-semibold leading-tight">
                <div>Raíces</div>
                <div className="-mt-0.5 text-gray-600 text-sm">Global</div>
              </div>
            </Link>

            <div className="flex items-center gap-3 text-sm text-gray-600">
              <span className="hidden sm:inline">
                Rol: <b>{role}</b>
              </span>
              <button
                onClick={onLogout}
                className="rounded-lg border px-3 py-1.5 hover:bg-gray-50"
                title="Cerrar sesión"
              >
                Cerrar sesión
              </button>
            </div>
          </div>

          <div className="border-t">
            <div
              className="mx-auto max-w-7xl px-4 py-2 overflow-x-auto"
              aria-label="Navegación de módulos"
            >
              <nav className="flex items-center gap-2 min-h-[40px]">
                {visibleNav.map((tab) => (
                  <NavLink key={tab.path} to={tab.path} className={linkClass(tab.path)}>
                    {tab.label}
                  </NavLink>
                ))}
              </nav>
            </div>
          </div>
        </header>
      )}

      <main className="mx-auto max-w-7xl px-4 py-6">
        <Outlet />
      </main>

      <footer className="border-t bg-white">
        <div className="mx-auto max-w-7xl px-4 py-3 text-xs text-gray-500">
          © {new Date().getFullYear()} Riaces – MVP conectado a Supabase.
        </div>
      </footer>
    </div>
  );
}
