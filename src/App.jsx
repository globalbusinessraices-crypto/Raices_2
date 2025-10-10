// src/App.jsx
import React, { useEffect, useState } from "react";

import Clients      from "./modules/clients/Clients.jsx";
import Suppliers    from "./modules/suppliers/Suppliers.jsx";
import Products     from "./modules/products/Products.jsx";
import Purchases    from "./modules/purchases/Purchases.jsx";
import Sales        from "./modules/sales/Sales.jsx";
import Inventory    from "./modules/inventory/Inventory.jsx";
import Services     from "./modules/services/Services.jsx";
import Maintenance  from "./modules/maintenance/Maintenance.jsx";
import Receivables  from "./modules/receivables/Receivables.jsx";
import Expenses     from "./modules/expenses/Expenses.jsx";
import Premios      from "./modules/rewards/Premios.jsx"; // <<< NUEVO

import useInventory from "./app/hooks/useInventory";
import useServices  from "./app/hooks/useServices";
import supabase     from "./lib/supabaseClient";

export default function App() {
  const [active, setActive] = useState("ventas");

  // ------- Estado cargado desde Supabase -------
  const [suppliers, setSuppliers] = useState([]);
  const [products, setProducts]   = useState([]);
  const [clients, setClients]     = useState([]);
  const [loading, setLoading]     = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);

      const [
        { data: sdata, error: sErr },
        { data: pdata, error: pErr },
        { data: cdata, error: cErr },
      ] = await Promise.all([
        supabase.from("suppliers").select("id, name").order("name", { ascending: true }),
        supabase
          .from("products")
          .select(`
            id,
            supplier_id,
            sku,
            name,
            unit,
            list_price,
            margin_pct,
            last_cost,
            service_is_annual,
            service_interval_months,
            service_name
          `)
          .order("name", { ascending: true }),
        supabase.from("clients").select("id, name, tipo").order("name", { ascending: true }),
      ]);

      if (sErr) {
        alert("Error cargando proveedores: " + sErr.message);
      } else {
        setSuppliers(sdata ?? []);
      }

      if (pErr) {
        alert("Error cargando productos: " + pErr.message);
      } else {
        setProducts(
          (pdata ?? []).map((r) => ({
            id: r.id,
            supplierId: r.supplier_id,
            sku: r.sku,
            name: r.name,
            unit: r.unit,
            listPrice: Number(r.list_price || 0),
            marginPct: Number(r.margin_pct || 0),
            lastCost: Number(r.last_cost || 0),
            // banderas de servicio anual (camelCase para el front)
            serviceIsAnnual: !!r.service_is_annual,
            serviceIntervalMonths: Number(r.service_interval_months ?? 12),
            serviceName: r.service_name || null,
          }))
        );
      }

      if (cErr) {
        alert("Error cargando clientes: " + cErr.message);
      } else {
        setClients(cdata ?? []);
      }

      setLoading(false);
    })();
  }, []);

  const inventory = useInventory(products);
  const services  = useServices([]);

  const NAV = [
    { key: "ventas",        label: "Ventas" },
    { key: "cobros",        label: "Cobros" },
    { key: "gastos",        label: "Gastos" },
    { key: "compras",       label: "Compras" },
    { key: "inventario",    label: "Inventario" },
    { key: "servicios",     label: "Servicios" },
    { key: "mantenimiento", label: "Mantenimiento" },
    { key: "clientes",      label: "Clientes" },
    { key: "proveedores",   label: "Proveedores" },
    { key: "productos",     label: "Productos" },
    { key: "premios",       label: "Premios" }, // <<< NUEVO
  ];

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
            {NAV.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActive(tab.key)}
                className={`px-3 py-2 rounded-xl ${
                  active === tab.key ? "bg-gray-900 text-white" : "hover:bg-gray-100"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6">
        {/* móvil */}
        <div className="flex flex-wrap gap-2 mb-6 md:hidden">
          {NAV.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActive(tab.key)}
              className={`px-3 py-2 rounded-xl ${
                active === tab.key ? "bg-gray-900 text-white" : "bg-white border"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Módulos */}
        {active === "compras" && <Purchases />}

        {active === "ventas" && (
          <Sales products={products} suppliers={suppliers} /* inventory={inventory} */ />
        )}

        {active === "cobros" && <Receivables />}

        {active === "gastos" && <Expenses />}

        {active === "inventario" && (
          <Inventory products={products} stock={inventory.stock} kardex={inventory.kardex} />
        )}

        {active === "servicios" && (
          <Services
            clients={clients}
            units={services.units}
            jobs={services.jobs}
            attendJob={services.attendJob}
          />
        )}

        {active === "mantenimiento" && (
          <Maintenance clients={clients} products={products} inventory={inventory} />
        )}

        {active === "clientes" && <Clients />}

        {active === "proveedores" && <Suppliers />}

        {active === "productos" && <Products />}

        {active === "premios" && <Premios />} {/* <<< NUEVO */}
      </main>

      <footer className="border-t bg-white">
        <div className="max-w-6xl mx-auto px-4 py-3 text-xs text-gray-500">
          © {new Date().getFullYear()} Riaces – MVP conectado a Supabase.
        </div>
      </footer>

      {loading && (
        <div className="fixed inset-0 bg-black/20 grid place-content-center text-white text-sm">
          Cargando datos…
        </div>
      )}
    </div>
  );
}
