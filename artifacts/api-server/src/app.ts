import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import { clerkMiddleware } from "@clerk/express";
import { publishableKeyFromHost } from "@clerk/shared/keys";
import {
  CLERK_PROXY_PATH,
  clerkProxyMiddleware,
  getClerkProxyHost,
} from "./middlewares/clerkProxyMiddleware";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());

// CORS: in production restrict to known domains; dev allows any origin.
// Use anchored suffix checks to prevent subdomain spoofing attacks.
const SAFE_ORIGINS = /(?:^|\.)(replit\.dev|replit\.app)$/;

const allowedOrigins = process.env.REPLIT_DOMAINS
  ? process.env.REPLIT_DOMAINS.split(",").flatMap(d => [
      `https://${d.trim()}`,
      `https://${d.trim().replace(/^00-/, "")}`,
    ])
  : [];

app.use(
  cors({
    credentials: true,
    origin(origin, callback) {
      if (!origin || process.env.NODE_ENV !== "production") {
        return callback(null, true);
      }
      try {
        const host = new URL(origin).hostname;
        if (allowedOrigins.some(o => origin.startsWith(o)) || SAFE_ORIGINS.test(host)) {
          return callback(null, true);
        }
      } catch {
        // malformed origin — fall through to deny
      }
      callback(new Error(`CORS: origin ${origin} not allowed`));
    },
  }),
);

app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));

app.use(
  clerkMiddleware((req) => ({
    publishableKey: publishableKeyFromHost(
      getClerkProxyHost(req) ?? "",
      process.env.CLERK_PUBLISHABLE_KEY,
    ),
  })),
);

app.use("/api", router);

interface HttpError extends Error {
  status?: number;
  statusCode?: number;
}

app.use((err: HttpError, req: Request, res: Response, _next: NextFunction) => {
  req.log?.error({ err }, "Unhandled error");
  const status = err.status ?? err.statusCode ?? 500;
  res.status(status).json({
    error: process.env.NODE_ENV === "production" ? "Internal server error" : err.message,
  });
});

export default app;
