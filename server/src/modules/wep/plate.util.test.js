import assert from "node:assert/strict";
import test from "node:test";
import { normalizePlate } from "./plate.util.js";

test("normalizePlate elimina espacios y convierte a mayúsculas", () => {
  assert.equal(normalizePlate(" AB 172 IL "), "AB172IL");
  assert.equal(normalizePlate("aa 226 xh"), "AA226XH");
  assert.equal(normalizePlate("AB172IK"), "AB172IK");
});

test("normalizePlate admite valores no string y devuelve null si queda vacío", () => {
  assert.equal(normalizePlate(null), null);
  assert.equal(normalizePlate(undefined), null);
  assert.equal(normalizePlate("   \t"), null);
  assert.equal(normalizePlate(123), "123");
});

