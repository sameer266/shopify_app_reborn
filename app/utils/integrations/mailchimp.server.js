import crypto from "node:crypto";

/**
 * Mailchimp integration helpers.
 * Docs: https://mailchimp.com/developer/marketing/api/
 *
 * Mailchimp API keys look like "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx-us21" — the
 * datacenter ("us21") is the suffix after the last dash and is required to
 * build the correct API host. There is no separate "account URL" field for
 * Mailchimp; the datacenter is derived straight from the key.
 */

function getDatacenter(apiKey) {
  const parts = String(apiKey || "").split("-");
  return parts.length > 1 ? parts[parts.length - 1] : null;
}

function getBaseUrl(apiKey) {
  const dc = getDatacenter(apiKey);
  return dc ? `https://${dc}.api.mailchimp.com/3.0` : null;
}

function authHeaders(apiKey) {
  const token = Buffer.from(`anystring:${apiKey}`).toString("base64");
  return { Authorization: `Basic ${token}`, "Content-Type": "application/json" };
}

/**
 * Validates the API key and, on success, returns every Audience (list) the
 * key has access to.
 */
export async function validateAndFetchLists({ apiKey }) {
  const baseUrl = getBaseUrl(apiKey);
  if (!apiKey || !baseUrl) {
    return {
      valid: false,
      error: "Invalid API key format. Expected something like xxxxxxxx-us21.",
      lists: [],
      tags: [],
    };
  }

  try {
    const res = await fetch(`${baseUrl}/lists?count=100&fields=lists.id,lists.name`, {
      headers: authHeaders(apiKey),
    });

    if (res.status === 401 || res.status === 403) {
      return { valid: false, error: "Mailchimp rejected this API key.", lists: [], tags: [] };
    }
    if (!res.ok) {
      return { valid: false, error: `Mailchimp error (${res.status}).`, lists: [], tags: [] };
    }

    const json = await res.json();
    const lists = (json.lists || []).map((l) => ({ id: l.id, name: l.name }));
    // Mailchimp tags are per-Audience and free-form (created on the fly by
    // syncSubscriber), so there's no fixed account-level tag list to fetch
    // the way ActiveCampaign has.
    return { valid: true, lists, tags: [] };
  } catch {
    return { valid: false, error: "Could not reach Mailchimp.", lists: [], tags: [] };
  }
}

/**
 * Upserts a subscriber on the selected Audience and (optionally) applies a
 * tag. Uses PUT on the member resource, which Mailchimp keys by an MD5 hash
 * of the lowercased email — so this can never create a duplicate member,
 * it always updates the same record on retry.
 */
export async function syncSubscriber({ apiKey, listId, tagName, email, firstName, lastName }) {
  const baseUrl = getBaseUrl(apiKey);
  if (!baseUrl || !listId || !email) {
    return { success: false, error: "Missing Mailchimp API key, list, or email." };
  }

  const subscriberHash = crypto.createHash("md5").update(email.trim().toLowerCase()).digest("hex");
  const headers = authHeaders(apiKey);

  try {
    const memberRes = await fetch(`${baseUrl}/lists/${listId}/members/${subscriberHash}`, {
      method: "PUT",
      headers,
      body: JSON.stringify({
        email_address: email,
        status_if_new: "subscribed",
        merge_fields: {
          ...(firstName ? { FNAME: firstName } : {}),
          ...(lastName ? { LNAME: lastName } : {}),
        },
      }),
    });

    if (!memberRes.ok) {
      const text = await memberRes.text();
      return { success: false, error: `Mailchimp member upsert failed (${memberRes.status}): ${text}` };
    }

    if (tagName) {
      const tagRes = await fetch(`${baseUrl}/lists/${listId}/members/${subscriberHash}/tags`, {
        method: "POST",
        headers,
        body: JSON.stringify({ tags: [{ name: tagName, status: "active" }] }),
      });
      if (!tagRes.ok) {
        const text = await tagRes.text();
        return { success: true, warning: `Subscribed, but tagging failed (${tagRes.status}): ${text}` };
      }
    }

    return { success: true };
  } catch (err) {
    return { success: false, error: err?.message || "Mailchimp sync failed." };
  }
}
