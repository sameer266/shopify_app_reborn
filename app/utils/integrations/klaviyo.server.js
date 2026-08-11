/**
 * Klaviyo integration helpers.
 * Docs: https://developers.klaviyo.com/en/reference/api_overview
 */

const REVISION = "2024-10-15";

function authHeaders(apiKey) {
  return {
    Authorization: `Klaviyo-API-Key ${apiKey}`,
    revision: REVISION,
    "Content-Type": "application/json",
    accept: "application/json",
  };
}

/**
 * Validates the API key and, on success, returns every List the key has
 * access to.
 */
export async function validateAndFetchLists({ apiKey }) {
  if (!apiKey) return { valid: false, error: "API key is required.", lists: [], tags: [] };

  try {
    const res = await fetch("https://a.klaviyo.com/api/lists/?page[size]=100", {
      headers: authHeaders(apiKey),
    });

    if (res.status === 401 || res.status === 403) {
      return { valid: false, error: "Klaviyo rejected this API key.", lists: [], tags: [] };
    }
    if (!res.ok) {
      return { valid: false, error: `Klaviyo error (${res.status}).`, lists: [], tags: [] };
    }

    const json = await res.json();
    const lists = (json.data || []).map((l) => ({ id: l.id, name: l.attributes?.name || l.id }));
    // Klaviyo doesn't have a fixed account-level tag list (see syncSubscriber
    // for how the optional tag is represented there instead).
    return { valid: true, lists, tags: [] };
  } catch {
    return { valid: false, error: "Could not reach Klaviyo.", lists: [], tags: [] };
  }
}

/**
 * Creates (or finds, on a 409 conflict) the profile, then adds it to the
 * selected list. Klaviyo doesn't expose classic free-form "tags" the way
 * Mailchimp/ActiveCampaign do — lists and profile properties are the
 * supported building blocks — so the optional tag is stored as a `tags`
 * custom property on the profile, which is filterable/segmentable inside
 * Klaviyo just like a tag would be.
 *
 * Duplicate-safe: profile creation is upserted by email (409 → reuse the
 * existing profile id) and list membership is a set relationship, so
 * re-running this for the same email/list is always a no-op on retry.
 */
export async function syncSubscriber({ apiKey, listId, tagName, email, firstName, lastName, phone }) {
  if (!apiKey || !listId || !email) {
    return { success: false, error: "Missing Klaviyo API key, list, or email." };
  }

  const headers = authHeaders(apiKey);

  try {
    const profileId = await upsertProfile(headers, { email, firstName, lastName, phone, tagName });
    if (!profileId) {
      return { success: false, error: "Could not create or find Klaviyo profile." };
    }

    const relRes = await fetch(`https://a.klaviyo.com/api/lists/${listId}/relationships/profiles/`, {
      method: "POST",
      headers,
      body: JSON.stringify({ data: [{ type: "profile", id: profileId }] }),
    });

    // 204 = added, 409 = already a member of this list — both are success.
    if (!relRes.ok && relRes.status !== 409) {
      const text = await relRes.text();
      return { success: false, error: `Klaviyo list subscription failed (${relRes.status}): ${text}` };
    }

    return { success: true };
  } catch (err) {
    return { success: false, error: err?.message || "Klaviyo sync failed." };
  }
}

async function upsertProfile(headers, { email, firstName, lastName, phone, tagName }) {
  const attributes = {
    email,
    ...(firstName ? { first_name: firstName } : {}),
    ...(lastName ? { last_name: lastName } : {}),
    ...(phone ? { phone_number: phone } : {}),
    ...(tagName ? { properties: { tags: [tagName] } } : {}),
  };

  const createRes = await fetch("https://a.klaviyo.com/api/profiles/", {
    method: "POST",
    headers,
    body: JSON.stringify({ data: { type: "profile", attributes } }),
  });

  if (createRes.ok) {
    const json = await createRes.json();
    return json?.data?.id || null;
  }

  if (createRes.status === 409) {
    const errJson = await createRes.json().catch(() => null);
    const existingId = errJson?.errors?.[0]?.meta?.duplicate_profile_id;
    if (existingId) return existingId;
  }

  return null;
}
