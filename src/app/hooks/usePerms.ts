// src/app/hooks/usePerms.ts
import { useCallback, useEffect, useState } from "react";
import supabase from "../../lib/supabaseClient";

export type Role = "manager" | "secretary";

export type ModuleKey =
  | "summary"
  | "sales"
  | "receivables"
  | "purchases"
  | "expenses"
  | "inventory"
  | "services"
  | "industrial_services"   // ✅ NUEVO MÓDULO
  | "maintenance"
  | "clients"
  | "suppliers"
  | "products"
  | "rewards"
  | "users";

const USERS_TABLE = "profiles";
const PERMS_TABLE = "user_module_permissions";

/** 🔥 Agregamos "industrial_services" */
const ALL_MODULES: ModuleKey[] = [
  "summary",
  "sales",
  "receivables",
  "purchases",
  "expenses",
  "inventory",
  "services",
  "industrial_services",     // ✅ NUEVO
  "maintenance",
  "clients",
  "suppliers",
  "products",
  "rewards",
  "users",
];

type DbRole = "gerente" | "secretaria" | "manager" | "secretary" | null;
type PermRow = { module_key: ModuleKey };

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

    const { data: sess } = await supabase.auth.getSession();
    const uid = sess.session?.user?.id ?? null;

    setLogged(!!uid);

    if (!uid) {
      setRole("secretary");
      setModules([]);
      setLoading(false);
      return;
    }

    // Leer perfil
    const { data: prof } = await supabase
      .from(USERS_TABLE)
      .select("role")
      .eq("id", uid)
      .maybeSingle<{ role: DbRole }>();

    const r = normalizeRole(prof?.role ?? null);
    setRole(r);

    // Manager → todo
    if (r === "manager") {
      setModules(ALL_MODULES);
      setLoading(false);
      return;
    }

    // Secretaria → módulos asignados
    const { data: rows } = await supabase
      .from(PERMS_TABLE)
      .select("module_key")
      .eq("user_id", uid)
      .returns<PermRow[]>();

    const mods =
      (rows ?? [])
        .map((r) => r.module_key)
        .filter((k): k is ModuleKey => (ALL_MODULES as string[]).includes(k))
        .sort() || [];

    setModules(mods);
    setLoading(false);
  }, []);

  /** 🔥 Logout completo */
  const logout = useCallback(async () => {
    await supabase.auth.signOut();

    setLogged(false);
    setRole("secretary");
    setModules([]);

    try {
      localStorage.clear();
    } catch {}

    refresh();
  }, [refresh]);

  // Escuchar cambios de sesión
  useEffect(() => {
    refresh();
    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      refresh();
    });
    return () => sub.subscription.unsubscribe();
  }, [refresh]);

  const can = useCallback(
    (module: ModuleKey) => (role === "manager" ? true : modules.includes(module)),
    [role, modules]
  );

  return { logged, role, modules, loading, can, refresh, logout };
}
