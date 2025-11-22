// src/App.jsx
import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import AppRoutes from "./app/routes";
import Login from "./modules/auth/Login";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        
        {/* Público */}
        <Route path="/login" element={<Login />} />

        {/* Todas las rutas protegidas están dentro de AppRoutes */}
        <Route path="/*" element={<AppRoutes />} />

        {/* Redirección raíz */}
        <Route path="/" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
