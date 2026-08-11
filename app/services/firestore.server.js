import { firestore, firestoreTimestamp } from "../firebase.server.js";
import crypto from "crypto";

const shops = firestore.collection("Shopify_app_shop");
const subscribers = firestore.collection("Shopify_app_subscribers");
const inventory = firestore.collection("Shopify_app_inventory_sync");
const logs = firestore.collection("Shopify_app_notification_logs");





const now = () => firestoreTimestamp();
export const db = firestore;

/**
 * Extract numeric ID from GID format
 * Input: "gid://shopify/ProductVariant/123" → Output: "123"
 */
export function extractNumericId(id) {
  if (!id) return null;
  const str = String(id);
  if (!str.includes("/")) return str;
  const parts = str.split("/");
  return parts[parts.length - 1] || null;
}

/**
 * Normalizes an email for use as a lookup key (trim + lowercase). Without
 * this, "John@Gmail.com" and "john@gmail.com" are treated as different
 * subscribers by Firestore's exact-match "==" queries, which causes
 * duplicate subscriber docs instead of updating the existing one on
 * resubscribe.
 */
function normalizeEmail(email) {
  if (!email) return null;
  return String(email).trim().toLowerCase();
}

/* -------------------------
   SHOP
-------------------------- */

export async function saveShopInstall({ shopDomain, accessToken, installedAt }) {
  if (!shopDomain || !accessToken) {
    throw new Error("Missing shopDomain or accessToken");
  }

  const ref = shops.doc(String(shopDomain));
  const snap = await ref.get();

  const payload = {
    shop_domain: String(shopDomain),
    access_token: String(accessToken),
    installed_at: installedAt ? new Date(installedAt) : now(),
    updated_at: now(),
  };

  if (snap.exists) {
    await ref.update(payload);
    return { id: shopDomain, ...payload, updated: true };
  }

  await ref.set({ ...payload, created_at: now() });
  return { id: shopDomain, ...payload, created: true };
}

export async function getShopByDomain(shopDomain) {
  if (!shopDomain) return null;
  const snap = await shops.doc(String(shopDomain)).get();
  return snap.exists ? { id: snap.id, ...snap.data() } : null;
}



/* -------------------------
   SUBSCRIBERS (UPSERT)
-------------------------- */

export async function createSubscriber({
  shop_domain,
  product_id,
  product_handle,
  product_title,
  image_url,
  price,
  variant_id,
  variant_title,
  customer_email,
}) {
  if (!shop_domain || !variant_id || !customer_email) return null;

  const numericVariantId = extractNumericId(variant_id);
  const numericProductId = extractNumericId(product_id);
  const normalizedEmail = normalizeEmail(customer_email);

  const snap = await subscribers
    .where("shop_domain", "==", String(shop_domain))
    .where("variant_id", "==", String(numericVariantId))
    .where("customer_email", "==", normalizedEmail)
    .limit(1)
    .get();

  const payload = {
    shop_domain: String(shop_domain),
    product_id: numericProductId ? String(numericProductId) : null,
    product_handle: product_handle || null,
    product_title: product_title || null,
    image_url: image_url || null,
    price: price !== undefined && price !== null && price !== "" ? String(price) : null,
    variant_id: String(numericVariantId),
    variant_title: variant_title || null,
    customer_email: normalizedEmail,
    status: "waiting",
    created_at: now(),
  };

  const inventoryPayload = {
    shop_domain,
    product_id: numericProductId ? String(numericProductId) : null,
    variant_id: String(numericVariantId),
  };

  if (!snap.empty) {
    const doc = snap.docs[0];
    const existingData = doc.data();
    const updatedFields = {
      status: "waiting",
      notified_at: null,
      updated_at: now(),
    };

    if (numericProductId) updatedFields.product_id = String(numericProductId);
    if (product_title) updatedFields.product_title = product_title;
    if (image_url) updatedFields.image_url = image_url;
    if (price !== undefined && price !== null && price !== "") updatedFields.price = String(price);
    if (variant_title) updatedFields.variant_title = variant_title;

    await doc.ref.update(updatedFields);
    await createOrUpdateInventoryState(inventoryPayload);
    return { id: doc.id, ...existingData, ...updatedFields };
  }

  const doc = await subscribers.add(payload);
  await createOrUpdateInventoryState(inventoryPayload);
  return { id: doc.id, ...payload };
}

export async function getSubscriberByEmailVariant(shop_domain, customer_email, variant_id) {
  if (!shop_domain || !customer_email || !variant_id) return null;

  const numericVariantId = extractNumericId(variant_id);

  const snap = await subscribers
    .where("shop_domain", "==", String(shop_domain))
    .where("customer_email", "==", normalizeEmail(customer_email))
    .where("variant_id", "==", String(numericVariantId))
    .limit(1)
    .get();

  if (snap.empty) return null;
  const doc = snap.docs[0];
  return { id: doc.id, ...doc.data() };
}

export async function getSubscribersForShopVariant(shop_domain, variant_id) {
  if (!shop_domain || !variant_id) return [];

  const numericVariantId = extractNumericId(variant_id);

  const snap = await subscribers
    .where("shop_domain", "==", String(shop_domain))
    .where("variant_id", "==", String(numericVariantId))
    .where("status", "==", "waiting")
    .get();

  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function getAllSubscribersByPage(
  shop_domain,
  limitCount = 20,
  lastDocId = null
) {
  if (!shop_domain) return { data: [], lastVisible: null };

  try {
    let queryRef = subscribers
      .where("shop_domain", "==", String(shop_domain))
      .orderBy("created_at", "desc")
      .limit(limitCount);

    if (lastDocId) {
      const lastSnap = await subscribers.doc(lastDocId).get();
      if (lastSnap.exists) {
        queryRef = queryRef.startAfter(lastSnap);
      }
    }

    const snapshot = await queryRef.get();

    const data = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    const lastVisible = snapshot.docs[snapshot.docs.length - 1]?.id ?? null;

    return { data, lastVisible };
  } catch (error) {
    console.error("Error fetching subscribers:", error);
    return { data: [], lastVisible: null };
  }
}


export async function getAllSubscribers(shop_domain) {
  if (!shop_domain) return [];
  try {
    const snapshot = await subscribers
      .where("shop_domain", "==", String(shop_domain))
      .get();
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  } catch (error) {
    console.error("Error fetching all subscribers:", error);
    return [];
  }
}

export async function getWaitingSubscribers(shop_domain) {
  if (!shop_domain) return [];

  const snap = await subscribers
    .where("shop_domain", "==", String(shop_domain))
    .where("status", "==", "waiting")
    .get();

  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function getSubscriptionsByEmail(shop_domain, customer_email) {
  if (!shop_domain || !customer_email) return [];
  try {
    const snap = await subscribers
      .where("shop_domain", "==", String(shop_domain))
      .where("customer_email", "==", normalizeEmail(customer_email))
      .get();
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (error) {
    console.error("Error fetching subscriptions by email:", error);
    return [];
  }
}

export async function getSubscriptionsByProduct(shop_domain, product_id) {
  if (!shop_domain || !product_id) return [];
  try {
    const snap = await subscribers
      .where("shop_domain", "==", String(shop_domain))
      .where("product_id", "==", String(product_id))
      .get();
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (error) {
    console.error("Error fetching subscriptions by product:", error);
    return [];
  }
}

export async function updateSubscriberStatus(subscriberId, status) {
  const ref = subscribers.doc(subscriberId);

  await ref.update({
    status,
    notified_at: status === "notified" ? now() : null,
  });

  const snap = await ref.get();
  return { id: snap.id, ...snap.data() };
}



/* -------------------------
   INVENTORY STATE
   KEY = shop_domain + variant_id
-------------------------- */

export async function findInventoryState(shop_domain, variant_id) {
  if (!shop_domain || !variant_id) return null;

  const numericVariantId = extractNumericId(variant_id);

  const snap = await inventory
    .where("shop_domain", "==", String(shop_domain))
    .where("variant_id", "==", String(numericVariantId))
    .limit(1)
    .get();

  if (snap.empty) return null;
  const doc = snap.docs[0];
  return { id: doc.id, ...doc.data() };
}

export async function createOrUpdateInventoryState({
  shop_domain,
  product_id,
  variant_id,
  inventory_item_id,
  available_qty,
  last_notified_at = null,
}) {
  if (!shop_domain || !variant_id) return null;

  const numericVariantId = extractNumericId(variant_id);
  const numericProductId = extractNumericId(product_id);
  const numericInventoryItemId = extractNumericId(inventory_item_id);

  const snap = await inventory
    .where("shop_domain", "==", String(shop_domain))
    .where("variant_id", "==", String(numericVariantId))
    .limit(1)
    .get();

  const payload = {
    shop_domain: String(shop_domain),
    variant_id: numericVariantId ? String(numericVariantId) : null,
    last_checked_at: now(),
  };

  if (numericProductId) payload.product_id = String(numericProductId);
  if (numericInventoryItemId) payload.inventory_item_id = String(numericInventoryItemId);

  if (available_qty !== undefined) {
    payload.available_qty = Number(available_qty || 0);
  } else if (snap.empty) {
    payload.available_qty = 0;
  }

  if (last_notified_at) payload.last_notified_at = new Date(last_notified_at);

  if (!snap.empty) {
    const doc = snap.docs[0];
    await inventory.doc(doc.id).update(payload);
    return { id: doc.id, ...payload, updated: true };
  }

  const doc = await inventory.add({ ...payload, created_at: now() });
  return { id: doc.id, ...payload, created: true };
}

export async function getAllInventoryStates(shop_domain) {
  if (!shop_domain) return [];
  try {
    const snapshot = await inventory
      .where("shop_domain", "==", String(shop_domain))
      .get();
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  } catch (error) {
    console.error("Error fetching inventory states:", error);
    return [];
  }
}

/* -------------------------
   NOTIFICATION LOGS
-------------------------- */


export async function createNotificationLog({
  subscriber_id,
  shop_domain,
  variant_id,
  customer_email,
  email_sent,
}) {
  const trackingToken = crypto.randomUUID();

  const payload = {
    subscriber_id,
    shop_domain: String(shop_domain),
    variant_id: String(variant_id),
    customer_email: customer_email ? String(customer_email) : null,
    tracking_token: trackingToken,
    email_sent,
    clicked: false,
    purchased: false,
    sent_at: now(),
    created_at: now(),
  };

  const doc = await logs.add(payload);

  return {
    id: doc.id,
    ...payload,
  };
}

export async function getAllNotificationLogs(shop_domain) {
  if (!shop_domain) return [];
  try {
    const snapshot = await logs
      .where("shop_domain", "==", String(shop_domain))
      .get();
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  } catch (error) {
    console.error("Error fetching notification logs:", error);
    return [];
  }
}


export async function getNotificationLogByToken(token) {
  if (!token) return null;

  const snap = await logs
    .where("tracking_token", "==", token)
    .limit(1)
    .get();

  if (snap.empty) {
    return null;
  }

  const doc = snap.docs[0];

  return {
    id: doc.id,
    ...doc.data(),
  };
}



export async function updateNotificationLog(id, data) {
  if (!id) return null;

  const ref = logs.doc(id);

  await ref.update({
    ...data,
    updated_at: now(),
  });

  const snap = await ref.get();

  return {
    id: snap.id,
    ...snap.data(),
  };
}
/* -------------------------
   ANALYTICS
-------------------------- */

export async function getTopRequestedProducts(shop_domain) {
  if (!shop_domain) return [];
  try {
    const snapshot = await subscribers
      .where("shop_domain", "==", String(shop_domain))
      .get();

    const productMap = {};

    snapshot.docs.forEach((doc) => {
      const data = doc.data();
      const key = `${data.product_id}__${data.variant_id}`;

      if (!productMap[key]) {
        productMap[key] = {
          product_id: data.product_id,
          product_title: data.product_title || "Unknown Product",
          image_url: data.image_url,
          variant_id: data.variant_id,
          variant_title: data.variant_title,
          count: 0,
          waiting: 0,
          notified: 0,
        };
      }

      productMap[key].count++;
      if (data.status === "waiting") productMap[key].waiting++;
      else if (data.status === "notified") productMap[key].notified++;
    });

    return Object.values(productMap).sort((a, b) => b.count - a.count);
  } catch (error) {
    console.error("Error fetching top requested products:", error);
    return [];
  }
}
export async function getNotificationMetrics(shop_domain) {
  if (!shop_domain) return {
    subscribers: { total: 0, waiting: 0, notified: 0, unsubscribed: 0 },
    notifications: { total: 0, successful: 0, failed: 0, successRate: 0 },
    trends: [],
  };

  try {
    const [subscribersSnap, logsSnap] = await Promise.all([
      subscribers.where("shop_domain", "==", String(shop_domain)).get(),
      logs.where("shop_domain", "==", String(shop_domain)).get(),
    ]);

    const subscriberData = subscribersSnap.docs.map((d) => d.data());
    const logData = logsSnap.docs.map((d) => d.data());

    const totalSubscribers = subscriberData.length;
    const waitingCount = subscriberData.filter((s) => s.status === "waiting").length;
    const notifiedCount = subscriberData.filter((s) => s.status === "notified").length;
    const unsubscribedCount = subscriberData.filter((s) => s.status === "unsubscribed").length;

    const totalNotifications = logData.length;
    const successfulNotifications = logData.filter((l) => l.email_sent === true).length;
    const failedNotifications = logData.filter((l) => l.email_sent === false).length;
    const successRate = totalNotifications > 0 ? successfulNotifications / totalNotifications : 0;

    const trendMap = {};
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    logData.forEach((log) => {
      const logDate = log.sent_at?.toDate?.() || new Date(log.sent_at);
      if (logDate >= thirtyDaysAgo) {
        const dateKey = logDate.toISOString().split("T")[0];
        if (!trendMap[dateKey]) trendMap[dateKey] = { date: dateKey, sent: 0, failed: 0 };
        if (log.email_sent) trendMap[dateKey].sent++;
        else trendMap[dateKey].failed++;
      }
    });

    const trends = Object.values(trendMap).sort((a, b) => new Date(a.date) - new Date(b.date));

    return {
      subscribers: {
        total: totalSubscribers,
        waiting: waitingCount,
        notified: notifiedCount,
        unsubscribed: unsubscribedCount,
      },
      notifications: {
        total: totalNotifications,
        successful: successfulNotifications,
        failed: failedNotifications,
        successRate,
      },
      trends,
    };
  } catch (error) {
    console.error("Error fetching notification metrics:", error);
    return {
      subscribers: { total: 0, waiting: 0, notified: 0, unsubscribed: 0 },
      notifications: { total: 0, successful: 0, failed: 0, successRate: 0 },
      trends: [],
    };
  }
}

/* -------------------------
   GROUPS (SYNC BATCH)
-------------------------- */

export async function getPendingVariantGroups() {
  const snap = await subscribers
    .where("status", "==", "waiting")
    .get();

  const groups = {};

  snap.docs.forEach((doc) => {
    const data = doc.data();
    if (!data.shop_domain || !data.variant_id) return;

    const shop = String(data.shop_domain);
    const variant = extractNumericId(data.variant_id);
    if (!variant) return;

    if (!groups[shop]) groups[shop] = new Set();
    groups[shop].add(String(variant));
  });

  return Object.entries(groups).map(([shop_domain, set]) => ({
    shop_domain,
    variant_ids: [...set],
  }));
}

export async function isVariantTracked(shop_domain, variant_id) {
  if (!shop_domain || !variant_id) return false;

  const numericVariantId = extractNumericId(variant_id);

  const snap = await subscribers
    .where("shop_domain", "==", String(shop_domain))
    .where("variant_id", "==", String(numericVariantId))
    .limit(1)
    .get();

  return !snap.empty;
}


/* -------------------------
   EMAIL SETTINGS
-------------------------- */

export async function getShopSettings(shopDomain) {
  if (!shopDomain) return {};
  try {
    const snap = await db.collection("Shopify_app_shop_settings").doc(String(shopDomain)).get();
    return snap.exists ? snap.data() : {};
  } catch (error) {
    console.error("Error fetching shop settings:", error);
    return {};
  }
}

export async function saveShopSettings(shopDomain, settings) {
  if (!shopDomain) return;
  await db.collection("Shopify_app_shop_settings").doc(String(shopDomain)).set(
    { ...settings, updated_at: now() },
    { merge: true }
  );
}

export async function getShopSettingsSection(shopDomain, section) {
  const doc = await getShopSettings(shopDomain);
  return doc[section] || {};
}

export async function saveShopSettingsSection(shopDomain, section, data) {
  if (!shopDomain || !section) return;

  const cleaned = section === "integration" ? sanitizeIntegrationSettings(data) : data;

  await db.collection("Shopify_app_shop_settings").doc(String(shopDomain)).set(
    { [section]: cleaned, updated_at: now() },
    { merge: true }
  );
}

/**
 * Trims whitespace from every string field (so a pasted key like " sk_abc "
 * never gets saved with leading/trailing spaces and silently fails at the
 * provider's API later). Credential fields are left in place even when an
 * integration is toggled off, so re-enabling it doesn't force the merchant
 * to re-enter their key.
 */
function sanitizeIntegrationSettings(data) {
  if (!data || typeof data !== "object") return data;

  const trimmed = {};
  for (const [key, value] of Object.entries(data)) {
    trimmed[key] = typeof value === "string" ? value.trim() : value;
  }

  return trimmed;
}




