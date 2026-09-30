import nodemailer from 'nodemailer';

const sendEmail = async (options) => {
  // Loại bỏ khoảng trắng trong mật khẩu nếu có
  const cleanPassword = process.env.EMAIL_PASSWORD ? process.env.EMAIL_PASSWORD.replace(/\s+/g, '') : '';
  
  console.log(`Sending email using: ${process.env.EMAIL_USERNAME}`);

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USERNAME,
      pass: cleanPassword,
    },
  });

  const message = {
    from: `"AI Travel Planner" <${process.env.EMAIL_USERNAME}>`,
    to: options.email,
    subject: options.subject,
    text: options.message,
    html: options.html,
  };

  const info = await transporter.sendMail(message);

  console.log('Message sent: %s', info.messageId);
};

export default sendEmail;
