// src/modules/industrial/IndustrialServices.tsx
import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import Section from "../../components/Section";
import Table from "../../components/Table";
import AsyncCombobox from "../../components/inputs/AsyncCombobox";
import supabase from "../../lib/supabaseClient";

/* =============== Helpers de fecha y formato =============== */

const fmtDate = (d?: string | null) => {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleDateString("es-PE");
  } catch {
    return d;
  }
};

const todayISO = () => new Date().toISOString().slice(0, 10);

const addDays = (iso: string, days: number) => {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
};

const startOfTodayUTC = () => {
  const now = new Date();
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
};

const dateUTC = (d: string) => {
  const iso = d.slice(0, 10);
  const [y, m, day] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, day);
};

const daysLeft = (nextDate?: string | null) => {
  if (!nextDate) return null;
  const ms = dateUTC(nextDate) - startOfTodayUTC();
  return Math.ceil(ms / 86400000);
};

const currency = (n: number | string | null | undefined) =>
  new Intl.NumberFormat("es-PE", {
    style: "currency",
    currency: "PEN",
  }).format(Number(n || 0));

/* =============== UI básicos: Modal reutilizable =============== */

function Modal({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="relative w-[94%] max-w-3xl rounded-2xl bg-white p-4 shadow-xl">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button
            onClick={onClose}
            className="rounded-full px-2 text-gray-500 hover:bg-gray-100"
          >
            ✕
          </button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}

/* =============== Observaciones rápidas (por estado de parte/cliente) =============== */

function ObservacionesEditor({
  partStatusId,
  onSaved,
}: {
  partStatusId: number;
  onSaved: () => void;
}) {
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!text.trim()) return;
    setSaving(true);
    const { error } = await supabase
      .from("industrial_service_records")
      .insert({
        part_status_id: partStatusId,
        change_date: todayISO(),
        changed: false,
        notes: text.trim(),
      });
    setSaving(false);
    if (error) {
      alert("Error guardando observación: " + error.message);
      return;
    }
    setText("");
    onSaved();
  };

  return (
    <div className="flex flex-col gap-1">
      <textarea
        rows={2}
        className="w-full rounded-lg border px-2 py-1 text-xs"
        placeholder="Escribe observación…"
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <button
        onClick={save}
        disabled={saving || !text.trim()}
        className="self-start rounded-lg bg-blue-600 px-2.5 py-1 text-xs text-white disabled:opacity-50"
      >
        {saving ? "Guardando…" : "Guardar"}
      </button>
    </div>
  );
}

/* =============== Componente principal =============== */

export default function IndustrialServices() {
  /* ---------- Productos ---------- */
  const [products, setProducts] = useState<any[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState<number | null>(
    null
  );
  const selectedProduct = useMemo(
    () => products.find((p) => p.id === selectedProductId) || null,
    [products, selectedProductId]
  );

  const loadProducts = useCallback(async () => {
    setLoadingProducts(true);
    const { data, error } = await supabase
      .from("industrial_products")
      .select("*")
      .order("id", { ascending: true });
    setLoadingProducts(false);
    if (error) {
      alert("Error cargando productos: " + error.message);
      return;
    }
    setProducts(data || []);
    if (!selectedProductId && data && data.length > 0) {
      setSelectedProductId(data[0].id);
    }
  }, [selectedProductId]);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  /* ---------- Modal: nuevo producto ---------- */
  const [productModalOpen, setProductModalOpen] = useState(false);
  const [productForm, setProductForm] = useState({
    name: "",
    model: "",
    serial: "",
    notes: "",
  });
  const [savingProduct, setSavingProduct] = useState(false);

  const openNewProductModal = () => {
    setProductForm({
      name: "",
      model: "",
      serial: "",
      notes: "",
    });
    setProductModalOpen(true);
  };

  const saveProduct = async () => {
    if (!productForm.name.trim()) {
      alert("El nombre del producto es obligatorio.");
      return;
    }
    setSavingProduct(true);
    const payload = {
      product_name: productForm.name.trim(),
      model: productForm.model.trim() || null,
      serial_number: productForm.serial.trim() || null,
      notes: productForm.notes.trim() || null,
    };
    const { data, error } = await supabase
      .from("industrial_products")
      .insert(payload)
      .select("*")
      .single();
    setSavingProduct(false);
    if (error) {
      alert("No se pudo crear el producto: " + error.message);
      return;
    }
    setProducts((prev) => [...prev, data]);
    setSelectedProductId(data.id);
    setProductModalOpen(false);
  };

  /* ---------- Partes globales del producto ---------- */
  const [parts, setParts] = useState<any[]>([]);
  const [loadingParts, setLoadingParts] = useState(false);

  const loadParts = useCallback(
    async (productId: number | null) => {
      setParts([]);
      if (!productId) return;
      setLoadingParts(true);
      const { data, error } = await supabase
        .from("industrial_product_parts")
        .select("*")
        .eq("product_id", productId)
        .order("id", { ascending: true });
      setLoadingParts(false);
      if (error) {
        alert("Error cargando partes: " + error.message);
        return;
      }
      setParts(data || []);
    },
    []
  );

  useEffect(() => {
    loadParts(selectedProduct?.id ?? null);
  }, [selectedProduct?.id, loadParts]);

  /* ---------- Modal: nueva parte ---------- */
  const [partModalOpen, setPartModalOpen] = useState(false);
  const [partForm, setPartForm] = useState({
    name: "",
    interval_days: 180,
    notes: "",
  });
  const [savingPart, setSavingPart] = useState(false);

  const openNewPartModal = () => {
    if (!selectedProduct) {
      alert("Primero selecciona un producto.");
      return;
    }
    setPartForm({
      name: "",
      interval_days: 180,
      notes: "",
    });
    setPartModalOpen(true);
  };

  const savePart = async () => {
    if (!selectedProduct) return;
    if (!partForm.name.trim()) {
      alert("El nombre de la parte es obligatorio.");
      return;
    }

    const interval = Number(partForm.interval_days) || 0;

    setSavingPart(true);
    const payload = {
      product_id: selectedProduct.id,
      part_name: partForm.name.trim(),
      change_interval_days: interval,
      notes: partForm.notes.trim() || null,
    };

    const { data, error } = await supabase
      .from("industrial_product_parts")
      .insert(payload)
      .select("*")
      .single();
    setSavingPart(false);

    if (error) {
      alert("No se pudo crear la parte: " + error.message);
      return;
    }

    setParts((prev) => [...prev, data]);

    // Si el producto ya está asignado a clientes,
    // crear el estado inicial de esta parte para cada cliente.
    if (assignments.length > 0) {
      const rows = assignments.map((a: any) => ({
        assignment_id: a.id,
        part_id: data.id,
        last_change_date: null,
        next_change_date:
          interval > 0 ? addDays(a.assign_date, interval) : a.assign_date,
      }));
      const { error: stErr } = await supabase
        .from("industrial_part_status")
        .insert(rows);
      if (stErr) {
        alert(
          "La parte se creó, pero hubo error al inicializar estados: " +
            stErr.message
        );
      } else if (selectedAssignment) {
        loadPartStatuses(selectedAssignment.id);
      }
    }

    setPartModalOpen(false);
  };

  /* ---------- Asignaciones (producto → clientes) ---------- */

  const [assignments, setAssignments] = useState<any[]>([]);
  const [loadingAssignments, setLoadingAssignments] = useState(false);
  const [selectedAssignmentId, setSelectedAssignmentId] = useState<
    number | null
  >(null);
  const selectedAssignment = useMemo(
    () => assignments.find((a) => a.id === selectedAssignmentId) || null,
    [assignments, selectedAssignmentId]
  );

  const loadAssignments = useCallback(
    async (productId: number | null) => {
      setAssignments([]);
      setSelectedAssignmentId(null);
      if (!productId) return;

      setLoadingAssignments(true);
      const { data, error } = await supabase
        .from("industrial_product_assignments")
        .select("*")
        .eq("product_id", productId)
        .order("assign_date", { ascending: true });
      setLoadingAssignments(false);

      if (error) {
        alert("Error cargando asignaciones: " + error.message);
        return;
      }

      const rows = data || [];
      if (rows.length === 0) {
        setAssignments([]);
        return;
      }

      // Obtener datos de clientes
      const clientIds = rows
        .map((r: any) => r.client_id)
        .filter((id: any) => !!id);

      let clientsById: Record<number, any> = {};
      if (clientIds.length > 0) {
        const { data: clientsData, error: cErr } = await supabase
          .from("clients")
          .select("id, name, telefono, dni, ruc")
          .in("id", clientIds);
        if (!cErr && clientsData) {
          clientsById = clientsData.reduce(
            (acc: any, c: any) => ({ ...acc, [c.id]: c }),
            {}
          );
        }
      }

      const withClients = rows.map((r: any) => ({
        ...r,
        client: clientsById[r.client_id] || null,
      }));

      setAssignments(withClients);
      if (withClients.length > 0) {
        setSelectedAssignmentId(withClients[0].id);
      }
    },
    []
  );

  useEffect(() => {
    loadAssignments(selectedProduct?.id ?? null);
  }, [selectedProduct?.id, loadAssignments]);

  /* ---------- Modal: asignar producto a cliente ---------- */

  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [assignClient, setAssignClient] = useState<any | null>(null);
  const [assignInstallDate, setAssignInstallDate] = useState(todayISO());
  const [savingAssignment, setSavingAssignment] = useState(false);

  const fetchClients = useCallback(async (q: string) => {
    const query = (q || "").trim();

    let req = supabase
      .from("clients")
      .select("id, name, telefono, dni, ruc")
      .order("name", { ascending: true })
      .limit(20);

    if (query) {
      req = req.or(
        `name.ilike.%${query}%,dni.ilike.%${query}%,ruc.ilike.%${query}%`
      );
    }

    const { data, error } = await req;
    if (error) {
      console.error("fetchClients error:", error);
      return [];
    }
    return data || [];
  }, []);

  const openAssignModal = () => {
    if (!selectedProduct) {
      alert("Primero selecciona un producto.");
      return;
    }
    setAssignClient(null);
    setAssignInstallDate(todayISO());
    setAssignModalOpen(true);
  };

  const saveAssignment = async () => {
    if (!selectedProduct) return;
    if (!assignClient) {
      alert("Selecciona un cliente.");
      return;
    }
    if (!assignInstallDate) {
      alert("Indica la fecha de instalación.");
      return;
    }

    setSavingAssignment(true);
    // 1) Crear la asignación producto-cliente
    const { data: assignment, error: aErr } = await supabase
      .from("industrial_product_assignments")
      .insert({
        product_id: selectedProduct.id,
        client_id: assignClient.id,
        assign_date: assignInstallDate,
      })
      .select("*")
      .single();

    if (aErr || !assignment) {
      setSavingAssignment(false);
      alert("No se pudo asignar el producto: " + aErr?.message);
      return;
    }

    // 2) Crear estado inicial de todas las partes para este cliente
    const rowsStatus =
      parts && parts.length > 0
        ? parts.map((p: any) => ({
            assignment_id: assignment.id,
            part_id: p.id,
            last_change_date: null,
            next_change_date:
              p.change_interval_days > 0
                ? addDays(assignInstallDate, p.change_interval_days)
                : assignInstallDate,
          }))
        : [];

    if (rowsStatus.length > 0) {
      const { error: stErr } = await supabase
        .from("industrial_part_status")
        .insert(rowsStatus);
      if (stErr) {
        alert(
          "Se creó la asignación, pero hubo error creando estados de partes: " +
            stErr.message
        );
      }
    }

    setSavingAssignment(false);
    setAssignModalOpen(false);

    // Recargar asignaciones
    await loadAssignments(selectedProduct.id);
    setSelectedAssignmentId(assignment.id);
  };

  /* ---------- Estado de partes por cliente (assignment) ---------- */

  const [partStatuses, setPartStatuses] = useState<any[]>([]);
  const [loadingStatuses, setLoadingStatuses] = useState(false);

  const loadPartStatuses = useCallback(
    async (assignmentId: number | null) => {
      setPartStatuses([]);
      if (!assignmentId) return;
      setLoadingStatuses(true);
      const { data, error } = await supabase
        .from("industrial_part_status")
        .select("*")
        .eq("assignment_id", assignmentId)
        .order("id", { ascending: true });
      setLoadingStatuses(false);
      if (error) {
        alert("Error cargando estado de partes: " + error.message);
        return;
      }
      const enriched =
        data?.map((row: any) => ({
          ...row,
          days_left: daysLeft(row.next_change_date),
        })) || [];
      setPartStatuses(enriched);
    },
    []
  );

  useEffect(() => {
    loadPartStatuses(selectedAssignment?.id ?? null);
  }, [selectedAssignment?.id, loadPartStatuses]);

  /* ---------- Atender parte (cambio de repuesto) ---------- */

  const atenderParte = async (statusRow: any) => {
    const part = parts.find((p: any) => p.id === statusRow.part_id);
    if (!part) {
      alert("No se encontró la parte asociada.");
      return;
    }

    const note = window.prompt(
      "Observación (opcional) para esta atención:",
      ""
    );

    const today = todayISO();
    const interval = Number(part.change_interval_days) || 0;
    const next = interval > 0 ? addDays(today, interval) : today;

    // 1) Actualizar fechas en el estado de la parte (para este cliente)
    const { error: updErr } = await supabase
      .from("industrial_part_status")
      .update({
        last_change_date: today,
        next_change_date: next,
      })
      .eq("id", statusRow.id);

    if (updErr) {
      alert("No se pudo actualizar la parte: " + updErr.message);
      return;
    }

    // 2) Registrar atención en historial
    const { error: recErr } = await supabase
      .from("industrial_service_records")
      .insert({
        part_status_id: statusRow.id,
        change_date: today,
        changed: true,
        notes: note?.trim() || null,
      });

    if (recErr) {
    alert(
      "Se actualizó la parte, pero no se pudo guardar el historial: " +
        recErr.message
    );
  }

  // 3) ACTUALIZAR REACT SIN RECARGAR BD (IMPORTANTE)
  setPartStatuses((prev) =>
    prev.map((p) =>
      p.id === statusRow.id
        ? {
            ...p,
            last_change_date: today,
            next_change_date: next,
            days_left: daysLeft(next),
          }
        : p
    )
  );

  refreshHistoryIfOpen();
};

  /* ---------- Historial por parte/cliente ---------- */

  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyRows, setHistoryRows] = useState<any[]>([]);
  const [historyStatusId, setHistoryStatusId] = useState<number | null>(null);
  const [historyMeta, setHistoryMeta] = useState<{
    partName: string;
    clientName: string;
  } | null>(null);

  const openHistory = async (statusRow: any) => {
    const part = parts.find((p: any) => p.id === statusRow.part_id);
    const clientName =
      selectedAssignment?.client?.name || "Cliente sin nombre";

    setHistoryMeta({
      partName: part?.part_name || "Parte",
      clientName,
    });
    setHistoryStatusId(statusRow.id);
    setHistoryOpen(true);

    const { data, error } = await supabase
      .from("industrial_service_records")
      .select("*")
      .eq("part_status_id", statusRow.id)
      .order("change_date", { ascending: false })
      .order("id", { ascending: false });

    if (error) {
      alert("Error cargando historial: " + error.message);
      setHistoryRows([]);
      return;
    }
    setHistoryRows(data || []);
  };

  const refreshHistoryIfOpen = useCallback(async () => {
    if (!historyOpen || historyStatusId == null) return;
    const { data, error } = await supabase
      .from("industrial_service_records")
      .select("*")
      .eq("part_status_id", historyStatusId)
      .order("change_date", { ascending: false })
      .order("id", { ascending: false });

    if (!error && data) {
      setHistoryRows(data);
    }
  }, [historyOpen, historyStatusId]);

  /* ---------- Helpers de estado visual ---------- */
  const renderStatusPill = (r: any) => {
    if (!r.next_change_date) {
      return (
        <span className="rounded-full bg-gray-100 px-2 py-1 text-xs text-gray-700">
          sin programar
        </span>
      );
    }
    const n = r.days_left as number | null;
    if (n == null || !Number.isFinite(n)) {
      return (
        <span className="rounded-full bg-gray-100 px-2 py-1 text-xs text-gray-700">
          —
        </span>
      );
    }

    let cls = "bg-emerald-100 text-emerald-800";
    if (n < 0) cls = "bg-red-100 text-red-700";
    else if (n <= 30) cls = "bg-amber-100 text-amber-700";

    return (
      <span className={`rounded-full px-2 py-1 text-xs ${cls}`}>
        {n < 0 ? `${Math.abs(n)} días vencido` : `${n} días`}
      </span>
    );
  };

  /* =========================================================
     RENDER
  ========================================================= */
  return (
    <>
      <Section
        title="Servicios industriales (productos, clientes y mantenimiento)"
        right={
          <div className="text-xs text-gray-500">
            1) Crea el producto y sus partes. 2) Asigna el producto a clientes.
            3) Controla cambios de repuestos por cliente.
          </div>
        }
      >
        <div className="grid gap-4 lg:grid-cols-[minmax(0,0.6fr)_minmax(0,1.9fr)]">
          {/* Columna izquierda: Productos */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">Productos industriales</h3>
              <button
                onClick={openNewProductModal}
                className="rounded-xl bg-gray-900 px-3 py-1.5 text-xs text-white"
              >
                Nuevo producto
              </button>
            </div>

            <div className="overflow-hidden rounded-2xl border bg-white">
              {loadingProducts ? (
                <div className="p-4 text-sm text-gray-500">
                  Cargando productos…
                </div>
              ) : products.length === 0 ? (
                <div className="p-4 text-sm text-gray-500">
                  Aún no hay productos. Crea el primero.
                </div>
              ) : (
                <Table
                  keyField="id"
                  rows={products}
                  columns={[
                    {
                      key: "product_name",
                      label: "Producto",
                      render: (r: any) => (
                        <div className="flex flex-col">
                          <span className="font-medium">
                            {r.product_name}
                          </span>
                          <span className="text-xs text-gray-500">
                            {r.model || "Sin modelo"} · Serie:{" "}
                            {r.serial_number || "—"}
                          </span>
                        </div>
                      ),
                    },
                    {
                      key: "actions",
                      label: "",
                      render: (r: any) => (
                        <button
                          onClick={() => setSelectedProductId(r.id)}
                          className={`rounded-lg border px-2 py-1 text-xs ${
                            selectedProductId === r.id
                              ? "bg-gray-900 text-white"
                              : "hover:bg-gray-50"
                          }`}
                        >
                          {selectedProductId === r.id
                            ? "Seleccionado"
                            : "Ver detalle"}
                        </button>
                      ),
                    },
                  ]}
                  emptyMessage="Sin productos."
                />
              )}
            </div>

            {/* Resumen del producto seleccionado */}
            <div className="rounded-2xl border bg-slate-50 p-3">
              <h3 className="text-sm font-semibold">
                {selectedProduct ? "Resumen del producto" : "Selecciona un producto"}
              </h3>
              {selectedProduct ? (
                <div className="mt-2 space-y-1 text-sm text-gray-700">
                  <div>
                    <span className="font-medium">Producto: </span>
                    {selectedProduct.product_name}
                  </div>
                  <div>
                    <span className="font-medium">Modelo: </span>
                    {selectedProduct.model || "—"}
                  </div>
                  <div>
                    <span className="font-medium">Serie: </span>
                    {selectedProduct.serial_number || "—"}
                  </div>
                  {selectedProduct.notes && (
                    <div className="text-xs text-gray-600">
                      <span className="font-medium">Notas: </span>
                      {selectedProduct.notes}
                    </div>
                  )}
                </div>
              ) : (
                <p className="mt-2 text-xs text-gray-500">
                  Elige un producto para ver sus partes y asignarlo a clientes.
                </p>
              )}
            </div>
          </div>

          {/* Columna derecha: Partes + asignaciones + mantenimiento */}
          <div className="space-y-4">
            {/* Partes del producto */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">Partes / repuestos</h3>
                <button
                  onClick={openNewPartModal}
                  className="rounded-xl border px-3 py-1.5 text-xs hover:bg-gray-50"
                  disabled={!selectedProduct}
                >
                  Añadir parte
                </button>
              </div>
              <div className="overflow-hidden rounded-2xl border bg-white">
                {!selectedProduct ? (
                  <div className="p-4 text-sm text-gray-500">
                    Selecciona un producto para ver sus partes.
                  </div>
                ) : (
                  <Table
                    keyField="id"
                    rows={parts}
                    loading={loadingParts}
                    emptyMessage="Este producto aún no tiene partes configuradas."
                    columns={[
                      {
                        key: "part_name",
                        label: "Parte / repuesto",
                      },
                      {
                        key: "change_interval_days",
                        label: "Intervalo (días)",
                      },
                      {
                        key: "notes",
                        label: "Notas",
                        render: (r: any) =>
                          r.notes ? (
                            <span className="text-xs text-gray-600">
                              {r.notes}
                            </span>
                          ) : (
                            "—"
                          ),
                      },
                    ]}
                  />
                )}
              </div>
            </div>

            {/* Asignaciones a clientes */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">
                  Clientes con este producto
                </h3>
                <button
                  onClick={openAssignModal}
                  className="rounded-xl border px-3 py-1.5 text-xs hover:bg-gray-50"
                  disabled={!selectedProduct}
                >
                  Asignar a cliente
                </button>
              </div>

              <div className="overflow-hidden rounded-2xl border bg-white">
                {!selectedProduct ? (
                  <div className="p-4 text-sm text-gray-500">
                    Selecciona un producto para ver sus clientes.
                  </div>
                ) : loadingAssignments ? (
                  <div className="p-4 text-sm text-gray-500">
                    Cargando clientes…
                  </div>
                ) : assignments.length === 0 ? (
                  <div className="p-4 text-sm text-gray-500">
                    Este producto aún no está asignado a ningún cliente.
                  </div>
                ) : (
                  <Table
                    keyField="id"
                    rows={assignments}
                    columns={[
                      {
                        key: "client",
                        label: "Cliente",
                        render: (r: any) =>
                          r.client ? (
                            <div className="flex flex-col">
                              <span className="font-medium">
                                {r.client.name}
                              </span>
                              <span className="text-xs text-gray-500">
                                {(r.client.ruc ||
                                  r.client.dni ||
                                  "—") +
                                  (r.client.telefono
                                    ? ` · ${r.client.telefono}`
                                    : "")}
                              </span>
                            </div>
                          ) : (
                            "—"
                          ),
                      },
                      {
                        key: "assign_date",
                        label: "Instalado",
                        render: (r: any) => fmtDate(r.assign_date),
                      },
                      {
                        key: "actions",
                        label: "",
                        render: (r: any) => (
                          <button
                            onClick={() => setSelectedAssignmentId(r.id)}
                            className={`rounded-lg border px-2 py-1 text-xs ${
                              selectedAssignmentId === r.id
                                ? "bg-gray-900 text-white"
                                : "hover:bg-gray-50"
                            }`}
                          >
                            {selectedAssignmentId === r.id
                              ? "Seleccionado"
                              : "Ver mantenimiento"}
                          </button>
                        ),
                      },
                    ]}
                    emptyMessage="Sin clientes."
                  />
                )}
              </div>
            </div>

            {/* Mantenimiento por cliente (tabla opción A) */}
            <div className="space-y-2">
              <h3 className="text-sm font-semibold">
                {selectedAssignment
                  ? `Mantenimiento de partes – ${
                      selectedAssignment.client?.name || "Cliente"
                    }`
                  : "Selecciona un cliente para ver el mantenimiento"}
              </h3>
              <div className="overflow-hidden rounded-2xl border bg-white">
                {!selectedAssignment ? (
                  <div className="p-4 text-sm text-gray-500">
                    Elige un cliente en la tabla anterior.
                  </div>
                ) : (
                  <Table
                    keyField="id"
                    rows={partStatuses}
                    loading={loadingStatuses}
                    emptyMessage="Este cliente aún no tiene partes asociadas (revisa configuración)."
                    columns={[
                      {
                        key: "part_name",
                        label: "Parte / repuesto",
                        render: (r: any) => {
                          const part = parts.find(
                            (p: any) => p.id === r.part_id
                          );
                          return part?.part_name || "—";
                        },
                      },
                      {
                        key: "interval",
                        label: "Intervalo (días)",
                        render: (r: any) => {
                          const part = parts.find(
                            (p: any) => p.id === r.part_id
                          );
                          return part?.change_interval_days ?? "—";
                        },
                      },
                      {
                        key: "last_change_date",
                        label: "Último cambio",
                        render: (r: any) => fmtDate(r.last_change_date),
                      },
                      {
                        key: "next_change_date",
                        label: "Próximo cambio",
                        render: (r: any) => fmtDate(r.next_change_date),
                      },
                      {
                        key: "status",
                        label: "Estado",
                        render: renderStatusPill,
                      },
                      {
                        key: "history",
                        label: "Historial",
                        render: (r: any) => (
                          <button
                            onClick={() => openHistory(r)}
                            className="rounded-lg border px-2 py-1 text-xs hover:bg-gray-50"
                          >
                            Ver historial
                          </button>
                        ),
                      },
                      {
                        key: "actions",
                        label: "Atender",
                        render: (r: any) => (
                          <button
                            onClick={() => atenderParte(r)}
                            className="rounded-lg border px-2 py-1 text-xs hover:bg-emerald-50"
                          >
                            Registrar cambio
                          </button>
                        ),
                      },
                    ]}
                  />
                )}
              </div>
            </div>
          </div>
        </div>
      </Section>

      {/* Modal: nuevo producto */}
      <Modal
        open={productModalOpen}
        onClose={() => setProductModalOpen(false)}
        title="Nuevo producto industrial"
      >
        <div className="space-y-3 text-sm">
          <div>
            <label className="text-xs text-gray-500">Nombre del producto</label>
            <input
              className="mt-1 w-full rounded-xl border px-3 py-2"
              value={productForm.name}
              onChange={(e) =>
                setProductForm((f) => ({ ...f, name: e.target.value }))
              }
              placeholder="Ej: Planta ósmosis 2000 L/h"
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="text-xs text-gray-500">Modelo</label>
              <input
                className="mt-1 w-full rounded-xl border px-3 py-2"
                value={productForm.model}
                onChange={(e) =>
                  setProductForm((f) => ({ ...f, model: e.target.value }))
                }
              />
            </div>
            <div>
              <label className="text-xs text-gray-500">N° de serie</label>
              <input
                className="mt-1 w-full rounded-xl border px-3 py-2"
                value={productForm.serial}
                onChange={(e) =>
                  setProductForm((f) => ({ ...f, serial: e.target.value }))
                }
              />
            </div>
          </div>
          <div>
            <label className="text-xs text-gray-500">Notas (opcional)</label>
            <textarea
              rows={3}
              className="mt-1 w-full rounded-xl border px-3 py-2"
              value={productForm.notes}
              onChange={(e) =>
                setProductForm((f) => ({ ...f, notes: e.target.value }))
              }
            />
          </div>
          <div className="mt-2 flex justify-end gap-2">
            <button
              onClick={() => setProductModalOpen(false)}
              className="rounded-xl border px-4 py-2 text-sm hover:bg-gray-50"
            >
              Cancelar
            </button>
            <button
              onClick={saveProduct}
              disabled={savingProduct}
              className="rounded-xl bg-gray-900 px-4 py-2 text-sm text-white disabled:opacity-60"
            >
              {savingProduct ? "Guardando…" : "Crear producto"}
            </button>
          </div>
        </div>
      </Modal>

      {/* Modal: nueva parte */}
      <Modal
        open={partModalOpen}
        onClose={() => setPartModalOpen(false)}
        title="Nueva parte / repuesto"
      >
        <div className="space-y-3 text-sm">
          <div>
            <label className="text-xs text-gray-500">Nombre de la parte</label>
            <input
              className="mt-1 w-full rounded-xl border px-3 py-2"
              value={partForm.name}
              onChange={(e) =>
                setPartForm((f) => ({ ...f, name: e.target.value }))
              }
              placeholder="Ej: Cartucho sedimentos 5 micras"
            />
          </div>
          <div>
            <label className="text-xs text-gray-500">
              Intervalo de cambio (días)
            </label>
            <input
              type="number"
              min={0}
              className="mt-1 w-full rounded-xl border px-3 py-2"
              value={partForm.interval_days}
              onChange={(e) =>
                setPartForm((f) => ({
                  ...f,
                  interval_days: Number(e.target.value) || 0,
                }))
              }
            />
            <p className="mt-1 text-[11px] text-gray-500">
              Este valor se aplica al calcular la próxima fecha de cambio
              cuando se instala el producto en un cliente.
            </p>
          </div>
          <div>
            <label className="text-xs text-gray-500">Notas (opcional)</label>
            <textarea
              rows={3}
              className="mt-1 w-full rounded-xl border px-3 py-2"
              value={partForm.notes}
              onChange={(e) =>
                setPartForm((f) => ({ ...f, notes: e.target.value }))
              }
            />
          </div>
          <div className="mt-2 flex justify-end gap-2">
            <button
              onClick={() => setPartModalOpen(false)}
              className="rounded-xl border px-4 py-2 text-sm hover:bg-gray-50"
            >
              Cancelar
            </button>
            <button
              onClick={savePart}
              disabled={savingPart}
              className="rounded-xl bg-emerald-600 px-4 py-2 text-sm text-white disabled:opacity-60"
            >
              {savingPart ? "Guardando…" : "Crear parte"}
            </button>
          </div>
        </div>
      </Modal>

      {/* Modal: asignar producto a cliente */}
      <Modal
        open={assignModalOpen}
        onClose={() => setAssignModalOpen(false)}
        title={
          selectedProduct
            ? `Asignar "${selectedProduct.product_name}" a un cliente`
            : "Asignar a cliente"
        }
      >
        <div className="space-y-3 text-sm">
          <div>
            <label className="text-xs text-gray-500">Cliente</label>
            <AsyncCombobox
              value={assignClient}
              onChange={setAssignClient}
              fetcher={fetchClients}
              displayValue={(c: any) => c?.name || ""}
              placeholder="Busca cliente por nombre, DNI o RUC"
              renderOption={(c: any) => (
                <div className="flex flex-col">
                  <span className="font-medium">{c.name}</span>
                  <span className="text-xs text-gray-500">
                    {(c.ruc || c.dni || "—") +
                      (c.telefono ? ` · ${c.telefono}` : "")}
                  </span>
                </div>
              )}
            />
          </div>
          <div>
            <label className="text-xs text-gray-500">
              Fecha de instalación
            </label>
            <input
              type="date"
              className="mt-1 w-full rounded-xl border px-3 py-2"
              value={assignInstallDate}
              onChange={(e) => setAssignInstallDate(e.target.value)}
            />
          </div>
          <p className="text-[11px] text-gray-500">
            A partir de esta fecha se calcularán las próximas fechas de cambio
            para cada parte según su intervalo en días.
          </p>
          <div className="mt-2 flex justify-end gap-2">
            <button
              onClick={() => setAssignModalOpen(false)}
              className="rounded-xl border px-4 py-2 text-sm hover:bg-gray-50"
            >
              Cancelar
            </button>
            <button
              onClick={saveAssignment}
              disabled={savingAssignment}
              className="rounded-xl bg-indigo-600 px-4 py-2 text-sm text-white disabled:opacity-60"
            >
              {savingAssignment ? "Guardando…" : "Asignar producto"}
            </button>
          </div>
        </div>
      </Modal>

      {/* Modal: historial de una parte para un cliente */}
      <Modal
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        title={
          historyMeta
            ? `Historial – ${historyMeta.partName} (${historyMeta.clientName})`
            : "Historial de parte"
        }
      >
        {historyRows.length === 0 ? (
          <p className="text-sm text-gray-500">Sin registros todavía.</p>
        ) : (
          <ul className="space-y-3 text-sm">
            {historyRows.map((row) => (
              <li
                key={row.id}
                className="rounded-lg border px-3 py-2 text-gray-800"
              >
                <div className="flex items-center justify-between text-xs text-gray-500">
                  <span>{fmtDate(row.change_date)}</span>
                  <span
                    className={
                      row.changed
                        ? "rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] text-emerald-800"
                        : "rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-700"
                    }
                  >
                    {row.changed ? "Cambio realizado" : "Observación"}
                  </span>
                </div>
                {row.notes && (
                  <div className="mt-1 text-sm text-gray-800">
                    {row.notes}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Modal>
    </>
  );
}
