import { Resend } from "resend";
import nodemailer from "nodemailer";

// const resend = new Resend(process.env.RESEND_API_KEY);

const sendEmail = async (options) => {
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.SMTP_EMAIL,
      pass: process.env.SMTP_PASSWORD,
    },
  });

  const message = {
    from: `TiaraSteps <${process.env.SMTP_EMAIL}>`,
    to: options.email,
    subject: options.subject,
    html: options.message,
  };

  try {
    const info = await transporter.sendMail(message);
    // console.log("Email sent: " + info.response);
  } catch (error) {
    console.log("Email not sent: " + error.message);
    throw error;
  }

  // try {
  //   await resend.emails.send({
  //     from:
  //       process.env.RESEND_FROM_EMAIL ||
  //       "TiaraSteps <no-reply@tiarasteps.com>",
  //     to: options.email,
  //     subject: options.subject,
  //     html: options.message,
  //   });
  // } catch (error) {
  //   console.log("Email not sent: " + error.message);
  //   throw error;
  // }
};

export default sendEmail;
