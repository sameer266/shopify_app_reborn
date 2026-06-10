import {
  findInventoryState,
  createOrUpdateInventoryState,
  getSubscribersForShopVariant,
  updateSubscriberStatus,
  createNotificationLog,
  isVariantTracked,
} from "./firestore.server.js";

import { sendEmail } from "../services/mailgun.server.js";

// strip "gid://shopify/Product/123" → "123"
const toNumericId = (id) =>
  String(id).includes("gid://") ? String(id).split("/").pop() : String(id);

export async function processInventoryChange({
  shop_domain,
  product_id,
  product_handle = null,
  variant_id,
  inventory_item_id,
  current_qty,
  product_title = "Product",
  product_image = null,
}) {
  if (!shop_domain || !variant_id) return null;

  const isTracked = await isVariantTracked(shop_domain, variant_id);
  if (!isTracked) return { skipped: true, reason: "variant_not_tracked" };

  const previous    = await findInventoryState(shop_domain, variant_id);
  const previousQty = Number(previous?.available_qty || 0);
  const backInStock = previousQty === 0 && current_qty > 0;

  await createOrUpdateInventoryState({
    shop_domain, product_id, variant_id,
    inventory_item_id, available_qty: current_qty,
  });

  if (!backInStock) return { variant_id, back_in_stock: false, current_qty };

  const subscribers = await getSubscribersForShopVariant(shop_domain, variant_id);

  // ── Derived display values ────────────────────────────────────────────────

  const shopName = shop_domain
    .replace(".myshopify.com", "")
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");

  const numericVariantId = toNumericId(variant_id);
  const productPath      = product_handle ?? toNumericId(product_id);
  const productUrl       = `https://${shop_domain}/products/${productPath}?variant=${numericVariantId}`;

  let emailsSent = 0;

  for (const sub of subscribers) {
    try {
      if (sub.status === "notified") continue;

      const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Back in Stock – ${shopName}</title>
</head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:'Helvetica Neue',Arial,sans-serif;color:#111;">

  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:40px 0;">
    <tr>
      <td align="center">

        <table width="520" cellpadding="0" cellspacing="0"
               style="background:#ffffff;border:1px solid #e0e0e0;border-radius:4px;overflow:hidden;">

          <!-- Header -->
          <tr>
            <td style="background:#111;padding:20px 32px;">
              <p style="margin:0;font-size:13px;letter-spacing:2px;color:#fff;text-transform:uppercase;font-weight:600;">
                ${shopName}
              </p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:40px 32px;text-align:center;">

              <p style="margin:0 0 6px;font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#888;">
                Good news
              </p>

              <h1 style="margin:0 0 24px;font-size:26px;font-weight:700;letter-spacing:1px;color:#111;">
                Back in Stock
              </h1>

              <div style="width:40px;height:2px;background:#111;margin:0 auto 32px;"></div>

              ${product_image ? `
              <div style="margin:0 0 28px;">
                <img src="${product_image}" alt="${product_title}"
                     style="max-width:260px;width:100%;border:1px solid #e0e0e0;border-radius:2px;display:block;margin:0 auto;" />
              </div>` : ""}

              <h2 style="margin:0 0 12px;font-size:18px;font-weight:600;color:#111;">
                ${product_title}
              </h2>

              <p style="margin:0 0 32px;font-size:14px;line-height:1.7;color:#555;">
                The item you were waiting for is available again.<br/>
                <strong style="color:#111;">Stocks are limited</strong> — grab yours before it sells out.
              </p>

              <a href="${productUrl}"
                 style="display:inline-block;padding:14px 36px;background:#111;color:#fff;
                        text-decoration:none;font-size:13px;letter-spacing:2px;
                        text-transform:uppercase;font-weight:600;border-radius:2px;">
                Shop Now →
              </a>

              <p style="margin:16px 0 0;font-size:11px;color:#aaa;">
                or visit
                <a href="https://${shop_domain}" style="color:#888;text-decoration:underline;">
                  ${shop_domain}
                </a>
              </p>

            </td>
          </tr>

          <!-- Divider -->
          <tr>
            <td style="padding:0 32px;">
              <div style="height:1px;background:#f0f0f0;"></div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:24px 32px;text-align:center;">
              <p style="margin:0;font-size:11px;color:#aaa;line-height:1.6;">
                You're receiving this because you signed up for back-in-stock alerts at
                <a href="https://${shop_domain}" style="color:#888;text-decoration:none;">
                  ${shop_domain}
                </a>.<br/>
                © ${new Date().getFullYear()} ${shopName}. All rights reserved.
              </p>
            </td>
          </tr>

        </table>

      </td>
    </tr>
  </table>

</body>
</html>`;

      await sendEmail({
        to:      sub.customer_email,
        subject: `Back in Stock: ${product_title} — ${shopName}`,
        text:    `${product_title} is back in stock at ${shopName}. View product: ${productUrl}`,
        html,
      });

      await updateSubscriberStatus(sub.id, "notified");
      await createNotificationLog({
        subscriber_id:  sub.id,
        shop_domain,
        variant_id,
        customer_email: sub.customer_email,
        email_sent:     true,
      });

      emailsSent++;
    } catch (err) {
      console.error("Email failed:", sub.customer_email, err.message);
    }
  }

  await createOrUpdateInventoryState({
    shop_domain, product_id, variant_id,
    inventory_item_id, available_qty: current_qty,
    last_notified_at: new Date(),
  });

  return { variant_id, back_in_stock: true, current_qty, emails_sent: emailsSent };
}