# Productos Web II → Dropbox

## Estado de esta entrega

**Estructura implementada y probada; recepción de Exchange pendiente de datos.**
No existe todavía un adaptador de correo operativo. `createExchangeSource()`
rechaza cualquier intento de iniciar hasta verificar el flujo de autenticación
y la autorización de la cuenta de ejecución sobre la casilla.
La tarea está desactivada en `.env` y `.env.example`. No se contactó Exchange ni
se reemplazó el archivo remoto durante el desarrollo.

Datos confirmados posteriormente por el usuario: Exchange Server 2019 y casilla
`soporte@nimat.com.ar`. Según la captura: remitente `info@nimat.com.ar`, asunto
`Reporte2`, adjunto `Reporte2.xlsx`; `Productos Web II` aparece en el cuerpo.
Estos valores se guardaron en `.env`. El usuario confirmó además:

- Servidor `EXCHSERVER`, Standard, `AdminDisplayVersion 15.2.1544.4`: CU14.
  Este comando identifica el CU, no el nivel de SU/HU instalado.
- EWS interno y externo: `https://correo.nimat.com.ar/ews/exchange.asmx`.
- `WindowsAuthentication=True`, `BasicAuthentication=False`, `OAuthAuthentication=True`.
- Cuenta creada por el administrador: `svc_prodweb`, UPN `svc_prodweb@prades.local`,
  correo `svc_prodweb@nimat.com.ar`, base `Bases`, OU de usuarios Sistemas.
  Se guardó el sAMAccountName en `.env`.
- Reviewer verificado por el administrador en `Bandeja de entrada\Reportes` de
  soporte. Ruta guardada en `.env`. FolderVisible sobre el padre también confirmado.
- NETBIOS `PRADES`, DNSRoot `prades.local`. Configurado `AUTH=ntlm` para la prueba
  solicitada. Pendiente acceso NTLMv2 verificado desde Linux; no se modificó contraseña.

Se guardaron protocolo `ews` y endpoint en `.env`. Se recomienda autenticación
integrada Windows para evaluar el acceso desde el host del backend; el mecanismo
concreto Kerberos/NTLM debe verificarse según identidad, políticas y proveedores
del servidor. No se habilita Basic ni se desactiva Extended Protection/TLS.
`OAuthAuthentication=True` por sí solo no prueba un flujo OAuth utilizable por
esta aplicación (emisor, registro, permisos y adquisición de token pendientes).
Faltan reporte real y acceso autenticado verificado desde Linux.

La revisión del backend encontró:

- API ESM en `api.js`, tareas `node-cron`, instancia PM2 0 y bloqueos advisory
  PostgreSQL en Gestión y transferencias duplicadas.
- `jobs.js` ejecuta conversores existentes. Este módulo no los importa ni ejecuta.
- Dropbox ya tiene SDK y autorización con `DROPBOX_APP_KEY`,
  `DROPBOX_APP_SECRET`, `DROPBOX_REFRESH_TOKEN`. Se reutilizan esa app, credenciales
  y SDK sin incorporar otra cuenta ni dependencias.
- Inicialmente `.env` no contenía acceso Exchange; ahora registra el endpoint
  confirmado, pero la autenticación operativa sigue pendiente.
- El destino anterior de `.env` era `/Productos Nimat Urls.xlsx`; se actualizó a
  `/NIMAT/Productos Nimat Urls.xlsx`, el único destino aceptado por este módulo.
  Los consumidores existentes de `EXCEL_URLS_PATH` leerán ese destino al reiniciar;
  no se modificó su implementación ni se ejecutó su sincronización.
- No se encontró un reporte real Productos Web II en el workspace. El Excel de
  Gestión disponible pertenece a otro proceso y no se usó para inferir columnas.

## Datos necesarios antes de completar el adaptador

1. Confirmar dónde corre el backend (Windows/Linux, dominio, cuenta del servicio)
   y la autenticación autorizada para esa identidad. EWS/HTTPS y CU14 ya constan.
   Para comprobar parches en el servidor Exchange:
   `Get-Command ExSetup.exe | ForEach-Object { $_.FileVersionInfo }`.
   Ver [versiones Microsoft](https://learn.microsoft.com/en-us/exchange/new-features/build-numbers-and-release-dates).
2. Casilla, carpeta, remitente, asunto y nombre EXACTOS del adjunto. Confirmar si
   existen variantes; por ahora las coincidencias son exactas (remitente sin
   distinción de mayúsculas). No se busca texto parcial ni cualquier `.xlsx`.
3. Permisos de lectura autorizados sobre esa casilla/carpeta. Credenciales sólo
   por configuración privada, nunca en tickets, logs ni este documento.
4. Reporte real y regla confiable para obtener su fecha de GENERACIÓN. No basta
   con la fecha de recepción: un correo reenviado puede contener un reporte viejo.
5. Hoja, encabezados, fila de encabezados y reglas de datos reales. El validador
   preparado supone encabezados en la primera fila no vacía, sin fórmulas y valores
   presentes en todas las columnas configuradas. Ajustar con evidencia si el
   reporte legítimo admite otras estructuras o valores opcionales.
6. Fecha de generación y revisión Dropbox (`rev`) del archivo vigente para fijar
   la línea inicial; comprobar que la app ve `/NIMAT` en su espacio autorizado.

## Configuración y autorización

Ver [guía de cuenta mínima y prueba Linux](./AUTHORIZE-EWS.md) para crear la
cuenta, asignar Reviewer a una carpeta, completar únicamente datos confirmados
y ejecutar `ews_probe.py`. Es un diagnóstico manual separado; no habilita el
adaptador de recepción pendiente ni modifica correos o Dropbox.

Las variables nuevas están documentadas en `.env.example`, sin secretos.
`.env` queda privado e ignorado por Git. Se reservaron campos vacíos de dominio,
usuario, contraseña y CA para el diagnóstico NTLM. No hay credenciales inventadas;
el administrador debe aprobar el modo y completar los datos reales en privado.

Dropbox requiere la autorización existente con `files.metadata.read` y
`files.content.write`, además del acceso a la carpeta. Si faltan scopes, el titular
debe reautorizar la app con acceso offline y guardar el refresh token en `.env`.
No ampliar scopes ni sustituir el token de otros procesos sin revisar su uso.
Ver [OAuth oficial](https://docs.dropboxapi.com/dropbox-api/docs/oauth) y
[upload oficial](https://docs.dropboxapi.com/dropbox-api/api-reference/user-endpoints/files/upload).
El módulo usa actualización condicional por revisión y `strict_conflict`, sin
renombrar ni crear copias ante conflictos.

Para Exchange, el administrador debe conceder únicamente lectura de mensajes y
adjuntos en la casilla autorizada según el protocolo elegido. El adaptador no
debe borrar, mover, marcar leído ni enviar mensajes. Mantener validación de TLS,
timeouts y límites de descarga. Para CA privada usar `NODE_EXTRA_CA_CERTS` con la
cadena confiable, nunca desactivar certificados. El scheduler rechaza
`NODE_TLS_REJECT_UNAUTHORIZED=0`.

## Contrato del adaptador pendiente

Implementar en `report.exchange.js` sólo después de la confirmación:

```js
// list recibe { cursor, mailbox, folder }.
// cursor null: fotografía inicial completa de la carpeta configurada.
// Continuaciones: páginas de un snapshot estable/cambios, sin perder mensajes.
return {
  cursor: "cursor-opaco-persistible", hasMore: false,
  messages: [{
    id: "id-inmutable-del-correo", sender: "direccion@dominio", subject: "asunto",
    reportAt: "2026-11-17T09:00:00-03:00", // generación, verificada con reporte real
    attachments: [{ id: "id-estable", name: "exacto.xlsx", size: 12345, inline: false }],
  }],
};
// download({ messageId, attachmentId, maxBytes }) devuelve un Buffer completo.
```

Filtrar y recorrer únicamente la casilla/carpeta indicada; descargar sólo el
adjunto solicitado. Aplicar el límite durante la transferencia, no después.
Normalizar remitente a una dirección SMTP, IDs persistentes y fechas con zona.
El adaptador debe verificar la fecha de generación con la regla acordada antes
de devolver `reportAt`. Si necesita contenido para extraerla, reutilizar el mismo
Buffer limitado del adjunto esperado. Nunca usar recepción como fallback silencioso.
Un cursor expirado debe fallar cerrado; su resincronización debe preservar
deduplicación y watermark. Un cambio de configuración produce error de binding:
no se reutiliza automáticamente el cursor de otra carpeta o casilla.

El servicio reúne todas las páginas antes de ordenar por fecha de generación.
Fechas iguales no reemplazan al último reporte válido. Adjuntos ambiguos, tamaño
incierto, descargas incompletas, fechas ausentes y fallos de transporte detienen
el lote sin adelantar cursor. XLSX definitivamente inválidos se registran como
inválidos y permiten continuar. No se descargan otros archivos.

## Persistencia y despliegue

1. Aplicar `schema.sql` en la base PostgreSQL `PSQL_*` con rol de migraciones.
   El runtime necesita `SELECT`, `INSERT`, `UPDATE` en esa única tabla; no DDL,
   `DELETE` ni permisos de administrador. No se aplicaron migraciones a producción.
2. Verificar el reporte real, completar `PRODUCTOS_WEB_SHEET` y
   `PRODUCTOS_WEB_COLUMNS` (array JSON con nombres exactos). Ejecutar:

   ```powershell
   npm run report:validate -- --validate "C:\ruta\Productos Web II.xlsx"
   ```

   Sólo lee un archivo local; devuelve filas, encabezados y SHA256, sin conectarse
   a Exchange, PostgreSQL ni Dropbox. Guardar el hash revisado como
   `PRODUCTOS_WEB_REFERENCE_SHA256`. El hash es evidencia de referencia revisada,
   no una restricción que obligue a todos los reportes nuevos a tener igual contenido.
3. Completar las variables confirmadas, implementar el adaptador y probarlo contra
   un entorno autorizado. Configurar `PRODUCTOS_WEB_INITIAL_REPORT_AT` en ISO con
   zona y `PRODUCTOS_WEB_INITIAL_DROPBOX_REV` según el archivo actual. No inventar
   una fecha inicial: podría permitir reemplazar un reporte vigente por uno viejo.
   Si el destino aún no existe, copiar primero un reporte validado por el proceso
   actual y tomar su revisión. El módulo exige destino existente para actualizarlo.
4. Con el adaptador verificado, activar `PRODUCTOS_WEB_ENABLED=true` manteniendo
   `PRODUCTOS_WEB_DRY_RUN=true` y reiniciar API. Corre cada cinco minutos por
   defecto, hora Argentina, en instancia PM2 0 o proceso único. En simulación
   valida candidatos pero no escribe cursor/deduplicación ni toca Dropbox; es
   esperable que vuelva a validarlos en el siguiente ciclo.
5. Revisar resultados y sólo entonces usar `PRODUCTOS_WEB_DRY_RUN=false`, reiniciar
   y comprobar la revisión/hash del destino. Hoy el paso 4 falla intencionalmente
   por el adaptador pendiente; no representa una integración lista para producción.

PostgreSQL mantiene cursor, IDs de correo/adjunto hasheados, hashes de contenido,
watermark, revisión y una intención de carga. Se persiste intención antes de
subir. Si cae después del commit remoto, se reconcilia por content hash y se
confirma localmente sin repetir la carga. Si cambió la revisión por otro escritor,
se detiene sin sobrescribir. Un pendiente no reconciliable requiere investigación,
no borrar estado. El lock de sesión PostgreSQL protege instancias y el guard local
evita solapamientos del mismo servicio; las cargas también usan revisión condicional.

No eliminar ni restaurar hacia atrás esta tabla sin reconciliar con el destino.
Respaldarla junto a PostgreSQL. La deduplicación se conserva sin poda automática;
planificar archivado con watermark si crece mucho. La primera enumeración está
limitada a 1000 páginas/50000 mensajes; separar una carpeta de reportes cuando sea
necesario. El XLSX está limitado a 20 MiB comprimidos/80 MiB descomprimidos y 2000
entradas ZIP, con CRC, tamaño, hoja, columnas y datos comprobados.

Conexión temporal, 429 y 5xx se reintentan hasta cuatro veces con espera creciente
y `Retry-After` acotado a 30 segundos; al agotarse, vuelve a intentarse en el
siguiente ciclo sin perder cursor/intención. Autenticación, certificados y
conflictos requieren corregir la causa. Los logs no incluyen respuestas crudas,
credenciales, casillas, asuntos ni contenido del reporte. Los logs de error del
servicio son genéricos para evitar que un error de proveedor exponga secretos.

## Pruebas

```powershell
npm run test:productos-web-report
```

Fixtures sintéticos en memoria: XLSX válido, formato falso, corrupción/truncado,
columnas y datos faltantes, fórmulas, duplicados entre reinicios, orden entre
páginas, antiguos tardíos, coincidencias exactas, simulación, descargas incompletas,
fallos de conexión, retries, conflictos externos, exclusión mutua, SQL parametrizado
y recuperación de caída antes/después de carga. No usan servicios reales.
Faltan las pruebas de integración del protocolo/autenticación Exchange y del
reporte real hasta recibir los datos pendientes. No se modificaron chatbot,
productos.json ni sincronización Typesense.
