import React, { useEffect, useMemo, useState } from "react";
import Section from "../../components/Section";
import Table from "../../components/Table";
import supabase from "../../lib/supabaseClient"; // <-- ajusta la ruta si es necesario

export default function Suppliers() {
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState([]);

  const emptyForm = { id: null, name: "", ruc: "", email: "", telefono: "" };
  const [form, setForm] = useState(emptyForm);

  // ---------- Helpers de validación ----------
  const isValidEmail = (v) =>
    !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
  const isValidRuc = (v) =>
    !v || /^[0-9]{11}$/.test(v);

  // ---------- Cargar lista ----------
  const fetchSuppliers = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("suppliers")
      .select("id, name, ruc, email, telefono")
      .order("name", { ascending: true });

    if (error) {
      alert("Error al cargar proveedores: " + error.message);
    } else {
      setRows(data ?? []);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchSuppliers();
  }, []);

  // ---------- Crear / Actualizar ----------
  const save = async () => {
    if (!form.name.trim()) return alert("El nombre es obligatorio");
    if (!isValidRuc(form.ruc)) return alert("El RUC debe tener 11 dígitos numéricos");
    if (!isValidEmail(form.email)) return alert("Correo no válido");

    setLoading(true);

    if (form.id) {
      // UPDATE
      const { error } = await supabase
        .from("suppliers")
        .update({
          name: form.name.trim(),
          ruc: form.ruc?.trim() || null,
          email: form.email?.trim() || null,
          telefono: form.telefono?.trim() || null,
        })
        .eq("id", form.id);

      if (error) alert("No se pudo actualizar: " + error.message);
      else {
        // Optimista
        setRows((prev) =>
          prev.map((r) => (r.id === form.id ? { ...r, ...form } : r))
        );
        reset();
      }
    } else {
      // INSERT
      const { data, error } = await supabase
        .from("suppliers")
        .insert([
          {
            name: form.name.trim(),
            ruc: form.ruc?.trim() || null,
            email: form.email?.trim() || null,
            telefono: form.telefono?.trim() || null,
          },
        ])
        .select("id, name, ruc, email, telefono")
        .single();

      if (error) alert("No se pudo guardar: " + error.message);
      else {
        setRows((prev) => [...prev, data]);
        reset();
      }
    }

    setLoading(false);
  };

  // ---------- Eliminar ----------
  const remove = async (id) => {
    if (!confirm("¿Eliminar proveedor?")) return;
    setLoading(true);
    const { error } = await supabase.from("suppliers").delete().eq("id", id);
    if (error) alert("No se pudo eliminar: " + error.message);
    else {
      setRows((prev) => prev.filter((r) => r.id !== id));
      if (form.id === id) reset();
    }
    setLoading(false);
  };

  const edit = (row) => setForm({ ...row });
  const reset = () => setForm(emptyForm);

  return (
    <Section title="Proveedores">
      <div className="grid md:grid-cols-4 gap-3 mb-4">
        <label className="flex flex-col">
          <span className="text-xs text-gray-500">Nombre</span>
          <input
            className="border rounded-xl px-3 py-2"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="Nombre del proveedor"
          />
        </label>

        <label className="flex flex-col">
          <span className="text-xs text-gray-500">RUC</span>
          <input
            className="border rounded-xl px-3 py-2"
            value={form.ruc}
            onChange={(e) => setForm((f) => ({ ...f, ruc: e.target.value }))}
            placeholder="RUC (11 dígitos)"
            inputMode="numeric"
          />
        </label>

        <label className="flex flex-col">
          <span className="text-xs text-gray-500">Correo</span>
          <input
            className="border rounded-xl px-3 py-2"
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            placeholder="correo@empresa.com"
          />
        </label>

        <label className="flex flex-col">
          <span className="text-xs text-gray-500">Teléfono</span>
          <input
            className="border rounded-xl px-3 py-2"
            value={form.telefono}
            onChange={(e) =>
              setForm((f) => ({ ...f, telefono: e.target.value }))
            }
            placeholder="Teléfono"
          />
        </label>
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
          { key: "name", label: "Nombre" },
          { key: "ruc", label: "RUC" },
          { key: "email", label: "Correo" },
          { key: "telefono", label: "Teléfono" },
          {
            key: "acciones",
            label: "Acciones",
            render: (r) => (
              <div className="flex gap-2">
                <button
                  onClick={() => edit(r)}
                  className="px-2 py-1 rounded-lg border"
                >
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
        rows={rows}
        keyField="id"
        loading={loading}
        emptyMessage="Sin proveedores"
      />
    </Section>
  );
}
