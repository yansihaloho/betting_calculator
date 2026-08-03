import { Router, type Request, type Response, type NextFunction } from "express";
import { getAuth } from "@clerk/express";
import { db, userDataTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router = Router();

interface AuthedRequest extends Request {
  userId: string;
}

function requireAuth(req: Request, res: Response, next: NextFunction) {
  const auth = getAuth(req);
  const userId = auth?.userId;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  (req as AuthedRequest).userId = userId;
  next();
}

router.get("/data", requireAuth, async (req: Request, res: Response) => {
  const { userId } = req as AuthedRequest;
  try {
    const rows = await db
      .select()
      .from(userDataTable)
      .where(eq(userDataTable.userId, userId))
      .limit(1);
    if (!rows[0]) {
      res.json({ data: {} });
      return;
    }
    let parsed: Record<string, unknown> = {};
    try {
      parsed = JSON.parse(rows[0].data || "{}");
    } catch {
      req.log.warn({ userId }, "userData: stored JSON was invalid, returning empty");
    }
    res.json({ data: parsed });
  } catch (err) {
    req.log.error(err, "Failed to get user data");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/data", requireAuth, async (req: Request, res: Response) => {
  const { userId } = req as AuthedRequest;
  try {
    const { data } = req.body as { data?: unknown };
    const serialized = JSON.stringify(data ?? {});
    // Guard against excessively large payloads (>1.5 MB of JSON)
    if (serialized.length > 1_500_000) {
      res.status(413).json({ error: "Data too large — maximum 1.5 MB" });
      return;
    }
    await db
      .insert(userDataTable)
      .values({
        userId,
        data: serialized,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: userDataTable.userId,
        set: {
          data: serialized,
          updatedAt: new Date(),
        },
      });
    res.json({ ok: true });
  } catch (err) {
    req.log.error(err, "Failed to save user data");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
