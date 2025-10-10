import React from "react";

export default function Table({ columns, rows, keyField = "id" }) {
  return (
    <div className="overflow-auto">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="bg-gray-100">
            {columns.map((c) => (
              <th
                key={c.key}
                className="text-left px-3 py-2 font-medium"
              >
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td
                className="px-3 py-3 text-gray-500"
                colSpan={columns.length}
              >
                Sin datos
              </td>
            </tr>
          )}
          {rows.map((r) => (
            <tr key={r[keyField]} className="border-b last:border-b-0">
              {columns.map((c) => (
                <td key={c.key} className="px-3 py-2 align-top">
                  {c.render ? c.render(r) : r[c.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
