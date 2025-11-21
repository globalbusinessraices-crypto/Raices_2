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

/* ======================= Helpers ======================= */
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

/* === Crear contratos de servicio (misma lógica) === */
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

/* ======================= Tooltip gráfico ======================= */
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

/* =========================================================
   Modal de configuración del KIT/JUEGO con sustituciones
========================================================= */
function KitConfigModal({ open, onClose, kitProduct, onConfirm, availableStock }) {
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState([]); // [{id, qty, group_code, required, component:{...}}, subs:[{product,qty_ratio}] ]
  const [qtyKit, setQtyKit] = useState(1);
  const [choice, setChoice] = useState({}); // kit_item_id -> chosen product_id
  const [unitPrice, setUnitPrice] = useState({}); // chosen product_id -> unit price (venta)

  useEffect(() => {
    if (!open || !kitProduct?.id) return;
    (async () => {
      setLoading(true);

      // Items del kit
      const { data: kitItems, error: kiErr } = await supabase
        .from("kit_item")
        .select(
          `
          id, qty, group_code, required,
          component:products(id, sku, name, unit, list_price, margin_pct, last_cost)
        `
        )
        .eq("kit_product_id", kitProduct.id)
        .order("id");

      if (kiErr) {
        alert("Error cargando items del kit: " + kiErr.message);
        setLoading(false);
        return;
      }

      const ids = (kitItems ?? []).map((x) => x.id);
      let subsMap = {};
      if (ids.length) {
        const { data: subs, error: sErr } = await supabase
          .from("kit_item_sub")
          .select(
            `
            id, kit_item_id, qty_ratio,
            substitute:products(id, sku, name, unit, list_price, margin_pct, last_cost)
          `
          )
          .in("kit_item_id", ids);
        if (sErr) {
          alert("Error cargando sustituciones: " + sErr.message);
          setLoading(false);
          return;
        }
        subsMap = (subs ?? []).reduce((acc, s) => {
          acc[s.kit_item_id] = acc[s.kit_item_id] || [];
          acc[s.kit_item_id].push({ qty_ratio: toNum(s.qty_ratio) || 1, product: s.substitute });
          return acc;
        }, {});
      }

      const enriched = (kitItems ?? []).map((it) => ({
        ...it,
        subs: subsMap[it.id] || [],
      }));

      // defaults
      const defaultChoice = {};
      const defaultPrice = {};
      enriched.forEach((it) => {
        const base = it.component;
        defaultChoice[it.id] = base?.id;
        if (base?.id) defaultPrice[base.id] = basePriceOf(base);
        (it.subs || []).forEach((s) => {
          if (s.product?.id && defaultPrice[s.product.id] == null)
            defaultPrice[s.product.id] = basePriceOf(s.product);
        });
      });

      setItems(enriched);
      setChoice(defaultChoice);
      setUnitPrice(defaultPrice);
      setQtyKit(1);
      setLoading(false);
    })();
  }, [open, kitProduct?.id]);

  if (!open) return null;

  const totalEst = items.reduce((acc, it) => {
    const chosenId = choice[it.id];
    const ratio =
      chosenId === it.component?.id
        ? 1
        : toNum(it.subs.find((s) => s.product?.id === chosenId)?.qty_ratio || 1);
    const price = toNum(unitPrice[chosenId]);
    return acc + toNum(it.qty) * ratio * price * toNum(qtyKit || 1);
  }, 0);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-2 sm:p-6">
      <div className="bg-white rounded-2xl w-full max-w-3xl shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <div>
            <h3 className="text-base font-semibold">Configurar kit</h3>
            <div className="text-xs text-slate-600">
              {kitProduct?.sku} — {kitProduct?.name}
            </div>
          </div>
          <button onClick={onClose} className="px-3 py-1.5 rounded-lg border hover:bg-slate-50">
            Cerrar
          </button>
        </div>

        {/* Controls */}
        <div className="px-4 py-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="flex flex-col">
            <span className="text-xs text-gray-500">Cantidad de kits</span>
            <input
              type="number"
              min={1}
              value={qtyKit}
              onChange={(e) => setQtyKit(toNum(e.target.value))}
              className="border rounded-xl px-3 py-2"
            />
          </label>
          <div className="rounded-xl border bg-slate-50 px-3 py-2">
            <div className="text-xs text-gray-500">Total estimado</div>
            <div className="text-lg font-semibold">{currency(totalEst)}</div>
          </div>
        </div>

        {/* Table */}
        <div className="px-4 pb-4">
          <div className="max-h-[55vh] overflow-auto rounded-xl border">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 sticky top-0">
                <tr>
                  <th className="text-left p-2">Grupo / Componente</th>
                  <th className="text-left p-2">Elegir</th>
                  <th className="text-right p-2">Cant. x kit</th>
                  <th className="text-right p-2">Stock</th>
                  <th className="text-right p-2">Precio unit.</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it) => {
                  const chosenId = choice[it.id];
                  const opts = [
                    { id: it.component?.id, label: `${it.component?.sku} – ${it.component?.name} (base)`, ratio: 1 },
                    ...it.subs.map((s) => ({
                      id: s.product?.id,
                      label: `${s.product?.sku} – ${s.product?.name} (sust.)`,
                      ratio: toNum(s.qty_ratio) || 1,
                    })),
                  ].filter((o) => !!o.id);

                  const ratio = opts.find((o) => o.id === chosenId)?.ratio || 1;
                  const onHand = availableStock ? availableStock(chosenId) : 0;

                  return (
                    <tr key={it.id} className="border-t">
                      <td className="p-2 align-top">
                        <div className="font-medium">{it.group_code || "—"}</div>
                        <div className="text-xs text-gray-500">
                          {it.component?.sku} – {it.component?.name} {it.required ? "" : "(opcional)"}
                        </div>
                      </td>
                      <td className="p-2">
                        <select
                          value={chosenId ?? ""}
                          onChange={(e) => setChoice((c) => ({ ...c, [it.id]: Number(e.target.value) }))}
                          className="border rounded-lg px-2 py-1 w-full"
                        >
                          {opts.map((o) => (
                            <option key={o.id} value={o.id}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="p-2 text-right">{toNum(it.qty) * ratio}</td>
                      <td className="p-2 text-right">{onHand}</td>
                      <td className="p-2 text-right">
                        <input
                          type="number"
                          step="0.01"
                          value={unitPrice[chosenId] ?? 0}
                          onChange={(e) => setUnitPrice((u) => ({ ...u, [chosenId]: toNum(e.target.value) }))}
                          className="border rounded-lg px-2 py-1 w-28 text-right"
                        />
                      </td>
                    </tr>
                  );
                })}
                {items.length === 0 && (
                  <tr>
                    <td colSpan={5} className="p-4 text-center text-gray-500">
                      {loading ? "Cargando..." : "Kit sin componentes configurados"}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 mt-3">
            <button onClick={onClose} className="px-4 py-2 rounded-xl border hover:bg-slate-50">
              Cancelar
            </button>
            <button
              disabled={loading || items.length === 0}
              onClick={() => {
                const children = items.map((it) => {
                  const chosenId = choice[it.id];
                  const ratio =
                    chosenId === it.component?.id
                      ? 1
                      : toNum(it.subs.find((s) => s.product?.id === chosenId)?.qty_ratio || 1);
                  return {
                    kit_item_id: it.id,
                    product_id: chosenId,
                    qty_per_kit: toNum(it.qty) * ratio,
                    unit_price: toNum(unitPrice[chosenId]),
                    name_hint:
                      (it.subs.find((s) => s.product?.id === chosenId)?.product?.sku &&
                        `${it.subs.find((s) => s.product?.id === chosenId)?.product?.sku} – ${
                          it.subs.find((s) => s.product?.id === chosenId)?.product?.name
                        }`) ||
                      `${it.component?.sku} – ${it.component?.name}`,
                  };
                });
                onConfirm({ qtyKit: toNum(qtyKit) || 1, children });
              }}
              className="px-4 py-2 rounded-xl bg-emerald-600 text-white disabled:opacity-60"
            >
              Confirmar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* =========================================================
   Componente principal: Ventas (JSX)
========================================================= */
export default function Sales({
  clients: externalClients,
  products = [],
  suppliers = [],
  inventory,
}) {
  /* ========================= RESUMEN ========================= */
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

  /* ========================= CLIENTE / CABECERA ========================= */
  const [client, setClient] = useState(null);
  const [docType, setDocType] = useState("boleta");
  const [docNumber, setDocNumber] = useState("");
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

  /* ========================= STOCK (fallback local) ========================= */
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

  /* ========================= ÍTEMS (soporta kit) ========================= */
  // fila normal: { id, type:'normal', product, qty, unitPrice, discountPct }
  // fila kit:    { id, type:'kit', product, qtyKit, children:[{productId,name,qtyPerKit,unitPrice}] }
  const [items, setItems] = useState([]);

  const addItem = () => {
    if (!client) return alert("Selecciona un cliente.");
    setItems((prev) => [
      ...prev,
      { id: crypto.randomUUID(), type: "normal", product: null, qty: 1, unitPrice: 0, discountPct: 0 },
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

  // Modal de kit (para configurar al seleccionar producto is_kit)
  const [kitModal, setKitModal] = useState({ open: false, rowId: null, kitProduct: null });

  const handleSelectProduct = (row, p) => {
    if (!p) {
      setItems((prev) =>
        prev.map((x) =>
          x.id === row.id ? { ...x, product: null, qty: 1, unitPrice: 0, discountPct: 0 } : x
        )
      );
      return;
    }

    if (p.is_kit) {
      // Convertir la fila a tipo KIT tras configurar en modal
      setKitModal({ open: true, rowId: row.id, kitProduct: p });
      return;
    }

    // Normal
    const price = basePriceOf(p);
    setItems((prev) =>
      prev.map((x) => (x.id === row.id ? { ...x, type: "normal", product: p, unitPrice: price } : x))
    );
  };

  const addConfiguredKitToItems = ({ qtyKit, children }) => {
    const rowId = kitModal.rowId;
    const p = kitModal.kitProduct;

    const kitRow = {
      id: rowId,
      type: "kit",
      product: p,
      qtyKit: toNum(qtyKit) || 1,
      children: children.map((c) => ({
        productId: c.product_id,
        name: c.name_hint || "",
        qtyPerKit: toNum(c.qty_per_kit),
        unitPrice: toNum(c.unit_price),
      })),
    };

    setItems((prev) => prev.map((r) => (r.id === rowId ? kitRow : r)));

    // Enriquecer nombres de hijas si no llegaron
    (async () => {
      const ids = children.map((c) => c.product_id);
      if (!ids.length) return;
      const { data } = await supabase.from("products").select("id, sku, name").in("id", ids);
      if (data) {
        setItems((prev) =>
          prev.map((r) =>
            r.id === rowId
              ? {
                  ...r,
                  children: r.children.map((ch) => {
                    if (ch.name) return ch;
                    const pr = data.find((d) => d.id === ch.productId);
                    return pr ? { ...ch, name: `${pr.sku} – ${pr.name}` } : ch;
                  }),
                }
              : r
          )
        );
      }
    })();
  };

  // Totales (precios ya incluyen IGV)
  const totals = useMemo(() => {
    let total = 0;
    for (const it of items) {
      if (it.type === "normal") {
        const qty = toNum(it.qty);
        const price = toNum(it.unitPrice);
        const d = Math.min(Math.max(toNum(it.discountPct), 0), 100);
        total += qty * price * (1 - d / 100);
      } else if (it.type === "kit") {
        for (const ch of it.children) {
          total += toNum(ch.qtyPerKit) * toNum(it.qtyKit) * toNum(ch.unitPrice);
        }
      }
    }
    return { total };
  }, [items]);

  /* ========================= HISTORIAL ========================= */
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

  /* ========================= DETALLE (drawer) ========================= */
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailHeader, setDetailHeader] = useState(null);
  const [detailItems, setDetailItems] = useState([]);

  const openDetail = useCallback(async (saleId) => {
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

    // Ítems
    const { data: items, error: iErr } = await supabase
      .from("sale_items")
      .select(`
          id, qty, unit_price, discount_pct, parent_line_id,
          product:products(id, sku, name, unit)
        `)
      .eq("sale_id", saleId)
      .order("parent_line_id", { ascending: true });

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
          name: (it.product?.name || "") + (it.parent_line_id ? "" : " (KIT)"),
          unit: it.product?.unit || "und",
          qty: toNum(it.qty),
          unit_price: toNum(it.unit_price),
          discount_pct: toNum(it.discount_pct),
          total: line,
        };
      })
    );

    setDetailLoading(false);
  }, []);

  const closeDetail = () => setDetailOpen(false);

  /* ========================= CONFIRMAR VENTA ========================= */
  const confirm = async () => {
    if (!client) return alert("Selecciona un cliente.");
    if (items.length === 0) return alert("Agrega al menos un ítem.");

    const hasRuc = isRUC(client?.ruc);
    if (docType === "factura" && !hasRuc) {
      alert("Para emitir FACTURA el cliente debe tener RUC válido (11 dígitos).");
      return;
    }

    // Armar lista de descargas de stock (productos normales + hijas de kits)
    const stockToCheck = [];
    for (const it of items) {
      if (it.type === "normal") {
        if (!it.product) return alert("Hay ítems sin producto seleccionado.");
        stockToCheck.push({ product_id: it.product.id, qty: toNum(it.qty) });
      } else if (it.type === "kit") {
        if (!it.product) return alert("Hay un kit sin producto.");
        if (!it.children?.length) return alert("El kit no tiene componentes configurados.");
        it.children.forEach((ch) =>
          stockToCheck.push({
            product_id: ch.productId,
            qty: toNum(ch.qtyPerKit) * toNum(it.qtyKit),
          })
        );
      }
    }

    const willDownloadStock = !isDistrib || (isDistrib && paidNow);

    if (willDownloadStock) {
      // Validar stock disponible
      for (const row of stockToCheck) {
        const onHand = availableStock(row.product_id);
        if (onHand < row.qty) {
          alert(`Stock insuficiente para el producto ${row.product_id}. Disponible: ${onHand}`);
          return;
        }
      }
    }

    const total = +totals.total.toFixed(2);

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

    // Insertar líneas: normales planas + kits (padre + hijas)
    const plainLines = [];
    const invMoves = []; // SOLO para hijas y normales si descarga

    for (const it of items) {
      if (it.type === "normal") {
        const d = Math.min(Math.max(toNum(it.discountPct), 0), 100);
        plainLines.push({
          sale_id: sale.id,
          product_id: it.product.id,
          qty: toNum(it.qty),
          unit_price: toNum(it.unitPrice),
          discount_pct: d,
          parent_line_id: null,
        });
        if (willDownloadStock) {
          invMoves.push({
            product_id: it.product.id,
            date: todayISO(),
            type: "OUT",
            qty: toNum(it.qty),
            note: `Venta (${docType.toUpperCase()}) ${docNumber || ""}`.trim(),
            ref_type: "sale",
            ref_id: sale.id,
            module: "sale",
          });
        }
      } else if (it.type === "kit") {
        // padre (documental)
        const { data: parentIns, error: pErr } = await supabase
          .from("sale_items")
          .insert([
            {
              sale_id: sale.id,
              product_id: it.product.id,
              qty: toNum(it.qtyKit),
              unit_price: 0,
              discount_pct: 0,
              parent_line_id: null,
            },
          ])
          .select("id")
          .single();

        if (pErr) {
          alert("No se pudo crear la línea padre del kit: " + pErr.message);
          return;
        }

        // hijas (real descarga)
        const childPayload = it.children.map((ch) => ({
          sale_id: sale.id,
          product_id: ch.productId,
          qty: toNum(ch.qtyPerKit) * toNum(it.qtyKit),
          unit_price: toNum(ch.unitPrice),
          discount_pct: 0,
          parent_line_id: parentIns.id,
        }));

        const { error: cErr } = await supabase.from("sale_items").insert(childPayload);
        if (cErr) {
          alert("No se pudieron crear los componentes del kit: " + cErr.message);
          return;
        }

        if (willDownloadStock) {
          childPayload.forEach((cp) =>
            invMoves.push({
              product_id: cp.product_id,
              date: todayISO(),
              type: "OUT",
              qty: toNum(cp.qty),
              note: `Venta (${docType.toUpperCase()}) ${docNumber || ""}`.trim(),
              ref_type: "sale",
              ref_id: sale.id,
              module: "sale",
            })
          );
        }
      }
    }

    // Insertar líneas planas
    if (plainLines.length) {
      const { error: iErr } = await supabase.from("sale_items").insert(plainLines);
      if (iErr) {
        await supabase.from("sales").delete().eq("id", sale.id);
        alert("No se pudieron registrar los ítems: " + iErr.message);
        return;
      }
    }

    // Contratos de servicio (solo si descarga inmediata)
    if (willDownloadStock) {
      await createServiceContracts({
        supabase,
        clientId: client.id,
        saleId: sale.id,
        items: items.filter((x) => x.type === "normal"), // kits usualmente no generan contratos
        startDate: isDistrib ? issueDate : todayISO(),
      });
    }

    // Movimientos de inventario
    if (willDownloadStock && invMoves.length) {
      const { error: mErr } = await supabase.from("inventory_movements").insert(invMoves);
      if (mErr) {
        alert(
          "Venta registrada pero no se pudieron guardar los movimientos de inventario: " +
            mErr.message
        );
      }

      // Actualizar cache local fallback
      setStockMap((prev) => {
        const next = { ...prev };
        invMoves.forEach((mv) => {
          const k = String(mv.product_id);
          next[k] = toNum(next[k] || 0) - toNum(mv.qty);
        });
        return next;
      });
    }

    // Reset
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

  /* ========================= UI ========================= */
  return (
    <>
      {/* MODAL KIT */}
      <KitConfigModal
        open={kitModal.open}
        kitProduct={kitModal.kitProduct}
        availableStock={availableStock}
        onClose={() => setKitModal({ open: false, rowId: null, kitProduct: null })}
        onConfirm={(payload) => {
          addConfiguredKitToItems(payload);
          setKitModal({ open: false, rowId: null, kitProduct: null });
        }}
      />

      {/* ========================= RESUMEN ========================= */}
      <Section title="Resumen de Ventas">
        <div className="grid md:grid-cols-3 gap-4">
          {/* Filtros + Totales */}
          <div className="md:col-span-1 space-y-3">
            <div className="rounded-2xl border bg-white p-3 shadow-sm">
              <div className="grid grid-cols-2 gap-2">
                <label className="flex flex-col">
                  <span className="text-xs text-gray-500">Desde</span>
                  <input
                    type="date"
                    value={summaryFromDate}
                    onChange={(e) => setSummaryFromDate(e.target.value)}
                    className="border rounded-xl px-3 py-2"
                  />
                </label>
                <label className="flex flex-col">
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
                className="mt-3 w-full px-3 py-2 rounded-xl border hover:bg-slate-50"
                disabled={loadingSummary}
              >
                {loadingSummary ? "Cargando..." : "Recargar"}
              </button>

              <div className="mt-3 rounded-xl bg-slate-900 text-white p-4">
                <div className="text-sm text-slate-300">Total vendido en el rango</div>
                <div className="text-3xl font-bold mt-1">
                  {loadingSummary ? "..." : currency(summaryData.total)}
                </div>
              </div>
            </div>
          </div>

          {/* Gráfico */}
          <div className="md:col-span-2 rounded-2xl border bg-white p-4 shadow-sm min-h-[250px]">
            {loadingSummary ? (
              <div className="h-[250px] grid place-content-center text-slate-500">Cargando gráfico…</div>
            ) : (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={summaryData.byType} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(230,230,230,0.5)" }} />
                  <Legend />
                  <Bar dataKey="cantidad" fill="#0ea5e9" name="Cantidad" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </Section>

      {/* ========================= REGISTRO ========================= */}
      <Section title="Ventas (precio y descuento editables)">
        {/* CABECERA */}
        <div className="rounded-2xl border bg-white p-4 shadow-sm mb-4">
          <div className="grid md:grid-cols-4 gap-3">
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
            <div className="grid md:grid-cols-4 gap-3 mt-3">
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

          <div className="mt-3">
            <button
              onClick={addItem}
              className="px-3 py-2 rounded-xl bg-gray-900 text-white w-full md:w-auto disabled:opacity-60"
              disabled={!client}
            >
              Agregar ítem
            </button>
          </div>
        </div>

        {/* Grid principal: tabla + totales sticky */}
        <div className="grid lg:grid-cols-[1fr_380px] gap-4">
          {/* ÍTEMS (soporta kits) */}
          <div className="rounded-2xl border bg-white shadow-sm overflow-hidden">
            <div className="max-h-[56vh] overflow-auto">
              <Table
                columns={[
                  {
                    key: "product",
                    label: "Producto",
                    render: (r) =>
                      r.type === "normal" ? (
                        <AsyncCombobox
                          value={r.product}
                          onChange={(p) => handleSelectProduct(r, p)}
                          fetcher={fetchProducts}
                          displayValue={(p) => (p ? `${p.sku} – ${p.name}${p.is_kit ? " (KIT)" : ""}` : "")}
                          placeholder="Busca producto por nombre o SKU"
                          renderOption={(p) => {
                            const onHand = availableStock(p.id);
                            return (
                              <div className="flex items-center justify-between gap-3">
                                <div className="min-w-0">
                                  <div className="truncate">
                                    {p.sku} – {p.name}{" "}
                                    {p.is_kit ? (
                                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 ml-1">
                                        KIT
                                      </span>
                                    ) : null}
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
                      ) : (
                        <div className="flex items-center gap-2">
                          <div className="font-medium truncate">
                            {r.product?.sku} – {r.product?.name}
                          </div>
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700">
                            KIT
                          </span>
                        </div>
                      ),
                  },
                  {
                    key: "qty",
                    label: "Cant.",
                    render: (r) =>
                      r.type === "normal" ? (
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
                      ) : (
                        <input
                          type="number"
                          min={1}
                          value={r.qtyKit}
                          onChange={(e) =>
                            setItems((prev) =>
                              prev.map((x) => (x.id === r.id ? { ...x, qtyKit: toNum(e.target.value) } : x))
                            )
                          }
                          className="border rounded-lg px-2 py-1 w-24"
                        />
                      ),
                  },
                  {
                    key: "unitPrice",
                    label: "Precio Unit.",
                    render: (r) =>
                      r.type === "normal" ? (
                        <input
                          type="number"
                          step="0.01"
                          value={r.unitPrice}
                          onChange={(e) =>
                            setItems((prev) =>
                              prev.map((x) => (x.id === r.id ? { ...x, unitPrice: toNum(e.target.value) } : x))
                            )
                          }
                          className="border rounded-lg px-2 py-1 w-28"
                        />
                      ) : (
                        <span className="text-gray-500">—</span>
                      ),
                  },
                  {
                    key: "discountPct",
                    label: "% Desc.",
                    render: (r) =>
                      r.type === "normal" ? (
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
                      ) : (
                        <span className="text-gray-500">—</span>
                      ),
                  },
                  {
                    key: "line",
                    label: "Importe",
                    render: (r) => {
                      if (r.type === "normal") {
                        const d = Math.min(Math.max(toNum(r.discountPct), 0), 100);
                        const line = toNum(r.qty) * toNum(r.unitPrice) * (1 - d / 100);
                        return currency(line);
                      }
                      const totalKit = r.children.reduce(
                        (acc, ch) => acc + toNum(ch.qtyPerKit) * toNum(r.qtyKit) * toNum(ch.unitPrice),
                        0
                      );
                      return currency(totalKit);
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
            </div>

            {/* Subfilas con componentes del kit */}
            {items.some((i) => i.type === "kit") && (
              <div className="border-t">
                <div className="bg-indigo-50/60 px-3 py-2 text-xs font-medium text-indigo-800">
                  Detalle de kits
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-indigo-50">
                      <tr>
                        <th className="text-left p-2">Componente</th>
                        <th className="text-right p-2">Cant.</th>
                        <th className="text-right p-2">P. Unit.</th>
                        <th className="text-right p-2">Importe</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items
                        .filter((i) => i.type === "kit")
                        .map((k) =>
                          k.children.map((ch, idx) => (
                            <tr key={`${k.id}-${idx}`} className="border-t">
                              <td className="p-2 pl-8">
                                <span className="text-gray-500">↳</span> {ch.name || ch.productId}
                              </td>
                              <td className="p-2 text-right">{toNum(ch.qtyPerKit) * toNum(k.qtyKit)}</td>
                              <td className="p-2 text-right">
                                <input
                                  type="number"
                                  step="0.01"
                                  value={ch.unitPrice}
                                  onChange={(e) =>
                                    setItems((prev) =>
                                      prev.map((row) =>
                                        row.id === k.id
                                          ? {
                                              ...row,
                                              children: row.children.map((c, i) =>
                                                i === idx ? { ...c, unitPrice: toNum(e.target.value) } : c
                                              ),
                                            }
                                          : row
                                      )
                                    )
                                  }
                                  className="border rounded-lg px-2 py-1 w-28 text-right"
                                />
                              </td>
                              <td className="p-2 text-right">
                                {currency(toNum(ch.qtyPerKit) * toNum(k.qtyKit) * toNum(ch.unitPrice))}
                              </td>
                            </tr>
                          ))
                        )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          {/* TOTALES (sticky) */}
          <aside className="lg:sticky lg:top-24 h-fit">
            <div className="bg-white rounded-2xl border shadow-sm p-4">
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
              <div className="mt-2 text-[11px] text-slate-500">
                Guarda y descuenta stock según la condición de pago configurada.
              </div>
            </div>
          </aside>
        </div>

        {/* ========================= HISTORIAL ========================= */}
        <div className="mt-8 rounded-2xl border bg-white shadow-sm p-4">
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
              <button onClick={loadHistory} className="px-3 py-2 rounded-xl border hover:bg-slate-50">
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
                      r.status === "pendiente"
                        ? "bg-yellow-100 text-yellow-800"
                        : "bg-emerald-100 text-emerald-800"
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

      {/* ========================= DRAWER DETALLE ========================= */}
      {detailOpen && (
        <div className="fixed inset-0 z-50">
          {/* overlay */}
          <div className="absolute inset-0 bg-black/40" onClick={closeDetail} />
          {/* panel */}
          <div className="absolute right-0 top-0 h-full w-full sm:w-[560px] bg-white shadow-2xl flex flex-col">
            <div className="p-4 border-b flex items-center justify-between">
              <h3 className="font-semibold">Detalle de venta</h3>
              <button onClick={closeDetail} className="text-sm px-3 py-1 border rounded-lg hover:bg-slate-50">
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
                      { key: "discount_pct", label: "% Desc.", render: (r) => `${toNum(r.discount_pct)}%` },
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
