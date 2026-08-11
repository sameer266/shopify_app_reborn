import crypto from "crypto";

const DEFAULT_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 365;

function getUnsubscribeSecret() {
  return  "ellabachebackinstocksecret";
}

function base64UrlEncode(value) {
  return Buffer.from(value).toString("base64url");
}

function base64UrlDecode(value) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function createSignature(signingInput, secret) {
  return crypto.createHmac("sha256", secret).update(signingInput).digest("base64url");
}

function createSignedToken(payload, secret, ttlSeconds = DEFAULT_TOKEN_TTL_SECONDS) {
  const now = Math.floor(Date.now() / 1000);
  const tokenPayload = {
    ...payload,
    iat: now,
    exp: now + ttlSeconds,
  };

  const header = { alg: "HS256", typ: "JWT" };
  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(tokenPayload));
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const signature = createSignature(signingInput, secret);

  return `${signingInput}.${signature}`;
}

export function generateUnsubscribeToken(subscriber) {
  if (!subscriber?.id || !subscriber?.customer_email || !subscriber?.shop_domain) {
    return null;
  }

  return createSignedToken(
    {
      subscriber_id: String(subscriber.id),
      customer_email: String(subscriber.customer_email),
      shop_domain: String(subscriber.shop_domain),
    },
    getUnsubscribeSecret()
  );
}

export function verifyUnsubscribeToken(token) {
  if (!token) return null;

  const parts = String(token).split(".");
  if (parts.length !== 3) return null;

  const [encodedHeader, encodedPayload, signature] = parts;
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const expectedSignature = createSignature(signingInput, getUnsubscribeSecret());

  if (signature.length !== expectedSignature.length) return null;

  try {
    if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) {
      return null;
    }
  } catch {
    return null;
  }

  try {
    const parsedPayload = JSON.parse(base64UrlDecode(encodedPayload));
    if (!parsedPayload?.exp) return null;

    if (Math.floor(Date.now() / 1000) >= Number(parsedPayload.exp)) {
      return null;
    }

    return parsedPayload;
  } catch {
    return null;
  }
}

export function buildUnsubscribeUrl(subscriber) {
  const token = generateUnsubscribeToken(subscriber);
  if (!token) return null;

  const baseUrl = ("https://restock-born-app-366775112035.australia-southeast1.run.app")
    .replace(/\/+$/, "");

  return `${baseUrl}/api/unsubscribe?token=${encodeURIComponent(token)}`;
}
