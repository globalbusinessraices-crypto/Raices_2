// src/modules/inventory/Inventory.jsx
import React, { useEffect, useMemo, useState } from "react";
import Section from "../../components/Section";
import Table from "../../components/Table";
import supabase from "../../lib/supabaseClient";

const toNum = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const todayISO = () => new Date().toISOString().slice(0, 10);

const fmtDate = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("es-PE");
};

export default function Inventory() {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [products, setProducts] = useState([]);
  const [moves, setMoves] = useState([]);

  // filtro por proveedor
  const [supplierFilter, setSupplierFilter] = useState("");

  // edición por fila: { [productId]: { targetQty: number, note: string } }
  const [edits, setEdits] = useState({});

  const loadData = async () => {
    setLoading(true);
    try {
      // 1) Productos
      const { data: prod, error: pErr } = await supabase
        .from("products")
        .select("id, sku, name, supplier_id")
        .order("name", { ascending: true });
      if (pErr) throw pErr;

      // 2) Proveedores
      const { data: sups, error: sErr } = await supabase
        .from("suppliers")
        .select("id, name");
      if (sErr) throw sErr;

      const supplierById = Object.fromEntries((sups ?? []).map((s) => [s.id, s.name]));

      const normProducts = (prod ?? []).map((p) => ({
        ...p,
        supplierName: (p.supplier_id && supplierById[p.supplier_id]) || "—",
      }));

      // 3) Movimientos
      const { data: rawMv, error: mErr } = await supabase
        .from("inventory_movements")
        .select("*")
        .order("id", { ascending: true });
      if (mErr) throw mErr;

      const normMoves = (rawMv ?? []).map((mv) => {
        const rawType = String(mv.type ?? mv.mtype ?? "").trim().toUpperCase();
        const type = ["IN", "ENTRADA", "INGRESO"].includes(rawType)
          ? "IN"
          : ["OUT", "SALIDA", "EGRESO"].includes(rawType)
          ? "OUT"
          : rawType;
        return {
          id: mv.id,
          product_id: mv.product_id,
          date: mv.date ?? mv.mdate ?? null,
          type,
          qty: toNum(mv.qty),
          note: mv.note || "",
          module: mv.module ?? null,
          ref_type: mv.ref_type ?? null,
          ref_id: mv.ref_id ?? null,
        };
      });

      normMoves.sort((a, b) => {
        const da = a.date ? new Date(a.date).getTime() : 0;
        const db = b.date ? new Date(b.date).getTime() : 0;
        if (da !== db) return da - db;
        return toNum(a.id) - toNum(b.id);
      });

      setProducts(normProducts);
      setMoves(normMoves);

      // precargar ediciones (targetQty = stock actual)
      const s = {};
      const onHandMap = computeStock(normMoves);
      for (const p of normProducts) {
        s[p.id] = { targetQty: toNum(onHandMap[p.id] || 0), note: "" };
      }
      setEdits(s);
    } catch (err) {
      console.error(err);
      alert("Error cargando Inventario: " + (err?.message || err));
      setProducts([]);
      setMoves([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // --------- helpers de memo ---------
  const stock = useMemo(() => computeStock(moves), [moves]);

  const kardex = useMemo(
    () =>
      (moves ?? []).map((mv) => ({
        id: mv.id,
        date: mv.date,
        type: mv.type === "IN" ? "Entrada" : mv.type === "OUT" ? "Salida" : mv.type || "—",
        productId: mv.product_id,
        qty: (mv.type === "IN" ? 1 : mv.type === "OUT" ? -1 : 0) * toNum(mv.qty),
        note: mv.note || "",
      })),
    [moves]
  );

  const supplierOptions = useMemo(() => {
    const set = new Set(
      (products ?? [])
        .map((p) => p.supplierName)
        .filter((v) => v && v !== "—")
    );
    return ["", ...Array.from(set).sort()]; // "" = Todos
  }, [products]);

  const filteredProducts = useMemo(() => {
    if (!supplierFilter) return products;
    return (products ?? []).filter((p) => p.supplierName === supplierFilter);
  }, [products, supplierFilter]);

  // --------- guardar ajuste ---------
  const saveAdjustment = async (product) => {
    const pid = product.id;
    const onHand = toNum(stock[pid] || 0);
    const target = toNum(edits[pid]?.targetQty ?? onHand);
    const note = String(edits[pid]?.note || "").trim();

    const delta = target - onHand;
    if (delta === 0) {
      alert("No hay cambios en el stock para guardar.");
      return;
    }
    if (target < 0) {
      alert("El stock objetivo no puede ser negativo.");
      return;
    }

    // construimos el movimiento
    const isIn = delta > 0;
    const payload = {
      product_id: pid,
      date: todayISO(),
      type: isIn ? "IN" : "OUT",
      qty: Math.abs(delta),
      note: note || `Ajuste manual: ${isIn ? "+" : ""}${delta}`,
      module: "inventory",
      ref_type: "adjustment",
    };

    setSaving(true);
    const { error } = await supabase.from("inventory_movements").insert([payload]);
    setSaving(false);

    if (error) {
      alert("No se pudo guardar el ajuste: " + error.message);
      return;
    }

    // reflejamos localmente
    const newMove = {
      id: (moves[moves.length - 1]?.id || 0) + 1, // aproximado para UI
      ...payload,
    };
    setMoves((prev) => [...prev, newMove]);

    // actualizamos el edit a lo que quedó
    setEdits((prev) => ({
      ...prev,
      [pid]: { targetQty: target, note: "" },
    }));

    alert("Ajuste guardado.");
  };

  const setRowTarget = (pid, field, value) =>
    setEdits((prev) => ({
      ...prev,
      [pid]: { ...(prev[pid] || { targetQty: 0, note: "" }), [field]: value },
    }));

  // --------- render ---------
  return (
    <Section title="Inventario & Kardex">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-600">Proveedor:</label>
          <select
            className="px-3 py-2 rounded-xl border bg-white"
            value={supplierFilter}
            onChange={(e) => setSupplierFilter(e.target.value)}
          >
            {supplierOptions.map((opt) => (
              <option key={opt || "all"} value={opt}>
                {opt || "Todos"}
              </option>
            ))}
          </select>
        </div>

        <button
          className="px-3 py-2 rounded-xl border"
          onClick={loadData}
          disabled={loading}
        >
          {loading ? "Cargando..." : "Recargar"}
        </button>
      </div>

      <h3 className="font-medium mb-2">Stock actual</h3>
      <Table
        columns={[
          { key: "sku", label: "SKU" },
          { key: "name", label: "Producto" },
          { key: "supplierName", label: "Proveedor" },
          { key: "onHand", label: "Stock", render: (r) => stock[r.id] || 0 },
          {
            key: "target",
            label: "Nuevo stock",
            render: (r) => (
              <input
                type="number"
                min={0}
                className="border rounded-lg px-2 py-1 w-24"
                value={edits[r.id]?.targetQty ?? toNum(stock[r.id] || 0)}
                onChange={(e) => setRowTarget(r.id, "targetQty", toNum(e.target.value))}
              />
            ),
          },
          {
            key: "note",
            label: "Nota",
            render: (r) => (
              <input
                className="border rounded-lg px-2 py-1 w-56"
                placeholder="Motivo del ajuste"
                value={edits[r.id]?.note ?? ""}
                onChange={(e) => setRowTarget(r.id, "note", e.target.value)}
              />
            ),
          },
          {
            key: "actions",
            label: "Guardar",
            render: (r) => {
              const onHand = toNum(stock[r.id] || 0);
              const target = toNum(edits[r.id]?.targetQty ?? onHand);
              const delta = target - onHand;
              const changed = delta !== 0;

              return (
                <button
                  className={`px-3 py-1 rounded-lg border ${
                    changed ? "bg-emerald-600 text-white" : "opacity-60"
                  }`}
                  disabled={!changed || saving}
                  onClick={() => saveAdjustment(r)}
                  title={
                    changed
                      ? `Se registrará un ${delta > 0 ? "IN" : "OUT"} de ${Math.abs(delta)}`
                      : "Sin cambios"
                  }
                >
                  {saving ? "Guardando..." : "Guardar"}
                </button>
              );
            },
          },
        ]}
        rows={filteredProducts}
        loading={loading}
      />

      <h3 className="font-medium mb-2 mt-6">Kardex</h3>
      <Table
        columns={[
          { key: "date", label: "Fecha", render: (r) => fmtDate(r.date) },
          { key: "type", label: "Tipo" },
          {
            key: "product",
            label: "Producto",
            render: (r) => {
              const p = products.find((pp) => pp.id === r.productId);
              return p ? `${p.sku} – ${p.name}` : r.productId;
            },
          },
          { key: "qty", label: "Cantidad" },
          { key: "note", label: "Nota" },
        ]}
        rows={[...kardex].reverse()} // más reciente arriba
        loading={loading}
      />
    </Section>
  );
}

/** Calcula existencias por producto con los movimientos dados */
function computeStock(moves) {
  const s = {};
  for (const mv of moves || []) {
    const sign = mv.type === "IN" ? 1 : mv.type === "OUT" ? -1 : 0;
    s[mv.product_id] = (s[mv.product_id] || 0) + sign * toNum(mv.qty);
  }
  return s;
}
