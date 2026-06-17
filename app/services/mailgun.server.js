import Mailgun from "mailgun.js";
import FormData from "form-data";


const MAILGUN_API_KEY = process.env.MAILGUN_API_KEY || "";
const MAILGUN_DOMAIN = process.env.MAILGUN_DOMAIN || "";
const MAILGUN_FROM_EMAIL = "dev@ellabache.com.au"
const MAILGUN_FROM_NAME = "Ella Baché"


const mailgun = new Mailgun(FormData);

const mg = mailgun.client({
  username: "api",
  key: MAILGUN_API_KEY,
});

export async function sendEmail({
  to,
  subject,
  text,
  html,
  cc,
}) {
  try {
    const response = await mg.messages.create(
      MAILGUN_DOMAIN,
      {
        from: `${MAILGUN_FROM_NAME} <${MAILGUN_FROM_EMAIL}>`,
        to,
        subject,
        text,
        ...(html && { html }),
        ...(cc && { cc }),
      }
    );

    console.log("Email sent:", response.id);
    return response;
  } catch (error) {
    console.error("Email send failed:", error);
    throw error;
  }
}
