import dotenv from "dotenv";
import { generarPdfsAvisosDeudaRevendedores } from "./src/services/generarAvisos.service.js";
import { enviarTemplateDeudaConPdf } from "./src/services/whatsapp.service.js";
import { formatMoney } from "./src/utils/formatters.js";
import Pg from "./dboperacion_pg.js";

dotenv.config();

// Toto     543454326820
// Javier   543455085907
// Daniel   543454144212
// Sistemas 543455281448

const TELEFONO_TEST = "543454326820";

async function testEnvio() {
  try {
    const resultados = await generarPdfsAvisosDeudaRevendedores();

    for (const cliente of resultados.filter((c) => c.cliente === 37921)) {
      try {
        if (!cliente.ok) {
          await Pg.registrarEnvioWhatsapp({
            clienteId: cliente.cliente,
            clienteNombre: cliente.nombre,
            telefono: TELEFONO_TEST,
            estado: "SIN_PDF",
            errorMessage: cliente.motivo,
            tipoEnvio: cliente.tipoEnvio,
          });
          continue;
        }

        if (!cliente.celular) {
          await Pg.registrarEnvioWhatsapp({
            clienteId: cliente.cliente,
            clienteNombre: cliente.nombre,
            telefono: TELEFONO_TEST,
            estado: "SIN_TELEFONO",
            tipoEnvio: cliente.tipoEnvio,
          });
          continue;
        }

        const envio = await enviarTemplateDeudaConPdf({
          telefono: TELEFONO_TEST,
          clienteId: cliente.cliente,
          nombreCliente: cliente.nombre,
          totalSaldo: formatMoney(cliente.total_saldo),
          cantidadComprobantes: cliente.cantidad_comprobantes,
          pdfPath: cliente.pdfPath,
          filename: cliente.filename,
        });

        await Pg.registrarEnvioWhatsapp({
          clienteId: cliente.cliente,
          clienteNombre: cliente.nombre,
          telefono: TELEFONO_TEST,
          pdfFilename: cliente.filename,
          pdfPath: cliente.pdfPath,
          templateName: process.env.WHATSAPP_TEMPLATE_NAME,
          mediaId: envio.mediaId,
          whatsappMessageId: envio.result?.messages?.[0]?.id || null,
          estado: "ENVIADO",
          metaResponse: envio.result,
          tipoEnvio: cliente.tipoEnvio,
        });

        // 👇 pequeño delay para no saturar Meta
        //await new Promise((r) => setTimeout(r, 800));
      } catch (error) {
        console.error(`❌ Error cliente ${cliente.cliente}`, error.message);

        await Pg.registrarEnvioWhatsapp({
          clienteId: cliente.cliente,
          clienteNombre: cliente.nombre,
          telefono: TELEFONO_TEST,
          pdfFilename: cliente.filename,
          pdfPath: cliente.pdfPath,
          templateName: process.env.WHATSAPP_TEMPLATE_NAME,
          estado: "ERROR",
          errorMessage: error.message,
          tipoEnvio: cliente.tipoEnvio,
        });
      }
    }
    console.log("✅ Proceso finalizado");
  } catch (error) {
    console.error("❌ Error procesoEnvio:", error);
  }
}

testEnvio();
