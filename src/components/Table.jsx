import React from "react";

/**
 * Props esperadas:
 * - columns: [{ key: string, label: ReactNode, render?: (row)=>ReactNode }]
 * - rows: any[]
 * - keyField?: string  (default: "id")
 * - loading?: boolean  (default: false)
 * - emptyMessage?: string | ReactNode (default: "Sin datos")
 */
export default function Table({
  columns,
  rows,
  keyField = "id",
  loading = false,
  emptyMessage = "Sin datos",
}) {
  // Pequeña utilidad para key estable cuando una fila no tiene keyField
  const rowKey = (r, i) => (r && r[keyField] != null ? r[keyField] : `row-${i}`);

  return (
    <div className="overflow-auto">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="bg-gray-100">
            {columns.map((c) => (
              <th key={c.key} className="text-left px-3 py-2 font-medium">
                {c.label}
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {/* Estado: cargando */}
          {loading && (
            <tr>
              <td colSpan={columns.length} className="px-3 py-3 text-gray-500">
                Cargando...
              </td>
            </tr>
          )}

          {/* Estado: vacío */}
          {!loading && rows.length === 0 && (
            <tr>
              <td colSpan={columns.length} className="px-3 py-3 text-gray-500">
                {emptyMessage}
              </td>
            </tr>
          )}

          {/* Filas */}
          {!loading &&
            rows.map((r, i) => (
              <tr key={rowKey(r, i)} className="border-b last:border-b-0">
                {columns.map((c) => (
                  <td key={c.key} className="px-3 py-2 align-top">
                    {typeof c.render === "function" ? c.render(r) : r?.[c.key]}
                  </td>
                ))}
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  );
}
