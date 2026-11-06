# Configuración de WEP desde el centro de control

Secciones para TIC en `/administracion`: **Configuración** y **Camiones y accesos**.
CONSULTA no puede acceder a sus endpoints. Las escrituras y sus auditorías se
confirman en una misma transacción.

## Instalación

1. Aplicar primero la migración administrativa existente `database/wep-admin.sql`
   si todavía no está instalada. Aplicar después `database/wep-settings.sql` en la
   base definida por `WEP_PG_*`. No modifica entregas, camiones ni credenciales.
2. Configurar `WEP_SETTINGS_ENABLED=true` en **todas** las instancias de la API.
   Definir explícitamente `NODE_APP_INSTANCE` en cada una: solo `0` ejecuta cron.
   Para un proceso único se admite la variable ausente. Se conserva la restricción
   existente de un solo ejecutor; no configurar varios servidores como instancia 0.
3. Establecer `WEP_SETTINGS_ENCRYPTION_KEY` en todas las instancias: la misma clave
   aleatoria de 32 bytes, codificada en base64. Guardarla en el gestor de secretos,
   fuera del repositorio y separada de JWT. Es necesaria para guardar/reemplazar o
   descifrar el token. No rotarla sin volver a cifrar el token con la nueva clave.
   Conservarla para recuperar el token desde un backup.
4. Antes de desplegar el nuevo emisor, disponer de la configuración **exclusiva**
   de WEP: `WEP_WHATSAPP_TOKEN`, `WEP_WABA_PHONE_NUMBER_ID`, `WEP_WABA_VERSION`.
   Alternativamente, cargar estos valores desde el tablero una vez habilitado.
   El token del entorno sirve como valor inicial hasta reemplazarlo en el tablero;
   una vez reemplazado, prevalece el token cifrado guardado en PostgreSQL.
5. Reiniciar las instancias para incorporar el código y estas variables de
   instalación. Los cambios posteriores del tablero no requieren reiniciar.
   Comprobar **Aplicada en el ejecutor** para la revisión guardada.
6. Validar primero en una base de prueba, con avisos en simulación y WhatsApp
   pausado. Revisar horarios, días, códigos ERP y plantillas antes del modo real.
   No se aplicaron migraciones ni se enviaron mensajes durante el desarrollo.

Antes del primer guardado se usan los valores de entorno de sincronización,
avisos y plantillas. Los códigos ERP iniciales son 101, 102 y 103; también pueden
definirse con `WEP_SYNC_VEHICLE_CODES`, separados por comas. El primer guardado
crea la revisión 1; desde entonces PostgreSQL es el origen de esos parámetros.

`WEP_SETTINGS_ENABLED=false` desactiva la edición y vuelve al entorno: usarlo solo
como decisión de despliegue, ya que no conserva los bloqueos guardados en base.
El emisor exclusivo de WEP **siempre** exige sus propias credenciales, incluso sin
activar la edición. El despliegue requiere preparar esas credenciales previamente.

## Controles

- **Sincronización automática activa** controla el cron de importación. Apagarlo
  permite importaciones manuales y las previas a avisos programados.
- **Bloquear todas las importaciones** impide iniciar una sincronización desde
  cualquiera de esas entradas. Devuelve `skipped: IMPORTS_BLOCKED`. Una importación
  iniciada puede finalizar. No detiene avisos manuales sobre entregas ya importadas;
  para eso usar la pausa de WhatsApp.
- Los avisos programados requieren sincronización previa exitosa. No se envían
  con importación bloqueada, ocupada o fallida. Se vuelve a consultar el bloqueo
  y la habilitación de avisos al finalizar la importación.
- Días 0–6 (domingo–sábado), zona `America/Argentina/Buenos_Aires`, horario inicial
  inclusivo y final exclusivo. No se admiten ventanas que crucen medianoche.
  Cron de cinco campos, sin segundos. Días y horarios se aplican al cron; las
  herramientas técnicas manuales conservan su alcance de pruebas existente.
- **Simulación** calcula candidatos sin enviar ni reservar notificaciones, incluso
  con WhatsApp pausado. No cambia los controles de sincronización previa.
- **Pausar WhatsApp WEP** y los interruptores por plantilla se verifican en cada
  envío, incluidos avisos manuales y pruebas. Un mensaje ya enviado no se cancela.
  Se conserva la deduplicación existente; reactivar un tipo no reenvía avisos.
- `WHATSAPP_TOKEN`, `WABA_PHONE_NUMBER_ID` y `WABA_VERSION` siguen perteneciendo al
  emisor de deuda. WEP no tiene fallback a esas variables ni las modifica.
- Hay plantillas separadas para programada, en reparto, en camino, en camino por
  zona aproximada, aviso por cliente y prueba programada. Deben conservar los
  contratos BODY/botón de sus respectivos constructores de mensajes. Cambiar el
  nombre no cambia sus parámetros ni modifica la plantilla registrada en Meta.
- La pantalla indica presencia del token, no comprueba su vigencia con Meta.
  Este formulario no agrega llamadas ni envíos de prueba.

## Aplicación e historial

Cada instancia consulta la revisión cada 15 segundos. Reprograma sus cron si
cambia y registra revisión aplicada, último latido y próximos ciclos. El tablero
solo confirma una revisión cuando un ejecutor la informó en los últimos 60
segundos. Los ciclos de avisos fuera de los días/horarios permitidos no envían.

Si falla la lectura o la confirmación de aplicación, el reconciliador detiene los
cron y reintenta en el siguiente intervalo. Importaciones y envíos consultan base
antes de comenzar; si falla la lectura, no recurren a valores antiguos de caché.

El guardado usa revisión optimista: un formulario con revisión anterior recibe
409 y debe cargar la última versión. La auditoría guarda actor, fecha, acción y
valores anteriores/nuevos; nunca PIN, hash, token ni texto cifrado. El token se
almacena con AES-256-GCM en una columna fuera del JSON público. El GET nunca
devuelve el token ni esa columna. Vacío conserva el token anterior.

La interfaz muestra los últimos 50 cambios. Definir con TIC la retención y el
backup de `wep_settings_audit`, `wep_settings` y `wep_settings_applied`.

## Teléfono global de prueba para WhatsApp

En Meta → Pruebas de WhatsApp, TIC puede guardar un teléfono internacional y
activar la redirección de todos los avisos WEP. Se guarda en
`meta.testRouting: { enabled, phone }`, con revisión y auditoría. Se normalizan
espacios, paréntesis, guiones y el signo +; se exigen 8–15 dígitos internacionales,
sin cero inicial. Al activar se exige un número válido. No se activa ni se asigna
un teléfono real como parte del despliegue. Las configuraciones anteriores se
completan en lectura con el modo desactivado, sin otra migración SQL.

También puede inicializarse mediante `WEP_WHATSAPP_TEST_MODE=true` y
`WEP_WHATSAPP_TEST_PHONE`, hasta guardar la configuración en PostgreSQL.

La redirección se comprueba en el emisor común, para programada, en reparto,
en camino, zona aproximada, aviso individual anterior y prueba técnica manual.
La pausa de WhatsApp y los controles por plantilla conservan prioridad. La
simulación no envía mensajes. Los avisos de deuda no cambian.

El contexto de cada aviso selecciona el número de prueba incluso si el cliente
no tiene teléfono, sin modificar columnas de entregas ni teléfonos del ERP. El
detalle de entrega de la PWA muestra temporalmente el contacto de prueba con
`contacto.modoPrueba=true`, para habilitar sus acciones. Fuera del contexto de
notificación, búsquedas públicas y validaciones de identidad conservan el teléfono
original. El número no se filtra entre peticiones concurrentes. Si se cambia el
modo o el teléfono durante un envío en curso, ese envío se rechaza antes de
contactar Meta, en lugar de recurrir a un destinatario real.

**Este modo prueba el flujo operativo, no aísla la base:** los avisos se registran
y los estados avanzan normalmente. Conserva elegibilidad y deduplicación. Al
volver a producción no reenvía automáticamente avisos ya enviados al teléfono
de prueba. Usar datos/base de prueba para recorrer el flujo completo; no borra ni
reinicia notificaciones o entregas. El endpoint manual de prueba programada sigue
registrando `PROGRAMADA_TEST` sin marcar la notificación `PROGRAMADA` real.

Se comprobó la conexión de las dos plantillas auxiliares en código:

- **Aviso por cliente · API anterior**: `/pwa/entregas/:id/avisar`. La PWA actual
  usa el aviso por parada `/pwa/viajes/:viajeId/paradas/:grupoId/avisar` con ETA;
  se conserva el endpoint anterior para compatibilidad y no se elimina su plantilla.
- **Prueba de entrega programada · API técnica**:
  `/admin/notificaciones/programadas/test`. Sigue usando la plantilla de prueba
  y el registro `PROGRAMADA_TEST`; no corresponde a la tarea automática.

Esto verifica referencias y contratos del sistema, no aprobación/estado actual
en Meta. No se consultó WhatsApp Manager ni se eliminaron plantillas remotas.

Las dos plantillas auxiliares se configuran **solo en el entorno del backend**,
sin campos ni interruptores propios en Administración:

- Aviso individual anterior: `WEP_WHATSAPP_TEMPLATE_NAME` y `WEP_WHATSAPP_TEMPLATE_LANG`.
- Prueba manual: `WEP_WHATSAPP_TEMPLATE_PROGRAMADA_TEST` y
  `WEP_WHATSAPP_TEMPLATE_PROGRAMADA_TEST_LANG`; si faltan, se conserva el fallback
  anterior a `WEP_WHATSAPP_TEMPLATE_PROGRAMADA` y su idioma **del entorno**, nunca
  a valores del tablero.

Los valores auxiliares que pudieran existir en el JSON guardado se ignoran y no
se devuelven como configuración editable; el siguiente guardado los omite. No
se requiere migración. Reiniciar la API al cambiar estas variables. La pausa
global de WhatsApp, el teléfono de prueba y las credenciales exclusivas de WEP
siguen aplicando a esos endpoints.

## GESTYA, Google y HeiGIT

En Configuración → GPS, direcciones y rutas, TIC puede habilitar/pausar las nuevas
consultas y definir un timeout de 1000 a 60000 ms para cada proveedor. Se verifica
el control guardado antes de cada llamada y se conserva en la auditoría. Las
coordenadas ya disponibles pueden seguir utilizándose al pausar Google. Pausar
GESTYA no bloquea el registro de entregas: se conserva el manejo existente de
fallos de posición. Pausar HeiGIT impide nuevos cálculos de ruta/ETA.

Credenciales, endpoints y selección de proveedor siguen en el entorno:

- GESTYA: `GESTYA_URL`, `GESTYA_USER`, `GESTYA_PASSWORD`.
- Google: `WEP_GOOGLE_GEOCODING_API_KEY`, `WEP_GEOCODING_PROVIDER=google` (predeterminado).
- HeiGIT: `WEP_ROUTING_API_KEY`, `WEP_ROUTING_PROVIDER=openrouteservice` y
  `WEP_ROUTING_BASE_URL` si se necesita cambiar el endpoint predeterminado.

Valores iniciales: `GESTYA_TIMEOUT_MS`, `WEP_GEOCODING_TIMEOUT_MS`,
`WEP_ROUTING_TIMEOUT_MS`; 10000 ms si faltan. Se puede iniciar desactivado con
`WEP_GESTYA_ENABLED=false`, `WEP_GOOGLE_ENABLED=false` o `WEP_HEIGIT_ENABLED=false`.
Las configuraciones guardadas antes de este bloque se completan en lectura con
esos valores iniciales, sin modificar la revisión ni requerir otra migración.
El siguiente guardado conserva el bloque. Clientes anteriores sin el bloque
reciben error al guardar para evitar que sobrescriban accidentalmente las pausas.

`POST /api/wep/control/integrations/:provider/test` solo admite TIC, con proveedores
`gestya`, `google`, `heigit`. Pruebas manuales con configuración guardada: un camión
registrado, una dirección explícita o coordenadas de origen/destino. Consultan al
proveedor y pueden consumir cuota; nunca se ejecutan automáticamente ni modifican
entregas. Límite de una prueba por administrador/proveedor cada 10 segundos por
instancia. El resultado está acotado a posición/fecha GPS, coordenadas o tiempo y
distancia; no retorna claves, URLs, cabeceras o errores remotos completos. El
resultado en pantalla corresponde a la última prueba de esa sesión, no a monitoreo
continuo. La indicación de configuración presente no afirma conectividad.

## Camiones y accesos

- Nombre y patente son de consulta; se corrigen en ERP y se actualizan en la
  siguiente importación. El vínculo estable sigue siendo `codigo_erp`.
- Se permite editar `wep_login_activo` y reemplazar el PIN de 4–8 dígitos, guardado
  con bcrypt, coste 12. Vacío conserva el PIN; nunca se puede recuperar.
- Habilitar acceso exige vehículo activo, interno y con PIN. Bloquearlo o
  reemplazar su PIN revoca los tokens existentes en la misma transacción.
  El endpoint técnico anterior de cambio de PIN también revoca sesiones.
- El middleware verifica que el vehículo continúe activo, interno y habilitado.
  La sincronización no escribe PIN ni habilitación de acceso. Quitar un código
  ERP no elimina entregas ni bloquea accesos: ambas decisiones son independientes.

## Endpoints

Todos bajo `/api/wep/control`, con autenticación administrativa y rol TIC:

- `GET /settings`: configuración pública, revisión y confirmaciones de aplicación.
- `PUT /settings`: `{ config, revision, token? }`.
- `GET /settings/history`: últimos 50 cambios, sin secretos.
- `GET /vehicles`: estado, vinculación y última importación por camión.
- `PATCH /vehicles/:id`: `{ loginEnabled, pin? }`.

## Verificación

Backend: `node --test "src/modules/wep/*.test.js"`.
PWA: `npm test` y `npm run build`.
Las pruebas usan HTTP local y dobles de PostgreSQL/Meta; no consultan ERP ni
WhatsApp reales. Antes del despliegue verificar la migración y los tipos de la
base real en el entorno de prueba.
