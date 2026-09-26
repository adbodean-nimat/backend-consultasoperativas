import assert from "node:assert/strict";
import test from "node:test";
import { normalizeWepWhatsappPhone } from "./wep-phone.util.js";
import { normalizeAvailablePhone } from "./wep-client-notice.repository.js";
import { validateProgrammedNotificationTestBody } from "./wep.validator.js";

test("normaliza formatos argentinos usados por el ERP", () => {
  for (const value of [
    "3456266058",
    "3456 26-6058",
    "03456266058",
    "+54 3456266058",
    "+54 9 345 626-6058",
    "5493456266058",
  ]) {
    assert.equal(normalizeWepWhatsappPhone(value), "5493456266058", value);
  }
  assert.equal(normalizeWepWhatsappPhone("3454 75-8587"), "5493454758587");
  assert.equal(
    normalizeWepWhatsappPhone("3454 05-9978 DIRIE CRISTIAN"),
    "5493454059978",
  );
});

test("rechaza números ambiguos o incompletos", () => {
  for (const value of [
    null,
    "sin número",
    "154-047985 ROBERTO BRAMBILLA",
    "421-4373 / 154-032216",
    "3455 43-4956 DANILO / BRUNO 3455 54-6835",
    "123",
    "11345678901",
  ]) {
    assert.equal(normalizeWepWhatsappPhone(value), null, String(value));
  }
});

test("prioriza el principal válido y usa el alternativo si hace falta", () => {
  assert.equal(
    normalizeAvailablePhone({
      telefono: "3455546835",
      telefono_alternativo: "3455 43-4956 DANILO / BRUNO 3455 54-6835",
    }),
    "5493455546835",
  );
  assert.equal(
    normalizeAvailablePhone({
      telefono: "123",
      telefono_alternativo: "3454-333292",
    }),
    "5493454333292",
  );
  assert.equal(
    normalizeAvailablePhone({ telefono: null, telefono_alternativo: "154-027113" }),
    null,
  );
});

test("WEP_VALIDA_NRO=false conserva un destino literal para pruebas", () => {
  const previous = process.env.WEP_VALIDA_NRO;
  process.env.WEP_VALIDA_NRO = "false";
  try {
    assert.equal(
      normalizeAvailablePhone({
        telefono: "54 345 15 5281448",
        telefono_alternativo: null,
      }),
      "54345155281448",
    );
    assert.deepEqual(
      validateProgrammedNotificationTestBody({
        entregaRepresentativaId: 91,
        telefono: "54345155281448",
      }),
      { entregaRepresentativaId: 91, telefono: "54345155281448" },
    );
    assert.equal(normalizeWepWhatsappPhone("3455281448"), "3455281448");
    assert.equal(normalizeWepWhatsappPhone("421-4373 / 154-032216"), null);
    assert.equal(normalizeWepWhatsappPhone("sin número"), null);
  } finally {
    if (previous === undefined) delete process.env.WEP_VALIDA_NRO;
    else process.env.WEP_VALIDA_NRO = previous;
  }
});
