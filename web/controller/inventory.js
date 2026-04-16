

import { sendEmail } from "../utils/send_email.js";


async function inventoryWebhookController(payload) {

  try {

  const  { inventory_item_id, available, location_id } = payload;

  // await sendEmail({
  //   to: "sameerbaiju792@gmail.com",
  //   subject: `Inventory Update - Item ID: ${inventory_item_id}`,
  //   text: `The inventory for item ${inventory_item_id} has been updated. New quantity: ${available} at location ${location_id}.`,
  //   html: `<h1>Inventory Update</h1>
  //          <p><strong>Item ID:</strong> ${inventory_item_id}</p>
  //          <p><strong>New Quantity:</strong> ${available}</p>
  //          <p><strong>Location ID:</strong> ${location_id}</p>
  //         ` ,
  //   cc: "sameerbaiju792@gmail.com"

  // });

  console.log(` INVENTORY UPDATE | Item ID: ${inventory_item_id}`);
  console.log(`New Quantity: ${available}`);
  console.log(`Location: ${location_id}`);


  }
  catch (error) {
    console.error(" Inventory Webhook Error:", error.message);
  }

}


export { inventoryWebhookController };


