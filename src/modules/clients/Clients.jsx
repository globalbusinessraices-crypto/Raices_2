// src/modules/clients/Clients.jsx
import React, { useEffect, useMemo, useState } from "react";
import Section from "../../components/Section";
import Table from "../../components/Table";
import supabase from "../../lib/supabaseClient";

const emptyForm = {
  id: null,
  name: "",
  tipo: "normal", // normal | distribuidor
  telefono: "",
  email: "",
  dni: "",
  ruc: "",
  direccion: "",
  birthdate: "", // SOLO distribuidores (date: YYYY-MM-DD)
};

const fmtDate = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("es-PE");
};

export default function Clients() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [q, setQ] = useState("");

  // Filtro por tipo
  const [tipoFilter, setTipoFilter] = useState("todos"); // 'todos' | 'normal' | 'distribuidor'

  // ---- Cargar clientes
  const fetchClients = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("clients")
      .select("id, name, tipo, telefono, email, dni, ruc, direccion, birthdate")
      .order("name", { ascending: true });

    if (error) alert("Error cargando clientes: " + error.message);
    else setRows(data ?? []);
    setLoading(false);
  };

  useEffect(() => {
    fetchClients();
  }, []);

  // Conteos para chips
  const counts = useMemo(() => {
    const total = rows.length;
    let normal = 0;
    let distribuidor = 0;
    for (const r of rows) {
      const t = (r.tipo || "").toLowerCase();
      if (t === "distribuidor") distribuidor++;
      else normal++;
    }
    return { total, normal, distribuidor };
  }, [rows]);

  // ---- Filtros de búsqueda + tipo
  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return rows.filter((r) => {
      // tipo
      const t = (r.tipo || "normal").toLowerCase();
      if (tipoFilter !== "todos" && t !== tipoFilter) return false;

      // texto
      if (!term) return true;
      return [
        r.name,
        r.tipo,
        r.telefono,
        r.email,
        r.dni,
        r.ruc,
        r.direccion,
        r.birthdate,
        String(r.id),
      ]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(term));
    });
  }, [rows, q, tipoFilter]);

  // ---- Helpers
  const reset = () => setForm({ ...emptyForm });
  const edit = (r) =>
    setForm({
      id: r.id,
      name: r.name || "",
      tipo: r.tipo || "normal",
      telefono: r.telefono || "",
      email: r.email || "",
      dni: r.dni || "",
      ruc: r.ruc || "",
      direccion: r.direccion || "",
      birthdate: r.birthdate || "",
    });

  // Validaciones mínimas Perú:
  const isDNI = (v) => /^\d{8}$/.test((v || "").trim());
  const isRUC = (v) => /^\d{11}$/.test((v || "").trim());

  const isValid = () => {
    if (!form.name.trim()) return false;
    if (!(form.tipo === "normal" || form.tipo === "distribuidor")) return false;
    if (form.tipo === "normal" && !isDNI(form.dni)) return false;
    if (form.tipo === "distribuidor" && !isRUC(form.ruc)) return false;
    return true;
  };

  const norm = (s) => (s?.toString().trim() ? s.toString().trim() : null);

  // ---- Guardar (insert/update)
  const save = async () => {
    if (!isValid()) {
      const msg =
        form.tipo === "distribuidor"
          ? "Nombre y RUC (11 dígitos) son obligatorios."
          : "Nombre y DNI (8 dígitos) son obligatorios.";
      return alert(msg);
    }

    setLoading(true);

    const payload = {
      name: form.name.trim(),
      tipo: form.tipo,
      telefono: norm(form.telefono),
      email: norm(form.email),
      dni: form.tipo === "normal" ? form.dni.trim() : norm(form.dni),
      ruc: form.tipo === "distribuidor" ? form.ruc.trim() : norm(form.ruc),
      direccion: norm(form.direccion),
      birthdate: form.tipo === "distribuidor" ? norm(form.birthdate) : null,
    };

    if (form.id) {
      const { error } = await supabase.from("clients").update(payload).eq("id", form.id);
      if (error) alert("No se pudo actualizar: " + error.message);
      else {
        setRows((prev) => prev.map((x) => (x.id === form.id ? { ...x, ...payload } : x)));
        reset();
      }
    } else {
      const { data, error } = await supabase
        .from("clients")
        .insert([payload])
        .select("id, name, tipo, telefono, email, dni, ruc, direccion, birthdate")
        .single();
      if (error) alert("No se pudo crear: " + error.message);
      else {
        setRows((prev) => [...prev, data]);
        reset();
      }
    }

    setLoading(false);
  };

  // ---- Eliminar
  const remove = async (id) => {
    if (!confirm("¿Eliminar este cliente?")) return;
    setLoading(true);
    const { error } = await supabase.from("clients").delete().eq("id", id);
    if (error) alert("No se pudo eliminar: " + error.message);
    else setRows((prev) => prev.filter((x) => x.id !== id));
    setLoading(false);
  };

  const chipClass = (key) =>
    `px-3 py-1 rounded-full text-sm transition shadow-sm ${
      tipoFilter === key
        ? "bg-gray-900 text-white"
        : "bg-white border border-slate-200 text-slate-700 hover:bg-slate-50"
    }`;

  // ----- Columnas dinámicas -----
  const columns = useMemo(() => {
    const base = [
      { key: "name", label: "Nombre" },
      ...(tipoFilter === "todos" ? [{ key: "tipo", label: "Tipo" }] : []),
      { key: "dni", label: "DNI" },
      { key: "ruc", label: "RUC" },
      { key: "telefono", label: "Teléfono" },
      { key: "email", label: "Email" },
      ...(tipoFilter === "distribuidor"
        ? [{ key: "birthdate", label: "F. nacimiento", render: (r) => fmtDate(r.birthdate) }]
        : []),
      { key: "direccion", label: "Dirección" },
      {
        key: "acciones",
        label: "Acciones",
        render: (r) => (
          <div className="flex gap-2">
            <button onClick={() => edit(r)} className="px-2 py-1 rounded-lg border hover:bg-slate-50">
              Editar
            </button>
            <button
              onClick={() => remove(r.id)}
              className="px-2 py-1 rounded-lg border text-red-600 hover:bg-red-50"
            >
              Eliminar
            </button>
          </div>
        ),
      },
    ];
    return base;
  }, [tipoFilter]);

  return (
    <Section title="Clientes">
      {/* FORMULARIO */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm p-4 mb-4">
        <div className="grid md:grid-cols-6 gap-3">
          <label className="flex flex-col md:col-span-2">
            <span className="text-xs text-gray-500">Nombre</span>
            <input
              className="border rounded-xl px-3 py-2"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Ej: Juan Pérez"
            />
          </label>

          <label className="flex flex-col">
            <span className="text-xs text-gray-500">Tipo</span>
            <select
              className="border rounded-xl px-3 py-2"
              value={form.tipo}
              onChange={(e) => setForm((f) => ({ ...f, tipo: e.target.value }))}
            >
              <option value="normal">normal</option>
              <option value="distribuidor">distribuidor</option>
            </select>
          </label>

          {/* DNI */}
          <label className="flex flex-col">
            <span className="text-xs text-gray-500">
              DNI {form.tipo === "normal" ? "(obligatorio)" : "(opcional)"}
            </span>
            <input
              className="border rounded-xl px-3 py-2"
              value={form.dni}
              onChange={(e) => setForm((f) => ({ ...f, dni: e.target.value }))}
              placeholder="8 dígitos"
              maxLength={8}
              inputMode="numeric"
            />
          </label>

          {/* RUC */}
          <label className="flex flex-col">
            <span className="text-xs text-gray-500">
              RUC {form.tipo === "distribuidor" ? "(obligatorio)" : "(opcional)"}
            </span>
            <input
              className="border rounded-xl px-3 py-2"
              value={form.ruc}
              onChange={(e) => setForm((f) => ({ ...f, ruc: e.target.value }))}
              placeholder="11 dígitos"
              maxLength={11}
              inputMode="numeric"
            />
          </label>

          <label className="flex flex-col">
            <span className="text-xs text-gray-500">Teléfono</span>
            <input
              className="border rounded-xl px-3 py-2"
              value={form.telefono}
              onChange={(e) => setForm((f) => ({ ...f, telefono: e.target.value }))}
              placeholder="999999999"
            />
          </label>

          <label className="flex flex-col">
            <span className="text-xs text-gray-500">Email</span>
            <input
              type="email"
              className="border rounded-xl px-3 py-2"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              placeholder="correo@dominio.com"
            />
          </label>

          {/* Fecha de nacimiento: SOLO distribuidores */}
          {form.tipo === "distribuidor" && (
            <label className="flex flex-col">
              <span className="text-xs text-gray-500">F. nacimiento </span>
              <input
                type="date"
                className="border rounded-xl px-3 py-2"
                value={form.birthdate || ""}
                onChange={(e) => setForm((f) => ({ ...f, birthdate: e.target.value }))}
              />
            </label>
          )}

          <label className="flex flex-col md:col-span-2">
            <span className="text-xs text-gray-500">Dirección</span>
            <input
              className="border rounded-xl px-3 py-2"
              value={form.direccion}
              onChange={(e) => setForm((f) => ({ ...f, direccion: e.target.value }))}
              placeholder="Calle, número, distrito"
            />
          </label>
        </div>

        <div className="flex flex-wrap gap-2 mt-4">
          <button
            onClick={save}
            disabled={loading}
            className="px-4 py-2 rounded-xl bg-emerald-600 text-white disabled:opacity-60"
          >
            {form.id ? "Actualizar" : "Guardar"}
          </button>
          {form.id && (
            <button onClick={reset} className="px-4 py-2 rounded-xl border hover:bg-slate-50">
              Cancelar
            </button>
          )}
        </div>
      </div>

      {/* FILTROS + BUSCADOR */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm p-3 mb-4">
        <div className="flex flex-wrap gap-2 items-center">
          <div className="flex gap-2">
            <button
              className={chipClass("todos")}
              onClick={() => setTipoFilter("todos")}
              title="Mostrar todos"
            >
              Todos ({counts.total})
            </button>
            <button
              className={chipClass("normal")}
              onClick={() => setTipoFilter("normal")}
              title="Solo clientes normales"
            >
              Normales ({counts.normal})
            </button>
            <button
              className={chipClass("distribuidor")}
              onClick={() => setTipoFilter("distribuidor")}
              title="Solo distribuidores"
            >
              Distribuidores ({counts.distribuidor})
            </button>
          </div>

          <div className="ml-auto w-full sm:w-64">
            <input
              className="border rounded-xl px-3 py-2 w-full"
              placeholder="Buscar…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* TABLA */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="max-h-[60vh] overflow-auto">
          <Table
            columns={columns}
            rows={filtered}
            keyField="id"
            loading={loading}
            emptyMessage="Sin clientes"
          />
        </div>
      </div>
    </Section>
  );
}
