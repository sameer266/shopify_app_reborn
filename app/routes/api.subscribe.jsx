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

  return {
    shop_domain: get("shop_domain"),
    product_id: get("product_id"),
    product_handle: get("product_handle"),
    product_title: get("product_title"),
    image_url: get("image_url"),
    variant_id: get("variant_id"),
    variant_title: get("variant_title"),
    customer_email: get("customer_email"),

    // optional customer data
    first_name: get("first_name"),
    last_name: get("last_name"),
    phone: get("phone"),
  };
}

/**
 * ActiveCampaign Sync (NON-BLOCKING)
 */




async function syncToActiveCampaign(data) {
try {
 const API_URL = "https://ellabache49720.api-us1.com";
    const API_KEY = "8cfc7b6b07d9539ec82eb6d63daf95600492e15771018191e03aac774fce4ea66c803ba0";
const LIST_ID = 42;
const TAG_ID = 213;

const contactPayload = {
  email: data.customer_email,
};

if (data.first_name) contactPayload.firstName = data.first_name;
if (data.last_name) contactPayload.lastName = data.last_name;
if (data.phone) contactPayload.phone = data.phone;

// 1. Create / Update Contact
const contactRes = await fetch(`${API_URL}/api/3/contact/sync`, {
  method: "POST",
  headers: {
    "Api-Token": API_KEY,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    contact: contactPayload,
  }),
});

const contactText = await contactRes.text();

if (!contactRes.ok) {
  console.error(
    "Contact sync failed:",
    contactRes.status,
    contactText
  );
  return;
}

const contactJson = contactText ? JSON.parse(contactText) : {};
const contactId = contactJson?.contact?.id;

if (!contactId) {
  console.error("No contact ID returned:", contactJson);
  return;
}

// 2. Add Contact to List
const listRes = await fetch(`${API_URL}/api/3/contactLists`, {
  method: "POST",
  headers: {
    "Api-Token": API_KEY,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    contactList: {
      list: LIST_ID,
      contact: contactId,
      status: 1,
    },
  }),
});

const listText = await listRes.text();

if (!listRes.ok) {
  console.error(
    "List subscription failed:",
    listRes.status,
    listText
  );
}

// 3. Add Tag
const tagRes = await fetch(`${API_URL}/api/3/contactTags`, {
  method: "POST",
  headers: {
    "Api-Token": API_KEY,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    contactTag: {
      contact: contactId,
      tag: TAG_ID,
    },
  }),
});

const tagText = await tagRes.text();

if (!tagRes.ok) {
  console.error(
    "Tag assignment failed:",
    tagRes.status,
    tagText
  );
}

console.log(
  `ActiveCampaign sync successful. Contact ID: ${contactId}`
);

} catch (err) {
console.error("ActiveCampaign sync error:", err);
}
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
 * MAIN API
 */
export async function action({ request }) {
  if (request.method !== "POST") {
    return json({ error: "Only POST allowed" }, 405);
  }

  try {
    const data = await getRequestData(request);

    const required = ["shop_domain", "product_id", "variant_id", "customer_email"];
    const missing = required.filter((f) => !data[f]);

    if (missing.length) {
      return json({ error: `Missing fields: ${missing.join(", ")}` }, 400);
    }

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
     * CASE 1: already waiting
     */
    if (existing && existing.status === "waiting") {
      const response = json({
        success: true,
        message: "Already subscribed",
        subscriber: existing,
      });

      setTimeout(() => syncToActiveCampaign(data), 0);
      return response;
    }

    /**
     * CASE 2: resubscribe
     */
    if (existing && existing.status === "notified") {
      const updated = await updateSubscriberStatus(existing.id, "waiting");

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

      const shopifyRes = await shopifyGraphql(data.shop_domain, query, {
        id: gid,
      });

      const currentQty = shopifyRes?.productVariant?.inventoryQuantity ?? 0;

      await createOrUpdateInventoryState({
        shop_domain: data.shop_domain,
        product_id: data.product_id,
        variant_id: data.variant_id,
        available_qty: currentQty,
        last_notified_at: null,
      });

      const response = json({
        success: true,
        message: "Re-subscribed successfully",
        subscriber: updated,
      });

     
      return response;
    }

    /**
     * CASE 3: new subscriber
     */
    const subscriber = await createSubscriber({
      shop_domain: String(data.shop_domain),
      product_id: String(data.product_id),
      product_handle: data.product_handle || null,
      product_title: data.product_title || null,
      image_url: data.image_url || null,
      variant_id: String(data.variant_id),
      variant_title: data.variant_title || null,
      customer_email: String(data.customer_email),
      status: "waiting",
    });

    const response = json(
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

    setTimeout(() => syncToActiveCampaign(data), 0);
    return response;
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
