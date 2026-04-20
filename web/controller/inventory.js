import { sendEmail } from "../utils/send_email.js";
import { saveInventoryUpdate, getLatestInventoryUpdateForItem } from "../utils/database.js";
import shopify from "../shopify.js";

async function inventoryWebhookController(payload) {
  try {

    console.log("ALL data ", payload);
 
    const inventory_item_id = payload?.inventory_item_id;
    const available = payload?.available;

    const shop_domain = payload?.shop_domain || null;

    if (!inventory_item_id) {
      throw new Error("Missing inventory_item_id");
    }

    // Check for duplicate recent updates
    const latestUpdate = await getLatestInventoryUpdateForItem(inventory_item_id);
    if (latestUpdate && latestUpdate.quantity === available) {
      console.log(`Duplicate webhook blocked for item ${inventory_item_id}: quantity is still ${available}.`);
      return; // Skip if quantity hasn't changed
    }

    let product_id = payload?.product_id || null;
    let variant_id = payload?.variant_id || null;
    let product_name = null;
    let variant_name = null;
    let product_image = null;
    let product_price = null;

    if (shop_domain) {
      try {
        const sessions = await shopify.config.sessionStorage.findSessionsByShop(shop_domain);
        if (sessions && sessions.length > 0) {
          const session = sessions.find(s => s.isOnline === false) || sessions[0];
          const client = new shopify.api.clients.Graphql({ session });
          
          const response = await client.query({
            data: {
              query: `
                query getInventoryItemInfo($id: ID!) {
                  inventoryItem(id: $id) {
                    variant {
                      id
                      title
                      price
                      image {
                        url
                      }
                      product {
                        id
                        title
                        featuredImage {
                          url
                        }
                      }
                    }
                  }
                }
              `,
              variables: {
                id: `gid://shopify/InventoryItem/${inventory_item_id}`
              }
            }
          });

          const variant = response?.body?.data?.inventoryItem?.variant;
          if (variant) {
            variant_id = variant.id?.split("/").pop() || variant_id;
            variant_name = variant.title || null;
            product_price = variant.price || null;
            product_image = variant.image?.url || variant.product?.featuredImage?.url || null;
            product_id = variant.product?.id?.split("/").pop() || product_id;
            product_name = variant.product?.title || null;
          }
        }
      } catch (err) {
        console.error("Failed to fetch product details from Shopify:", err.message);
      }
    }
 console.log(" Invenoty Update")
 console.log(` Inventory item id  ${inventory_item_id}` )
 console.log(`product name ${product_name}`)

    /* -------------------------
       SAVE TO DATABASE (ALL FIELDS)
    -------------------------- */
    await saveInventoryUpdate({
      itemId: inventory_item_id,
      quantity: available,
      shopDomain: shop_domain,
      inventoryItemId: inventory_item_id,
      variantId: Number(variant_id),
      productId: Number(variant_id),
      productName: product_name,
      variantName: variant_name,
      productImage: product_image,
      productPrice: product_price,
      rawPayload: payload ? JSON.stringify(payload) : " ",
  
   
    });

    /* -------------------------
       EMAIL NOTIFICATION
    -------------------------- */
    await sendEmail({
      to: "sameerbaiju792@gmail.com",
      subject: `Inventory Update - ${product_name || inventory_item_id}`,
      text: `Inventory updated: ${product_name || 'Item ' + inventory_item_id} = ${available}`,
      html: `
        <h2>Inventory Update</h2>
        ${product_image ? `<img src="${product_image}" alt="Product Image" width="100"/>` : ""}
        <p><strong>Item Name:</strong> ${product_name || 'N/A'}</p>
        <p><strong>Variant:</strong> ${variant_name || 'N/A'}</p>
        <p><strong>Price:</strong> ${product_price ? '$' + product_price : 'N/A'}</p>
        <p><strong>Item ID:</strong> ${inventory_item_id}</p>
        <p><strong>Quantity:</strong> ${available}</p>
        <p><strong>Shop:</strong> ${shop_domain}</p>
        <p><strong>Variant ID:</strong> ${variant_id}</p>
        <p><strong>Product ID:</strong> ${product_id}</p>
      `,
    });

  } catch (error) {
    console.error(" Inventory Webhook Error:", error.message);
  }
}

export { inventoryWebhookController };