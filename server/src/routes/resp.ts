// RESP routes: CRUD for education savings plans with per-beneficiary CESG room tracking

import { Router, Request, Response } from "express";
import { RESP, IRESP, IRESPContribution } from "../models/RESP";
import { requireAuth } from "../middleware/requireLogin";

const router = Router();
router.use(requireAuth);

const LIFETIME_CONTRIBUTION_LIMIT = 50_000;
const CESG_RATE                   = 0.20;
const CESG_ELIGIBLE_PER_YEAR      = 2_500;
const MAX_CESG_PER_YEAR           = 500;
const MAX_CESG_LIFETIME           = 7_200;

/**
 * Compute per-beneficiary CESG stats from a flat contribution list.
 * CESG = 20% on first $2,500 contributed per beneficiary per year,
 *        capped at $500/yr and $7,200 lifetime per beneficiary.
 */
function beneficiarySummary(beneficiaryName: string, contributions: IRESPContribution[]) {
  const mine = contributions.filter(c => c.beneficiaryName === beneficiaryName);

  const byYear: Record<number, number> = {};
  let totalContributed = 0;
  let totalCesg        = 0;

  for (const c of mine) {
    byYear[c.year] = (byYear[c.year] || 0) + c.amount;
    totalContributed += c.amount;
    totalCesg        += c.cesgReceived;
  }

  // Theoretical CESG based on contributions (for validation / display)
  let theoreticalCesg = 0;
  for (const yr of Object.keys(byYear)) {
    const eligible     = Math.min(Number(byYear[Number(yr)]), CESG_ELIGIBLE_PER_YEAR);
    const yearCesg     = Math.min(eligible * CESG_RATE, MAX_CESG_PER_YEAR, MAX_CESG_LIFETIME - theoreticalCesg);
    theoreticalCesg   += Math.max(0, yearCesg);
  }

  return {
    beneficiaryName,
    totalContributed:     Math.round(totalContributed * 100) / 100,
    totalCesgReceived:    Math.round(totalCesg * 100) / 100,
    remainingCesgRoom:    Math.round(Math.max(0, MAX_CESG_LIFETIME - totalCesg) * 100) / 100,
    remainingContribRoom: Math.round(Math.max(0, LIFETIME_CONTRIBUTION_LIMIT - totalContributed) * 100) / 100,
    currentYearContrib:   Math.round((byYear[new Date().getFullYear()] || 0) * 100) / 100,
    currentYearCesgRoom:  Math.round(Math.min(
      MAX_CESG_PER_YEAR,
      Math.max(0, MAX_CESG_LIFETIME - totalCesg),
      Math.max(0, CESG_ELIGIBLE_PER_YEAR - (byYear[new Date().getFullYear()] || 0)) * CESG_RATE
    ) * 100) / 100,
  };
}

// GET / — list all RESP plans for the user
router.get("/", async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any).id;
    const plans  = await RESP.find({ userId }).sort({ createdAt: 1 });
    return res.json(plans);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error" });
  }
});

// GET /summary — aggregate RESP totals and CESG room per beneficiary across all plans
router.get("/summary", async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any).id;
    const plans  = await RESP.find({ userId });

    const totalBalance   = plans.reduce((s, p) => s + p.currentBalance, 0);
    const allContributions: IRESPContribution[] = plans.flatMap(p => p.contributions as IRESPContribution[]);

    const totalContributed  = allContributions.reduce((s, c) => s + c.amount, 0);
    const totalCesgReceived = allContributions.reduce((s, c) => s + c.cesgReceived, 0);

    // Per-beneficiary summaries across all plans
    const beneficiaryNames = Array.from(new Set(allContributions.map(c => c.beneficiaryName)));
    const byBeneficiary    = beneficiaryNames.map(name => beneficiarySummary(name, allContributions));

    return res.json({
      totalPlans:         plans.length,
      totalBalance:       Math.round(totalBalance * 100) / 100,
      totalContributed:   Math.round(totalContributed * 100) / 100,
      totalCesgReceived:  Math.round(totalCesgReceived * 100) / 100,
      lifetimeLimit:      LIFETIME_CONTRIBUTION_LIMIT,
      maxCesgLifetime:    MAX_CESG_LIFETIME,
      byBeneficiary,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error" });
  }
});

// POST / — create a new RESP plan with beneficiaries
router.post("/", async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any).id;
    const { planType, institution, accountName, beneficiaries, currentBalance, notes } = req.body;

    if (!planType || !institution || !accountName || !beneficiaries?.length) {
      return res.status(400).json({ message: "planType, institution, accountName, and beneficiaries are required" });
    }

    const plan = await RESP.create({
      userId,
      planType,
      institution,
      accountName,
      beneficiaries,
      currentBalance: Number(currentBalance) || 0,
      contributions: [],
      notes,
    });
    return res.status(201).json(plan);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error" });
  }
});

// PUT /:id — update RESP plan details
router.put("/:id", async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any).id;
    const { planType, institution, accountName, beneficiaries, currentBalance, notes } = req.body;

    const plan = await RESP.findOneAndUpdate(
      { _id: req.params.id, userId },
      { planType, institution, accountName, beneficiaries, currentBalance: Number(currentBalance), notes },
      { new: true }
    );
    if (!plan) return res.status(404).json({ message: "Not found" });
    return res.json(plan);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error" });
  }
});

// DELETE /:id — remove a RESP plan by ID
router.delete("/:id", async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any).id;
    const plan   = await RESP.findOneAndDelete({ _id: req.params.id, userId });
    if (!plan) return res.status(404).json({ message: "Not found" });
    return res.json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error" });
  }
});

// POST /:id/contributions — add a contribution with CESG amount for a named beneficiary
router.post("/:id/contributions", async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any).id;
    const plan   = await RESP.findOne({ _id: req.params.id, userId });
    if (!plan) return res.status(404).json({ message: "Not found" });

    const { year, amount, beneficiaryName, cesgReceived, date, note } = req.body;
    if (!year || !amount || !beneficiaryName || !date) {
      return res.status(400).json({ message: "year, amount, beneficiaryName, and date are required" });
    }

    plan.contributions.push({
      year:            Number(year),
      amount:          Number(amount),
      beneficiaryName,
      cesgReceived:    Number(cesgReceived) || 0,
      date:            new Date(date),
      note,
    });
    await plan.save();
    return res.json(plan);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error" });
  }
});

// DELETE /:id/contributions/:cid — remove a specific contribution from a RESP plan
router.delete("/:id/contributions/:cid", async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any).id;
    const plan   = await RESP.findOne({ _id: req.params.id, userId });
    if (!plan) return res.status(404).json({ message: "Not found" });

    plan.contributions = plan.contributions.filter(
      c => c._id?.toString() !== req.params.cid
    );
    await plan.save();
    return res.json(plan);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error" });
  }
});

export default router;
