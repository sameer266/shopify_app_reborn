import {
  getPendingVariantGroups,
  getShopByDomain,
} from "../services/firestore.server.js";

import { processInventoryChange } from "../services/inventoryProcess.server.js";

//------------------------------
 //Convert raw Shopify ID → GID
//------------------------------ 
function toGid(id, type = "ProductVariant") {
  if (!id) return null;

  const str = String(id);

  if (str.startsWith("gid://shopify/")) {
    return str;
  }

  return `gid://shopify/${type}/${str}`;
}

//---------------------------------------
 // Fetch inventory + product details for variants from Shopify
 //---------------------------------------
export async function fetchVariantInventory({
  shopDomain,
  accessToken,
  variantIds = [],
}) {

  // 1. Validate input
  if (!shopDomain || !accessToken || !variantIds.length) {
    return [];
  }

  const formattedIds = variantIds
    .filter(Boolean)
    .map((id) => toGid(id, "ProductVariant"))
    .filter((id) => id.includes("ProductVariant"));

const query = `
  query ($ids: [ID!]!) {
    nodes(ids: $ids) {
      ... on ProductVariant {
        id
        inventoryQuantity
        image {
          url
        }
        product {
          id
          title
          handle
          featuredImage {
            url
          }
          priceRangeV2 {
            minVariantPrice {
              amount
            
            }
          }
        }
        inventoryItem {
          id
        }
      }
    }
  }
`;

  try {
   
    // 2. Shopify request
    console.log(
      `[CRON] Fetching Shopify nodes for ${shopDomain}: ${JSON.stringify(formattedIds)}`
    );

    const res = await fetch(
      `https://${shopDomain}/admin/api/2024-07/graphql.json`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": accessToken,
        },
        body: JSON.stringify({
          query,
          variables: {
            ids: formattedIds,
          },
        }),
      }
    );

    const json = await res.json();

    if (json.errors) {
      console.error("[CRON] GraphQL Error:", json.errors);
      throw new Error("Shopify GraphQL error");
    }

    const rawNodes = json.data?.nodes || [];
    const variants = rawNodes.filter(Boolean);

   
    // 3. Debug logging
    console.log(
      `[CRON] Fetched ${variants.length} variants from ${shopDomain}`
    );

    if (!variants.length) {
      console.warn(
        `[CRON] No ProductVariant nodes found for ${shopDomain}`
      );

      console.warn(
        `[CRON] Sent IDs: ${JSON.stringify(formattedIds)}`
      );

      console.warn(
        `[CRON] Raw response: ${JSON.stringify(rawNodes)}`
      );
    }

    return variants;
  } catch (error) {
    // 4. Error handling
  
    console.error(
      `[CRON] Failed fetching Shopify variants for ${shopDomain}:`,
      error.message
    );
    throw error;
  }
}

// ------------------------
 // MAIN CRON
 // -------------------
export async function runInventorySync() {

  // 1. Start job
  console.log("[CRON] Starting inventory sync...");

  const startTime = Date.now();
  const groups = await getPendingVariantGroups();

  console.log(
    `[CRON] Found ${groups.length} shop(s) with pending variants`
  );

  if (!groups.length) {
    return {
      success: true,
      processed: 0,
      failed: 0,
      message: "No pending variants",
    };
  }

  let processedCount = 0;
  let failedCount = 0;
  const results = [];


  // 2. Process each shop
  for (const group of groups) {
    try {
      const shop = await getShopByDomain(group.shop_domain);

      if (!shop?.access_token) {
        console.warn(
          `[CRON] Missing access token for ${group.shop_domain}`
        );
        failedCount += group.variant_ids.length;
        continue;
      }

      console.log(
        `[CRON] Processing ${group.variant_ids.length} variants for ${group.shop_domain}`
      );

      console.log(
        `[CRON] Variant IDs: ${JSON.stringify(group.variant_ids)}`
      );

      let variants = [];

      try {
    
        // 3. Fetch Shopify variants
        variants = await fetchVariantInventory({
          shopDomain: group.shop_domain,
          accessToken: shop.access_token,
          variantIds: group.variant_ids,
        });
      } catch (err) {
        console.error(
          `[CRON] Shopify fetch failed for ${group.shop_domain}:`,
          err.message
        );
        failedCount += group.variant_ids.length;
        continue;
      }

      if (!variants.length) {
        console.warn(
          `[CRON] No variants returned for ${group.shop_domain}`
        );
        failedCount += group.variant_ids.length;
        continue;
      }


      // 4. Process variants
      for (const variant of variants) {
        try {
          const productImage =
            variant.image?.url ||
            variant.product?.featuredImage?.url ||
            null;

       const productPrice =
  variant.product?.priceRangeV2?.minVariantPrice?.amount || null;



          const result = await processInventoryChange({
            shop_domain: group.shop_domain,
            product_id: variant.product?.id,
            product_handle: variant.product?.handle ?? null,
            variant_id: variant.id,
            inventory_item_id: variant.inventoryItem?.id,
            current_qty: variant.inventoryQuantity,
            product_title: variant.product?.title,
            product_image: productImage,
            product_price: productPrice,
    
          });

          if (result?.back_in_stock) {
            console.log(
              `[CRON] Back in stock: ${variant.id} (${result.emails_sent} emails)`
            );
          }

          results.push(result);
          processedCount++;
        } catch (err) {
          console.error(
            `[CRON] Failed variant ${variant.id}:`,
            err.message
          );
          failedCount++;
        }
      }
    } catch (err) {

      // 5. Shop-level error
      console.error(
        `[CRON] Shop error ${group.shop_domain}:`,
        err.message
      );
      failedCount += group.variant_ids.length;
    }
  }


  const duration = Date.now() - startTime;

  console.log(
    `[CRON] Completed in ${duration}ms | processed=${processedCount} failed=${failedCount}`
  );

  return {
    success: failedCount === 0,
    processed: processedCount,
    failed: failedCount,
    results,
    duration,
  };
}
