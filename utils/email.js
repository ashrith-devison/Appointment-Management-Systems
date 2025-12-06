import nodemailer from 'nodemailer';

/**
 * Create email transporter
 */
const createTransporter = () => {
  // For development, use a service like Gmail or Ethereal
  // For production, use a proper SMTP service

  if (process.env.NODE_ENV === 'production') {
    return nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: process.env.SMTP_PORT,
      secure: false, // true for 465, false for other ports
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    });
  } else {
    // For development, use Ethereal (fake SMTP service)
    return nodemailer.createTransport({
      host: 'smtp.ethereal.email',
      port: 587,
      secure: false,
      auth: {
        user: process.env.ETHEREAL_USER || 'your-ethereal-user',
        pass: process.env.ETHEREAL_PASS || 'your-ethereal-pass'
      }
    });
  }
};

/**
 * Send email
 * @param {Object} options - Email options
 * @param {string} options.to - Recipient email
 * @param {string} options.subject - Email subject
 * @param {string} options.html - Email HTML content
 * @param {string} options.text - Email text content (optional)
 */
export const sendEmail = async (options) => {
  try {
    const transporter = createTransporter();

    const mailOptions = {
      from: `"${process.env.FROM_NAME || 'Your App'}" <${process.env.FROM_EMAIL || 'noreply@yourapp.com'}>`,
      to: options.to,
      subject: options.subject,
      html: options.html,
      text: options.text
    };

    const info = await transporter.sendMail(mailOptions);

    console.log('Email sent:', info.messageId);

    if (process.env.NODE_ENV === 'development') {
      console.log('Preview URL:', nodemailer.getTestMessageUrl(info));
    }

    return info;
  } catch (error) {
    console.error('Email sending failed:', error);
    throw error;
  }
};

/**
 * Send welcome email
 * @param {Object} user - User object
 */
export const sendWelcomeEmail = async (user) => {
  const html = `
    <h2>Welcome to our platform, ${user.name}!</h2>
    <p>Thank you for registering with us.</p>
    <p>You can now log in and start using our services.</p>
    <p>Best regards,<br>The Team</p>
  `;

  await sendEmail({
    to: user.email,
    subject: 'Welcome to our platform',
    html
  });
};

/**
 * Send password reset email
 * @param {Object} user - User object
 * @param {string} resetToken - Reset token
 */
export const sendPasswordResetEmail = async (user, resetToken) => {
  const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;

  const html = `
    <h2>Password Reset Request</h2>
    <p>You requested a password reset for your account.</p>
    <p>Please click the link below to reset your password:</p>
    <a href="${resetUrl}" style="display: inline-block; padding: 10px 20px; background-color: #007bff; color: white; text-decoration: none; border-radius: 5px;">Reset Password</a>
    <p>This link will expire in 10 minutes.</p>
    <p>If you didn't request this, please ignore this email.</p>
    <p>Best regards,<br>The Team</p>
  `;

  await sendEmail({
    to: user.email,
    subject: 'Password Reset Request',
    html
  });
};

/**
 * Send email verification
 * @param {Object} user - User object
 * @param {string} verificationToken - Verification token
 */
export const sendEmailVerification = async (user, verificationToken) => {
  const verificationUrl = `${process.env.FRONTEND_URL}/auth/verify-email?token=${verificationToken}`;

  const html = `
    <h2>Email Verification</h2>
    <p>Please verify your email address by clicking the link below:</p>
    <a href="${verificationUrl}" style="display: inline-block; padding: 10px 20px; background-color: #28a745; color: white; text-decoration: none; border-radius: 5px;">Verify Email</a>
    <p>This link will expire in 24 hours.</p>
    <p>Best regards,<br>The Team</p>
  `;

  await sendEmail({
    to: user.email,
    subject: 'Verify Your Email',
    html
  });
};