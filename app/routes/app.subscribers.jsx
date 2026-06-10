import { useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import { getAllSubscribers } from "../services/firestore.server.js";
import SubscribersPage from "../components/SubscriberPage";

/**
 * GraphQL query to fetch product details
 */
const PRODUCT_QUERY = `#graphql
  query GetProduct($id: ID!) {
    product(id: $id) {
      id
      title
      featuredImage {
        url
        altText
      }
      variants(first: 250) {
        nodes {
          id
          title
        }
      }
    }
  }
`;

/**
 * Enrich subscribers with product data from GraphQL if missing
 */
async function enrichSubscribers(subscribers, admin) {
  const productsToFetch = new Map();

  // Collect unique product IDs that need data
  for (const sub of subscribers) {
    if (!sub.product_title || !sub.image_url) {
      if (sub.product_id && !productsToFetch.has(sub.product_id)) {
        productsToFetch.set(sub.product_id, true);
      }
    }
  }

  // Fetch product data
  const productData = {};
  for (const productId of productsToFetch.keys()) {
    try {
      const res = await admin.graphql(PRODUCT_QUERY, {
        variables: { id: `gid://shopify/Product/${productId}` },
      });
      const data = await res.json();
      if (data?.data?.product) {
        const product = data.data.product;
        productData[productId] = {
          title: product.title,
          image: product.featuredImage?.url,
          variants: product.variants.nodes,
        };
      }
    } catch (err) {
      console.error(`Failed to fetch product ${productId}:`, err);
    }
  }

  // Merge data
  return subscribers.map((sub) => {
    const product = productData[sub.product_id];
    const enriched = { ...sub };

    if (product) {
      if (!enriched.product_title) {
        enriched.product_title = product.title;
      }
      if (!enriched.image_url) {
        enriched.image_url = product.image;
      }
      if (!enriched.variant_title && sub.variant_id) {
        const variant = product.variants.find(
          (v) => v.id.includes(String(sub.variant_id))
        );
        if (variant) {
          enriched.variant_title = variant.title;
        }
      }
    }

    return enriched;
  });
}

export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);

  let subscribers = (await getAllSubscribers()) || [];

  // Enrich with product data from GraphQL
  subscribers = await enrichSubscribers(subscribers, admin);

  return { subscribers };
};

export default function SubscribersRoute() {
  const { subscribers } = useLoaderData();

  return <SubscribersPage subscribers={subscribers} />;
}
