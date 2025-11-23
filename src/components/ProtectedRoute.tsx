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

  const required: ModuleKey | undefined = need?.module ?? requiredPerm;

  // ===============================
  // 🔵 1) Mientras permisos cargan
  // ===============================
  if (loading) {
    return (
      <div className="w-full h-[200px] grid place-content-center text-gray-400">
        Cargando permisos…
      </div>
    );
  }

  // ===============================
  // 🔴 2) Usuario NO logueado
  // ===============================
  if (!logged) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  // ===============================
  // 🟡 3) Validación de módulo
  // ===============================
  if (required && !can(required)) {
    return (
      <div className="p-6 text-red-600">
        No tienes permiso para acceder a este módulo.
      </div>
    );
  }

  // ===============================
  // 🟢 4) OK → renderizar hijos
  // ===============================
  return <>{children}</>;
}
