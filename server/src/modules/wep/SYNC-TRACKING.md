# Seguimiento disponible desde la sincronización

La sincronización manual y el cron que utiliza `WepSyncService` generan o reutilizan
un token público por parada, sin enviar WhatsApp, iniciar viajes ni consultar Gestya.
El viaje puede seguir en estado `PROGRAMADO`.

## Comportamiento

Después de completar todos los UPSERT y antes del COMMIT, se leen las entregas
persistidas de los viajes procesados. Se agrupan por viaje, cliente, domicilio y
localidad normalizados con `normalizeStopText`, igual que el tracking existente.
Varias órdenes de la misma parada comparten el enlace. La identidad representativa
es la entrega de menor ID y la vigencia se calcula con la fecha más temprana de la
parada, incluyendo órdenes ya presentes en WEP.

Se reutilizan el repositorio y su bloqueo PostgreSQL por parada. Un token activo y
vigente conserva su `publicId` y su vencimiento: repetir la sincronización no rota
enlaces ni prolonga indefinidamente su duración. El envío posterior de WhatsApp
reutiliza ese mismo token. Los tokens vencidos se desactivan y reemplazan sólo si
la fecha de entrega todavía permite emitir uno vigente; los inactivos no se
reactivan. No se crea un token por cada orden.

La generación usa el mismo cliente y la misma transacción que sincroniza entregas.
No abre otra conexión, ni confirma o libera el cliente del sincronizador. Si falla
la generación o el COMMIT, se revierte la importación completa. El bloqueo global
de sincronización se mantiene y también aplica al cron.

## Condiciones y límites

- Deben existir `tracking_tokens` y el esquema del tracking que ya usa el backend.
  No se requiere una migración ni dependencias nuevas.
- La parada debe tener cliente, domicilio y fecha. Una localidad vacía conserva
  la normalización actual y no se inventa otra localidad.
- `WEP_TRACKING_EXPIRATION_DAYS` mantiene su comportamiento actual: 2 por defecto,
  hasta el final del segundo día posterior a la fecha de entrega, en Argentina.
- Las paradas históricas cuyo vencimiento calculado ya pasó se omiten. No se
  renuevan automáticamente sus enlaces por ejecutar una importación histórica.
- Se puede generar el token aunque falte teléfono; la consulta `/s` continuará
  exigiendo coincidencia con un teléfono válido registrado. El token solo no
  corrige datos de contacto ni vuelve consultable una entrega sin ese dato.
- Se conserva el filtro de vehículos ERP `101`, `102`, `103` y las reglas actuales
  de importación y estado operativo. No se modifican las notificaciones.
- Si cambia viaje, cliente o domicilio, se procesa la nueva identidad de parada.
  Este cambio no agrega una política de revocación de todos los enlaces anteriores
  ni conciliación de entregas eliminadas del ERP.

La respuesta de sincronización agrega `tracking` con contadores:

```json
{
  "tracking": {
    "disponibles": 3,
    "omitidasSinDatos": 0,
    "omitidasFueraVigencia": 0
  }
}
```

`disponibles` cuenta paradas cuyo token se creó o reutilizó. No es un número de
mensajes enviados ni garantiza que el pedido tenga teléfono válido. Ni esta
respuesta ni los logs nuevos exponen tokens, enlaces o teléfonos. Los errores de
lookup siguen siendo genéricos y se conserva el límite de intentos existente.

## Habilitar pedidos ya sincronizados

Desplegar este cambio y reiniciar el backend. Después ejecutar la sincronización
habitual para la fecha del viaje, o esperar al próximo cron habilitado cuyo rango
incluya esa fecha. Las entregas se actualizan por UPSERT y las paradas elegibles
reciben token; no se debe ejecutar ningún endpoint de avisos de WhatsApp.

Probar primero en testing: abrir `/s` e ingresar una NP y los últimos cuatro dígitos
del teléfono de esa entrega. La búsqueda reutiliza el endpoint existente y no crea
tokens por sí misma. Si no encuentra la entrega, comprobar los contadores, el dato
de contacto, la NP persistida y la fecha/vigencia.

## Pruebas sin servicios externos

Desde `server`:

```powershell
node --test src/modules/wep/wep-sync-tracking.test.js src/modules/wep/wep-sync.service.test.js src/modules/wep/wep-tracking.test.js src/modules/wep/wep-tracking-lookup.test.js src/modules/wep/wep-sync-scheduler.test.js src/modules/wep/wep-programmed-notifications.test.js src/modules/wep/wep-en-reparto-notifications.test.js src/modules/wep/wep.test.js
node --check src/modules/wep/wep-sync-tracking.service.js
node --check src/modules/wep/wep-sync.service.js
node --check src/modules/wep/wep-tracking.repository.js
```

Las pruebas usan repositorios y clientes PostgreSQL simulados; no conectan a bases
reales ni envían mensajes. Cubren lookup después de importar un viaje programado,
agrupación y separación de paradas, repetición sin duplicados, conservación de
enlaces, vigencia, errores y rollback, uso del cliente transaccional y regresiones
de los avisos y del seguimiento directo. No sustituyen una prueba de integración
contra PostgreSQL de testing para verificar locks y restricciones del esquema.
