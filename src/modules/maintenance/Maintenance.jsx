import React, { useState } from "react";
import Section from "../../components/Section";
import Table from "../../components/Table";

const currency = (n) =>
  new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" }).format(Number(n || 0));
const todayISO = () => new Date().toISOString().slice(0, 10);

export default function Maintenance({ clients, products, inventory }) {
  const [orders, setOrders] = useState([]);
  const [form, setForm] = useState({
    clientId: clients[0]?.id || 1,
    equipo: "",
    serie: "",
    sintomas: "",
  });

  const createOrder = () => {
    const id = crypto.randomUUID();
    setOrders((prev) => [
      ...prev,
      {
        id,
        status: "recibido",
        createdAt: todayISO(),
        ...form,
        diagnostico: "",
        presupuesto: 0,
        aprobado: null,
        repuestos: [],
        horas: 0,
      },
    ]);
    setForm({ clientId: clients[0]?.id || 1, equipo: "", serie: "", sintomas: "" });
  };

  const setStatus = (id, status) => setOrders((prev) => prev.map((o) => (o.id === id ? { ...o, status } : o)));
  const setDiagnostico = (id, diagnostico) =>
    setOrders((prev) => prev.map((o) => (o.id === id ? { ...o, diagnostico } : o)));
  const setPresupuesto = (id, presupuesto) =>
    setOrders((prev) => prev.map((o) => (o.id === id ? { ...o, presupuesto: Number(presupuesto) } : o)));
  const setAprobado = (id, aprobado) => setOrders((prev) => prev.map((o) => (o.id === id ? { ...o, aprobado } : o)));
  const addRepuesto = (id, productId, qty) =>
    setOrders((prev) =>
      prev.map((o) => (o.id === id ? { ...o, repuestos: [...o.repuestos, { productId, qty: Number(qty) }] } : o))
    );

  const consumirRepuestos = (order) => {
    for (const r of order.repuestos) {
      if ((inventory.stock[r.productId] || 0) < r.qty) {
        alert("Stock insuficiente para repuestos");
        return;
      }
    }
    order.repuestos.forEach((r) =>
      inventory.moveOut(r.productId, r.qty, `Repuesto en mantenimiento (${order.serie})`, {
        module: "maintenance",
      })
    );
    alert("Repuestos consumidos del stock");
  };

  const facturar = (order) => {
    const repuestosCost = order.repuestos.reduce(
      (a, r) => a + r.qty * (products.find((p) => p.id === r.productId)?.listPrice || 0),
      0
    );
    const manoObra = order.horas * 40; // tarifa ejemplo
    const total = repuestosCost + manoObra;
    alert(
      `Factura generada por ${currency(total)} (Repuestos ${currency(
        repuestosCost
      )} + Mano de obra ${currency(manoObra)})`
    );
    setStatus(order.id, "entregado");
  };

  return (
    <Section title="Mantenimiento en Taller (con costo)">
      <div className="grid md:grid-cols-4 gap-3 mb-4">
        <label className="flex flex-col">
          <span className="text-xs text-gray-500">Cliente</span>
          <select
            value={form.clientId}
            onChange={(e) => setForm((f) => ({ ...f, clientId: Number(e.target.value) }))}
            className="border rounded-xl px-3 py-2"
          >
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col">
          <span className="text-xs text-gray-500">Equipo</span>
          <input
            value={form.equipo}
            onChange={(e) => setForm((f) => ({ ...f, equipo: e.target.value }))}
            className="border rounded-xl px-3 py-2"
            placeholder="Modelo"
          />
        </label>
        <label className="flex flex-col">
          <span className="text-xs text-gray-500">Serie</span>
          <input
            value={form.serie}
            onChange={(e) => setForm((f) => ({ ...f, serie: e.target.value }))}
            className="border rounded-xl px-3 py-2"
            placeholder="N° serie"
          />
        </label>
        <label className="flex flex-col md:col-span-4">
          <span className="text-xs text-gray-500">Síntomas</span>
          <textarea
            value={form.sintomas}
            onChange={(e) => setForm((f) => ({ ...f, sintomas: e.target.value }))}
            className="border rounded-xl px-3 py-2"
          />
        </label>
      </div>
      <button onClick={createOrder} className="px-4 py-2 rounded-xl bg-gray-900 text-white">
        Crear orden
      </button>

      <h3 className="font-medium mt-6 mb-2">Órdenes</h3>
      <Table
        columns={[
          { key: "createdAt", label: "Fecha" },
          { key: "cliente", label: "Cliente", render: (o) => clients.find((c) => c.id === o.clientId)?.name },
          { key: "equipo", label: "Equipo" },
          { key: "serie", label: "Serie" },
          { key: "status", label: "Estado" },
          {
            key: "dx",
            label: "Diagnóstico",
            render: (o) => (
              <input
                value={o.diagnostico}
                onChange={(e) => setDiagnostico(o.id, e.target.value)}
                className="border rounded-lg px-2 py-1"
              />
            ),
          },
          {
            key: "pp",
            label: "Presupuesto",
            render: (o) => (
              <input
                type="number"
                step="0.01"
                value={o.presupuesto}
                onChange={(e) => setPresupuesto(o.id, e.target.value)}
                className="border rounded-lg px-2 py-1 w-28"
              />
            ),
          },
          {
            key: "ap",
            label: "Aprobado",
            render: (o) => (
              <select
                value={o.aprobado === null ? "" : o.aprobado ? "si" : "no"}
                onChange={(e) => setAprobado(o.id, e.target.value === "" ? null : e.target.value === "si")}
                className="border rounded-lg px-2 py-1"
              >
                <option value="">Pendiente</option>
                <option value="si">Sí</option>
                <option value="no">No</option>
              </select>
            ),
          },
          {
            key: "rp",
            label: "Repuestos",
            render: (o) => (
              <div className="flex items-center gap-2">
                <select id={`prod-${o.id}`} className="border rounded-lg px-2 py-1">
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.sku}
                    </option>
                  ))}
                </select>
                <input
                  id={`qty-${o.id}`}
                  type="number"
                  min={1}
                  defaultValue={1}
                  className="border rounded-lg px-2 py-1 w-20"
                />
                <button
                  onClick={() => {
                    const pid = Number(document.getElementById(`prod-${o.id}`).value);
                    const q = Number(document.getElementById(`qty-${o.id}`).value);
                    addRepuesto(o.id, pid, q);
                  }}
                  className="px-2 py-1 rounded-lg border"
                >
                  Agregar
                </button>
              </div>
            ),
          },
          {
            key: "act",
            label: "Acciones",
            render: (o) => (
              <div className="flex flex-col gap-2 min-w-[220px]">
                <div className="flex gap-2">
                  <button onClick={() => setStatus(o.id, "diagnostico")} className="px-2 py-1 rounded-lg border">
                    Diagnóstico
                  </button>
                  <button onClick={() => setStatus(o.id, "presupuestado")} className="px-2 py-1 rounded-lg border">
                    Presupuestado
                  </button>
                  <button
                    disabled={!o.aprobado}
                    onClick={() => setStatus(o.id, "reparacion")}
                    className="px-2 py-1 rounded-lg border disabled:opacity-50"
                  >
                    Reparación
                  </button>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      consumirRepuestos(o);
                      setStatus(o.id, "listo");
                    }}
                    className="px-2 py-1 rounded-lg border"
                  >
                    Consumir repuestos
                  </button>
                  <button onClick={() => facturar(o)} className="px-2 py-1 rounded-lg bg-emerald-600 text-white">
                    Facturar y entregar
                  </button>
                </div>
              </div>
            ),
          },
        ]}
        rows={orders}
      />
    </Section>
  );
}
