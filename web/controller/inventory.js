
import { verifyShopifyHmac } from "../utils/hmac.js";
import { sendEmail } from "../utils/email.js";

/* -------------------------
    HELPER FUNCTION TO PROCESS INVENTORY UPDATE
-------------------------- */
 async function  processInventoryUpdate(payload) {
    console.log("--- Inventory Updated! ---");
    console.log(payload);



  await sendEmail({
  to: "user@gmail.com",
  subject: "Back in Stock Alert",
  text: "Good news! Your product is back in stock.",
});


  return true;
}

/* -------------------------
   MAIN WEBHOOK CONTROLLER
-------------------------- */
export function inventoryWebhookController(req, res) {
  try {
    // 1. HMAC check
    if (!verifyShopifyHmac(req)) {
      console.log("Invalid HMAC");
      return res.status(401).send("Unauthorized");
    }

    // 2. Parse payload
    const payload = JSON.parse(req.body.toString());

    // 3. Process logic
    const ok = processInventoryUpdate(payload);

    if (!ok) {
      return res.status(500).send("Processing failed");
    }

    console.log(" Inventory webhook processed");

    return res.status(200).send("OK");
  } catch (err) {
    console.error("Inventory webhook error:", err);
    return res.status(500).send("Server error");
  }
}