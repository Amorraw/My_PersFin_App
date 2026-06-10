import express from "express";
import { requireAuth } from "../middleware/requireLogin";
import { RRSPAccount } from "../models/RRSPAccount";
import { TFSAAccount } from "../models/TFSAAccount";
import { FHSAAccount } from "../models/FHSAAccount";
import { RESPAccount } from "../models/RESPAccount";
import { RRIFAccount } from "../models/RRIFAccount";
import { LIFAccount } from "../models/LIFAccount";
import { LIRAAccount } from "../models/LIRAAccount";
import { RDSPAccount } from "../models/RDSPAccount";
import { NonRegisteredAccount } from "../models/NonRegisteredAccount";
import { CryptoAccount } from "../models/CryptoAccount";
import { CorporateAccount } from "../models/CorporateAccount";
import {
  calculateRRSPContributionRoom,
  calculateTFSAContributionRoom,
  calculateRRIFMinimumWithdrawal,
  getAccountTypeDescription,
  CONTRIBUTION_LIMITS_2024,
} from "../utils/accountRules";

const router = express.Router();
router.use(requireAuth);

// ============ RRSP Account Routes ============
router.post("/rrsp/create", async (req, res) => {
  try {
    const { accountName, isAccountOwner } = req.body;
    const userId = (req.user as any).id;
    const account = new RRSPAccount({
      userId,
      accountName,
      isAccountOwner: isAccountOwner ?? true,
    });
    await account.save();
    res.json(account);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.get("/rrsp", async (req, res) => {
  try {
    const userId = (req.user as any).id;
    const accounts = await RRSPAccount.find({ userId });
    res.json(accounts);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.get("/rrsp/:id", async (req, res) => {
  try {
    const userId = (req.user as any).id;
    const account = await RRSPAccount.findOne({ _id: req.params.id, userId });
    if (!account) {
      return res.status(404).json({ error: "Account not found" });
    }
    res.json(account);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.post("/rrsp/:id/contribution", async (req, res) => {
  try {
    const { amount, year } = req.body;
    const userId = (req.user as any).id;
    const account = await RRSPAccount.findOne({ _id: req.params.id, userId });
    if (!account) {
      return res.status(404).json({ error: "Account not found" });
    }

    const availableRoom = calculateRRSPContributionRoom(
      100000, // Default assumed income
      account.currentYearUsed,
      "ON" // Default province
    );
    
    if (amount > availableRoom) {
      return res.status(400).json({ error: "Exceeds available contribution room" });
    }

    account.contributions.push({ year: year || new Date().getFullYear(), amount, date: new Date() });
    account.balance += amount;
    account.currentYearUsed += amount;
    await account.save();
    res.json(account);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ============ TFSA Account Routes ============
router.post("/tfsa/create", async (req, res) => {
  try {
    const { accountName } = req.body;
    const userId = (req.user as any).id;
    const account = new TFSAAccount({
      userId,
      accountName,
    });
    await account.save();
    res.json(account);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.get("/tfsa", async (req, res) => {
  try {
    const userId = (req.user as any).id;
    const accounts = await TFSAAccount.find({ userId });
    res.json(accounts);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ============ FHSA Account Routes ============
router.post("/fhsa/create", async (req, res) => {
  try {
    const { accountName } = req.body;
    const userId = (req.user as any).id;
    const account = new FHSAAccount({
      userId,
      accountName,
    });
    await account.save();
    res.json(account);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.get("/fhsa", async (req, res) => {
  try {
    const userId = (req.user as any).id;
    const accounts = await FHSAAccount.find({ userId });
    res.json(accounts);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ============ RESP Account Routes ============
router.post("/resp/create", async (req, res) => {
  try {
    const { accountName, beneficiaryName, beneficiaryBirthDate, beneficiarySIN } = req.body;
    const userId = (req.user as any).id;
    const account = new RESPAccount({
      userId,
      accountName,
      beneficiaryName,
      beneficiaryBirthDate,
      beneficiarySIN,
    });
    await account.save();
    res.json(account);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.get("/resp", async (req, res) => {
  try {
    const userId = (req.user as any).id;
    const accounts = await RESPAccount.find({ userId });
    res.json(accounts);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ============ RRIF Account Routes ============
router.post("/rrif/create", async (req, res) => {
  try {
    const { accountName, ownerAge } = req.body;
    if (ownerAge < 55) {
      return res.status(400).json({ error: "RRIF requires age 55 or older" });
    }
    const userId = (req.user as any).id;
    const account = new RRIFAccount({
      userId,
      accountName,
      ownerAge,
    });
    await account.save();
    res.json(account);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.get("/rrif", async (req, res) => {
  try {
    const userId = (req.user as any).id;
    const accounts = await RRIFAccount.find({ userId });
    res.json(accounts);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.post("/rrif/:id/minimum-withdrawal", async (req, res) => {
  try {
    const userId = (req.user as any).id;
    const account = await RRIFAccount.findOne({ _id: req.params.id, userId });
    if (!account) {
      return res.status(404).json({ error: "Account not found" });
    }

    const minWithdrawal = calculateRRIFMinimumWithdrawal(account.ownerAge, account.balance);
    res.json({ minimumWithdrawal: minWithdrawal, percentage: account.minimumWithdrawalPercentage });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ============ LIF Account Routes ============
router.post("/lif/create", async (req, res) => {
  try {
    const { accountName, ownerAge, provinceOfIssuance } = req.body;
    const userId = (req.user as any).id;
    const account = new LIFAccount({
      userId,
      accountName,
      ownerAge,
      provinceOfIssuance,
    });
    await account.save();
    res.json(account);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.get("/lif", async (req, res) => {
  try {
    const userId = (req.user as any).id;
    const accounts = await LIFAccount.find({ userId });
    res.json(accounts);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ============ LIRA Account Routes ============
router.post("/lira/create", async (req, res) => {
  try {
    const { accountName, provinceOfIssuance } = req.body;
    const userId = (req.user as any).id;
    const account = new LIRAAccount({
      userId,
      accountName,
      provinceOfIssuance,
    });
    await account.save();
    res.json(account);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.get("/lira", async (req, res) => {
  try {
    const userId = (req.user as any).id;
    const accounts = await LIRAAccount.find({ userId });
    res.json(accounts);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ============ RDSP Account Routes ============
router.post("/rdsp/create", async (req, res) => {
  try {
    const {
      accountName,
      beneficiaryName,
      beneficiaryBirthDate,
      beneficiarySIN,
      designatedResponsible,
    } = req.body;
    const userId = (req.user as any).id;

    // Calculate beneficiary age
    const birthDate = new Date(beneficiaryBirthDate);
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (
      monthDiff < 0 ||
      (monthDiff === 0 && today.getDate() < birthDate.getDate())
    ) {
      age--;
    }

    const account = new RDSPAccount({
      userId,
      accountName,
      beneficiaryName,
      beneficiaryBirthDate: new Date(beneficiaryBirthDate),
      beneficiarySIN,
      beneficiaryAge: age,
      designatedResponsible,
    });
    await account.save();
    res.json(account);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.get("/rdsp", async (req, res) => {
  try {
    const userId = (req.user as any).id;
    const accounts = await RDSPAccount.find({ userId });
    res.json(accounts);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.get("/rdsp/:id", async (req, res) => {
  try {
    const userId = (req.user as any).id;
    const account = await RDSPAccount.findOne({ _id: req.params.id, userId });
    if (!account) {
      return res.status(404).json({ error: "Account not found" });
    }
    res.json(account);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.post("/rdsp/:id/contribution", async (req, res) => {
  try {
    const { amount, type } = req.body;
    const userId = (req.user as any).id;
    const account = await RDSPAccount.findOne({ _id: req.params.id, userId });

    if (!account) {
      return res.status(404).json({ error: "Account not found" });
    }

    // 2024 RDSP annual contribution limit: $2,500
    if (account.currentYearContributions + amount > 2500) {
      return res.status(400).json({
        error: "Exceeds annual contribution limit of $2,500",
        currentYear: account.currentYearContributions,
        remaining: 2500 - account.currentYearContributions,
      });
    }

    // Lifetime contribution limit: $200,000
    if (account.balance + amount > 200000) {
      return res.status(400).json({
        error: "Exceeds lifetime contribution limit of $200,000",
        current: account.balance,
        limit: 200000,
      });
    }

    account.contributions.push({
      year: new Date().getFullYear(),
      amount,
      date: new Date(),
      type: type || "personal",
    });
    account.currentYearContributions += amount;
    account.balance += amount;
    await account.save();

    res.json({
      message: "Contribution added successfully",
      account,
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.post("/rdsp/:id/grant", async (req, res) => {
  try {
    const { amount, grantType } = req.body;
    const userId = (req.user as any).id;
    const account = await RDSPAccount.findOne({ _id: req.params.id, userId });

    if (!account) {
      return res.status(404).json({ error: "Account not found" });
    }

    // CCESG: up to $3,500/year (lifetime limit: $80,000)
    // CEBS: up to $1,500/year (lifetime limit: $90,000)
    const grantLimits = {
      ccesg: { annual: 3500, lifetime: 80000 },
      cebs: { annual: 1500, lifetime: 90000 },
    };

    const limits = grantLimits[grantType as keyof typeof grantLimits];
    if (!limits) {
      return res.status(400).json({ error: "Invalid grant type" });
    }

    if (amount > limits.annual) {
      return res.status(400).json({
        error: `Exceeds annual ${grantType.toUpperCase()} limit of $${limits.annual}`,
      });
    }

    const grantTracker =
      grantType === "ccesg" ? account.grantRoom : account.bondRoom;
    if (grantTracker - amount < 0) {
      return res.status(400).json({
        error: `Exceeds lifetime ${grantType.toUpperCase()} limit of $${limits.lifetime}`,
        remaining: grantTracker,
      });
    }

    account.grants.push({
      year: new Date().getFullYear(),
      amount,
      date: new Date(),
      grantType: grantType as "ccesg" | "cesg",
    });

    if (grantType === "ccesg") {
      account.grantRoom -= amount;
    }

    account.balance += amount;
    await account.save();

    res.json({
      message: `${grantType.toUpperCase()} grant added successfully`,
      account,
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ============ Non-Registered Account Routes ============
router.post("/non-registered/create", async (req, res) => {
  try {
    const { accountName } = req.body;
    const userId = (req.user as any).id;
    const account = new NonRegisteredAccount({
      userId,
      accountName,
    });
    await account.save();
    res.json(account);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.get("/non-registered", async (req, res) => {
  try {
    const userId = (req.user as any).id;
    const accounts = await NonRegisteredAccount.find({ userId });
    res.json(accounts);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ============ Crypto Account Routes ============
router.post("/crypto/create", async (req, res) => {
  try {
    const { accountName, exchange } = req.body;
    const userId = (req.user as any).id;
    const account = new CryptoAccount({
      userId,
      accountName,
      exchange,
    });
    await account.save();
    res.json(account);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.get("/crypto", async (req, res) => {
  try {
    const userId = (req.user as any).id;
    const accounts = await CryptoAccount.find({ userId });
    res.json(accounts);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ============ Corporate Account Routes ============
router.post("/corporate/create", async (req, res) => {
  try {
    const { accountName, businessName, businessType, fiscalYearEnd } = req.body;
    const userId = (req.user as any).id;
    const account = new CorporateAccount({
      userId,
      accountName,
      businessName,
      businessType,
      fiscalYearEnd,
    });
    await account.save();
    res.json(account);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.get("/corporate", async (req, res) => {
  try {
    const userId = (req.user as any).id;
    const accounts = await CorporateAccount.find({ userId });
    res.json(accounts);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ============ Universal Account Routes ============
router.get("/all", async (req, res) => {
  try {
    const userId = (req.user as any).id;
    const [rrsp, tfsa, fhsa, resp, rrif, lif, lira, nonReg, crypto, corporate] = 
      await Promise.all([
        RRSPAccount.find({ userId }),
        TFSAAccount.find({ userId }),
        FHSAAccount.find({ userId }),
        RESPAccount.find({ userId }),
        RRIFAccount.find({ userId }),
        LIFAccount.find({ userId }),
        LIRAAccount.find({ userId }),
        NonRegisteredAccount.find({ userId }),
        CryptoAccount.find({ userId }),
        CorporateAccount.find({ userId }),
      ]);

    const allAccounts: Array<Record<string, unknown>> = [
      ...rrsp.map(a => ({ ...a.toObject(), type: "RRSP", balance: a.balance })),
      ...tfsa.map(a => ({ ...a.toObject(), type: "TFSA", balance: a.balance })),
      ...fhsa.map(a => ({ ...a.toObject(), type: "FHSA", balance: a.balance })),
      ...resp.map(a => ({ ...a.toObject(), type: "RESP", balance: a.balance })),
      ...rrif.map(a => ({ ...a.toObject(), type: "RRIF", balance: a.balance })),
      ...lif.map(a => ({ ...a.toObject(), type: "LIF", balance: a.balance })),
      ...lira.map(a => ({ ...a.toObject(), type: "LIRA", balance: a.balance })),
      ...nonReg.map(a => ({ ...a.toObject(), type: "NON_REGISTERED", balance: a.balance })),
      ...crypto.map(a => ({ ...a.toObject(), type: "CRYPTO", balance: a.totalInvestedAmount })),
      ...corporate.map(a => ({ ...a.toObject(), type: "CORPORATE", balance: a.balance })),
    ];

    const summary = {
      totalAccounts: allAccounts.length,
      byType: {
        RRSP: rrsp.length,
        TFSA: tfsa.length,
        FHSA: fhsa.length,
        RESP: resp.length,
        RRIF: rrif.length,
        LIF: lif.length,
        LIRA: lira.length,
        NON_REGISTERED: nonReg.length,
        CRYPTO: crypto.length,
        CORPORATE: corporate.length,
      },
      totalBalance: allAccounts.reduce((sum, a) => sum + ((a.balance as number) || 0), 0),
      accounts: allAccounts,
    };

    res.json(summary);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ============ Account Information Routes ============
router.get("/info/contribution-limits", (req, res) => {
  res.json(CONTRIBUTION_LIMITS_2024);
});

router.get("/info/account-types", (req, res) => {
  const types = [
    { type: "RRSP", description: getAccountTypeDescription("RRSP") },
    { type: "SPOUSAL_RRSP", description: getAccountTypeDescription("SPOUSAL_RRSP") },
    { type: "TFSA", description: getAccountTypeDescription("TFSA") },
    { type: "FHSA", description: getAccountTypeDescription("FHSA") },
    { type: "RESP", description: getAccountTypeDescription("RESP") },
    { type: "RRIF", description: getAccountTypeDescription("RRIF") },
    { type: "LIF", description: getAccountTypeDescription("LIF") },
    { type: "LIRA", description: getAccountTypeDescription("LIRA") },
    { type: "RDSP", description: getAccountTypeDescription("RDSP") },
    { type: "NON_REGISTERED", description: getAccountTypeDescription("NON_REGISTERED") },
    { type: "CRYPTO", description: getAccountTypeDescription("CRYPTO") },
    { type: "CORPORATE", description: getAccountTypeDescription("CORPORATE") },
  ];
  res.json(types);
});

export default router;
