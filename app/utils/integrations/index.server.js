import * as mailchimp from "./mailchimp.server.js";
import * as klaviyo from "./klaviyo.server.js";
import * as activecampaign from "./activecampaign.server.js";
import { getShopSettingsSection } from "../../services/firestore.server.js";

/**
 * Single source of truth mapping a provider id (matches IntegrationPanel's
 * `integration.id`) to its API module and the Firestore field names that
 * store its credentials/selection. Every module implements the same two
 * functions — `validateAndFetchLists` and `syncSubscriber` — so adding a
 * new provider only means writing one new file and one new entry here.
 */
export const PROVIDERS = {
  mailchimp: {
    module: mailchimp,
    enabledKey: "mailchimp_enabled",
    apiKeyKey: "mailchimp_api_key",
    listIdKey: "mailchimp_list_id",
    listNameKey: "mailchimp_list_name",
    tagKey: "mailchimp_tag",
  },
  klaviyo: {
    module: klaviyo,
    enabledKey: "klaviyo_enabled",
    apiKeyKey: "klaviyo_api_key",
    listIdKey: "klaviyo_list_id",
    listNameKey: "klaviyo_list_name",
    tagKey: "klaviyo_tag",
  },
  activecampaign: {
    module: activecampaign,
    enabledKey: "activecampaign_enabled",
    apiKeyKey: "activecampaign_api_key",
    apiUrlKey: "activecampaign_api_url",
    listIdKey: "activecampaign_list_id",
    listNameKey: "activecampaign_list_name",
    tagKey: "activecampaign_tag",
  },
};

export function getProvider(id) {
  return PROVIDERS[id] || null;
}

/**
 * Validates credentials for a single provider and returns its available
 * lists. Used by the admin "Connect" / "Refresh lists" button.
 */
export async function validateAndFetchLists(providerId, credentials) {
  const provider = getProvider(providerId);
  if (!provider) return { valid: false, error: "Unknown integration.", lists: [] };
  return provider.module.validateAndFetchLists(credentials);
}

/**
 * Syncs one subscriber to every integration the shop has enabled AND fully
 * configured (API key + a selected list — partially-set-up integrations
 * are skipped rather than guessed at). Each provider is attempted
 * independently: one failing or being mis-configured never blocks the
 * others. This function always resolves (it catches per-provider errors
 * internally) so callers can safely fire-and-forget it without risking the
 * back-in-stock subscription flow itself.
 */
export async function syncSubscriberToIntegrations(shopDomain, subscriber) {
  const integration = await getShopSettingsSection(shopDomain, "integration");
  const results = {};

  for (const [providerId, provider] of Object.entries(PROVIDERS)) {
    const enabled = integration?.[provider.enabledKey];
    const apiKey = integration?.[provider.apiKeyKey];
    const listId = integration?.[provider.listIdKey];

    if (!enabled || !apiKey || !listId) continue;

    const credentials = {
      apiKey,
      apiUrl: provider.apiUrlKey ? integration?.[provider.apiUrlKey] : undefined,
      listId,
      tagName: integration?.[provider.tagKey] || null,
      email: subscriber.customer_email,
      firstName: subscriber.first_name,
      lastName: subscriber.last_name,
      phone: subscriber.phone,
    };

    try {
      const result = await provider.module.syncSubscriber(credentials);
      results[providerId] = result;
      if (!result.success) {
        console.error(`[integrations] ${providerId} sync failed for ${shopDomain}:`, result.error);
      } else if (result.warning) {
        console.warn(`[integrations] ${providerId} sync warning for ${shopDomain}:`, result.warning);
      }
    } catch (err) {
      results[providerId] = { success: false, error: err?.message || "Unknown error" };
      console.error(`[integrations] ${providerId} sync threw for ${shopDomain}:`, err);
    }
  }

  return results;
}
