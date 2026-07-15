import "dotenv/config"
import crypto from "node:crypto"
import express from "express"

const app = express()

const PORT = toPositiveInteger(process.env.PORT, 3000)
const CRM_TIMEOUT_MS = toPositiveInteger(
    process.env.CRM_TIMEOUT_MS,
    15_000
)
const CRM_URL =
    process.env.NUUMX_CRM_URL?.trim() ||
    "https://crx.nuumx.ai/api/leads"
const DEFAULT_CRM_TAGS = "Parternership"

function toPositiveInteger(value, fallback) {
    const parsed = Number.parseInt(value ?? "", 10)

    return Number.isFinite(parsed) && parsed > 0
        ? parsed
        : fallback
}

function cleanString(value, maxLength = 1000) {
    if (value === null || value === undefined) {
        return ""
    }

    return String(value).trim().slice(0, maxLength)
}

function normalizePhone(value) {
    return cleanString(value, 30).replace(
        /[^\d+\-()\s]/g,
        ""
    )
}

function isValidEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

function getHeaderValue(value) {
    if (Array.isArray(value)) {
        return value[0] || ""
    }

    return typeof value === "string" ? value : ""
}

function verifyFramerSignature({
    rawBody,
    signature,
    submissionId,
}) {
    const secret =
        process.env.FRAMER_WEBHOOK_SECRET?.trim() || ""

    if (
        secret.length < 32 ||
        !Buffer.isBuffer(rawBody) ||
        !signature ||
        !submissionId
    ) {
        return false
    }

    const expectedSignature =
        "sha256=" +
        crypto
            .createHmac("sha256", secret)
            .update(rawBody)
            .update(submissionId)
            .digest("hex")

    const expectedBuffer = Buffer.from(
        expectedSignature,
        "utf8"
    )
    const receivedBuffer = Buffer.from(
        signature.trim(),
        "utf8"
    )

    if (expectedBuffer.length !== receivedBuffer.length) {
        return false
    }

    return crypto.timingSafeEqual(
        expectedBuffer,
        receivedBuffer
    )
}

function validateConfiguration() {
    const errors = []

    if (!process.env.NUUMX_AUTH_TOKEN?.trim()) {
        errors.push("NUUMX_AUTH_TOKEN is missing")
    }

    if (
        !process.env.FRAMER_WEBHOOK_SECRET ||
        process.env.FRAMER_WEBHOOK_SECRET.trim().length <
            32
    ) {
        errors.push(
            "FRAMER_WEBHOOK_SECRET must contain at least 32 characters"
        )
    }

    try {
        const crmUrl = new URL(CRM_URL)

        if (crmUrl.protocol !== "https:") {
            errors.push(
                "NUUMX_CRM_URL must use HTTPS"
            )
        }
    } catch {
        errors.push("NUUMX_CRM_URL is invalid")
    }

    return errors
}

app.disable("x-powered-by")

app.use((request, response, next) => {
    response.setHeader("Cache-Control", "no-store")
    response.setHeader(
        "X-Content-Type-Options",
        "nosniff"
    )
    next()
})

app.get("/", (_request, response) => {
    return response.status(200).json({
        service: "Framer to Nuumx CRM webhook",
        status: "running",
        webhook: "/api/framer-lead",
    })
})

app.get("/health", (_request, response) => {
    const configurationErrors =
        validateConfiguration()

    return response
        .status(
            configurationErrors.length === 0
                ? 200
                : 503
        )
        .json({
            success: configurationErrors.length === 0,
            status:
                configurationErrors.length === 0
                    ? "healthy"
                    : "configuration_error",
            errors: configurationErrors,
        })
})

/*
 * Framer signs the exact raw JSON bytes, so this route must use
 * express.raw() before any JSON parser is applied.
 */
app.post(
    "/api/framer-lead",
    express.raw({
        type: "application/json",
        limit: "100kb",
    }),
    async (request, response) => {
        const configurationErrors =
            validateConfiguration()

        if (configurationErrors.length > 0) {
            console.error(
                "Webhook configuration error:",
                configurationErrors
            )

            return response.status(500).json({
                success: false,
                message:
                    "Webhook server is not configured",
            })
        }

        if (!Buffer.isBuffer(request.body)) {
            return response.status(415).json({
                success: false,
                message:
                    "Content-Type must be application/json",
            })
        }

        const signature = getHeaderValue(
            request.headers["framer-signature"]
        )
        const submissionId = getHeaderValue(
            request.headers[
                "framer-webhook-submission-id"
            ]
        )

        const signatureIsValid =
            verifyFramerSignature({
                rawBody: request.body,
                signature,
                submissionId,
            })

        if (!signatureIsValid) {
            return response.status(401).json({
                success: false,
                message:
                    "Invalid Framer webhook signature",
            })
        }

        let submittedData

        try {
            submittedData = JSON.parse(
                request.body.toString("utf8")
            )
        } catch {
            return response.status(400).json({
                success: false,
                message: "Invalid JSON request body",
            })
        }

        const lead = {
            name: cleanString(
                submittedData.name,
                150
            ),
            email: cleanString(
                submittedData.email,
                254
            ).toLowerCase(),
            phonenumber: normalizePhone(
                submittedData.phonenumber
            ),
            company: cleanString(
                submittedData.company,
                200
            ),
            description: cleanString(
                submittedData.description,
                5000
            ),
        }

        if (!lead.name) {
            return response.status(400).json({
                success: false,
                message: "Name is required",
            })
        }

        if (
            !lead.email ||
            !isValidEmail(lead.email)
        ) {
            return response.status(400).json({
                success: false,
                message:
                    "A valid email address is required",
            })
        }

        const crmForm = new FormData()

        crmForm.append("name", lead.name)
        crmForm.append("email", lead.email)
        crmForm.append(
            "phonenumber",
            lead.phonenumber
        )
        crmForm.append("company", lead.company)
        crmForm.append(
            "status",
            cleanString(
                process.env.CRM_STATUS || "2",
                20
            )
        )
        crmForm.append(
            "source",
            cleanString(
                process.env.CRM_SOURCE || "7",
                20
            )
        )
        crmForm.append(
            "assigned",
            cleanString(
                process.env.CRM_ASSIGNED || "1",
                20
            )
        )
        crmForm.append(
            "description",
            lead.description
        )
        crmForm.append(
            "tags",
            cleanString(
                process.env.CRM_TAGS ||
                    DEFAULT_CRM_TAGS,
                200
            )
        )

        const crmHeaders = {
            authtoken:
                process.env.NUUMX_AUTH_TOKEN,
        }

        if (process.env.NUUMX_COOKIE?.trim()) {
            crmHeaders.Cookie =
                process.env.NUUMX_COOKIE.trim()
        }

        try {
            const crmResponse = await fetch(
                CRM_URL,
                {
                    method: "POST",
                    headers: crmHeaders,
                    body: crmForm,
                    signal: AbortSignal.timeout(
                        CRM_TIMEOUT_MS
                    ),
                }
            )

            const crmResponseText =
                await crmResponse.text()

            if (!crmResponse.ok) {
                console.error(
                    "Nuumx CRM rejected the lead",
                    {
                        status: crmResponse.status,
                        submissionId,
                        response:
                            crmResponseText.slice(
                                0,
                                1000
                            ),
                    }
                )

                /*
                 * A non-2xx response allows Framer to retry.
                 * Do not include the CRM token or full lead data in logs.
                 */
                return response.status(502).json({
                    success: false,
                    message: "CRM rejected the lead",
                    crmStatus:
                        crmResponse.status,
                })
            }

            console.log(
                "Lead created successfully",
                {
                    submissionId,
                    email: lead.email,
                }
            )

            return response.status(200).json({
                success: true,
                message:
                    "Lead created successfully",
            })
        } catch (error) {
            const isTimeout =
                error?.name === "TimeoutError" ||
                error?.name === "AbortError"

            console.error(
                "Unable to send lead to Nuumx CRM",
                {
                    submissionId,
                    error:
                        error instanceof Error
                            ? error.message
                            : String(error),
                }
            )

            return response
                .status(isTimeout ? 504 : 502)
                .json({
                    success: false,
                    message: isTimeout
                        ? "The CRM request timed out"
                        : "Unable to contact the CRM",
                })
        }
    }
)

app.all("/api/framer-lead", (_request, response) => {
    response.setHeader("Allow", "POST")
    return response.status(405).json({
        success: false,
        message: "Method not allowed",
    })
})

/*
 * This parser is for any future JSON routes. It intentionally appears
 * after the Framer raw-body route.
 */
app.use(
    express.json({
        limit: "100kb",
    })
)

app.use((_request, response) => {
    return response.status(404).json({
        success: false,
        message: "Route not found",
    })
})

app.use((error, _request, response, _next) => {
    if (
        error?.type === "entity.too.large"
    ) {
        return response.status(413).json({
            success: false,
            message: "Request body is too large",
        })
    }

    console.error("Unhandled server error", {
        error:
            error instanceof Error
                ? error.message
                : String(error),
    })

    return response.status(500).json({
        success: false,
        message: "Internal server error",
    })
})

app.listen(PORT, (error) => {
    if (error) {
        console.error("Server failed to start", {
            error:
                error instanceof Error
                    ? error.message
                    : String(error),
        })
        process.exitCode = 1
        return
    }

    const configurationErrors =
        validateConfiguration()

    console.log(
        `Webhook server running on port ${PORT}`
    )
    console.log(
        `Webhook URL: http://localhost:${PORT}/api/framer-lead`
    )

    if (configurationErrors.length > 0) {
        console.warn(
            "Configuration requires attention:",
            configurationErrors
        )
    }
})
