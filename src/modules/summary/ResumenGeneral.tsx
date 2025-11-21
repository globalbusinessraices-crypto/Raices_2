// src/modules/summary/ResumenGeneral.tsx
import React, { useCallback, useEffect, useMemo, useState } from "react";
import Section from "../../components/Section";
import supabase from "../../lib/supabaseClient";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  PieChart,
  Pie,
  Cell,
} from "recharts";

/* ========= Helpers ========= */

const currency = (n: number | string | null | undefined) =>
  new Intl.NumberFormat("es-PE", {
    style: "currency",
    currency: "PEN",
  }).format(Number(n || 0));

const toNum = (v: any) => {
  if (typeof v === "number") return v;
  if (v == null) return 0;
  const n = Number(String(v).replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
};

const todayISO = () => new Date().toISOString().slice(0, 10);

const addDaysISO = (days: number) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};

const COLORS = ["#0f766e", "#2563eb", "#f97316", "#e11d48", "#7c3aed"];

/* ========= Componente principal ========= */

const ResumenGeneral: React.FC = () => {
  const [fromDate, setFromDate] = useState(addDaysISO(-30));
  const [toDate, setToDate] = useState(todayISO());
  const [loading, setLoading] = useState(false);

  const [salesSummary, setSalesSummary] = useState<{
    total: number;
    byType: { name: string; cantidad: number; total: number }[];
  }>({ total: 0, byType: [] });

  const [purchasesTotal, setPurchasesTotal] = useState(0);
  const [purchasesByDay, setPurchasesByDay] = useState<
    { date: string; total: number }[]
  >([]);

  const [expensesTotal, setExpensesTotal] = useState(0);
  const [expensesByCategory, setExpensesByCategory] = useState<
    { name: string; total: number }[]
  >([]);

  const loadData = useCallback(async () => {
    setLoading(true);

    try {
      /* ===== Ventas ===== */
      const { data: sales, error: salesErr } = await supabase
        .from("sales")
        .select("total, doc_type, date")
        .gte("date", fromDate)
        .lte("date", toDate);

      if (salesErr) throw salesErr;

      const aggSales: Record<string, { count: number; total: number }> = {
        boleta: { count: 0, total: 0 },
        factura: { count: 0, total: 0 },
      };
      let salesTotal = 0;

      (sales || []).forEach((s: any) => {
        const t = String(s.doc_type || "boleta").toLowerCase();
        const key = t === "factura" ? "factura" : "boleta";
        const amt = toNum(s.total);

        salesTotal += amt;
        aggSales[key].count += 1;
        aggSales[key].total += amt;
      });

      setSalesSummary({
        total: salesTotal,
        byType: [
          { name: "Boleta", cantidad: aggSales.boleta.count, total: aggSales.boleta.total },
          { name: "Factura", cantidad: aggSales.factura.count, total: aggSales.factura.total },
        ],
      });

      /* ===== Compras ===== */
      const { data: purchases, error: purErr } = await supabase
        .from("purchases")
        .select("total, issued_at")
        .gte("issued_at", fromDate)
        .lte("issued_at", toDate);

      if (purErr) throw purErr;

      let pTotal = 0;
      const byDay: Record<string, number> = {};

      (purchases || []).forEach((p: any) => {
        const d = (p.issued_at || "").slice(0, 10);
        const amt = toNum(p.total);
        pTotal += amt;
        byDay[d] = (byDay[d] || 0) + amt;
      });

      const purchasesChart = Object.entries(byDay)
        .sort(([a], [b]) => (a < b ? -1 : 1))
        .map(([date, total]) => ({ date, total: total as number }));

      setPurchasesTotal(pTotal);
      setPurchasesByDay(purchasesChart);

      /* ===== Gastos ===== */
      const { data: expenses, error: expErr } = await supabase
        .from("expenses")
        .select("amount, category, date")
        .gte("date", fromDate)
        .lte("date", toDate);

      if (expErr) throw expErr;

      let eTotal = 0;
      const byCat: Record<string, number> = {};

      (expenses || []).forEach((e: any) => {
        const cat = (e.category || "Sin categoría") as string;
        const amt = toNum(e.amount);
        eTotal += amt;
        byCat[cat] = (byCat[cat] || 0) + amt;
      });

      setExpensesTotal(eTotal);
      setExpensesByCategory(
        Object.entries(byCat).map(([name, total]) => ({
          name,
          total: total as number,
        }))
      );
    } catch (err: any) {
      alert("No se pudo cargar el resumen general: " + err.message);
    } finally {
      setLoading(false);
    }
  }, [fromDate, toDate]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const netResult = useMemo(
    () => salesSummary.total - purchasesTotal - expensesTotal,
    [salesSummary.total, purchasesTotal, expensesTotal]
  );

  /* ========= Render ========= */

  return (
    <Section title="Resumen general" right={null}>
      <p className="text-sm text-gray-500 mb-4">
        Vista rápida de ventas, compras y gastos.
      </p>

      {/* Filtros */}
      <div className="mb-4 flex flex-wrap gap-3 items-end">
        <div className="flex flex-col">
          <span className="text-xs text-gray-500 mb-1">Desde</span>
          <input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="border rounded-lg px-3 py-1.5 text-sm"
          />
        </div>

        <div className="flex flex-col">
          <span className="text-xs text-gray-500 mb-1">Hasta</span>
          <input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className="border rounded-lg px-3 py-1.5 text-sm"
          />
        </div>

        <button
          onClick={loadData}
          disabled={loading}
          className="ml-auto rounded-lg bg-emerald-600 text-white px-4 py-2 text-sm disabled:opacity-60"
        >
          {loading ? "Actualizando…" : "Actualizar"}
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-6">
        <KpiCard label="Ventas" value={currency(salesSummary.total)} badge="Bruto" />
        <KpiCard label="Compras" value={currency(purchasesTotal)} badge="Proveedores" />
        <KpiCard label="Gastos" value={currency(expensesTotal)} badge="Operativos" />
        <KpiCard
          label="Resultado"
          value={currency(netResult)}
          badge="Ventas - Compras - Gastos"
          highlight
        />
      </div>

      {/* Gráficos */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Ventas */}
        <div className="rounded-2xl border bg-white p-4 shadow-sm">
          <h3 className="text-sm font-semibold mb-1">Ventas por tipo</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={salesSummary.byType}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" />
                <YAxis tickFormatter={(v) => currency(Number(v)).replace("S/ ", "")} />
                <Tooltip formatter={(v: any) => currency(Number(v))} />
                <Legend />
                <Bar dataKey="total" name="Total vendido" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Compras */}
        <div className="rounded-2xl border bg-white p-4 shadow-sm">
          <h3 className="text-sm font-semibold mb-1">Compras por día</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={purchasesByDay}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="date" />
                <YAxis tickFormatter={(v) => currency(Number(v)).replace("S/ ", "")} />
                <Tooltip formatter={(v: any) => currency(Number(v))} />
                <Bar dataKey="total" name="Compras" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Gastos */}
        <div className="rounded-2xl border bg-white p-4 shadow-sm">
          <h3 className="text-sm font-semibold mb-1">Gastos por categoría</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={expensesByCategory}
                  dataKey="total"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={70}
                  label={(e: any) => e.name}
                >
                  {expensesByCategory.map((entry, index) => (
                    <Cell key={entry.name} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: any) => currency(Number(v))} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </Section>
  );
};

export default ResumenGeneral;

/* ========= Subcomponentes ========= */

function KpiCard({
  label,
  value,
  badge,
  highlight,
}: {
  label: string;
  value: string;
  badge?: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border bg-white p-4 shadow-sm ${
        highlight ? "border-emerald-500" : "border-slate-200"
      }`}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-gray-700">{label}</span>
        {badge && (
          <span className="text-[10px] uppercase tracking-wide rounded-full bg-slate-100 px-2 py-0.5 text-slate-600">
            {badge}
          </span>
        )}
      </div>
      <div className="text-xl font-semibold text-gray-900">{value}</div>
    </div>
  );
}
