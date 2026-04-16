import { DeliveryMethod } from "@shopify/shopify-api";

/**
 * Webhook Handlers configuration
 * Matches the subscriptions in your shopify.app.toml
 */
const PrivacyWebhookHandlers = {
  /**
   * Inventory Update Handler
   */
  INVENTORY_LEVELS_UPDATE: {
    deliveryMethod: DeliveryMethod.Http,
    callbackUrl: "/api/webhooks",
    callback: async (topic, shop, body) => {
      try {
        const payload = JSON.parse(body);
        console.log("received webhook: ",  payload);  
        
        // Extract the variables you need
        const { inventory_item_id, available, location_id } = payload;

        console.log("-----------------------------------------");
        console.log(` INVENTORY UPDATE | Shop: ${shop}`);
        console.log(`Item ID: ${inventory_item_id}`);
        console.log(`New Quantity: ${available}`);
        console.log(`Location: ${location_id}`);
        console.log("-----------------------------------------");

  

      } catch (error) {
        console.error(" Webhook Callback Error:", error.message);
      }
    },
  },

  /**
   * MANDATORY COMPLIANCE HANDLERS
   * Required for Shopify App Store approval.
   */
  CUSTOMERS_DATA_REQUEST: {
    deliveryMethod: DeliveryMethod.Http,
    callbackUrl: "/api/webhooks",
    callback: async (topic, shop, body, webhookId) => {
      const payload = JSON.parse(body);
      // Payload has the following shape:
      // {
      //   "shop_id": 954889,
      //   "shop_domain": "{shop}.myshopify.com",
      //   "orders_requested": [
      //     299938,
      //     280263,
      //     220458
      //   ],
      //   "customer": {
      //     "id": 191167,
      //     "email": "john@example.com",
      //     "phone": "555-625-1199"
      //   },
      //   "data_request": {
      //     "id": 9999
      //   }
      // }
    },
  },

  /**
   * Store owners can request that data is deleted on behalf of a customer. When
   * this happens, Shopify invokes this privacy webhook.
   *
   * https://shopify.dev/docs/apps/webhooks/configuration/mandatory-webhooks#customers-redact
   */
  CUSTOMERS_REDACT: {
    deliveryMethod: DeliveryMethod.Http,
    callbackUrl: "/api/webhooks",
    callback: async (topic, shop, body, webhookId) => {
      const payload = JSON.parse(body);
      // Payload has the following shape:
      // {
      //   "shop_id": 954889,
      //   "shop_domain": "{shop}.myshopify.com",
      //   "customer": {
      //     "id": 191167,
      //     "email": "john@example.com",
      //     "phone": "555-625-1199"
      //   },
      //   "orders_to_redact": [
      //     299938,
      //     280263,
      //     220458
      //   ]
      // }
    },
  },

  /**
   * 48 hours after a store owner uninstalls your app, Shopify invokes this
   * privacy webhook.
   *
   * https://shopify.dev/docs/apps/webhooks/configuration/mandatory-webhooks#shop-redact
   */
  SHOP_REDACT: {
    deliveryMethod: DeliveryMethod.Http,
    callbackUrl: "/api/webhooks",
    callback: async (topic, shop, body, webhookId) => {
      const payload = JSON.parse(body);
      // Payload has the following shape:
      // {
      //   "shop_id": 954889,
      //   "shop_domain": "{shop}.myshopify.com"
      // }
    },
  },
};

export default PrivacyWebhookHandlers;
