# Sincronización automática Plataforma → WEP

`api.js` inicia `wep-sync-scheduler.js`. Reutiliza `WepSyncService` y el stored
procedure existente `dbo.sp_entregas_programadas`; escribe únicamente en WEP.
No envía WhatsApp ni inicia viajes. No se agregan dependencias ni migraciones.

## Activación

Configurar en el entorno del proceso API y reiniciar:

```dotenv
WEP_SYNC_ENABLED=true
WEP_SYNC_CRON=*/5 * * * *
WEP_SYNC_DAYS_BACK=0
WEP_SYNC_DAYS_AHEAD=7
```

El valor predeterminado de `WEP_SYNC_ENABLED` es `false`. La configuración de
ejemplo no activa importaciones. La primera ejecución ocurre en el próximo
horario del cron, sin importar inmediatamente al arrancar. La API debe mantenerse
en ejecución. En PM2 sólo programa la instancia `0`; sin `NODE_APP_INSTANCE`
programa el proceso único. Una configuración inválida deja este scheduler sin
iniciar y registra un error; la API continúa con sus otros servicios.

Cada ejecución calcula nuevamente la fecha de Argentina
(`America/Argentina/Buenos_Aires`). Por defecto incluye hoy y los próximos siete
días, para todos los vehículos y vueltas admitidos por el servicio. Los límites
son 0–30 días hacia atrás y 0–90 hacia adelante. Por ejemplo, el 28/10/2026
consulta desde `2026-10-28` hasta `2026-11-04`, inclusive. Las fechas anteriores
quedan fuera salvo que se configure `WEP_SYNC_DAYS_BACK`.

## Concurrencia y errores

El servicio abre una transacción PostgreSQL y obtiene
`pg_try_advisory_xact_lock(73021, 1)` antes de consultar Plataforma. Todos los
procesos que usen este servicio y la misma base WEP comparten el bloqueo,
incluyendo `POST /api/wep/sync/entregas-programadas`. Si está ocupado devuelve
`{ ok: true, skipped: "SYNC_IN_PROGRESS", message: "Ya hay una sincronización en curso" }`
sin consultar ERP ni escribir entidades. No se encolan ejecuciones.

Un fallo revierte la transacción y libera el cliente y el bloqueo. El cron vuelve
a intentar en su próximo horario. El bloqueo permanece durante la consulta ERP;
esa ejecución ocupa una conexión WEP hasta finalizar. No hay reintentos rápidos
ni recuperación de horarios perdidos mientras la API estuvo detenida.

Los logs `[WEP AUTO SYNC]` indican programación, resultados y fallos; el servicio
existente conserva su resumen de calidad. No existe historial persistido de las
ejecuciones en esta etapa.

## Alcance de la importación

Se conservan las reglas existentes: códigos ERP `101`, `102`, `103`, upsert por
orden de preparación y conservación del estado operativo, orden del chofer y
configuración de GPS/PIN. La importación actualiza datos del ERP y la asignación
de vehículo/viaje de entregas existentes, incluso si ya estaban en reparto; no
incluye conciliación especial de reasignaciones durante el reparto. Tampoco
elimina ni cancela entregas que dejaron de aparecer en la fuente. Revisar estas
reglas con Operaciones antes de habilitar el cron en producción.

Para desactivar, establecer `WEP_SYNC_ENABLED=false` y reiniciar la API. La
sincronización manual sigue disponible. No se requieren cambios en la PWA.

## Verificación sin bases reales

Desde `server`:

```powershell
node --test src/modules/wep/wep-sync-scheduler.test.js src/modules/wep/wep-sync.service.test.js src/modules/wep/wep.test.js
node --check api.js
```

Las pruebas usan repositorios, clientes PostgreSQL y tareas simulados. Cubren
fechas argentinas, cambios de mes/año, configuración, instancia pasiva,
solapamientos, recuperación tras errores, bloqueo ocupado, rollback e
idempotencia de la importación existente. La activación y una ejecución real
requieren acceso a Plataforma y PostgreSQL WEP; no forman parte de estas pruebas.
