import avisoDeudaTemplate from './src/template/avisoDeuda.template.js';

const html = avisoDeudaTemplate({
    cliente: 92,
    nombre: 'COINAR SRL',
    celular: '3455281448',
    total_saldo: 961838.5,
    comprobantes: [
        {
            fecha_comprobante: '2026-04-01',
            comprobante: '23 - FCA - 20657',
            fecha_vencimiento: '2026-04-09',
            importe_total: 860840.91,
            saldo: 860840.91,
        },
        {
            fecha_comprobante: '2026-04-13',
            comprobante: '22 - CCA - 9916',
            fecha_vencimiento: '2026-04-21',
            importe_total: -83944.11,
            saldo: -83944.11,
        },
        {
            fecha_comprobante: '2026-04-13',
            comprobante: '23 - FCA - 20768',
            fecha_vencimiento: '2026-04-21',
            importe_total: 184941.7,
            saldo: 184941.7,
        },
        {
            fecha_comprobante: '2026-04-16',
            comprobante: '23 - CCA - 12290',
            fecha_vencimiento: '2026-04-24',
            importe_total: -26592.73,
            saldo: -26592.73,
        },
        {
            fecha_comprobante: '2026-04-16',
            comprobante: '23 - FCA - 20798',
            fecha_vencimiento: '2026-04-24',
            importe_total: 42633.72,
            saldo: 42633.72,
        },
        {
            fecha_comprobante: '2026-04-16',
            comprobante: '23 - FCA - 20802',
            fecha_vencimiento: '2026-04-24',
            importe_total: 35271.98,
            saldo: 35271.98,
        },
    ],
});

console.log(html);
