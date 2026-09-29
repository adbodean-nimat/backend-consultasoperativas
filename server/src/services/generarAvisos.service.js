import avisoDeudaTemplate from "../templates/avisoDeuda.template.js";
import {
  crearNavegadorPdf,
  generarPdfDesdeHtml,
} from "../services/pdf.service.js";
import Db from "../../dboperacion.js";

function resultadoError(item, tipoEnvio, error) {
  return {
    cliente: item.cliente,
    nombre: item.nombre,
    celular: item.celular_limpio || null,
    tipoEnvio,
    ok: false,
    motivo: error?.message || String(error),
  };
}

export async function generarPdfsAvisosDeudaRevendedores() {
  const clientes = await Db.obtenerClientesWhatsapp(8, 1000);
  const revendedores = await Db.obtenerClientesRevendedorWhatsapp(8, 1000);

  const clientesDuplicados = clientes[0].filter((item) => {
    return revendedores[0].find((revendedor) => {
      return revendedor.cliente === item.cliente;
    });
  });

  const revendedorFiltrados = revendedores[0].filter((item) => {
    return !clientesDuplicados.find((cliente) => {
      return cliente.cliente === item.cliente;
    });
  });

  /*   console.log("revendedores", revendedores[0].length);
  console.log("clientes", clientes[0].length);
  console.log("clientesDuplicados", clientesDuplicados.length);
  console.log("revendedorFiltrados", revendedorFiltrados.length);
  console.log(
    "total",
    revendedores[0].length + clientes[0].length - clientesDuplicados.length,
  ); */

  const resultados = [];

  if (revendedorFiltrados.length === 0) return resultados;

  const browser = await crearNavegadorPdf();

  try {
    for (const item of revendedorFiltrados) {
      try {
        const detalle = await Db.obtenerDetalleRevendedorDeudaPorCliente(
          item.cliente,
          8,
        );

        if (!detalle[0]?.length) {
          resultados.push(
            resultadoError(item, item.tipo_envio, "Sin detalle de deuda"),
          );
          continue;
        }

        const data = {
          cliente: item.cliente,
          nombre: item.nombre,
          celular: item.celular_limpio,
          total_saldo: item.total_saldo,
          comprobantes: detalle[0],
          cantidad_comprobantes: item.cantidad_comprobantes,
          tipoEnvio: item.tipo_envio,
        };

        const filename = `AVISO DE DEUDA VENCIDA - ${data.cliente}-${data.nombre}.pdf`;
        const html = avisoDeudaTemplate(data);

        const pdfPath = await generarPdfDesdeHtml(html, filename, browser);

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
      } catch (error) {
        console.error(`❌ Error generando PDF para cliente ${item.cliente}:`, error);
        resultados.push(resultadoError(item, item.tipo_envio, error));
      }
    }
  } finally {
    await browser.close().catch(() => {});
  }
  return resultados;
}

export async function generarPdfsAvisosDeuda() {
  const clientes = await Db.obtenerClientesWhatsapp(8, 1000);

  const resultados = [];

  if (clientes[0].length === 0) return resultados;

  const browser = await crearNavegadorPdf();

  try {
    for (const item of clientes[0]) {
      try {
        const detalle = await Db.obtenerDetalleDeudaPorCliente(item.cliente, 8);

        if (!detalle[0]?.length) {
          resultados.push(resultadoError(item, "CLIENTE", "Sin detalle de deuda"));
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

        const filename = `AVISO DE DEUDA VENCIDA - ${data.cliente}-${data.nombre}.pdf`;
        const html = avisoDeudaTemplate(data);

        const pdfPath = await generarPdfDesdeHtml(html, filename, browser);

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
      } catch (error) {
        console.error(`❌ Error generando PDF para cliente ${item.cliente}:`, error);
        resultados.push(resultadoError(item, "CLIENTE", error));
      }
    }
  } finally {
    await browser.close().catch(() => {});
  }

  return resultados;
}
