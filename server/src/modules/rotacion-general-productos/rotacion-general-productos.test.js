import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import express from "express";
import {
  CONFIG_RESOURCES,
  RotacionProductosConfigRepository,
} from "./rotacion-general-productos-config.repository.js";
import { createRotacionProductosConfigRouter } from "./rotacion-general-productos-config.routes.js";
import {
  RotacionGeneralProductosValidationError,
  filtrarRotacionGeneralProductos,
  validarFiltrosRotacionGeneralProductos,
} from "./rotacion-general-productos.validator.js";

const apiSource = await readFile(
  new URL("../../../api.js", import.meta.url),
  "utf8",
);
const dbSource = await readFile(
  new URL("../../../dboperacion.js", import.meta.url),
  "utf8",
);

const endpointSource = apiSource.slice(
  apiSource.indexOf('router.route("/rotaciongeneralproductos")'),
  apiSource.indexOf("const httpPort", apiSource.indexOf("rotaciongeneralproductos")),
);
const operationSource = dbSource.slice(
  dbSource.indexOf("async function getRotacionGeneralProductos("),
  dbSource.indexOf("\nexport default", dbSource.indexOf("getRotacionGeneralProductos")),
);

async function withConfigServer(repository, callback) {
  const app = express();
  app.use(express.json());
  app.use(
    "/api/rotaciongeneralproductos/configuracion",
    createRotacionProductosConfigRouter(repository),
  );
  const server = await new Promise((resolve) => {
    const listeningServer = app.listen(0, "127.0.0.1", () =>
      resolve(listeningServer),
    );
  });
  const { port } = server.address();
  try {
    await callback(
      `http://127.0.0.1:${port}/api/rotaciongeneralproductos/configuracion`,
    );
  } finally {
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
}

test("GET /api/rotaciongeneralproductos conserva el contrato y oculta errores internos", () => {
  assert.match(endpointSource, /\.get\(async \(req, res\) =>/);
  assert.match(endpointSource, /validarFiltrosRotacionGeneralProductos\(req\.query\)/);
  assert.match(endpointSource, /getRotacionGeneralProductos\(\)/);
  assert.match(endpointSource, /filtrarRotacionGeneralProductos\(allRows, filtros\)/);
  assert.match(endpointSource, /status\(400\)\.json\(\{ ok: false, message: error\.message \}\)/);
  assert.match(endpointSource, /status\(200\)\.json\(\{[\s\S]*ok: true,[\s\S]*total: rows\.length,[\s\S]*rows,/);
  assert.match(endpointSource, /status\(500\)\.json\(\{[\s\S]*ok: false,[\s\S]*message:/);
  assert.doesNotMatch(endpointSource, /error:\s*error(?:\.|,)/);
});

test("la configuración usa parámetros SQL individuales y no OPENJSON", () => {
  assert.match(operationSource, /const parametrosSql = \[\];/);
  assert.match(
    operationSource,
    /request\.input\(name, type, value\)/,
  );
  assert.match(operationSource, /sql\.VarChar\(20\)/);
  assert.match(operationSource, /sql\.VarChar\(50\)/);
  assert.match(operationSource, /sql\.NVarChar\(100\)/);
  assert.match(operationSource, /sql\.Int/);
  assert.match(operationSource, /VALUES[\s\S]*\$\{compradoresSql\}/);
  assert.doesNotMatch(operationSource, /OPENJSON\(/);
  assert.doesNotMatch(operationSource, /JSON\.stringify\(/);
});

test("las listas vacías preservan la semántica de IN y NOT IN", () => {
  assert.match(
    operationSource,
    /return placeholders\.length \? placeholders\.join\(", "\) : "NULL"/,
  );
  assert.match(
    operationSource,
    /const excluirDepositosSql = configuracion\.DepExcluidos\.length[\s\S]*:\s*""/,
  );
  assert.match(
    operationSource,
    /const excluirArticulosSql = configuracion\.ArtOmitidos\.length[\s\S]*:\s*""/,
  );
});

test("normaliza los filtros usados por el frontend", () => {
  assert.deepEqual(
    validarFiltrosRotacionGeneralProductos({
      compradores: ["  Comprador A ", "Comprador A", "Comprador B"],
      "clasificacion4[]": ["Clase 4 A", "Clase 4 B"],
      clasificacion5: "Todas",
      stock: "POSITIVO",
      exhibicion: "sin",
      diasDesde: "0",
      diasHasta: "365",
    }),
    {
      compradores: ["Comprador A", "Comprador B"],
      clasificacion4: ["Clase 4 A", "Clase 4 B"],
      clasificacion5: [],
      clasificacion6: [],
      clasificacion8: [],
      stock: "positivo",
      exhibicion: "sin",
      diasDesde: 0,
      diasHasta: 365,
    },
  );
});

test("sin parámetros equivale a Todos/Todas", () => {
  assert.deepEqual(validarFiltrosRotacionGeneralProductos(), {
    compradores: [],
    clasificacion4: [],
    clasificacion5: [],
    clasificacion6: [],
    clasificacion8: [],
    stock: null,
    exhibicion: null,
    diasDesde: null,
    diasHasta: null,
  });
});

test("rechaza enums, días y rangos inválidos", () => {
  for (const query of [
    { stock: "con-stock" },
    { exhibicion: "tal-vez" },
    { diasDesde: "1.5" },
    { diasDesde: "20", diasHasta: "10" },
  ]) {
    assert.throws(
      () => validarFiltrosRotacionGeneralProductos(query),
      RotacionGeneralProductosValidationError,
    );
  }
});

test("aplica en conjunto multiselecciones, stock, exhibición y días", () => {
  const rows = [
    {
      id: 1,
      "Nombre Comprador": "Comprador A",
      CA04_NOMBRE: "C4",
      CA05_NOMBRE: "C5",
      CA06_NOMBRE: "C6",
      CA08_NOMBRE: "C8",
      "Stock Disp": 4,
      Exhibido: 2,
      "Días sin venta": 30,
    },
    {
      id: 2,
      "Nombre Comprador": "Comprador A",
      CA04_NOMBRE: "C4",
      CA05_NOMBRE: "C5",
      CA06_NOMBRE: "C6",
      CA08_NOMBRE: "C8",
      "Stock Disp": 0,
      Exhibido: null,
      "Días sin venta": 30,
    },
    {
      id: 3,
      "Nombre Comprador": "Otro",
      CA04_NOMBRE: "C4",
      CA05_NOMBRE: "C5",
      CA06_NOMBRE: "C6",
      CA08_NOMBRE: "C8",
      "Stock Disp": 4,
      Exhibido: 2,
      "Días sin venta": 30,
    },
  ];
  const filters = validarFiltrosRotacionGeneralProductos({
    compradores: "Comprador A",
    clasificacion4: "C4",
    clasificacion5: "C5",
    clasificacion6: "C6",
    clasificacion8: "C8",
    stock: "positivo",
    exhibicion: "con",
    diasDesde: "10",
    diasHasta: "40",
  });

  assert.deepEqual(
    filtrarRotacionGeneralProductos(rows, filters).map((row) => row.id),
    [1],
  );
});

test("distingue stock cero/negativo, sin exhibición y días nulos", () => {
  const base = validarFiltrosRotacionGeneralProductos({});
  const rows = [
    { id: 1, "Stock Disp": 0, Exhibido: null, "Días sin venta": null },
    { id: 2, "Stock Disp": -2, Exhibido: 0, "Días sin venta": 50 },
  ];

  assert.deepEqual(
    filtrarRotacionGeneralProductos(rows, { ...base, stock: "cero" }).map(
      (row) => row.id,
    ),
    [1],
  );
  assert.deepEqual(
    filtrarRotacionGeneralProductos(rows, {
      ...base,
      stock: "negativo",
      exhibicion: "sin",
      diasDesde: 10,
    }).map((row) => row.id),
    [2],
  );
});

test("el resultado ausente de SQL Server se normaliza a una lista vacía", () => {
  assert.match(operationSource, /const rows = getResponse\.recordset \|\| \[\];/);
  assert.match(operationSource, /return rows;/);
});

test("la configuración publica exactamente los siete recursos PostgreSQL", () => {
  assert.deepEqual(Object.keys(CONFIG_RESOURCES), [
    "articulos-omitidos",
    "compradores",
    "depositos-excluidos",
    "depositos-exhibidos",
    "tipos-articulo",
    "tipos-comprobante-recepcion",
    "tipos-npca",
  ]);
  assert.equal(CONFIG_RESOURCES["articulos-omitidos"].codeMaxLength, 8);
  assert.equal(
    CONFIG_RESOURCES["tipos-comprobante-recepcion"].descriptionMaxLength,
    150,
  );
  assert.match(
    endpointSource,
    /router\.use\([\s\S]*"\/rotaciongeneralproductos\/configuracion"[\s\S]*rotacionProductosConfigRouter/,
  );
});

test("el repositorio parametriza valores y limita identificadores al catálogo", async () => {
  const calls = [];
  const database = {
    async query(text, values) {
      calls.push({ text, values });
      return {
        rows: [
          {
            codigo_comprador: "001",
            nombre_comprador: "Comprador",
            activo: true,
          },
        ],
      };
    },
  };
  const repository = new RotacionProductosConfigRepository(database);
  const definition = CONFIG_RESOURCES.compradores;

  await repository.create(definition, {
    code: "001",
    description: "Comprador",
    activo: true,
  });
  await repository.update(definition, "001", { activo: false });
  await repository.delete(definition, "001");

  assert.deepEqual(calls[0].values, ["001", "Comprador", true]);
  assert.match(calls[0].text, /VALUES \(\$1, \$2, \$3, CURRENT_TIMESTAMP\)/);
  assert.deepEqual(calls[1].values, [false, "001"]);
  assert.match(calls[1].text, /activo = \$1/);
  assert.deepEqual(calls[2].values, ["001"]);
  assert.match(calls[2].text, /codigo_comprador = \$1/);
});

test("GET y POST de configuración respetan el contrato HTTP", async () => {
  const received = [];
  const repository = {
    async list(definition) {
      received.push(["list", definition.table]);
      return [{ codigo_comprador: "001", nombre_comprador: "Uno", activo: true }];
    },
    async create(definition, values) {
      received.push(["create", definition.table, values]);
      return {
        codigo_comprador: values.code,
        nombre_comprador: values.description,
        activo: values.activo,
      };
    },
  };

  await withConfigServer(repository, async (baseUrl) => {
    const listResponse = await fetch(`${baseUrl}/compradores`);
    assert.equal(listResponse.status, 200);
    assert.deepEqual(await listResponse.json(), {
      ok: true,
      total: 1,
      rows: [
        { codigo_comprador: "001", nombre_comprador: "Uno", activo: true },
      ],
    });

    const createResponse = await fetch(`${baseUrl}/compradores`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        codigo_comprador: " 002 ",
        nombre_comprador: " Dos ",
      }),
    });
    assert.equal(createResponse.status, 201);
    assert.deepEqual(await createResponse.json(), {
      ok: true,
      row: {
        codigo_comprador: "002",
        nombre_comprador: "Dos",
        activo: true,
      },
    });
  });

  assert.deepEqual(received, [
    ["list", "gv_compradores"],
    [
      "create",
      "gv_compradores",
      { code: "002", description: "Dos", activo: true },
    ],
  ]);
});

test("PUT es parcial, mantiene inmutable el código y devuelve 404 si no existe", async () => {
  const repository = {
    async update(_definition, code, changes) {
      if (code === "404") return null;
      return { codigo_articulo: code, descripcion: "Artículo", ...changes };
    },
  };

  await withConfigServer(repository, async (baseUrl) => {
    const updateResponse = await fetch(`${baseUrl}/articulos-omitidos/ABC`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ activo: false }),
    });
    assert.equal(updateResponse.status, 200);
    assert.equal((await updateResponse.json()).row.activo, false);

    const immutableResponse = await fetch(`${baseUrl}/articulos-omitidos/ABC`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ codigo_articulo: "OTRO", activo: true }),
    });
    assert.equal(immutableResponse.status, 400);
    assert.equal((await immutableResponse.json()).code, "CONFIG_CODE_IMMUTABLE");

    const missingResponse = await fetch(`${baseUrl}/articulos-omitidos/404`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ activo: true }),
    });
    assert.equal(missingResponse.status, 404);
    assert.equal((await missingResponse.json()).code, "CONFIG_ROW_NOT_FOUND");
  });
});

test("valida payloads y traduce conflictos sin exponer errores internos", async () => {
  const repository = {
    async create() {
      const error = new Error("duplicate key value violates unique constraint secreto");
      error.code = "23505";
      throw error;
    },
    async delete(_definition, code) {
      return { codigo_deposito: code, descripcion: "Depósito", activo: true };
    },
  };

  await withConfigServer(repository, async (baseUrl) => {
    const invalidResponse = await fetch(`${baseUrl}/depositos-exhibidos`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        codigo_deposito: "no-numérico",
        descripcion: "Depósito",
      }),
    });
    assert.equal(invalidResponse.status, 400);
    assert.equal((await invalidResponse.json()).code, "CONFIG_VALIDATION_ERROR");

    const duplicateResponse = await fetch(`${baseUrl}/compradores`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        codigo_comprador: "001",
        nombre_comprador: "Uno",
      }),
    });
    assert.equal(duplicateResponse.status, 409);
    const duplicateBody = await duplicateResponse.json();
    assert.equal(duplicateBody.code, "CONFIG_DUPLICATE_CODE");
    assert.doesNotMatch(JSON.stringify(duplicateBody), /secreto|constraint/i);

    const deleteResponse = await fetch(`${baseUrl}/depositos-exhibidos/12`, {
      method: "DELETE",
    });
    assert.equal(deleteResponse.status, 200);
    assert.equal((await deleteResponse.json()).row.codigo_deposito, 12);

    const unknownResponse = await fetch(`${baseUrl}/tabla-secreta`);
    assert.equal(unknownResponse.status, 404);
    assert.equal(
      (await unknownResponse.json()).code,
      "CONFIG_RESOURCE_NOT_FOUND",
    );
  });
});

test("un error PostgreSQL inesperado se responde sin detalles internos", async () => {
  const repository = {
    async list() {
      throw new Error("password=secreto host=interno");
    },
  };
  const originalConsoleError = console.error;
  console.error = () => {};
  try {
    await withConfigServer(repository, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/compradores`);
      assert.equal(response.status, 500);
      const body = await response.json();
      assert.deepEqual(body, {
        ok: false,
        code: "CONFIG_INTERNAL_ERROR",
        message: "No se pudo procesar la configuración",
      });
      assert.doesNotMatch(JSON.stringify(body), /password|secreto|interno/i);
    });
  } finally {
    console.error = originalConsoleError;
  }
});
