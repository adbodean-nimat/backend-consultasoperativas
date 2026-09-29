import assert from "node:assert/strict";
import fsPromises from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

test("indexa productos.json por SKU y se recarga cuando cambia", async (t) => {
  const directory = await fsPromises.mkdtemp(
    path.join(os.tmpdir(), "chatbot-catalog-"),
  );
  const catalogPath = path.join(directory, "productos.json");
  t.after(() => fsPromises.rm(directory, { recursive: true, force: true }));

  const writeCatalog = async (price, stock) => {
    await fsPromises.writeFile(
      catalogPath,
      JSON.stringify([
        {
          id: "prod_abc-123",
          metadata: {
            activo: true,
            sku: "abc-123",
            nombre: "Producto de prueba",
            precio: price,
            stock,
            url: "/producto-de-prueba",
          },
        },
      ]),
      "utf8",
    );
  };

  await writeCatalog(100, true);
  process.env.FILE_PRODUCTOS_V2 = catalogPath;
  const { findLiveCatalogProducts } = await import(
    `./chatbot-catalog.service.js?test=${Date.now()}`
  );

  const first = await findLiveCatalogProducts([" ABC-123 ", "no-existe"]);
  assert.equal(first.products.length, 1);
  assert.equal(first.products[0].sku, "ABC-123");
  assert.equal(first.products[0].price, 100);
  assert.equal(first.products[0].available, true);
  assert.equal(first.products[0].stockQuantityKnown, false);
  assert.equal(first.products[0].url, "https://www.nimat.com.ar/producto-de-prueba");
  assert.deepEqual(first.missing, ["NO-EXISTE"]);

  await writeCatalog(200, false);
  const future = new Date(Date.now() + 2_000);
  await fsPromises.utimes(catalogPath, future, future);

  const second = await findLiveCatalogProducts(["abc-123"]);
  assert.equal(second.products[0].price, 200);
  assert.equal(second.products[0].available, false);
});
