// src/modules/rewards/Premios.jsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Section from "../../components/Section";
import Table from "../../components/Table";
import supabase from "../../lib/supabaseClient";
import {
  ResponsiveContainer,
  RadialBarChart,
  RadialBar,
  PolarAngleAxis,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";

const currency = (n) =>
  new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" }).format(
    Number(n || 0)
  );

const firstDayOfMonth = () => {
  const d = new Date();
  d.setDate(1);
  return d.toISOString().slice(0, 10);
};
const lastDayOfMonth = () => {
  const d = new Date();
  d.setMonth(d.getMonth() + 1, 0);
  return d.toISOString().slice(0, 10);
};

export default function Premios() {
  // -------- Filtros compartidos (rango de fechas) --------
  const [dateFrom, setDateFrom] = useState(firstDayOfMonth());
  const [dateTo, setDateTo] = useState(lastDayOfMonth());

  // -------- PROVEEDOR --------
  const [suppliers, setSuppliers] = useState([]);
  const [supplierId, setSupplierId] = useState(null);

  // -------- METAS POR NIVELES (clasificación) --------
  // ahora cada meta incluye "prize" (nombre del premio)
  const [goals, setGoals] = useState([
    { id: crypto.randomUUID(), name: "Nivel 1", amount: 10000, prize: "" },
    { id: crypto.randomUUID(), name: "Nivel 2", amount: 13000, prize: "" },
    { id: crypto.randomUUID(), name: "Nivel 3", amount: 15000, prize: "" },
  ]);

  // Compras del proveedor en el rango (para elegir qué facturas cuentan)
  const [loadingPurch, setLoadingPurch] = useState(false);
  const [purchases, setPurchases] = useState([]); // [{id, date, total, doc}]
  const [selectedIds, setSelectedIds] = useState(new Set()); // ids elegidos para la meta
  const [minAmount, setMinAmount] = useState(1000); // umbral rápido

  // -------- TOP DISTRIBUIDORES --------
  const [topDists, setTopDists] = useState([]); // [{clientId,name,count,total,avg}]
  const [loadingTop, setLoadingTop] = useState(false);

  // -------- UX flags --------
  const [savingGoals, setSavingGoals] = useState(false);
  const [savingSelection, setSavingSelection] = useState(false);
  const [loadingConfig, setLoadingConfig] = useState(false);

  // Para evitar que la carga de compras pise la selección guardada
  const hasLoadedSavedRef = useRef(false);

  // ================= SUPABASE LOADERS =================
  const loadSuppliers = useCallback(async () => {
    const { data, error } = await supabase
      .from("suppliers")
      .select("id,name")
      .order("name", { ascending: true });
    if (error) {
      alert("No se pudieron cargar proveedores: " + error.message);
      return;
    }
    setSuppliers(data || []);
    const mb = (data || []).find((s) =>
      String(s.name || "").toUpperCase().includes("MASTER BELLE")
    );
    setSupplierId((prev) => prev ?? mb?.id ?? data?.[0]?.id ?? null);
  }, []);

  // Cargar configuración guardada (niveles + facturas) para este proveedor/rango
  const loadSavedConfig = useCallback(async () => {
    if (!supplierId || !dateFrom || !dateTo) return;
    setLoadingConfig(true);
    try {
      const { data, error } = await supabase
        .from("reward_configs")
        .select("goals_json, selected_purchase_ids, updated_at")
        .eq("supplier_id", supplierId)
        .eq("date_from", dateFrom)
        .eq("date_to", dateTo)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      // Aunque haya error, marca que ya intentaste (para no pisar)
      if (error) {
        hasLoadedSavedRef.current = true;
        return;
      }

      if (data?.goals_json) {
        // retro-compatible: acepta objetos con {name, amount} y opcional prize/prize_name
        const loaded = Array.isArray(data.goals_json)
          ? data.goals_json.map((g) => ({
              id: crypto.randomUUID(),
              name: g.name ?? "",
              amount: Number(g.amount || 0),
              prize: g.prize ?? g.prize_name ?? "", // <- nuevo campo
            }))
          : [];
        if (loaded.length) setGoals(loaded);
      }

      if (Array.isArray(data?.selected_purchase_ids)) {
        const normalized = data.selected_purchase_ids.map((n) => Number(n));
        setSelectedIds(new Set(normalized));
      }

      hasLoadedSavedRef.current = true;
    } finally {
      setLoadingConfig(false);
    }
  }, [supplierId, dateFrom, dateTo]);

  const loadSupplierPurchases = useCallback(async () => {
    if (!supplierId) return;
    setLoadingPurch(true);

    const { data, error } = await supabase
      .from("purchases")
      .select("id, supplier_id, date, total, subtotal, igv, invoice_no")
      .gte("date", dateFrom)
      .lte("date", dateTo)
      .eq("supplier_id", supplierId)
      .order("date", { ascending: true });

    if (error) {
      alert("Error cargando compras del proveedor: " + error.message);
      setPurchases([]);
      setLoadingPurch(false);
      return;
    }

    const rows = (data || []).map((p) => {
      const total =
        Number(p.total ?? 0) > 0
          ? Number(p.total)
          : Number(p.subtotal || 0) + Number(p.igv || 0);
      const doc = p.invoice_no ? String(p.invoice_no) : `Compra #${p.id}`;
      return { id: Number(p.id), date: p.date, total: +total.toFixed(2), doc };
    });

    setPurchases(rows);

    if (!hasLoadedSavedRef.current && selectedIds.size === 0) {
      setSelectedIds(new Set(rows.map((r) => Number(r.id))));
    }

    setLoadingPurch(false);
  }, [supplierId, dateFrom, dateTo, selectedIds.size]);

  const loadTopDistributors = useCallback(
    async (topN = 10) => {
      setLoadingTop(true);
      const { data, error } = await supabase
        .from("sales")
        .select("client_id,total,date,payment_status,clients!inner(id,name,tipo)")
        .gte("date", dateFrom)
        .lte("date", dateTo)
        .eq("payment_status", "pagado")
        .eq("clients.tipo", "distribuidor");

      if (error) {
        const { data: dists } = await supabase
          .from("clients")
          .select("id,name")
          .eq("tipo", "distribuidor");
        const ids = (dists || []).map((c) => c.id);
        const nameById = Object.fromEntries(
          (dists || []).map((c) => [c.id, c.name])
        );

        const { data: salesData, error: sErr } = await supabase
          .from("sales")
          .select("client_id,total,date,payment_status")
          .gte("date", dateFrom)
          .lte("date", dateTo)
          .eq("payment_status", "pagado")
          .in("client_id", ids);

        if (sErr) {
          alert("Error cargando ranking: " + sErr.message);
          setTopDists([]);
          setLoadingTop(false);
          return;
        }

        const agg = {};
        for (const s of salesData || []) {
          const id = s.client_id;
          if (!id) continue;
          if (!agg[id])
            agg[id] = { clientId: id, name: nameById[id] || id, count: 0, total: 0 };
          agg[id].count += 1;
          agg[id].total += Number(s.total || 0);
        }
        const arr = Object.values(agg).map((r) => ({
          ...r,
          avg: r.count ? +(r.total / r.count).toFixed(2) : 0,
        }));
        arr.sort((a, b) => b.total - a.total);
        setTopDists(arr.slice(0, topN));
        setLoadingTop(false);
        return;
      }

      const agg = {};
      for (const s of data || []) {
        const id = s.client_id;
        const name = s.clients?.name || id;
        if (!id) continue;
        if (!agg[id]) agg[id] = { clientId: id, name, count: 0, total: 0 };
        agg[id].count += 1;
        agg[id].total += Number(s.total || 0);
      }
      const arr = Object.values(agg).map((r) => ({
        ...r,
        avg: r.count ? +(r.total / r.count).toFixed(2) : 0,
      }));
      arr.sort((a, b) => b.total - a.total);
      setTopDists(arr.slice(0, topN));
      setLoadingTop(false);
    },
    [dateFrom, dateTo]
  );

  // --- Inicializaciones ---
  useEffect(() => {
    loadSuppliers();
  }, [loadSuppliers]);

  useEffect(() => {
    if (!supplierId) return;
    (async () => {
      hasLoadedSavedRef.current = false;
      await loadSavedConfig();
      await loadSupplierPurchases();
      loadTopDistributors();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supplierId, dateFrom, dateTo]);

  // ======= Total contado (sin IGV) =======
  const countedTotal = useMemo(() => {
    if (!purchases.length) return 0;
    let sum = 0;
    for (const p of purchases) if (selectedIds.has(Number(p.id))) sum += Number(p.total || 0);
    const sinIGV = sum / 1.18;
    return +sinIGV.toFixed(2);
  }, [purchases, selectedIds]);

  // ======= Clasificación por niveles =======
  const sortedGoals = useMemo(
    () => [...goals].sort((a, b) => Number(a.amount) - Number(b.amount)),
    [goals]
  );

  const { reached, next } = useMemo(() => {
    let r = null,
      n = null;
    for (const g of sortedGoals) {
      if (countedTotal >= Number(g.amount)) r = g;
      else {
        n = g;
        break;
      }
    }
    return { reached: r, next: n };
  }, [sortedGoals, countedTotal]);

  const tierProgressPct = useMemo(() => {
    if (!next) return 100;
    const base = reached ? Number(reached.amount) : 0;
    const span = Number(next.amount) - base || 1;
    const pct = ((countedTotal - base) / span) * 100;
    return Math.max(0, Math.min(100, +pct.toFixed(2)));
  }, [reached, next, countedTotal]);

  const remainingToNext = useMemo(() => {
    if (!next) return 0;
    return Math.max(0, Number(next.amount) - countedTotal);
  }, [next, countedTotal]);

  // ======= CRUD metas =======
  const addGoal = () =>
    setGoals((prev) => [
      ...prev,
      { id: crypto.randomUUID(), name: `Nivel ${prev.length + 1}`, amount: 0, prize: "" },
    ]);

  const updateGoal = (id, patch) =>
    setGoals((prev) => prev.map((g) => (g.id === id ? { ...g, ...patch } : g)));

  const removeGoal = (id) => setGoals((prev) => prev.filter((g) => g.id !== id));

  // ======= Guardar/recuperar en Supabase =======
  const baseConfig = useMemo(
    () => ({
      supplier_id: supplierId,
      date_from: dateFrom,
      date_to: dateTo,
      updated_at: new Date().toISOString(),
    }),
    [supplierId, dateFrom, dateTo]
  );

  const saveGoals = async () => {
    if (!supplierId) return alert("Elige un proveedor.");
    setSavingGoals(true);
    try {
      const payload = {
        ...baseConfig,
        goals_json: goals.map((g) => ({
          name: g.name,
          amount: Number(g.amount || 0),
          prize: g.prize || "", // <-- guardamos el nombre del premio
        })),
      };
      const { error } = await supabase
        .from("reward_configs")
        .upsert(payload, { onConflict: "supplier_id,date_from,date_to" });
      if (error) return alert("No se pudieron guardar los niveles: " + error.message);
      alert("Niveles guardados.");
      await loadSavedConfig();
    } finally {
      setSavingGoals(false);
    }
  };

  const saveSelection = async () => {
    if (!supplierId) return alert("Elige un proveedor.");
    setSavingSelection(true);
    try {
      const payload = {
        ...baseConfig,
        selected_purchase_ids: Array.from(selectedIds).map((n) => Number(n)),
      };
      const { error } = await supabase
        .from("reward_configs")
        .upsert(payload, { onConflict: "supplier_id,date_from,date_to" });
      if (error) return alert("No se pudo guardar la selección de facturas: " + error.message);
      alert("Selección guardada.");
      await loadSavedConfig();
    } finally {
      setSavingSelection(false);
    }
  };

  // ======= Selección rápida de facturas =======
  const selectAll = () => setSelectedIds(new Set(purchases.map((p) => Number(p.id))));
  const selectNone = () => setSelectedIds(new Set());
  const selectGE = (amount) => {
    const set = new Set(
      purchases.filter((p) => Number(p.total || 0) >= Number(amount)).map((p) => Number(p.id))
    );
    setSelectedIds(set);
  };
  const selectLT = (amount) => {
    const set = new Set(
      purchases.filter((p) => Number(p.total || 0) < Number(amount)).map((p) => Number(p.id))
    );
    setSelectedIds(set);
  };
  const toggleOne = (id) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      const nid = Number(id);
      if (next.has(nid)) next.delete(nid);
      else next.add(nid);
      return next;
    });

  // ================== RENDER ==================
  return (
    <Section title="Premios">
      {/* Filtros de fecha */}
      <div className="grid md:grid-cols-3 gap-3 mb-4">
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
        <div className="flex items-end gap-2">
          <button
            className="px-3 py-2 rounded-xl border"
            onClick={async () => {
              hasLoadedSavedRef.current = false;
              await loadSavedConfig();
              await loadSupplierPurchases();
              loadTopDistributors();
            }}
          >
            {loadingConfig || loadingPurch ? "Recargando…" : "Recargar"}
          </button>
        </div>
      </div>

      {/* ====== METAS POR NIVELES ====== */}
      <div className="bg-white rounded-xl border p-4 mb-6">
        <div className="flex items-center justify-between">
          <h3 className="font-medium mb-3">Metas por proveedor (clasificación por niveles)</h3>
          <div className="flex gap-2">
            <button
              className="px-3 py-2 rounded-xl border disabled:opacity-50"
              disabled={savingGoals}
              onClick={saveGoals}
            >
              {savingGoals ? "Guardando…" : "Guardar niveles"}
            </button>
            <button
              className="px-3 py-2 rounded-xl border disabled:opacity-50"
              disabled={savingSelection}
              onClick={saveSelection}
            >
              {savingSelection ? "Guardando…" : "Guardar selección"}
            </button>
          </div>
        </div>

        <div className="grid md:grid-cols-3 gap-4">
          <label className="flex flex-col">
            <span className="text-xs text-gray-500">Proveedor</span>
            <select
              className="border rounded-xl px-3 py-2"
              value={supplierId ?? ""}
              onChange={(e) => setSupplierId(Number(e.target.value))}
              disabled={loadingConfig || loadingPurch}
            >
              {(suppliers || []).map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </label>

          <div className="bg-gray-50 rounded-xl p-3">
            <div className="text-xs text-gray-500">Contado (facturas elegidas)</div>
            <div className="text-lg font-semibold">{currency(countedTotal)}</div>
          </div>

          <div className="bg-gray-50 rounded-xl p-3">
            <div className="text-xs text-gray-500">
              {next ? "Falta para el siguiente nivel" : "¡Todas las metas superadas!"}
            </div>
            <div className="text-lg font-semibold">
              {next ? currency(remainingToNext) : currency(0)}
            </div>
          </div>
        </div>

        {/* Progreso */}
        <div className="mt-4 grid md:grid-cols-2 gap-6 items-center">
          <div className="bg-gray-50 rounded-xl p-4">
            <div className="text-sm text-gray-600 mb-2">
              Avance hacia {next ? `${next.name} (${currency(next.amount)})` : "el máximo"} – {tierProgressPct}%
            </div>
            <ResponsiveContainer width="100%" height={240}>
              <RadialBarChart
                innerRadius="60%"
                outerRadius="100%"
                data={[{ name: "Avance", value: tierProgressPct, fill: "#10b981" }]}
                startAngle={180}
                endAngle={0}
              >
                <PolarAngleAxis type="number" domain={[0, 100]} angleAxisId={0} tick={false} />
                <RadialBar dataKey="value" background />
              </RadialBarChart>
            </ResponsiveContainer>
          </div>

          <div className="bg-white">
            <div className="text-sm text-gray-600 mb-2">
              Barra de progreso hacia {next ? next.name : "máximo"}
            </div>
            <div className="w-full h-6 bg-gray-200 rounded-full overflow-hidden">
              <div className="h-6 bg-emerald-500" style={{ width: `${tierProgressPct}%` }} />
            </div>
            <div className="mt-2 text-sm text-gray-500">
              {reached ? <>Alcanzado: <b>{reached.name}</b> ({currency(reached.amount)}) · </> : null}
              {next ? <>Siguiente: <b>{next.name}</b> ({currency(next.amount)})</> : <>No hay siguientes metas</>}
            </div>
          </div>
        </div>

        {/* Editor de metas */}
        <div className="mt-6">
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm font-medium">Niveles configurados</div>
            <button className="px-3 py-1 rounded-lg border" onClick={addGoal}>Añadir nivel</button>
          </div>

          <div className="bg-white rounded-xl border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr className="text-left text-gray-600">
                  <th className="py-2 px-3">Nivel</th>
                  <th className="py-2 px-3">Monto (S/)</th>
                  <th className="py-2 px-3">Premio</th>{/* <-- NUEVA COLUMNA */}
                  <th className="py-2 px-3">Estado</th>
                  <th className="py-2 px-3"></th>
                </tr>
              </thead>
              <tbody>
                {sortedGoals.map((g) => {
                  const reachedThis = countedTotal >= Number(g.amount);
                  return (
                    <tr key={g.id} className="border-t">
                      <td className="py-2 px-3">
                        <input
                          className="border rounded-lg px-2 py-1 w-40"
                          value={g.name}
                          onChange={(e) => updateGoal(g.id, { name: e.target.value })}
                        />
                      </td>
                      <td className="py-2 px-3">
                        <input
                          type="number"
                          className="border rounded-lg px-2 py-1 w-32"
                          value={g.amount}
                          onChange={(e) => updateGoal(g.id, { amount: Number(e.target.value || 0) })}
                          min={0}
                          step="50"
                        />
                      </td>
                      <td className="py-2 px-3">
                        <input
                          className="border rounded-lg px-2 py-1 w-56"
                          placeholder="Ej.: Juego de ollas, bono, etc."
                          value={g.prize || ""}
                          onChange={(e) => updateGoal(g.id, { prize: e.target.value })}
                        />
                      </td>
                      <td className="py-2 px-3">
                        <span
                          className={`px-2 py-1 rounded-lg text-xs ${
                            reachedThis
                              ? "bg-emerald-100 text-emerald-800"
                              : "bg-yellow-100 text-yellow-800"
                          }`}
                        >
                          {reachedThis ? "alcanzada" : "pendiente"}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-right">
                        <button className="px-3 py-1 rounded-lg border" onClick={() => removeGoal(g.id)}>
                          Eliminar
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {sortedGoals.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-3 px-3 text-gray-500">Sin niveles</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* ======= Selector de facturas que cuentan ======= */}
        <div className="mt-8">
          <div className="flex flex-wrap items-end gap-2 mb-2">
            <div className="text-sm font-medium mr-2">Facturas del proveedor en el rango</div>
            <button className="px-3 py-1 rounded-lg border" onClick={selectAll}>Todas</button>
            <button className="px-3 py-1 rounded-lg border" onClick={selectNone}>Ninguna</button>
            <div className="flex items-center gap-2">
              <button className="px-3 py-1 rounded-lg border" onClick={() => selectGE(minAmount)}>
                ≥ {currency(minAmount)}
              </button>
              <button className="px-3 py-1 rounded-lg border" onClick={() => selectLT(minAmount)}>
                &lt; {currency(minAmount)}
              </button>
              <input
                type="number"
                className="border rounded-lg px-2 py-1 w-28"
                value={minAmount}
                onChange={(e) => setMinAmount(Number(e.target.value || 0))}
                min={0}
                step="50"
                title="Umbral de monto para selección rápida"
              />
            </div>
          </div>

          <div className="bg-white rounded-xl border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr className="text-left text-gray-600">
                  <th className="py-2 px-3">Contar</th>
                  <th className="py-2 px-3">Fecha</th>
                  <th className="py-2 px-3">Documento</th>
                  <th className="py-2 px-3">Monto</th>
                </tr>
              </thead>
              <tbody>
                {loadingPurch ? (
                  <tr><td className="py-2 px-3" colSpan={4}>Cargando…</td></tr>
                ) : purchases.length === 0 ? (
                  <tr><td className="py-2 px-3" colSpan={4}>Sin facturas</td></tr>
                ) : (
                  purchases.map((p) => (
                    <tr key={p.id} className="border-t">
                      <td className="py-2 px-3">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(Number(p.id))}
                          onChange={() => toggleOne(p.id)}
                          disabled={loadingConfig}
                        />
                      </td>
                      <td className="py-2 px-3">{new Date(p.date).toLocaleDateString("es-PE")}</td>
                      <td className="py-2 px-3">{p.doc}</td>
                      <td className="py-2 px-3">{currency(p.total)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ====== PREMIO AL DISTRIBUIDOR DEL MES ====== */}
      <div className="bg-white rounded-xl border p-4">
        <h3 className="font-medium mb-3">Premio al distribuidor del mes</h3>
        <div className="grid md:grid-cols-2 gap-4">
          <div className="bg-gray-50 p-4 rounded-xl">
            <div className="text-sm text-gray-600 mb-2">
              Top distribuidores por total vendido (pagado)
            </div>
            {loadingTop ? (
              "Cargando..."
            ) : topDists.length === 0 ? (
              <div className="text-sm text-gray-500">Sin datos en el rango</div>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart
                  data={topDists.map((x) => ({ name: x.name, total: x.total }))}
                  margin={{ top: 5, right: 20, left: -10, bottom: 40 }}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" angle={-20} textAnchor="end" interval={0} height={60} />
                  <YAxis />
                  <Tooltip
                    formatter={(v) =>
                      new Intl.NumberFormat("es-PE", {
                        style: "currency",
                        currency: "PEN",
                      }).format(v)
                    }
                  />
                  <Legend />
                  <Bar dataKey="total" name="Total vendido" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          <div className="bg-white p-4 rounded-xl border">
            <div className="text-sm text-gray-600 mb-2">Detalle (Top distribuidores)</div>
            {loadingTop ? (
              "Cargando…"
            ) : topDists.length === 0 ? (
              <div className="text-sm text-gray-500">Sin datos</div>
            ) : (
              <Table
                columns={[
                  { key: "name", label: "Distribuidor" },
                  { key: "count", label: "Comprobantes" },
                  { key: "total", label: "Total", render: (r) => currency(r.total) },
                  { key: "avg", label: "Ticket prom.", render: (r) => currency(r.avg) },
                ]}
                rows={topDists}
                keyField="clientId"
              />
            )}
          </div>
        </div>
      </div>
    </Section>
  );
}
