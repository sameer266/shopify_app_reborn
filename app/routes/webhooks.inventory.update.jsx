import { authenticate } from "../shopify.server";
import { processInventoryChange } from "../services/inventoryProcess.server.js";

export const action = async ({ request }) => {
  const { topic, shop, payload } = await authenticate.webhook(request);
  console.log("Received webhook:", topic, "from", shop);

  if (topic.toLowerCase() !== "inventory_levels_update") {
    return new Response("Ignored", { status: 200 });
  }
  console.log("Processing inventory update for shop:", shop);

  const {
    inventory_item_id,
    available
  } = payload;

  // NOTE: Shopify webhook doesn't include product_id or variant_id
  // Product title will default to "Product" in processInventoryChange
  // To improve: lookup variant_id from inventory_item_id if needed
  await processInventoryChange({
    shop_domain: shop,
    inventory_item_id,
    current_qty: Number(available || 0)
  });

  return new Response("OK");
};