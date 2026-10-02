import { byFamily, numeric } from "./gdc.mapper.js";
export async function loadData(repository, config, signal, readBlock) {
  return byFamily(await readBlock("data", () => repository.data(config, signal)));
}
export function familyData(family, row) {
  const status = !row || !Number(row.matches) ? "CODE_NOT_FOUND" : Number(row.invalidFactors) > 0 ? "INVALID_FACTOR" : Number(row.distinctFactors) > 1 ? "MULTIPLE_FACTORS" : "OK";
  const factor = status === "OK" ? numeric(row.factor) : null;
  const classifierValid = Number(row?.classifier4Count) === 1;
  const warnings = status === "OK" ? [] : [{ code: status, block: "data", articleCode: family.codigo_ref_13m ?? family.codigo_ref_hl }];
  if (Number(row?.classifier4Count) > 1) warnings.push({ code: "MULTIPLE_CLASSIFIER4", block: "data" });
  return {
    classifier4: classifierValid ? row.classifier4 : null,
    classifier4Name: classifierValid ? row.classifier4Name : null,
    data: { referenceCodeKg: family.codigo_ref_13m ?? family.codigo_ref_hl, factorHomogeneousStock: factor, kgPerMeterOrHl: factor === null ? null : 1000 / factor, notes: family.notas ?? null, status }, warnings,
  };
}
