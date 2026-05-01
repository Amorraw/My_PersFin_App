import { Router } from "express";
import { Property } from "../models/Property";
import { Debt } from "../models/Debt";
import { requireLogin } from "../middleware/requireLogin";

const router = Router();
router.use(requireLogin);

async function withEquity(property: any, userId: any) {
  let mortgageBalance = 0;
  if (property.linkedMortgageDebtId) {
    const debt = await Debt.findOne({ _id: property.linkedMortgageDebtId, userId });
    if (debt) mortgageBalance = debt.currentBalance;
  }
  const obj = property.toObject ? property.toObject() : { ...property };
  return {
    ...obj,
    mortgageBalance,
    equity: obj.currentEstimatedValue - mortgageBalance,
    unrealizedGain: obj.currentEstimatedValue - obj.purchasePrice,
    unrealizedGainPercent:
      obj.purchasePrice > 0
        ? ((obj.currentEstimatedValue - obj.purchasePrice) / obj.purchasePrice) * 100
        : 0,
    isPrimaryResidence: obj.type === "primary-residence",
  };
}

/**
 * GET /properties
 */
router.get("/", async (req, res, next) => {
  try {
    const userId = (req.user as any)._id;
    const properties = await Property.find({ userId }).sort({ createdAt: -1 });
    const enriched = await Promise.all(properties.map((p) => withEquity(p, userId)));
    res.json({ properties: enriched });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /properties/summary
 */
router.get("/summary", async (req, res, next) => {
  try {
    const userId = (req.user as any)._id;
    const properties = await Property.find({ userId });
    const enriched = await Promise.all(properties.map((p) => withEquity(p, userId)));

    const totalValue    = enriched.reduce((s, p) => s + p.currentEstimatedValue, 0);
    const totalEquity   = enriched.reduce((s, p) => s + p.equity, 0);
    const totalMortgage = enriched.reduce((s, p) => s + p.mortgageBalance, 0);
    const totalGain     = enriched.reduce((s, p) => s + p.unrealizedGain, 0);

    res.json({ totalValue, totalEquity, totalMortgage, totalGain, count: properties.length, properties: enriched });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /properties/:id
 */
router.get("/:id", async (req, res, next) => {
  try {
    const userId = (req.user as any)._id;
    const property = await Property.findOne({ _id: req.params.id, userId });
    if (!property) return res.status(404).json({ message: "Property not found" });
    res.json(await withEquity(property, userId));
  } catch (err) {
    next(err);
  }
});

/**
 * POST /properties
 */
router.post("/", async (req, res, next) => {
  try {
    const userId = (req.user as any)._id;
    const {
      nickname, type, street, city, province, postalCode,
      purchasePrice, purchaseDate, currentEstimatedValue,
      lastValuationDate, linkedMortgageDebtId, annualPropertyTax, notes,
    } = req.body;

    if (!nickname || !type || !city || !province || purchasePrice === undefined || !purchaseDate || currentEstimatedValue === undefined) {
      return res.status(400).json({ message: "nickname, type, city, province, purchasePrice, purchaseDate, and currentEstimatedValue are required" });
    }

    const property = await Property.create({
      userId, nickname, type, street, city, province, postalCode,
      purchasePrice, purchaseDate, currentEstimatedValue,
      lastValuationDate: lastValuationDate ?? new Date(),
      linkedMortgageDebtId: linkedMortgageDebtId || undefined,
      annualPropertyTax, notes,
    });

    res.status(201).json(await withEquity(property, userId));
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /properties/:id
 */
router.put("/:id", async (req, res, next) => {
  try {
    const userId = (req.user as any)._id;
    const updates = req.body;

    // If value is being updated, stamp valuation date
    if (updates.currentEstimatedValue !== undefined && !updates.lastValuationDate) {
      updates.lastValuationDate = new Date();
    }

    const property = await Property.findOneAndUpdate(
      { _id: req.params.id, userId },
      updates,
      { new: true }
    );
    if (!property) return res.status(404).json({ message: "Property not found" });
    res.json(await withEquity(property, userId));
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /properties/:id
 */
router.delete("/:id", async (req, res, next) => {
  try {
    const userId = (req.user as any)._id;
    const property = await Property.findOneAndDelete({ _id: req.params.id, userId });
    if (!property) return res.status(404).json({ message: "Property not found" });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
