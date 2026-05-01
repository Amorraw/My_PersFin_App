import { Router } from "express";
import { requireLogin } from "../middleware/requireLogin";

const router = Router();
router.use(requireLogin);

// ── 2024 CPP Disability ──
const CPP_DISABILITY = {
  flatRate: 583.32,
  maxMonthly: 1606.78,
  avgMonthly: 1100.77,
};

// ── EI Sickness 2024 ──
const EI_SICKNESS = {
  replacementRate: 0.55,
  maxInsurableEarnings: 63200,
  maxWeeklyBenefit: 668,
  maxWeeks: 15,
};

// ── Provincial supplementary health coverage gaps ──
const PROVINCIAL_GAPS: Record<string, Record<string, string>> = {
  AB: {
    drugs: "Seniors 65+ and low-income only — no universal drug plan for working-age adults",
    vision: "Not covered for ages 19–64",
    dental: "Not covered",
    physio: "Not covered",
    chiro: "Not covered",
    mental: "Not covered (AHS covers psychiatry, not psychology)",
    ambulance: "Not covered",
  },
  BC: {
    drugs: "PharmaCare — income-based deductible; catastrophic coverage cap",
    vision: "Ages 0–18 and 65+ covered; ages 19–64 not covered",
    dental: "Not covered",
    physio: "Some coverage for specific conditions (e.g., post-surgery)",
    chiro: "10 visits/year partially covered",
    mental: "Not covered",
    ambulance: "$80 copay for ground ambulance",
  },
  MB: {
    drugs: "Pharmacare — income-based deductible",
    vision: "Not covered",
    dental: "Not covered",
    physio: "Not covered",
    chiro: "Not covered",
    mental: "Not covered",
    ambulance: "Covered",
  },
  NB: {
    drugs: "NB Drug Plan — low income and seniors",
    vision: "Not covered",
    dental: "Not covered",
    physio: "Not covered",
    chiro: "Not covered",
    mental: "Not covered",
    ambulance: "Not covered",
  },
  NL: {
    drugs: "NL Prescription Drug Program — income-based",
    vision: "Not covered",
    dental: "Not covered for adults",
    physio: "Not covered",
    chiro: "Not covered",
    mental: "Not covered",
    ambulance: "Covered",
  },
  NS: {
    drugs: "NS Pharmacare — seniors and some low-income",
    vision: "Not covered",
    dental: "Not covered",
    physio: "Not covered",
    chiro: "Not covered",
    mental: "Not covered",
    ambulance: "Covered",
  },
  NT: {
    drugs: "Extended Health Benefits — income tested",
    vision: "Not covered for most working-age adults",
    dental: "Some basic coverage",
    physio: "Not covered",
    chiro: "Not covered",
    mental: "Limited",
    ambulance: "Covered",
  },
  NU: {
    drugs: "Covered under territorial health plan",
    vision: "Covered",
    dental: "Basic dental covered",
    physio: "Covered",
    chiro: "Covered",
    mental: "Limited",
    ambulance: "Covered",
  },
  ON: {
    drugs: "ODB (Ontario Drug Benefit) — seniors 65+, social assistance, home care; no universal plan for working-age adults",
    vision: "OHIP covers ages 0–19 and 65+; ages 20–64 not covered",
    dental: "Not covered under OHIP",
    physio: "Not covered outside hospital setting",
    chiro: "Not covered",
    mental: "OHIP covers psychiatry; psychology is not covered",
    ambulance: "$45 copay per ground ambulance call",
  },
  PE: {
    drugs: "PEI Pharmacare — income-tested",
    vision: "Not covered for working-age adults",
    dental: "Not covered",
    physio: "Not covered",
    chiro: "Not covered",
    mental: "Not covered",
    ambulance: "Covered",
  },
  QC: {
    drugs: "RAMQ — universal drug plan; Quebecers without employer plan must enroll in RAMQ",
    vision: "Not covered",
    dental: "Not covered",
    physio: "Some hospital coverage only",
    chiro: "Not covered",
    mental: "Psychologist covered in limited RAMQ cases",
    ambulance: "$125 copay",
  },
  SK: {
    drugs: "SK Drug Plan — deductible-based, income-tested",
    vision: "Not covered for working-age adults",
    dental: "Not covered",
    physio: "Not covered",
    chiro: "Not covered",
    mental: "Not covered",
    ambulance: "Covered",
  },
  YT: {
    drugs: "Extended Health Benefits — income tested",
    vision: "Partially covered",
    dental: "Some coverage",
    physio: "Covered",
    chiro: "Covered",
    mental: "Limited",
    ambulance: "Covered",
  },
};

// ── POST /insurance/life-needs — DIME method ──
router.post("/life-needs", (req, res, next) => {
  try {
    const {
      debts = 0,
      annualIncome = 0,
      incomeReplacementYears = 10,
      mortgageBalance = 0,
      childrenCount = 0,
      educationCostPerChild = 50000,
      groupLifeInsurance = 0,
      existingPolicies = 0,
      age = 35,
      isSmoker = false,
    } = req.body;

    const D = Number(debts);
    const I = Number(annualIncome) * Number(incomeReplacementYears);
    const M = Number(mortgageBalance);
    const E = Number(childrenCount) * Number(educationCostPerChild);
    const totalNeed = D + I + M + E;
    const existingCoverage = Number(groupLifeInsurance) + Number(existingPolicies);
    const coverageGap = Math.max(0, totalNeed - existingCoverage);

    // Approximate monthly premiums per $100K coverage (2024 CAD, non-smoker, standard health)
    const smokerMult = isSmoker ? 2.5 : 1;
    const ageGroup =
      age < 35 ? 30 : age < 45 ? 40 : age < 55 ? 50 : 60;

    const baseRates: Record<number, Record<string, number>> = {
      30: { "10yr": 7.5,  "20yr": 11,  "30yr": 16 },
      40: { "10yr": 14,   "20yr": 22,  "30yr": 38 },
      50: { "10yr": 40,   "20yr": 72,  "30yr": 0  },
      60: { "10yr": 110,  "20yr": 0,   "30yr": 0  },
    };

    const rates = baseRates[ageGroup];
    const mult = (coverageGap / 100000) * smokerMult;

    const termEstimates: Record<string, any> = {};
    (["10yr", "20yr", "30yr"] as const).forEach((term) => {
      if (rates[term] > 0 && coverageGap > 0) {
        const yrs = parseInt(term);
        termEstimates[term] = {
          monthly: rates[term] * mult,
          annualCost: rates[term] * mult * 12,
          lifetimeCost: rates[term] * mult * 12 * yrs,
        };
      }
    });

    if (coverageGap > 0 && rates["20yr"] > 0) {
      termEstimates["whole-life"] = {
        monthly: rates["20yr"] * mult * 6.5,
        note: "Whole life is typically 5–8× the cost of 20-year term for the same coverage amount, but builds tax-sheltered cash value.",
      };
    }

    res.json({
      dime: { D, I, M, E, totalNeed },
      existingCoverage,
      coverageGap,
      hasEnoughCoverage: coverageGap <= 0,
      termEstimates,
      notes: [
        "Premium estimates are illustrative — real rates depend on health history, underwriting, and the specific insurer.",
        "Group life through an employer is typically 1–2× salary and is NOT portable if you change jobs.",
        "For most Canadians, 20-year term covers the peak-need period (mortgage + child-rearing years) at the lowest cost.",
        "\"Buy term and invest the difference\" beats whole life for most middle-income Canadians; whole life is best for estate-planning at high net worth.",
      ],
    });
  } catch (err) {
    next(err);
  }
});

// ── POST /insurance/disability-gap ──
router.post("/disability-gap", (req, res, next) => {
  try {
    const {
      grossMonthlyIncome = 0,
      employerSTDWeeks = 0,
      employerSTDPercent = 0,
      employerLTDPercent = 0,
      employerLTDOffsetsCPP = true,
      hasPersonalPolicy = false,
      personalPolicyMonthly = 0,
      eligibleForCPPDisability = true,
      targetReplacementRate = 0.85,
    } = req.body;

    const monthly = Number(grossMonthlyIncome);
    const target = monthly * Number(targetReplacementRate);

    // EI sickness benefit
    const eiWeekly = Math.min(
      (monthly * 12 / 52) * EI_SICKNESS.replacementRate,
      EI_SICKNESS.maxWeeklyBenefit
    );
    const eiMonthly = eiWeekly * (52 / 12);

    // Employer STD
    const stdMonthly = monthly * (Number(employerSTDPercent) / 100);

    // Employer LTD (after STD)
    const ltdGross = monthly * (Number(employerLTDPercent) / 100);

    // CPP disability
    const cppMonthly = eligibleForCPPDisability ? CPP_DISABILITY.avgMonthly : 0;

    // If LTD plan has CPP offset clause, the insurer deducts CPP from LTD
    const ltdNet = employerLTDOffsetsCPP
      ? Math.max(0, ltdGross - cppMonthly)
      : ltdGross;
    const totalLTD = ltdNet + cppMonthly;

    const personalMonthly = hasPersonalPolicy ? Number(personalPolicyMonthly) : 0;
    const ltdGap = Math.max(0, target - totalLTD - personalMonthly);

    // Very rough personal disability premium: ~2% of annual benefit
    const estimatedPremium = ltdGap * 12 * 0.02 / 12;

    res.json({
      monthly,
      target,
      eiSickness: { eiMonthly, weeks: EI_SICKNESS.maxWeeks },
      shortTerm: {
        stdMonthly: Number(employerSTDPercent) > 0 ? stdMonthly : 0,
        weeks: Number(employerSTDWeeks),
      },
      longTerm: {
        ltdGross,
        cppMonthly,
        offsetsCPP: employerLTDOffsetsCPP,
        ltdNet,
        totalLTD,
        personalMonthly,
      },
      ltdGap,
      estimatedGapPremium: estimatedPremium,
      cppDisabilityInfo: CPP_DISABILITY,
      eiInfo: EI_SICKNESS,
    });
  } catch (err) {
    next(err);
  }
});

// ── POST /insurance/dental-eligibility — CDCP + provincial gaps ──
router.post("/dental-eligibility", (req, res, next) => {
  try {
    const {
      netFamilyIncome = 0,
      hasPrivateDentalInsurance = false,
      age = 35,
      hasDisability = false,
      province = "ON",
    } = req.body;

    const income = Number(netFamilyIncome);
    const prov = String(province).toUpperCase();

    let cdcpEligible = false;
    let cdcpCoverageRate = 0;
    let cdcpPhase = "";
    const cdcpNotes: string[] = [];

    if (hasPrivateDentalInsurance) {
      cdcpNotes.push("You have private dental insurance — you are not eligible for the CDCP.");
    } else if (income >= 90000) {
      cdcpNotes.push("Net family income ≥ $90,000 — not eligible for the CDCP.");
    } else {
      cdcpEligible = true;
      cdcpCoverageRate = income < 70000 ? 100 : income < 80000 ? 80 : 60;

      if (age < 12) {
        cdcpPhase = "Phase 1 (2023) — Children under 12";
      } else if (age >= 65 || hasDisability) {
        cdcpPhase = "Phase 2 (2024) — Seniors 65+ and persons with disabilities";
      } else {
        cdcpPhase = "Phase 3 (2025) — All remaining eligible Canadians";
      }

      cdcpNotes.push(
        `Coverage rate: ${cdcpCoverageRate}% of eligible fees (net family income $${income.toLocaleString()})`,
        "Eligible services: diagnostic, preventive, restorative, endodontic, periodontic, oral surgery, prosthodontics",
        "Register at canada.ca/dental or through My CRA Account / Service Canada. Sun Life administers the plan.",
        "Your dentist can verify CDCP coverage and direct-bill on your behalf."
      );
    }

    const provincialGap = PROVINCIAL_GAPS[prov] || PROVINCIAL_GAPS["ON"];

    res.json({
      cdcpEligible,
      cdcpCoverageRate,
      cdcpPhase,
      cdcpNotes,
      provincialGap,
      province: prov,
      recommendation: cdcpEligible
        ? `You appear eligible for the Canada Dental Care Plan (${cdcpPhase}). Register at canada.ca/dental.`
        : "Consider a private extended health & dental plan to fill the gaps your provincial plan does not cover.",
    });
  } catch (err) {
    next(err);
  }
});

// ── GET /insurance/provincial-coverage ──
router.get("/provincial-coverage", (_req, res) => {
  res.json({ coverage: PROVINCIAL_GAPS });
});

export default router;
