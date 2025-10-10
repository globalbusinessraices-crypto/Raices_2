// src/components/filters/MonthSelect.jsx
import React, { useEffect, useMemo, useState } from "react";

const pad2 = (n) => String(n).padStart(2, "0");
const MONTHS_ES = [
  "enero","febrero","marzo","abril","mayo","junio",
  "julio","agosto","septiembre","octubre","noviembre","diciembre"
];

function monthRangeISO(yyyyMm) {
  const [yStr, mStr] = yyyyMm.split("-");
  const y = Number(yStr), m = Number(mStr); // 1..12
  const from = `${y}-${pad2(m)}-01`;
  const lastDay = new Date(y, m, 0).getDate(); // último día del mes local
  const to = `${y}-${pad2(m)}-${pad2(lastDay)}`;
  return { from, to };
}

/**
 * props:
 * - initialKey?: "YYYY-MM" (por ej. "2025-09"), opcional
 * - monthsBack?: cuántos meses hacia atrás listar (default 18)
 * - onRangeChange: ({ from, to, key }) => void
 * - className?: estilos extra
 */
export default function MonthSelect({
  initialKey,
  monthsBack = 18,
  onRangeChange,
  className = ""
}) {
  const today = new Date();
  const currentKey = `${today.getFullYear()}-${pad2(today.getMonth() + 1)}`;

  const options = useMemo(() => {
    const arr = [];
    let y = today.getFullYear();
    let m = today.getMonth() + 1; // 1..12
    for (let i = 0; i < monthsBack; i++) {
      const key = `${y}-${pad2(m)}`;
      arr.push({
        key,
        label: `${MONTHS_ES[m - 1]} ${y}`.replace(/^\w/, c => c.toUpperCase())
      });
      m -= 1;
      if (m === 0) { m = 12; y -= 1; }
    }
    return arr;
  }, [monthsBack]);

  const [key, setKey] = useState(initialKey || currentKey);

  useEffect(() => {
    const { from, to } = monthRangeISO(key);
    onRangeChange?.({ from, to, key });
  }, [key, onRangeChange]);

  return (
    <select
      value={key}
      onChange={(e) => setKey(e.target.value)}
      className={`border rounded-xl px-3 py-2 ${className}`}
      aria-label="Seleccionar mes"
      title="Seleccionar mes"
    >
      {options.map((o) => (
        <option key={o.key} value={o.key}>{o.label}</option>
      ))}
    </select>
  );
}
