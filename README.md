# xRTasks

A responsive task-unlock website starter with a protected admin dashboard.

## Run locally

1. Install Node.js 20 or newer.
2. Copy `.env.example` to `.env`.
3. Set a long, unique `ADMIN_PASSWORD` and `SESSION_SECRET`.
4. Run:

   ```bash
   npm install
   npm start
   ```

5. Open `http://localhost:3000`.
6. Click **Admin Login** and use the password from `.env`.

The first server run creates `data/db.json`. Change the YouTube, WhatsApp, Telegram task URLs and the reward URL in the admin dashboard.

## Automatic verification status

This project deliberately does **not** treat a click as proof of completion. The `/api/verify/:taskId` route currently fails closed with HTTP 501, and `/api/reward` stays locked. This prevents users from unlocking the reward by simply calling a public endpoint.

To enable real verification, implement server-side provider adapters and visitor identity/session handling:

- **Telegram:** Use a Telegram bot added to the target channel/group as an administrator. Validate a Telegram Login Widget or Telegram Mini App `initData` signature on the server, then use `getChatMember` and accept only `creator`, `administrator`, or `member` (and handle restricted users carefully). The visitor's identity must be cryptographically validated; never trust a raw user ID sent by the browser.
- **YouTube:** Implement Google OAuth consent for each visitor with the required YouTube read-only scope, then use the authenticated visitor's access token with `subscriptions.list` to check the target channel ID. Respect OAuth consent, token security, quotas, and API policies.
- **WhatsApp Channels:** WhatsApp does not provide a general public API to check whether an arbitrary visitor follows a Channel. Do not claim automatic verification is available. Keep this task disabled, or replace it with a transparent alternative that can actually be verified.

After the adapters are implemented, store verified task IDs against a server-side visitor session/account and only return the reward URL when every enabled task has a verified record. Do not store provider secrets in frontend code.

## Production checklist

- Use HTTPS.
- Set strong secrets and a unique admin password.
- Add rate limiting and CSRF protection to admin routes.
- Use a persistent database and secure, HttpOnly, SameSite cookies for sessions.
- Implement provider verification and server-side progress storage before publishing a real reward.
- Add privacy policy/terms and disclose what account data is checked.
- Restrict admin access and back up configuration.
