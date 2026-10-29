# Migración del aviso PROGRAMADA del ERP a WEP

La API inicia `wep-programmed-scheduler.js`. Por defecto queda desactivado y en
simulación. No modifica la tarea 73, credenciales ni configuración productiva.
Reutiliza el servicio Meta existente y las variables `WHATSAPP_TOKEN`,
`WABA_PHONE_NUMBER_ID`, `WABA_VERSION`, `WEP_WHATSAPP_TEMPLATE_PROGRAMADA` y
`WEP_WHATSAPP_TEMPLATE_PROGRAMADA_LANG`. No copiar el token a la PWA ni a logs.

## Comportamiento

Dato confirmado por el usuario: producción utiliza múltiples instancias.
En el despliegue verificar que `NODE_APP_INSTANCE` esté definido en cada una
y que exista una instancia con valor `0`. Sólo ésta debe agendar los avisos;
las demás atienden solicitudes sin iniciar el cron. Si el gestor de procesos
no define esa variable, configurar explícitamente una única instancia ejecutora
antes de activar `WEP_PROGRAMMED_ENABLED`. No asumir proceso único en producción.

- Revisa cada cinco minutos, todos los días, entre 06:00 inclusive y 21:00
  exclusive en America/Argentina/Buenos_Aires. Última revisión nominal: 20:55.
- Procesa sólo entregas cuya fecha de entrega es HOY, no todas las fechas futuras
  importadas. No dispara al arrancar; espera al próximo horario del cron.
- Primero sincroniza HOY desde el ERP con el servicio existente. Si falla,
  devuelve `ok` distinto de true o informa `skipped`, no procesa avisos.
- El scheduler de importación general puede mantenerse: si tiene el bloqueo,
  este proceso omite el ciclo y vuelve a revisar en cinco minutos.
- Reutiliza las reglas actuales por parada, los teléfonos y la plantilla WEP:
  BODY pedido/horaDesde/horaHasta, botón dinámico con publicId. La plantilla ERP
  `envio_pedido` usa otro contrato; no cambiar sólo su nombre en WEP.
- La simulación sincroniza datos en WEP pero no envía mensajes ni crea registros
  de notificación/tracking para el envío. La sincronización puede crear tracking
  según su comportamiento existente.
- Sólo la instancia PM2 0 (o proceso único) agenda; evita solapamientos locales.
  Las reservas transaccionales existentes protegen cada parada entre procesos
  y también frente al endpoint manual.
- Los avisos ENVIADO/ENTREGADO/LEIDO/PENDIENTE bloquean un nuevo envío. Los ERROR
  vuelven a ser candidatos en el próximo ciclo. Un PENDIENTE atascado requiere
  revisión; no se libera automáticamente porque el proveedor pudo aceptarlo.
- Se conserva el manejo de fallos del servicio actual: ante una respuesta perdida
  o un fallo de persistencia después de que Meta acepte, un reintento podría
  duplicar el mensaje. No se garantiza entrega exactamente una vez.
- No hay reconciliación automática con los avisos enviados por la tarea 73,
  nuevos avisos por cambio de franja ni recuperación de horarios con la API caída.
  Los estados elegibles actuales son PROGRAMADA, ASIGNADA y EN_REPARTO.

## Validación y cambio de emisor

1. Verificar en el entorno del servidor el token de Meta que ya funciona, su
   número emisor y la plantilla WEP aprobada con el contrato correspondiente.
   No se requieren tokens en el frontend.
2. Probar una sola parada con el endpoint manual `/api/wep/admin/notificaciones/programadas/test`
   y teléfono controlado; verificar pedido, horas y enlace de seguimiento.
3. Activar sólo la simulación y reiniciar la API:

   ```dotenv
   WEP_PROGRAMMED_ENABLED=true
   WEP_PROGRAMMED_DRY_RUN=true
   WEP_PROGRAMMED_CRON=*/5 * * * *
   WEP_PROGRAMMED_START=06:00
   WEP_PROGRAMMED_END=21:00
   ```

   Revisar `[WEP AUTO PROGRAMADA]`, candidatos, faltantes de teléfono y errores.
   Un ciclo simulado no reserva ni marca clientes como notificados.
4. Para evitar reenviar avisos del ERP, hacer el cambio antes del primer ciclo
   de un día nuevo: deshabilitar la tarea 73 y comprobar que no quede ejecutándose
   ni tenga mensajes pendientes en su mecanismo de salida. Si se migra durante
   el día, conciliar primero los destinatarios ya avisados por ERP; WEP no los conoce.
5. Establecer `WEP_PROGRAMMED_DRY_RUN=false` y reiniciar la API. Revisar el primer
   ciclo real en `public.notificaciones` y en Meta. ENVIADO significa que Meta
   devolvió un messageId; no confirma recepción o lectura del cliente.

La sincronización previa está incluida: este scheduler no requiere activar
`WEP_SYNC_ENABLED`, aunque necesita las conexiones ERP/WEP del servicio existente.
La importación conserva su alcance actual de vehículos y reglas; confirmar que
cubra todos los clientes de la tarea 73 antes de retirarla.

## Detener o volver al ERP

Configurar `WEP_PROGRAMMED_ENABLED=false` y reiniciar la API. Comprobar que termine
cualquier envío en curso. Antes de reactivar ERP conciliar los avisos enviados
por WEP, porque ERP tampoco los deduplica. No habilitar ambos emisores a la vez.

## Pruebas sin envíos reales

```powershell
node --test src/modules/wep/wep-programmed-scheduler.test.js src/modules/wep/wep-programmed-notifications.test.js src/modules/wep/wep-sync-scheduler.test.js
node --check api.js
```
