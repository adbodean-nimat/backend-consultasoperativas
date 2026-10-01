# Aviso WhatsApp PROGRAMADA

El proceso manual vive en `WepProgrammedNotificationsService` y no depende del
router. El endpoint técnico es:

`POST /api/wep/admin/notificaciones/programadas/procesar`

Requiere la misma autenticación técnica/JWT que el resto de endpoints admin WEP.
El body es opcional. Por seguridad, `dryRun` vale `true` si se omite:

```json
{
  "fecha": "2026-09-18",
  "dryRun": true
}
```

`fecha` sólo es una facilidad del endpoint manual. Una futura tarea automática
debe invocar el service sin fecha: éste calcula `YYYY-MM-DD` en
`America/Argentina/Buenos_Aires`. La consulta compara exclusivamente
`entregas.fecha_entrega = fecha`; no usa creación, sincronización ni auditoría.

## Parada e idempotencia

La agrupación reutiliza `groupPwaViajes`/`createStopGroupId`: `viaje_id`, código
de cliente, domicilio normalizado y localidad normalizada. No existe una segunda
implementación del algoritmo. La primera entrega según el orden de parada es el
ancla de `notificaciones`, preservando el esquema actual y su unicidad
`(entrega_id, tipo)`. Antes de enviar se bloquea y vuelve a leer el viaje y toda
la parada; cualquier `PROGRAMADA` en cualquiera de sus entregas con estado
`ENVIADO`, `ENTREGADO`, `LEIDO` o `PENDIENTE` impide otro envío.

Un registro `ERROR` se actualiza a `PENDIENTE` para reintentar, sin insertar una
fila que choque con la restricción única. Si Meta vuelve a fallar se guarda
`ERROR`, código y detalle saneado, y el proceso continúa con la siguiente parada.

El teléfono se busca en todas las entregas ordenadas, con prioridad `telefono` y
después `telefono_alternativo`, mediante el helper WEP existente. La Nota de
Pedido se resuelve con `resolveStopOrders` sobre todas las entregas hijas: se
eliminan vacíos y duplicados, se ordena por número ascendente y se expone
`pedido: { principal, otros }`, con números en string sin prefijo `#`.

## Plantilla y transición

Variables nuevas:

- `WEP_WHATSAPP_TEMPLATE_PROGRAMADA`: nombre de una plantilla temporal/aprobada.
- `WEP_WHATSAPP_TEMPLATE_PROGRAMADA_LANG`: idioma de Meta; default `es_AR`.

Sin nombre de plantilla, el modo real responde `409` con “Plantilla PROGRAMADA
no configurada” antes de consultar, insertar o enviar. El dry-run funciona sin
plantilla y nunca envía ni escribe. El DTO interno contiene `cliente`, `pedido`,
`fechaEntrega`, `horaDesde`, `horaHasta` y `trackingUrl`. En modo real se crea o
reutiliza el `public_id` de la parada y se envían `pedido.principal`/`horaDesde`/`horaHasta` al BODY
y solamente `public_id` al botón URL dinámico. En dry-run `trackingUrl` permanece
en `null` y no se escribe ningún registro.

Para una transición segura: ejecutar dry-run, revisar resultados, configurar una
plantilla de prueba, hacer un envío real controlado y validar `notificaciones`.
Sólo después debe desactivarse manualmente el envío ERP. Mientras ERP y WEP estén
activos existe riesgo de doble aviso entre sistemas; la idempotencia de WEP no
puede detectar envíos que el ERP no registra en `dbWep`.

No se agregó cron, no se modificó ERP ni se implementó el frontend público.

## Tracking público

`GET /api/wep/public/tracking/:publicId` no requiere login, tiene rate limit en
memoria por IP y responde únicamente estado agregado de la parada, fecha, franja
horaria, localidad, última actualización y si el viaje está en curso. Incluye
`pedido: { principal, otros }`. No expone cliente, teléfono, email, domicilio,
patente, división/tipo de NP, órdenes de preparación, otras paradas ni IDs de DB.

Los links nuevos usan un `public_id` persistente de 24 bytes aleatorios (192 bits)
en base64url. Es un identificador público no adivinable, no una contraseña que
necesite hash irreversible; `token_hash` se conserva sólo por compatibilidad con
registros históricos. `WEP_PUBLIC_TRACKING_URL` configura la base del link y
`WEP_TRACKING_EXPIRATION_DAYS` (default 2) fija la expiración al final del día de
entrega más esa cantidad de días.

## Envío técnico de prueba

`POST /api/wep/admin/notificaciones/programadas/test` es exclusivamente manual
y está protegido por el mismo JWT técnico de las demás rutas admin WEP. Resuelve
una sola parada desde la entrega indicada, reutilizando `groupPwaViajes`; no
recorre la fecha, no ejecuta cron ni modifica estados, viajes, órdenes o la tarea
73 del ERP.

Configurar preferentemente estas variables con los valores aprobados en Meta:

```env
WEP_WHATSAPP_TEMPLATE_PROGRAMADA_TEST=wep_programada_test
WEP_WHATSAPP_TEMPLATE_PROGRAMADA_TEST_LANG=es_AR
```

Si no se define el nombre o idioma específico de TEST, se reutiliza la
configuración `WEP_WHATSAPP_TEMPLATE_PROGRAMADA(_LANG)`. El envío se registra
como `tipo = PROGRAMADA_TEST`, por lo que nunca satisface la deduplicación de
`PROGRAMADA` ni bloquea el aviso real posterior.

Ejemplo para Postman (header `Authorization: Bearer <JWT>` y `Content-Type:
application/json`):

```http
POST /api/wep/admin/notificaciones/programadas/test
```

```json
{
  "entregaRepresentativaId": 91,
  "telefono": "549345XXXXXXXX"
}
```

La plantilla recibe `pedido.principal`, `horaDesde` y `horaHasta` como `HH:mm`. El parámetro del
botón recibe únicamente el `publicId`; Meta agrega la parte fija
`https://wep.nimat.com.ar/s/`. El resultado esperado es un WhatsApp con la
franja correcta y el botón **Seguir mi entrega**, cuyo tracking público abre sin
login. El registro TEST queda separado y no bloquea un futuro PROGRAMADA real.

## NP en WhatsApp y tracking público

La secuencia operativa puede editarse: el principal se elige por NP numérica
ascendente y no por posición de entrega. El helper compara con BigInt y conserva
los strings originales, incluyendo ceros a la izquierda si los hubiera. El
orden es determinista para el mismo conjunto de NP; no se persiste otra selección.
La agrupación, estados y ancla de notificaciones permanecen iguales.

El DTO de PROGRAMADA/dryRun reemplaza cantidad/notaPedido por principal/otros.
No se encontraron consumidores de esas propiedades anteriores en los dos
frontends locales. No se conserva ese formato ni se eliminan propiedades del
modelo de entregas usado por la PWA. Horas normalizadas HH:mm y trackingUrl null
para dryRun. Tracking agrega pedido al contrato existente, sin datos internos.

Configurar los nombres aprobados de Meta en las variables existentes:

```env
WEP_WHATSAPP_TEMPLATE_PROGRAMADA=wep_programada_test
WEP_WHATSAPP_TEMPLATE_PROGRAMADA_TEST=wep_programada_test
WEP_WHATSAPP_TEMPLATE_EN_REPARTO=wep_en_reparto_test
WEP_WHATSAPP_TEMPLATE_EN_CAMINO=wep_llegada_estimada_test
WEP_WHATSAPP_TEMPLATE_EN_CAMINO_ZONA=wep_en_camino_zona
```

Se mantiene EN_CAMINO como tipo interno y nombre de variable de configuración.
Las plantillas configuradas (incluida la variante de zona, si se usa) deben
admitir el contrato BODY pedido/ETA. No se modifican archivos de entorno ni
plantillas remotas. Encabezados/pies y texto estático permanecen definidos en Meta.
El botón URL siempre recibe únicamente publicId en su variable independiente.

### Plantilla `wep_en_camino_zona`

El flujo existente de destino aproximado por zona selecciona esta plantilla
mediante `WEP_WHATSAPP_TEMPLATE_EN_CAMINO_ZONA`. Reutiliza el resolver de pedidos
y el builder de ETA: BODY {{1}} = pedidoPrincipal (sin #), BODY {{2}} = minutos
amigables estimados por zona; botón URL {{1}} = publicId. No se modifica el
cálculo de ETA ni la regla de selección de destino aproximado.

Cuerpo estático configurado en Meta:

> ¡Hola!👋
>
> Tu pedido #{{1}} está en camino.
>
> Estimamos llegar a la zona de tu domicilio en aproximadamente {{2}} minutos.
>
> Podés seguir el estado de tu entrega desde el botón.
>
> ¡Gracias por elegir NIMAT! 💚

Sin pedido principal se aplica PEDIDO_NO_DISPONIBLE y no se envía esta plantilla.
El payload completo de ejemplo está en `meta.EN_CAMINO_ZONA` de
`STOP-ORDERS-EXAMPLES.json`.

Sin NP: tracking devuelve principal null y otros []; PROGRAMADA real/dryRun
omite el envío, registra PEDIDO_NO_DISPONIBLE en resultado/log y cuenta un error;
PROGRAMADA_TEST devuelve whatsapp.status OMITIDA y el código, sin reservar;
EN_REPARTO marca la reserva ERROR con error_codigo PEDIDO_NO_DISPONIBLE;
EN_CAMINO devuelve resultado/código PEDIDO_NO_DISPONIBLE sin reservar ni cambiar
estado. Los builders rechazan una NP ausente como última defensa antes de Meta.
La metadata existente del aviso EN_CAMINO guarda pedidoPrincipal/otrosPedidos.
No se agregan columnas.

Validación: node --test src/modules/wep/*.test.js. Los ejemplos en
STOP-ORDERS-EXAMPLES.json se generan con los services/builders y fixtures de
prueba, sin consultar PostgreSQL ni enviar mensajes reales a Meta.

## Archivos de este cambio

- `src/modules/wep/PROGRAMMED-NOTIFICATIONS.md`
- `src/modules/wep/wep-client-notice.service.js`
- `src/modules/wep/wep-en-reparto-notifications.service.js`
- `src/modules/wep/wep-en-reparto-notifications.test.js`
- `src/modules/wep/wep-eta.test.js`
- `src/modules/wep/wep-programmed-notification-test.service.js`
- `src/modules/wep/wep-programmed-notifications.service.js`
- `src/modules/wep/wep-programmed-notifications.test.js`
- `src/modules/wep/wep-stop-actions.repository.js`
- `src/modules/wep/wep-stop-actions.service.js`
- `src/modules/wep/wep-stop-actions.test.js`
- `src/modules/wep/wep-tracking.repository.js`
- `src/modules/wep/wep-tracking.service.js`
- `src/services/whatsapp.service.js`
- `src/modules/wep/STOP-ORDERS-EXAMPLES.json`
- `src/modules/wep/wep-stop-orders.test.js`
- `src/modules/wep/wep-stop-orders.util.js`
