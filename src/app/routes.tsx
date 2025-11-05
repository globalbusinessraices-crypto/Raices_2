// src/app/routes.tsx
import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import ProtectedRoute from "../components/ProtectedRoute";

// Páginas / módulos
import Home from "../modules/home/Home";
import Login from "../modules/auth/Login";

import Sales from "../modules/sales/Sales";
import Receivables from "../modules/receivables/Receivables";
import Purchases from "../modules/purchases/Purchases";
import Inventory from "../modules/inventory/Inventory";
import Services from "../modules/services/Services";
import Maintenance from "../modules/maintenance/Maintenance";
import Clients from "../modules/clients/Clients";
import Suppliers from "../modules/suppliers/Suppliers";
import Products from "../modules/products/Products";
import Rewards from "../modules/rewards/Premios";
import UsersAccess from "../modules/config/UsersAccess";

/**
 * Wrappers de compatibilidad: varias pantallas fueron creadas para App.jsx y esperan props.
 * Mientras migramos a router, las envolvemos con props mínimas para evitar errores TS.
 */
const SalesPage        = () => <Sales        {...({} as any)} />;
const ReceivablesPage  = () => <Receivables  {...({} as any)} />;
const PurchasesPage    = () => <Purchases    {...({} as any)} />;
const InventoryPage    = () => <Inventory    {...({ products: [], stock: {}, kardex: [] } as any)} />;
const ServicesPage     = () => <Services     {...({ clients: [], units: [], jobs: [], attendJob: () => {} } as any)} />;
const MaintenancePage  = () => <Maintenance  {...({ clients: [], products: [], inventory: {} } as any)} />;
const ClientsPage      = () => <Clients      {...({} as any)} />;
const SuppliersPage    = () => <Suppliers    {...({} as any)} />;
const ProductsPage     = () => <Products     {...({} as any)} />;
const RewardsPage      = () => <Rewards      {...({} as any)} />;
const UsersAccessPage  = () => <UsersAccess />;

export default function AppRoutes() {
  return (
    <Routes>
      {/* Raíz: manda al Home (si no hay sesión, ProtectedRoute mostrará login link/bloqueo según tu implementación) */}
      <Route path="/" element={<Navigate to="/home" replace />} />

      {/* Login público */}
      <Route path="/login" element={<Login />} />

      {/* Home (solo requiere sesión, no un permiso de módulo) */}
      <Route
        path="/home"
        element={
          <ProtectedRoute>
            <Home />
          </ProtectedRoute>
        }
      />

      {/* Módulos protegidos por permiso */}
      <Route
        path="/sales"
        element={
          <ProtectedRoute requiredPerm="sales">
            <SalesPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/receivables"
        element={
          <ProtectedRoute requiredPerm="receivables">
            <ReceivablesPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/purchases"
        element={
          <ProtectedRoute requiredPerm="purchases">
            <PurchasesPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/inventory"
        element={
          <ProtectedRoute requiredPerm="inventory">
            <InventoryPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/services"
        element={
          <ProtectedRoute requiredPerm="services">
            <ServicesPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/maintenance"
        element={
          <ProtectedRoute requiredPerm="maintenance">
            <MaintenancePage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/clients"
        element={
          <ProtectedRoute requiredPerm="clients">
            <ClientsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/suppliers"
        element={
          <ProtectedRoute requiredPerm="suppliers">
            <SuppliersPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/products"
        element={
          <ProtectedRoute requiredPerm="products">
            <ProductsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/rewards"
        element={
          <ProtectedRoute requiredPerm="rewards">
            <RewardsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/users"
        element={
          <ProtectedRoute requiredPerm="users">
            <UsersAccessPage />
          </ProtectedRoute>
        }
      />

      {/* Aliases en español -> redirecciones a rutas canónicas */}
      <Route path="/ventas"        element={<Navigate to="/sales" replace />} />
      <Route path="/cobros"        element={<Navigate to="/receivables" replace />} />
      <Route path="/compras"       element={<Navigate to="/purchases" replace />} />
      <Route path="/inventario"    element={<Navigate to="/inventory" replace />} />
      <Route path="/servicios"     element={<Navigate to="/services" replace />} />
      <Route path="/mantenimiento" element={<Navigate to="/maintenance" replace />} />
      <Route path="/clientes"      element={<Navigate to="/clients" replace />} />
      <Route path="/proveedores"   element={<Navigate to="/suppliers" replace />} />
      <Route path="/productos"     element={<Navigate to="/products" replace />} />
      <Route path="/premios"       element={<Navigate to="/rewards" replace />} />
      <Route path="/usuarios"      element={<Navigate to="/users" replace />} />

      {/* 404 */}
      <Route path="*" element={<div className="p-6">Página no encontrada</div>} />
    </Routes>
  );
}
