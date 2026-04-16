import nodemailer from "nodemailer";

/* -------------------------
   SAMPLE DATA
-------------------------- */
const data = [
  { name: "Sameer", email: "sameer@gmail.com", product: "Shirt" },
  { name: "John", email: "john@gmail.com", product: "Shoes" },
];

/* -------------------------
   CONVERT TO CSV
-------------------------- */
function convertToCSV(rows) {
  const header = Object.keys(rows[0]).join(",");
  const values = rows.map(row =>
    Object.values(row).join(",")
  );

  return [header, ...values].join("\n");
}

/* -------------------------
   SEND EMAIL
-------------------------- */
async function sendEmail() {
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

/* -------------------------
   RUN
-------------------------- */
sendEmail();