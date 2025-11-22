// src/components/ProtectedRoute.tsx
import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import usePerms, { ModuleKey } from "../app/hooks/usePerms";

type Props = {
  children: React.ReactNode;
  requiredPerm?: ModuleKey;
  need?: { module: ModuleKey };
};

export default function ProtectedRoute({ children, requiredPerm, need }: Props) {
  const location = useLocation();
  const { loading, logged, can } = usePerms();

  // DEBUG LOGS
  console.log("%c[ProtectedRoute] ===== ENTER =====", "color: #00bfff; font-weight: bold;");
  console.log("loading:", loading);
  console.log("logged:", logged);
  console.log("requiredPerm:", requiredPerm);
  console.log("need:", need);
  console.log("module required:", need?.module ?? requiredPerm);
  console.log("location.pathname:", location.pathname);

  // mientras carga permisos o sesión
  if (loading) {
    console.log("%c[ProtectedRoute] loading... ⏳", "color: orange;");
    return null;
  }

  // no está logueado → mandar a login
  if (!logged) {
    console.log("%c[ProtectedRoute] NOT LOGGED → redirect /login", "color: red; font-weight: bold;");
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  const required: ModuleKey | undefined = need?.module ?? requiredPerm;

  if (required) {
    const allowed = can(required);
    console.log("Checking perm:", required, "→ allowed:", allowed);

    if (!allowed) {
      console.log("%c[ProtectedRoute] NO PERMISSION ❌", "color: red; font-weight: bold;");
      return (
        <div className="p-6 text-red-600">
          No tienes permiso para acceder a este módulo.
        </div>
      );
    }
  }

  console.log("%c[ProtectedRoute] ACCESS GRANTED ✔", "color: green; font-weight: bold;");
  return <>{children}</>;
}
