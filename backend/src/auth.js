// backend/src/auth.js
import { betterAuth } from "better-auth";
import { emailOTP } from "better-auth/plugins";
import { Pool } from "pg";
import { Resend } from "resend";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const resend = new Resend(process.env.RESEND_API_KEY);

export const auth = betterAuth({
  secret: process.env.BETTER_AUTH_SECRET,
  database: pool,
  emailAndPassword: {
    enabled: true,
  },
  plugins: [
    emailOTP({
      async sendVerificationOTP({ email, otp, type }) {
        if (type === "email-verification" || type === "sign-in") {
          try {
            await resend.emails.send({
              from: "CryptoVerse HQ <noreply@cryptoversehq.com>",
              to: email,
              subject: "Your CryptoVerse HQ Verification Code",
              html: `
                <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
                  <h2>Your verification code</h2>
                  <p>Your one-time code is:</p>
                  <p style="font-size: 32px; font-weight: bold; letter-spacing: 6px; background: #f4f4f4; padding: 12px; border-radius: 8px; text-align: center;">${otp}</p>
                  <p style="color: #666; font-size: 14px;">This code expires in 5 minutes. If you didn't request this, please ignore this email.</p>
                </div>
              `,
            });
          } catch (error) {
            console.error("Failed to send OTP email:", error);
            throw new Error("Failed to send verification email.");
          }
        }
      },
      otpLength: 6,
      expiresIn: 300, // 5 minutes
    }),
  ],
});
