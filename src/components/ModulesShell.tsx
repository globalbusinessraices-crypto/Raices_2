// src/components/ModulesShell.tsx
import React from "react";
import { Outlet } from "react-router-dom";
import BreadcrumbsRG from "./BreadcrumbsRG";

export default function ModulesShell() {
  return (
    <div>
      {/* Breadcrumbs arriba de todas las interfaces de módulos */}
      <div className="mb-4">
        <BreadcrumbsRG />
      </div>

      {/* Aquí renderiza la pantalla del módulo */}
      <Outlet />
    </div>
  );
}
