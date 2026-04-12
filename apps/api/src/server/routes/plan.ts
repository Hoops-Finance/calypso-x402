import type { Request, Response } from "express";
import { PlanRequestSchema } from "@calypso/shared";
import { planFromRequest } from "../../ai/planner.js";
import { logger } from "../../logger.js";

export async function handlePlan(req: Request, res: Response): Promise<void> {
  const parsed = PlanRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid plan request", issues: parsed.error.issues });
    return;
  }
  try {
    const { plan, reasoning, model } = await planFromRequest(parsed.data);
    res.json({ ...plan, _ai: { reasoning, model } });
  } catch (err) {
    logger.error({ err }, "planner crashed");
    res.status(500).json({ error: "planner crashed" });
  }
}
