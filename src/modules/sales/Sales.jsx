import React, { useMemo, useState, useCallback, useEffect } from "react";
import Section from "../../components/Section";
import Table from "../../components/Table";
import supabase from "../../lib/supabaseClient";
import AsyncCombobox from "../../components/inputs/AsyncCombobox";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

const currency = (n) =>
  new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" }).format(Number(n || 0));

const toNum = (v) => {
  if (typeof v === "number") return v;
  if (v == null) return 0;
  const n = Number(String(v).replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
};

// Precio base mostrado/usado en ventas (ya incluye IGV)
const basePriceOf = (product) => {
  const list = toNum(product.listPrice ?? product.list_price);
  const margin = toNum(product.marginPct ?? product.margin_pct);
  const last = toNum(product.lastCost ?? product.last_cost);

  if (list > 0) return list;
  if (margin === 0 && last > 0) return last;
  if (list === 0 && margin > 0 && last > 0) return +(last * (1 + margin / 100)).toFixed(2);
  return 0;
};

const isRUC = (v) => !!(v && /^\d{11}$/.test(String(v).trim()));
const docIdOf = (c) => c?.ruc || c?.dni || "";
const todayISO = () => new Date().toISOString().slice(0, 10);
const addDaysISO = (days) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};

// === Helper: crear contratos de servicio desde una venta pagada ===
async function createServiceContracts({ supabase, clientId, saleId, items, startDate }) {
  const rows = [];
  const start = startDate || new Date().toISOString().slice(0, 10);

  const toN = (v) => (Number.isFinite(+v) ? +v : 0);

  for (const it of items) {
    const p = it.product;
    const isAnnual = p?.serviceIsAnnual ?? p?.service_is_annual;
    if (!isAnnual) continue;

    const months = Number(p?.serviceIntervalMonths ?? p?.service_interval_months ?? 12);
    const qty = Math.max(1, Math.floor(toN(it.qty)));

    const d = new Date(start);
    d.setMonth(d.getMonth() + months);
    const nextISO = d.toISOString().slice(0, 10);

    for (let k = 1; k <= qty; k++) {
      rows.push({
        client_id: clientId,
        product_id: p.id,
        sale_id: saleId,
        unit_index: k,
        start_date: start,
        next_service_date: nextISO,
        interval_months: months,
        status: "activo",
        notes: `Auto generado desde venta ${saleId}`,
      });
    }
  }

  if (rows.length) {
    const { error } = await supabase.from("service_contracts").insert(rows);
    if (error) console.error("createServiceContracts error:", error);
  }
}

// Tooltip personalizado para el gráfico de resumen
const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white p-2 border rounded-lg shadow-lg text-sm">
        <p className="font-bold">{label}</p>
        <p className="text-gray-600">Comprobantes: {payload[0].payload.cantidad}</p>
        <p className="text-gray-600">Total vendido: {currency(payload[0].payload.total)}</p>
      </div>
    );
  }
  return null;
};

export default function Sales({
  clients: externalClients,
  products = [],
  suppliers = [],
  inventory, // puede venir vacío
}) {
  // =========================
  //  RESUMEN DE VENTAS
  // =========================
  const [summaryFromDate, setSummaryFromDate] = useState(addDaysISO(-30));
  const [summaryToDate, setSummaryToDate] = useState(todayISO());
  const [summaryData, setSummaryData] = useState({ total: 0, byType: [] });
  const [loadingSummary, setLoadingSummary] = useState(false);

  const loadSummary = useCallback(async () => {
    setLoadingSummary(true);
    const { data, error } = await supabase
      .from("sales")
      .select("total, doc_type")
      .gte("date", summaryFromDate)
      .lte("date", summaryToDate);

    if (error) {
      console.error("loadSummary error:", error);
      alert("Error al cargar el resumen: " + error.message);
      setLoadingSummary(false);
      return;
    }

    const agg = {
      boleta: { count: 0, total: 0 },
      factura: { count: 0, total: 0 },
    };
    let grandTotal = 0;

    for (const sale of data || []) {
      grandTotal += toNum(sale.total);
      const type = String(sale.doc_type || "boleta").toLowerCase();
      if (agg[type]) {
        agg[type].count += 1;
        agg[type].total += toNum(sale.total);
      }
    }

    const chartData = [
      { name: "Boleta", cantidad: agg.boleta.count, total: agg.boleta.total },
      { name: "Factura", cantidad: agg.factura.count, total: agg.factura.total },
    ];

    setSummaryData({ total: grandTotal, byType: chartData });
    setLoadingSummary(false);
  }, [summaryFromDate, summaryToDate]);

  useEffect(() => {
    loadSummary();
  }, [loadSummary]);

  // =========================
  //  CLIENTE
  // =========================
  const [client, setClient] = useState(null);

  // Comprobante (Factura/Boleta)
  const [docType, setDocType] = useState("boleta");
  const [docNumber, setDocNumber] = useState("");

  // Fechas para distribuidor
  const [issueDate, setIssueDate] = useState(todayISO());
  const [dueDate, setDueDate] = useState(addDaysISO(15));
  const [paidNow, setPaidNow] = useState(false);

  const isDistrib = (client?.tipo || "").toLowerCase() === "distribuidor";

  useEffect(() => {
    const hasRuc = isRUC(client?.ruc);
    setDocType(hasRuc ? "factura" : "boleta");
    setIssueDate(todayISO());
    setDueDate(addDaysISO(15));
    setPaidNow(false);
  }, [client]);

  const fetchClients = useCallback(
    async (q) => {
      const query = (q || "").trim();

      if (externalClients && externalClients.length) {
        const src = externalClients;
        if (!query) return src.slice(0, 20);
        const ql = query.toLowerCase();
        return src
          .filter(
            (c) =>
              c.name?.toLowerCase().includes(ql) ||
              String(c.dni || "").includes(query) ||
              String(c.ruc || "").includes(query)
          )
          .slice(0, 20);
      }

      let req = supabase
        .from("clients")
        .select("id, name, tipo, telefono, email, dni, ruc")
        .order("name", { ascending: true })
        .limit(20);

      if (query) {
        req = req.or(`name.ilike.%${query}%,dni.ilike.%${query}%,ruc.ilike.%${query}%`);
      }

      const { data, error } = await req;
      if (error) {
        console.error("fetchClients error:", error);
        return [];
      }
      return data || [];
    },
    [externalClients]
  );

  // =========================
  //  STOCK (fallback local)
  // =========================
  const [stockMap, setStockMap] = useState({});

  const loadStockFallback = useCallback(async () => {
    if (inventory?.stock) return;
    const { data, error } = await supabase
      .from("inventory_movements")
      .select("product_id, qty, type");
    if (error) {
      console.error("loadStockFallback error:", error);
      return;
    }
    const s = {};
    for (const mv of data || []) {
      const key = String(mv.product_id);
      const sign = String(mv.type).toUpperCase() === "IN" ? 1 : -1;
      s[key] = (s[key] || 0) + sign * toNum(mv.qty);
    }
    setStockMap(s);
  }, [inventory?.stock]);

  useEffect(() => {
    loadStockFallback();
  }, [loadStockFallback]);

  const availableStock = useCallback(
    (pid) => {
      const k = String(pid);
      if (inventory?.stock) {
        return toNum(inventory.stock[k] ?? inventory.stock[pid] ?? 0);
      }
      return toNum(stockMap[k] ?? 0);
    },
    [inventory?.stock, stockMap]
  );

  // =========================
  //  ÍTEMS / PRODUCTO
  // =========================
  const [items, setItems] = useState([]); // {id, product, qty, unitPrice, discountPct}

  const addItem = () => {
    if (!client) return alert("Selecciona un cliente.");
    setItems((prev) => [
      ...prev,
      { id: crypto.randomUUID(), product: null, qty: 1, unitPrice: 0, discountPct: 0 },
    ]);
  };

  const removeItem = (rowId) => {
    setItems((prev) => prev.filter((x) => x.id !== rowId));
  };

  const fetchProducts = useCallback(
    async (q) => {
      const query = (q || "").trim().toLowerCase();
      const src = products || [];
      if (!query) return src.slice(0, 25);
      return src
        .filter(
          (p) =>
            p.name?.toLowerCase().includes(query) ||
            String(p.sku || "").toLowerCase().includes(query)
        )
        .slice(0, 25);
    },
    [products]
  );

  const supplierNameOf = useCallback(
    (p) => {
      if (!p) return "—";
      const sid = p.supplierId ?? p.supplier_id;
      return suppliers.find((s) => String(s.id) === String(sid))?.name || sid || "—";
    },
    [suppliers]
  );

  // Totales (precios ya incluyen IGV)
  const totals = useMemo(() => {
    const total = items.reduce((acc, it) => {
      const qty = toNum(it.qty);
      const price = toNum(it.unitPrice);
      const d = Math.min(Math.max(toNum(it.discountPct), 0), 100);
      return acc + qty * price * (1 - d / 100);
    }, 0);
    return { total };
  }, [items]);

  // =========================
  //  HISTORIAL DE VENTAS
  // =========================
  const [history, setHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [histQuery, setHistQuery] = useState("");
  const [histOnlyPending, setHistOnlyPending] = useState(false);

  const loadHistory = useCallback(async () => {
    setLoadingHistory(true);

    const { data: salesData, error } = await supabase
      .from("sales")
      .select("id, client_id, date, due_date, total, payment_status, doc_type, doc_series_no, doc_number")
      .order("date", { ascending: false })
      .order("id", { ascending: false })
      .limit(50);

    if (error) {
      console.error("loadHistory error:", error);
      setLoadingHistory(false);
      return;
    }

    const ids = [...new Set((salesData || []).map((s) => s.client_id).filter(Boolean))];
    let names = {};
    if (ids.length) {
      const { data: cdata } = await supabase.from("clients").select("id, name").in("id", ids);
      (cdata || []).forEach((c) => (names[c.id] = c.name));
    }

    const rows = (salesData || []).map((s) => ({
      id: s.id,
      date: s.date,
      due_date: s.due_date,
      clientName: names[s.client_id] || s.client_id,
      doc:
        (s.doc_type ? `${String(s.doc_type).toUpperCase()} ` : "") +
        (s.doc_series_no || s.doc_number || "—"),
      total: Number(s.total || 0),
      status: s.payment_status || "—",
    }));

    setHistory(rows);
    setLoadingHistory(false);
  }, []);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const filteredHistory = useMemo(() => {
    const q = histQuery.trim().toLowerCase();
    return history
      .filter((r) => (histOnlyPending ? r.status === "pendiente" : true))
      .filter((r) => {
        if (!q) return true;
        return (
          String(r.clientName || "").toLowerCase().includes(q) ||
          String(r.doc || "").toLowerCase().includes(q)
        );
      });
  }, [history, histQuery, histOnlyPending]);

  // =========================
  //  DETALLE (drawer)
  // =========================
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailHeader, setDetailHeader] = useState(null);
  const [detailItems, setDetailItems] = useState([]);

  const openDetail = useCallback(
    async (saleId) => {
      setDetailOpen(true);
      setDetailLoading(true);
      setDetailHeader(null);
      setDetailItems([]);

      // Cabecera
      const { data: sale, error: sErr } = await supabase
        .from("sales")
        .select("id, date, due_date, total, payment_status, doc_type, doc_series_no, doc_number, client_id")
        .eq("id", saleId)
        .single();

      if (sErr) {
        setDetailLoading(false);
        alert("No se pudo cargar el detalle: " + sErr.message);
        return;
      }

      // Cliente
      let clientName = sale.client_id;
      if (sale.client_id) {
        const { data: c } = await supabase.from("clients").select("name").eq("id", sale.client_id).single();
        clientName = c?.name || clientName;
      }

      setDetailHeader({
        id: sale.id,
        date: sale.date,
        due_date: sale.due_date,
        total: toNum(sale.total),
        status: sale.payment_status || "—",
        doc:
          (sale.doc_type ? `${String(sale.doc_type).toUpperCase()} ` : "") +
          (sale.doc_series_no || sale.doc_number || "—"),
        clientName,
      });

      // Ítems + productos
      const { data: items, error: iErr } = await supabase
        .from("sale_items")
        .select(`
          id, qty, unit_price, discount_pct,
          product:products(id, sku, name, unit)
        `)
        .eq("sale_id", saleId);

      if (iErr) {
        setDetailLoading(false);
        alert("No se pudieron cargar los ítems: " + iErr.message);
        return;
      }

      setDetailItems(
        (items || []).map((it) => {
          const d = Math.min(Math.max(toNum(it.discount_pct), 0), 100);
          const line = toNum(it.qty) * toNum(it.unit_price) * (1 - d / 100);
          return {
            id: it.id,
            sku: it.product?.sku || "",
            name: it.product?.name || "",
            unit: it.product?.unit || "und",
            qty: toNum(it.qty),
            unit_price: toNum(it.unit_price),
            discount_pct: toNum(it.discount_pct),
            total: line,
          };
        })
      );

      setDetailLoading(false);
    },
    []
  );

  const closeDetail = () => setDetailOpen(false);

  // =========================
  //  CONFIRMAR VENTA
  // =========================
  const confirm = async () => {
    if (!client) return alert("Selecciona un cliente.");
    if (items.length === 0) return alert("Agrega al menos un ítem.");

    const hasRuc = isRUC(client?.ruc);
    if (docType === "factura" && !hasRuc) {
      alert("Para emitir FACTURA el cliente debe tener RUC válido (11 dígitos).");
      return;
    }

    const willDownloadStock = !isDistrib || (isDistrib && paidNow);
    if (willDownloadStock) {
      for (const it of items) {
        if (!it.product) return alert("Hay ítems sin producto seleccionado.");
        const pid = it.product.id;
        const onHand = availableStock(pid);
        if (onHand < toNum(it.qty)) {
          alert(
            `Stock insuficiente para ${it.product.sku} – ${it.product.name}. Disponible: ${onHand}`
          );
          return;
        }
      }
    } else {
      for (const it of items) if (!it.product) return alert("Hay ítems sin producto seleccionado.");
    }

    const total = +items
      .reduce((a, it) => {
        const d = Math.min(Math.max(toNum(it.discountPct), 0), 100);
        return a + toNum(it.qty) * toNum(it.unitPrice) * (1 - d / 100);
      }, 0)
      .toFixed(2);

    const salePayload = {
      client_id: client?.id ?? null,
      date: isDistrib ? issueDate : todayISO(),
      subtotal: total,
      igv: 0,
      total,
      payment_status: willDownloadStock ? "pagado" : "pendiente",
      ...(isDistrib ? { due_date: dueDate } : {}),
      ...(willDownloadStock ? { paid_at: todayISO() } : {}),
      doc_type: docType,
      doc_series_no: docNumber || null,
    };

    const { data: sale, error: sErr } = await supabase
      .from("sales")
      .insert([salePayload])
      .select("id")
      .single();

    if (sErr) {
      alert("No se pudo registrar la venta: " + sErr.message);
      return;
    }

    const itemsPayload = items.map((it) => ({
      sale_id: sale.id,
      product_id: it.product.id,
      qty: toNum(it.qty),
      unit_price: toNum(it.unitPrice),
      discount_pct: toNum(it.discountPct),
    }));
    const { error: iErr } = await supabase.from("sale_items").insert(itemsPayload);
    if (iErr) {
      await supabase.from("sales").delete().eq("id", sale.id);
      alert("No se pudieron registrar los ítems: " + iErr.message);
      return;
    }

    if (willDownloadStock) {
      await createServiceContracts({
        supabase,
        clientId: client.id,
        saleId: sale.id,
        items,
        startDate: isDistrib ? issueDate : todayISO(),
      });
    }

    if (willDownloadStock) {
      const movesPayload = items.map((it) => ({
        product_id: it.product.id,
        date: todayISO(),
        type: "OUT",
        qty: toNum(it.qty),
        note: `Venta (${docType.toUpperCase()}) ${docNumber || ""}`.trim(),
        ref_type: "sale",
        ref_id: sale.id,
        module: "sale",
      }));

      const { error: mErr } = await supabase.from("inventory_movements").insert(movesPayload);
      if (mErr) {
        alert(
          "Venta registrada pero no se pudieron guardar los movimientos de inventario: " +
            mErr.message
        );
      }

      setStockMap((prev) => {
        const next = { ...prev };
        for (const it of items) {
          const k = String(it.product.id);
          next[k] = toNum(next[k] || 0) - toNum(it.qty);
        }
        return next;
      });
    }

    setItems([]);
    setDocNumber("");
    setPaidNow(false);
    setIssueDate(todayISO());
    setDueDate(addDaysISO(15));

    loadHistory();
    loadSummary();

    if (isDistrib && !willDownloadStock) {
      alert("Venta a crédito registrada como PENDIENTE. Se descargará stock cuando la marques PAGADA.");
    } else {
      alert("Venta registrada y stock actualizado.");
    }
  };

  return (
    <>
      {/* =========================
          RESUMEN DE VENTAS
         ========================= */}
      <Section title="Resumen de Ventas">
        <div className="grid md:grid-cols-3 gap-4">
          {/* Filtros y Tarjeta */}
          <div className="md:col-span-1 space-y-3">
            <div className="flex items-center gap-2">
              <label className="flex flex-col grow">
                <span className="text-xs text-gray-500">Desde</span>
                <input
                  type="date"
                  value={summaryFromDate}
                  onChange={(e) => setSummaryFromDate(e.target.value)}
                  className="border rounded-xl px-3 py-2"
                />
              </label>
              <label className="flex flex-col grow">
                <span className="text-xs text-gray-500">Hasta</span>
                <input
                  type="date"
                  value={summaryToDate}
                  onChange={(e) => setSummaryToDate(e.target.value)}
                  className="border rounded-xl px-3 py-2"
                />
              </label>
            </div>
            <button
              onClick={loadSummary}
              className="w-full px-3 py-2 rounded-xl border"
              disabled={loadingSummary}
            >
              {loadingSummary ? "Cargando..." : "Recargar"}
            </button>

            <div className="bg-gray-900 text-white p-4 rounded-xl">
              <div className="text-sm text-gray-300">Total vendido en el rango</div>
              <div className="text-3xl font-bold mt-1">
                {loadingSummary ? "..." : currency(summaryData.total)}
              </div>
            </div>
          </div>

          {/* Gráfico */}
          <div className="md:col-span-2 bg-gray-50 p-4 rounded-xl min-h-[250px] flex items-center justify-center">
            {loadingSummary ? (
              "Cargando gráfico..."
            ) : (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart
                  data={summaryData.byType}
                  margin={{ top: 5, right: 20, left: -10, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(230,230,230,0.5)" }} />
                  <Legend />
                  <Bar dataKey="cantidad" fill="#1f2937" name="Cantidad" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </Section>

      {/* =========================
          REGISTRO DE VENTA
         ========================= */}
      <Section title="Ventas (precio y descuento editables)">
        {/* CABECERA: Cliente + Comprobante + agregar */}
        <div className="grid md:grid-cols-4 gap-3 mb-4 items-end">
          <div className="md:col-span-2">
            <span className="text-xs text-gray-500 block mb-1">Cliente</span>
            <AsyncCombobox
              value={client}
              onChange={setClient}
              fetcher={fetchClients}
              displayValue={(c) => c?.name || ""}
              placeholder="Busca cliente por nombre, DNI o RUC"
              renderOption={(c) => (
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{c.name}</div>
                    <div className="text-xs text-gray-500 truncate">
                      {docIdOf(c) || "—"} · {c.telefono || "s/teléfono"} · {c.tipo || "normal"}
                    </div>
                  </div>
                </div>
              )}
            />
          </div>

          <label className="flex flex-col">
            <span className="text-xs text-gray-500">Comprobante</span>
            <select
              value={docType}
              onChange={(e) => {
                const v = e.target.value;
                const hasRuc = isRUC(client?.ruc);
                if (v === "factura" && !hasRuc) {
                  alert("Para FACTURA el cliente debe tener RUC. Se mantendrá en Boleta.");
                  return;
                }
                setDocType(v);
              }}
              className="border rounded-xl px-3 py-2"
            >
              <option value="boleta">Boleta</option>
              <option value="factura" disabled={!isRUC(client?.ruc)}>
                Factura {isRUC(client?.ruc) ? "" : "(requiere RUC)"}
              </option>
            </select>
          </label>

          <label className="flex flex-col">
            <span className="text-xs text-gray-500">Serie / Nº (opcional)</span>
            <input
              value={docNumber}
              onChange={(e) => setDocNumber(e.target.value)}
              placeholder="Ejm: F001-000123"
              className="border rounded-xl px-3 py-2"
            />
          </label>
        </div>

        {/* Campos de crédito para distribuidor */}
        {isDistrib && (
          <div className="grid md:grid-cols-4 gap-3 mb-2">
            <label className="flex flex-col">
              <span className="text-xs text-gray-500">F. emisión</span>
              <input
                type="date"
                className="border rounded-xl px-3 py-2"
                value={issueDate}
                onChange={(e) => setIssueDate(e.target.value)}
              />
            </label>
            <label className="flex flex-col">
              <span className="text-xs text-gray-500">F. vencimiento</span>
              <input
                type="date"
                className="border rounded-xl px-3 py-2"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </label>
            <label className="flex items-center gap-2 mt-6">
              <input type="checkbox" checked={paidNow} onChange={(e) => setPaidNow(e.target.checked)} />
              <span className="text-sm">Pago recibido ahora</span>
            </label>
            <div className="text-xs text-gray-500 mt-6">
              Si NO marcas “Pago recibido ahora”, la venta queda <b>pendiente</b> y no descarga stock.
            </div>
          </div>
        )}

        <div className="flex items-end mb-4">
          <button
            onClick={addItem}
            className="px-3 py-2 rounded-xl bg-gray-900 text-white w-full md:w-auto disabled:opacity-60"
            disabled={!client}
          >
            Agregar ítem
          </button>
        </div>

        {/* ÍTEMS */}
        <Table
          columns={[
            {
              key: "product",
              label: "Producto",
              render: (r) => (
                <AsyncCombobox
                  value={r.product}
                  onChange={(p) => {
                    if (!p) {
                      setItems((prev) =>
                        prev.map((x) =>
                          x.id === r.id ? { ...x, product: null, unitPrice: 0, discountPct: 0 } : x
                        )
                      );
                      return;
                    }
                    const price = basePriceOf(p);
                    setItems((prev) =>
                      prev.map((x) =>
                        x.id === r.id ? { ...x, product: p, unitPrice: price } : x
                      )
                    );
                  }}
                  fetcher={fetchProducts}
                  displayValue={(p) => (p ? `${p.sku} – ${p.name}` : "")}
                  placeholder="Busca producto por nombre o SKU"
                  renderOption={(p) => {
                    const onHand = availableStock(p.id);
                    return (
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate">
                            {p.sku} – {p.name}
                          </div>
                          <div className="text-xs text-gray-500 truncate">
                            Prov. {supplierNameOf(p)} · {p.unit || "und"} · Stock: {onHand}
                          </div>
                        </div>
                        <div className="text-sm font-medium shrink-0">{currency(basePriceOf(p))}</div>
                      </div>
                    );
                  }}
                />
              ),
            },
            {
              key: "qty",
              label: "Cant.",
              render: (r) => (
                <input
                  type="number"
                  min={1}
                  value={r.qty}
                  onChange={(e) =>
                    setItems((prev) =>
                      prev.map((x) => (x.id === r.id ? { ...x, qty: toNum(e.target.value) } : x))
                    )
                  }
                  className="border rounded-lg px-2 py-1 w-24"
                />
              ),
            },
            {
              key: "unitPrice",
              label: "Precio Unit.",
              render: (r) => (
                <input
                  type="number"
                  step="0.01"
                  value={r.unitPrice}
                  onChange={(e) =>
                    setItems((prev) =>
                      prev.map((x) =>
                        x.id === r.id ? { ...x, unitPrice: toNum(e.target.value) } : x
                      )
                    )
                  }
                  className="border rounded-lg px-2 py-1 w-28"
                />
              ),
            },
            {
              key: "discountPct",
              label: "% Desc.",
              render: (r) => (
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={r.discountPct}
                  onChange={(e) =>
                    setItems((prev) =>
                      prev.map((x) =>
                        x.id === r.id ? { ...x, discountPct: toNum(e.target.value) } : x
                      )
                    )
                  }
                  className="border rounded-lg px-2 py-1 w-20"
                />
              ),
            },
            {
              key: "line",
              label: "Importe",
              render: (r) => {
                const d = Math.min(Math.max(toNum(r.discountPct), 0), 100);
                const line = toNum(r.qty) * toNum(r.unitPrice) * (1 - d / 100);
                return currency(line);
              },
            },
            {
              key: "rm",
              label: "",
              render: (r) => (
                <button onClick={() => removeItem(r.id)} className="px-2 py-1 rounded-lg border text-red-600">
                  Quitar
                </button>
              ),
            },
          ]}
          rows={items}
          keyField="id"
          emptyMessage="Sin ítems"
        />

        {/* TOTALES */}
        <div className="flex justify-end mt-4 text-sm">
          <div className="bg-gray-50 rounded-xl p-4 w-full md:w-96">
            <div className="flex justify-between">
              <span>Comprobante</span>
              <strong className="uppercase">
                {docType} {docNumber ? `· ${docNumber}` : ""}
              </strong>
            </div>
            <div className="flex justify-between text-lg mt-1">
              <span>Total (IGV incluido)</span>
              <strong>{currency(totals.total)}</strong>
            </div>
            <button
              onClick={confirm}
              className="mt-3 w-full px-4 py-2 rounded-xl bg-emerald-600 text-white disabled:opacity-60"
              disabled={!client || items.length === 0}
            >
              Confirmar venta
            </button>
          </div>
        </div>

        {/* =========================
            HISTORIAL
           ========================= */}
        <div className="mt-8">
          <div className="flex items-end justify-between mb-2 gap-3 flex-wrap">
            <h3 className="font-medium">Historial de ventas (últimas 50)</h3>
            <div className="flex items-center gap-2">
              <input
                value={histQuery}
                onChange={(e) => setHistQuery(e.target.value)}
                placeholder="Buscar por cliente o documento…"
                className="border rounded-xl px-3 py-2 w-64"
              />
              <label className="text-sm flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={histOnlyPending}
                  onChange={(e) => setHistOnlyPending(e.target.checked)}
                />
                Solo pendientes
              </label>
              <button onClick={loadHistory} className="px-3 py-2 rounded-xl border">
                {loadingHistory ? "Cargando…" : "Recargar"}
              </button>
            </div>
          </div>

          <Table
            columns={[
              { key: "date", label: "Emisión" },
              { key: "due_date", label: "Vence" },
              { key: "clientName", label: "Cliente" },
              { key: "doc", label: "Comprobante" },
              { key: "total", label: "Total", render: (r) => currency(r.total) },
              {
                key: "status",
                label: "Estado",
                render: (r) => (
                  <span
                    className={`px-2 py-1 rounded-lg text-xs ${
                      r.status === "pendiente" ? "bg-yellow-100 text-yellow-800" : "bg-emerald-100 text-emerald-800"
                    }`}
                  >
                    {r.status}
                  </span>
                ),
              },
              {
                key: "view",
                label: "",
                render: (r) => (
                  <button
                    onClick={() => openDetail(r.id)}
                    className="px-2 py-1 rounded-lg border text-gray-700 hover:bg-gray-50 text-xs"
                  >
                    Ver
                  </button>
                ),
              },
            ]}
            rows={filteredHistory}
            loading={loadingHistory}
            keyField="id"
            emptyMessage="Sin ventas registradas"
          />
        </div>
      </Section>

      {/* =========================
          DRAWER DETALLE DE VENTA
         ========================= */}
      {detailOpen && (
        <div className="fixed inset-0 z-50">
          {/* overlay */}
          <div className="absolute inset-0 bg-black/40" onClick={closeDetail} />
          {/* panel */}
          <div className="absolute right-0 top-0 h-full w-full sm:w-[540px] bg-white shadow-2xl flex flex-col">
            <div className="p-4 border-b flex items-center justify-between">
              <h3 className="font-semibold">Detalle de venta</h3>
              <button onClick={closeDetail} className="text-sm px-3 py-1 border rounded-lg">
                Cerrar
              </button>
            </div>

            {detailLoading ? (
              <div className="p-6 text-gray-500">Cargando…</div>
            ) : !detailHeader ? (
              <div className="p-6 text-gray-500">No se encontró la venta.</div>
            ) : (
              <div className="p-4 space-y-4 overflow-y-auto">
                <div className="grid grid-cols-2 gap-3 bg-gray-50 rounded-xl p-3">
                  <div>
                    <div className="text-xs text-gray-500">Cliente</div>
                    <div className="font-medium">{detailHeader.clientName}</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500">Comprobante</div>
                    <div className="font-medium">{detailHeader.doc}</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500">Emisión</div>
                    <div>{detailHeader.date || "—"}</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500">Vence</div>
                    <div>{detailHeader.due_date || "—"}</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500">Estado</div>
                    <span
                      className={`px-2 py-1 rounded-lg text-xs ${
                        detailHeader.status === "pendiente"
                          ? "bg-yellow-100 text-yellow-800"
                          : "bg-emerald-100 text-emerald-800"
                      }`}
                    >
                      {detailHeader.status}
                    </span>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500">Total</div>
                    <div className="font-semibold text-lg">{currency(detailHeader.total)}</div>
                  </div>
                </div>

                <div>
                  <div className="font-medium mb-2">Ítems de la venta</div>
                  <Table
                    columns={[
                      { key: "sku", label: "SKU" },
                      { key: "name", label: "Producto" },
                      { key: "unit", label: "Und." },
                      { key: "qty", label: "Cant." },
                      { key: "unit_price", label: "P. Unit.", render: (r) => currency(r.unit_price) },
                      {
                        key: "discount_pct",
                        label: "% Desc.",
                        render: (r) => `${toNum(r.discount_pct)}%`,
                      },
                      { key: "total", label: "Importe", render: (r) => currency(r.total) },
                    ]}
                    rows={detailItems}
                    keyField="id"
                    emptyMessage="Sin ítems"
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
