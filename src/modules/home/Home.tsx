import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { LogOut } from "lucide-react";
import supabase from "../../lib/supabaseClient";
import usePerms, { ModuleKey } from "../../app/hooks/usePerms";

type Card = {
  to: string;
  title: string;
  desc: string;
  perm: ModuleKey;
};

const CARDS: Card[] = [
  { to: "/sales",        title: "Ventas",              desc: "Registrar y cobrar ventas.",            perm: "sales" },
  { to: "/receivables",  title: "Cobros",              desc: "Control de cuentas por cobrar.",        perm: "receivables" },
  { to: "/purchases",    title: "Compras",             desc: "Compras a proveedores.",                perm: "purchases" },
  { to: "/inventory",    title: "Inventario",          desc: "Stock, kardex y movimientos.",          perm: "inventory" },
  { to: "/services",     title: "Servicios",           desc: "Órdenes y atenciones de servicio.",     perm: "services" },
  { to: "/maintenance",  title: "Mantenimiento",       desc: "Órdenes y repuestos.",                  perm: "maintenance" },
  { to: "/clients",      title: "Clientes",            desc: "Gestión de clientes.",                  perm: "clients" },
  { to: "/suppliers",    title: "Proveedores",         desc: "Gestión de proveedores.",               perm: "suppliers" },
  { to: "/products",     title: "Productos",           desc: "Catálogo y precios.",                   perm: "products" },
  { to: "/rewards",      title: "Premios",             desc: "Metas y recompensas por proveedor.",    perm: "rewards" },
  { to: "/users",        title: "Usuarios y permisos", desc: "Roles y accesos por módulos.",          perm: "users" },
];

export default function Home() {
  const navigate = useNavigate();
  const { role, modules, can } = usePerms();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/login", { replace: true });
  };

  const visible = CARDS.filter(c => can(c.perm));

  return (
    <div className="min-h-[100dvh] bg-gradient-to-b from-slate-50 to-white">
      <header className="border-b bg-white">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-2xl bg-gray-900 text-white grid place-content-center font-semibold">
              RG
            </div>
            <div>
              <div className="font-semibold">Raíces Global</div>
              <div className="text-xs text-gray-500">Inicio · Rol: {role}</div>
            </div>
          </div>

          <button
            onClick={handleLogout}
            className="flex items-center gap-2 bg-white text-slate-700 border border-slate-200 rounded-lg px-3 py-1.5 shadow-sm hover:bg-slate-100 transition"
            title="Cerrar sesión"
          >
            <LogOut className="w-4 h-4" />
            <span className="text-sm font-medium">Cerrar sesión</span>
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6">
        <h1 className="text-2xl font-bold mb-4">Selecciona un módulo</h1>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {visible.map(card => (
            <motion.div
              key={card.to}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="h-full"
            >
              <Link
                to={card.to}
                className="group block h-full rounded-2xl border border-slate-200 bg-white shadow-sm hover:shadow-md transition"
              >
                <div className="p-4">
                  <h3 className="text-base font-semibold text-slate-800">
                    {card.title}
                  </h3>
                  <p className="text-sm mt-1 text-slate-600">{card.desc}</p>
                  <div className="mt-3 text-sm font-medium text-emerald-700">Entrar →</div>
                </div>
              </Link>
            </motion.div>
          ))}

          {visible.length === 0 && (
            <div className="text-sm text-gray-500">
              Tu cuenta no tiene módulos habilitados todavía.
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
