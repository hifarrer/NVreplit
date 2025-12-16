import nodemailer from 'nodemailer';
import path from 'path';
import { Transporter } from 'nodemailer';

class EmailService {
  private transporter: Transporter | null = null;

  constructor() {
    this.initializeTransporter();
  }

  private initializeTransporter() {
    // Check if SMTP configuration is provided
    if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASSWORD) {
      console.warn('SMTP configuration not found. Email service will not be available.');
      return;
    }

    try {
      this.transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: 587, // Standard SMTP port
        secure: false, // true for 465, false for other ports
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASSWORD
        }
      });

      // Verify connection configuration
      this.transporter.verify((error, success) => {
        if (error) {
          console.error('SMTP connection error:', error);
        } else {
          console.log('SMTP server is ready to send emails');
        }
      });
    } catch (error) {
      console.error('Failed to create email transporter:', error);
    }
  }

  async sendContactFormEmail(data: {
    name: string;
    email: string;
    subject: string;
    message: string;
  }): Promise<boolean> {
    if (!this.transporter) {
      console.error('Email transporter not initialized');
      return false;
    }

    try {
      // Send email to support team
      const supportEmail = await this.transporter.sendMail({
        from: `"${data.name}" <${process.env.SMTP_USER}>`,
        to: process.env.SMTP_USER, // Send to the SMTP user email or change to your support email
        replyTo: data.email,
        subject: `[Contact Form] ${data.subject}`,
        text: `
Name: ${data.name}
Email: ${data.email}
Subject: ${data.subject}

Message:
${data.message}

---
This message was sent from the neonvideo.ai contact form.
        `,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #333;">New Contact Form Submission</h2>
            <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <p><strong>Name:</strong> ${data.name}</p>
              <p><strong>Email:</strong> <a href="mailto:${data.email}">${data.email}</a></p>
              <p><strong>Subject:</strong> ${data.subject}</p>
            </div>
            <div style="background: #fff; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
              <h3 style="color: #333;">Message:</h3>
              <p style="white-space: pre-wrap;">${data.message}</p>
            </div>
            <hr style="margin: 30px 0; border: none; border-top: 1px solid #e0e0e0;">
            <p style="color: #666; font-size: 12px;">
              This message was sent from the neonvideo.ai contact form.
            </p>
          </div>
        `
      });

      // Send confirmation email to the user
      await this.transporter.sendMail({
        from: `"neonvideo.ai" <${process.env.SMTP_USER}>`,
        to: data.email,
        subject: 'Thank you for contacting neonvideo.ai',
        text: `
Hi ${data.name},

Thank you for reaching out to us! We've received your message and will get back to you as soon as possible.

Your message details:
Subject: ${data.subject}
Message: ${data.message}

If you have any urgent questions, please don't hesitate to reach out again.

Best regards,
The neonvideo.ai Team
        `,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 8px 8px 0 0;">
              <h1 style="color: white; margin: 0;">Thank You for Contacting Us!</h1>
            </div>
            <div style="background: #fff; padding: 30px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 8px 8px;">
              <p>Hi ${data.name},</p>
              <p>Thank you for reaching out to us! We've received your message and will get back to you as soon as possible.</p>
              
              <div style="background: #f5f5f5; padding: 15px; border-radius: 8px; margin: 20px 0;">
                <h3 style="color: #333; margin-top: 0;">Your message details:</h3>
                <p><strong>Subject:</strong> ${data.subject}</p>
                <p><strong>Message:</strong></p>
                <p style="white-space: pre-wrap;">${data.message}</p>
              </div>
              
              <p>If you have any urgent questions, please don't hesitate to reach out again.</p>
              
              <p>Best regards,<br>
              <strong>The neonvideo.ai Team</strong></p>
            </div>
            <div style="text-align: center; padding: 20px; color: #666; font-size: 12px;">
              <p>© 2025 neonvideo.ai. All rights reserved.</p>
            </div>
          </div>
        `
      });

      console.log('Contact form emails sent successfully');
      return true;
    } catch (error) {
      console.error('Failed to send contact form email:', error);
      return false;
    }
  }

  async sendNewUserRegistrationEmail(userData: {
    username: string;
    email: string;
    createdAt?: Date;
  }): Promise<boolean> {
    if (!this.transporter) {
      console.error('Email transporter not initialized');
      return false;
    }

    try {
      // Send email to support team
      await this.transporter.sendMail({
        from: `"neonvideo.ai System" <${process.env.SMTP_USER}>`,
        to: 'support@neonvideo.ai',
        subject: 'New User Registration',
        text: `
A new user has registered on neonvideo.ai!

User Details:
-------------
Username: ${userData.username}
Email: ${userData.email}
Registration Date: ${userData.createdAt ? new Date(userData.createdAt).toLocaleString() : new Date().toLocaleString()}

Please welcome our new user and ensure they have a great experience on the platform.

---
This is an automated notification from neonvideo.ai
        `,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 8px 8px 0 0;">
              <h1 style="color: white; margin: 0;">🎉 New User Registration</h1>
            </div>
            <div style="background: #fff; padding: 30px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 8px 8px;">
              <p style="font-size: 16px; color: #333;">A new user has registered on neonvideo.ai!</p>
              
              <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
                <h3 style="color: #333; margin-top: 0;">User Details</h3>
                <table style="width: 100%; border-collapse: collapse;">
                  <tr>
                    <td style="padding: 8px 0; color: #666;"><strong>Username:</strong></td>
                    <td style="padding: 8px 0; color: #333;">${userData.username}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; color: #666;"><strong>Email:</strong></td>
                    <td style="padding: 8px 0; color: #333;"><a href="mailto:${userData.email}" style="color: #667eea;">${userData.email}</a></td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; color: #666;"><strong>Registration Date:</strong></td>
                    <td style="padding: 8px 0; color: #333;">${userData.createdAt ? new Date(userData.createdAt).toLocaleString() : new Date().toLocaleString()}</td>
                  </tr>
                </table>
              </div>
              
              <p style="color: #666;">Please welcome our new user and ensure they have a great experience on the platform.</p>
            </div>
            <div style="text-align: center; padding: 20px; color: #666; font-size: 12px;">
              <p>This is an automated notification from neonvideo.ai</p>
              <p>© 2025 neonvideo.ai. All rights reserved.</p>
            </div>
          </div>
        `
      });

      console.log('New user registration email sent to support@neonvideo.ai');
      return true;
    } catch (error) {
      console.error('Failed to send new user registration email:', error);
      return false;
    }
  }

  async sendEmailVerification(userData: {
    username: string;
    email: string;
    verificationToken: string;
  }): Promise<boolean> {
    if (!this.transporter) {
      console.error('Email transporter not initialized');
      return false;
    }

    try {
      // Use dynamic domain based on environment - prefer FRONTEND_URL if set
      const baseUrl = process.env.FRONTEND_URL || 
        (process.env.NODE_ENV === 'production' 
          ? 'https://neonvideo.ai' 
          : `http://localhost:${process.env.PORT || 5000}`);
      const verificationUrl = `${baseUrl}/verify-email?token=${userData.verificationToken}`;

      await this.transporter.sendMail({
        from: `"neonvideo.ai" <${process.env.SMTP_USER}>`,
        to: userData.email,
        subject: 'Verify your email address - neonvideo.ai',
        attachments: [
          {
            filename: 'neonvideo-logo.png',
            path: path.join(process.cwd(), 'attached_assets', 'neonlogo_1756693683433.png'),
            cid: 'neonvideo_logo'
          }
        ],
        text: `
Hi ${userData.username},

Welcome to neonvideo.ai! 

To complete your registration and start creating amazing music videos with AI, please verify your email address by clicking the link below:

${verificationUrl}

This verification link will expire in 24 hours. If you didn't create an account with neonvideo.ai, you can safely ignore this email.

Best regards,
The neonvideo.ai Team
        `,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 8px 8px 0 0; text-align: center;">
              <img src="cid:neonvideo_logo" alt="neonvideo.ai" width="180" height="60" style="height: 60px; width: auto; margin-bottom: 20px; display: block; margin-left: auto; margin-right: auto;" />
              <h1 style="color: white; margin: 0;">🎉 Welcome to neonvideo.ai!</h1>
            </div>
            <div style="background: #fff; padding: 30px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 8px 8px;">
              <p style="font-size: 16px; color: #333;">Hi ${userData.username},</p>
              
              <p style="color: #666;">Welcome to neonvideo.ai! To complete your registration and start creating amazing music videos with AI, please verify your email address.</p>
              
              <div style="text-align: center; margin: 30px 0;">
                <a href="${verificationUrl}" 
                   style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
                          color: white; 
                          padding: 15px 30px; 
                          text-decoration: none; 
                          border-radius: 25px; 
                          display: inline-block; 
                          font-weight: bold;">
                  Verify Email Address
                </a>
              </div>
              
              <p style="color: #666; font-size: 14px;">Or copy and paste this link into your browser:</p>
              <p style="word-break: break-all; background: #f5f5f5; padding: 10px; border-radius: 4px; font-size: 12px;">
                ${verificationUrl}
              </p>
              
              <div style="background: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; border-radius: 8px; margin: 20px 0;">
                <p style="color: #856404; margin: 0; font-size: 14px;">
                  ⏰ This verification link will expire in 24 hours.
                </p>
              </div>
              
              <p style="color: #666; font-size: 14px;">If you didn't create an account with neonvideo.ai, you can safely ignore this email.</p>
              
              <p>Best regards,<br>
              <strong>The neonvideo.ai Team</strong></p>
            </div>
            <div style="text-align: center; padding: 20px; color: #666; font-size: 12px;">
              <p>© 2025 neonvideo.ai. All rights reserved.</p>
            </div>
          </div>
        `
      });

      console.log(`Email verification sent to ${userData.email}`);
      return true;
    } catch (error) {
      console.error('Failed to send email verification:', error);
      return false;
    }
  }

  // Generic email sending method for error notifications and other purposes
  async sendEmail(options: {
    to: string;
    subject: string;
    text?: string;
    html?: string;
    from?: string;
  }): Promise<boolean> {
    if (!this.transporter) {
      console.error('Email transporter not initialized');
      return false;
    }

    try {
      await this.transporter.sendMail({
        from: options.from || `"neonvideo.ai" <${process.env.SMTP_USER}>`,
        to: options.to,
        subject: options.subject,
        text: options.text,
        html: options.html
      });

      return true;
    } catch (error) {
      console.error('Failed to send email:', error);
      return false;
    }
  }

  async sendGreetingCardEmail(data: {
    recipientEmail: string;
    senderName: string;
    senderEmail: string;
    videoTitle: string;
    message: string | null;
    viewUrl: string;
  }): Promise<boolean> {
    if (!this.transporter) {
      console.error('Email transporter not initialized');
      return false;
    }

    try {
      await this.transporter.sendMail({
        from: `"NeonVideo.AI" <${process.env.SMTP_USER}>`,
        to: data.recipientEmail,
        subject: `${data.senderName} sent you a video greeting!`,
        text: `
Hello!

${data.senderName} (${data.senderEmail}) has sent you a special video greeting from NeonVideo.AI!

Video: "${data.videoTitle}"
${data.message ? `\nPersonal message:\n"${data.message}"\n` : ''}
Watch your video greeting here:
${data.viewUrl}

---
This video greeting was sent via neonvideo.ai
        `,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #0f0f0f; color: #ffffff;">
            <div style="background: linear-gradient(135deg, #ec4899 0%, #8b5cf6 50%, #06b6d4 100%); padding: 30px; text-align: center;">
              <h1 style="color: white; margin: 0; font-size: 28px;">You've received a Video Greeting!</h1>
            </div>
            
            <div style="padding: 30px;">
              <p style="font-size: 16px; color: #e0e0e0;">Hello!</p>
              
              <p style="font-size: 16px; color: #e0e0e0;">
                <strong style="color: #ec4899;">${data.senderName}</strong> has sent you a special video greeting!
              </p>
              
              <div style="background: #1a1a1a; border-left: 4px solid #ec4899; padding: 20px; border-radius: 0 8px 8px 0; margin: 20px 0;">
                <h3 style="margin: 0 0 10px 0; color: #ec4899;">"${data.videoTitle}"</h3>
                ${data.message ? `
                <div style="margin-top: 15px; padding-top: 15px; border-top: 1px solid #333;">
                  <p style="margin: 0; color: #a0a0a0; font-style: italic; font-size: 14px;">Personal message:</p>
                  <p style="margin: 10px 0 0 0; color: #e0e0e0; font-size: 15px;">"${data.message}"</p>
                </div>
                ` : ''}
              </div>
              
              <div style="text-align: center; margin: 30px 0;">
                <a href="${data.viewUrl}" 
                   style="background: linear-gradient(135deg, #ec4899 0%, #8b5cf6 100%); 
                          color: white; 
                          padding: 16px 40px; 
                          text-decoration: none; 
                          border-radius: 30px; 
                          display: inline-block; 
                          font-weight: bold;
                          font-size: 16px;
                          box-shadow: 0 4px 15px rgba(236, 72, 153, 0.4);">
                  Watch Your Video
                </a>
              </div>
              
              <p style="color: #666; font-size: 12px; text-align: center; margin-top: 30px;">
                This video greeting was sent via <a href="https://neonvideo.ai" style="color: #ec4899;">neonvideo.ai</a>
              </p>
            </div>
            
            <div style="text-align: center; padding: 20px; background: #1a1a1a; color: #666; font-size: 12px;">
              <p style="margin: 0;">© 2025 neonvideo.ai. All rights reserved.</p>
            </div>
          </div>
        `
      });

      console.log(`Greeting card email sent to ${data.recipientEmail}`);
      return true;
    } catch (error) {
      console.error('Failed to send greeting card email:', error);
      return false;
    }
  }
}

export const emailService = new EmailService();