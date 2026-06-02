import avisoDeudaTemplate from "../templates/avisoDeuda.template.js";
import { generarPdfDesdeHtml } from "../services/pdf.service.js";
import Db from "../../dboperacion.js";

export async function generarPdfsAvisosDeudaRevendedores() {
  const revendedores = await Db.obtenerClientesRevendedorWhatsapp(8, 1000);

  const resultados = [];

  for (const item of revendedores[0]) {
    const detalle = await Db.obtenerDetalleRevendedorDeudaPorCliente(
      item.cliente,
      8,
    );

    if (!detalle[0]) {
      resultados.push({
        cliente: item.cliente,
        nombre: item.nombre,
        ok: false,
        motivo: "Sin detalle de deuda",
      });

      continue;
    }

    console.log(item);

    const data = {
      cliente: item.cliente,
      nombre: item.nombre,
      celular: item.celular_limpio,
      total_saldo: item.total_saldo,
      comprobantes: detalle[0],
      cantidad_comprobantes: item.cantidad_comprobantes,
      tipoEnvio: item.tipo_envio,
    };

    const filename = `aviso-deuda-${data.cliente}.pdf`;
    const html = avisoDeudaTemplate(data);

    const pdfPath = await generarPdfDesdeHtml(html, filename);

    resultados.push({
      cliente: data.cliente,
      nombre: data.nombre,
      celular: data.celular,
      total_saldo: data.total_saldo,
      comprobantes: data.comprobantes,
      cantidad_comprobantes: data.cantidad_comprobantes,
      tipoEnvio: data.tipoEnvio,
      filename,
      pdfPath,
      ok: true,
    });
  }
  return resultados;
}

export async function generarPdfsAvisosDeuda() {
  const clientes = await Db.obtenerClientesWhatsapp(8, 1000);

  const resultados = [];

  for (const item of clientes[0]) {
    const detalle = await Db.obtenerDetalleDeudaPorCliente(item.cliente, 8);

    if (!detalle[0]) {
      resultados.push({
        cliente: item.cliente,
        nombre: item.nombre,
        ok: false,
        motivo: "Sin detalle de deuda",
      });

      continue;
    }

    const data = {
      cliente: item.cliente,
      nombre: item.nombre,
      celular: item.celular_limpio,
      total_saldo: item.total_saldo,
      comprobantes: detalle[0],
      cantidad_comprobantes: detalle[0].length,
      tipoEnvio: "CLIENTE",
    };

    const filename = `aviso-deuda-${data.cliente}.pdf`;
    const html = avisoDeudaTemplate(data);

    const pdfPath = await generarPdfDesdeHtml(html, filename);

    resultados.push({
      cliente: data.cliente,
      nombre: data.nombre,
      celular: data.celular,
      total_saldo: data.total_saldo,
      comprobantes: data.comprobantes,
      cantidad_comprobantes: data.cantidad_comprobantes,
      tipoEnvio: data.tipoEnvio,
      filename,
      pdfPath,
      ok: true,
    });
  }

  return resultados;
}
