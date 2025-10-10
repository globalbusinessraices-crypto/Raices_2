// src/components/charts/ChartCard.jsx
import React from "react";

export default function ChartCard({ title, children, right }) {
  return (
    <div className="border rounded-xl p-4 bg-white">
      <div className="flex items-center justify-between mb-3">
        <div className="font-medium">{title}</div>
        {right}
      </div>
      {children}
    </div>
  );
}
