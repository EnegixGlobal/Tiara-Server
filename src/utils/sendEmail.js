import nodemailer from "nodemailer";

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
};

export default sendEmail;
