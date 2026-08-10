# Monitor de transferencias duplicadas

Módulo administrativo para detectar posibles transferencias repetidas mediante `dbo.spDetectarTransferenciasDuplicadas`. No contiene la consulta ERP original, no escribe en SQL Server y no almacena credenciales en PostgreSQL.

## Arquitectura

- `duplicate-transfer-scheduler.js`: recarga cada minuto `enabled`, cron, zona horaria y versión; usa `node-cron`, control local y advisory lock distribuido.
- `duplicate-transfer-monitor.service.js`: flujo compartido por cron y HTTP.
- `duplicate-transfer.repository.js`: configuración, auditoría, movimientos, alertas y transacciones cortas en PostgreSQL.
- `sql-server-duplicate-transfer.repository.js`: única llamada permitida al stored procedure, con timeout configurable.
- `whatsapp-notification.service.js`: payload y envío desacoplado a Meta.
- `duplicate-transfer-config.service.js`: lectura, actualización y validación de configuración.
- `duplicate-transfer-review.service.js`: consulta manual paginada y estrictamente de solo lectura.

El procedimiento devuelve únicamente movimientos con `RASI_SIGNO = 'D'`. `group_key` se calcula con cuenta, importe decimal normalizado, cliente y signo. La versión vigente debe devolver `RASI_RENGLON`; `source_key` utiliza la PK de `SIST_RASI` (división, asiento y renglón). El fallback anterior se conserva temporalmente para compatibilidad, y cualquier colisión aborta la ejecución. `COMPROBANTE` es descriptivo y no forma parte de ninguna clave.

Antes de desplegar esta versión debe aplicarse, con el mecanismo operativo habitual, la migración aditiva `migrations/001_add_sign_current_account_receipt.sql`. Agrega `rasi_signo`, `ctec_ctacte_ctec` y `comprobante` sin recrear la tabla. Las filas históricas quedan con signo nulo y se reconcilian de manera conservadora al reaparecer: se preservan `first_seen_*` y `notified_at`, y más de una coincidencia histórica detiene la persistencia con un error de colisión.

La tabla de runs admite `success`, pero no `dry_run`; por compatibilidad, una simulación termina con run `success` y crea una alerta con estado `dry_run`. No se modificó esa restricción.

### Incompatibilidad confirmada del stored procedure

La definición instalada filtra `CANTIDAD_COINCIDENCIAS >= @MinCoincidencias` y rechaza `@MinCoincidencias < 2`. En consecuencia, no puede devolver ni persistir una primera transferencia aislada: cuando aparece la segunda, devuelve el grupo y ambas se guardan juntas. El envío único, la reaparición sin reenvío y la tercera ocurrencia funcionan con ese contrato, pero auditar la primera antes de que exista coincidencia requiere una versión del procedimiento que devuelva también filas con conteo 1 sin considerarlas alertables. No se alteró SQL Server.

## Variables de entorno

```env
WHATSAPP_ACCESS_TOKEN=
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_GRAPH_API_VERSION=
WHATSAPP_API_BASE_URL=https://graph.facebook.com
DUPLICATE_TRANSFER_ADMIN_GROUPS=Gerencia,Sistemas,Administracion y Finanzas
DUPLICATE_TRANSFER_REVIEW_GROUPS=Gerencia,Administracion y Finanzas
```

Ambas variables contienen nombres de grupos LDAP (CN) separados por comas. Las rutas operativas usan `DUPLICATE_TRANSFER_ADMIN_GROUPS`. La consulta de revisión admite esos administradores, los grupos de `DUPLICATE_TRANSFER_REVIEW_GROUPS` o el permiso JWT `duplicate-transfers:review`; no comprueba nombres de personas. Los cuatro valores de WhatsApp sólo se exigen al intentar un envío real.

## API

Todas las rutas están bajo `/api/admin/duplicate-transfers`, requieren el JWT existente y pertenencia a un grupo administrativo configurado.

- `GET /config`
- `PUT /config`
- `GET /status`
- `POST /preview`
- `POST /run`
- `GET /runs?limit=50&offset=0`
- `GET /runs/:id`
- `GET /detections?limit=50&offset=0`
- `GET /review?from=2026-06-01&to=2026-07-31&accountCode=11010201&clientCode=2107&page=1&pageSize=25`

`GET /review` acepta fechas `YYYY-MM-DD` o ISO 8601 con zona explícita. Sin fechas usa la ventana configurada (60 días actualmente); no permite más de 180 días ni cuentas fuera de `account_codes`. Ejecuta el procedimiento sin persistir movimientos, crear alertas, actualizar `notified_at` ni invocar Meta. `summary.totalAmount` es la suma decimal de todos los movimientos que cumplen los filtros, antes de paginar; no es una suma deduplicada por grupo.

Respuesta abreviada de revisión:

```json
{
  "ok": true,
  "data": {
    "filters": { "from": "2026-06-01", "to": "2026-07-31", "accountCode": null, "clientCode": null },
    "summary": { "groupCount": 1, "movementCount": 2, "totalAmount": "27450.00" },
    "pagination": { "page": 1, "pageSize": 25, "totalItems": 2, "totalPages": 1 },
    "items": [{
      "date": "2026-07-06", "division": "1", "entryNumber": "123456",
      "receipt": "1 - REC - 456789", "accountCode": "11010201", "accountName": "Banco",
      "amount": "13725.00", "sign": "D", "clientCode": "2107", "clientName": "Cliente",
      "coincidenceCount": 2, "firstDate": "2026-07-06", "lastDate": "2026-07-15", "daysBetween": 9
    }]
  }
}
```

Preview con fechas explícitas:

```json
{
  "from": "2026-06-01T00:00:00-03:00",
  "to": "2026-08-01T00:00:00-03:00"
}
```

Respuesta resumida (sin clientes, importes ni cuentas):

```json
{
  "ok": true,
  "data": {
    "movementCount": 4,
    "groupCount": 2,
    "groups": [{ "groupRef": "a1b2c3d4e5f6…", "movementCount": 2 }],
    "truncated": false
  }
}
```

Ejecución manual sin notificación (valor predeterminado):

```json
{}
```

Ejecución con intención de notificar; ambas propiedades son obligatorias para habilitar el envío. `dry_run=true` siempre prevalece y evita Meta:

```json
{
  "notify": true,
  "confirmNotification": true,
  "from": "2026-06-01T00:00:00-03:00",
  "to": "2026-08-01T00:00:00-03:00"
}
```

Actualización parcial de configuración:

```json
{
  "cronExpression": "0 */4 * * *",
  "timezone": "America/Argentina/Buenos_Aires",
  "lookbackDays": 60,
  "dryRun": true
}
```

## Activación segura

1. Mantener `enabled=false` y `dry_run=true`.
2. Configurar el grupo LDAP administrativo y las variables Meta sin exponerlas en logs.
3. Ejecutar `preview` y comparar el conteo con SSMS para la misma ventana local.
4. Ejecutar `/run` con `notify=false`; revisar runs y movimientos en PostgreSQL.
5. Ejecutar `/run` con confirmación y `dry_run=true`; verificar alerta `dry_run` y que `notified_at` siga nulo.
6. Activar el scheduler manteniendo `dry_run=true` y verificar una ejecución programada.
7. Realizar un único envío controlado con destinatario validado.
8. Sólo después establecer `enabled=true` y `dry_run=false`.

No se debe reintentar automáticamente un timeout ambiguo de Meta. Los movimientos quedan sin `notified_at`; el run queda `partial` y la alerta `failed` con código ambiguo para revisión, porque la restricción existente de alerts tampoco admite el estado `partial`.

## Reinicio del historial para pruebas

El script manual `scripts/reset-history-for-testing.sql` limpia ejecuciones, movimientos, alertas e ítems de alerta, y reinicia las identidades. Conserva la configuración y no utiliza `CASCADE`. Por seguridad, cancela la operación si `enabled=true` o si otra instancia posee el advisory lock del monitor.

Debe ejecutarse como archivo completo desde el cliente PostgreSQL autorizado. No se ejecuta automáticamente ni forma parte de las migraciones.
