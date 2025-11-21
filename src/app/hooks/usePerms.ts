// src/app/hooks/usePerms.ts
import { useCallback, useEffect, useState } from "react";
import supabase from "../../lib/supabaseClient";

/** Roles (UI) */
export type Role = "manager" | "secretary";

/** Claves de módulos (UI) */
export type ModuleKey =
  | "summary"        // 👈 NUEVO: Resumen General
  | "sales"
  | "receivables"
  | "purchases"
  | "expenses"
  | "inventory"
  | "services"
  | "maintenance"
  | "clients"
  | "suppliers"
  | "products"
  | "rewards"
  | "users";

/** Tablas */
const USERS_TABLE = "profiles";
const PERMS_TABLE = "user_module_permissions";

/** Catálogo completo para gerencia */
const ALL_MODULES: ModuleKey[] = [
  "summary",      // 👈 NUEVO
  "sales",
  "receivables",
  "purchases",
  "inventory",
  "services",
  "maintenance",
  "clients",
  "suppliers",
  "products",
  "rewards",
  "users",
];

/** Roles que pueden venir desde BD */
type DbRole = "gerente" | "secretaria" | "manager" | "secretary" | null;

/** Fila real de permisos: una fila por módulo */
type PermRow = { module_key: ModuleKey };

/** Normaliza rol de BD -> rol UI */
function normalizeRole(r: DbRole): Role {
  if (r === "gerente" || r === "manager") return "manager";
  return "secretary";
}

export default function usePerms() {
  const [logged, setLogged] = useState(false);
  const [role, setRole] = useState<Role>("secretary");
  const [modules, setModules] = useState<ModuleKey[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);

    // 1) Sesión actual
    const { data: sess } = await supabase.auth.getSession();
    const uid = sess.session?.user?.id ?? null;
    setLogged(!!uid);

    if (!uid) {
      setRole("secretary");
      setModules([]);
      setLoading(false);
      return;
    }

    // 2) Leer rol desde profiles
    const { data: prof, error: profErr } = await supabase
      .from(USERS_TABLE)
      .select("role")
      .eq("id", uid)
      .maybeSingle<{ role: DbRole }>();

    if (profErr) console.error("Error leyendo perfil:", profErr);
    const r = normalizeRole(prof?.role ?? null);
    setRole(r);

    // 3) Gerente => todos los módulos
    if (r === "manager") {
      setModules(ALL_MODULES);
      setLoading(false);
      return;
    }

    // 4) Secretaria => listar filas (una por módulo) y mapear module_key
    const { data: rows, error: permErr } = await supabase
      .from(PERMS_TABLE)
      .select("module_key")
      .eq("user_id", uid)
      .returns<PermRow[]>();

    if (permErr) console.error("Error leyendo permisos:", permErr);

    const mods =
      (rows ?? [])
        .map((r) => r.module_key)
        // seguridad: solo claves válidas
        .filter((k): k is ModuleKey =>
          (ALL_MODULES as string[]).includes(k as string)
        )
        .sort() || [];

    setModules(mods);
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      refresh();
    });
    return () => {
      sub.subscription.unsubscribe();
    };
  }, [refresh]);

  /** Helper de autorización por módulo */
  const can = useCallback(
    (module: ModuleKey) =>
      role === "manager" ? true : modules.includes(module),
    [role, modules]
  );

  return { logged, role, modules, loading, can, refresh };
}
