// src/modules/products/Products.jsx
import React, { useEffect, useMemo, useState } from "react";
import Section from "../../components/Section";
import Table from "../../components/Table";
import supabase from "../../lib/supabaseClient";

const currency = (n) =>
  new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" }).format(Number(n || 0));

export default function Products({
  products: externalProducts,
  setProducts: setExternalProducts,
  suppliers: externalSuppliers,
}) {
  // Estado local si no vienen por props
  const [rows, setRows] = useState(externalProducts ?? []);
  const [suppliers, setSuppliers] = useState(externalSuppliers ?? []);
  const [loading, setLoading] = useState(false);

  // 🔎 Filtro por proveedor (distribuidor)
  const [supplierFilterId, setSupplierFilterId] = useState(null);

  const emptyForm = {
    id: null,
    supplierId: null,
    sku: "",
    name: "",
    unit: "und",
    listPrice: 0,
    marginPct: 0,
    lastCost: 0, // solo lectura; se actualiza desde Compras

    // Campos de servicio anual (camelCase en el front)
    serviceIsAnnual: false,
    serviceIntervalMonths: 8,
    serviceName: "",
  };
  const [form, setForm] = useState(emptyForm);

  const setProducts = setExternalProducts ?? setRows;

  // ---------- Cargar proveedores y productos de Supabase ----------
  useEffect(() => {
    (async () => {
      setLoading(true);

      // Proveedores
      if (!externalSuppliers) {
        const { data: sdata, error: sErr } = await supabase
          .from("suppliers")
          .select("id, name")
          .order("name", { ascending: true });
        if (sErr) alert("Error al cargar proveedores: " + sErr.message);
        else setSuppliers(sdata ?? []);
      }

      // Productos
      if (!externalProducts) {
        const { data: pdata, error: pErr } = await supabase
          .from("products")
          .select(
            `
            id, supplier_id, sku, name, unit,
            list_price, margin_pct, last_cost,
            service_is_annual, service_interval_months, service_name
          `
          )
          .order("name", { ascending: true });

        if (pErr) alert("Error al cargar productos: " + pErr.message);
        else
          setRows(
            (pdata ?? []).map((r) => ({
              id: r.id,
              supplierId: r.supplier_id,
              sku: r.sku,
              name: r.name,
              unit: r.unit,
              listPrice: Number(r.list_price || 0),
              marginPct: Number(r.margin_pct || 0),
              lastCost: Number(r.last_cost || 0),

              // mapeo a camelCase para el front
              serviceIsAnnual: !!r.service_is_annual,
              serviceIntervalMonths: Number(r.service_interval_months ?? 8),
              serviceName: r.service_name ?? "",
            }))
          );
      }

      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Poner proveedor por defecto cuando cargan
  useEffect(() => {
    if (!form.supplierId && suppliers.length > 0) {
      setForm((f) => ({ ...f, supplierId: suppliers[0].id }));
    }
  }, [suppliers]); // eslint-disable-line

  // ---------- Helpers ----------
  const suggestPrice = useMemo(
    () =>
      +(
        Number(form.lastCost || 0) *
        (1 + Number(form.marginPct || 0) / 100)
      ).toFixed(2),
    [form.lastCost, form.marginPct]
  );

  const applySuggested = () =>
    setForm((f) => ({ ...f, listPrice: suggestPrice }));

  const reset = () =>
    setForm({
      ...emptyForm,
      supplierId: suppliers[0]?.id ?? null,
    });

  const edit = (p) => setForm({ ...p });

  const isValid = () =>
    Number(form.supplierId) && form.sku.trim() && form.name.trim();

  // ---------- Guardar (insert/update en Supabase) ----------
  const save = async () => {
    if (!isValid())
      return alert("Proveedor, SKU y Nombre son obligatorios");

    setLoading(true);

    // list_price: si margen=0 → usar last_cost; si no → listPrice
    const computedListPrice =
      Number(form.marginPct || 0) === 0
        ? Number(form.lastCost || 0)
        : Number(form.listPrice || 0);

    if (form.id) {
      const payload = {
        supplier_id: form.supplierId,
        sku: form.sku.trim(),
        name: form.name.trim(),
        unit: form.unit.trim() || "und",
        margin_pct: Number(form.marginPct || 0),
        list_price: computedListPrice,

        // a snake_case para Supabase
        service_is_annual: !!form.serviceIsAnnual,
        service_interval_months: Number(form.serviceIntervalMonths || 8),
        service_name: form.serviceName?.trim() || null,
      };

      const { error } = await supabase
        .from("products")
        .update(payload)
        .eq("id", form.id);

      if (error) alert("No se pudo actualizar: " + error.message);
      else {
        const updated = { ...form, listPrice: payload.list_price };
        setProducts((prev) =>
          (prev ?? rows).map((p) => (p.id === form.id ? updated : p))
        );
        if (!externalProducts)
          setRows((prev) => prev.map((p) => (p.id === form.id ? updated : p)));
        reset();
      }
    } else {
      const payload = {
        supplier_id: form.supplierId,
        sku: form.sku.trim(),
        name: form.name.trim(),
        unit: form.unit.trim() || "und",
        margin_pct: Number(form.marginPct || 0),
        last_cost: Number(form.lastCost || 0),
        list_price: computedListPrice,

        // Servicio anual
        service_is_annual: !!form.serviceIsAnnual,
        service_interval_months: Number(form.serviceIntervalMonths || 8),
        service_name: form.serviceName?.trim() || null,
      };
      const { data, error } = await supabase
        .from("products")
        .insert([payload])
        .select(
          `
          id, supplier_id, sku, name, unit,
          list_price, margin_pct, last_cost,
          service_is_annual, service_interval_months, service_name
        `
        )
        .single();

      if (error) alert("No se pudo guardar: " + error.message);
      else {
        const mapped = {
          id: data.id,
          supplierId: data.supplier_id,
          sku: data.sku,
          name: data.name,
          unit: data.unit,
          listPrice: Number(data.list_price || 0),
          marginPct: Number(data.margin_pct || 0),
          lastCost: Number(data.last_cost || 0),

          serviceIsAnnual: !!data.service_is_annual,
          serviceIntervalMonths: Number(data.service_interval_months ?? 8),
          serviceName: data.service_name ?? "",
        };
        setProducts((prev) => ([...(prev ?? rows), mapped]));
        if (!externalProducts) setRows((prev) => [...prev, mapped]);
        reset();
      }
    }

    setLoading(false);
  };

  // ---------- Eliminar ----------
  const remove = async (id) => {
    if (!confirm("¿Eliminar producto?")) return;
    setLoading(true);
    const { error } = await supabase.from("products").delete().eq("id", id);
    if (error) alert("No se pudo eliminar: " + error.message);
    else {
      setProducts((prev) => (prev ?? rows).filter((p) => p.id !== id));
      if (!externalProducts)
        setRows((prev) => prev.filter((p) => p.id !== id));
      if (form.id === id) reset();
    }
    setLoading(false);
  };

  // ---------- Filtrado por proveedor ----------
  const filteredRows = useMemo(() => {
    if (!supplierFilterId) return rows;
    return rows.filter((p) => String(p.supplierId) === String(supplierFilterId));
  }, [rows, supplierFilterId]);

  return (
    <Section title="Catálogo de Productos">
      {/* Filtro por proveedor / distribuidor */}
      <div className="flex items-end justify-between gap-3 mb-3 flex-wrap">
        <div className="grid md:grid-cols-6 gap-3 w-full">
          <label className="flex flex-col md:col-span-2">
            <span className="text-xs text-gray-500">Proveedor</span>
            <select
              value={form.supplierId ?? ""}
              onChange={(e) =>
                setForm((f) => ({ ...f, supplierId: Number(e.target.value) }))
              }
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

          {/* Servicio anual */}
          <div className="md:col-span-6 grid md:grid-cols-6 gap-3">
            <label className="flex items-center gap-2 md:col-span-2">
              <input
                type="checkbox"
                checked={!!form.serviceIsAnnual}
                onChange={(e) =>
                  setForm((f) => ({ ...f, serviceIsAnnual: e.target.checked }))
                }
              />
              <span className="text-sm">Es servicio anual</span>
            </label>

            <label className="flex flex-col">
              <span className="text-xs text-gray-500">Cada (meses)</span>
              <input
                type="number"
                min={1}
                className="border rounded-xl px-3 py-2"
                value={form.serviceIntervalMonths}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    serviceIntervalMonths: Number(e.target.value || 8),
                  }))
                }
                disabled={!form.serviceIsAnnual}
              />
            </label>

            <label className="flex flex-col md:col-span-3">
              <span className="text-xs text-gray-500">Nombre del servicio</span>
              <input
                className="border rounded-xl px-3 py-2"
                value={form.serviceName}
                onChange={(e) =>
                  setForm((f) => ({ ...f, serviceName: e.target.value }))
                }
                placeholder="Ej: Mantenimiento anual"
                disabled={!form.serviceIsAnnual}
              />
            </label>
          </div>

          <label className="flex flex-col">
            <span className="text-xs text-gray-500">Último costo (solo lectura)</span>
            <input
              className="border rounded-xl px-3 py-2 bg-gray-50"
              value={form.lastCost}
              readOnly
            />
          </label>

          <label className="flex flex-col">
            <span className="text-xs text-gray-500">Margen %</span>
            <input
              type="number"
              className="border rounded-xl px-3 py-2"
              value={form.marginPct}
              onChange={(e) =>
                setForm((f) => ({ ...f, marginPct: Number(e.target.value) }))
              }
            />
          </label>

          <label className="flex flex-col">
            <span className="text-xs text-gray-500">Precio lista</span>
            <input
              type="number"
              step="0.01"
              className="border rounded-xl px-3 py-2"
              value={form.listPrice}
              onChange={(e) =>
                setForm((f) => ({ ...f, listPrice: Number(e.target.value) }))}
            />
          </label>

          <div className="flex items-end">
            <button onClick={applySuggested} className="px-3 py-2 rounded-xl border">
              Aplicar sugerido ({currency(suggestPrice)})
            </button>
          </div>
        </div>

        <div className="flex items-end gap-2">
          <label className="flex flex-col">
            <span className="text-xs text-gray-500">Filtrar por proveedor</span>
            <select
              value={supplierFilterId ?? ""}
              onChange={(e) => setSupplierFilterId(e.target.value ? Number(e.target.value) : null)}
              className="border rounded-xl px-3 py-2"
            >
              <option value="">Todos</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div className="flex gap-2 mb-6">
        <button
          onClick={save}
          disabled={loading}
          className="px-4 py-2 rounded-xl bg-emerald-600 text-white disabled:opacity-60"
        >
          {form.id ? "Actualizar" : "Guardar"}
        </button>
        {form.id && (
          <button onClick={reset} className="px-4 py-2 rounded-xl border">
            Cancelar
          </button>
        )}
      </div>

      <Table
        columns={[
          { key: "sku", label: "SKU" },
          {
            key: "name",
            label: "Nombre",
            render: (r) => (
              <div className="flex items-center gap-2">
                <span>{r.name}</span>
                {r.serviceIsAnnual && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700">
                    Servicio anual
                  </span>
                )}
              </div>
            ),
          },
          { key: "unit", label: "Unidad" },
          {
            key: "supplier",
            label: "Proveedor",
            render: (r) =>
              suppliers.find((s) => s.id === r.supplierId)?.name || r.supplierId,
          },
          { key: "lastCost", label: "Últ. costo", render: (r) => currency(r.lastCost || 0) },
          { key: "marginPct", label: "Margen %", render: (r) => `${r.marginPct ?? 0}%` },
          {
            key: "listPrice",
            label: "Precio lista",
            render: (r) => {
              const margen = Number(r.marginPct ?? 0);
              const val = margen === 0 ? Number(r.lastCost || 0) : Number(r.listPrice || 0);
              return currency(val);
            },
          },
          {
            key: "acciones",
            label: "Acciones",
            render: (r) => (
              <div className="flex gap-2">
                <button onClick={() => edit(r)} className="px-2 py-1 rounded-lg border">
                  Editar
                </button>
                <button
                  onClick={() => remove(r.id)}
                  className="px-2 py-1 rounded-lg border text-red-600"
                >
                  Eliminar
                </button>
              </div>
            ),
          },
        ]}
        rows={filteredRows}
        keyField="id"
        loading={loading}
        emptyMessage="Sin productos"
      />
    </Section>
  );
}
