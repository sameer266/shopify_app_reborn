


export async function shopifyGraphql(shopDomain, query, variables = {}) {
  if (!shopDomain) throw new Error("Missing shopDomain");

  // You must already store access token per shop in Firestore
  const { getShopByDomain } = await import("./firestore.server.js");

  const shop = await getShopByDomain(shopDomain);

  if (!shop?.access_token) {
    throw new Error("Missing Shopify access token");
  }

  const response = await fetch(
    `https://${shopDomain}/admin/api/2025-07/graphql.json`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": shop.access_token,
      },
      body: JSON.stringify({
        query,
        variables,
      }),
    }
  );

  const data = await response.json();

  if (data.errors) {
    console.error("Shopify GraphQL Error:", data.errors);
    throw new Error("Shopify GraphQL request failed");
  }

  return data;
}

