import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { ensurePaypalPlans } from './paypalService';
import { PaypalWebhookHandler } from './paypalWebhookHandler';
import { backfillMediaAcls } from './mediaAclBackfill';
import { sweepOrphanedUploads } from './uploadSweep';
import { pool } from './db';

const app = express();
const httpServer = createServer(app);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

async function initPaypal() {
  if (!process.env.PAYPAL_CLIENT_ID || !process.env.PAYPAL_CLIENT_SECRET) {
    log('PAYPAL_CLIENT_ID/SECRET not set, skipping PayPal initialization', 'paypal');
    return;
  }

  try {
    log('Ensuring PayPal products & plans exist...', 'paypal');
    const plans = await ensurePaypalPlans();
    log(`PayPal plans ready: ${plans.map((p) => `${p.tier}=$${p.amount}`).join(', ')}`, 'paypal');
    if (!process.env.PAYPAL_WEBHOOK_ID) {
      log(
        'PAYPAL_WEBHOOK_ID not set — webhook signature verification disabled. Set it in production.',
        'paypal',
      );
    }
  } catch (error: any) {
    log(`Failed to initialize PayPal: ${error.message}`, 'paypal');
  }
}

(async () => {
  app.post(
    '/api/paypal/webhook',
    express.raw({ type: 'application/json' }),
    async (req, res) => {
      try {
        if (!Buffer.isBuffer(req.body)) {
          log('PAYPAL WEBHOOK ERROR: req.body is not a Buffer', 'paypal');
          return res.status(500).json({ error: 'Webhook processing error' });
        }

        const headers: Record<string, string> = {};
        for (const [k, v] of Object.entries(req.headers)) {
          if (typeof v === 'string') headers[k.toLowerCase()] = v;
          else if (Array.isArray(v)) headers[k.toLowerCase()] = v[0];
        }

        await PaypalWebhookHandler.processWebhook(req.body.toString('utf8'), headers);
        res.status(200).json({ received: true });
      } catch (error: any) {
        log(`Webhook error: ${error.message}`, 'paypal');
        res.status(400).json({ error: 'Webhook processing error' });
      }
    }
  );

  app.use(
    express.json({
      verify: (req, _res, buf) => {
        req.rawBody = buf;
      },
    }),
  );

  app.use(express.urlencoded({ extended: false }));

  // Request logging middleware.
  //
  // SECURITY: Only safe request metadata (method, path, status, duration) is
  // ever written to logs. Response bodies are NEVER captured or logged.
  // Several API routes return account secrets that must remain confidential:
  //   - POST /api/2fa/setup       → TOTP secret (one-time display only)
  //   - POST /api/password/set    → plaintext backup codes (one-time display)
  // Logging any response body would expose these secrets to anyone who can
  // read deployment logs, support archives, or copied log streams.
  app.use((req, res, next) => {
    const start = Date.now();
    const path = req.path;

    res.on("finish", () => {
      const duration = Date.now() - start;
      if (path.startsWith("/api")) {
        log(`${req.method} ${path} ${res.statusCode} in ${duration}ms`);
      }
    });

    next();
  });

  // Ensure the pending_uploads table exists. This table is added to the Drizzle
  // schema in shared/schema.ts; running CREATE TABLE IF NOT EXISTS here means
  // the table is available on any environment without a separate drizzle-kit push.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS pending_uploads (
      object_path TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      allowed_type_prefix TEXT NOT NULL,
      max_size_bytes INTEGER NOT NULL,
      issued_at BIGINT NOT NULL
    )
  `);

  await registerRoutes(httpServer, app);

  app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    console.error("Internal Server Error:", err);

    if (res.headersSent) {
      return next(err);
    }

    return res.status(status).json({ message });
  });

  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true,
    },
    () => {
      log(`serving on port ${port}`);
      // Seed PayPal products/plans in the background AFTER the server is already
      // accepting traffic. ensurePaypalPlans() makes blocking external API calls;
      // running it before listen() delayed readiness on every cold start and could
      // trip the platform health check, showing up as brief outages. It is
      // idempotent and only needs to finish before the first checkout, so it is
      // safe to run as a best-effort background job. initPaypal() catches its own
      // errors, so failures never affect server availability.
      initPaypal();
      // Run ACL backfill after startup to make previously public media objects
      // private. This is a background, best-effort job so failures do not affect
      // server availability.
      backfillMediaAcls().catch((err) => {
        log(`Media ACL backfill error: ${err?.message}`, "security");
      });
      // Sweep orphaned uploads on startup and every 6 hours. Unbound uploads
      // are unusable to the app; removing them stops the private bucket from
      // being used as an arbitrary file sink (the signed upload URL cannot
      // enforce size/type limits, so cleanup is the backstop).
      sweepOrphanedUploads().catch((err) => {
        log(`Upload sweep error: ${err?.message}`, "security");
      });
      // Run every 2 minutes so non-compliant/unbound uploads are cleaned up
      // quickly and cannot persist in the bucket as a file sink.
      const sweepTimer = setInterval(() => {
        sweepOrphanedUploads().catch((err) => {
          log(`Upload sweep error: ${err?.message}`, "security");
        });
      }, 2 * 60 * 1000);
      sweepTimer.unref();
    },
  );
})();
