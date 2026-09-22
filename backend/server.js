
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require("fs");
const { google } = require("googleapis");

const connectDB = require('./config/db');
const Admin = require('./models/Admin');

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

app.post("/api/mail/send", async (req, res) => {

    try {

        const {
            to,
            subject,
            text
        } = req.body;


        // ----------------------------------------------------
        // Validate request
        // ----------------------------------------------------

        if (!to) {

            return res.status(400).json({
                success: false,
                message: "Missing 'to'"
            });
        }


        if (!subject) {

            return res.status(400).json({
                success: false,
                message: "Missing 'subject'"
            });
        }


        if (!text) {

            return res.status(400).json({
                success: false,
                message: "Missing 'text'"
            });
        }


        // ----------------------------------------------------
        // Check authentication
        // ----------------------------------------------------

        const credentials =
            oauth2Client.credentials;


        console.log("[MAIL] Credentials:", {

            access_token:
                !!credentials.access_token,

            refresh_token:
                !!credentials.refresh_token,

            expiry_date:
                credentials.expiry_date
        });


        if (
            !credentials.access_token &&
            !credentials.refresh_token
        ) {

            return res.status(401).json({

                success: false,

                message:
                    "Google account is not authenticated",

                auth:
                    `http://localhost:${PORT}/auth/google`
            });
        }


        // ----------------------------------------------------
        // Gmail API
        // ----------------------------------------------------

        const gmail = google.gmail({

            version: "v1",

            auth: oauth2Client
        });


        // ----------------------------------------------------
        // Create MIME email
        // ----------------------------------------------------

        const message = [

            "MIME-Version: 1.0",

            `To: ${to}`,

            `Subject: ${subject}`,

            "Content-Type: text/plain; charset=UTF-8",

            "",

            text

        ].join("\r\n");


        // ----------------------------------------------------
        // Encode email
        // ----------------------------------------------------

        const raw = Buffer
            .from(message)
            .toString("base64url");


        // ----------------------------------------------------
        // Send through Gmail
        // ----------------------------------------------------

        console.log(
            `[MAIL] Sending email to ${to}`
        );


        const response =
            await gmail.users.messages.send({

                userId: "me",

                requestBody: {

                    raw
                }
            });


        console.log(
            "[MAIL] Email sent successfully:",
            response.data.id
        );


        // ----------------------------------------------------
        // Response
        // ----------------------------------------------------

        res.status(200).json({

            success: true,

            message:
                "Email sent successfully",

            messageId:
                response.data.id
        });


    } catch (error) {

        console.error(
            "[MAIL] Failed to send email:"
        );


        console.error(
            error.response?.data ||
            error.message
        );


        res.status(500).json({

            success: false,

            message:
                error.message,

            googleError:
                error.response?.data || null
        });
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

  app.listen(PORT, () => {
    console.log(`[SERVER] Smart Polling Allocation API running on http://localhost:${PORT}`);
    console.log(`[SERVER] Swagger UI  : http://localhost:${PORT}/api-docs`);
    console.log(`[SERVER] OpenAPI JSON: http://localhost:${PORT}/api-docs.json`);
  });
})();