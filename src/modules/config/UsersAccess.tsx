// src/modules/config/UsersAccess.tsx
import React, { useEffect, useMemo, useState } from "react";
import Section from "../../components/Section";
import Table from "../../components/Table";
import supabase from "../../lib/supabaseClient";

/** Tabla de usuarios (BD) */
const USERS_TABLE = "profiles";

/** Catálogo de módulos (UI) */
const ALL_MODULES = [
  { key: "sales",       label: "Ventas" },
  { key: "receivables", label: "Cobros" },
  { key: "purchases",   label: "Compras" },
  { key: "inventory",   label: "Inventario" },
  { key: "services",    label: "Servicios" },
  { key: "maintenance", label: "Mantenimiento" },
  { key: "clients",     label: "Clientes" },
  { key: "suppliers",   label: "Proveedores" },
  { key: "products",    label: "Productos" },
  { key: "rewards",     label: "Premios" },
  { key: "industrial",  label: "Industrial" }, // ⬅️ nuevo módulo
] as const;

type ModuleKey = (typeof ALL_MODULES)[number]["key"];

/** Roles en UI y en BD */
type RoleUI = "manager" | "secretary";
type RoleDB = "gerente" | "secretaria";

const roleUiToDb = (r: RoleUI): RoleDB =>
  r === "manager" ? "gerente" : "secretaria";

const roleDbToUi = (r: RoleDB | null | undefined): RoleUI =>
  r === "gerente" ? "manager" : "secretary";

/** Tipos */
interface AdminUser {
  id: string;
  email: string | null;
  full_name: string | null;
  role: RoleDB | null;
  banned_until: string | null;
  created_at: string | null;
}

/** Helpers */
const fmtDateTime = (iso?: string | null) => {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("es-PE");
  } catch {
    return "—";
  }
};

const toFutureISO = (years = 100) => {
  const d = new Date();
  d.setFullYear(d.getFullYear() + years);
  return d.toISOString();
};

export default function UsersAccess() {
  const [loading, setLoading] = useState(false);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [search, setSearch] = useState("");

  // Panel de permisos (solo secretarias)
  const [selectedSecretaryId, setSelectedSecretaryId] = useState<string>("");
  const [secModules, setSecModules] = useState<ModuleKey[]>([]);

  const secretaries = useMemo(
    () => users.filter((u) => (u.role ?? "secretaria") === "secretaria"),
    [users]
  );

  /* ================== CARGA DE USUARIOS ================== */
  const loadUsers = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from(USERS_TABLE)
      .select("id, email, full_name, role, banned_until, created_at")
      .order("created_at", { ascending: false })
      .returns<AdminUser[]>();

    if (error) {
      console.error(error);
      alert("No se pudieron cargar los usuarios: " + error.message);
    } else {
      setUsers(data ?? []);
    }
    setLoading(false);
  };

  /* =============== CARGA PERMISOS (RPC) =================== */
  const loadSecretaryPerms = async (userId: string) => {
    if (!userId) {
      setSecModules([]);
      return;
    }

    // RPC: get_user_modules(p_user uuid) -> text[]
    const { data, error } = await supabase.rpc<"get_user_modules", string[]>(
      "get_user_modules",
      { p_user: userId }
    );

    if (error) {
      console.error(error);
      alert("No se pudieron cargar permisos: " + error.message);
      return;
    }

    const mods = ((data ?? []) as string[])
      .filter((x): x is ModuleKey => ALL_MODULES.some((m) => m.key === x))
      .sort();

    setSecModules(mods);
  };

  useEffect(() => {
    loadUsers();
  }, []);

  useEffect(() => {
    if (selectedSecretaryId) loadSecretaryPerms(selectedSecretaryId);
  }, [selectedSecretaryId]);

  /* ================ ACCIONES SOBRE USUARIOS ================ */
  const updateRole = async (id: string, roleUi: RoleUI) => {
    const role: RoleDB = roleUiToDb(roleUi);
    setLoading(true);
    const { error } = await supabase
      .from(USERS_TABLE)
      .update({ role })
      .eq("id", id);
    setLoading(false);
    if (error) {
      alert("No se pudo actualizar el rol: " + error.message);
      return;
    }
    setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, role } : u)));
  };

  const suspendUser = async (id: string) => {
    if (!confirm("¿Suspender acceso de este usuario?")) return;
    const until = toFutureISO(100);
    setLoading(true);
    const { error } = await supabase
      .from(USERS_TABLE)
      .update({ banned_until: until })
      .eq("id", id);
    setLoading(false);
    if (error) {
      alert("No se pudo suspender: " + error.message);
      return;
    }
    setUsers((prev) =>
      prev.map((u) => (u.id === id ? { ...u, banned_until: until } : u))
    );
  };

  const restoreUser = async (id: string) => {
    setLoading(true);
    const { error } = await supabase
      .from(USERS_TABLE)
      .update({ banned_until: null })
      .eq("id", id);
    setLoading(false);
    if (error) {
      alert("No se pudo rehabilitar: " + error.message);
      return;
    }
    setUsers((prev) =>
      prev.map((u) => (u.id === id ? { ...u, banned_until: null } : u))
    );
  };

  /* ============= PERMISOS DE SECRETARIA (RPC) ============= */
  const toggleModule = (key: ModuleKey) => {
    setSecModules((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  const saveSecretaryPerms = async () => {
    if (!selectedSecretaryId) return alert("Selecciona una secretaria.");

    setLoading(true);

    // RPC: save_user_modules(p_user uuid, p_modules text[]) -> void
    const { error } = await supabase.rpc<"save_user_modules", null>(
      "save_user_modules",
      {
        p_user: selectedSecretaryId,
        p_modules: secModules as unknown as string[],
      }
    );

    setLoading(false);

    if (error) {
      console.error(error);
      alert("No se pudieron guardar los permisos: " + error.message);
      return;
    }

    await loadSecretaryPerms(selectedSecretaryId);
    alert("Permisos guardados.");
  };

  /* ===================== FILTRO BÁSICO ===================== */
  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      (u) =>
        (u.email ?? "").toLowerCase().includes(q) ||
        (u.full_name ?? "").toLowerCase().includes(q)
    );
  }, [users, search]);

  /* ========================= RENDER ======================== */
  return (
    <>
      {/* Gestión de usuarios */}
      <Section
        title="Gestión de usuarios"
        right={
          <div className="flex items-center gap-2">
            <input
              placeholder="Buscar por nombre/correo"
              className="border rounded-lg px-3 py-2"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <button
              className="px-3 py-2 rounded-lg border"
              onClick={loadUsers}
              disabled={loading}
            >
              Recargar
            </button>
          </div>
        }
      >
        <Table
          keyField="id"
          rows={filteredUsers}
          emptyMessage={loading ? "Cargando usuarios..." : "Sin usuarios"}
          columns={[
            {
              key: "full_name",
              label: "Nombre",
              render: (r: AdminUser) => r.full_name ?? "—",
            },
            {
              key: "email",
              label: "Correo",
              render: (r: AdminUser) => r.email ?? "—",
            },
            {
              key: "role",
              label: "Rol",
              render: (r: AdminUser) => {
                const roleUI: RoleUI = roleDbToUi(r.role);
                return (
                  <select
                    value={roleUI}
                    onChange={(e) =>
                      updateRole(r.id, e.target.value as RoleUI)
                    }
                    className="border rounded-lg px-2 py-1"
                  >
                    <option value="manager">Gerente general</option>
                    <option value="secretary">Secretaria</option>
                  </select>
                );
              },
            },
            {
              key: "status",
              label: "Estado",
              render: (r: AdminUser) =>
                r.banned_until ? (
                  <span className="px-2 py-1 rounded bg-red-50 text-red-700 text-sm">
                    Suspendido (hasta {fmtDateTime(r.banned_until)})
                  </span>
                ) : (
                  <span className="px-2 py-1 rounded bg-emerald-50 text-emerald-700 text-sm">
                    Activo
                  </span>
                ),
            },
            {
              key: "actions",
              label: "Acciones",
              render: (r: AdminUser) => (
                <div className="flex gap-2">
                  {r.banned_until ? (
                    <button
                      onClick={() => restoreUser(r.id)}
                      className="px-2 py-1 rounded-lg border bg-emerald-600 text-white"
                      disabled={loading}
                    >
                      Rehabilitar
                    </button>
                  ) : (
                    <button
                      onClick={() => suspendUser(r.id)}
                      className="px-2 py-1 rounded-lg border text-red-600"
                      disabled={loading}
                    >
                      Suspender
                    </button>
                  )}
                </div>
              ),
            },
          ]}
        />
      </Section>

      {/* Permisos por módulos (solo secretarias) */}
      <Section title="Permisos de secretaria (por módulos)" right={<div />}>
        <div className="grid md:grid-cols-3 gap-3 mb-4">
          <label className="flex flex-col">
            <span className="text-xs text-gray-500">Secretaria</span>
            <select
              className="border rounded-xl px-3 py-2"
              value={selectedSecretaryId}
              onChange={(e) => setSelectedSecretaryId(e.target.value)}
            >
              <option value="">— seleccionar —</option>
              {secretaries.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.full_name ?? s.email ?? s.id}
                </option>
              ))}
            </select>
          </label>

          <div className="md:col-span-2 flex items-end">
            <button
              onClick={saveSecretaryPerms}
              className="px-3 py-2 rounded-xl bg-emerald-600 text-white disabled:opacity-60"
              disabled={!selectedSecretaryId || loading}
            >
              Guardar permisos
            </button>
          </div>
        </div>

        {selectedSecretaryId ? (
          <div className="grid md:grid-cols-4 gap-3">
            {ALL_MODULES.map((m) => (
              <label
                key={m.key}
                className="flex items-center gap-2 border rounded-xl px-3 py-2"
              >
                <input
                  type="checkbox"
                  checked={secModules.includes(m.key)}
                  onChange={() => toggleModule(m.key)}
                />
                <span>{m.label}</span>
              </label>
            ))}
          </div>
        ) : (
          <div className="text-gray-500">
            Selecciona una secretaria para editar permisos.
          </div>
        )}
      </Section>
    </>
  );
}
