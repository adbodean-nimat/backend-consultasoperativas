import axios from "axios";

export class ChatbotHistoryError extends Error {
  constructor(status, code, message) {
    super(message);
    Object.assign(this, { status, code });
  }
}

const fail = () => {
  throw new ChatbotHistoryError(
    400,
    "CHATBOT_INVALID_PARAMS",
    "Los parámetros de la consulta son inválidos.",
  );
};
const record = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const count = (value) => Number.isSafeInteger(value) && value >= 0;
const text = (value) => typeof value === "string";
const timestamp = (value) =>
  value === null || (text(value) && Number.isFinite(Date.parse(value)));
const idPattern = /^[a-zA-Z0-9_-]{1,200}$/;

function positive(value, fallback) {
  if (value === undefined) return fallback;
  if (
    !text(value) ||
    !/^[1-9]\d*$/.test(value) ||
    !Number.isSafeInteger(Number(value))
  )
    fail();
  return Number(value);
}

export function validateHistoryQuery(query, detail = false) {
  const allowed = detail ? ["limit", "before"] : ["page", "limit", "q"];
  if (
    !record(query) ||
    Object.keys(query).some((key) => !allowed.includes(key))
  )
    fail();
  const limit = positive(query.limit, detail ? 100 : 25);
  if (limit > 100) fail();
  if (detail) {
    const params = { limit };
    if (query.before !== undefined) {
      if (
        !text(query.before) ||
        !query.before.length ||
        query.before.length > 1000 ||
        /[\x00-\x1f\x7f]/.test(query.before)
      )
        fail();
      params.before = query.before;
    }
    return params;
  }
  if (
    query.q !== undefined &&
    (!text(query.q) || query.q.length > 500 || /[\x00-\x1f\x7f]/.test(query.q))
  )
    fail();
  return { page: positive(query.page, 1), limit, q: (query.q ?? "").trim() };
}

export function validateHistoryId(id) {
  if (!text(id) || !idPattern.test(id)) fail();
  return id;
}

function configuration(env) {
  try {
    const url = new URL(env.NIMAT_CHATBOT_URL);
    const key = env.NIMAT_CHATBOT_HISTORY_KEY;
    if (
      /* url.protocol !== "https:" ||*/ url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.pathname !== "/" ||
      !text(key) ||
      !key.trim() ||
      /[\x00-\x20\x7f]/.test(key)
    )
      throw new Error();
    return { origin: url.origin, key };
  } catch {
    throw new ChatbotHistoryError(
      503,
      "CHATBOT_NOT_CONFIGURED",
      "El historial del chatbot no está configurado.",
    );
  }
}

function invalidResponse() {
  throw new ChatbotHistoryError(
    502,
    "CHATBOT_INVALID_RESPONSE",
    "El servicio de conversaciones devolvió una respuesta inválida.",
  );
}

function product(value, summary = false) {
  if (
    !record(value) ||
    !text(value.sku) ||
    !text(value.title) ||
    !text(value.url)
  )
    invalidResponse();
  const result = { sku: value.sku, title: value.title, url: value.url };
  if (summary) {
    if (!count(value.appearances)) invalidResponse();
    return { ...result, appearances: value.appearances };
  }
  if (value.price !== undefined) {
    if (
      value.price !== null &&
      !(typeof value.price === "number" && Number.isFinite(value.price)) &&
      !(
        text(value.price) &&
        /^\d+(?:\.\d+)?$/.test(value.price) &&
        Number.isFinite(Number(value.price))
      )
    )
      invalidResponse();
    result.price = value.price;
  }
  for (const field of ["available", "outlet"]) {
    if (value[field] !== undefined) {
      if (value[field] !== null && typeof value[field] !== "boolean")
        invalidResponse();
      result[field] = value[field];
    }
  }
  if (value.imageUrl !== undefined) {
    if (value.imageUrl !== null && !text(value.imageUrl)) invalidResponse();
    result.imageUrl = value.imageUrl;
  }
  if (value.snapshotAt !== undefined) {
    if (!timestamp(value.snapshotAt)) invalidResponse();
    result.snapshotAt = value.snapshotAt;
  }
  return result;
}

export function projectHistoryResponse(data, id, params) {
  if (!record(data) || typeof data.hasMore !== "boolean") invalidResponse();
  if (id === undefined) {
    if (
      !Array.isArray(data.items) ||
      data.items.length > params.limit ||
      !count(data.total) ||
      data.page !== params.page ||
      data.limit !== params.limit
    )
      invalidResponse();
    const items = data.items.map((item) => {
      if (
        !record(item) ||
        !text(item.id) ||
        !idPattern.test(item.id) ||
        !timestamp(item.createdAt) ||
        !timestamp(item.updatedAt) ||
        !(item.preview === null || text(item.preview)) ||
        !count(item.messageCount) ||
        !count(item.productCount)
      )
        invalidResponse();
      return {
        id: item.id,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
        preview: item.preview,
        messageCount: item.messageCount,
        productCount: item.productCount,
      };
    });
    return {
      items,
      total: data.total,
      page: data.page,
      limit: data.limit,
      hasMore: data.hasMore,
    };
  }
  if (
    data.id !== id ||
    !timestamp(data.createdAt) ||
    !timestamp(data.updatedAt) ||
    !count(data.messageCount) ||
    !Array.isArray(data.messages) ||
    data.messages.length > params.limit ||
    !Array.isArray(data.products)
  )
    invalidResponse();
  const messages = data.messages.map((message) => {
    if (
      !record(message) ||
      !text(message.id) ||
      !message.id ||
      !count(message.seq) ||
      !text(message.role) ||
      !text(message.text) ||
      !timestamp(message.createdAt) ||
      !(message.intent == null || text(message.intent)) ||
      !Array.isArray(message.products)
    )
      invalidResponse();
    return {
      id: message.id,
      seq: message.seq,
      role: message.role,
      text: message.text,
      createdAt: message.createdAt,
      intent: message.intent ?? null,
      products: message.products.map((item) => product(item)),
    };
  });
  if (
    data.hasMore &&
    ((!text(data.nextBefore) && !count(data.nextBefore)) ||
      !String(data.nextBefore).length ||
      String(data.nextBefore).length > 1000 ||
      /[\x00-\x1f\x7f]/.test(String(data.nextBefore)) ||
      (params.before !== undefined &&
        String(data.nextBefore) === params.before))
  )
    invalidResponse();
  return {
    id: data.id,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
    messageCount: data.messageCount,
    messages,
    products: data.products.map((item) => product(item, true)),
    hasMore: data.hasMore,
    nextBefore: data.hasMore ? data.nextBefore : null,
  };
}

export function createChatbotHistoryService({
  http = axios.create(),
  env = process.env,
  timeoutMs = 10000,
} = {}) {
  async function request(id, query) {
    if (id !== undefined) validateHistoryId(id);
    const params = validateHistoryQuery(query, id !== undefined);
    const { origin, key } = configuration(env);
    try {
      const response = await http.get(
        `${origin}/api/h/chats${id === undefined ? "" : `/${encodeURIComponent(id)}`}`,
        {
          params,
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${key}`,
          },
          timeout: timeoutMs,
          signal: AbortSignal.timeout(timeoutMs),
          maxRedirects: 0,
          proxy: false,
          maxContentLength: 5 * 1024 * 1024,
          responseType: "json",
          transitional: { silentJSONParsing: false },
          validateStatus: (status) => status === 200,
        },
      );
      if (
        response.status !== 200 ||
        !/^application\/json(?:\s*;|$)/i.test(
          response.headers?.["content-type"] ?? "",
        )
      )
        invalidResponse();
      return projectHistoryResponse(response.data, id, params);
    } catch (error) {
      if (error instanceof ChatbotHistoryError) throw error;
      if (["ECONNABORTED", "ETIMEDOUT", "ERR_CANCELED"].includes(error?.code)) {
        throw new ChatbotHistoryError(
          504,
          "CHATBOT_TIMEOUT",
          "El servicio de conversaciones demoró demasiado en responder.",
        );
      }
      // No propagar ni registrar errores Axios: contienen la clave en config.headers.
      throw new ChatbotHistoryError(
        502,
        "CHATBOT_UNAVAILABLE",
        "No se pudo consultar el servicio de conversaciones.",
      );
    }
  }
  return {
    list: (query) => request(undefined, query),
    detail: (id, query) => request(id, query),
  };
}
