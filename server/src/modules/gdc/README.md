# Chapas Revestidas y LAF — Gestión de Compras

Implementación Express/ESM con `pg`, `mssql` y `node:test`, como el backend existente.
No hay ORM ni ejecutor automático de migraciones en este proyecto. PostgreSQL guarda
solamente configuración: no se persisten stock, consumos, pedidos ni respuestas del ERP.

## API y autorización

`GET /api/gdc/revestidos-laf?months=12&rotationDays=120` requiere JWT corporativo
válido mediante `verifyUserToken`, igual que `/api`. Admite el JWT del login
existente `/login`; no consulta roles, permisos ni usuarios de Gestión Financiera.

Administración bajo `/api/gdc/revestidos-laf/configuracion`, también solo con token:

| Recurso | Clave del registro | Operaciones |
| --- | --- | --- |
| `familias` | `clasificador_5` (texto de 4 dígitos) | GET, POST, PUT/PATCH `/:codigo`, DELETE `/:codigo` |
| `tipos-articulo-chapa` | `codigo` (texto de 3 dígitos) | mismas |
| `depositos-excluidos` | `codigo_deposito` (entero positivo) | mismas |
| `comprobantes-consumo-ventas` | `codigo_comprobante` (texto de hasta 3 caracteres) | mismas |
| `tipos-np` | `codigo_tipo_np` (texto de hasta 3 caracteres) | mismas |
| `general` | singleton `id=1` | GET y PUT `/general` |

GET administrativos incluyen registros inactivos y responden `{ok,total,rows}`;
mutaciones responden `{ok,row}`. DELETE elimina físicamente la fila PostgreSQL y
devuelve el registro eliminado. Si no existe (incluido un segundo DELETE), responde
404. Se puede volver a crear el mismo código mediante POST. Si se desea conservar
una fila inactiva, se puede seguir enviando `activo=false` mediante PUT/PATCH.
El borrado está disponible para los cinco catálogos; `general` no se elimina porque
el módulo necesita sus valores predeterminados (DELETE devuelve 405).

Los cuerpos usan los nombres de columnas PostgreSQL. PUT/PATCH de familias es
parcial y valida el registro completo bajo bloqueo de fila, por lo que cambiar un
código de largo exige mantener completa la pareja 10,50/13 m. Toda familia necesita
HL o 13 m. Códigos y referencias son texto, conservando ceros iniciales. Códigos son
inmutables; fechas de auditoría y usuario no se reciben del cliente. `created_by` y
`updated_by` se toman del usuario autenticado; `updated_at` se mantiene automáticamente.

Ejemplo de cambio de configuración general:

```json
{
  "meses_consumo_default": 12,
  "dias_rotacion_default": 120,
  "deposito_principal": 973,
  "proveedor_oc": null,
  "clasificador_8_excluido_stock": "0145"
}
```

`months` admite 1–60 y `rotationDays` 1–3660, también para defaults editables.
Cada catálogo activo admite hasta 300 filas para respetar el límite de parámetros
SQL Server. Una configuración instalada inválida devuelve 503, nunca una selección
parcial. Los parámetros ausentes se leen de `gdc_configuracion`; no se sustituyen
silenciosamente por constantes de aplicación.

## Conexiones y puesta en marcha

Se reutiliza `dboperacion_pg.js` (`PSQL_SERVER`, `PSQL_PORT`, `PSQL_DATABASE`,
`PSQL_USER`, `PSQL_PASSWORD`). El ERP importa `plataforma` de `dbconfig.js` y usa
las variables existentes: `SQL_SERVER`, `SQL_PORT`, `SQL_DATABASE`, `SQL_USER` y
`SQL_PASSWORD`. No se agregan variables de entorno para GDC.

El pool es exclusivo de GDC, inicializado de forma perezosa, con una copia de la
configuración de Plataforma: conserva credenciales, TLS y timeout (`requestTimeout`,
actualmente 300000 ms) sin modificar el objeto compartido ni reutilizar el pool de
otros módulos. Por defecto admite hasta seis conexiones, mínimo cero, y timeout
de conexión de 15 segundos. Se fuerza UTC para las fechas SQL y se identifica la
aplicación como `restapi-nodejs-gdc-readonly`.

`readUncommitted` es una opción interna booleana del constructor del repositorio,
desactivada por defecto. Si se habilita, agrega hints por tabla sin cambiar el
aislamiento de sesión: el pool no conserva estado alterado. Cada request usa el
timeout configurado en Plataforma mediante el driver, que cancela el request TDS.
Desconexiones HTTP y fallos de bloques cancelan las
consultas hermanas. No se registran SQL, conexiones, credenciales ni mensajes crudos
del driver; los logs identifican el bloque y código de error.

Migraciones manuales, solamente PostgreSQL, compatibles con versiones 10 y 18:

1. `database/20261002_gdc_configuracion.sql`: copia de la definición entregada,
   sin consultas finales de verificación. Crea las seis tablas solamente si faltan;
   conserva las filas existentes mediante `ON CONFLICT DO NOTHING`. Mantiene los
   triggers con `EXECUTE PROCEDURE`, compatible con PostgreSQL 10. No se ejecuta al
   iniciar ni desde un endpoint.

La migración contiene la carga inicial mediante `ON CONFLICT DO NOTHING`: si se
vuelve a ejecutar, puede reinsertar registros iniciales borrados físicamente. No
usarla como tarea de mantenimiento de los catálogos.

No se requiere migración de permisos ni asignación de roles para GDC. Las lecturas
y modificaciones de configuración requieren el token existente. La auditoría usa
`username` o `user.sAMAccountName` del JWT. El middleware conserva el contrato global:
token ausente devuelve 401 y token inválido o vencido devuelve 400.

## Consultas y diferencias con referencias

Se carga primero un snapshot `REPEATABLE READ READ ONLY` de las seis tablas PG.
Luego se ejecutan seis requests independientes en paralelo; no hay joins entre
motores, transacciones distribuidas, N+1, tablas temporales, procedimientos ni DDL
en SQL Server. Las listas se enlazan en CTE `VALUES`, incluidos los casos vacíos.

| Bloque ERP | Criterio |
| --- | --- |
| Producción | `STOC_MSVA`, `STOC_MSMV`, `STOC_MOSD`, `STOC_ARTS`, `PROD_TCSP`; solo referencia HL de la familia; cantidades del script dividido por factor; EXISTS evita duplicados de TCSP/MSMV |
| Remitos | `STOC_MOST`, `STOC_MOSD`, `STOC_ARTS`; EXISTS de MSMV y comprobantes activos; fecha MOST; signo `S` suma, otros restan, como Access |
| NP | `VENT_NPCA`, `VENT_NPDE`, `STOC_ARTS`; pedida menos entregada positiva y motivo de cancelación NULL; no se filtra por facturación |
| Stock | SDPP para tipos fuera del catálogo, STDP para tipos incluidos; excluye depósitos configurados; conserva neto positivo por artículo antes de sumar por familia/código |
| OC | `COMP_CODC`, `COMP_RODC`, `STOC_ARTS`; pedida menos recibida positiva; motivo y fecha de cancelación NULL; proveedor NULL incluye todos, 1335 reproduce Access |
| Referencias | `STOC_ARTS` para código 13 m o HL; factores distintos/faltantes y clasificación 4 desde `STOC_CA04`; notas de PG |

La exclusión del clasificador 8 se conserva **solo para SDPP**, como el script de
stock y Access. La consulta de remitos se extrajo de la consolidación Access sin
ejecutar sus múltiples CTE mensuales ni sus joins de metadatos ajenos al cálculo.
La producción del SQL de referencia incluía toda la familia: aquí se restringe a
la referencia HL, como exige el Excel y esta solicitud. Se conserva su cantidad
`MOSD_CANT_ING`, sin aplicar el signo de remitos a Producción.

Se usa fecha actual en `America/Argentina/Buenos_Aires`, sin depender del reloj
local del host SQL Server. `months=12` produce 13 meses cronológicos, desde el
primer día del mes inicial hasta el primero del siguiente al actual, exclusivo.
Cada request de consumo agrega dos alcances (`monthly` y `rotation`) en una
ejecución. Rotación abarca exactamente `rotationDays` días desde hoy menos días
hasta hoy exclusivo, incluyendo ayer y excluyendo el día actual incompleto.
Si rotación excede los meses visibles, se consulta también ese rango anterior.

El consolidador usa mapas, conserva todas las familias activas ordenadas por PG y
rellena ausencia de movimientos con cero. Factores NULL, cero o negativos producen
warnings y toneladas `null` en totales afectados (unidades permanecen disponibles).
Stock inválido en un depósito no anula el total de otro depósito sin stock afectado.
Para datos maestros se detecta `CODE_NOT_FOUND`, `INVALID_FACTOR`, `MULTIPLE_FACTORS`
y `OK`. Un clasificador 5 ligado a varios clasificadores 4 devuelve `null` en esa
clasificación y un warning, sin elegir uno arbitrariamente.

Stock en días usa toneladas de ambos consumos / días reales de rotación; sin
consumo neto positivo devuelve `null` / `NO_CONSUMPTION`. Factores inválidos tienen
estados `INVALID_CONSUMPTION_FACTOR` o `INVALID_STOCK_FACTOR`. La respuesta principal
conserva el contrato propuesto `{parameters,periods,families,warnings}` y añade las
dos fechas explícitas de rotación a `parameters`. Advertencias de datos están en
cada familia. Si falla un bloque requerido, se responde el error estándar
`{ok:false,code,message,errors}` con 503, sin resultados parciales.

## Verificación

`npm run test:gdc` ejecuta unitarias y HTTP locales con ambos motores mockeados:
fechas, límites, ceros iniciales, referencias, familias vacías, factores, reglas SQL
de cancelación/filtros/signos, aislamiento, pool, timeout/cancelación, tokens,
auditoría, errores y migraciones. Nunca consulta ni escribe en el ERP productivo.
`npm run lint` y `npm run build` incluyen la sintaxis de todos los archivos GDC.
Este proyecto JavaScript no tiene compilador ni verificación estática de tipos;
los DTO se documentan con JSDoc en `gdc.dto.js`.

Los errores de Compras se definen en `gdc.errors.js`: `GdcError` y
`GdcValidationError`. Conservan el contrato HTTP del backend sin importar clases
del módulo de Gestión Financiera.

La suite general `npm test` mantiene además las pruebas existentes de rutas de
Finanzas que dependen de una base PostgreSQL con usuarios, roles y registros
precargados y contienen POST/PUT reales. Ejecutarlas solo contra un ambiente de
pruebas descartable. No existe aquí una infraestructura de integración con motores
descartables; la integración nueva se verifica por HTTP local con repositorios
simulados. Los SQL todavía requieren comparación de resultados en un ambiente ERP
de lectura habilitado, sin crear objetos ni ejecutar migraciones en ese motor.

En la verificación de esta entrega, lint y build aprobaron. La suite general se
ejecutó con las conexiones generales dirigidas a localhost sin servicio de DB:
ocho pruebas de rutas financieras requieren PostgreSQL con fixtures. También
fallan dos verificaciones existentes: diferencias entre los SQL de procedimientos
financieros de producción/testing, y la prueba de Rotación que captura un fragmento
de `api.js` incluyendo otro endpoint con `error.message` (reproducido sobre HEAD).
Los archivos de esos procedimientos no se modificaron en esta entrega.

Confirmaciones de Gabriel/Javier antes de puesta en producción: proveedor NULL o
filtro histórico 1335; permisos efectivos del login
de Plataforma y certificado TLS; confirmar con resultados de ERP que se desea
mantener el criterio histórico de signo en Producción y la exclusión 8 solo en SDPP.

## Archivos entregados

Modificados: `api.js`, `package.json`, `.env.example`, `.gitignore`.
Nuevo SQL manual: `database/20261002_gdc_configuracion.sql`.

Nuevo módulo `src/modules/gdc/`:

- `gdc-config.repository.js`: snapshot y administración PG.
- `gdc-sqlserver.repository.js`, `gdc-sqlserver.queries.js`: pool y seis SELECT ERP.
- `gdc-consumption.service.js`, `gdc-sales-order.service.js`, `gdc-stock.service.js`,
  `gdc-purchase-order.service.js`, `gdc-data.service.js`: bloques funcionales.
- `gdc.service.js`: orquestador y consolidación.
- `gdc.controller.js`, `gdc.routes.js`, `gdc.validator.js`, `gdc.errors.js`: HTTP,
  autenticación por token, validación y errores propios de Compras.
- `gdc.mapper.js`, `gdc.dto.js`: mapas, conversiones y contrato.
- `gdc.test.js`, `gdc.routes.test.js`, `check-syntax.js`: pruebas y sintaxis.
- `README.md`: operación, decisiones y entrega.
