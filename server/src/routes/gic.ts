import { Router } from "express";
import { GIC } from "../models/GIC";
import { requireLogin } from "../middleware/requireLogin";

const router = Router();
router.use(requireLogin);

// CDIC member institutions (partial list of major ones)
const CDIC_MEMBERS = new Set([
  "TD Bank", "RBC", "BMO", "Scotiabank", "CIBC", "National Bank",
  "HSBC Canada", "Tangerine", "EQ Bank", "Simplii Financial",
  "Manulife Bank", "Canadian Western Bank", "Home Trust",
  "Laurentian Bank", "First Nations Bank", "Equitable Bank",
  "Presidents Choice Financial", "Bridgewater Bank", "Haventree Bank",
  "Concentra Bank", "ICICI Bank Canada", "Motus Bank",
]);

function calcMaturityValue(
  principal: number,
  rate: number,
  termMonths: number,
  isCompound: boolean,
  freq: string
): number {
  const years = termMonths / 12;
  if (!isCompound) return principal * (1 + (rate / 100) * years);
  const n =
    freq === "monthly" ? 12
    : freq === "quarterly" ? 4
    : freq === "semi-annually" ? 2
    : 1;
  return principal * Math.pow(1 + rate / 100 / n, n * years);
}

// GET / — list all GICs
router.get("/", async (req, res, next) => {
  try {
    const userId = (req.user as any)._id;
    const gics = await GIC.find({ userId }).sort({ maturityDate: 1 });
    res.json({ gics });
  } catch (err) {
    next(err);
  }
});

// GET /summary — totals + CDIC warnings + upcoming maturities
router.get("/summary", async (req, res, next) => {
  try {
    const userId = (req.user as any)._id;
    const today = new Date();
    const gics = await GIC.find({ userId, isCashedOut: false });

    const totalPrincipal = gics.reduce((s, g) => s + g.principal, 0);
    const totalMaturityValue = gics.reduce((s, g) => s + g.maturityValue, 0);
    const totalInterest = totalMaturityValue - totalPrincipal;

    // Group by issuer + CDIC category to check coverage
    const exposure: Record<string, Record<string, number>> = {};
    gics.forEach((g) => {
      if (!exposure[g.issuer]) exposure[g.issuer] = {};
      const cat =
        g.accountType === "non-registered" ? "deposits" : g.accountType;
      exposure[g.issuer][cat] = (exposure[g.issuer][cat] || 0) + g.principal;
    });

    const cdicWarnings: string[] = [];
    Object.entries(exposure).forEach(([issuer, categories]) => {
      if (!CDIC_MEMBERS.has(issuer)) return; // credit unions use provincial protection
      Object.entries(categories).forEach(([cat, amount]) => {
        if (amount > 100000) {
          cdicWarnings.push(
            `${issuer} — ${cat}: $${amount.toLocaleString()} exceeds the $100,000 CDIC limit by $${(amount - 100000).toLocaleString()}`
          );
        }
      });
    });

    // Upcoming maturities in next 90 days
    const cutoff = new Date(today);
    cutoff.setDate(cutoff.getDate() + 90);
    const upcomingMaturities = gics.filter(
      (g) => g.maturityDate >= today && g.maturityDate <= cutoff
    ).length;

    res.json({
      totalPrincipal,
      totalMaturityValue,
      totalInterest,
      count: gics.length,
      cdicExposure: exposure,
      cdicWarnings,
      upcomingMaturities,
    });
  } catch (err) {
    next(err);
  }
});

// POST / — create GIC
router.post("/", async (req, res, next) => {
  try {
    const userId = (req.user as any)._id;
    const {
      issuer, accountType, principal, interestRate, term,
      purchaseDate, isCompound, compoundFrequency, notes,
    } = req.body;

    const purchase = new Date(purchaseDate);
    const maturity = new Date(purchase);
    maturity.setMonth(maturity.getMonth() + Number(term));
    const maturityValue = calcMaturityValue(
      principal, interestRate, term, isCompound || false, compoundFrequency || "annually"
    );

    const gic = await GIC.create({
      userId, issuer, accountType, principal, interestRate, term,
      purchaseDate: purchase, maturityDate: maturity, maturityValue,
      isCompound: isCompound || false,
      compoundFrequency: compoundFrequency || "annually",
      notes,
    });
    res.status(201).json({ gic });
  } catch (err) {
    next(err);
  }
});

// PUT /:id — update GIC
router.put("/:id", async (req, res, next) => {
  try {
    const userId = (req.user as any)._id;
    const existing = await GIC.findOne({ _id: req.params.id, userId });
    if (!existing) return res.status(404).json({ message: "GIC not found" });

    const updates: any = { ...req.body };

    const p = updates.principal ?? existing.principal;
    const r = updates.interestRate ?? existing.interestRate;
    const t = updates.term ?? existing.term;
    const ic = updates.isCompound ?? existing.isCompound;
    const cf = updates.compoundFrequency ?? existing.compoundFrequency;
    const pd = updates.purchaseDate ? new Date(updates.purchaseDate) : existing.purchaseDate;

    const maturity = new Date(pd);
    maturity.setMonth(maturity.getMonth() + Number(t));
    updates.maturityDate = maturity;
    updates.maturityValue = calcMaturityValue(p, r, t, ic, cf);

    const gic = await GIC.findOneAndUpdate(
      { _id: req.params.id, userId },
      updates,
      { new: true }
    );
    res.json({ gic });
  } catch (err) {
    next(err);
  }
});

// DELETE /:id
router.delete("/:id", async (req, res, next) => {
  try {
    const userId = (req.user as any)._id;
    const gic = await GIC.findOneAndDelete({ _id: req.params.id, userId });
    if (!gic) return res.status(404).json({ message: "GIC not found" });
    res.json({ message: "Deleted" });
  } catch (err) {
    next(err);
  }
});

// POST /ladder — calculate optimal GIC ladder
router.post("/ladder", async (req, res, next) => {
  try {
    const { totalAmount, ladderYears = 5, ratesByTerm } = req.body;
    const defaultRates: Record<number, number> = { 1: 4.25, 2: 4.50, 3: 4.70, 4: 4.80, 5: 4.90 };
    const rates = ratesByTerm || defaultRates;
    const amountPerRung = totalAmount / ladderYears;

    const rungs = Array.from({ length: ladderYears }, (_, i) => {
      const term = i + 1;
      const rate = rates[term] ?? 4.25;
      const maturityValue = amountPerRung * (1 + (rate / 100) * term);
      return {
        term,
        principal: amountPerRung,
        rate,
        maturityValue,
        interest: maturityValue - amountPerRung,
        maturityYear: new Date().getFullYear() + term,
      };
    });

    const totalInterest = rungs.reduce((s, r) => s + r.interest, 0);
    const blendedRate = rungs.reduce((s, r) => s + r.rate, 0) / ladderYears;

    res.json({ rungs, totalInterest, blendedRate, amountPerRung });
  } catch (err) {
    next(err);
  }
});

export default router;
