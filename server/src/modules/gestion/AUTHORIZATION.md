# Autorización de Gestión Financiera

## Base de datos

La implementación reutiliza el pool PostgreSQL existente de `dboperacion_pg.js` y las tablas
`gf_*` creadas por `database/gestion_financiera_auth.sql`. La API no ejecuta ese SQL al iniciar.

En Testing se verificó que existen `gf_usuarios`, `gf_roles`, `gf_permisos`,
`gf_usuario_roles`, `gf_rol_permisos`, `gf_configuracion_general` y `gf_auditoria`.

Para instalar el esquema manualmente en otro ambiente, ejecutar el archivo desde pgAdmin o:

```powershell
psql -h $env:PSQL_SERVER -p $env:PSQL_PORT -U $env:PSQL_USER -d $env:PSQL_DATABASE -f database/gestion_financiera_auth.sql
```

## Variables de entorno

Se reutilizan las variables existentes:

- `JWT_SECRET`
- `PSQL_USER`
- `PSQL_PASSWORD`
- `PSQL_SERVER`
- `PSQL_DATABASE`
- `PSQL_PORT`

Bootstrap temporal opcional:

```env
GESTION_BOOTSTRAP_ADMIN=abodean
```

Durante el login del usuario indicado se lo activa y se asigna `ADMIN_GESTION` dentro de una
transacción. La operación es idempotente y queda en `gf_auditoria`. Retirar la variable después
de comprobar el primer acceso administrativo.

## Permisos

El login global `POST /login` conserva su contrato histórico y no consulta las tablas `gf_*`,
porque también es utilizado por Simulador y Consultas Operativas.

Gestión Financiera debe iniciar sesión mediante:

```text
POST /api/gestion/login
```

Esta ruta es pública hasta completar LDAP y luego comprueba `gestion.ingresar`. Todas las demás
rutas bajo `/api` conservan el middleware global `verifyUserToken`; las rutas de Gestión agregan
la comprobación del permiso efectivo en PostgreSQL.

- GET de datos y configuración visible: `gestion.consultar`.
- POST/PUT de registros financieros: `gestion.editar`.
- Modificación de configuración: `gestion.configurar`.
- Usuarios y roles: `gestion.administrar_usuarios`.

Alta o sincronización administrativa desde Active Directory:

```http
POST /api/gestion/admin/usuarios
Content-Type: application/json
Authorization: Bearer <token-gestion>

{
  "username": "jperez",
  "activo": true,
  "roles": ["LECTOR_GESTION"]
}
```

El endpoint busca el perfil en Active Directory mediante la cuenta técnica configurada, sin pedir
ni almacenar la contraseña del usuario. Luego sincroniza perfil, estado y roles en una transacción
y registra `CREAR_USUARIO` o `SINCRONIZAR_USUARIO` en `gf_auditoria`.

El JWT usa `HS256`, pero los permisos efectivos se vuelven a consultar en PostgreSQL en cada
endpoint protegido. Desactivar un usuario o cambiar sus roles invalida su autorización sin esperar
el vencimiento del token.

## Verificación

```powershell
node --test src/modules/gestion/gestion-auth.test.js
node --test src/modules/gestion/gestion.routes.test.js
node --check api.js
```
