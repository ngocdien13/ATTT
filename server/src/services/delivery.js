"use strict";
const nodemailer = require("nodemailer");
const { fail } = require("../utils/api");
function emailReady() {
  return !!(
    process.env.SMTP_HOST &&
    process.env.SMTP_FROM &&
    process.env.PUBLIC_ORIGIN
  );
}
function phoneReady() {
  return !!(
    process.env.TWILIO_ACCOUNT_SID &&
    process.env.TWILIO_AUTH_TOKEN &&
    process.env.TWILIO_FROM
  );
}
async function sendEmail(to, subject, text) {
  if (!emailReady()) fail(503, "Chưa cấu hình dịch vụ email.");
  const port = Number(process.env.SMTP_PORT || 587);
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465,
    requireTLS:
      process.env.SMTP_ALLOW_INSECURE_TEST !== "true" ||
      process.env.NODE_ENV === "production",
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
      : undefined,
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
    logger: false,
    debug: false,
  });
  try {
    const result = await transport.sendMail({
      from: process.env.SMTP_FROM,
      to,
      subject,
      text,
      disableFileAccess: true,
      disableUrlAccess: true,
    });
    if (!result.accepted?.length) throw new Error("rejected");
  } catch {
    fail(503, "Dịch vụ email chưa gửi được. Vui lòng thử lại sau.");
  } finally {
    transport.close();
  }
}
async function sendPhone(to, code) {
  if (!phoneReady()) fail(503, "Chưa cấu hình dịch vụ SMS.");
  const sid = process.env.TWILIO_ACCOUNT_SID;
  if (!/^AC[0-9a-f]{32}$/i.test(sid)) fail(503, "Cấu hình SMS không hợp lệ.");
  try {
    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
      {
        method: "POST",
        signal: AbortSignal.timeout(10000),
        headers: {
          Authorization:
            "Basic " +
            Buffer.from(sid + ":" + process.env.TWILIO_AUTH_TOKEN).toString(
              "base64",
            ),
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          To: to,
          From: process.env.TWILIO_FROM,
          Body: `Seruchat: ma xac minh ${code}. Het han sau 10 phut. Khong chia se ma.`,
        }),
      },
    );
    if (!response.ok) throw new Error("delivery");
  } catch {
    fail(503, "Dịch vụ SMS chưa gửi được. Vui lòng thử lại sau.");
  }
}
module.exports = { emailReady, phoneReady, sendEmail, sendPhone };
