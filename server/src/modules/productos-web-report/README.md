# Productos Web II: Exchange → validación XLSX → Dropbox

El adaptador EWS/NTLM está implementado y el validador se verificó contra el
Reporte2.xlsx real aportado por el usuario. El scheduler permanece desactivado.
Desde este workspace no se ejecutaron migraciones, conexiones EWS ni cargas a
Dropbox. El usuario ya comprobó desde Linux autenticación y lectura del correo;
falta probar allí el nuevo worker SyncFolderItems/GetAttachment y ejecutar el
circuito completo en modo de prueba antes de activar escrituras.

## Configuración confirmada

- Exchange Server 2019 CU14, EXCHSERVER. AdminDisplayVersion no determina SU/HU.
- EWS interno del servicio: `https://correo.nimat.com.ar:8443/ews/exchange.asmx`.
  HTTPS y autenticación NTLM comprobados desde Linux. El binding público 443 se
  conserva; el filtro exclusivo de ruta `/ews` en 8443 no fue verificado.
- Casilla `soporte@nimat.com.ar`; carpeta `Bandeja de entrada\Reportes`.
- Cuenta `PRADES\svc_prodweb`, UPN `svc_prodweb@prades.local`.
  Reviewer en Reportes y FolderVisible en Bandeja de entrada. No FullAccess,
  impersonación, SendAs ni permisos administrativos para el servicio.
- Remitente From SMTP exacto `info@nimat.com.ar`, asunto exacto `Reporte2`, adjunto
  FileAttachment no inline único `Reporte2.xlsx`. Una regla administrada por el
  usuario mueve los correos a Reportes; el backend no mueve ni marca mensajes.
- El usuario confirmó que cada envío genera un Excel nuevo. Se usa DateTimeSent
  original como referencia de orden, explícitamente configurada. El XLSX no tiene
  una fecha de generación verificable. Si cambia este contrato, detener el job;
  un adjunto viejo reenviado con fecha nueva no puede distinguirse sólo por fecha.
- Destino fijo confirmado posteriormente por el usuario:
  `/Productos Nimat Urls.xlsx`, en la raíz de Dropbox (`EXCEL_URLS_PATH`).

La API usa ESM, node-cron, instancia PM2 0 y locks advisory PostgreSQL; este módulo
sigue ese patrón. Reutiliza app/refresh token y SDK Dropbox existentes. No importa
ni ejecuta conversores de jobs.js, chatbot, productos.json o Typesense. Cambiar
EXCEL_URLS_PATH hace que sus consumidores existentes lean la ruta solicitada al
reiniciar, sin modificar su implementación.

## Referencia XLSX revisada

`report.profile.js` define `productos-web-ii-v1`:

- Hoja `Productos Web II`, siete encabezados en orden:
  `Id`, `Sku`, `Name`, `FullDescription`, `imageUrl`, `url`, `Especificaciones`.
- Referencia: 2.922 filas, 465.275 bytes, SHA256
  `ec3700b3eb8b4aba5ede30287e0efe86a5b2439c24f84dcbafcbc50e24a88e23`.
- Valores esenciales: Id, Name, imageUrl y url. En el reporte real hay 24 SKU,
  31 descripciones y 1.956 especificaciones vacíos; se admiten esos vacíos.
- Id entero positivo único; columnas textuales conservan sus tipos (incluido SKU
  con ceros iniciales). URL e imagen HTTPS de nimat.com.ar/www.nimat.com.ar.
- ZIP íntegro (CRC y tamaños), MIME XLSX resuelto por Default u Override Open XML,
  hoja/columnas exactas, datos, ausencia de macros, enlaces externos de libro,
  fórmulas y errores de celda. El HTML de descripción se trata como texto.
- Límites: 20 MiB comprimidos, 80 MiB descomprimidos, 2.000 entradas ZIP,
  250.000 filas y 200 columnas. MIN_ROWS es configurable, inicialmente 1;
  no se presume que siempre deban existir exactamente 2.922 productos.

El SHA256 identifica la referencia revisada; los reportes futuros pueden cambiar
su contenido. La validación estructural no demuestra que el exportador haya
incluido todo el inventario: si se requiere un umbral mínimo mayor o un recuento
contra el origen, definirlo con el responsable de datos.

## Componentes y permisos

- `report.exchange.js`: puente Node → worker Python mediante stdin JSON.
  Credenciales fuera de argumentos y logs; proceso acotado a 120 segundos y
  salida limitada. Sin shell. El worker necesita el Python de su venv.
- `ews_worker.py`: reutiliza el transporte NTLMv2/CBT de `ews_probe.py`, TLS
  obligatorio, sin proxies implícitos ni redirecciones. GetFolder/FindFolder
  verifican carpeta y derechos efectivos de lectura, sin escritura.
- SyncFolderItems guarda SyncState opaco ligado al endpoint/casilla/carpeta;
  páginas de 25 cambios, Create/Update se hidratan con GetItem, ReadFlagChange y
  Delete sólo se observan/ignoran. El backend nunca modifica el buzón.
- FindItem con filtro directo From produjo un falso negativo. El worker acepta
  candidatos únicamente tras verificar Subject, From SMTP y adjunto con GetItem.
  From y Sender no se sustituyen; EX puede usar la propiedad SMTP 0x5D02; datos
  contradictorios o sin resolver no autorizan el reporte.
- Antes de GetAttachment se vuelven a verificar remitente/asunto/nombre, ID,
  tamaño y ParentFolderId. Se descarga sólo el Excel esperado, con respuesta
  limitada y base64 comprobado. El worker informa `byteLength` del contenido
  decodificado; Node exige que coincida con el buffer y valida el XLSX antes de
  publicar. `Size` de EWS incluye propiedades y se usa como control preventivo
  de tamaño, sin exigir igualdad con el archivo.
- `report.repository.js` y `schema.sql`: cursor, watermark, hashes de IDs y
  contenido, revisión Dropbox e intención de carga en una fila JSONB, bajo lock
  de sesión PostgreSQL. El rol de runtime necesita SELECT/INSERT/UPDATE en esa
  tabla; DDL se ejecuta con rol de migración, sin privilegios globales del servicio.
- `report.service.js`: reúne todas las páginas, ordena por fecha original y
  procesa en serie. Rechaza iguales/anteriores al watermark. Los inválidos se
  registran; transporte incompleto no adelanta cursor. La deduplicación persiste
  entre reinicios. No hay poda automática del historial: respaldar esta tabla.
- `report.dropbox.js`: app y refresh token existentes. Scopes mínimos del módulo:
  files.metadata.read y files.content.write con acceso al archivo en la raíz de
  Dropbox autorizada para la app. Reautorizar la app
  sólo si falta write; preservar scopes que ya usan otros procesos.
- La subida usa update(rev), strict_conflict=true, autorename=false y compara hash.
  Se persiste intención antes de cargar. Si se pierde la respuesta o cae el proceso
  tras commit remoto, se reconcilia por content hash antes de continuar. Si otro
  escritor cambia la revisión, se detiene sin sobrescribirlo.

## Preparar Linux y configuración privada

Copiar todo `src/modules/productos-web-report` y package.json de esta versión.
Usar el usuario de Linux del backend. Crear un venv accesible por ese usuario:

```bash
python3 -m venv "$HOME/.venvs/nimat-ews-probe"
"$HOME/.venvs/nimat-ews-probe/bin/python" -m pip install \
  -r src/modules/productos-web-report/probe-requirements.txt
```

Completar las claves del .env privado de Linux, sin duplicarlas ni compartir su
contenido. El .env local Windows no despliega estos cambios en producción:

```dotenv
PRODUCTOS_WEB_ENABLED=false
PRODUCTOS_WEB_DRY_RUN=true
PRODUCTOS_WEB_CRON=*/5 * * * *
PRODUCTOS_WEB_EXCHANGE_VERSION=2019
PRODUCTOS_WEB_EXCHANGE_PROTOCOL=ews
PRODUCTOS_WEB_EXCHANGE_URL=https://correo.nimat.com.ar:8443/ews/exchange.asmx
PRODUCTOS_WEB_EXCHANGE_AUTH=ntlm
PRODUCTOS_WEB_EXCHANGE_DOMAIN=PRADES
PRODUCTOS_WEB_EXCHANGE_USER=svc_prodweb
PRODUCTOS_WEB_EXCHANGE_PASSWORD=
PRODUCTOS_WEB_EXCHANGE_CA_FILE=
PRODUCTOS_WEB_PYTHON=
PRODUCTOS_WEB_MAILBOX=soporte@nimat.com.ar
PRODUCTOS_WEB_FOLDER="Bandeja de entrada\Reportes"
PRODUCTOS_WEB_SENDER=info@nimat.com.ar
PRODUCTOS_WEB_SUBJECT=Reporte2
PRODUCTOS_WEB_ATTACHMENT=Reporte2.xlsx
PRODUCTOS_WEB_SHEET="Productos Web II"
PRODUCTOS_WEB_COLUMNS=["Id","Sku","Name","FullDescription","imageUrl","url","Especificaciones"]
PRODUCTOS_WEB_REQUIRED_VALUES=["Id","Name","imageUrl","url"]
PRODUCTOS_WEB_SCHEMA_PROFILE=productos-web-ii-v1
PRODUCTOS_WEB_MIN_ROWS=1
PRODUCTOS_WEB_REFERENCE_SHA256=ec3700b3eb8b4aba5ede30287e0efe86a5b2439c24f84dcbafcbc50e24a88e23
PRODUCTOS_WEB_ORDERING=message_sent
PRODUCTOS_WEB_FRESH_REPORT_PER_MESSAGE_CONFIRMED=true
EXCEL_URLS_PATH="/Productos Nimat Urls.xlsx"
PRODUCTOS_WEB_INITIAL_REPORT_AT=
PRODUCTOS_WEB_INITIAL_DROPBOX_REV=
```

PYTHON debe ser la ruta absoluta al ejecutable del venv de ese host; por ejemplo
`/home/usuario/.venvs/nimat-ews-probe/bin/python`. No usar `$HOME` literalmente en
.env ni resolver el symlink hacia el Python del sistema (perdería el venv).
PASSWORD debe completarse en privado para ejecuciones desatendidas; el worker no
solicita claves interactivamente. `ews_probe.py` sigue admitiendo prompt para
pruebas manuales. El archivo .env debe ser propiedad del usuario correcto y modo
600. CA_FILE es opcional para una CA privada confiable. Nunca desactivar TLS,
CBT/Extended Protection ni habilitar Basic para resolver un fallo.

## Migración y primera prueba real

1. Aplicar `schema.sql` en la base PostgreSQL PSQL_* del backend, con rol de
   migraciones. No se ejecuta DDL automáticamente ni se aplicó desde este chat.
2. Si se quiere volver a validar la referencia local sin servicios externos:

   ```bash
   npm run report:validate -- --validate /ruta/Reporte2.xlsx
   ```

3. Ejecutar una vez el circuito real en modo de prueba:

   ```bash
   npm run report:receive -- --dry-run
   ```

   Toma el lock PostgreSQL, consulta EWS y valida los adjuntos. No escribe
   cursor/deduplicación ni hace llamadas a Dropbox. No arranca la API ni el cron.
   Si falta baseline y no hay estado previo, usa epoch exclusivamente para esta
   simulación. Cada resultado válido incluye filas, reportAt y contentHash; no
   incluye datos de productos, asuntos, direcciones, IDs crudos ni credenciales.

4. Obtener revisión y hash del destino existente mediante consulta de metadatos:

   ```bash
   npm run report:dropbox-info
   ```

   No sube ni descarga archivos. Comparar contentHash con los resultados válidos
   de dry-run. Si hay coincidencias, la mayor reportAt de esas coincidencias es
   una referencia verificable del contenido actualmente publicado, bajo el contrato
   de Excel nuevo por envío confirmado por el usuario. Guardar esa fecha en
   INITIAL_REPORT_AT y la revisión obtenida en INITIAL_DROPBOX_REV.
   serverModified no es una fecha de generación: no usarlo como sustituto.
   Si no hay coincidencia, investigar la fecha del reporte vigente; no inventarla.
   Si el destino no existe, sembrar primero un XLSX validado y tomar su referencia.
5. Después de revisar la simulación y completar la línea inicial, la publicación
   manual explícita se ejecuta con:

   ```bash
   npm run report:receive -- --publish
   ```

   Requiere baseline incluso si se invoca desde CLI. Las revisiones se contrastan
   con el servidor: si cambia el archivo durante la revisión, falla por conflicto.
6. Para programación, usar DRY_RUN=false y ENABLED=true y reiniciar API/PM2 con
   su procedimiento habitual. Corre sólo en instancia 0 o proceso único, cada
   cinco minutos por defecto, zona America/Argentina/Buenos_Aires. El lock de
   PostgreSQL protege otras instancias y ejecuciones manuales.

## Fallos y operación

Conexiones temporales, 429 y 5xx se reintentan hasta cuatro veces con espera
creciente acotada. Al agotarse, el siguiente ciclo retoma sin perder cursor o
intención. Certificados, autenticación, permisos, ambigüedades y conflictos no se
resuelven ampliando permisos ni sobrescribiendo. Logs y CLI muestran códigos
seguros, sin cuerpos de respuesta ni secretos. Un SyncState expirado falla cerrado;
la resincronización debe preservar processed/hashes/watermark/rev, nunca borrar
estado a ciegas. Cambios de endpoint/carpeta/esquema/criterio de orden requieren
revisar el binding del estado antes de reutilizar un cursor. Rotar la contraseña
y cambiar la ruta del Python no cambian ese binding.

No restaurar el estado hacia atrás sin reconciliar con Dropbox. Conservar un
pendiente si no se puede reconciliar: requiere investigar el archivo remoto o el
mensaje original. El archivo válido se conserva ante fallos del procesamiento.

## Verificación

El tamaño `Size` de EWS puede superar los bytes del archivo porque incluye
propiedades del adjunto ([PR_ATTACH_SIZE de Microsoft](https://learn.microsoft.com/en-us/office/client-developer/outlook/mapi/pidtagattachsize-canonical-property)).
Una diferencia como 465749 frente a 465359 bytes no prueba truncamiento. No se
resta una cantidad fija ni se admite un margen arbitrario: se comprueba el
contenido base64, el límite de bytes reales, el contrato `byteLength` entre
Python y Node y la integridad completa del ZIP (directorio, tamaños y CRC),
además del esquema y los datos del XLSX. Desplegar juntos `ews_worker.py`,
`report.exchange.js` y `report.service.js` y repetir
`npm run report:receive -- --dry-run`. La aprobación de ese archivo concreto
depende de la validación en Linux; el diagnóstico anterior no la reemplaza.

```bash
npm run test:productos-web-report
python3 -B -m unittest discover -s src/modules/productos-web-report -p 'test_ews*.py' -v
npm run build
```

Pruebas offline: validez/invalidez de XLSX, Default/Override de MIME real,
campos opcionales, tipos, URLs, orden, duplicados entre reinicios, concurrencia,
cursores, páginas, cambios del buzón, sólo lectura, transporte acotado, credenciales
por stdin, respuestas perdidas y recuperación. La referencia real se validó
localmente, sin modificarla. La prueba de integración del nuevo worker completo,
PostgreSQL y Dropbox requiere ejecutarse en el entorno Linux autorizado.

La guía histórica `AUTHORIZE-EWS.md` conserva los pasos de creación de cuenta,
ACL y diagnóstico de red. Para ejecutar el circuito final prevalecen estas
instrucciones; no repetir la creación de la cuenta ni modificar la publicación
pública 443 de Exchange.
