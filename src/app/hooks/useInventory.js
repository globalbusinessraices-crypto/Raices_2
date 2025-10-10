import { useState } from "react";

const todayISO = () => new Date().toISOString().slice(0, 10);

export default function useInventory(initialProducts) {
  const [stock, setStock] = useState(() => {
    const s = {}; initialProducts.forEach(p => { s[p.id] = 0; });
    return s;
  });
  const [kardex, setKardex] = useState([]);

  const moveIn = (productId, qty, note = "", ref = null) => {
    setStock((prev) => ({ ...prev, [productId]: (prev[productId] || 0) + qty }));
    setKardex((prev) => [...prev, { date: todayISO(), type: "IN", productId, qty, note, ref }]);
  };

  const moveOut = (productId, qty, note = "", ref = null) => {
    setStock((prev) => ({ ...prev, [productId]: Math.max(0, (prev[productId] || 0) - qty) }));
    setKardex((prev) => [...prev, { date: todayISO(), type: "OUT", productId, qty, note, ref }]);
  };

  const adjust = (productId, qty, note = "") => {
    setStock((prev) => ({ ...prev, [productId]: Math.max(0, (prev[productId] || 0) + qty) }));
    setKardex((prev) => [...prev, { date: todayISO(), type: "ADJUST", productId, qty, note }]);
  };

  return { stock, kardex, moveIn, moveOut, adjust };
}
