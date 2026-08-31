import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
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
