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
  const productPath      = product_handle ?? toNumericId(product_id);
  const productUrl       = `https://${shop_domain}/products/${productPath}?variant=${numericVariantId}`;

  let emailsSent = 0;

  for (const sub of subscribers) {
    try {
      if (sub.status === "notified") continue;
const html = `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html dir="ltr" xmlns="http://www.w3.org/1999/xhtml" xmlns:o="urn:schemas-microsoft-com:office:office" lang="en">
<head>
  <meta charset="UTF-8">
  <meta content="width=device-width, initial-scale=1" name="viewport">
  <meta name="x-apple-disable-message-reformatting">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta content="telephone=no" name="format-detection">
  <title>Back in Stock – ${shopName}</title>
  <!--[if (mso 16)]><style type="text/css">a {text-decoration: none;}</style><![endif]-->
  <!--[if gte mso 9]><style>sup { font-size: 100% !important; }</style><![endif]-->
  <style type="text/css">
    .rollover:hover .rollover-first { max-height:0px!important; display:none!important; }
    .rollover:hover .rollover-second { max-height:none!important; display:block!important; }
    u + .body img ~ div div { display:none; }
    #outlook a { padding:0; }
    span.MsoHyperlink, span.MsoHyperlinkFollowed { color:inherit; mso-style-priority:99; }
    a.d { mso-style-priority:100!important; text-decoration:none!important; }
    a[x-apple-data-detectors], #MessageViewBody a {
      color:inherit!important; text-decoration:none!important;
      font-size:inherit!important; font-family:inherit!important;
      font-weight:inherit!important; line-height:inherit!important;
    }
    .l { display:none; float:left; overflow:hidden; width:0; max-height:0; line-height:0; mso-hide:all; }
    .ba:hover { border-color:#003a6b #003a6b #003a6b #003a6b!important; background:#013a5e!important; }
    .ba:hover a.d, .ba:hover button.d, .ba:hover label.d { background:#013a5e!important; color:#ffffff!important; }
    @media only screen and (max-width:600px) {
      .bj { padding-right:0px!important }
      .bi { padding:20px!important }
      *[class="gmail-fix"] { display:none!important }
      p, a { line-height:150%!important }
      h1, h1 a { line-height:120%!important }
      h2, h2 a { line-height:120%!important }
      h3, h3 a { line-height:120%!important }
      h1 { font-size:36px!important; text-align:center }
      h2 { font-size:26px!important; text-align:center }
      h3 { font-size:18px!important; text-align:center }
      .adapt-img { width:100%!important; height:auto!important }
      a.d, button.d { display:block!important; font-size:18px!important; padding:10px 20px!important; line-height:120%!important }
      .ba { display:block!important }
      .u, .v { width:100%!important; border-collapse:separate!important }
      .a .c, .a .c * { font-size:28px!important }
      .a .b, .a .b * { font-size:18px!important }
    }
  </style>
</head>
<body class="body" style="width:100%;height:100%;font-family:arial,'helvetica neue',helvetica,sans-serif;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;padding:0;Margin:0">
  <span style="display:none !important;font-size:0px;line-height:0;color:#ffffff;visibility:hidden;opacity:0;height:0;width:0;mso-hide:all">${shopName} – Back in Stock</span>

  <div dir="ltr" class="es-wrapper-color" lang="en" style="background-color:#F6F6F6">
    <table width="100%" cellspacing="0" cellpadding="0" class="es-wrapper" role="none"
           style="mso-table-lspace:0pt;mso-table-rspace:0pt;border-collapse:collapse;border-spacing:0px;padding:0;Margin:0;width:100%;height:100%;background-repeat:repeat;background-position:center top">
      <tbody>
        <tr>
          <td valign="top" style="padding:0;Margin:0">

            <!-- HEADER: Logo -->
            <table cellpadding="0" cellspacing="0" align="center" class="r" role="none"
                   style="mso-table-lspace:0pt;mso-table-rspace:0pt;border-collapse:collapse;border-spacing:0px;width:100%;table-layout:fixed !important;background-color:transparent;background-repeat:repeat;background-position:center top">
              <tbody>
                <tr>
                  <td align="center" style="padding:0;Margin:0">
                    <table bgcolor="#ffffff" align="center" cellpadding="0" cellspacing="0" style="mso-table-lspace:0pt;mso-table-rspace:0pt;border-collapse:collapse;border-spacing:0px;background-color:#ffffff;width:600px" role="none">
                      <tbody>
                        <tr>
                          <td align="left" bgcolor="#ffffff" style="padding:20px 20px 0;Margin:0;background-color:#ffffff">
                            <table cellpadding="0" cellspacing="0" width="100%" role="none" style="mso-table-lspace:0pt;mso-table-rspace:0pt;border-collapse:collapse;border-spacing:0px">
                              <tbody>
                                <tr>
                                  <td valign="top" align="center" class="bj" style="padding:0;Margin:0;width:560px">
                                    <table cellpadding="0" cellspacing="0" width="100%" bgcolor="#ffffff" style="mso-table-lspace:0pt;mso-table-rspace:0pt;border-collapse:collapse;border-spacing:0px;background-color:#ffffff" role="presentation">
                                      <tbody>
                                        <tr>
                                          <td align="center" style="padding:10px 0 30px;Margin:0;font-size:0px">
                                            <a target="_blank" href="https://${shop_domain}" style="mso-line-height-rule:exactly;text-decoration:none;color:#333333;font-size:14px">
                                              <img src="https://cdn.shopify.com/s/files/1/2999/1646/files/transparent_logo_blue.png?v=1700704859"
                                                   alt="${shopName}" height="30" title="${shopName}"
                                                   style="display:block;font-size:14px;border:0;outline:none;text-decoration:none;margin:0" width="171">
                                            </a>
                                          </td>
                                        </tr>
                                      </tbody>
                                    </table>
                                  </td>
                                </tr>
                              </tbody>
                            </table>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </td>
                </tr>
              </tbody>
            </table>

            <!-- BODY: Product -->
            <table cellpadding="0" cellspacing="0" align="center" class="q" role="none"
                   style="mso-table-lspace:0pt;mso-table-rspace:0pt;border-collapse:collapse;border-spacing:0px;width:100%;table-layout:fixed !important">
              <tbody>
                <tr>
                  <td align="center" style="padding:0;Margin:0">
                    <table bgcolor="#ffffff" align="center" cellpadding="0" cellspacing="0" class="bf" role="none"
                           style="mso-table-lspace:0pt;mso-table-rspace:0pt;border-collapse:collapse;border-spacing:0px;background-color:#FFFFFF;width:600px">
                      <tbody>
                        <tr>
                          <td align="left" style="padding:0;Margin:0">
                            <table cellpadding="0" cellspacing="0" width="100%" role="none" style="mso-table-lspace:0pt;mso-table-rspace:0pt;border-collapse:collapse;border-spacing:0px">
                              <tbody>
                                <tr>
                                  <td align="center" valign="top" style="padding:0;Margin:0;width:600px">
                                    <table cellpadding="0" cellspacing="0" width="100%" role="presentation" style="mso-table-lspace:0pt;mso-table-rspace:0pt;border-collapse:collapse;border-spacing:0px">
                                      <tbody>
                                        <!-- Heading -->
                                        <tr>
                                          <td align="center" class="a" style="padding:10px;Margin:0">
                                            <h3 style="Margin:0;font-family:arial,'helvetica neue',helvetica,sans-serif;mso-line-height-rule:exactly;letter-spacing:0;font-size:22px;font-style:normal;font-weight:normal;line-height:26px;color:#001e37">
                                              <b>${product_title} is now&nbsp;</b>
                                            </h3>
                                            <h3 class="c" style="Margin:0;font-family:arial,'helvetica neue',helvetica,sans-serif;mso-line-height-rule:exactly;letter-spacing:0;font-size:28px;font-style:normal;font-weight:normal;line-height:34px;color:#001e37">
                                              <b>BACK IN STOCK</b>
                                            </h3>
                                          </td>
                                        </tr>
                                        <!-- Product Image -->
                                        ${product_image ? `
                                        <tr>
                                          <td align="center" style="padding:0;Margin:0;font-size:0px">
                                            <img src="${product_image}" alt="${product_title}" width="600" class="adapt-img"
                                                 style="display:block;font-size:14px;border:0;outline:none;text-decoration:none;margin:0;max-height:600px;object-fit:cover">
                                          </td>
                                        </tr>` : ""}
                                      </tbody>
                                    </table>
                                  </td>
                                </tr>
                              </tbody>
                            </table>
                          </td>
                        </tr>

                        <!-- Product Details & CTA -->
                        <tr>
                          <td align="left" style="padding:0 20px 20px;Margin:0">
                            <table cellpadding="0" cellspacing="0" width="100%" role="none" style="mso-table-lspace:0pt;mso-table-rspace:0pt;border-collapse:collapse;border-spacing:0px">
                              <tbody>
                                <tr>
                                  <td align="center" valign="top" style="padding:0;Margin:0;width:560px">
                                    <table cellpadding="0" cellspacing="0" width="100%" bgcolor="#ffffff"
                                           style="mso-table-lspace:0pt;mso-table-rspace:0pt;border-collapse:collapse;border-spacing:0px;background-color:#ffffff" role="presentation">
                                      <tbody>
                                        <tr>
                                          <td align="center" class="a" style="padding:15px 0 20px;Margin:0">
                                            <p class="b" style="Margin:0;mso-line-height-rule:exactly;font-family:arial,'helvetica neue',helvetica,sans-serif;line-height:36px;letter-spacing:0;font-weight:normal;color:#001e37;font-size:18px">
                                              <strong style="font-weight:bolder !important">${product_title}</strong>
                                            </p>
<p style="Margin:0;mso-line-height-rule:exactly;font-family:arial,'helvetica neue',helvetica,sans-serif;line-height:28px;color:#001e37;font-size:18px;">
  <strong>$${product_price}</strong>
</p>
                                            <p style="Margin:0;mso-line-height-rule:exactly;font-family:arial,'helvetica neue',helvetica,sans-serif;line-height:28px;letter-spacing:0;font-weight:normal;color:#001e37;font-size:14px"><br></p>
                                            <p style="Margin:0;mso-line-height-rule:exactly;font-family:arial,'helvetica neue',helvetica,sans-serif;line-height:28px;letter-spacing:0;font-weight:normal;color:#001e37;font-size:14px">
                                              The wait is over. Your item is in stock and available now.&nbsp;<br>Place your order before it sells out.<br>
                                            </p>
                                          </td>
                                        </tr>
                                        <tr>
                                          <td align="center" style="padding:0 0 20px;Margin:0">
                                            <span class="ba" style="border-style:solid;border-color:#001E37;background:#001E37;border-width:0px 0px 2px 0px;display:inline-block;border-radius:0px;width:auto;text-align:center !important">
                                              <a href="${productUrl}" target="_blank" class="d"
                                                 style="mso-style-priority:100 !important;text-decoration:none !important;mso-line-height-rule:exactly;color:#FFFFFF;font-size:20px;font-weight:normal;padding:20px 30px;display:inline-block;background:#001E37;border-radius:0px;font-family:arial,'helvetica neue',helvetica,sans-serif;font-style:normal;line-height:24px;width:auto;text-align:center;letter-spacing:0;mso-padding-alt:0;mso-border-alt:10px solid #001E37;text-transform:none">
                                                ORDER NOW
                                              </a>
                                            </span>
                                          </td>
                                        </tr>
                                      </tbody>
                                    </table>
                                  </td>
                                </tr>
                              </tbody>
                            </table>
                          </td>
                        </tr>

                      </tbody>
                    </table>
                  </td>
                </tr>
              </tbody>
            </table>

            <!-- FOOTER -->
            <table cellspacing="0" cellpadding="0" align="center" class="s" role="none"
                   style="mso-table-lspace:0pt;mso-table-rspace:0pt;border-collapse:collapse;border-spacing:0px;width:100%;table-layout:fixed !important;background-color:transparent;background-repeat:repeat;background-position:center top">
              <tbody>
                <tr>
                  <td bgcolor="#001e37" align="center" style="padding:0;Margin:0;background-color:#001e37">
                    <table cellspacing="0" cellpadding="0" align="center" class="be"
                           style="mso-table-lspace:0pt;mso-table-rspace:0pt;border-collapse:collapse;border-spacing:0px;background-color:transparent;width:600px" role="none">
                      <tbody>
                        <!-- Social -->
                        <tr>
                          <td align="left" style="Margin:0;padding:20px 20px 30px">
                            <table width="100%" cellspacing="0" cellpadding="0" role="none" style="mso-table-lspace:0pt;mso-table-rspace:0pt;border-collapse:collapse;border-spacing:0px">
                              <tbody>
                                <tr>
                                  <td valign="top" align="center" style="padding:0;Margin:0;width:560px">
                                    <table width="100%" cellspacing="0" cellpadding="0" role="presentation" style="mso-table-lspace:0pt;mso-table-rspace:0pt;border-collapse:collapse;border-spacing:0px">
                                      <tbody>
                                        <tr>
                                          <td align="center" style="padding:20px 0;Margin:0">
                                            <h3 style="Margin:0;font-family:arial,'helvetica neue',helvetica,sans-serif;mso-line-height-rule:exactly;letter-spacing:0;font-size:24px;font-style:normal;font-weight:normal;line-height:29px;color:#ffffff"><b>follow us</b></h3>
                                          </td>
                                        </tr>
                                        <tr>
                                          <td align="center" style="padding:0;Margin:0;font-size:0">
                                            <table cellspacing="0" cellpadding="0" class="f x" role="presentation" style="mso-table-lspace:0pt;mso-table-rspace:0pt;border-collapse:collapse;border-spacing:0px">
                                              <tbody>
                                                <tr>
                                                  <td valign="top" align="center" style="padding:0 30px 0 0;Margin:0">
                                                    <a target="_blank" href="http://www.facebook.com/ellabache" style="mso-line-height-rule:exactly;text-decoration:none;color:#FFFFFF;font-size:14px">
                                                      <img src="https://qnvieg.stripocdn.email/content/assets/img/social-icons/circle-white-bordered/facebook-circle-white-bordered.png" alt="Fb" title="Facebook" width="32" height="32" style="display:block;font-size:14px;border:0;outline:none;text-decoration:none;margin:0">
                                                    </a>
                                                  </td>
                                                  <td valign="top" align="center" style="padding:0 30px 0 0;Margin:0">
                                                    <a target="_blank" href="http://www.instagram.com/ellabacheaus" style="mso-line-height-rule:exactly;text-decoration:none;color:#FFFFFF;font-size:14px">
                                                      <img src="https://qnvieg.stripocdn.email/content/assets/img/social-icons/circle-white-bordered/instagram-circle-white-bordered.png" alt="Ig" title="Instagram" width="32" height="32" style="display:block;font-size:14px;border:0;outline:none;text-decoration:none;margin:0">
                                                    </a>
                                                  </td>
                                                  <td valign="top" align="center" style="padding:0;Margin:0">
                                                    <a target="_blank" href="https://www.youtube.com/c/ellabache" style="mso-line-height-rule:exactly;text-decoration:none;color:#FFFFFF;font-size:14px">
                                                      <img src="https://qnvieg.stripocdn.email/content/assets/img/social-icons/circle-white-bordered/youtube-circle-white-bordered.png" alt="Yt" title="Youtube" width="32" height="32" style="display:block;font-size:14px;border:0;outline:none;text-decoration:none;margin:0">
                                                    </a>
                                                  </td>
                                                </tr>
                                              </tbody>
                                            </table>
                                          </td>
                                        </tr>
                                      </tbody>
                                    </table>
                                  </td>
                                </tr>
                              </tbody>
                            </table>
                          </td>
                        </tr>

                        <!-- Instagram photo gallery -->
                        <tr>
                          <td align="left" class="esdev-adapt-off" style="padding:0 20px;Margin:0">
                            <table cellpadding="0" cellspacing="0" class="esdev-mso-table" role="none" style="mso-table-lspace:0pt;mso-table-rspace:0pt;border-collapse:collapse;border-spacing:0px;width:560px">
                              <tbody>
                                <tr>
                                  <td valign="top" class="esdev-mso-td" style="padding:0;Margin:0">
                                    <table cellpadding="0" cellspacing="0" align="left" class="u" role="none" style="mso-table-lspace:0pt;mso-table-rspace:0pt;border-collapse:collapse;border-spacing:0px;float:left">
                                      <tbody>
                                        <tr>
                                          <td align="center" class="bj" style="padding:0;Margin:0;width:140px">
                                            <table cellpadding="0" cellspacing="0" width="100%" role="presentation" style="mso-table-lspace:0pt;mso-table-rspace:0pt;border-collapse:collapse;border-spacing:0px">
                                              <tbody>
                                                <tr>
                                                  <td align="center" style="padding:0;Margin:0;font-size:0px">
                                                    <a target="_blank" href="https://www.instagram.com/ellabacheaus/" style="mso-line-height-rule:exactly;text-decoration:none;color:#FFFFFF;font-size:14px">
                                                      <img src="https://qnvieg.stripocdn.email/content/guids/CABINET_289dc1bc3b40bce1a81164f1d805cb46d185e1d6832587ea32d1027846b61e6b/images/724225554_18603521491013923_811551153472329092_nwebp.jpg" alt="" width="140" class="adapt-img" style="display:block;font-size:14px;border:0;outline:none;text-decoration:none;margin:0" height="140">
                                                    </a>
                                                  </td>
                                                </tr>
                                              </tbody>
                                            </table>
                                          </td>
                                        </tr>
                                      </tbody>
                                    </table>
                                  </td>
                                  <td valign="top" class="esdev-mso-td" style="padding:0;Margin:0">
                                    <table cellpadding="0" cellspacing="0" align="left" class="u" role="none" style="mso-table-lspace:0pt;mso-table-rspace:0pt;border-collapse:collapse;border-spacing:0px;float:left">
                                      <tbody>
                                        <tr>
                                          <td align="center" style="padding:0;Margin:0;width:140px">
                                            <table cellpadding="0" cellspacing="0" width="100%" role="presentation" style="mso-table-lspace:0pt;mso-table-rspace:0pt;border-collapse:collapse;border-spacing:0px">
                                              <tbody>
                                                <tr>
                                                  <td align="center" style="padding:0;Margin:0;font-size:0px">
                                                    <a target="_blank" href="https://www.instagram.com/ellabacheaus/" style="mso-line-height-rule:exactly;text-decoration:none;color:#FFFFFF;font-size:14px">
                                                      <img src="https://qnvieg.stripocdn.email/content/guids/CABINET_289dc1bc3b40bce1a81164f1d805cb46d185e1d6832587ea32d1027846b61e6b/images/722562625_18603245308013923_4030091634448525835_nwebp.jpg" alt="" width="140" class="adapt-img" style="display:block;font-size:14px;border:0;outline:none;text-decoration:none;margin:0" height="140">
                                                    </a>
                                                  </td>
                                                </tr>
                                              </tbody>
                                            </table>
                                          </td>
                                        </tr>
                                      </tbody>
                                    </table>
                                  </td>
                                  <td valign="top" class="esdev-mso-td" style="padding:0;Margin:0">
                                    <table cellpadding="0" cellspacing="0" align="left" class="u" role="none" style="mso-table-lspace:0pt;mso-table-rspace:0pt;border-collapse:collapse;border-spacing:0px;float:left">
                                      <tbody>
                                        <tr>
                                          <td align="center" style="padding:0;Margin:0;width:140px">
                                            <table cellpadding="0" cellspacing="0" width="100%" role="presentation" style="mso-table-lspace:0pt;mso-table-rspace:0pt;border-collapse:collapse;border-spacing:0px">
                                              <tbody>
                                                <tr>
                                                  <td align="center" style="padding:0;Margin:0;font-size:0px">
                                                    <a target="_blank" href="https://www.instagram.com/ellabacheaus/" style="mso-line-height-rule:exactly;text-decoration:none;color:#FFFFFF;font-size:14px">
                                                      <img src="https://qnvieg.stripocdn.email/content/guids/CABINET_289dc1bc3b40bce1a81164f1d805cb46d185e1d6832587ea32d1027846b61e6b/images/723041297_18602947639013923_8701471332075080726_nwebp.jpg" alt="" width="140" class="adapt-img" style="display:block;font-size:14px;border:0;outline:none;text-decoration:none;margin:0" height="140">
                                                    </a>
                                                  </td>
                                                </tr>
                                              </tbody>
                                            </table>
                                          </td>
                                        </tr>
                                      </tbody>
                                    </table>
                                  </td>
                                  <td valign="top" class="esdev-mso-td" style="padding:0;Margin:0">
                                    <table cellpadding="0" cellspacing="0" align="right" class="v" role="none" style="mso-table-lspace:0pt;mso-table-rspace:0pt;border-collapse:collapse;border-spacing:0px;float:right">
                                      <tbody>
                                        <tr>
                                          <td align="center" style="padding:0;Margin:0;width:140px">
                                            <table cellpadding="0" cellspacing="0" width="100%" role="presentation" style="mso-table-lspace:0pt;mso-table-rspace:0pt;border-collapse:collapse;border-spacing:0px">
                                              <tbody>
                                                <tr>
                                                  <td align="center" style="padding:0;Margin:0;font-size:0px">
                                                    <a target="_blank" href="https://www.instagram.com/ellabacheaus/" style="mso-line-height-rule:exactly;text-decoration:none;color:#FFFFFF;font-size:14px">
                                                      <img src="https://qnvieg.stripocdn.email/content/guids/CABINET_289dc1bc3b40bce1a81164f1d805cb46d185e1d6832587ea32d1027846b61e6b/images/723131293_18602646940013923_278125788106010448_nwebp.jpg" alt="" width="140" class="adapt-img" style="display:block;font-size:14px;border:0;outline:none;text-decoration:none;margin:0" height="140">
                                                    </a>
                                                  </td>
                                                </tr>
                                              </tbody>
                                            </table>
                                          </td>
                                        </tr>
                                      </tbody>
                                    </table>
                                  </td>
                                </tr>
                              </tbody>
                            </table>
                          </td>
                        </tr>

                        <!-- Spacer -->
                        <tr>
                          <td align="left" style="padding:0;Margin:0">
                            <table cellpadding="0" cellspacing="0" width="100%" role="none" style="mso-table-lspace:0pt;mso-table-rspace:0pt;border-collapse:collapse;border-spacing:0px">
                              <tbody>
                                <tr>
                                  <td align="center" valign="top" style="padding:0;Margin:0;width:600px">
                                    <table cellpadding="0" cellspacing="0" width="100%" role="presentation" style="mso-table-lspace:0pt;mso-table-rspace:0pt;border-collapse:collapse;border-spacing:0px">
                                      <tbody>
                                        <tr>
                                          <td align="center" style="padding:20px;Margin:0;font-size:0">
                                            <table height="100%" cellpadding="0" cellspacing="0" border="0" width="100%" role="presentation" style="mso-table-lspace:0pt;mso-table-rspace:0pt;border-collapse:collapse;border-spacing:0px">
                                              <tbody>
                                                <tr>
                                                  <td style="padding:0;Margin:0;width:100%;margin:0px;border-bottom:0px solid #cccccc;background:unset;height:0px"></td>
                                                </tr>
                                              </tbody>
                                            </table>
                                          </td>
                                        </tr>
                                      </tbody>
                                    </table>
                                  </td>
                                </tr>
                              </tbody>
                            </table>
                          </td>
                        </tr>

                        <!-- Footer links & legal -->
                        <tr>
                          <td align="left" style="padding:0;Margin:0">
                            <table cellpadding="0" cellspacing="0" width="100%" role="none" style="mso-table-lspace:0pt;mso-table-rspace:0pt;border-collapse:collapse;border-spacing:0px">
                              <tbody>
                                <tr>
                                  <td align="center" valign="top" style="padding:0;Margin:0;width:600px">
                                    <table cellpadding="0" cellspacing="0" width="100%" role="presentation" style="mso-table-lspace:0pt;mso-table-rspace:0pt;border-collapse:collapse;border-spacing:0px">
                                      <tbody>
                                        <tr>
                                          <td align="center" style="padding:20px;Margin:0;font-size:0">
                                            <table border="0" width="100%" height="100%" cellpadding="0" cellspacing="0" role="presentation" style="mso-table-lspace:0pt;mso-table-rspace:0pt;border-collapse:collapse;border-spacing:0px">
                                              <tbody>
                                                <tr>
                                                  <td style="padding:0;Margin:0;border-bottom:1px solid #ffffff;background:unset;height:0px;width:100%;margin:0px"></td>
                                                </tr>
                                              </tbody>
                                            </table>
                                          </td>
                                        </tr>
                                        <tr>
                                          <td style="padding:0;Margin:0">
                                            <table cellpadding="0" cellspacing="0" width="100%" class="h" role="presentation" style="mso-table-lspace:0pt;mso-table-rspace:0pt;border-collapse:collapse;border-spacing:0px">
                                              <tbody>
                                                <tr class="links">
                                                  <td align="center" valign="top" width="33.33%" class="n" style="Margin:0;border:0;padding:10px 5px 30px">
                                                    <div style="vertical-align:middle;display:block">
                                                      <a target="_blank" href="https://${shop_domain}" style="mso-line-height-rule:exactly;text-decoration:none;font-family:arial,'helvetica neue',helvetica,sans-serif;display:block;color:#ffffff;font-size:14px">Shop online</a>
                                                    </div>
                                                  </td>
                                                  <td align="center" valign="top" width="33.33%" class="n" style="Margin:0;border:0;padding:10px 5px 30px">
                                                    <div style="vertical-align:middle;display:block">
                                                      <a target="_blank" href="https://www.ellabache.com.au/pages/find-a-salon" style="mso-line-height-rule:exactly;text-decoration:none;font-family:arial,'helvetica neue',helvetica,sans-serif;display:block;color:#ffffff;font-size:14px">Find a salon</a>
                                                    </div>
                                                  </td>
                                                  <td align="center" valign="top" width="33.33%" class="n" style="Margin:0;border:0;padding:10px 5px 30px">
                                                    <div style="vertical-align:middle;display:block">
                                                      <a target="_blank" href="https://www.ellabache.com.au/pages/franchise" style="mso-line-height-rule:exactly;text-decoration:none;font-family:arial,'helvetica neue',helvetica,sans-serif;display:block;color:#ffffff;font-size:14px">Own a salon</a>
                                                    </div>
                                                  </td>
                                                </tr>
                                              </tbody>
                                            </table>
                                          </td>
                                        </tr>
                                        <tr>
                                          <td align="center" style="Margin:0;padding:5px 10px 30px">
                                            <p style="Margin:0;mso-line-height-rule:exactly;font-family:arial,'helvetica neue',helvetica,sans-serif;line-height:21px;letter-spacing:0;font-weight:normal;color:#ffffff;font-size:14px">
                                              You are receiving this email because you signed up for back-in-stock alerts.
                                              For full terms and conditions visit
                                              <a target="_blank" href="https://${shop_domain}" style="mso-line-height-rule:exactly;text-decoration:underline;color:#ffffff;font-size:14px">${shop_domain}</a>.
                                            </p>
                                            <p style="Margin:0;mso-line-height-rule:exactly;font-family:arial,'helvetica neue',helvetica,sans-serif;line-height:21px;letter-spacing:0;font-weight:normal;color:#ffffff;font-size:14px">
                                              <br>© ${new Date().getFullYear()} ${shopName}. All rights reserved.
                                            </p>
                                       
                                          </td>
                                        </tr>
                                      </tbody>
                                    </table>
                                  </td>
                                </tr>
                              </tbody>
                            </table>
                          </td>
                        </tr>

                      </tbody>
                    </table>
                  </td>
                </tr>
              </tbody>
            </table>

          </td>
        </tr>
      </tbody>
    </table>
  </div>
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
