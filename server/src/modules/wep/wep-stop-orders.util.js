// La secuencia operativa es editable. Elegimos NP ascendente, independiente
// del orden SQL/JS, sobre todas las entregas hijas de la parada.
// BigInt evita perder precisión al comparar números almacenados como texto.
export function resolveStopOrders(entregas = []) {
  const pedidos = [...new Set(entregas.map((entrega) => {
    const value = entrega.notaPedido?.numero ?? entrega.nota_pedido_numero ?? entrega.NumeroNotaPedido;
    if (value == null) return null;
    if (typeof value === "number" && (!Number.isSafeInteger(value) || value < 0)) return null;
    if (!["string", "number", "bigint"].includes(typeof value)) return null;
    const text = String(value).trim();
    return /^\d+$/.test(text) ? text : null;
  }).filter((value) => value !== null))].sort((a, b) => {
    const left = BigInt(a);
    const right = BigInt(b);
    return left < right ? -1 : left > right ? 1 : a < b ? -1 : a > b ? 1 : 0;
  });
  return { pedidoPrincipal: pedidos[0] ?? null, otrosPedidos: pedidos.slice(1), pedidos };
}

export class WepStopOrderUnavailableError extends Error {
  constructor() {
    super("La parada no tiene Nota de Pedido disponible");
    this.code = "PEDIDO_NO_DISPONIBLE";
  }
}

export function requireStopOrder(value) {
  if (value == null || !/^\d+$/.test(String(value).trim())) {
    throw new WepStopOrderUnavailableError();
  }
  return String(value).trim();
}
