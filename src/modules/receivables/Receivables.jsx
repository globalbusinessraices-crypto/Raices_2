// src/modules/receivables/Receivables.jsx
import React, { useEffect, useMemo, useState, useCallback } from "react";
import Section from "../../components/Section";
import Table from "../../components/Table";
import supabase from "../../lib/supabaseClient";

const PEN = (n) =>
  new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" }).format(Number(n || 0));

const toNum = (v) => (Number.isFinite(+v) ? +v : 0);
const todayISO = () => new Date().toISOString().slice(0, 10);
const daysBetween = (a, b) =>
  Math.floor((new Date(a).setHours(0,0,0,0) - new Date(b).setHours(0,0,0,0)) / 86400000);

export default function Receivables() {
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState([]);
  const [q, setQ] = useState("");
  const [paying, setPaying] = useState(null); // sale row to pay
  const [payDate, setPayDate] = useState(todayISO());
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState("efectivo");
  const [payNote, setPayNote] = useState("");

  const load = useCallback(async () => {
    setLoading(true);

    // 1) Ventas pendientes
    const { data: sales, error: sErr } = await supabase
      .from("sales")
      .select("id, client_id, date, due_date, total, doc_type, doc_series_no, payment_status")
      .eq("payment_status", "pendiente")
      .order("due_date", { ascending: true });

    if (sErr) {
      alert("Error cargando ventas: " + sErr.message);
      setLoading(false);
      return;
    }

    const saleIds = sales.map((s) => s.id);
    const clientIds = [...new Set(sales.map((s) => s.client_id).filter(Boolean))];

    // 2) Clientes
    const { data: clients } = await supabase
      .from("clients")
      .select("id, name, ruc, dni, tipo")
      .in("id", clientIds.length ? clientIds : [-1]);

    const cmap = new Map((clients || []).map((c) => [String(c.id), c]));

    // 3) Pagos de esas ventas (para ver saldo)
    const { data: pays } = await supabase
      .from("sale_payments")
      .select("sale_id, amount")
      .in("sale_id", saleIds.length ? saleIds : [-1]);

    const paidMap = new Map();
    (pays || []).forEach((p) => {
      const k = String(p.sale_id);
      paidMap.set(k, toNum(paidMap.get(k) || 0) + toNum(p.amount));
    });

    // 4) Armar filas
    const rows = (sales || []).map((s) => {
      const client = cmap.get(String(s.client_id));
      const totalPaid = toNum(paidMap.get(String(s.id)) || 0);
      const balance = Math.max(0, toNum(s.total) - totalPaid);
      const overdueDays =
        s.due_date ? Math.max(0, -daysBetween(s.due_date, todayISO())) : 0;
      return {
        id: s.id,
        client,
        doc: `${(s.doc_type || "").toUpperCase()} ${s.doc_series_no || ""}`.trim(),
        date: s.date,
        due_date: s.due_date,
        overdueDays,
        total: toNum(s.total),
        totalPaid,
        balance,
      };
    });

    setRows(rows);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter((r) =>
      [
        r.client?.name,
        r.client?.ruc,
        r.client?.dni,
        r.doc,
        r.date,
        r.due_date,
      ]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(term))
    );
  }, [q, rows]);

  const openPay = (row) => {
    setPaying(row);
    const defaultAmount = row.balance;
    setPayAmount(String(defaultAmount));
    setPayDate(todayISO());
    setPayMethod("efectivo");
    setPayNote("");
  };

  const submitPayment = async () => {
    if (!paying) return;
    const amount = toNum(payAmount);
    if (amount <= 0) return alert("Monto inválido");
    if (amount > paying.balance) return alert("El monto excede el saldo.");

    setLoading(true);

    // 1) Registrar pago
    const { error: pErr } = await supabase.from("sale_payments").insert([
      {
        sale_id: paying.id,
        date: payDate,
        amount,
        method: payMethod,
        note: payNote || null,
      },
    ]);
    if (pErr) {
      alert("No se pudo registrar el pago: " + pErr.message);
      setLoading(false);
      return;
    }

    // 2) Recalcular saldo de esa venta
    const { data: pays2 } = await supabase
      .from("sale_payments")
      .select("amount")
      .eq("sale_id", paying.id);
    const paidSum = (pays2 || []).reduce((a, x) => a + toNum(x.amount), 0);
    const remaining = Math.max(0, toNum(paying.total) - paidSum);

    // 3) Si queda en 0 => marcar como pagado
    if (remaining <= 0.009) {
      await supabase
        .from("sales")
        .update({ payment_status: "pagado", paid_at: payDate })
        .eq("id", paying.id);

      // (Opcional) Si tu política es descontar stock al pagar y la venta tiene ítems:
      // const { data: items } = await supabase
      //   .from("sale_items")
      //   .select("product_id, qty")
      //   .eq("sale_id", paying.id);
      // const mv = (items || []).map(it => ({
      //   product_id: it.product_id,
      //   date: payDate,
      //   type: "OUT",
      //   qty: toNum(it.qty),
      //   note: `Salida por pago venta ${paying.doc}`,
      //   ref_type: "sale",
      //   ref_id: paying.id,
      // }));
      // if (mv.length) await supabase.from("inventory_movements").insert(mv);
    }

    setPaying(null);
    setLoading(false);
    load();
  };

  return (
    <Section title="Cobros (Cuentas por cobrar)">
      <div className="flex items-center gap-2 mb-3">
        <input
          className="border rounded-xl px-3 py-2 w-full md:w-80"
          placeholder="Buscar por cliente, RUC/DNI, doc…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <button onClick={load} className="px-3 py-2 rounded-xl border">
          Recargar
        </button>
      </div>

      <Table
        columns={[
          {
            key: "client",
            label: "Cliente",
            render: (r) => (
              <div className="min-w-0">
                <div className="font-medium truncate">{r.client?.name || "—"}</div>
                <div className="text-xs text-gray-500">
                  {r.client?.ruc || r.client?.dni || "—"}
                </div>
              </div>
            ),
          },
          { key: "doc", label: "Doc." },
          { key: "date", label: "Emisión" },
          {
            key: "due_date",
            label: "Vence",
            render: (r) => (
              <span className={r.overdueDays > 0 ? "text-red-600 font-medium" : ""}>
                {r.due_date || "—"}
              </span>
            ),
          },
          {
            key: "overdueDays",
            label: "Atraso",
            render: (r) => (r.overdueDays > 0 ? `${r.overdueDays} d` : "—"),
          },
          { key: "total", label: "Total", render: (r) => PEN(r.total) },
          {
            key: "balance",
            label: "Saldo",
            render: (r) => (
              <span className={r.balance > 0 ? "text-amber-700 font-medium" : "text-green-700"}>
                {PEN(r.balance)}
              </span>
            ),
          },
          {
            key: "acciones",
            label: "Acciones",
            render: (r) => (
              <div className="flex gap-2">
                <button
                  onClick={() => openPay(r)}
                  className="px-2 py-1 rounded-lg bg-emerald-600 text-white disabled:opacity-60"
                  disabled={r.balance <= 0}
                >
                  Registrar pago
                </button>
              </div>
            ),
          },
        ]}
        rows={filtered}
        keyField="id"
        loading={loading}
        emptyMessage="No hay ventas pendientes"
      />

      {/* Modal pago simple */}
      {paying && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-4 w-full max-w-md">
            <h3 className="text-lg font-semibold mb-3">
              Registrar pago – {paying.client?.name}
            </h3>
            <div className="space-y-3">
              <div className="text-sm">
                <div>Documento: <strong>{paying.doc}</strong></div>
                <div>Total: <strong>{PEN(paying.total)}</strong></div>
                <div>Saldo: <strong>{PEN(paying.balance)}</strong></div>
              </div>

              <label className="flex flex-col">
                <span className="text-xs text-gray-500">Fecha de pago</span>
                <input
                  type="date"
                  className="border rounded-xl px-3 py-2"
                  value={payDate}
                  onChange={(e) => setPayDate(e.target.value)}
                />
              </label>

              <label className="flex flex-col">
                <span className="text-xs text-gray-500">Monto</span>
                <input
                  type="number"
                  step="0.01"
                  className="border rounded-xl px-3 py-2"
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                />
              </label>

              <label className="flex flex-col">
                <span className="text-xs text-gray-500">Método</span>
                <select
                  className="border rounded-xl px-3 py-2"
                  value={payMethod}
                  onChange={(e) => setPayMethod(e.target.value)}
                >
                  <option>efectivo</option>
                  <option>transferencia</option>
                  <option>yape/plin</option>
                  <option>otros</option>
                </select>
              </label>

              <label className="flex flex-col">
                <span className="text-xs text-gray-500">Nota (opcional)</span>
                <input
                  className="border rounded-xl px-3 py-2"
                  value={payNote}
                  onChange={(e) => setPayNote(e.target.value)}
                />
              </label>

              <div className="flex justify-end gap-2 pt-2">
                <button className="px-3 py-2 rounded-xl border" onClick={() => setPaying(null)}>
                  Cancelar
                </button>
                <button
                  className="px-3 py-2 rounded-xl bg-emerald-600 text-white"
                  onClick={submitPayment}
                >
                  Guardar pago
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </Section>
  );
}
