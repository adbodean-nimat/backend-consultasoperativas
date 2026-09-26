// Los teléfonos de WEP provienen del ERP argentino. Un destino ambiguo se
// descarta para evitar enviar datos de una entrega a otra persona.
export function normalizeWepWhatsappPhone(value) {
  if (value === null || value === undefined) return null;

  const raw = String(value).trim();
  if (!raw) return null;

  // Incluso en pruebas evitamos unir dos teléfonos del campo alternativo.
  const blocks = raw.match(/\+?\d[\d\s().-]*/g) || [];
  if (blocks.length !== 1) return null;

  const digits = blocks[0].replace(/\D/g, "");
  // Meta puede usar un formato distinto en su entorno de prueba. Con el
  // interruptor apagado enviamos los dígitos tal como figuran en el campo.
  if (process.env.WEP_VALIDA_NRO === "false") return digits;

  let national;
  if (/^549\d{10}$/.test(digits)) {
    national = digits.slice(3);
  } else if (/^54\d{10}$/.test(digits)) {
    national = digits.slice(2);
  } else if (/^0\d{10}$/.test(digits)) {
    national = digits.slice(1);
  } else if (/^\d{10}$/.test(digits)) {
    national = digits;
  } else {
    return null;
  }

  // No inferimos el código de área de un 15 local ni aceptamos números
  // nacionales que aún contienen el prefijo de marcación móvil.
  if (national.startsWith("0") || national.startsWith("15")) return null;
  return `549${national}`;
}
