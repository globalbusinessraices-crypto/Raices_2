// src/components/ProtectedRoute.tsx
import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import usePerms, { ModuleKey } from "../app/hooks/usePerms";

type Props = {
  children: React.ReactNode;
  /** antiguo estilo: requiredPerm="sales" */
  requiredPerm?: ModuleKey;
  /** nuevo/explicito: need={{ module: 'sales' }} */
  need?: { module: ModuleKey };
};

export default function ProtectedRoute({ children, requiredPerm, need }: Props) {
  const location = useLocation();
  const { loading, logged, can } = usePerms();

  // mientras carga el rol/permisos puedes mostrar null o un spinner
  if (loading) return null;

  // si no está logueado, manda al login
  if (!logged) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  // resuelve el módulo requerido (compatibilidad con ambas props)
  const required: ModuleKey | undefined = need?.module ?? requiredPerm;

  if (required && !can(required)) {
    return (
      <div className="p-6 text-red-600">
        No tienes permiso para acceder a este módulo.
      </div>
    );
  }

  return <>{children}</>;
}
