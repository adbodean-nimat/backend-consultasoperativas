export function formatMoney(value) {
    const number = Number(value || 0);

    return new Intl.NumberFormat('es-AR', {
        style: 'currency',
        currency: 'ARS',
        minimumFractionDigits: 2,
    }).format(number);
}

export function formatDate(value) {
    if (!value) return '';

    const date = new Date(value);

    return new Intl.DateTimeFormat('es-AR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
    }).format(date);
}
