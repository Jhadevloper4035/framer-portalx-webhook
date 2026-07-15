# Framer Contact Form → Nuumx CRM

A standalone **Node.js 20 + Express** webhook server that receives a secure Framer form submission and forwards it to Nuumx CRM as `multipart/form-data`.

## Architecture

```text
Framer contact form
        |
        | HTTPS POST with JSON + signed headers
        v
Node.js / Express webhook
        |
        | multipart/form-data + private CRM token
        v
https://crx.nuumx.ai/api/leads
```

The CRM token is stored only on the server. It is never placed in Framer or public browser code.

## Security warning

The token and cookies previously pasted into chat must be treated as exposed.

1. Generate a new CRM token.
2. Invalidate the exposed token/session when possible.
3. Do not place the new token in Framer.
4. Do not commit `.env` to GitHub.
5. This project intentionally does not send browser session cookies.

## Requirements

- Node.js 20 or newer
- npm
- A public HTTPS deployment
- A new Nuumx CRM token

## 1. Install in this project

From this project folder:

```bash
npm install
```

## 2. Configure `.env`

Generate a secure Framer webhook secret:

```bash
npm run generate-secret
```

Open `.env` and configure it. Keep this file private and do not commit it:

```env
PORT=3000
NODE_ENV=development

FRAMER_WEBHOOK_SECRET=PASTE_THE_GENERATED_SECRET_HERE
FRAMER_ALLOWED_ORIGINS=https://portalx.life,https://www.portalx.life,https://minimal-start-379923--connect-form-webhook-cvs96zyzh.framer.app
NUUMX_AUTH_TOKEN=PASTE_YOUR_NEW_CRM_TOKEN_HERE

NUUMX_CRM_URL=https://crx.nuumx.ai/api/leads
CRM_STATUS=2
CRM_SOURCE=7
CRM_ASSIGNED=1
CRM_TAGS=Parternership
CRM_TIMEOUT_MS=15000
```

The `FRAMER_WEBHOOK_SECRET` must be at least 32 characters. You will paste the exact same value into Framer.

`FRAMER_ALLOWED_ORIGINS` allows browser form submissions from your Framer site. Add any future custom domain here as a comma-separated `https://...` origin.

`NUUMX_AUTH_TOKEN` becomes the CRM `authtoken` header. `NUUMX_COOKIE` is optional; only set it if the CRM genuinely requires the full Cookie header. Session cookies can expire, so a permanent API token is preferred.

This server sends the same CRM request shape as:

```bash
curl --location "$NUUMX_CRM_URL" \
  --header "authtoken: $NUUMX_AUTH_TOKEN" \
  --header "Cookie: $NUUMX_COOKIE" \
  --form "name=Shubham" \
  --form "email=shubh@gmail.com" \
  --form "phonenumber=9131256436423" \
  --form "company=Portal x" \
  --form "status=$CRM_STATUS" \
  --form "source=$CRM_SOURCE" \
  --form "assigned=$CRM_ASSIGNED" \
  --form "description=testtttttttttttttttt" \
  --form "tags=$CRM_TAGS"
```

The real token and cookie belong only in `.env` locally and Vercel Environment Variables in production.

## 3. Start the Node.js server

Development mode:

```bash
npm run dev
```

Normal mode:

```bash
npm start
```

The server runs at:

```text
http://localhost:3000
```

Health check:

```text
http://localhost:3000/health
```

Webhook endpoint:

```text
http://localhost:3000/api/framer-lead
```

## 4. Test locally

Keep the server running in one terminal.

In a second terminal, run:

```bash
npm run test-webhook
```

This generates a correctly signed request and sends a test lead through the webhook. It may create a real lead in the configured CRM.

Expected response:

```json
{
  "success": true,
  "message": "Lead created successfully"
}
```

## 5. Configure the Framer form fields

In Framer, select each input and set its **Name** property exactly:

| Visible form field | Framer input Name |
|---|---|
| Name | `name` |
| Email | `email` |
| Phone | `phonenumber` |
| Company | `company` |
| Message | `description` |

`name` and `email` are required by this server.

Do not add the following fields to the public Framer form:

- `status`
- `source`
- `assigned`
- `tags`
- `authtoken`

Those values are controlled securely by the Node.js server.

## 6. Deploy to Vercel

This is a plain Express app. Vercel detects `src/server.js`, so no Next.js project or frontend files are needed.

### GitHub + Vercel dashboard

1. Push this current project to a private GitHub repository.
2. Open Vercel and choose **Add New → Project**.
3. Import the GitHub repository.
4. Copy the same values from your local `.env` into Vercel Environment Variables:

```text
FRAMER_WEBHOOK_SECRET=PASTE_THE_GENERATED_SECRET_HERE
FRAMER_ALLOWED_ORIGINS=https://portalx.life,https://www.portalx.life,https://minimal-start-379923--connect-form-webhook-cvs96zyzh.framer.app
NUUMX_CRM_URL=https://crx.nuumx.ai/api/leads
NUUMX_AUTH_TOKEN=PASTE_YOUR_NEW_CRM_TOKEN_HERE
CRM_STATUS=2
CRM_SOURCE=7
CRM_ASSIGNED=1
CRM_TAGS=Parternership
CRM_TIMEOUT_MS=15000
NODE_ENV=production
```

Only add `NUUMX_COOKIE` if the CRM requires a cookie in addition to the token.

5. Leave build settings as the Vercel defaults.
6. Deploy.
7. Open:

```text
https://YOUR-VERCEL-DOMAIN/health
```

Your webhook URL is:

```text
https://YOUR-VERCEL-DOMAIN/api/framer-lead
```

Do not commit `.env` to GitHub.

### Vercel CLI option

Install the Vercel CLI only if you prefer terminal deploys:

```bash
npm i -g vercel
vercel login
vercel
vercel env add FRAMER_WEBHOOK_SECRET production
vercel env add FRAMER_ALLOWED_ORIGINS production
vercel env add NUUMX_CRM_URL production
vercel env add NUUMX_AUTH_TOKEN production
vercel env add CRM_STATUS production
vercel env add CRM_SOURCE production
vercel env add CRM_ASSIGNED production
vercel env add CRM_TAGS production
vercel env add CRM_TIMEOUT_MS production
vercel --prod
```

Run `vercel env add NUUMX_COOKIE production` only if the CRM provider confirms it is required.

## 7. Optional Docker deploy

Build:

```bash
docker build -t framer-nuumx-webhook .
```

Run:

```bash
docker run --rm \
  --env-file .env \
  -p 3000:3000 \
  framer-nuumx-webhook
```

## 8. Connect the webhook in Framer

Use the deployed Vercel URL, not `localhost`.

1. Open the Framer project.
2. Select the complete form component.
3. Set the form input names exactly:

```text
name
email
phonenumber
company
description
```

4. Find **Send To** in the right panel.
5. Select **Add → Webhook**.
6. Enter:

```text
https://YOUR-VERCEL-DOMAIN/api/framer-lead
```

7. Enable webhook signature verification.
8. Paste the same value used for `FRAMER_WEBHOOK_SECRET` in Vercel.
9. Save.
10. Publish the Framer website.

Do not add `status`, `source`, `assigned`, `tags`, `authtoken`, or `Cookie` fields in Framer. This server sends those private values from Vercel environment variables.

## 9. Submit a live test

```text
Name: Test Customer
Email: your-email@example.com
Phone: 9999999999
Company: Test Company
Message: Testing Framer to Nuumx CRM
```

Then check Vercel runtime logs and the CRM:

1. Framer shows the success state.
2. The lead appears in Nuumx CRM.
3. Server logs show `Lead created successfully`.

## Troubleshooting

### `Invalid Framer webhook signature`

The Framer secret does not match the server value.

Make sure these are identical:

```text
Framer webhook secret
=
FRAMER_WEBHOOK_SECRET
```

Restart or redeploy the server after changing an environment variable.

### `/health` returns configuration errors

Open:

```text
https://YOUR-DOMAIN/health
```

Add or correct the environment variables listed in the response.

### CRM returns 401

The CRM token is invalid or expired, or the CRM requires an additional cookie.

Generate a new token and update:

```env
NUUMX_AUTH_TOKEN=YOUR_NEW_TOKEN
```

Do not add the session cookie from the original curl request unless the CRM provider explicitly documents it for server integrations.

### CRM returns 403

The token is valid but lacks permission to create leads, or the CRM blocks the deployed host.

### CRM returns 422

The CRM rejected the submitted fields. Check `CRM_STATUS`, `CRM_SOURCE`, `CRM_ASSIGNED`, the tag spelling, and any required CRM fields.

### CRM timeout

Increase `CRM_TIMEOUT_MS` only if the CRM is slow but eventually succeeds. Otherwise check the CRM availability and deployment logs.

### CRM rejects the lead

Possible causes:

- `CRM_STATUS=2` is not valid.
- `CRM_SOURCE=7` is not valid.
- `CRM_ASSIGNED=1` is not valid.
- The CRM expects a different tag value.
- The token lacks permission to create leads.
- A required CRM field is missing.

Check the Node.js server logs for the CRM status code and response.

### Browser shows `Route not found`

The webhook accepts:

```text
POST /api/framer-lead
```

Opening that URL in a browser sends a GET request. Use `/health` in a browser instead.

### Duplicate leads

Framer can retry webhook requests when it does not receive a successful 2xx response. For strict duplicate protection across multiple server instances, store `Framer-Webhook-Submission-Id` in Redis or a database before creating a lead.
