// src/components/inputs/AsyncCombobox.jsx
import React, { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { Combobox, Transition } from "@headlessui/react";
import useDebouncedValue from "../../app/hooks/useDebouncedValue.js";

// Utilidad para resaltar coincidencias
const highlight = (text, query) => {
  if (!query) return text;
  const parts = String(text).split(new RegExp(`(${query.replace(/[-/\\^$*+?.()|[\]{}]/g,"\\$&")})`, "ig"));
  return parts.map((p, i) =>
    p.toLowerCase() === query.toLowerCase()
      ? <mark key={i} className="bg-yellow-200">{p}</mark>
      : <span key={i}>{p}</span>
  );
};

/**
 * Props:
 *  - value: objeto o null
 *  - onChange: (option|null) => void
 *  - fetcher: async (query:string) => Promise<Option[]>
 *  - displayValue: (option|null) => string
 *  - placeholder?: string
 *  - renderOption?: (option, query) => ReactNode
 *  - emptyText?: string
 */
export default function AsyncCombobox({
  value,
  onChange,
  fetcher,
  displayValue,
  placeholder = "Buscar…",
  renderOption,
  emptyText = "Sin resultados",
}) {
  const [query, setQuery] = useState("");
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const debounced = useDebouncedValue(query, 300);
  const firstLoad = useRef(true);

  // Carga inicial (top N) y cada vez que cambia el query
  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const rows = await fetcher(debounced);
        if (alive) setItems(rows || []);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [debounced, fetcher]);

  const text = useMemo(() => displayValue?.(value) || "", [value, displayValue]);

  return (
    <Combobox value={value} onChange={onChange} nullable>
      <div className="relative">
        <Combobox.Input
          className="w-full border rounded-xl px-3 py-2"
          placeholder={placeholder}
          displayValue={() => text}
          onChange={(e) => { setQuery(e.target.value); firstLoad.current = false; }}
        />
        <Transition as={Fragment} leave="transition ease-in duration-100" leaveFrom="opacity-100" leaveTo="opacity-0" afterLeave={() => setQuery(query)}>
          <Combobox.Options className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-xl border bg-white shadow-lg focus:outline-none">
            {loading && (
              <div className="px-3 py-2 text-sm text-gray-500">Cargando…</div>
            )}
            {!loading && items.length === 0 && (
              <div className="px-3 py-2 text-sm text-gray-500">{firstLoad.current ? "Escribe para buscar…" : emptyText}</div>
            )}
            {!loading && items.map((item) => (
              <Combobox.Option
                key={item.id}
                value={item}
                className={({ active }) =>
                  `cursor-pointer select-none px-3 py-2 ${active ? "bg-gray-100" : ""}`
                }
              >
                {renderOption
                  ? renderOption(item, debounced)
                  : <div className="truncate">{highlight(displayValue(item), debounced)}</div>}
              </Combobox.Option>
            ))}
          </Combobox.Options>
        </Transition>
      </div>
    </Combobox>
  );
}
