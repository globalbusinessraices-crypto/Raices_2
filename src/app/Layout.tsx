// src/app/Layout.tsx
import React from "react";
import { NavLink, Outlet } from "react-router-dom";
// Si ya tienes el hook listo, descomenta la línea de abajo:
import usePerms from "./hooks/usePerms"; // <-- ajusta la ruta si la tuya es distinta

type ModuleKey =
  | "sales"
  | "receivables"
  | "purchases"
  | "inventory"
  | "services"
  | "maintenance"
  | "clients"
  | "suppliers"
  | "products"
  | "rewards";

const NAV: Array<{ path: string; label: string; perm: ModuleKey }> = [
  { path: "/ventas",        label: "Ventas",        perm: "sales" },
  { path: "/cobros",        label: "Cobros",        perm: "receivables" },
  { path: "/gastos",        label: "Gastos",        perm: "receivables" }, // si tu módulo de gastos es otro, ajusta
  { path: "/compras",       label: "Compras",       perm: "purchases" },
  { path: "/inventario",    label: "Inventario",    perm: "inventory" },
  { path: "/servicios",     label: "Servicios",     perm: "services" },
  { path: "/mantenimiento", label: "Mantenimiento", perm: "maintenance" },
  { path: "/clientes",      label: "Clientes",      perm: "clients" },
  { path: "/proveedores",   label: "Proveedores",   perm: "suppliers" },
  { path: "/productos",     label: "Productos",     perm: "products" },
  { path: "/premios",       label: "Premios",       perm: "rewards" },
];

export default function Layout() {
  // Si el hook no está listo todavía, puedes poner:
  // const perms = { role: "manager", modules: [] as ModuleKey[] };
  const perms = usePerms(); // { role: 'manager' | 'secretary', modules: ModuleKey[] }

  const visibleNav = NAV.filter((item) => {
    if (perms.role === "manager") return true;
    return perms.modules?.includes(item.perm);
  });

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <header className="border-b bg-white">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-2xl bg-gray-900 text-white grid place-content-center font-semibold">
              RG
            </div>
            <div>
              <div className="font-semibold">Raices Global</div>
            </div>
          </div>

          <nav className="hidden md:flex gap-1">
            {visibleNav.map((tab) => (
              <NavLink
                key={tab.path}
                to={tab.path}
                className={({ isActive }) =>
                  `px-3 py-2 rounded-xl ${
                    isActive ? "bg-gray-900 text-white" : "hover:bg-gray-100"
                  }`
                }
              >
                {tab.label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>

      {/* menú móvil */}
      <div className="max-w-6xl mx-auto px-4 mt-4 md:hidden">
        <div className="flex flex-wrap gap-2">
          {visibleNav.map((tab) => (
            <NavLink
              key={tab.path}
              to={tab.path}
              className={({ isActive }) =>
                `px-3 py-2 rounded-xl ${
                  isActive ? "bg-gray-900 text-white" : "bg-white border"
                }`
              }
            >
              {tab.label}
            </NavLink>
          ))}
        </div>
      </div>

      <main className="max-w-6xl mx-auto px-4 py-6">
        <Outlet />
      </main>

      <footer className="border-t bg-white">
        <div className="max-w-6xl mx-auto px-4 py-3 text-xs text-gray-500">
          © {new Date().getFullYear()} Riaces – MVP conectado a Supabase.
        </div>
      </footer>
    </div>
  );
}
