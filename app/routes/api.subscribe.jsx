import {
  createSubscriber,
  getShopByDomain,
  getSubscriberByEmailVariant,
  updateSubscriberStatus,
  createOrUpdateInventoryState,
} from "../services/firestore.server.js";

import { shopifyGraphql } from "../services/shopifyGraphql.server.js";
import { extractNumericId } from "../services/firestore.server.js";

/**
 * CORS
 */
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

/**
 * JSON helper
 */
function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: CORS_HEADERS,
  });
}

/**
 * Parse request body
 */
async function getRequestData(request) {
  const contentType = request.headers.get("content-type") || "";

  const body = contentType.includes("application/json")
    ? await request.json()
    : await request.formData();

  const get = (key) => (body?.get ? body.get(key) : body[key]);

  console.log("Product handle" + get("product_handle"))

  return {
    shop_domain: get("shop_domain"),
    product_id: get("product_id"),
    product_handle : get("product_handle"),
    product_title: get("product_title"),
    image_url: get("image_url"),
    variant_id: get("variant_id"),
    variant_title: get("variant_title"),
    customer_email: get("customer_email"),
  };
}

/**
 * OPTIONS handler
 */
export function loader({ request }) {
  if (request.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }

  return json({ error: "Method not allowed" }, 405);
}

/**
 * MAIN API (SUBSCRIBE)
 */
export async function action({ request }) {
  if (request.method !== "POST") {
    return json({ error: "Only POST allowed" }, 405);
  }

  try {
    const data = await getRequestData(request);

    // validate input
    const required = [
      "shop_domain",
      "product_id",
      "variant_id",
      "customer_email",
    ];

    const missing = required.filter((f) => !data[f]);

    if (missing.length) {
      return json(
        { error: `Missing fields: ${missing.join(", ")}` },
        400
      );
    }

    // get shop
    const shop = await getShopByDomain(data.shop_domain);

    if (!shop) {
      return json({ error: "Shop not found" }, 404);
    }

    const existing = await getSubscriberByEmailVariant(
      data.shop_domain,
      data.customer_email,
      data.variant_id
    );

    /**
     * CASE 1: Already subscribed (waiting)
     */
    if (existing && existing.status === "waiting") {
      return json(
        {
          success: true,
          message: "Already subscribed",
          subscriber: existing,
        },
        200
      );
    }

    /**
     * CASE 2: Previously notified → resubscribe + refresh Shopify stock
     */
    if (existing && existing.status === "notified") {
      const updated = await updateSubscriberStatus(
        existing.id,
        "waiting"
      );

      const gid = `gid://shopify/ProductVariant/${extractNumericId(
        data.variant_id
      )}`;

      const query = `
        query ($id: ID!) {
          productVariant(id: $id) {
            inventoryQuantity
          }
        }
      `;

  const shopifyRes = await shopifyGraphql(
  data.shop_domain,
  query,
  { id: gid }
);

      const currentQty =
        shopifyRes?.productVariant?.inventoryQuantity ?? 0;

      await createOrUpdateInventoryState({
        shop_domain: data.shop_domain,
        product_id: data.product_id,
        variant_id: data.variant_id,
        available_qty: currentQty,
        last_notified_at: null,
      });

      return json(
        {
          success: true,
          message: "Re-subscribed successfully",
          subscriber: updated,
        },
        200
      );
    }

    /**
     * CASE 3: New subscriber
     */
    const subscriber = await createSubscriber({
      shop_domain: String(data.shop_domain),
      product_id: String(data.product_id),
      product_handle : data.product_handle || null,
      product_title: data.product_title || null,
      image_url: data.image_url || null,
      variant_id: String(data.variant_id),
      variant_title: data.variant_title || null,
      customer_email: String(data.customer_email),
      status: "waiting",
    });

    return json(
      {
        success: true,
        message: "Subscribed successfully",
        shop: {
          id: shop.id,
          domain: data.shop_domain,
        },
        subscriber,
      },
      201
    );
  } catch (error) {
    console.error("API Error:", error);

    return json(
      {
        success: false,
        error: error?.message || "Internal Server Error",
      },
      500
    );
  }
}