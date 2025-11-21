import React, { useEffect, useState } from "react";
import Section from "../../components/Section";
import Table from "../../components/Table";
import supabase from "../../lib/supabaseClient";

const fmt = (d) => new Date(d).toLocaleDateString("es-PE");

// helper para elegir primer valor válido
const pick = (obj, keys, fallback = "") => {
  for (const k of keys) {
    if (obj && obj[k] != null && String(obj[k]).trim() !== "") return obj[k];
  }
  return fallback;
};

// ===== Cálculo de días restantes =====
const startOfTodayUTC = () => {
  const now = new Date();
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
};

const dateUTC = (d) => {
  const iso =
    typeof d === "string" ? d.slice(0, 10) : new Date(d).toISOString().slice(0, 10);
  const [y, m, day] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, day);
};

const daysLeft = (nextDate) => {
  const ms = dateUTC(nextDate) - startOfTodayUTC();
  return Math.ceil(ms / 86400000);
};

// ============================================================================
// MODAL REUTILIZABLE
// ============================================================================

function Modal({ open, onClose, title, children }) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-lg w-[90%] max-w-lg p-4 relative">
        <h2 className="text-lg font-semibold mb-3">{title}</h2>

        <button
          onClick={onClose}
          className="absolute right-3 top-3 text-gray-500 hover:text-black"
        >
          ✕
        </button>

        <div className="max-h-[400px] overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}

// ============================================================================
// EDITOR DE OBSERVACIONES
// ============================================================================

function ObservacionesEditor({ contract, onSaved }) {
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!text.trim()) return;

    setSaving(true);

    const { error } = await supabase.from("service_contract_notes").insert({
      contract_id: contract.id,
      note: text.trim(),
    });

    if (error) alert(error.message);
    else {
      setText("");
      onSaved && onSaved(); // recarga historial si está abierto
    }

    setSaving(false);
  };

  return (
    <div className="flex flex-col gap-2">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Escribe observación…"
        className="border rounded-lg px-2 py-1 text-sm w-full"
        rows={2}
      />

      <button
        onClick={save}
        disabled={saving || !text.trim()}
        className="px-3 py-1 bg-blue-600 text-white rounded-lg text-sm disabled:opacity-50"
      >
        {saving ? "Guardando..." : "Guardar"}
      </button>
    </div>
  );
}

// ============================================================================
// COMPONENTE PRINCIPAL
// ============================================================================

export default function Services() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);

  // MODAL E HISTORIAL
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyRows, setHistoryRows] = useState([]);
  const [selectedContract, setSelectedContract] = useState(null);

  // Cargar historial
  const loadHistory = async (contract) => {
    setSelectedContract(contract);
    setHistoryOpen(true);

    const { data, error } = await supabase
      .from("service_contract_notes")
      .select("id, note, created_at")
      .eq("contract_id", contract.id)
      .order("created_at", { ascending: false });

    if (!error && data) setHistoryRows(data);
  };

  const reloadHistoryIfOpen = () => {
    if (selectedContract) loadHistory(selectedContract);
  };

  // Cargar contratos
  const load = async () => {
    setLoading(true);

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

    // cargar datos extras del cliente
    const clientIds = Array.from(
      new Set((services || []).map((r) => r.client_id).filter(Boolean))
    );

    let clientsById = {};

    if (clientIds.length) {
      const { data: clients } = await supabase
        .from("clients")
        .select("id, telefono, direccion")
        .in("id", clientIds);

      clientsById = Object.fromEntries((clients || []).map((c) => [c.id, c]));
    }

    // enriquecer filas
    const enriched = (services || []).map((r) => {
      const cli = clientsById[r.client_id] || {};

      const phone = pick(cli, ["telefono"], "—");
      const address = pick(cli, ["direccion"], "—");

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
    const months = r.interval_months || 8;
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
          { key: "phone", label: "Celular", render: (r) => r.phone },
          { key: "address", label: "Dirección", render: (r) => r.address },

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

          // NUEVA COLUMNA: OBSERVACIONES
          {
            key: "observaciones",
            label: "Observaciones",
            render: (r) => (
              <ObservacionesEditor
                contract={r}
                onSaved={reloadHistoryIfOpen}
              />
            ),
          },

          // COLUMNA PARA VER HISTORIAL
          {
            key: "history",
            label: "Historial",
            render: (r) => (
              <button
                onClick={() => loadHistory(r)}
                className="px-2 py-1 rounded-lg border text-sm"
              >
                Ver historial
              </button>
            ),
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

      {/* MODAL DEL HISTORIAL */}
      <Modal
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        title={`Historial – ${selectedContract?.client_name || ""}`}
      >
        {historyRows.length === 0 ? (
          <p className="text-gray-400 text-sm">Sin observaciones registradas.</p>
        ) : (
          <ul className="space-y-3">
            {historyRows.map((h) => (
              <li key={h.id} className="border rounded-lg p-2">
                <div className="text-xs text-gray-500">
                  {new Date(h.created_at).toLocaleString("es-PE")}
                </div>
                <div className="text-sm mt-1">{h.note}</div>
              </li>
            ))}
          </ul>
        )}
      </Modal>
    </Section>
  );
}
