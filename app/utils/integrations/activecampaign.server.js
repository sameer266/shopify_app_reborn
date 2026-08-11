import { getShopSettingsSection } from "../../services/firestore.server.js";

/**
 * ActiveCampaign integration helpers.
 * Docs: https://developers.activecampaign.com/reference/overview
 */

function authHeaders(apiKey) {
  return { "Api-Token": apiKey, "Content-Type": "application/json" };
}

function normalizeUrl(apiUrl) {
  return String(apiUrl || "").trim().replace(/\/+$/, "");
}

/**
 * Helper function to auto-paginate through all available tags.
 */
async function fetchAllTags(baseUrl, headers) {
  let allTags = [];
  let offset = 0;
  const limit = 100;
  let hasMore = true;

  while (hasMore) {
    const res = await fetch(`${baseUrl}/api/3/tags?limit=${limit}&offset=${offset}`, { headers });
    if (!res.ok) {
      // If a pagination page fails but we already have some tags, 
      // we can gracefully return what we have so far.
      break; 
    }

    const json = await res.json();
    const tags = json.tags || [];
    
    if (tags.length === 0) {
      hasMore = false;
    } else {
      allTags = allTags.concat(tags);
      offset += limit;
      
      // Safety check: if the total metadata is provided, we can verify if we are done
      if (json.meta?.total && allTags.length >= parseInt(json.meta.total, 10)) {
        hasMore = false;
      }
    }
  }

  return allTags;
}

/**
 * Validates the API URL + key and, on success, returns every List AND every
 * existing Tag the account has — both fetched in parallel from the same
 * credentials.
 */
export async function validateAndFetchLists({ apiKey, apiUrl }) {
  const baseUrl = normalizeUrl(apiUrl);
  if (!apiKey || !baseUrl) {
    return { valid: false, error: "API URL and API key are both required.", lists: [], tags: [] };
  }

  const headers = authHeaders(apiKey);

  try {
    // We still kick off both requests in parallel. 
    // fetchAllTags handles its own inner loop for pagination.
    const [listsRes, rawTags] = await Promise.all([
      fetch(`${baseUrl}/api/3/lists?limit=100`, { headers }),
      fetchAllTags(baseUrl, headers).catch(() => []) // Fallback to empty array if tagging fails entirely
    ]);

    if (listsRes.status === 401 || listsRes.status === 403) {
      return { valid: false, error: "ActiveCampaign rejected this API URL or key.", lists: [], tags: [] };
    }
    if (!listsRes.ok) {
      return { valid: false, error: `ActiveCampaign error (${listsRes.status}).`, lists: [], tags: [] };
    }

    const listsJson = await listsRes.json();
    const lists = (listsJson.lists || []).map((l) => ({ id: l.id, name: l.name }));

    // Process the exhaustively fetched tags
    const tags = rawTags
      .filter((t) => t.tagType === "contact" || !t.tagType)
      .map((t) => ({ id: t.id, name: t.tag }));

    return { valid: true, lists, tags };
  } catch {
    return { valid: false, error: "Could not reach ActiveCampaign.", lists: [], tags: [] };
  }
}

/**
 * Looks up a tag by exact name, creating it if it doesn't exist yet, and
 * returns its numeric ID. Tags are reused across syncs instead of being
 * recreated every time.
 */
async function resolveTagId(baseUrl, headers, tagName) {
  const searchRes = await fetch(
    `${baseUrl}/api/3/tags?search=${encodeURIComponent(tagName)}&limit=20`,
    { headers }
  );
  if (searchRes.ok) {
    const searchJson = await searchRes.json();
    const match = (searchJson.tags || []).find(
      (t) => t.tag.toLowerCase() === tagName.toLowerCase()
    );
    if (match) return match.id;
  }

  const createRes = await fetch(`${baseUrl}/api/3/tags`, {
    method: "POST",
    headers,
    body: JSON.stringify({ tag: { tag: tagName, tagType: "contact" } }),
  });
  if (createRes.ok) {
    const createJson = await createRes.json();
    return createJson?.tag?.id || null;
  }
  return null;
}

async function resolveCredentials(shopDomain, fallback = {}) {
  const integration = shopDomain ? await getShopSettingsSection(shopDomain, "integration") : {};
  const apiKey = integration?.activecampaign_api_key || fallback.apiKey || process.env.ACTIVECAMPAIGN_API_KEY;
  const apiUrl = integration?.activecampaign_api_url || fallback.apiUrl || process.env.ACTIVECAMPAIGN_API_URL;
  const listId = integration?.activecampaign_list_id || fallback.listId || null;

  return { apiKey, apiUrl, listId };
}

/**
 * Upserts a contact (POST /contact/sync is upsert-by-email — it can never
 * create a duplicate), subscribes it to the selected list, then applies
 * the configured tag.
 */
export async function unsubscribeActiveCampaign(email, shopDomain = null) {
  if (!email) return { success: false, error: "Missing email." };

  const { apiKey, apiUrl, listId } = await resolveCredentials(shopDomain);
  if (!apiKey || !apiUrl) {
    return { success: false, error: "Missing ActiveCampaign credentials." };
  }

  const baseUrl = normalizeUrl(apiUrl);
  const headers = authHeaders(apiKey);

  try {
    const contactRes = await fetch(`${baseUrl}/api/3/contact/sync`, {
      method: "POST",
      headers,
      body: JSON.stringify({ contact: { email } }),
    });

    if (!contactRes.ok) {
      const text = await contactRes.text();
      return { success: false, error: `ActiveCampaign lookup failed (${contactRes.status}): ${text}` };
    }

    const contactJson = await contactRes.json();
    const contactId = contactJson?.contact?.id;
    if (!contactId) {
      return { success: false, error: "ActiveCampaign did not return a contact ID." };
    }

    if (listId) {
      const listRes = await fetch(`${baseUrl}/api/3/contactLists`, {
        method: "POST",
        headers,
        body: JSON.stringify({ contactList: { list: listId, contact: contactId, status: 2 } }),
      });

      if (listRes.ok || listRes.status === 422) {
        return { success: true };
      }

      const text = await listRes.text();
      return { success: false, error: `ActiveCampaign list unsubscribe failed (${listRes.status}): ${text}` };
    }

    const unsubscribeRes = await fetch(`${baseUrl}/api/3/contactEmailSubscriptions`, {
      method: "POST",
      headers,
      body: JSON.stringify({ contactEmailSubscription: { contact: contactId, status: "unsubscribed" } }),
    });

    if (!unsubscribeRes.ok && unsubscribeRes.status !== 422) {
      const text = await unsubscribeRes.text();
      return { success: false, error: `ActiveCampaign unsubscribe failed (${unsubscribeRes.status}): ${text}` };
    }

    return { success: true };
  } catch (err) {
    return { success: false, error: err?.message || "ActiveCampaign unsubscribe failed." };
  }
}

export async function syncSubscriber({ apiKey, apiUrl, listId, tagName, email, firstName, lastName, phone }) {
  const baseUrl = normalizeUrl(apiUrl);
  if (!baseUrl || !apiKey || !listId || !email) {
    return { success: false, error: "Missing ActiveCampaign API URL, key, list, or email." };
  }

  const headers = authHeaders(apiKey);

  try {
    const contactRes = await fetch(`${baseUrl}/api/3/contact/sync`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        contact: {
          email,
          ...(firstName ? { firstName } : {}),
          ...(lastName ? { lastName } : {}),
          ...(phone ? { phone } : {}),
        },
      }),
    });

    if (!contactRes.ok) {
      const text = await contactRes.text();
      return { success: false, error: `ActiveCampaign contact sync failed (${contactRes.status}): ${text}` };
    }

    const contactJson = await contactRes.json();
    const contactId = contactJson?.contact?.id;
    if (!contactId) {
      return { success: false, error: "ActiveCampaign did not return a contact ID." };
    }

    const listRes = await fetch(`${baseUrl}/api/3/contactLists`, {
      method: "POST",
      headers,
      body: JSON.stringify({ contactList: { list: listId, contact: contactId, status: 1 } }),
    });
    if (!listRes.ok) {
      const text = await listRes.text();
      return { success: false, error: `ActiveCampaign list subscription failed (${listRes.status}): ${text}` };
    }

    if (tagName) {
      const tagId = await resolveTagId(baseUrl, headers, tagName);
      if (tagId) {
        const tagRes = await fetch(`${baseUrl}/api/3/contactTags`, {
          method: "POST",
          headers,
          body: JSON.stringify({ contactTag: { contact: contactId, tag: tagId } }),
        });
        // 422 generally means "already tagged" — not a real failure.
        if (!tagRes.ok && tagRes.status !== 422) {
          const text = await tagRes.text();
          return { success: true, warning: `Subscribed, but tagging failed: ${text}` };
        }
      }
    }

    return { success: true };
  } catch (err) {
    return { success: false, error: err?.message || "ActiveCampaign sync failed." };
  }
}