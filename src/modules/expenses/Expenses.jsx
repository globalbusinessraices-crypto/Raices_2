import React, { useEffect, useMemo, useState } from "react";
import Section from "../../components/Section";
import Table from "../../components/Table";
import supabase from "../../lib/supabaseClient";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts";

const CATEGORIES = [
  "encomiendas", "cargas generales", "ferretería", "wifi", "peaje",
  "luz", "agua", "combustible", "mantenimiento", "pasajes", "sueldos",
  "otros", "postres", "gatos de oficina",
].sort();

const currency = (n) =>
  new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" }).format(Number(n || 0));

const todayISO = () => new Date().toISOString().slice(0, 10);
const monthStartISO = (d = new Date()) => {
  const x = new Date(d.getFullYear(), d.getMonth(), 1);
  return x.toISOString().slice(0, 10);
};

const COLORS = [
  "#FF5733","#33FF57","#3357FF","#FF33A1","#A133FF","#33FFA1",
  "#FFC300","#00BFFF","#FFD700","#DA70D6","#8A2BE2","#7FFF00",
  "#FF8C00","#40E0D0","#FF6347","#4682B4","#D2B48C","#F08080","#20B2AA",
];

const categoryColor = (category) => {
  let hash = 0;
  for (let i = 0; i < category.length; i++) hash = category.charCodeAt(i) + ((hash << 5) - hash);
  return COLORS[Math.abs(hash % COLORS.length)];
};

const CustomTooltip = ({ active, payload }) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div className="bg-white p-2 border rounded-lg shadow-lg text-sm">
        <p className="font-bold">{data.name}</p>
        <p>Monto: <b>{currency(data.value)}</b></p>
        <p>Porcentaje: <b>{data.percent.toFixed(2)}%</b></p>
      </div>
    );
  }
  return null;
};

export default function Expenses() {
  const [dateFrom, setDateFrom] = useState(monthStartISO());
  const [dateTo, setDateTo] = useState(todayISO());
  const [form, setForm] = useState({ date: todayISO(), category: "", description: "", amount: "" });
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("expenses")
      .select("id, date, category, description, amount")
      .gte("date", dateFrom)
      .lte("date", dateTo)
      .order("date", { ascending: false })
      .order("id", { ascending: false });

    if (error) alert("Error cargando gastos: " + error.message);
    else setRows(data || []);

    setLoading(false);
  };

  useEffect(() => { load(); }, [dateFrom, dateTo]);

  const total = useMemo(() => rows.reduce((acc, r) => acc + Number(r.amount || 0), 0), [rows]);

  const chartData = useMemo(() => {
    if (!rows.length || !total) return [];
    const byCat = rows.reduce((acc, r) => {
      const k = r.category || "otros";
      acc[k] = (acc[k] || 0) + Number(r.amount || 0);
      return acc;
    }, {});
    return Object.entries(byCat)
      .map(([name, value]) => ({ name, value, percent: (value / total) * 100 }))
      .sort((a, b) => b.value - a.value);
  }, [rows, total]);

  const canSave = form.date && form.category?.trim() && Number(form.amount) > 0;

  const save = async () => {
    if (!canSave) return alert("Completa fecha, categoría y un monto válido (> 0).");

    // 🔥 Si necesitas created_by, actívalo aquí:
    const user = await supabase.auth.getUser();
    
    const payload = {
      date: form.date,
      category: form.category.trim(),
      description: form.description?.trim() || null,
      amount: Number(form.amount),
      created_by: user.data.user.id, // <-- Activa si RLS lo requiere
    };

    const { data, error } = await supabase
      .from("expenses")
      .insert([payload])
      .select("id, date, category, description, amount")
      .single();

    if (error) return alert("No se pudo registrar: " + error.message);

    if (payload.date >= dateFrom && payload.date <= dateTo) {
      setRows((prev) =>
        [data, ...prev].sort((a, b) => new Date(b.date) - new Date(a.date) || b.id - a.id)
      );
    }

    setForm({ date: todayISO(), category: "", description: "", amount: "" });
  };

  const remove = async (id) => {
    if (!confirm("¿Eliminar este gasto?")) return;
    const { error } = await supabase.from("expenses").delete().eq("id", id);
    if (error) return alert("No se pudo eliminar: " + error.message);
    setRows((prev) => prev.filter((x) => x.id !== id));
  };

  return (
    <Section title="Análisis y Registro de Gastos">

      {/* FILA 1: Filtros + total / gráfico */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Izquierda */}
        <div className="space-y-6">
          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm p-4">
            <div className="text-sm text-gray-500 mb-2">Filtros de fecha</div>
            <div className="space-y-3">
              <label className="flex flex-col">
                <span className="text-xs text-gray-500">Desde</span>
                <input type="date" className="border rounded-xl px-3 py-2"
                  value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
              </label>

              <label className="flex flex-col">
                <span className="text-xs text-gray-500">Hasta</span>
                <input type="date" className="border rounded-xl px-3 py-2"
                  value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
              </label>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm p-4">
            <div className="text-sm text-gray-500">Total gastado (rango)</div>
            <div className="text-3xl font-bold mt-1 text-red-600">{currency(total)}</div>
            <div className="text-xs text-gray-500 mt-1">{rows.length} registro(s) encontrados</div>
          </div>
        </div>

        {/* Derecha: gráfico */}
        <div className="md:col-span-2">
          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm p-4">
            <h3 className="font-semibold mb-2">Gasto por categoría</h3>

            {loading ? (
              <div className="h-72 grid place-content-center text-gray-500">Cargando…</div>
            ) : chartData.length === 0 ? (
              <div className="h-72 grid place-content-center text-gray-500">No hay datos para mostrar.</div>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie data={chartData} dataKey="value" nameKey="name"
                    cx="50%" cy="50%" outerRadius={110} labelLine={false}>
                    {chartData.map((entry, i) => (
                      <Cell key={i} fill={categoryColor(entry.name)} />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                  <Legend
                    layout="horizontal"
                    verticalAlign="bottom"
                    wrapperStyle={{ fontSize: 12 }}
                    formatter={(value, entry) => {
                      const percent = entry?.payload?.percent ?? 0;
                      return `${value} (${percent.toFixed(1)}%)`;
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      {/* FILA 2: Registrar */}
      <div className="mt-6">
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm p-4">
          <h3 className="font-semibold mb-3 text-lg">Registrar nuevo gasto</h3>

          <div className="grid md:grid-cols-5 gap-3">
            <label className="flex flex-col">
              <span className="text-xs text-gray-500">Fecha</span>
              <input type="date"
                className="border rounded-xl px-3 py-2"
                value={form.date}
                onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} />
            </label>

            <label className="flex flex-col md:col-span-2">
              <span className="text-xs text-gray-500">Categoría</span>
              <select className="border rounded-xl px-3 py-2"
                value={form.category}
                onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}>
                <option value="" disabled>Selecciona una categoría</option>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </label>

            <label className="flex flex-col">
              <span className="text-xs text-gray-500">Monto (S/)</span>
              <input type="number" step="0.01" min="0"
                className="border rounded-xl px-3 py-2"
                value={form.amount}
                onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} />
            </label>

            <label className="flex flex-col">
              <span className="text-xs text-gray-500">Detalle (opcional)</span>
              <input className="border rounded-xl px-3 py-2" placeholder="N° comprobante…"
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
            </label>

            <div className="md:col-span-5">
              <button
                onClick={save}
                disabled={!canSave}
                className="px-4 py-2 rounded-xl bg-gray-900 text-white disabled:opacity-60"
              >
                Registrar gasto
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* FILA 3: Tabla */}
      <div className="mt-6 rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <Table
          columns={[
            { key: "date", label: "Fecha" },
            {
              key: "category",
              label: "Categoría",
              render: (r) => (
                <span
                  className="px-2.5 py-1 rounded-full text-xs font-medium"
                  style={{
                    backgroundColor: `${categoryColor(r.category)}20`,
                    color: categoryColor(r.category),
                  }}
                >
                  {r.category}
                </span>
              ),
            },
            { key: "description", label: "Detalle" },
            {
              key: "amount",
              label: "Monto",
              render: (r) => (
                <div className="text-right font-mono">{currency(r.amount)}</div>
              ),
            },
            {
              key: "acciones",
              label: "",
              render: (r) => (
                <div className="flex gap-2 justify-end">
                  <button
                    onClick={() => remove(r.id)}
                    className="px-2 py-1 rounded-lg border text-red-600 hover:bg-red-50 text-xs"
                  >
                    Eliminar
                  </button>
                </div>
              ),
            },
          ]}
          rows={rows}
          keyField="id"
          loading={loading}
          emptyMessage="Sin gastos en el rango"
        />
      </div>
    </Section>
  );
}
