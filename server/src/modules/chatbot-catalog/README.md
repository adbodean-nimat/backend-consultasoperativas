# Catálogo para el chatbot

El endpoint `POST /internal/chatbot/catalog/products` confirma precio, stock,
publicación y URL para una lista de SKU. Requiere el encabezado
`x-chatbot-token` y acepta como máximo 20 SKU por consulta.

Variables del backend:

```env
CHATBOT_CATALOG_SERVICE_TOKEN=secreto-compartido
FILE_PRODUCTOS_V2=C:/ruta/productos.json
OUTPUT_VECTOR_PRODUCTS_DIR_V2=C:/ruta/vector-products
OUTPUT_VECTOR_MANIFEST_V2=C:/ruta/vector-products.manifest.json
OPENAI_PRODUCT_UPLOAD_CONCURRENCY=8
```

Variables del chatbot:

```env
NIMAT_CATALOG_API_URL=https://api.example.com/internal/chatbot/catalog/products
NIMAT_CATALOG_API_TOKEN=el-mismo-secreto-compartido
```

El endpoint indexa `productos.json` en memoria por SKU. En cada consulta revisa
la fecha de modificación y solo vuelve a leerlo cuando el generador creó una
versión nueva. Si una lectura coincide con el instante de regeneración, conserva
el último índice válido en lugar de dejar el servicio fuera de línea.

La primera ejecución de `syncOpenAIv2()` migra desde `productos.json`: carga y
procesa todos los documentos por SKU y recién entonces elimina el archivo
monolítico. Las ejecuciones posteriores comparan hashes y solo reemplazan los
SKU modificados, agregan los nuevos y eliminan los que dejaron de existir.
