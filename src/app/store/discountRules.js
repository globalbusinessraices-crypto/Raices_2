// Reglas de descuento por proveedor x tipo cliente
// Solo aplica a distribuidores
export const discountRules = [
  { supplierId: 1, clientType: "distribuidor", discountPct: 15 },
  { supplierId: 2, clientType: "distribuidor", discountPct: 10 },
  { supplierId: 3, clientType: "distribuidor", discountPct: 5 },
];
