
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require("fs");
const { google } = require("googleapis");

const connectDB = require('./config/db');
const Admin = require('./models/Admin');
const Allocation = require('./models/Allocation');

const authRoutes = require('./routes/authRoutes');
const officerRoutes = require('./routes/officerRoutes');
const boothRoutes = require('./routes/boothRoutes');
const allocationRoutes = require('./routes/allocationRoutes');
const uploadRoutes = require('./routes/uploadRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const reportsRoutes = require('./routes/reportsRoutes');

const { protect } = require('./middleware/authMiddleware');
const { notFound, errorHandler } = require('./middleware/errorMiddleware');

const { mountSwagger } = require("./docs/swagger");

const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
);

const SCOPES = [
    "https://www.googleapis.com/auth/gmail.send"
];


if (fs.existsSync("tokens.json")) {

    try {

        const tokens = JSON.parse(
            fs.readFileSync("tokens.json", "utf8")
        );

        oauth2Client.setCredentials(tokens);

        console.log("[AUTH] Saved Google credentials loaded");

    } catch (error) {

        console.error(
            "[AUTH] Failed to load tokens:",
            error.message
        );
    }
}



const app = express();

// --------------------------- Global middleware ------------------------------
app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

// ------------------------------- Routes --------------------------------------
app.get('/api/health', (req, res) =>
  res.json({ success: true, message: 'Smart Polling Allocation API is running' })
);

app.use('/api/auth', authRoutes);
app.use('/api/officers', officerRoutes);
app.use('/api/booths', boothRoutes);
app.use('/api/allocation', allocationRoutes.router);


// Dashboard stats endpoint (protected, lives next to allocation data).
app.get('/api/dashboard/stats', protect, allocationRoutes.getDashboardStats);

app.use('/api/upload', uploadRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/reports', reportsRoutes);

// Serve sample templates folder as static files (backup for template links).
app.use('/static', express.static(path.join(__dirname, 'uploads')));

// ----------------------------- API documentation ------------------------------
// Interactive Swagger UI  ->  http://localhost:<PORT>/api-docs
// Raw OpenAPI 3 JSON spec ->  http://localhost:<PORT>/api-docs.json
mountSwagger(app);



app.get("/auth/google", (req, res) => {
    const authUrl =
        oauth2Client.generateAuthUrl({

            access_type: "offline",
            prompt: "consent",
            scope: SCOPES
        });

    console.log("[AUTH URL]");
    console.log(authUrl);

    res.redirect(authUrl);
});
app.get("/auth/google/callback", async (req, res) => {

    try {

        const { code } = req.query;

        if (!code) {

            return res.status(400).send(
                "Authorization code missing"
            );
        }


        console.log("[AUTH] Authorization code received");

        const { tokens } =
            await oauth2Client.getToken(code);


        console.log("[AUTH] Tokens received");

        console.log({
            access_token: !!tokens.access_token,
            refresh_token: !!tokens.refresh_token,
            expiry_date: tokens.expiry_date
        });


        oauth2Client.setCredentials(tokens);


        // Save tokens locally
        fs.writeFileSync(
            "tokens.json",
            JSON.stringify(tokens, null, 2)
        );


        console.log(
            "[AUTH] Google authentication successful"
        );


        res.send(`
            <h1>Google Authentication Successful! ✅</h1>

            <p>You can close this page.</p>

            <p>
                Now test:
            </p>

            <pre>
POST http://localhost:${PORT}/api/mail/send
            </pre>
        `);

    } catch (error) {

        console.error(
            "[AUTH] OAuth error:"
        );

        console.error(
            error.response?.data ||
            error.message
        );


        res.status(500).json({

            success: false,

            error:
                error.response?.data ||
                error.message
        });
    }
});

// --------------------------- Mail helpers ------------------------------------

/**
 * Sends an e-mail through the connected Gmail account (OAuth).
 * Extracted so the free-form endpoint and the allocation-letter
 * endpoints reuse the same MIME building + sending logic.
 */
async function sendGmailMessage({ to, subject, text }) {
    if (!to) throw Object.assign(new Error("Missing 'to'"), { statusCode: 400 });
    if (!subject) throw Object.assign(new Error("Missing 'subject'"), { statusCode: 400 });
    if (!text) throw Object.assign(new Error("Missing 'text'"), { statusCode: 400 });

    const credentials = oauth2Client.credentials;

    if (!credentials.access_token && !credentials.refresh_token) {
        throw Object.assign(
            new Error("Google account is not authenticated"),
            { statusCode: 401, authUrl: `http://localhost:${PORT}/auth/google` }
        );
    }

    const gmail = google.gmail({ version: "v1", auth: oauth2Client });

    const message = [
        "MIME-Version: 1.0",
        `To: ${to}`,
        `Subject: ${subject}`,
        "Content-Type: text/plain; charset=UTF-8",
        "",
        text,
    ].join("\r\n");

    const raw = Buffer.from(message).toString("base64url");

    console.log(`[MAIL] Sending email to ${to}`);

    const response = await gmail.users.messages.send({
        userId: "me",
        requestBody: { raw },
    });

    console.log("[MAIL] Email sent successfully:", response.data.id);
    return response.data.id;
}

/** Uniform JSON error response for the mail endpoints. */
function mailErrorResponse(res, error) {
    res.status(error.statusCode || 500).json({
        success: false,
        message: error.message,
        auth: error.authUrl || undefined,
        googleError: error.response?.data || null,
    });
}

/**
 * Builds the polling-duty letter body from an allocation (populated officer
 * + booth). Mirrors the wording of smsService.buildAllocationMessage.
 */
function buildAllocationLetter(allocation) {
    const o = allocation.officer || {};
    const b = allocation.booth || {};
    return [
        `Dear ${o.officerName || o.name || 'Officer'},`,
        "",
        "You have been allocated for election duty.",
        "",
        `Officer ID: ${o.officerId || ""}`,
        `Designation: ${o.designation || ""}`,
        "",
        `Booth Number: ${b.boothNumber || ""}`,
        `Booth Name: ${b.boothName || ""}`,
        `Building: ${b.buildingName || ""}`,
        `Booth Locality: ${b.locality || ""}`,
        `Mandal: ${b.mandal || allocation.mandal || o.mandal || ""}`,
        "",
        "Please report as instructed by the Election Administration.",
        "",
        "Thank you.",
        "Election Administration",
    ].join("\n");
}

/**
 * Sends the polling-duty letter for ONE allocation. Returns
 * { status: 'sent' | 'failed' | 'skipped', reason?, messageId? }.
 */
async function sendAllocationLetter(allocation) {
    const officer = allocation.officer;
    if (!officer || !officer.email) {
        return { status: "skipped", reason: "no email address" };
    }
    try {
        const messageId = await sendGmailMessage({
            to: officer.email,
            subject: `Polling Duty Allocation - Booth ${
                allocation.booth?.boothNumber || ""
            } ${allocation.booth?.boothName || ""}`.trim(),
            text: buildAllocationLetter(allocation),
        });
        return { status: "sent", messageId };
    } catch (error) {
        return { status: "failed", reason: error.message };
    }
}

// POST /api/mail/send - free-form e-mail through the connected Gmail account.
app.post("/api/mail/send", async (req, res) => {
    try {
        const { to, subject, text } = req.body;
        const messageId = await sendGmailMessage({ to, subject, text });
        res.status(200).json({
            success: true,
            message: "Email sent successfully",
            messageId,
        });
    } catch (error) {
        console.error("[MAIL] Failed to send email:", error.message);
        mailErrorResponse(res, error);
    }
});

// POST /api/mail/allocation/:allocationId - polling-duty letter for one allocation.
app.post("/api/mail/allocation/:allocationId", async (req, res) => {
    try {
        const allocation = await Allocation.findById(req.params.allocationId)
            .populate("officer")
            .populate("booth");

        if (!allocation) {
            return res.status(404).json({ success: false, message: "Allocation not found" });
        }
        if (allocation.status !== "ALLOCATED") {
            return res.status(400).json({
                success: false,
                message: "Mail can only be sent for an ALLOCATED allocation",
            });
        }

        const result = await sendAllocationLetter(allocation);

        if (result.status === "skipped") {
            return res.status(400).json({
                success: false,
                message: "Officer has no e-mail address on record",
            });
        }
        if (result.status === "failed") {
            return res.status(500).json({ success: false, message: result.reason });
        }

        res.status(200).json({
            success: true,
            message: `E-mail sent to ${allocation.officer.email}`,
            messageId: result.messageId,
        });
    } catch (error) {
        console.error("[MAIL] Allocation letter failed:", error.message);
        mailErrorResponse(res, error);
    }
});

// POST /api/mail/allocation - bulk polling-duty letters.
// Body: { "allocationIds": [...] } (max 100) or { "mandal": "..." }.
app.post("/api/mail/allocation", async (req, res) => {
    try {
        const { allocationIds, mandal } = req.body || {};

        const filter = { status: "ALLOCATED" };
        if (Array.isArray(allocationIds) && allocationIds.length) {
            if (allocationIds.length > 100) {
                return res.status(400).json({
                    success: false,
                    message: "Maximum 100 allocations per request",
                });
            }
            filter._id = { $in: allocationIds };
        } else if (mandal) {
            const re = new RegExp(`^${String(mandal).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i");
            filter.$or = [{ mandal: re }];
        }

        const allocations = await Allocation.find(filter)
            .populate("officer")
            .populate("booth")
            .limit(100);

        if (!allocations.length) {
            return res.status(404).json({
                success: false,
                message: "No ALLOCATED allocations match the request",
            });
        }

        let sent = 0;
        let failed = 0;
        let skipped = 0;
        const failures = [];

        for (const allocation of allocations) {
            const result = await sendAllocationLetter(allocation);
            if (result.status === "sent") {
                sent += 1;
            } else if (result.status === "skipped") {
                skipped += 1;
            } else {
                failed += 1;
                failures.push({
                    allocationId: allocation._id,
                    officer: allocation.officer?.officerName || "",
                    reason: result.reason,
                });
            }
        }

        res.status(200).json({
            success: true,
            message: `Allocation letters processed: ${sent} sent, ${failed} failed, ${skipped} skipped (no e-mail address).`,
            data: { total: allocations.length, sent, failed, skipped, failures },
        });
    } catch (error) {
        console.error("[MAIL] Bulk allocation letters failed:", error.message);
        mailErrorResponse(res, error);
    }
});

// POST /api/mail/test - simple connectivity check for the Gmail connection.
app.post("/api/mail/test", async (req, res) => {
    try {
        const messageId = await sendGmailMessage({
            to: req.body?.to,
            subject: "Polling Officer - Gmail test",
            text: "This is a test e-mail from the Polling Officer Allocation System.",
        });
        res.status(200).json({
            success: true,
            message: "Test e-mail sent successfully",
            messageId,
        });
    } catch (error) {
        console.error("[MAIL] Test e-mail failed:", error.message);
        mailErrorResponse(res, error);
    }
});

// --------------------------- Error handling -----------------------------------
app.use(notFound);
app.use(errorHandler);



async function seedMainAdmin() {
  const bcrypt = require('bcryptjs');
  const countService = require('./services/countService');

  const username = (process.env.ADMIN_USERNAME || 'admin').toLowerCase();
  const password = process.env.ADMIN_PASSWORD || 'admin123';
  const production = process.env.NODE_ENV === 'production';

  const existing = await Admin.findOne({ username }).select('+password');
  if (!existing) {
    await Admin.create({
      username,
      password: await bcrypt.hash(password, 10),
      name: 'Main Admin',
      role: 'SUPER_ADMIN',
      district: process.env.ADMIN_DISTRICT || '',
      status: 'active',
    });
    console.log(`[AUTH] Created Main Admin account '${username}'`);
  } else if (!production) {
    const ok = await existing.comparePassword(password);
    if (!ok) {
      existing.password = await bcrypt.hash(password, 10);
      await existing.save();
      console.log(`[AUTH] Synced Main Admin password for '${username}'`);
    }
  }

  // Requirement A: remove ONLY demo/test auth accounts, never domain data.
  try {
    const removed = await Admin.deleteMany({ username: { $ne: username } });
    if (removed.deletedCount > 0) {
      console.log(`[AUTH] Removed ${removed.deletedCount} non-admin demo account(s)`);
    }
  } catch (error) {
    console.warn('[AUTH] Could not clean demo accounts:', error.message);
  }

  // Requirement B: booth counters are rebuilt from allocation documents.
  try {
    await countService.resyncAllBoothCounts();
    console.log('[BOOT] Booth counters resynced from ALLOCATED allocations');
  } catch (error) {
    console.warn('[BOOT] Could not resync booth counts:', error.message);
  }
}

const PORT = process.env.PORT || 5002;

(async function start() {
  await connectDB();
  await seedMainAdmin();

  app.listen(PORT,'0.0.0.0', () => {
    console.log(`[SERVER] Smart Polling Allocation API running on http://localhost:${PORT}`);
    console.log(`[SERVER] Swagger UI  : http://localhost:${PORT}/api-docs`);
    console.log(`[SERVER] OpenAPI JSON: http://localhost:${PORT}/api-docs.json`);
  });
})();