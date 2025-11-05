import React, { useEffect, useMemo, useState } from "react";
import Section from "../../components/Section";
import Table from "../../components/Table";
import supabase from "../../lib/supabaseClient";
import SupplierSpendBar from "../../components/charts/SupplierSpendBar";

// ================== Helpers ==================
const currency = (n) =>
  new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" }).format(Number(n || 0));

const localISODate = (d = new Date()) => {
  const tz = d.getTimezoneOffset();
  const local = new Date(d.getTime() - tz * 60_000);
  return local.toISOString().slice(0, 10);
};
const todayISO = () => localISODate();

const addMonths = (n) => {
  const d = new Date();
  d.setMonth(d.getMonth() + n);
  return localISODate(d);
};

const nextDay = (iso) => {
  const [y, m, dd] = iso.split("-").map(Number);
  const d = new Date(y, m - 1, dd);
  d.setDate(d.getDate() + 1);
  return localISODate(d);
};

const fmtDate = (iso) => {
  if (!iso) return "—";
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    const [y, m, d] = iso.split("-");
    return `${d}/${m}/${y}`;
  }
  try {
    return new Date(iso).toLocaleDateString("es-PE", { timeZone: "UTC" });
  } catch {
    return "—";
  }
};

const toNum = (v) => {
  if (typeof v === "number") return v;
  if (v == null) return 0;
  const n = Number(String(v).replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
};
// ================================================================

export default function Purchases() {
  const [loading, setLoading] = useState(false);

  // ======= Proveedores / Productos =======
  const [suppliers, setSuppliers] = useState([]);
  const [supplierId, setSupplierId] = useState(null);
  const [products, setProducts] = useState([]);

  // ======= Form nuevo producto =======
  const emptyForm = { sku: "", name: "", unit: "und", lastCost: 0 };
  const [form, setForm] = useState(emptyForm);

  // ======= Modo de agregado (unitario / juego) =======
  const [addMode, setAddMode] = useState("unit"); // "unit" | "kit"

  // ======= Kit inline (sin modal) =======
  const [kitName, setKitName] = useState("");
  const [kitQty, setKitQty] = useState(1); // nº de juegos a comprar
  // líneas del kit: {id, productId, qtyPerKit}
  const [kitLines, setKitLines] = useState([]);
  const resetKit = () => {
    setKitName("");
    setKitQty(1);
    setKitLines([]);
  };
  const addKitLine = () => {
    if (!supplierId) return alert("Selecciona proveedor.");
    setKitLines((prev) => [
      ...prev,
      { id: crypto.randomUUID(), productId: "", qtyPerKit: 1 },
    ]);
  };
  const updateKitLine = (id, patch) =>
    setKitLines((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  const removeKitLine = (id) => setKitLines((prev) => prev.filter((l) => l.id !== id));

  const confirmKitToDraft = () => {
    if (!kitName.trim()) return alert("Ponle un nombre al juego.");
    const nKits = Math.max(1, toNum(kitQty));
    if (kitLines.length === 0) return alert("Agrega al menos un componente.");
    for (const l of kitLines) {
      if (!l.productId) return alert("Hay una línea sin producto.");
      if (toNum(l.qtyPerKit) <= 0) return alert("Cantidad por juego inválida.");
    }

    const groupId = crypto.randomUUID();
    const lines = kitLines.map((l) => {
      const p = products.find((x) => String(x.id) === String(l.productId));
      const qty = nKits * toNum(l.qtyPerKit);
      return {
        id: crypto.randomUUID(),
        productId: p.id,
        name: `${kitName} · ${p.sku} – ${p.name}`,
        qty,
        unitCost: toNum(p.last_cost) || 0, // usa el último costo
        _group: groupId,
      };
    });

    setDraft((prev) => [...prev, ...lines]);
    resetKit();
    setAddMode("unit");
  };

  // ======= Borrador de compra =======
  const [draft, setDraft] = useState([]);
  const draftSubtotal = useMemo(
    () => draft.reduce((a, x) => a + toNum(x.qty) * toNum(x.unitCost), 0),
    [draft]
  );

  // Subtotal real (gasto real)
  const [realSubtotal, setRealSubtotal] = useState(0);
  const [realTouched, setRealTouched] = useState(false);
  useEffect(() => {
    if (!realTouched) setRealSubtotal(draftSubtotal);
  }, [draftSubtotal, realTouched]);

  const globalDiscount = useMemo(
    () => Math.max(0, toNum(draftSubtotal) - toNum(realSubtotal)),
    [draftSubtotal, realSubtotal]
  );

  // N° de factura
  const [invoiceNo, setInvoiceNo] = useState("");

  // Cantidad por fila en la lista de productos
  const [rowQty, setRowQty] = useState({});

  // Edición en línea de último costo
  const [inlineEdit, setInlineEdit] = useState({});

  // ======= Filtros de historial =======
  const [dateFrom, setDateFrom] = useState(addMonths(-3));
  const [dateTo, setDateTo] = useState(todayISO());
  const [history, setHistory] = useState([]);

  // ========== Cargar proveedores ==========
  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("suppliers")
        .select("id, name")
        .order("name", { ascending: true });

      if (error) alert("Error cargando proveedores: " + error.message);
      else {
        setSuppliers(data ?? []);
        if ((data ?? []).length > 0) setSupplierId((data ?? [])[0].id);
      }
      setLoading(false);
    })();
  }, []);

  // ========== Cargar productos del proveedor ==========
  const fetchProducts = async (sid) => {
    setLoading(true);
    const { data, error } = await supabase
      .from("products")
      .select("id, supplier_id, sku, name, unit, list_price, last_cost")
      .eq("supplier_id", sid)
      .order("name", { ascending: true });

    if (error) alert("Error cargando productos: " + error.message);
    else {
      setProducts(data ?? []);
      setRowQty((prev) => {
        const next = { ...prev };
        for (const p of data ?? []) {
          if (next[p.id] == null || Number.isNaN(next[p.id])) next[p.id] = 1;
        }
        Object.keys(next).forEach((k) => {
          if (!(data ?? []).some((p) => p.id === Number(k))) delete next[k];
        });
        return next;
      });
    }
    setLoading(false);
  };

  useEffect(() => {
    if (!supplierId) return;
    fetchProducts(supplierId);
    setForm({ ...emptyForm });
    setDraft([]);
    setInlineEdit({});
    setRealTouched(false);
    setRealSubtotal(0);
    resetKit();
    setAddMode("unit");
  }, [supplierId]); // eslint-disable-line

  // ========== Historial de compras ==========
  const fetchHistory = async () => {
    if (!supplierId) return;
    setLoading(true);

    const { data, error } = await supabase
      .from("purchase_items")
      .select(`
        id, qty, unit_cost,
        purchase:purchases(id, issued_at, supplier_id, total, invoice_no),
        product:products(id, supplier_id, sku, name, unit, last_cost)
      `)
      .eq("purchase.supplier_id", supplierId)
      .eq("product.supplier_id", supplierId)
      .gte("purchase.issued_at", dateFrom)
      .lt("purchase.issued_at", nextDay(dateTo))
      .order("issued_at", { ascending: false, foreignTable: "purchases" });

    if (error) alert("Error cargando historial: " + error.message);
    else setHistory(data ?? []);
    setLoading(false);
  };

  useEffect(() => {
    fetchHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supplierId, dateFrom, dateTo]);

  // ================= Guardar nuevo producto =================
  const saveProduct = async () => {
    if (!supplierId) return alert("Selecciona un proveedor.");
    if (!form.sku.trim() || !form.name.trim())
      return alert("SKU y Nombre son obligatorios.");

    setLoading(true);

    const payload = {
      supplier_id: supplierId,
      sku: form.sku.trim(),
      name: form.name.trim(),
      unit: form.unit.trim() || "und",
      last_cost: toNum(form.lastCost),
    };

    const { data, error } = await supabase
      .from("products")
      .insert([payload])
      .select("id, supplier_id, sku, name, unit, list_price, last_cost")
      .single();

    setLoading(false);

    if (error) return alert("No se pudo crear el producto: " + error.message);

    setProducts((prev) => [...prev, data]);
    setRowQty((prev) => ({ ...prev, [data.id]: 1 }));
    setForm(emptyForm);
  };

  // ================= Eliminar producto =================
  const removeProduct = async (id) => {
    if (!confirm("¿Eliminar este producto?")) return;
    setLoading(true);
    const { error } = await supabase.from("products").delete().eq("id", id);
    setLoading(false);
    if (error) return alert("No se pudo eliminar: " + error.message);
    setProducts((prev) => prev.filter((p) => p.id !== id));
    setDraft((prev) => prev.filter((x) => x.productId !== id));
    setRowQty((prev) => {
      const n = { ...prev };
      delete n[id];
      return n;
    });
    setInlineEdit((prev) => {
      const n = { ...prev };
      delete n[id];
      return n;
    });
  };

  // ================= Edición en línea de costo =================
  const startEdit = (p) =>
    setInlineEdit((prev) => ({ ...prev, [p.id]: toNum(p.last_cost) }));

  const cancelEdit = (id) =>
    setInlineEdit((prev) => {
      const n = { ...prev };
      delete n[id];
      return n;
    });

  const saveEditCost = async (p) => {
    const newCost = toNum(inlineEdit[p.id]);
    if (newCost < 0) return alert("Costo inválido.");
    setLoading(true);
    const { error } = await supabase.from("products").update({ last_cost: newCost }).eq("id", p.id);
    setLoading(false);
    if (error) return alert("No se pudo actualizar: " + error.message);

    setProducts((prev) => prev.map((x) => (x.id === p.id ? { ...x, last_cost: newCost } : x)));
    cancelEdit(p.id);
  };

  // ================= Borrador de compra =================
  const addFromProduct = (p) => {
    const qty = toNum(rowQty[p.id] ?? 1);
    if (qty <= 0) return alert("Cantidad inválida.");
    setDraft((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        productId: p.id,
        name: `${p.sku} – ${p.name}`,
        qty,
        unitCost: toNum(p.last_cost),
      },
    ]);
  };

  const updateDraft = (rowId, patch) =>
    setDraft((prev) => prev.map((r) => (r.id === rowId ? { ...r, ...patch } : r)));

  const removeDraft = (rowId) => setDraft((prev) => prev.filter((r) => r.id !== rowId));

  const saveDraftPurchase = async () => {
    if (!supplierId) return alert("Selecciona proveedor.");
    if (draft.length === 0) return alert("No hay ítems en el borrador.");
    if (draft.some((it) => !it.productId || toNum(it.qty) <= 0 || toNum(it.unitCost) < 0))
      return alert("Revisa cantidades y costos.");

    const subtotalReal = toNum(realSubtotal);
    if (subtotalReal < 0) return alert("Subtotal real inválido.");

    setLoading(true);

    const purchasePayload = {
      supplier_id: supplierId,
      issued_at: todayISO(),
      status: "confirmada",
      subtotal: subtotalReal,
      igv: 0,
      total: subtotalReal,
      notes: null,
      invoice_no: invoiceNo.trim() || null,
    };
    const { data: purchase, error: pErr } = await supabase
      .from("purchases")
      .insert([purchasePayload])
      .select("id")
      .single();

    if (pErr) {
      setLoading(false);
      return alert("No se pudo crear la compra: " + pErr.message);
    }

    const itemsPayload = draft.map((it) => ({
      purchase_id: purchase.id,
      product_id: it.productId,
      qty: toNum(it.qty),
      unit_cost: toNum(it.unitCost),
    }));
    const { error: liErr } = await supabase.from("purchase_items").insert(itemsPayload);
    if (liErr) {
      setLoading(false);
      return alert("No se pudieron crear los ítems: " + liErr.message);
    }

    // Movimiento de inventario
    const invPayload = draft.map((it) => ({
      product_id: it.productId,
      date: todayISO(),
      type: "IN",
      qty: toNum(it.qty),
      note: `Compra ${invoiceNo.trim() || ""}`.trim(),
      ref_type: "purchase",
      ref_id: purchase.id,
      module: "purchase",
    }));
    const { error: invErr } = await supabase.from("inventory_movements").insert(invPayload);
    if (invErr) {
      console.error("Error al actualizar inventario:", invErr);
      alert(
        "La compra se guardó, pero hubo un error al actualizar el stock. Revisa el kardex. Error: " +
          invErr.message
      );
    }

    // Actualizar last_cost
    await Promise.all(
      draft.map((it) =>
        supabase.from("products").update({ last_cost: toNum(it.unitCost) }).eq("id", it.productId)
      )
    );

    setDraft([]);
    setRealTouched(false);
    setRealSubtotal(0);
    setInvoiceNo("");
    await fetchProducts(supplierId);
    await fetchHistory();

    setLoading(false);
    alert("Compra registrada.");
  };

  // ======= Filtro defensivo =======
  const historyFiltered = useMemo(
    () => (history ?? []).filter((it) => it.product?.supplier_id === supplierId),
    [history, supplierId]
  );

  // ======= KPIs =======
  const totalSpent = useMemo(() => {
    const seen = new Set();
    let sum = 0;
    for (const it of historyFiltered) {
      const pid = it.purchase?.id;
      if (!pid || seen.has(pid)) continue;
      seen.add(pid);
      sum += toNum(it.purchase?.total);
    }
    return sum;
  }, [historyFiltered]);

  const byProduct = useMemo(() => {
    const acc = {};
    for (const it of historyFiltered) {
      const p = it.product;
      if (!p?.id) continue;
      if (!acc[p.id]) {
        acc[p.id] = {
          id: p.id,
          sku: p.sku,
          name: p.name,
          unit: p.unit,
          qty: 0,
          spent: 0,
        };
      }
      acc[p.id].qty += toNum(it.qty);
      acc[p.id].spent += toNum(it.qty) * toNum(it.unit_cost);
    }
    return Object.values(acc).sort((a, b) => b.spent - a.spent);
  }, [historyFiltered]);

  // ===================== RENDER =====================
  return (
    <Section title="Compras (Entrada de stock) – Crear productos por proveedor">
      {/* SECCIÓN 1: FILTROS PRINCIPALES */}
      <div className="grid md:grid-cols-3 gap-3 mb-4">
        <label className="flex flex-col">
          <span className="text-xs text-gray-500">Proveedor</span>
          <select
            value={supplierId ?? ""}
            onChange={(e) => setSupplierId(Number(e.target.value))}
            className="border rounded-xl px-3 py-2"
          >
            {suppliers.length === 0 ? (
              <option value="">Sin proveedores</option>
            ) : (
              suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))
            )}
          </select>
        </label>
        <label className="flex flex-col">
          <span className="text-xs text-gray-500">Desde</span>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="border rounded-xl px-3 py-2"
          />
        </label>
        <label className="flex flex-col">
          <span className="text-xs text-gray-500">Hasta</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="border rounded-xl px-3 py-2"
          />
        </label>
      </div>

      {/* SECCIÓN 2: ZONA DE ACCIÓN - CREAR NUEVA COMPRA */}
      <div className="mb-8">
        <h2 className="text-xl font-semibold border-b pb-2 mb-4">Registrar Nueva Compra</h2>

        <div className="border rounded-xl p-3 mb-6 bg-white">
          {/* Tipo de agregado */}
          <div className="grid md:grid-cols-6 gap-3 mb-3">
            <label className="flex flex-col md:col-span-2">
              <span className="text-xs text-gray-500">Tipo de agregado</span>
              <select
                className="border rounded-xl px-3 py-2"
                value={addMode}
                onChange={(e) => setAddMode(e.target.value)}
              >
                <option value="unit">Unitario</option>
                <option value="kit">Juego (kit)</option>
              </select>
            </label>
          </div>

          {/* Si es unitario: formulario de producto (crear) */}
          {addMode === "unit" && (
            <>
              <div className="font-medium mb-2">Nuevo producto para este proveedor</div>
              <div className="grid md:grid-cols-6 gap-3">
                <label className="flex flex-col">
                  <span className="text-xs text-gray-500">SKU</span>
                  <input
                    className="border rounded-xl px-3 py-2"
                    value={form.sku}
                    onChange={(e) => setForm((f) => ({ ...f, sku: e.target.value }))}
                    placeholder="Código"
                  />
                </label>
                <label className="flex flex-col md:col-span-2">
                  <span className="text-xs text-gray-500">Nombre</span>
                  <input
                    className="border rounded-xl px-3 py-2"
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="Nombre del producto"
                  />
                </label>
                <label className="flex flex-col">
                  <span className="text-xs text-gray-500">Unidad</span>
                  <input
                    className="border rounded-xl px-3 py-2"
                    value={form.unit}
                    onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value }))}
                    placeholder="und / caja / pack"
                  />
                </label>
                <label className="flex flex-col">
                  <span className="text-xs text-gray-500">Últ. costo</span>
                  <input
                    type="number"
                    step="0.01"
                    className="border rounded-xl px-3 py-2"
                    value={form.lastCost}
                    onChange={(e) => setForm((f) => ({ ...f, lastCost: e.target.value }))}
                    placeholder="0.00"
                  />
                </label>
                <div className="flex items-end gap-2">
                  <button
                    onClick={saveProduct}
                    className="px-3 py-2 rounded-xl bg-emerald-600 text-white disabled:opacity-60"
                    disabled={loading || !supplierId}
                  >
                    Guardar producto
                  </button>
                  <button
                    onClick={() => setForm(emptyForm)}
                    className="px-3 py-2 rounded-xl border"
                    disabled={loading}
                  >
                    Limpiar
                  </button>
                </div>
              </div>
            </>
          )}

          {/* Si es kit: armador inline */}
          {addMode === "kit" && (
            <div className="space-y-3">
              <div className="font-medium">Armar juego (kit)</div>
              <div className="grid md:grid-cols-3 gap-3">
                <label className="flex flex-col">
                  <span className="text-xs text-gray-500">Nombre del juego</span>
                  <input
                    className="border rounded-xl px-3 py-2"
                    value={kitName}
                    onChange={(e) => setKitName(e.target.value)}
                    placeholder="Ejm: JUEGO DE OLLAS"
                  />
                </label>
                <label className="flex flex-col">
                  <span className="text-xs text-gray-500">Cantidad de juegos</span>
                  <input
                    type="number"
                    min={1}
                    className="border rounded-xl px-3 py-2"
                    value={kitQty}
                    onChange={(e) => setKitQty(e.target.value)}
                  />
                </label>
                <div className="flex items-end">
                  <button onClick={addKitLine} className="px-3 py-2 rounded-xl border w-full">
                    Agregar componente
                  </button>
                </div>
              </div>

              {kitLines.length === 0 ? (
                <div className="text-gray-500 text-sm">
                  Agrega componentes con el botón “Agregar componente”.
                </div>
              ) : (
                <Table
                  columns={[
                    {
                      key: "product",
                      label: "Producto",
                      render: (r) => (
                        <select
                          className="border rounded-lg px-2 py-1 w-full"
                          value={r.productId}
                          onChange={(e) => updateKitLine(r.id, { productId: e.target.value })}
                        >
                          <option value="">— seleccionar —</option>
                          {products.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.sku} – {p.name}
                            </option>
                          ))}
                        </select>
                      ),
                    },
                    {
                      key: "qtyPerKit",
                      label: "Cant. por juego",
                      render: (r) => (
                        <input
                          type="number"
                          min={1}
                          value={r.qtyPerKit}
                          onChange={(e) => updateKitLine(r.id, { qtyPerKit: e.target.value })}
                          className="border rounded-lg px-2 py-1 w-28"
                        />
                      ),
                    },
                    {
                      key: "rm",
                      label: "",
                      render: (r) => (
                        <button
                          onClick={() => removeKitLine(r.id)}
                          className="px-2 py-1 rounded-lg border text-red-600"
                        >
                          Quitar
                        </button>
                      ),
                    },
                  ]}
                  rows={kitLines}
                  keyField="id"
                />
              )}

              <div className="flex justify-end gap-2">
                <button onClick={resetKit} className="px-3 py-2 rounded-xl border">
                  Limpiar
                </button>
                <button
                  onClick={confirmKitToDraft}
                  className="px-3 py-2 rounded-xl bg-emerald-600 text-white"
                  disabled={kitLines.length === 0}
                >
                  Agregar juego al borrador
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Lista de productos solo si el modo es unitario */}
        {addMode === "unit" && (
          <>
            <div className="font-medium mb-2">Productos del proveedor</div>
            <Table
              columns={[
                { key: "sku", label: "SKU" },
                { key: "name", label: "Nombre" },
                { key: "unit", label: "Unidad" },
                {
                  key: "last_cost",
                  label: "Últ. costo",
                  render: (r) =>
                    inlineEdit[r.id] !== undefined ? (
                      <input
                        type="number"
                        step="0.01"
                        className="border rounded-lg px-2 py-1 w-28"
                        value={inlineEdit[r.id]}
                        onChange={(e) =>
                          setInlineEdit((prev) => ({
                            ...prev,
                            [r.id]: e.target.value,
                          }))
                        }
                      />
                    ) : (
                      currency(r.last_cost)
                    ),
                },
                {
                  key: "qtyToAdd",
                  label: "Cantidad",
                  render: (r) => (
                    <input
                      type="number"
                      min={1}
                      className="border rounded-lg px-2 py-1 w-20"
                      value={rowQty[r.id] ?? 1}
                      onChange={(e) =>
                        setRowQty((prev) => ({
                          ...prev,
                          [r.id]: e.target.value,
                        }))
                      }
                    />
                  ),
                },
                {
                  key: "acciones",
                  label: "Acciones",
                  render: (r) => (
                    <div className="flex gap-2">
                      <button onClick={() => addFromProduct(r)} className="px-2 py-1 rounded-lg border">
                        Agregar
                      </button>
                      {inlineEdit[r.id] === undefined ? (
                        <button onClick={() => startEdit(r)} className="px-2 py-1 rounded-lg border">
                          Editar
                        </button>
                      ) : (
                        <>
                          <button
                            onClick={() => saveEditCost(r)}
                            className="px-2 py-1 rounded-lg border bg-emerald-600 text-white"
                            disabled={loading}
                          >
                            Guardar
                          </button>
                          <button onClick={() => cancelEdit(r.id)} className="px-2 py-1 rounded-lg border">
                            Cancelar
                          </button>
                        </>
                      )}
                      <button
                        onClick={() => removeProduct(r.id)}
                        className="px-2 py-1 rounded-lg border text-red-600"
                      >
                        Eliminar
                      </button>
                    </div>
                  ),
                },
              ]}
              rows={products}
              keyField="id"
              loading={loading}
              emptyMessage="Sin productos para este proveedor"
            />
          </>
        )}

        {draft.length > 0 && (
          <div className="mt-8">
            <div className="mb-2 font-medium text-lg">Borrador de compra</div>
            <Table
              columns={[
                { key: "name", label: "Producto" },
                {
                  key: "qty",
                  label: "Cantidad",
                  render: (r) => (
                    <input
                      type="number"
                      min={1}
                      value={r.qty}
                      onChange={(e) => updateDraft(r.id, { qty: e.target.value })}
                      className="border rounded-lg px-2 py-1 w-24"
                    />
                  ),
                },
                {
                  key: "unitCost",
                  label: "Costo Unit.",
                  render: (r) => (
                    <input
                      type="number"
                      step="0.01"
                      value={r.unitCost}
                      onChange={(e) => updateDraft(r.id, { unitCost: e.target.value })}
                      className="border rounded-lg px-2 py-1 w-28"
                    />
                  ),
                },
                {
                  key: "total",
                  label: "Total",
                  render: (r) => currency(toNum(r.qty) * toNum(r.unitCost)),
                },
                {
                  key: "rm",
                  label: "",
                  render: (r) => (
                    <button
                      onClick={() => removeDraft(r.id)}
                      className="px-2 py-1 rounded-lg border text-red-600"
                    >
                      Quitar
                    </button>
                  ),
                },
              ]}
              rows={draft}
              keyField="id"
            />
            <div className="grid md:grid-cols-4 gap-3 mt-3">
              <div className="border rounded-xl p-3 bg-white">
                <div className="text-xs text-gray-500">Subtotal borrador</div>
                <div className="text-lg font-semibold">{currency(draftSubtotal)}</div>
              </div>
              <div className="border rounded-xl p-3 bg-white">
                <label className="text-xs text-gray-500">Subtotal real (gasto final)</label>
                <input
                  type="number"
                  step="0.01"
                  value={realSubtotal}
                  onChange={(e) => {
                    setRealTouched(true);
                    setRealSubtotal(e.target.value);
                  }}
                  className="mt-1 w-full border rounded-xl px-3 py-2"
                />
                <div className="text-xs text-gray-500 mt-1">
                  Si hay descuento global, ingrésalo aquí.
                </div>
              </div>
              <div className="border rounded-xl p-3 bg-white">
                <div className="text-xs text-gray-500">Dscto. global aplicado</div>
                <div className="text-lg font-semibold">
                  {globalDiscount > 0 ? `- ${currency(globalDiscount)}` : currency(0)}
                </div>
              </div>
              <div className="border rounded-xl p-3 bg-white">
                <label className="text-xs text-gray-500">N° de factura</label>
                <input
                  type="text"
                  value={invoiceNo}
                  onChange={(e) => setInvoiceNo(e.target.value)}
                  placeholder="Ejm: F001-000123"
                  className="mt-1 w-full border rounded-xl px-3 py-2"
                />
                <div className="text-xs text-gray-500 mt-1">
                  Este número identifica la compra.
                </div>
              </div>
            </div>
            <div className="flex justify-end items-center mt-3">
              <button
                onClick={saveDraftPurchase}
                disabled={loading || draft.length === 0}
                className="px-4 py-2 rounded-xl bg-emerald-600 text-white disabled:opacity-60"
              >
                Guardar compra
              </button>
            </div>
          </div>
        )}
      </div>

      {/* SECCIÓN 3: ANÁLISIS E HISTORIAL */}
      <div className="mt-8">
        <h2 className="text-xl font-semibold border-b pb-2 mb-4">
          Historial y Análisis del Proveedor
        </h2>

        <div className="grid md:grid-cols-3 gap-3 mb-6">
          <div className="border rounded-xl p-3 bg-white">
            <div className="text-xs text-gray-500">Total gastado (Proveedor sel.)</div>
            <div className="text-lg font-semibold">{currency(totalSpent)}</div>
          </div>
          <div className="border rounded-xl p-3 bg-white">
            <div className="text-xs text-gray-500"># Ítems (líneas)</div>
            <div className="text-lg font-semibold">{historyFiltered.length}</div>
          </div>
          <div className="border rounded-xl p-3 bg-white">
            <div className="text-xs text-gray-500">Productos distintos</div>
            <div className="text-lg font-semibold">{byProduct.length}</div>
          </div>
        </div>

        <div className="mb-6">
          <div className="font-medium mb-2">Gasto total por proveedor (general)</div>
          <SupplierSpendBar dateFrom={dateFrom} dateTo={dateTo} />
        </div>

        <div className="mb-8">
          <div className="font-medium mb-2">Gasto por producto (en el rango)</div>
          <Table
            columns={[
              { key: "sku", label: "SKU" },
              { key: "name", label: "Producto" },
              { key: "unit", label: "Unidad" },
              { key: "qty", label: "Cant. comprada" },
              { key: "spent", label: "Gasto", render: (r) => currency(r.spent) },
              {
                key: "avg",
                label: "Costo prom.",
                render: (r) => currency(r.qty ? r.spent / r.qty : 0),
              },
            ]}
            rows={byProduct}
            keyField="id"
            emptyMessage="Sin compras en el rango seleccionado"
          />
        </div>

        <div>
          <div className="font-medium mb-2">Historial detallado de compras</div>
          <Table
            columns={[
              { key: "invoice_no", label: "Factura", render: (r) => r.purchase?.invoice_no || "—" },
              { key: "date", label: "Fecha", render: (r) => fmtDate(r.purchase?.issued_at) },
              {
                key: "product",
                label: "Producto",
                render: (r) => `${r.product?.sku ?? ""} – ${r.product?.name ?? ""}`,
              },
              { key: "qty", label: "Cantidad" },
              { key: "unit_cost", label: "Costo Unit.", render: (r) => currency(r.unit_cost) },
              {
                key: "total",
                label: "Total (nominal)",
                render: (r) => currency(toNum(r.qty) * toNum(r.unit_cost)),
              },
            ]}
            rows={historyFiltered}
            keyField="id"
            loading={loading}
            emptyMessage="Sin compras registradas"
          />
        </div>
      </div>
    </Section>
  );
}
