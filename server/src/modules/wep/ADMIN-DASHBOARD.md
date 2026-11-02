# Centro de control WEP

La edición de parámetros y accesos se documenta en [SETTINGS.md](SETTINGS.md).
Con ese módulo habilitado, TIC también dispone de Configuración y Camiones y
accesos; las restricciones de solo lectura siguientes describen el tablero base.

Frontend: `/administracion/login` y `/administracion`. API:
`/api/wep/control`. Usa cuentas propias en PostgreSQL WEP, sin Active Directory
ni PIN del vehículo. No hay registro público ni usuarios/contraseñas iniciales.

## Roles

- CONSULTA: Ramiro, Beto y otros lectores. Filtros, indicadores y entregas.
- TIC: lo anterior, diagnóstico, historial compartido de tareas, códigos de error
  de avisos y administración de usuarios (crear, cambiar rol/contraseña/desactivar).

Ninguno de estos roles tiene endpoints para enviar WhatsApp, sincronizar
manualmente o modificar entregas. El servidor comprueba el rol en cada solicitud;
ocultar pestañas no es el control de acceso. Los JWT administrativos usan secreto,
issuer y audience propios; no sirven en la API histórica ni como token de chofer.
Cambiar un usuario invalida sus sesiones anteriores. No se puede desactivar ni
degradar al último TIC activo. TIC debe restablecer las contraseñas olvidadas.

## Instalación

1. Aplicar `server/database/wep-admin.sql` en **la base configurada por WEP_PG_***.
   Crea tablas de usuarios e historial; no crea cuentas ni modifica entregas.
2. Configurar en todas las instancias el mismo `WEP_ADMIN_JWT_SECRET`, aleatorio,
   de al menos 32 caracteres y diferente de `JWT_SECRET`. Mantenerlo sólo en el
   entorno del servidor. Configurar `WEP_MONITOR_ENABLED=true` después de aplicar
   la migración para registrar las ejecuciones futuras.
3. Desde `server`, ejecutar en terminal interactiva:

   ```powershell
   node scripts/wep-admin-create-user.js
   ```

   Pide nombre de usuario, nombre visible y contraseña dos veces, oculta durante
   su ingreso. Sólo permite crear el primer usuario TIC y no imprime contraseñas.
   Contraseña: mínimo 12 caracteres, máximo 72 bytes UTF-8 por el límite bcrypt.
4. Desplegar backend y PWA con su `VITE_API_BASE_URL` habitual apuntando a
   `/api/wep`. El hosting debe resolver rutas SPA `/administracion` y
   `/administracion/login` a `index.html`. Usar HTTPS como en el resto de WEP.
5. Reiniciar todas las instancias. Verificar que `NODE_APP_INSTANCE` esté definido
   en cada una: sólo `0` agenda los cron existentes. El tablero puede atender
   solicitudes desde cualquiera: usuarios, revocación e historial son compartidos.
6. Ingresar con el primer TIC y crear a Ramiro/Beto como CONSULTA; crear otras
   cuentas TIC según necesidad. Comunicar las contraseñas por el canal habitual.
   No se crearon cuentas reales durante el desarrollo.

La migración no activa envíos de WhatsApp ni desactiva la tarea 73.
`WEP_PROGRAMMED_ENABLED` y `WEP_PROGRAMMED_DRY_RUN` siguen siendo independientes.

## Interpretación

- Hora de Argentina en filtros y marcas temporales; actualización cada minuto
  mientras la pestaña está visible. Puede pausarse o actualizarse manualmente.
- Indicadores y tabla filtrados por fecha de entrega, vehículo, estado y búsqueda
  literal por cliente/pedido/localidad. La PWA solicita `agrupar=parada`: paginación
  de 50 paradas completas en el servidor. Los pedidos de una parada no se cortan
  entre páginas. Sin ese parámetro se mantiene la respuesta por órdenes anterior.
- Una parada agrupa por viaje, código de cliente, domicilio y localidad
  normalizados, igual que la aplicación de choferes. Distintos destinos o viajes
  del mismo cliente siguen separados. `groups[].orders` conserva los pedidos que
  coinciden con los filtros, con su estado, franja y aviso propio. `totalGroups`
  indica el total filtrado; `summary.total` sigue contando registros de entrega/OP.
- Cada registro de entrega corresponde a una orden de preparación (OP), no a
  una nota de pedido única. Varias OP pueden referenciar el mismo pedido. El
  detalle visual agrupa por división, tipo y número de nota de pedido dentro de
  cada parada. Presenta una sola franja, estado y aviso por pedido, sin exponer
  las OP. Estados mixtos se resumen como entrega parcial o con incidencias;
  horarios diferentes requieren confirmar la franja. Se toma el aviso más
  reciente y no se deja que un registro sin aviso anule otro existente; errores
  sin fecha se priorizan para no ocultarlos. Los campos
  `pedido_division`, `pedido_tipo`, `op_division`, `op_tipo` y `op_numero` permiten
  distinguir los documentos sin descartar registros. Los agregados históricos
  `total`, `entregadas` y `trend[].pedidos` cuentan registros/OP.
- Con `agrupar=parada`, `trend` devuelve 7, 14 o 30 días (`dias`, por defecto 14),
  hasta `fecha`, con días vacíos en cero. Aplica vehículo; no aplica estado ni
  búsqueda. Cuenta paradas y pedidos por **fecha programada**, con su estado
  actual. Una parada cuenta como completada sólo si todos sus pedidos están
  ENTREGADA; no representa la cantidad de confirmaciones ocurridas ese día.
- Los avisos = registros de notificación, no clientes únicos.
  La tabla muestra el último aviso anclado a cada orden; un aviso de parada puede
  estar registrado en otra orden de la misma parada. PROGRAMADA_TEST se excluye
  de la vista operativa y se incluye en los errores técnicos.
- ENVIADO significa aceptado por Meta. ENTREGADO/LEIDO requieren confirmación
  recibida y persistida por la integración existente. Este tablero no implementa
  un webhook nuevo ni comprueba vigencia del token con Meta.
- Diagnóstico indica presencia de configuración; no presenta credenciales,
  URLs internas ni respuestas completas del proveedor. Último registro importado
  no equivale a última conexión exitosa al ERP.
- Historial: últimas 30 ejecuciones automáticas iniciadas en la fecha elegida.
  Sólo se registra desde que se habilita el monitor; no reconstruye históricos
  ni registra los endpoints manuales. Una tarea RUNNING sin cierre puede estar
  activa o haber sido interrumpida; no se afirma que sigue ejecutándose.
- No muestra logs de texto ni el estado en vivo de PM2, GPS o procesos externos.
  Esos componentes requieren su diagnóstico existente. Si falla la base, el
  tablero muestra error, no ceros que aparenten una operación vacía.
- La escritura de monitoreo es de mejor esfuerzo: un fallo se registra en logs
  y no interrumpe sincronizaciones/envíos. Planificar retención de historial en
  PostgreSQL según la política de TIC.
- Límite de login: 10 intentos por IP en 15 minutos por instancia. El proxy de
  producción debe preservar IP de forma confiable y aplicar su límite global.
- Sesión: 8 horas, token guardado en sessionStorage independiente del chofer;
  cerrar sesión elimina la copia del navegador. Desactivar/cambiar usuario o
  rotar el secreto revoca sus sesiones en el servidor. Para recuperar el último
  TIC perdido, usar el procedimiento de recuperación de base autorizado por TIC.

## Verificación

```powershell
node --test src/modules/wep/wep-admin.test.js src/modules/wep/wep-programmed-scheduler.test.js src/modules/wep/wep-sync-scheduler.test.js
```

Las pruebas usan dobles de base y servicios: no se aplicó la migración ni se
consultaron datos productivos. Antes de habilitar acceso externo, comprobar las
consultas con la base WEP de prueba, ambos roles y el registro desde instancia 0.
