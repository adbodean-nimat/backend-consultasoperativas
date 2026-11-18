# Cuenta de servicio y prueba EWS desde Linux

## Datos confirmados y pendientes

Confirmado por el administrador: Exchange 2019 CU14, servidor EXCHSERVER,
`https://correo.nimat.com.ar/ews/exchange.asmx`, Windows habilitado, Basic
deshabilitado y OAuth habilitado en el directorio virtual. Casilla objetivo:
`soporte@nimat.com.ar`. Según la captura: remitente `info@nimat.com.ar`, asunto
`Reporte2`, adjunto `Reporte2.xlsx`. Producción: Linux con PM2; testing: Windows.

Actualización del endpoint del servicio: el administrador agregó HTTPS interno
en 8443 y verificó desde Linux `HTTP=401 IP=192.168.0.42` mediante curl sin
desactivar TLS. `.env` local ahora usa
`https://correo.nimat.com.ar:8443/ews/exchange.asmx`. Esto acredita conectividad
HTTPS en esa prueba, no autenticación ni acceso a Reportes. Actualizar también
la clave existente en el `.env` de Linux antes de repetir `ews_probe.py`.
La publicación de 443 se conserva; no se verificó todavía un filtro que limite
el nuevo binding únicamente a la ruta `/ews`.

La prueba autenticada posterior desde Linux devolvió `ok=true`,
`folderReadable=true`, `readOnly=true`, `writeRightsDetected=false` y
`reportFound=false`. El usuario confirmó que el correo original ya está en
Reportes. Está verificado el acceso de lectura; falta resolver cuál de los
filtros no coincide antes de descargar el reporte real.

La captura posterior del administrador confirma la cuenta creada:
`sAMAccountName=svc_prodweb`, `UPN=svc_prodweb@prades.local`, correo
`svc_prodweb@nimat.com.ar`, base `Bases` y OU de usuarios
`OU=Sistemas,OU=Usuarios Prades,DC=prades,DC=local`.

La captura de permisos confirma `Reviewer` para `svc_prodweb@prades.local` en
`soporte@nimat.com.ar:\Bandeja de entrada\Reportes`. Se registró esa ruta en
`PRODUCTOS_WEB_FOLDER`; el ID EWS se resolverá sin leer correos de la carpeta padre.

El administrador confirmó también `FolderVisible` sobre Bandeja de entrada,
dominio **NETBIOS PRADES** y **DNSRoot prades.local**. Se configuró `AUTH=ntlm`
para realizar la prueba solicitada desde Linux, sin dar por verificado el acceso.
El diagnóstico NTLM ya funcionó desde producción con esa cuenta. Windows
Authentication habilitado por sí solo no lo demostraba; la prueba autenticada
es la evidencia operativa registrada.
OAuth habilitado tampoco acredita un flujo de autorización para esta app.
`nimat.com.ar` es el dominio del correo; no inferir que NETBIOS sea `NIMAT`.

`.env` ya registra los datos confirmados, incluido el usuario `svc_prodweb`,
dominio `PRADES`, carpeta y modo de prueba `ntlm`. No se solicitó ni se modificó
la contraseña. El administrador
creó la cuenta desde Exchange Shell; el agente no ejecutó operaciones remotas.
La receta de creación siguiente queda como referencia: no repetir `New-Mailbox`
para esta cuenta existente. Reviewer sobre Reportes también está confirmado;
FolderVisible sobre el padre también está confirmado; continuar con la prueba Linux.

## 1. Crear una cuenta dedicada (administrador Exchange/AD)

Ejecutar en **Exchange Management Shell local**, con una cuenta administrativa.
No usar estos privilegios para el servicio Linux. El ejemplo crea una cuenta AD
con buzón propio para que sea un destinatario Exchange válido en la delegación.
No modificar ni compartir la contraseña de `soporte`.

```powershell
# Completar con valores REALES aprobados. UPN y SMTP pueden ser distintos.
$svcUpn = Read-Host 'UPN aprobado para la cuenta de servicio'
$svcOu = Read-Host 'DN de la OU de cuentas de servicio'
$svcDatabase = Read-Host 'Base de buzones aprobada'
$svcPassword = Read-Host 'Contraseña nueva de la cuenta de servicio' -AsSecureString

New-Mailbox -Name 'Servicio Productos Web' -Alias 'svc_prodweb' `
  -SamAccountName 'svc_prodweb' -UserPrincipalName $svcUpn `
  -OrganizationalUnit $svcOu -Database $svcDatabase `
  -Password $svcPassword -ResetPasswordOnNextLogon $false

$svc = Get-Mailbox -Identity 'svc_prodweb'

# Limitar los protocolos de la cuenta NUEVA; no cambiar los de soporte.
Set-CASMailbox -Identity $svc.Identity -EwsEnabled $true `
  -OWAEnabled $false -ActiveSyncEnabled $false -PopEnabled $false `
  -ImapEnabled $false -MAPIEnabled $false

Get-User -Identity $svc.Identity |
  Format-List SamAccountName,UserPrincipalName
Get-Mailbox -Identity $svc.Identity |
  Format-List PrimarySmtpAddress
```

Referencia: [New-Mailbox](https://learn.microsoft.com/en-us/powershell/module/exchangepowershell/new-mailbox?view=exchange-ps).
No agregar grupos administrativos ni roles Exchange a esta cuenta. Aplicar la
política de contraseñas/rotación de la organización, actualizando el secreto antes
de su vencimiento; el ejemplo no configura contraseña sin vencimiento. Evitar su
uso interactivo cotidiano. La cuenta tiene su propio buzón, pero no recibe
permisos de envío sobre soporte ni el código envía correos.

En un equipo administrativo con el módulo ActiveDirectory, obtener el dominio:

```powershell
Get-ADDomain | Select-Object NetBIOSName,DNSRoot
```

Si el administrador aprueba otro nombre, reemplazar `svc_prodweb` en todo el
ejemplo y confirmar su sAMAccountName. No reutilizar una cuenta con privilegios
amplios o membresías heredadas.

## 2. Conceder lectura de una sola carpeta de soporte

Primero identificar la carpeta real donde ya llegan los reportes:

```powershell
Get-MailboxFolderStatistics -Identity 'soporte@nimat.com.ar' |
  Select-Object FolderType,FolderPath
```

Usar la ruta EXACTA y localizada, por ejemplo `Bandeja de entrada` o
`Bandeja de entrada\Reportes`. No asumir que se llama `Inbox`. Si todavía no se
definió una carpeta exclusiva, el administrador debe decidir cuál autoriza.
Lectura sobre Bandeja de entrada permite leer todos los correos de esa carpeta;
el filtro por asunto/remitente del backend no es una restricción de seguridad.

```powershell
$svc = Get-Mailbox -Identity 'svc_prodweb'
$reportFolder = Read-Host 'Ruta autorizada dentro de soporte, sin barra inicial'
$folderIdentity = 'soporte@nimat.com.ar:\' + $reportFolder.TrimStart('\')

Get-MailboxFolderPermission -Identity $folderIdentity

# Para una cuenta nueva, que aún no tenga una entrada en esta carpeta:
Add-MailboxFolderPermission -Identity $folderIdentity `
  -User $svc.PrimarySmtpAddress -AccessRights Reviewer

# Verificar la entrada concedida:
Get-MailboxFolderPermission -Identity $folderIdentity -User $svc.PrimarySmtpAddress
```

Si la cuenta ya tiene una entrada, revisar sus permisos y usar
`Set-MailboxFolderPermission` en lugar de `Add-MailboxFolderPermission` para
ajustar ESA entrada a `Reviewer`. No modificar permisos `Default`/`Anonymous`
ni otras cuentas. El rol Reviewer reúne `FolderVisible` y `ReadItems`; no concede
edición ni borrado. No hereda lectura automáticamente hacia todas las subcarpetas.
Referencia: [permisos de carpeta](https://learn.microsoft.com/en-us/powershell/module/exchangepowershell/add-mailboxfolderpermission?view=exchange-ps).

No conceder FullAccess, SendAs, SendOnBehalf ni ApplicationImpersonation sobre
soporte. La prueba usa acceso delegado explícito a la carpeta. Para Inbox usa
su identificador EWS `inbox` y la dirección del propietario, sin navegar la raíz.
Para otra carpeta necesita su ID EWS exacto; el ID mostrado por
`Get-MailboxFolderStatistics` no se puede usar directamente como ID EWS.
Si una futura resolución por ruta necesita navegar carpetas padre, conceder sólo
`FolderVisible` a esos padres, sin `ReadItems` ni Reviewer sobre todo el buzón.
Referencia: [acceso delegado EWS](https://learn.microsoft.com/en-us/exchange/client-developer/exchange-web-services/how-to-access-email-as-a-delegate-by-using-ews-in-exchange).

### Caso confirmado: Bandeja de entrada\Reportes

Para resolver la subcarpeta por nombre, agregar únicamente visibilidad sobre el
padre. No concede lectura de sus correos:

```powershell
Add-MailboxFolderPermission -Identity 'soporte@nimat.com.ar:\Bandeja de entrada' `
  -User 'svc_prodweb@prades.local' -AccessRights FolderVisible

Get-MailboxFolderPermission -Identity 'soporte@nimat.com.ar:\Bandeja de entrada' `
  -User 'svc_prodweb@prades.local' | Format-List FolderName,User,AccessRights
```

Si la entrada ya existe, revisarla y ajustar sólo esa cuenta con
`Set-MailboxFolderPermission ... -AccessRights FolderVisible` cuando corresponda.
Conservar `Reviewer` sobre Reportes. No conceder Reviewer al padre ni FullAccess
al buzón. El diagnóstico admite `--inbox-subfolder Reportes`: hace FindFolder
Shallow con coincidencia exacta de nombre y después GetFolder/FindItem sobre el
ID hijo resuelto. Rechaza resultados ambiguos, incompletos o ausentes, sin imprimir
IDs ni contenido de otras carpetas. Si no puede resolverlo, devuelve error y no
reintenta sobre otra carpeta. Con ID EWS previamente conocido se puede conservar
el modo `--folder-id`, que evita esta navegación.

## 3. Verificar políticas sin relajar Exchange

El administrador debe comprobar las políticas de ambas identidades y de la
organización antes de probar. Son consultas; no alteran políticas globales:

```powershell
Get-CASMailbox -Identity 'svc_prodweb' |
  Format-List EwsEnabled,EwsApplicationAccessPolicy,EwsAllowList,EwsBlockList
Get-CASMailbox -Identity 'soporte@nimat.com.ar' |
  Format-List EwsEnabled,EwsApplicationAccessPolicy,EwsAllowList,EwsBlockList
Get-OrganizationConfig |
  Format-List EwsEnabled,EwsApplicationAccessPolicy,EwsAllowList,EwsBlockList
```

El cliente de prueba usa `User-Agent: Nimat-ProductosWeb/1.0`. Si hay una allowlist,
el administrador debe incorporar ese agente en la política aplicable preservando
las entradas existentes; no reemplazar listas ni habilitar EWS globalmente para
resolver un error. User-Agent no sustituye la autorización por cuenta/carpeta.
Confirmar además proveedores IIS, políticas NTLM efectivas, conectividad HTTPS
desde Linux, certificado y configuración Extended Protection/proxy/balanceador.
Referencia: [control de acceso EWS](https://learn.microsoft.com/en-us/exchange/client-developer/exchange-web-services/how-to-control-access-to-ews-in-exchange).

Mantener Basic deshabilitado, NTLMv1 deshabilitado y Extended Protection/TLS
activos. La prueba usa `requests-ntlm` con channel binding (`send_cbt=True`) y
NTLMv2 en Linux; una incompatibilidad se investiga, no se resuelve desactivando
esas protecciones. No se usan credenciales del equipo ni se une Linux al dominio.
Referencias: [cliente NTLM](https://github.com/requests/requests-ntlm),
[Extended Protection Exchange](https://learn.microsoft.com/en-us/exchange/plan-and-deploy/post-installation-tasks/security-best-practices/exchange-extended-protection).

## 4. Completar .env sólo con lo confirmado

Valores que ya están cargados en el `.env` privado de ESTE workspace:

```dotenv
PRODUCTOS_WEB_ENABLED=false
PRODUCTOS_WEB_DRY_RUN=true
PRODUCTOS_WEB_EXCHANGE_VERSION=2019
PRODUCTOS_WEB_EXCHANGE_PROTOCOL=ews
PRODUCTOS_WEB_EXCHANGE_URL=https://correo.nimat.com.ar:8443/ews/exchange.asmx
PRODUCTOS_WEB_MAILBOX=soporte@nimat.com.ar
PRODUCTOS_WEB_SENDER=info@nimat.com.ar
PRODUCTOS_WEB_SUBJECT=Reporte2
PRODUCTOS_WEB_ATTACHMENT=Reporte2.xlsx
PRODUCTOS_WEB_EXCHANGE_USER=svc_prodweb
PRODUCTOS_WEB_EXCHANGE_DOMAIN=PRADES
PRODUCTOS_WEB_EXCHANGE_AUTH=ntlm
PRODUCTOS_WEB_FOLDER="Bandeja de entrada\Reportes"
EXCEL_URLS_PATH="/NIMAT/Productos Nimat Urls.xlsx"
```

Valores confirmados y campos privados para la prueba:

```dotenv
# Mecanismo seleccionado para probar; su funcionamiento aún no está verificado:
PRODUCTOS_WEB_EXCHANGE_AUTH=ntlm
# Dominio NETBIOS confirmado:
PRODUCTOS_WEB_EXCHANGE_DOMAIN=PRADES
# sAMAccountName ya confirmado, sin prefijo de dominio:
PRODUCTOS_WEB_EXCHANGE_USER=svc_prodweb
# Vacío para solicitarla interactivamente durante la prueba:
PRODUCTOS_WEB_EXCHANGE_PASSWORD=
# Opcional, ruta absoluta a CA bundle PEM confiable en Linux:
PRODUCTOS_WEB_EXCHANGE_CA_FILE=
# Ruta confirmada para el futuro adaptador, aún pendiente de implementar:
PRODUCTOS_WEB_FOLDER="Bandeja de entrada\Reportes"
```

La prueba selecciona la carpeta EXPLÍCITAMENTE mediante `--inbox`, `--folder-id`
o `--inbox-subfolder Reportes`;
no interpreta `PRODUCTOS_WEB_FOLDER` ni escoge una carpeta por defecto.
La contraseña no debe pasarse en argumentos, comandos `export`, tickets ni chat.
Para la prueba inicial dejarla vacía: el script la pide sin eco. Si posteriormente
se almacena en `.env`, editar con un editor seguro, usar comillas simples para
preservar caracteres como `#` y `$`, y restringir el archivo al usuario del proceso.
No usar `source .env`, `cat .env`, `pm2 env` ni volcar entornos completos.
Los cambios en el workspace Windows no despliegan ni editan el `.env` de Linux.

## 5. Prueba manual desde producción Linux (sin unir al dominio)

Ejecutar en el directorio `server` con el usuario de Linux que corre PM2.
Requiere Python 3.10+ y acceso autorizado a PyPI para instalar el cliente de
diagnóstico en un entorno separado. No cambia dependencias ni procesos Node:

```bash
python3 -m venv "$HOME/.venvs/nimat-ews-probe"
"$HOME/.venvs/nimat-ews-probe/bin/python" -m pip install \
  -r src/modules/productos-web-report/probe-requirements.txt

# Ejecutar como propietario correcto del archivo:
chmod 600 .env

# Carpeta confirmada; requiere FolderVisible sobre su padre:
"$HOME/.venvs/nimat-ews-probe/bin/python" \
  src/modules/productos-web-report/ews_probe.py --env-file .env --inbox-subfolder Reportes
```

Para un ID EWS previamente confirmado se puede usar `--folder-id 'ID_EWS_CONFIRMADO'`.
`--inbox` sólo prueba Bandeja de entrada directamente y no corresponde a este
caso. No usar una ruta de Outlook ni un ID de FolderStatistics sin convertir.

La prueba realiza exclusivamente `FindFolder` (al resolver la subcarpeta),
`GetFolder` y `FindItem` con filtro de
remitente/asunto y presencia de adjunto, un resultado como máximo. Consulta los
derechos efectivos y rechaza lectura ausente o permisos efectivos de escritura.
No ensaya operaciones de borrado para comprobar permisos. No marca leído, no
descarga adjuntos, no envía, no escribe cursor/deduplicación y no toca Dropbox.
No reintenta autenticación para evitar múltiples intentos con una clave errónea.
No sigue redirecciones ni usa proxies del entorno; si la infraestructura exige
proxy, revisar su configuración explícita antes de adaptar el diagnóstico.

Salida esperada:

```json
{"ok":true,"folderReadable":true,"reportFound":true,"readOnly":true,"writeRightsDetected":false,"attachmentDownloaded":false,"dropboxTouched":false}
```

`reportFound=false` con `ok=true` prueba lectura de la carpeta, pero no encontró
un correo que coincida. No demuestra lectura/validez del adjunto. Aun con éxito,
falta implementar/probar el adaptador Node, obtener el Excel real y verificar
fecha, esquema y línea inicial Dropbox antes de activar la recepción automática.

Errores seguros que se pueden compartir sin incluir contraseña ni XML crudo:

| Resultado | Revisar |
| --- | --- |
| `EWS_HTTP_401` | NETBIOS, usuario, clave, cuenta bloqueada, política NTLM, CBT/proveedor |
| `EWS_HTTP_403` | Política de acceso EWS, agente permitido, restricciones IP/proxy |
| `ErrorAccessDenied` | Permiso sobre la carpeta exacta y políticas de la cuenta |
| `ErrorFolderNotFound` | Identidad de carpeta, propietario y visibilidad autorizada |
| `EWS_PERMISSIONS_TOO_BROAD` | Permisos efectivos de escritura concedidos directa o indirectamente |
| `EWS_TLS_FAILED` | Cadena CA, nombre del certificado y vigencia; no usar verify=False |
| `EWS_TIMEOUT` / `EWS_CONNECTION_FAILED` | DNS, firewall, ruta y puerto 443 desde Linux |
| `EWS_HTTP_429` / `EWS_HTTP_500` | Estado/limitación del servidor; revisar logs administrativos |

## 6. Información que devolver para continuar

Dominio NETBIOS, sAMAccountName, carpeta y ACL ya fueron confirmados. Devolver
el JSON del diagnóstico ejecutado desde Linux e indicar si fue necesaria una CA
privada. El funcionamiento del diagnóstico NTLM ya fue verificado desde Linux;
actualmente está pendiente la coincidencia del correo y la validación del XLSX.
Guardar la contraseña exclusivamente en el entorno privado correspondiente.

## Diagnóstico de EWS_CONNECTION_FAILED desde Linux

### Diagnóstico de filtros cuando el acceso ya funciona

Con la versión actualizada de `ews_probe.py` en Linux, ejecutar:

```bash
"$HOME/.venvs/nimat-ews-probe/bin/python" \
  src/modules/productos-web-report/ews_probe.py \
  --env-file .env --inbox-subfolder Reportes --diagnose-filters
```

Además del resultado habitual devuelve `diagnosticMatches`, con booleanos:
`all` (hay algún elemento), `subject` (coincide el asunto), `sender` (coincide el
remitente), `subject_sender` (ambos en un mismo elemento) y `combined` (ambos y
presencia de adjunto). Cada consulta tiene máximo un resultado, shape IdOnly y
se limita al ID de Reportes ya autorizado; no busca en otras carpetas ni imprime
asuntos, direcciones, IDs o contenido. En este diagnóstico los filtros se prueban
aislados únicamente para ubicar la discrepancia; los filtros de producción no
se relajan. La existencia del nombre exacto del adjunto requiere un GetItem y su
validación queda pendiente de la siguiente etapa.

Si `all=false`, revisar que el mensaje esté directamente en la carpeta compartida
del servidor y no en una subcarpeta, otro buzón, PST local o vista de búsqueda.
`subject=true` y `sender=false` orientan a revisar el remitente real/representación
SMTP frente a EX; `subject_sender=true` y `combined=false` orientan a adjunto
ausente. Los booleanos individuales no acreditan que se trate del mismo mensaje.

### Diagnóstico de conectividad previo a la autenticación

Este código por sí solo no determina si falló DNS, TCP o una conexión que se
cerró durante el intercambio. Tampoco acredita ni descarta credenciales correctas.
No ampliar permisos de la cuenta ni cambiar la clave sólo por este resultado.

Desde el mismo servidor Linux, consultar resolución y HTTPS sin credenciales:

```bash
getent ahosts correo.nimat.com.ar

curl -q --noproxy '*' --connect-timeout 10 --max-time 20 \
  -sS -o /dev/null -w 'HTTP=%{http_code} IP=%{remote_ip}\n' \
  'https://correo.nimat.com.ar/ews/exchange.asmx'
```

`-q` evita opciones heredadas de `.curlrc`; `--noproxy '*'` reproduce la conexión
directa del diagnóstico Python, que no usa proxies del entorno. No hay usuario,
contraseña ni seguimiento de redirecciones. Se conserva la validación TLS.
Referencia: [manual curl](https://curl.se/docs/manpage.html).

Un HTTP 401 permite confirmar una respuesta del endpoint que solicita
autenticación; esta consulta no envió credenciales. HTTP 000 indica que curl no
obtuvo un estado HTTP; revisar el error asociado. Error curl 6 apunta a resolución
DNS, 7 a conexión TCP, 28 a timeout y 60 a validación del certificado. Confirmar
con el administrador que la IP resuelta es la esperada para la ubicación de
producción (DNS interno/externo, VPN, rutas, firewall y eventual NAT).

Si funciona únicamente usando `curl -q -4 ...` con las mismas opciones, revisar
resolución/ruta IPv6 antes de modificar el backend. No reemplazar el hostname de
la URL por una IP ni usar `-k` para sortear validación de certificados.

La versión actualizada de `ews_probe.py` conserva el código general y agrega un
`detail` seguro cuando puede identificar la excepción encadenada: por ejemplo
`DNS_RESOLUTION_FAILED`, `CONNECTION_REFUSED`, `NETWORK_UNREACHABLE`,
`HOST_UNREACHABLE`, `CONNECTION_RESET` o `UNCLASSIFIED_CONNECTION_ERROR`.
Copiar el script actualizado a Linux antes de repetir el mismo comando de prueba;
no hace falta reiniciar PM2 ni cambiar `.env` para incorporar esta mejora.
No se imprimen mensajes crudos de excepción, solicitudes, XML ni credenciales.

Si después de corregir DNS aparece `EWS_TIMEOUT`, todavía no se conoce la etapa
exacta con una versión anterior del script. La versión actual agrega
`detail=CONNECT_TIMEOUT` cuando Requests informa timeout al conectar y
`detail=READ_TIMEOUT` cuando informa espera de lectura. No interpretar esos
códigos como prueba de autenticación exitosa ni como una causa única de red.

Consultar desde el mismo Linux, sin credenciales, por IPv4:

```bash
getent ahostsv4 correo.nimat.com.ar

curl -q -4 --noproxy '*' --connect-timeout 10 --max-time 20 \
  -sS -o /dev/null \
  -w 'HTTP=%{http_code} IP=%{remote_ip} TCP=%{time_connect}s TLS=%{time_appconnect}s TOTAL=%{time_total}s\n' \
  'https://correo.nimat.com.ar/ews/exchange.asmx'
```

Compartir también el error de curl si lo hay. Sus tiempos ayudan a localizar
qué fases se completaron, pero no prueban acceso delegado al buzón. Una IP
resuelta correctamente no demuestra que TCP/443 sea alcanzable. No aumentar
timeouts ni modificar permisos como primera respuesta sin esta información.
