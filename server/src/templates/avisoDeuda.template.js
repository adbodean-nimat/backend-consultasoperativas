import { formatMoney, formatDate } from '../utils/formatters.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const imagePath = path.join(__dirname, '../assets/membretada-2025.png');
const imageBase64 = fs.readFileSync(imagePath).toString('base64');

const imgSrc = `data:image/png;base64,${imageBase64}`;

export default function avisoDeudaTemplate(data) {
    const comprobantesRows = data.comprobantes
        .map((item) => {
            return `
        <tr>
          <td>${formatDate(item.fecha_comprobante)}</td>
          <td>${item.comprobante}</td>
          <td>${formatDate(item.fecha_vencimiento)}</td>
          <td class="right">${formatMoney(item.importe_total)}</td>
          <td class="right">${formatMoney(item.saldo)}</td>
        </tr>
      `;
        })
        .join('');

    return `
<!DOCTYPE html>
<html lang="es-AR">
<head>
  <meta charset="UTF-8" />
  <title>Aviso de deuda vencida</title>

  <style>
  a {
  color: #007c3b;
  text-decoration: none;
  font-weight: bold;
}

a:hover {
  text-decoration: underline;
}
    body {
      font-family: Arial, Helvetica, sans-serif;
      color: #222;
      margin: 0;
      padding: 32px;
      font-size: 13px;
    }

    .container {
      max-width: 820px;
      margin: 0 auto;
    }

    .header {
      border-bottom: 2px solid #333;
      padding-bottom: 12px;
      margin-bottom: 24px;
    }

    .title {
      font-size: 22px;
      font-weight: bold;
      margin: 0;
      text-transform: uppercase;
    }

    .subtitle {
      margin-top: 6px;
      color: #555;
    }

    .box {
      background: #f5f5f5;
      border: 1px solid #ddd;
      padding: 14px;
      margin-bottom: 20px;
    }

    .cliente {
      font-size: 15px;
      margin-bottom: 6px;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 18px;
    }

    th {
      background: #007c3b;
      color: #fff;
      padding: 8px;
      text-align: left;
      font-size: 12px;
    }

    td {
      border: 1px solid #ddd;
      padding: 8px;
      font-size: 12px;
    }

    tr {
      page-break-inside: avoid;
    }

    thead {
      display: table-header-group;
    }

    .right {
      text-align: right;
    }

    .total {
      margin-top: 18px;
      text-align: right;
      font-size: 17px;
      font-weight: bold;
    }

    .message {
      margin-top: 26px;
      line-height: 1.5;
    }

    .footer {
      margin-top: 32px;
      border-top: 1px solid transparent;
      padding-top: 14px;
      font-size: 12px;
      color: #555;
    }

    .warning {
      font-weight: bold;
      color: #8a0000;
    }
    
    .membrete {
      width: 100%;
      margin-bottom: 24px;
    }

    .membrete img {
      width: 100%;
      height: auto;
      display: block;
    }

    .page-break {
  page-break-before: always;
}

.info-pagos h2 {
  color: #007c3b;
  margin-bottom: 10px;
}

.info-pagos h3 {
  margin-top: 24px;
  color: #333;
}

.info-box {
  border: 1px solid #ddd;
  padding: 14px;
  margin-bottom: 16px;
  background: #f7f7f7;
}

.tabla-bancos {
  width: 100%;
  border-collapse: collapse;
  margin-top: 12px;
}

.tabla-bancos th {
  background: #007c3b;
  color: #fff;
  padding: 8px;
  text-align: left;
}

.tabla-bancos td {
  border: 1px solid #ddd;
  padding: 8px;
}

.mi-cuenta-link {
  font-size: 15px;
  font-weight: bold;
  color: #007c3b;
}
  </style>
</head>

<body>
  <div class="container">

    <div class="membrete">
      <img src="${imgSrc}" alt="Membrete de NIMAT" />
    </div>
    
    <div class="header">
      <h1 class="title">Aviso de deuda vencida</h1>
      <div class="subtitle">Los comprobantes detallados a continuación:</div>
    </div>

    <div>
      <div><strong>${data.cliente} - ${data.nombre}</strong></div>
    </div>
    <table>
      <thead>
        <tr>
          <th>Fecha</th>
          <th>Comprobante</th>
          <th>Vencimiento</th>
          <th class="right">Importe total</th>
          <th class="right">Importe saldo</th>
        </tr>
      </thead>
      <tbody>
        ${comprobantesRows}
      </tbody>
    </table>

    <div class="total">
      Total saldo: ${formatMoney(data.total_saldo)}
    </div>

    <div class="message">
      <p>
      Pueden existir otros comprobantes aún no vencidos.
      </p>
      <p>
      Por consultas comunicate a los WhatsApp 345 414 6430 (Hilda) o al 345 508 3046 (Héctor). 
      </p>
      <p>
      También lo podés hacer por mail a hilda.yelin@nimat.com.ar o hector.texo@nimat.com.ar 
      </p>
      <p class="warning">
        En caso de haber realizado la cancelación, por favor desestimar este aviso.
      </p>
    </div>

    <div class="footer">
      
    </div>

    <div class="page-break"></div>

<div class="info-pagos">
  <h2>Información de pagos</h2>

  <h3>Cuentas bancarias de PRADES S.A.</h3>

  <p>CUIT: 30-71085578-8</p>

  <table class="tabla-bancos">
    <thead>
      <tr>
        <th>Banco</th>
        <th>Sucursal</th>
        <th>Número de cuenta</th>
        <th>CBU</th>
        <th>Alias</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>Santander</td>
        <td>185</td>
        <td>185-022126/9</td>
        <td>072-0185720000002212690</td>
        <td>NIMAT.SANTANDER</td>
      </tr>
      <tr>
        <td>Macro</td>
        <td>358</td>
        <td>3-358-0940579163-2</td>
        <td>2850358-3-3009405791632-1</td>
        <td>NIMAT.MACRO</td>
      </tr>
      <tr>
        <td>Nacion</td>
        <td>1560</td>
        <td>212000475/33</td>
        <td>01102125-20021200475339</td>
        <td>NIMAT.NACION</td>
      </tr>
      <tr>
        <td>Frances</td>
        <td>068</td>
        <td>068-20-307515/5</td>
        <td>0170068820000030751550</td>
        <td>NIMAT.FRANCES</td>
      </tr>
      <tr>
        <td>Hipotecario</td>
        <td>006</td>
        <td>3-006-0000039359-5</td>
        <td>0440006630000003935955</td>
        <td>NIMAT.HIPOTECARIO</td>
      </tr>
    </tbody>
  </table>

  <h3>Gestionar Mi cuenta</h3>

  <p>
    Para consultar comprobantes, verificar deuda vencida o gestionar pagos,
    ingrese al portal de Mi cuenta:
  </p>

  <p class="mi-cuenta-link">
        🔗 <a href="https://miscuentas.nimat.com.ar/CAD/login.aspx" target="_blank">
          Ingresar a Mi cuenta
        </a>
  </p>

<p class="mi-cuenta-link">
  📄 <a href="https://www.nimat.com.ar/Content/Images/uploaded/pdf/Instructivo_Mi_Cuenta.pdf" target="_blank">
    Ver instructivo de uso
  </a>
</p>
</div>
  </div>
</body>
</html>
  `;
}
