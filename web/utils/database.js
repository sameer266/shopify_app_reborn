import { BigQuery } from "@google-cloud/bigquery";
import { fileURLToPath } from "url";
import path from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const bigquery = new BigQuery({
  keyFilename: path.join(__dirname, "..", "utils", "ellabache-singleview-2da470c78045.json"),
});

export async function saveInventoryUpdate({
  itemId,
  quantity,
  shopDomain = null,
  inventoryItemId = null,
  variantId = null,
  productId = null,
  productName = null,
  variantName = null,
  productImage = null,
  productPrice = null,
  rawPayload = null,

}) {
  try {
const query = `
  INSERT INTO \`ellabache-singleview.raw.Shopify_app_reborn\`
  (
    item_id,
    quantity,
    shop_domain,
    inventory_item_id,
    variant_id,
    product_id,
    product_name,
    variant_name,
    product_image,
    product_price,
    raw_payload,
    created_at
  )
  VALUES
  (
    @itemId,
    @quantity,
    @shopDomain,
    @inventoryItemId,
    @variantId,
    @productId,
    @productName,
    @variantName,
    @productImage,
    @productPrice,
    @rawPayload,
    CURRENT_DATE()
  )
`;

    const [job] = await bigquery.createQueryJob({
      query,
      params: {
        itemId,
        quantity,
        shopDomain,
        inventoryItemId,
        variantId,
        productId,
        productName,
        variantName,
        productImage,
        productPrice,
        rawPayload,
      
      },
    });

    await job.getQueryResults();

    console.log(" Saved to BigQuery");
  } catch (err) {
    console.error(" BigQuery Insert Error:", err.message);
    throw err;
  }
}

export async function getAllData() {
  try {
    const query = `
      SELECT *
      FROM \`ellabache-singleview.raw.Shopify_app_reborn\`
      ORDER BY created_at DESC
    `;

    const [rows] = await bigquery.query({ query });

    return rows;
  } catch (err) {
    console.error(" BigQuery Error:", err.message);
    throw err;
  }
}

export async function getLatestInventoryUpdateForItem(itemId) {
  try {
    const query = `
      SELECT *
      FROM \`ellabache-singleview.raw.Shopify_app_reborn\`
      WHERE item_id = @itemId
         OR inventory_item_id = @itemId
      ORDER BY created_at DESC
      LIMIT 1
    `;

    const [rows] = await bigquery.query({
      query,
      params: { itemId },
    });

    return rows?.[0];
  } catch (err) {
    console.error(" BigQuery Error:", err.message);
    throw err;
  }
}

