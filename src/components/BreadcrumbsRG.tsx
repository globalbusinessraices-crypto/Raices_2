// src/components/BreadcrumbsRG.tsx
import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Home, ChevronRight } from "lucide-react";
import usePerms from "../app/hooks/usePerms";

// Ajusta estos tipos si tu hook usa otros nombres
type Role = "manager" | "secretary";
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
  | "rewards"
  | "users";

type Ruta = {
  label: string;
  path: string;
  perm?: ModuleKey;        // si tiene permiso asociado, solo se muestra si el user lo tiene
  onlyManager?: boolean;   // visible solo para gerente (para "Usuarios y permisos")
};

const RUTAS: Ruta[] = [
  { label: "Ventas",               path: "/sales",        perm: "sales" },
  { label: "Cobros",               path: "/receivables",  perm: "receivables" },
  { label: "Compras",              path: "/purchases",    perm: "purchases" },
  { label: "Inventario",           path: "/inventory",    perm: "inventory" },
  { label: "Servicios",            path: "/services",     perm: "services" },
  { label: "Mantenimiento",        path: "/maintenance",  perm: "maintenance" },
  { label: "Clientes",             path: "/clients",      perm: "clients" },
  { label: "Proveedores",          path: "/suppliers",    perm: "suppliers" },
  { label: "Productos",            path: "/products",     perm: "products" },
  { label: "Premios",              path: "/rewards",      perm: "rewards" },
  { label: "Usuarios y permisos",  path: "/users",        onlyManager: true },
];

export default function BreadcrumbsRG() {
  const location = useLocation();
  const navigate = useNavigate();

  // Tu hook expone 'can' (no 'hasPerm')
  const { role, can } = usePerms() as {
    role: Role;
    can: (moduleKey: ModuleKey) => boolean;
  };

  // Filtro de rutas por permisos/rol
  const rutasVisibles = useMemo(() => {
    return RUTAS.filter((r) => {
      if (r.onlyManager) return role === "manager";
      if (r.perm) return role === "manager" || can(r.perm);
      return true;
    });
  }, [role, can]);

  // Ruta actual para chip activo y breadcrumb
  const actual = useMemo(
    () => rutasVisibles.find((r) => location.pathname.startsWith(r.path)),
    [location.pathname, rutasVisibles]
  );

  // Recuerda último módulo visitado
  const [lastModule, setLastModule] = useState<string>("/");
  useEffect(() => {
    if (actual?.path) {
      setLastModule(actual.path);
      localStorage.setItem("rg:lastModule", actual.path);
    }
  }, [actual?.path]);

  const irA = (path: string) => navigate(path);

  return (
    <div className="w-full px-4">
      <div className="mx-auto max-w-7xl">
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm p-4 md:p-5">
          {/* ------ Breadcrumb superior ------ */}
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <nav aria-label="Breadcrumb" className="text-sm">
              <ol className="flex items-center gap-2 text-slate-600">
                <li className="inline-flex items-center gap-2">
                  <Link
                    to="/home"
                    className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                  >
                    <Home className="size-4" aria-hidden="true" />
                    <span className="font-medium">Inicio</span>
                  </Link>
                  {actual && (
                    <ChevronRight className="size-4 text-slate-400" aria-hidden="true" />
                  )}
                </li>

                {actual && (
                  <li className="inline-flex items-center gap-2">
                    <span className="font-medium text-slate-800">{actual.label}</span>
                  </li>
                )}
              </ol>
            </nav>

            {/* Botón retorno al último módulo */}
            <button
              onClick={() => irA(localStorage.getItem("rg:lastModule") || lastModule)}
              className="self-start text-xs font-medium text-blue-700 hover:underline"
            >
              {actual ? "Volver al módulo" : "Ir al último módulo"}
            </button>
          </div>

          {/* ------ Chips de navegación ------ */}
          <div className="mt-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs uppercase tracking-wide text-slate-500">
                Módulos
              </span>
              <button
                onClick={() => irA("/home")}
                className="text-xs font-medium text-blue-700 hover:underline"
              >
                Ir al inicio
              </button>
            </div>

            <div
              className="flex gap-2 overflow-x-auto pb-2 snap-x snap-mandatory"
              role="tablist"
              aria-label="Navegación de módulos"
            >
              {rutasVisibles.map((r) => {
                const activo = location.pathname.startsWith(r.path);
                return (
                  <button
                    key={r.path}
                    role="tab"
                    aria-selected={activo}
                    onClick={() => irA(r.path)}
                    className={`snap-start whitespace-nowrap rounded-full border px-3 py-1.5 text-sm transition shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600
                      ${
                        activo
                          ? "border-blue-200 bg-blue-50 text-blue-700"
                          : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                      }`}
                  >
                    {r.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
