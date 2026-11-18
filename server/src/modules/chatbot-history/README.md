# Historial privado del chatbot

Rutas GET de solo lectura: `/api/chatbot/chats` y `/api/chatbot/chats/:id`.
Se montan antes del middleware histórico global de `/api` para reutilizar
`authenticateToken` (JWT HS256 con firma y vencimiento, 401 para tokens inválidos)
y devolver `no-store, private` incluso en errores de autenticación.
Los sectores se validan contra `user.memberOf` del JWT firmado: Gerencia,
Ventas y Sistemas. Otros sectores reciben 403. No se utilizan permisos de Finanzas.

Configurar únicamente en el entorno privado del proceso del backend:

- `NIMAT_CHATBOT_URL`: origen HTTPS del chatbot, sin path, query, fragmento ni
  credenciales (se permite una barra final).
- `NIMAT_CHATBOT_HISTORY_KEY`: clave de acceso al historial, sin espacios ni
  caracteres de control.

No agregar estas variables a la compilación Vue ni usar prefijos públicos.
No guardar sus valores en Git. No registrar solicitudes salientes, headers
Authorization, errores Axios completos ni los cuerpos del historial en APM/logs.
El módulo no emite logs ni persiste respuestas.

El servidor solo consulta los paths fijos `/api/h/chats` y `/api/h/chats/{id}`;
construye headers nuevos con Accept y el Bearer privado. No reenvía cookies,
Origin, Authorization interno ni ningún otro header del navegador. Se rechazan
URLs del cliente, parámetros desconocidos, duplicados, arrays, IDs con separadores
y cursores con controles. Límites: 100 elementos, q hasta 500 caracteres,
ID alfanumérico/guion/guion bajo de hasta 200 y cursor opaco de hasta 1000.

El timeout absoluto es de 10 segundos, no se siguen redirecciones, no se utiliza
proxy del entorno y se limita la respuesta a 5 MiB. Se valida JSON y se proyectan
solo los campos del contrato. No se cachea. Excluir las rutas de cualquier caché
del CDN/reverse proxy de despliegue, respetando Cache-Control y Surrogate-Control.

Errores locales: 400 parámetros, 401 sesión, 403 sector, 404 ruta, 405 método,
503 configuración ausente/inválida, 504 timeout y 502 conexión, redirección,
error upstream o contrato inválido. Un 401/403 del chatbot se traduce a 502,
para no invalidar la sesión interna por un problema de la credencial de servicio.
No se reenvían cuerpos, headers ni mensajes de error del upstream.

El chatbot debe ordenar el listado por última actividad **antes** de paginar y
resolver `q` sobre mensajes, nombres de producto o SKU. El detalle debe incluir
el resumen de todos los productos de la conversación, aunque los mensajes estén
paginados. El proxy conserva el orden y los cursores de ese contrato.

Ejecutar `npm run test:chatbot-history`. Las pruebas HTTP usan JWT reales firmados
con un secreto sintético y un transporte upstream controlado; no levantan el
servidor productivo, jobs, LDAP ni conexiones a bases de datos.
Para verificar en despliegue: configurar las dos variables, reiniciar el backend,
probar un chat real desde la tarjeta Chatbot y revisar Network del navegador:
solo debe aparecer el backend interno con el token interno. La clave del historial
solo viaja desde el servidor al chatbot. No se requiere recompilar Vue con secretos.
