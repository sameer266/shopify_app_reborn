import nodemailer from "nodemailer";

/* -------------------------
   SMTP CONFIG
-------------------------- */
const GMAIL_USER = process.env.GMAIL_USER;
const GMAIL_PASSWORD = process.env.GMAIL_PASSWORD;

/* -------------------------
   TRANSPORTER
-------------------------- */
const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 587,
  secure: false, // TLS
  auth: {
    user: GMAIL_USER,
    pass: GMAIL_PASSWORD,
  },
});

/* -------------------------
   SEND EMAIL FUNCTION
-------------------------- */
export async function sendEmail({ to, subject, text, html, cc }) {
  try {
    const mailOptions = {
      from: `"Shopify App" <${GMAIL_USER}>`,
      to,
      subject,
      text,
    };

    if (html) mailOptions.html = html;
    if (cc) mailOptions.cc = cc;

    const info = await transporter.sendMail(mailOptions);

    console.log(" Email sent:", info.messageId);
    return info;
  } catch (err) {
    console.error(" Email send failed:", err.message);
    throw err;
  }
}