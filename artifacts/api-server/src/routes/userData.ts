import { Router } from "express";
import { getAuth } from "@clerk/express";
import { db, userDataTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router = Router();

function requireAuth(req: any, res: any, next: any) {
  const auth = getAuth(req);
  const userId = auth?.userId;
  if (!userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  req.userId = userId;
  next();
}

router.get("/data", requireAuth, async (req: any, res: any) => {
  try {
    const rows = await db
      .select()
      .from(userDataTable)
      .where(eq(userDataTable.userId, req.userId))
      .limit(1);
    if (!rows[0]) {
      return res.json({ data: {} });
    }
    const parsed = JSON.parse(rows[0].data || "{}");
    res.json({ data: parsed });
  } catch (err) {
    req.log.error(err, "Failed to get user data");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/data", requireAuth, async (req: any, res: any) => {
  try {
    const { data } = req.body;
    const serialized = JSON.stringify(data ?? {});
    await db
      .insert(userDataTable)
      .values({
        userId: req.userId,
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
