import crypto from "crypto";

export function verifyShopifyHmac(req) {
  const hmacHeader = req.get("X-Shopify-Hmac-Sha256");
  const secret = "ee72f1d1fb385ed6aa89e08d28720cdca13e4581b111f2db35e5490f18792911";

  const generatedHash = crypto
    .createHmac("sha256", secret)
    .update(req.body)
    .digest("base64");

  return generatedHash === hmacHeader;
}