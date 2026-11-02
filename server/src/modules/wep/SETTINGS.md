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
