import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import timezone from 'dayjs/plugin/timezone.js';

dayjs.extend(utc);
dayjs.extend(timezone);

const TZ = 'America/Argentina/Buenos_Aires';

export function formatDate(value) {
    if (!value) return '';
    //console.log('formatDate', value);
    const date = dayjs.utc(value);
    return date.format('DD/MM/YYYY');
}

export function formatMoney(value) {
    const number = Number(value || 0);

    return new Intl.NumberFormat('es-AR', {
        style: 'currency',
        currency: 'ARS',
        minimumFractionDigits: 2,
    }).format(number);
}
