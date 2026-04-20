import nodemailer from "nodemailer";
import  {getAllData} from '../utils/database.js'





/* -------------------------
   CONVERT TO CSV
-------------------------- */
function convertToCSV(rows) {
  if (!rows?.length) return "";

  const cleanRows = rows.map(row => ({
    item_id: row.item_id,
    quantity: row.quantity,
    shop_domain: row.shop_domain,
    inventory_item_id: row.inventory_item_id,
    variant_id: row.variant_id,
    product_id: row.product_id,
    product_name: row.product_name,
    variant_name: row.variant_name,
    product_image: row.product_image,
    product_price: row.product_price,
    raw_payload: row.raw_payload,
    created_at: row.created_at?.value || row.created_at
  }));

  const header = Object.keys(cleanRows[0]).join(",");

  const values = cleanRows.map(row =>
    Object.values(row)
      .map(v => `"${String(v ?? "").replace(/"/g, '""')}"`)
      .join(",")
  );

  return [header, ...values].join("\n");
}

/* -------------------------
   SEND EMAIL
-------------------------- */
async function sendEmail() {
  const data = await  getAllData();
  console.log(data)
  const csv = convertToCSV(data);

  const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 587,
    secure: false,
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_PASSWORD,
    },
  });

  const mailOptions = {
    from: process.env.GMAIL_USER,
    to: "sameerbaiju792@gmail.com",
    subject: "CSV File",
    text: "Attached is your CSV file",
    attachments: [
      {
        filename: "data.csv",
        content: csv,
      },
    ],
  };

  await transporter.sendMail(mailOptions);

  console.log(" Email sent with CSV");
}


sendEmail();