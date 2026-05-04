import dotenv from 'dotenv';
import { generarPdfsAvisosDeuda } from './src/services/generarAviso.service.js';
import { enviarTemplateDeudaConPdf } from './src/services/whatsapp.service.js';
import Pg from './dboperacion_pg.js';

dotenv.config();
const TELEFONO_TEST = '543455281448';

async function testEnvio() {
    try {
        const resultados = await generarPdfsAvisosDeuda();

        const test = resultados.find((c) => c.cliente === 17996); // o buscá cliente específico

        if (!test.ok) {
            console.log('Cliente sin datos');
            return;
        }

        const result = await enviarTemplateDeudaConPdf({
            telefono: TELEFONO_TEST,
            nombreCliente: test.nombre,
            pdfPath: test.pdfPath,
            filename: test.filename,
        });

        console.log('Enviado OK:', result);

        await Pg.registrarEnvioWhatsapp({
            clienteId: test.cliente,
            clienteNombre: test.nombre,
            telefono: TELEFONO_TEST,
            pdfFilename: test.filename,
            pdfPath: test.pdfPath,
            templateName: process.env.WHATSAPP_TEMPLATE_NAME,
            mediaId: result.mediaId,
            whatsappMessageId: result.result?.messages?.[0]?.id || null,
            estado: 'ENVIADO OK',
            metaResponse: result.result,
        });
    } catch (error) {
        console.error('Error enviando:', error);

        await Pg.registrarEnvioWhatsapp({
            clienteId: test.cliente,
            clienteNombre: test.nombre,
            telefono: TELEFONO_TEST,
            pdfFilename: test.filename,
            pdfPath: test.pdfPath,
            templateName: process.env.WHATSAPP_TEMPLATE_NAME,
            estado: 'CON ERROR',
            errorMessage: error.message,
        });
    }
}

testEnvio();
