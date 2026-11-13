# Integración de seguimiento en testing, sin WhatsApp

Estado: procedimiento preparado; **no ejecutado contra PostgreSQL/ERP de testing ni
contra un despliegue publicado**. No demuestra que `main` esté desplegado.

## Alcance y condiciones de ejecución

Hay dos tramos complementarios:

1. `tools/wep-sync-tracking.integration.mjs`: PostgreSQL real, COMMIT/ROLLBACK,
   repositorios y rutas Express reales, fuente ERP **sintética** inyectada. No levanta
   `api.js`, jobs ni schedulers, no importa del ERP real ni comprueba el navegador.
2. Aceptación del despliegue: ERP de testing → endpoint de sincronización de testing
   → PostgreSQL de testing → formulario `/s` y detalle, en navegador sin sesión.

No utilizar una base de producción, una copia con datos personales, ni entregas reales.
Antes de cualquier sincronización de producción o modificación de entregas reales,
mostrar host/base, rango, vehículos, OP/NP afectadas y cambios previstos al responsable
y solicitar aprobación explícita. Este procedimiento no concede esa aprobación.

## Tramo 1: prueba ejecutable con PostgreSQL real y datos sintéticos

Preparar una instancia de testing y una base exclusiva llamada
`wep_tracking_integration_test`, con el esquema WEP desplegado, sus constraints e
índices y el catálogo `entrega_estados` con `PROGRAMADA`. Usar un clon **sólo del
esquema**, sin datos operativos; las migraciones incrementales de `database/` no
reemplazan el esquema base. Deben estar aplicados, entre otros, el código ERP único,
el tracking público por parada y los campos de ruta que lee el tracking público.
No se crean ni migran tablas desde el script.

Desde `server`, comprobar primero el modo sin ejecución:

```powershell
node --check tools/wep-sync-tracking.integration.mjs
node tools/wep-sync-tracking.integration.mjs
```

Después de revisar el destino, suministrar la URL mediante una variable del proceso
(desde un gestor de secretos; no guardar credenciales en el repositorio ni en evidencia):

```powershell
# WEP_TRACKING_TEST_DATABASE_URL debe apuntar a la base dedicada indicada arriba.
node tools/wep-sync-tracking.integration.mjs --run-on-disposable-testing-db
```

El script comprueba el nombre de base del servidor y que `vehiculos`, `viajes`,
`entregas` y `tracking_tokens` estén vacías antes de escribir. Eso no identifica por
sí solo una infraestructura como testing: verificar también host y usuario. Usar
un usuario limitado a esa base y acceso exclusivo durante la prueba.
No utiliza `DATABASE_URL` ni la configuración de conexión del `.env` local como destino.

Genera un viaje de hoy en Argentina, cuatro OP/NP sintéticas `990001`–`990004`, un
vehículo ERP `101`, cliente `QA_TRACKING` y dos paradas separadas por localidad.
Tres pedidos comparten parada; el tercero carece de teléfono válido. El cuarto
utiliza teléfono alternativo. Ejecuta tres sincronizaciones y verifica:

- Dos tokens, no cuatro; NP principal/secundaria comparten enlace.
- Tres importaciones conservan `publicId`, `expira_at` y número de entregas.
- Vencimiento exacto al final de hoy + 2 días en Argentina (UTC del día siguiente,
  `02:59:59.999Z`); esta prueba fija explícitamente el valor predeterminado 2.
- Cinco consultas HTTP con el limitador activo: principal, secundaria, sin teléfono,
  alternativo y teléfono incorrecto. Las dos negativas devuelven 404.
- Detalle público `PROGRAMADA`, viaje `PROGRAMADO`, `iniciado_at = NULL`, sin GPS.
- Dos clientes PostgreSQL concurrentes reutilizan un token existente de la parada.
- Un fallo intencional después de crear otra entrega y su token revierte ambos.
- Un token vencido deja de resolver lookup y detalle; uno inactivo no resuelve lookup.

La prueba conserva datos sintéticos incluso si falla; no borra ni trunca tablas.
Para repetirla, preparar otra vez la base exclusiva vacía mediante el proceso
administrativo de testing. No ejecutar el script en una base compartida. El éxito
imprime sólo el resultado, sin tokens ni teléfonos. La concurrencia comprueba
reutilización sobre una parada existente; no certifica todas las carreras posibles.

## Tramo 2: ERP y frontend del despliegue de testing

### Preparar alcance antes de importar

Registrar estos valores concretos en la evidencia: SHA desplegado de API y frontend,
origen HTTPS de la PWA, URL de API, host/base PostgreSQL y catálogo ERP de testing,
fecha argentina `D`, vehículo ERP permitido, número de vuelta y OP/NP de prueba.
Comprobar que `VITE_API_BASE_URL` del build apunta a esa API y que `/api` no cae en
el fallback HTML. No basta con cambiar un `.env` después de compilar Vite.

Reservar una fecha/vuelta y datos exclusivamente sintéticos en el ERP de testing.
El endpoint importa **todas las filas elegibles del rango de fechas**; no filtra por
NP. Revisar la fuente antes de importar y usar una base de testing aislada si hay
otras entregas en ese rango. Conservar las referencias ERP reales de las fixtures,
sin asumir que el ERP permite los identificadores ilustrativos de la tabla.

Desactivar los ejecutores automáticos de sync durante la prueba para controlar
las repeticiones. Pausar WhatsApp y los avisos programados en la configuración
**efectiva** de testing y bloquear salida a Meta en esa instancia. Con
`WEP_SETTINGS_ENABLED=true`, revisar la configuración persistida del panel: cambiar
sólo variables de entorno puede no cambiar el valor efectivo. Mantener habilitada
la importación manual (`sync.blocked = false`). No ejecutar endpoints de avisos,
inicio de viaje, entrega o no entrega. El GET de tracking actualiza
`ultimo_acceso_at`; contabilizar esa escritura de acceso en los datos sintéticos.

### Datos y resultados esperados

Usar una fecha `D` vigente (hoy/próximo día), un mismo viaje, y contactos sintéticos
con formato argentino válido, sin pertenecer a clientes reales. Desactivar el
redireccionamiento de destinatarios para comprobar los teléfonos registrados.

| Caso | Identidad de parada y contacto | Resultado esperado |
| --- | --- | --- |
| A | Cliente QA, domicilio QA 123, Concordia, teléfono principal válido | Token nuevo, lookup 200 |
| B | Mismo viaje/cliente/domicilio/localidad de A, distinta OP/NP; espacios/caja equivalentes | Mismo token que A; su propio teléfono permite buscar B |
| C | Misma parada de A; otra NP, ambos teléfonos vacíos o inválidos | Comparte token, lookup 404 incluso usando los dígitos de A |
| D | Mismo cliente/domicilio, otra localidad; principal inválido y alternativo válido | Token diferente; lookup 200 con alternativo |
| E | Otro domicilio o cliente o viaje; principal y alternativo válidos distintos | Token diferente; acepta sólo el principal |
| F | Parada con domicilio vacío o cliente vacío, si el ERP admite ese dato | `omitidasSinDatos`; sin token nuevo |
| G | Otra parada histórica con `D + días de vigencia < ahora` | `omitidasFueraVigencia`; no recrea token |

Para F/G, usar un rango y viaje aislados adicionales; no ampliar el rango principal
para incluir entregas ajenas. Si el ERP impide F, documentarlo y cubrirlo en el tramo
de servicios, sin adulterar entregas reales. Para G, no cambiar el reloj del servidor.

### Importar y comprobar la persistencia

Desde Postman o cliente técnico, con JWT corporativo de testing (el PIN de chofer
no sirve para esta ruta), ejecutar **una vez**:

```http
POST <API_TESTING>/api/wep/sync/entregas-programadas
Authorization: Bearer <JWT_TECNICO_TESTING>
Content-Type: application/json

{ "fechaDesde": "<D: YYYY-MM-DD>", "fechaHasta": "<D: YYYY-MM-DD>" }
```

Esperar `200`, `ok: true`, sin `skipped`, filas/omisiones acordes a la fuente y
`tracking.disponibles` igual al número de paradas elegibles, incluyendo las que no
tienen teléfono. `IMPORTS_BLOCKED` o `SYNC_IN_PROGRESS` no son una importación exitosa.

Con una sesión SQL conectada explícitamente a testing, sustituir `<VIAJE_QA_ID>`
por el ID **verificado** del viaje sintético (no usar el siguiente SQL sin reemplazo):

```sql
SELECT current_database(), inet_server_addr(), current_user;
SELECT id, estado, fecha, iniciado_at, finalizado_at
FROM public.viajes WHERE id = <VIAJE_QA_ID>;

-- Mantener esta misma sesión para comparar después de cada repetición.
CREATE TEMP TABLE qa_tracking_baseline AS
SELECT id, public_id, viaje_id, cliente_codigo, domicilio_normalizado,
       localidad_normalizada, entrega_id, activo, expira_at
FROM public.tracking_tokens WHERE viaje_id = <VIAJE_QA_ID>;

SELECT cliente_codigo, domicilio_normalizado, localidad_normalizada,
       count(*) FILTER (WHERE activo AND expira_at > NOW()) AS activos_vigentes
FROM public.tracking_tokens WHERE viaje_id = <VIAJE_QA_ID>
GROUP BY 1, 2, 3;

SELECT t.id, t.expira_at,
       min(e.fecha_entrega) AS fecha_minima,
       ((min(e.fecha_entrega) + 3)::timestamp AT TIME ZONE
         'America/Argentina/Buenos_Aires') - interval '1 millisecond' AS esperado_default_2
FROM public.tracking_tokens t
JOIN public.entregas e ON e.viaje_id = t.viaje_id
  AND e.cliente_codigo = t.cliente_codigo
WHERE t.viaje_id = <VIAJE_QA_ID>
  AND t.activo AND t.expira_at > NOW()
  -- Estas fixtures usan domicilio y localidad ya normalizados en la fuente.
  AND upper(trim(e.domicilio)) = t.domicilio_normalizado
  AND upper(trim(e.localidad)) = t.localidad_normalizada
GROUP BY t.id, t.expira_at;
```

La expectativa de vigencia vale para tokens **nuevos** con configuración 2; si la
configuración efectiva usa N, reemplazar `+ 3` por `+ (N + 1)`. Para otras variantes
de espacios usar `normalizeStopText` del backend; `upper(trim())` no lo reproduce
completamente. Cada parada debe tener exactamente un activo vigente; los históricos
inactivos pueden aumentar el total. No copiar `public_id` ni teléfonos a logs compartidos.

### Consultar `/s` sin iniciar el viaje

Abrir `<PWA_TESTING>/s` en una ventana privada, sin sesión de chofer ni administrador.
Buscar A y B por separado y comprobar en Network el POST público, respuesta 200,
igual `publicId`, navegación a `/s/:publicId` y GET de detalle 200. La pantalla debe
mostrar entrega programada, fecha/horario y pedidos de la parada; sin mapa GPS activo
ni posición del camión. Recargar el detalle y `/s`: deben funcionar sin login.
Verificar en PostgreSQL que el viaje sigue `PROGRAMADO`, sin `iniciado_at`.

Comprobar C, D, E y dígitos incorrectos según la tabla. Cada NP usa sus propios
contactos: nunca hereda el teléfono de otra entrega de la parada. Los errores de
coincidencia deben ser el mismo 404 genérico. El sexto intento por IP dentro de 10
minutos, con valores predeterminados, produce 429 aunque los cinco anteriores
hayan sido exitosos. Dividir la prueba en ventanas y esperar `Retry-After`; no
interpretar un 429 como fallo de token ni evadir el límite con headers inventados.
Detrás de proxy verificar `trust proxy` y la cuota efectiva compartida por IP.

### Repetir, vencer e inactivar

Repetir dos veces el mismo POST de sincronización, sin cambios en ERP. En ambas
respuestas esperar cero insertadas y todas las OP procesadas como actualizadas.
Verificar mismo número de entregas y mismo conjunto de IDs de viaje. En la sesión
SQL del baseline, esta consulta debe devolver cero filas:

```sql
SELECT coalesce(b.id, t.id) AS token_modificado
FROM qa_tracking_baseline b
FULL JOIN (SELECT * FROM public.tracking_tokens WHERE viaje_id = <VIAJE_QA_ID>) t
  ON t.id = b.id
WHERE b.id IS NULL OR t.id IS NULL
   OR (b.public_id, b.expira_at, b.activo) IS DISTINCT FROM
      (t.public_id, t.expira_at, t.activo);
```

Agregar luego una NP sintética a la parada A en ERP y sincronizar: una entrega
nueva, ninguna parada/token adicional para A; el enlace existente conserva su
vencimiento. Confirmar lookup de la nueva NP con su propio teléfono.

La manipulación de vencimiento/inactividad está automatizada en el tramo 1 sobre
datos sintéticos. En el despliegue compartido usar fixtures reservadas y revisión
previa del cambio SQL, o esperar el vencimiento natural: lookup y detalle deben
devolver 404 al vencer/inactivar. El lookup no debe crear ni renovar tokens.
Una resincronización histórica fuera de vigencia no crea otro token; una parada
reprogramada vigente puede reemplazar un vencido. No se reactiva el token anterior.

## Evidencia y cierre

Guardar fecha/hora argentina, SHAs, destinos sin secretos, referencia de las fixtures,
conteos fuente/importación/paradas, estados, expiraciones y comparación de repeticiones,
HTTP status y captura de `/s` con identificadores sensibles ocultos. Verificar ausencia
de nuevas notificaciones/intentos Meta en la instancia durante la ventana de prueba.
No marcar el tramo 2 como aprobado sólo porque pasó el script del tramo 1.

Retener los datos sintéticos para revisión o eliminarlos únicamente mediante el
procedimiento de testing que enumere sus IDs y dependencias. No borrar por fecha
en una base compartida. Registrar cualquier paso pendiente y el motivo.
