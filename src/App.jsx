// src/App.jsx
import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Layout from "./app/Layout";
import AppRoutes from "./app/routes";
import Login from "./modules/auth/Login";
import Home from "./modules/home/Home";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Login sin layout */}
        <Route path="/login" element={<Login />} />

        {/* Home sin layout */}
        <Route path="/home" element={<Home />} />

        {/* Resto de módulos con layout */}
        <Route path="/*" element={<Layout />}>
          <Route path="*" element={<AppRoutes />} />
        </Route>

        {/* Redirección raíz */}
        <Route path="/" element={<Navigate to="/home" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
