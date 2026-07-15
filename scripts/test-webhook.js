import "dotenv/config"
import crypto from "node:crypto"

const webhookUrl =
    process.env.TEST_WEBHOOK_URL ||
    `http://localhost:${process.env.PORT || 3000}/api/framer-lead`

const secret =
    process.env.FRAMER_WEBHOOK_SECRET?.trim()

console.warn(
    "Warning: this may create a real test lead in the configured CRM."
)
console.log("Webhook URL:", webhookUrl)

if (!secret || secret.length < 32) {
    console.error(
        "Set FRAMER_WEBHOOK_SECRET in .env before running this test."
    )
    process.exit(1)
}

const submissionId = crypto.randomUUID()

const payload = JSON.stringify({
    name: "Local Test Lead",
    email: "test@example.com",
    phonenumber: "9999999999",
    company: "Test Company",
    description:
        "Created by the local signed-webhook test script",
})

const signature =
    "sha256=" +
    crypto
        .createHmac("sha256", secret)
        .update(Buffer.from(payload))
        .update(submissionId)
        .digest("hex")

try {
    const response = await fetch(webhookUrl, {
        method: "POST",
        headers: {
            "content-type": "application/json",
            "framer-signature": signature,
            "framer-webhook-submission-id":
                submissionId,
        },
        body: payload,
    })

    const responseBody = await response.text()

    console.log("Status:", response.status)
    console.log("Response:", responseBody)

    if (!response.ok) {
        process.exitCode = 1
    }
} catch (error) {
    const cause = error?.cause

    console.error(
        "Webhook test failed:",
        error instanceof Error
            ? error.message
            : String(error)
    )
    if (cause) {
        console.error(
            "Cause:",
            cause.code || cause.message || String(cause)
        )
    }
    process.exitCode = 1
}
