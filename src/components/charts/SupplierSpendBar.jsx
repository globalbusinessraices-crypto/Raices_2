import React, { useEffect, useMemo, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  LabelList,
} from "recharts";
import supabase from "../../lib/supabaseClient";

const currency = (n) =>
  new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" }).format(Number(n || 0));

const toNum = (v) => {
  if (typeof v === "number") return v;
  if (v == null) return 0;
  const n = Number(String(v).replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
};

// dateTo inclusivo
const nextDay = (iso) => {
  const d = new Date(iso);
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
};

export default function SupplierSpendBar({ dateFrom, dateTo }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("purchases")
        .select(`
          id,
          supplier_id,
          total,
          invoice_no,
          issued_at,
          supplier:suppliers(id, name)
        `)
        .gte("issued_at", dateFrom)
        .lt("issued_at", nextDay(dateTo));
      setLoading(false);

      if (error) {
        console.error(error);
        setRows([]);
        return;
      }

      // Agrupar por proveedor
      const bySupplier = new Map();
      for (const r of data || []) {
        const sid = r.supplier_id;
        const name = r.supplier?.name || String(sid);
        if (!bySupplier.has(sid)) {
          bySupplier.set(sid, { supplierId: sid, supplierName: name, total: 0, invoices: [] });
        }
        const bucket = bySupplier.get(sid);
        const t = toNum(r.total);
        bucket.total += t;
        bucket.invoices.push({
          id: r.id,
          no: r.invoice_no || "(sin factura)",
          total: t,
        });
      }

      const formatted = Array.from(bySupplier.values())
        .map((b) => ({
          supplierId: b.supplierId,
          supplierName: b.supplierName,
          total: +b.total.toFixed(2),
          invoices: b.invoices.sort((a, c) => c.total - a.total),
          invoiceCount: b.invoices.length,
          invoiceCountLabel: `${b.invoices.length} factura${b.invoices.length === 1 ? "" : "s"}`,
        }))
        .sort((a, b) => b.total - a.total);

      setRows(formatted);
    })();
  }, [dateFrom, dateTo]);

  const maxY = useMemo(() => {
    const m = rows.reduce((acc, x) => Math.max(acc, x.total), 0);
    const step = 500;
    return Math.ceil(m / step) * step || 1000;
  }, [rows]);

  // ⬇️ NUEVO: totales del rango (suma de todas las barras) y # de facturas
  const grandTotal = useMemo(() => rows.reduce((s, r) => s + toNum(r.total), 0), [rows]);
  const totalInvoices = useMemo(
    () => rows.reduce((s, r) => s + (r.invoiceCount || r.invoices?.length || 0), 0),
    [rows]
  );

  if (loading) {
    return (
      <div className="border rounded-xl p-4 text-sm text-gray-500 bg-white">
        Cargando gráfico…
      </div>
    );
  }

  if (!rows.length) {
    return (
      <div className="border rounded-xl p-4 text-sm text-gray-500 bg-white">
        Sin compras en el rango
      </div>
    );
  }

  return (
    <div className="border rounded-xl p-3 bg-white">
      {/* Encabezado + tarjetas de resumen */}
      <div className="flex items-center justify-between mb-2 gap-3 flex-wrap">
        <div className="text-sm text-gray-500">Gasto por proveedor (rango seleccionado)</div>
        <div className="flex items-center gap-2">
          <div className="bg-gray-100 rounded-xl px-3 py-2">
            <div className="text-xs text-gray-500">Total del rango</div>
            <div className="text-lg font-semibold">{currency(grandTotal)}</div>
          </div>
          <div className="bg-gray-100 rounded-xl px-3 py-2">
            <div className="text-xs text-gray-500"># facturas</div>
            <div className="text-lg font-semibold">{totalInvoices}</div>
          </div>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={320}>
        <BarChart data={rows} margin={{ top: 20, right: 20, left: 10, bottom: 20 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="supplierName" interval={0} angle={0} height={40} tick={{ fontSize: 12 }} />
          <YAxis tickFormatter={(v) => currency(v)} domain={[0, maxY]} width={90} />
          <Tooltip
            formatter={(value) => currency(value)}
            labelFormatter={(label, payload) => {
              const row = payload?.[0]?.payload;
              return row ? `${row.supplierName} — ${row.invoiceCount} factura(s)` : label;
            }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const row = payload[0].payload;
              return (
                <div className="bg-white border rounded-lg shadow p-3 text-sm">
                  <div className="font-medium mb-1">{row.supplierName}</div>
                  <div className="mb-2">
                    <span className="text-gray-500">Total:</span> <b>{currency(row.total)}</b>
                    <span className="text-gray-500"> · {row.invoiceCount} factura(s)</span>
                  </div>
                  <div className="text-xs text-gray-600">
                    {row.invoices.slice(0, 6).map((inv) => (
                      <div key={inv.id} className="flex justify-between gap-3">
                        <span>{inv.no}</span>
                        <span className="font-medium">{currency(inv.total)}</span>
                      </div>
                    ))}
                    {row.invoices.length > 6 && (
                      <div className="mt-1 italic">… y {row.invoices.length - 6} más</div>
                    )}
                  </div>
                </div>
              );
            }}
          />
          <Bar dataKey="total">
            <LabelList dataKey="invoiceCountLabel" position="top" />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
