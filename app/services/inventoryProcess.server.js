import {
  findInventoryState,
  createOrUpdateInventoryState,
  getSubscribersForShopVariant,
  updateSubscriberStatus,
  createNotificationLog,
  isVariantTracked,
  getShopSettingsSection,   
} from "./firestore.server.js";

import { sendEmail } from "../services/mailgun.server.js";
import { DEFAULT_SETTINGS } from "../utils/emailTemplate.js";
import { buildUnsubscribeUrl } from "./unsubscribe.server.js";

// strip "gid://shopify/Product/123" → "123"
const toNumericId = (id) =>
  String(id).includes("gid://") ? String(id).split("/").pop() : String(id);

// ── Dynamic email template helpers ──────────────────────────────────────────
// Renders the restock email from the merchant's Appearance settings
// (app.appereance.jsx) instead of a hardcoded template. Kept in this file
// since it's the only consumer.

function interpolate(str, tokens) {
  if (!str) return "";
  return String(str)
    .replace(/{{\s*product_title\s*}}/g, tokens.product_title ?? "")
    .replace(/{{\s*variant_title\s*}}/g, tokens.variant_title ?? "")
    .replace(/{{\s*product_url\s*}}/g, tokens.product_url ?? "")
    .replace(/{{\s*image_url\s*}}/g, tokens.image_url ?? "")
    .replace(/{{\s*product_price\s*}}/g, tokens.product_price ?? "")
    .replace(/{{\s*shop_name\s*}}/g, tokens.shop_name ?? "")
    .replace(/{{\s*shop_domain\s*}}/g, tokens.shop_domain ?? "")
    .replace(/{{\s*current_year\s*}}/g, tokens.current_year ?? "")
    .replace(/{{\s*unsubscribe_url\s*}}/g, tokens.unsubscribe_url ?? "");
}

// Formats a raw numeric/string price into a display string, e.g. 89 -> "$89.00".
// Returns "" when there is no usable price so templates can hide the price row.
function formatPrice(price) {
  if (price === null || price === undefined || price === "") return "";
  const num = Number(price);
  if (Number.isNaN(num)) return "";
  const formatted = num.toFixed(2);
  const currencySymbol = "$";
  return currencySymbol + formatted;
}

function esc(str) {
  if (str === null || str === undefined) return "";
  return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Merge saved settings on top of defaults so a missing/partial settings
// document never produces an undefined value in the template.
function resolveEmailSettings(savedSettings) {
  return { ...DEFAULT_SETTINGS, ...(savedSettings || {}) };
}

// Builds the final restock-notification email HTML from merchant settings.
function buildRestockEmailHtml(settings, product) {
  const s = resolveEmailSettings(settings);

  const tokens = {
    product_title: product?.title || "Product",
    variant_title: product?.variantTitle || "",
    product_url: product?.url || "#",
    image_url: product?.imageUrl || "",
    product_price: formatPrice(product?.price),
    shop_name: product?.shopName || "Our Store",
    shop_domain: product?.shopDomain || "",
    current_year: String(new Date().getFullYear()),
    unsubscribe_url: product?.unsubscribeUrl || "",
  };

  // Custom HTML overrides everything else
  if (s.custom_html_enabled && s.custom_html) {
    return interpolate(s.custom_html, tokens);
  }

  const shopNameLocal = tokens.shop_name;
  const year = tokens.current_year;

  const headerHtml = s.header_show
    ? `
    <tr>
      <td align="center" bgcolor="${esc(s.header_background_color)}" style="background-color:${esc(s.header_background_color)};padding:24px 20px;">
        ${
          s.header_logo_url
            ? `<img src="${esc(s.header_logo_url)}" alt="${esc(shopNameLocal)}" height="40" style="display:block;border:0;outline:none;text-decoration:none;max-height:40px;max-width:200px;" />`
            : `<span style="font-family:${s.body_font_family};font-size:18px;font-weight:bold;color:${esc(s.header_text_color)};">${esc(s.header_text)}</span>`
        }
      </td>
    </tr>` : "";

  const variantHtml = s.body_show_variant && tokens.variant_title
    ? `
        <tr>
          <td align="center" style="padding:0 0 6px;">
            <span style="font-family:${s.body_font_family};font-size:11px;font-weight:bold;letter-spacing:1.5px;text-transform:uppercase;color:${esc(s.body_text_color)};opacity:0.6;">
              ${esc(tokens.variant_title)}
            </span>
          </td>
        </tr>` : "";

  const imageHtml = s.body_show_product_image && tokens.image_url
    ? `
        <tr>
          <td align="center" style="padding:0 0 20px;">
            <img src="${esc(tokens.image_url)}" alt="${esc(tokens.product_title)}" width="220" style="display:block;border:0;outline:none;text-decoration:none;max-width:220px;border-radius:4px;" />
          </td>
        </tr>` : "";

  const priceHtml = s.body_show_price && tokens.product_price
    ? `
        <tr>
          <td align="center" style="padding:0 0 16px;">
            <span style="font-family:${s.body_font_family};font-size:18px;font-weight:bold;color:${esc(s.body_text_color)};">${esc(tokens.product_price)}</span>
          </td>
        </tr>` : "";

  const buttonHtml = s.button_show
    ? `
        <tr>
          <td align="center" style="padding:4px 0 0;">
            <a href="${esc(tokens.product_url)}" target="_blank"
               style="display:inline-block;font-family:${s.body_font_family};font-size:13px;font-weight:bold;letter-spacing:0.5px;text-transform:uppercase;text-decoration:none;
                      background-color:${esc(s.button_background_color)};color:${esc(s.button_text_color)};
                      padding:14px 34px;border-radius:${esc(s.button_border_radius)};">
              ${esc(s.button_text)}
            </a>
          </td>
        </tr>` : "";

  const unsubscribeLink = product?.unsubscribeUrl
    ? `<a href="${esc(product.unsubscribeUrl)}" style="color:${esc(s.footer_text_color)};text-decoration:underline;">${esc(product.unsubscribeUrl)}</a>`
    : `<a href="#" style="color:${esc(s.footer_text_color)};text-decoration:underline;">${esc(s.footer_unsubscribe_text)}</a>`;

  const unsubscribeHtml = s.footer_show_unsubscribe
    ? `<div style="margin-top:10px;padding-top:10px;border-top:1px solid rgba(0,0,0,0.08);font-family:${s.body_font_family};font-size:12px;line-height:1.6;color:${esc(s.footer_text_color)};">
        <div style="font-weight:bold;">Don't want these notifications anymore?</div>
        <div style="margin-top:4px;">Unsubscribe:</div>
        <div style="margin-top:4px;word-break:break-all;">${unsubscribeLink}</div>
      </div>`
    : "";

  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <title>${esc(tokens.product_title)} is back in stock</title>
  <style>
    body, table, td { margin:0; padding:0; }
    img { border:0; outline:none; text-decoration:none; }
    @media only screen and (max-width:600px) {
      .container { width:100% !important; }
      .stack-padding { padding-left:16px !important; padding-right:16px !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background-color:#f0f0f0;">
  <span style="display:none;font-size:0;line-height:0;max-height:0;max-width:0;opacity:0;overflow:hidden;">
    ${esc(interpolate(s.body_heading, tokens))}
  </span>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f0f0f0;">
    <tr>
      <td align="center" style="padding:24px 16px;">

        <table role="presentation" class="container" width="560" cellpadding="0" cellspacing="0"
               style="width:560px;max-width:560px;border-radius:6px;overflow:hidden;">

          ${headerHtml}

          <!-- Body -->
          <tr>
            <td class="stack-padding" bgcolor="${esc(s.body_background_color)}" style="background-color:${esc(s.body_background_color)};padding:28px 28px 24px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                ${imageHtml}
                ${variantHtml}
                <tr>
                  <td align="center" style="padding:0 0 10px;">
                    <span style="font-family:${s.body_font_family};font-size:20px;font-weight:bold;line-height:1.3;color:${esc(s.body_text_color)};">
                      ${esc(interpolate(s.body_heading, tokens))}
                    </span>
                  </td>
                </tr>
                <tr>
                  <td align="center" style="padding:0 0 22px;">
                    <span style="font-family:${s.body_font_family};font-size:14px;line-height:1.6;color:${esc(s.body_text_color)};opacity:0.8;">
                      ${esc(interpolate(s.body_subtext, tokens))}
                    </span>
                  </td>
                </tr>
                ${priceHtml}
                ${buttonHtml}
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td align="center" class="stack-padding" bgcolor="${esc(s.footer_background_color)}" style="background-color:${esc(s.footer_background_color)};padding:18px 28px;">
              <span style="font-family:${s.body_font_family};font-size:11px;line-height:1.6;color:${esc(s.footer_text_color)};">
                ${esc(s.footer_text)}${unsubscribeHtml}
              </span>
              <br />
              <span style="font-family:${s.body_font_family};font-size:11px;color:${esc(s.footer_text_color)};opacity:0.7;">
                &copy; ${year} ${esc(shopNameLocal)}. All rights reserved.
              </span>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export async function processInventoryChange({
  shop_domain,
  product_id,
  product_handle = null,
  variant_id,
  inventory_item_id,
  current_qty,
  product_title = "Product",
  product_image = null,
  product_price = null,

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

  let emailsSent = 0;

  // Load merchant Appearance settings once per restock event (not per subscriber)
let emailSettings;
try {
  const saved = await getShopSettingsSection(shop_domain, "email");
  emailSettings = resolveEmailSettings(saved);
} catch (err) {
  console.error("Failed to load email settings, using defaults:", err.message);
  emailSettings = resolveEmailSettings({});
}

  for (const sub of subscribers) {
    try {
      if (sub.status === "notified") continue;

      // Use the price/image/title captured at signup time for this specific
      // subscriber instead of requiring the webhook/caller to supply a single
      // shared value (the inventory webhook payload doesn't include product
      // data, so this avoids an extra GraphQL lookup per restock event).
      const subProductTitle = sub.product_title || product_title;
      const subImageUrl     = sub.image_url || product_image;
      const subPrice        = sub.price ?? product_price;

      // Prefer the handle from the live GraphQL fetch (freshest); fall back
      // to the handle captured on the subscriber at signup time; only fall
      // back to the numeric product_id (which produces an invalid Shopify
      // product URL) if neither is available.
      const subProductPath = product_handle ?? sub.product_handle ?? toNumericId(product_id);
      const productUrl     = `https://${shop_domain}/products/${subProductPath}?variant=${numericVariantId}`;

      const unsubscribeUrl = buildUnsubscribeUrl(sub);

      let html;
      try {
        html = buildRestockEmailHtml(emailSettings, {
          title: subProductTitle,
          variantTitle: sub.variant_title || null,
          url: productUrl,
          imageUrl: subImageUrl,
          price: subPrice,
          shopName,
          shopDomain: shop_domain,
          unsubscribeUrl,
        });
      } catch (templateErr) {
        // Last-resort fallback so a template/setting bug never blocks delivery
        console.error("Template build failed, using plain fallback email:", templateErr.message);
        html = `<p>${subProductTitle} is back in stock at ${shopName}.</p><p><a href="${productUrl}">Shop now</a></p>`;
      }

      await sendEmail({
        to:      sub.customer_email,
        subject: `Back in Stock: ${subProductTitle} — ${shopName}`,
        text:    `${subProductTitle} is back in stock at ${shopName}. View product: ${productUrl}\n\nUnsubscribe: ${unsubscribeUrl}`,
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
