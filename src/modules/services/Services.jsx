import React, { useEffect, useState } from "react";
import Section from "../../components/Section";
import Table from "../../components/Table";
import supabase from "../../lib/supabaseClient";

const fmt = (d) => new Date(d).toLocaleDateString("es-PE");

// helper simple para elegir el primer campo disponible
const pick = (obj, keys, fallback = "") => {
  for (const k of keys) {
    if (obj && obj[k] != null && String(obj[k]).trim() !== "") return obj[k];
  }
  return fallback;
};

// ===== Cálculo de días restantes robusto (evita desfases de zona horaria) =====
const startOfTodayUTC = () => {
  const now = new Date();
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
};

const dateUTC = (d) => {
  // admite string "YYYY-MM-DD" o Date
  const isoDay =
    typeof d === "string" ? d.slice(0, 10) : new Date(d).toISOString().slice(0, 10);
  const [y, m, day] = isoDay.split("-").map(Number);
  return Date.UTC(y, m - 1, day);
};

const daysLeft = (nextDate) => {
  const ms = dateUTC(nextDate) - startOfTodayUTC();
  return Math.ceil(ms / 86400000); // 1000*60*60*24
};
// ============================================================================

export default function Services() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);

    // 1) Servicios desde la vista
    const { data: services, error } = await supabase
      .from("v_filter_services")
      .select("*")
      .order("next_service_date", { ascending: true });

    if (error) {
      alert(error.message);
      setRows([]);
      setLoading(false);
      return;
    }

    // 2) Traer datos del cliente (celular y dirección) usando client_id
    const clientIds = Array.from(
      new Set((services || []).map((r) => r.client_id).filter(Boolean))
    );

    let clientsById = {};
    if (clientIds.length) {
      const { data: clients, error: cErr } = await supabase
        .from("clients") // cambia si tu tabla tiene otro nombre
        .select("id, celular, telefono, phone, cellphone, direccion, address")
        .in("id", clientIds);

      if (!cErr && clients) {
        clientsById = Object.fromEntries(clients.map((c) => [c.id, c]));
      }
    }

    // 3) Enriquecer filas con celular, dirección y días restantes
    const enriched = (services || []).map((r) => {
      const cli = clientsById[r.client_id] || {};
      const phone = pick(cli, ["celular", "cellphone", "telefono", "phone"], "");
      const address = pick(cli, ["direccion", "address"], "");

      const n = daysLeft(r.next_service_date);
      const days_left = Number.isFinite(n) ? n : null;

      return { ...r, phone, address, days_left };
    });

    setRows(enriched);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const atender = async (r) => {
    const months = r.interval_months || 12;
    const d = new Date(r.next_service_date);
    d.setMonth(d.getMonth() + months);
    const next = d.toISOString().slice(0, 10);

    const { error } = await supabase
      .from("service_contracts")
      .update({ next_service_date: next })
      .eq("id", r.id);

    if (error) return alert(error.message);
    load();
  };

  return (
    <Section title="Servicios de Purificadores (anual)">
      <div className="mb-3">
        <button onClick={load} className="px-3 py-2 rounded-xl border">
          Actualizar vencidos
        </button>
      </div>

      <Table
        loading={loading}
        rows={rows}
        keyField="id"
        emptyMessage="Sin datos"
        columns={[
          { key: "client_name", label: "Cliente" },
          { key: "phone", label: "Celular", render: (r) => r.phone || "—" },
          { key: "address", label: "Dirección", render: (r) => r.address || "—" },
          { key: "product_name", label: "Equipo" },
          {
            key: "next_service_date",
            label: "Programado",
            render: (r) => fmt(r.next_service_date),
          },
          {
            key: "days_left",
            label: "Faltan (días)",
            render: (r) => {
              const n = r.days_left;
              if (!Number.isFinite(n)) return "—";
              const color =
                n < 0
                  ? "bg-red-100 text-red-700"
                  : n <= 30
                  ? "bg-amber-100 text-amber-700"
                  : "bg-emerald-100 text-emerald-700";
              return (
                <span className={`px-2 py-1 rounded-full text-xs ${color}`}>
                  {n}
                </span>
              );
            },
          },
          {
            key: "status",
            label: "Estado",
            render: (r) => {
              const color =
                r.status === "vencido"
                  ? "bg-red-100 text-red-700"
                  : r.status === "por vencer"
                  ? "bg-amber-100 text-amber-700"
                  : "bg-emerald-100 text-emerald-700";
              return (
                <span className={`px-2 py-1 rounded-full text-xs ${color}`}>
                  {r.status}
                </span>
              );
            },
          },
          {
            key: "actions",
            label: "Acciones",
            render: (r) => (
              <button
                onClick={() => atender(r)}
                className="px-2 py-1 rounded-lg border"
              >
                Atender
              </button>
            ),
          },
        ]}
      />
    </Section>
  );
}
