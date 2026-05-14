import { generarPdfsAvisosDeuda } from '../services/generarAvisos.service.js';
import { enviarTemplateDeudaConPdf } from '../services/whatsapp.service.js';
import { formatMoney } from '../utils/formatters.js';
import Pg from '../../dboperacion_pg.js';

export async function procesoEnvio() {
    console.log('🚀 Ejecutando envío automático de avisos de deuda...');
    try {
        const resultados = await generarPdfsAvisosDeuda();

        for (const cliente of resultados) {
            try {
                if (!cliente.ok) {
                    await Pg.registrarEnvioWhatsapp({
                        clienteId: cliente.cliente,
                        clienteNombre: cliente.nombre,
                        telefono: cliente.celular || null,
                        estado: 'SIN_PDF',
                        errorMessage: cliente.motivo,
                    });
                    continue;
                }

                if (!cliente.celular) {
                    await Pg.registrarEnvioWhatsapp({
                        clienteId: cliente.cliente,
                        clienteNombre: cliente.nombre,
                        estado: 'SIN_TELEFONO',
                    });
                    continue;
                }

                const envio = await enviarTemplateDeudaConPdf({
                    telefono: cliente.celular,
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
                    telefono: cliente.celular,
                    pdfFilename: cliente.filename,
                    pdfPath: cliente.pdfPath,
                    templateName: process.env.WHATSAPP_TEMPLATE_NAME,
                    mediaId: envio.mediaId,
                    whatsappMessageId: envio.result?.messages?.[0]?.id || null,
                    estado: 'ENVIADO',
                    metaResponse: envio.result,
                });

                // 👇 pequeño delay para no saturar Meta
                await new Promise((r) => setTimeout(r, 800));
            } catch (error) {
                console.error(`❌ Error cliente ${cliente.cliente}`, error.message);

                await Pg.registrarEnvioWhatsapp({
                    clienteId: cliente.cliente,
                    clienteNombre: cliente.nombre,
                    telefono: cliente.celular,
                    pdfFilename: cliente.filename,
                    pdfPath: cliente.pdfPath,
                    templateName: process.env.WHATSAPP_TEMPLATE_NAME,
                    estado: 'ERROR',
                    errorMessage: error.message,
                });
            }
        }

        console.log('✅ Proceso finalizado');
    } catch (error) {
        console.error('❌ Error procesoEnvio:', error);
    }
}
