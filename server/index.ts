import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { ensurePaypalPlans } from './paypalService';
import { PaypalWebhookHandler } from './paypalWebhookHandler';

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
  await initPaypal();

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

  app.use((req, res, next) => {
    const start = Date.now();
    const path = req.path;
    let capturedJsonResponse: Record<string, any> | undefined = undefined;

    const originalResJson = res.json;
    res.json = function (bodyJson, ...args) {
      capturedJsonResponse = bodyJson;
      return originalResJson.apply(res, [bodyJson, ...args]);
    };

    res.on("finish", () => {
      const duration = Date.now() - start;
      if (path.startsWith("/api")) {
        let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
        if (capturedJsonResponse) {
          logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
        }

        log(logLine);
      }
    });

    next();
  });

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
    },
  );
})();
