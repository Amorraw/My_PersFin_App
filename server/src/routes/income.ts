import { Router } from "express";
import https from "https";
import { requireLogin } from "../middleware/requireLogin";

const router = Router();
router.use(requireLogin);

// ── 2024 federal payroll constants ──────────────────────────────────────────
const CPP = { employeeRate: 0.0595, selfRate: 0.119, exemption: 3500, ympe: 68500, yampe: 73200, cpp2Rate: 0.04, maxEmployee: 3867.50, maxCpp2: 188 };
const QPP = { employeeRate: 0.0640, selfRate: 0.128,  exemption: 3500, ympe: 68500, yampe: 73200, qpp2Rate: 0.04, maxEmployee: 4160, maxQpp2: 188 };
const EI  = { employeeRate: 0.0166, quebecRate: 0.0132, maxInsurable: 63200, maxPremium: 1049.12 };
const QPIP = { employeeRate: 0.00494, maxInsurable: 94000 };

const FEDERAL_BRACKETS = [
  { min: 0,       max: 55867,   rate: 0.15   },
  { min: 55867,   max: 111733,  rate: 0.205  },
  { min: 111733,  max: 154906,  rate: 0.26   },
  { min: 154906,  max: 220000,  rate: 0.29   },
  { min: 220000,  max: Infinity, rate: 0.33  },
];
const FEDERAL_BPA = 15705;

// ── Provincial brackets + BPA (2024) ────────────────────────────────────────
const PROV: Record<string, { bpa: number; brackets: { min: number; max: number; rate: number }[]; surtax?: any; abatement?: number }> = {
  AB: { bpa: 21003, brackets: [{ min:0, max:148269, rate:.10},{min:148269,max:177922,rate:.12},{min:177922,max:237230,rate:.13},{min:237230,max:355845,rate:.14},{min:355845,max:Infinity,rate:.15}] },
  BC: { bpa: 11981, brackets: [{ min:0, max:45654,  rate:.0506},{min:45654,max:91310,rate:.077},{min:91310,max:104835,rate:.105},{min:104835,max:127299,rate:.1229},{min:127299,max:172602,rate:.147},{min:172602,max:240716,rate:.168},{min:240716,max:Infinity,rate:.205}] },
  MB: { bpa: 15780, brackets: [{ min:0, max:36842,  rate:.108},{min:36842,max:79625,rate:.1275},{min:79625,max:Infinity,rate:.174}] },
  NB: { bpa: 12458, brackets: [{ min:0, max:47715,  rate:.094},{min:47715,max:95431,rate:.1482},{min:95431,max:176756,rate:.1652},{min:176756,max:Infinity,rate:.195}] },
  NL: { bpa: 10818, brackets: [{ min:0, max:43198,  rate:.087},{min:43198,max:86395,rate:.145},{min:86395,max:154244,rate:.158},{min:154244,max:215943,rate:.178},{min:215943,max:275870,rate:.198},{min:275870,max:Infinity,rate:.213}] },
  NS: { bpa:  8481, brackets: [{ min:0, max:29590,  rate:.0879},{min:29590,max:59180,rate:.1495},{min:59180,max:93000,rate:.1667},{min:93000,max:150000,rate:.175},{min:150000,max:Infinity,rate:.21}] },
  NT: { bpa: 16593, brackets: [{ min:0, max:50597,  rate:.059},{min:50597,max:101198,rate:.086},{min:101198,max:164525,rate:.122},{min:164525,max:Infinity,rate:.1405}] },
  NU: { bpa: 17925, brackets: [{ min:0, max:53268,  rate:.04},{min:53268,max:106537,rate:.07},{min:106537,max:173205,rate:.09},{min:173205,max:Infinity,rate:.115}] },
  ON: { bpa: 11865, brackets: [{ min:0, max:51446,  rate:.0505},{min:51446,max:102894,rate:.0915},{min:102894,max:150000,rate:.1116},{min:150000,max:220000,rate:.1216},{min:220000,max:Infinity,rate:.1316}], surtax:{ t1:5315, r1:.20, t2:6802, r2:.36 } },
  PE: { bpa: 12000, brackets: [{ min:0, max:32656,  rate:.0965},{min:32656,max:64313,rate:.1363},{min:64313,max:105000,rate:.1665},{min:105000,max:140000,rate:.18},{min:140000,max:Infinity,rate:.1875}] },
  QC: { bpa: 17183, brackets: [{ min:0, max:51780,  rate:.14},{min:51780,max:103545,rate:.19},{min:103545,max:126000,rate:.24},{min:126000,max:Infinity,rate:.2575}], abatement: 0.165 },
  SK: { bpa: 17661, brackets: [{ min:0, max:49720,  rate:.105},{min:49720,max:142058,rate:.125},{min:142058,max:Infinity,rate:.145}] },
  YT: { bpa: 15705, brackets: [{ min:0, max:55867,  rate:.064},{min:55867,max:111733,rate:.09},{min:111733,max:154906,rate:.109},{min:154906,max:500000,rate:.128},{min:500000,max:Infinity,rate:.15}] },
};

function applyBrackets(income: number, brackets: { min: number; max: number; rate: number }[]): number {
  let tax = 0;
  for (const b of brackets) {
    if (income <= b.min) break;
    tax += (Math.min(income, b.max) - b.min) * b.rate;
  }
  return tax;
}

function calcFederal(taxableIncome: number, cpp: number, ei: number, isQC: boolean): number {
  const gross = applyBrackets(taxableIncome, FEDERAL_BRACKETS);
  const credits = (FEDERAL_BPA + cpp + ei) * 0.15;
  const base = Math.max(0, gross - credits);
  return isQC ? base * (1 - 0.165) : base; // Quebec 16.5% abatement
}

function calcProvincial(taxableIncome: number, province: string, cpp: number, ei: number): number {
  const p = PROV[province] ?? PROV.ON;
  const gross = applyBrackets(taxableIncome, p.brackets);
  const baseRate = p.brackets[0].rate;
  const credits = (p.bpa + cpp + ei) * baseRate;
  let tax = Math.max(0, gross - credits);
  if (p.surtax) {
    const s = p.surtax;
    tax += Math.max(0, tax - s.t1) * s.r1 + Math.max(0, tax - s.t2) * s.r2;
  }
  return tax;
}

// ── POST /income/paycheck ────────────────────────────────────────────────────
router.post("/paycheck", (req, res, next) => {
  try {
    const {
      grossAnnual, province = "ON", payFrequency = 26,
      isSelfEmployed = false, rrspContribution = 0,
      pensionContribution = 0, unionDues = 0,
    } = req.body;

    const gross = Number(grossAnnual);
    const isQC = province === "QC";
    const extraDeductions = Number(rrspContribution) + Number(pensionContribution) + Number(unionDues);

    // CPP / QPP
    const plan = isQC ? QPP : CPP;
    const cppable = Math.max(0, Math.min(gross, plan.ympe) - plan.exemption);
    const rate = isSelfEmployed ? plan.selfRate : plan.employeeRate;
    const maxMain = isSelfEmployed ? plan.maxEmployee * 2 : plan.maxEmployee;
    const cpp = Math.min(cppable * rate, maxMain);
    const cpp2 = Math.max(0, Math.min(gross, plan.yampe) - plan.ympe) * (isQC ? QPP.qpp2Rate : CPP.cpp2Rate);
    const totalCPP = cpp + cpp2;

    // EI / QPIP
    const eiRate = isQC ? EI.quebecRate : EI.employeeRate;
    const ei = Math.min(gross, EI.maxInsurable) * eiRate;
    const qpip = isQC ? Math.min(gross, QPIP.maxInsurable) * QPIP.employeeRate : 0;
    const totalEI = ei + qpip;

    // Taxes
    const taxable = Math.max(0, gross - totalCPP - totalEI - extraDeductions);
    const fedTax = calcFederal(taxable, totalCPP, totalEI, isQC);
    const provTax = calcProvincial(taxable, province, totalCPP, totalEI);

    const totalDeductions = totalCPP + totalEI + fedTax + provTax + extraDeductions;
    const netAnnual = gross - totalDeductions;
    const periods = Number(payFrequency);
    const effectiveRate = gross > 0 ? (fedTax + provTax) / gross : 0;

    // Find marginal federal bracket
    const marginalFed = FEDERAL_BRACKETS.find(b => taxable > b.min && taxable <= b.max)?.rate ?? FEDERAL_BRACKETS[FEDERAL_BRACKETS.length - 1].rate;
    const prov = PROV[province] ?? PROV.ON;
    const marginalProv = prov.brackets.find(b => taxable > b.min && taxable <= b.max)?.rate ?? prov.brackets[prov.brackets.length - 1].rate;

    const periodLabel = periods === 52 ? "Weekly" : periods === 26 ? "Biweekly" : periods === 24 ? "Semi-monthly" : "Monthly";

    res.json({
      gross, grossPeriod: gross / periods,
      cpp, cpp2, totalCPP, cppPeriod: totalCPP / periods,
      ei, qpip, totalEI, eiPeriod: totalEI / periods,
      fedTax, fedPeriod: fedTax / periods,
      provTax, provPeriod: provTax / periods,
      extraDeductions, extraPeriod: extraDeductions / periods,
      totalDeductions, deductionsPeriod: totalDeductions / periods,
      netAnnual, netPeriod: netAnnual / periods,
      effectiveRate, marginalFed, marginalProv,
      periodLabel, periods, isQC, isSelfEmployed,
    });
  } catch (err) { next(err); }
});

// ── POST /income/ccb — Canada Child Benefit 2024-25 ──────────────────────────
router.post("/ccb", (req, res, next) => {
  try {
    const { netFamilyIncome = 0, children = [] } = req.body as {
      netFamilyIncome: number;
      children: Array<{ age: number }>;
    };

    const income = Number(netFamilyIncome);
    const under6 = children.filter(c => c.age < 6).length;
    const age6to17 = children.filter(c => c.age >= 6 && c.age <= 17).length;
    const totalChildren = under6 + age6to17;

    const maxAnnual = under6 * 7437 + age6to17 * 6275;
    if (maxAnnual === 0) return res.json({ maxAnnual: 0, annual: 0, monthly: 0, phaseOutRate: 0, notes: ["No eligible children (must be under 18)."] });

    const threshold = 36502;
    const phaseOutRates: Record<number, number> = { 1: 0.135, 2: 0.23, 3: 0.295 };
    const phaseOutRate = phaseOutRates[totalChildren] ?? 0.32;

    const reduction = income > threshold ? (income - threshold) * phaseOutRate : 0;
    const annual = Math.max(0, maxAnnual - reduction);
    const monthly = annual / 12;

    res.json({
      maxAnnual, annual, monthly,
      under6, age6to17, totalChildren, phaseOutRate,
      threshold, reduction, income,
      notes: [
        "CCB is non-taxable — you do not report it as income.",
        "Based on prior-year net family income (line 23600 of both partners).",
        "Disability supplement ($3,322/year per child) available if child has a valid DTC certificate.",
        "CCB is recalculated every July based on the prior year's tax return.",
      ],
    });
  } catch (err) { next(err); }
});

// ── POST /income/gst-credit — GST/HST Credit 2024 ───────────────────────────
router.post("/gst-credit", (req, res, next) => {
  try {
    const { netFamilyIncome = 0, hasSpouse = false, childrenUnder19 = 0 } = req.body;
    const income = Number(netFamilyIncome);

    const baseCredit = 496;
    const spouseCredit = hasSpouse ? 496 : 0;
    const childCredit = Number(childrenUnder19) * 130;
    // Single parents get the spousal credit for their first child
    const singleParentBonus = !hasSpouse && Number(childrenUnder19) > 0 ? 496 : 0;
    const maxAnnual = baseCredit + spouseCredit + childCredit + singleParentBonus;

    const threshold = 43794;
    const reduction = income > threshold ? (income - threshold) * 0.05 : 0;
    const annual = Math.max(0, maxAnnual - reduction);

    res.json({
      maxAnnual, annual, quarterly: annual / 4,
      threshold, reduction,
      notes: [
        "GST/HST credit is non-taxable and paid quarterly (Jan, Apr, Jul, Oct).",
        "Based on prior-year net income from your tax return.",
        "You must file a tax return even with $0 income to receive the credit.",
        "The credit is reduced by 5% of net family income over $43,794.",
      ],
    });
  } catch (err) { next(err); }
});

// ── GET /income/cpi — Statistics Canada CPI data ────────────────────────────
// Tries Bank of Canada Valet API for core inflation; always returns hardcoded category data
router.get("/cpi", async (_req, res) => {
  // Hardcoded 2024 Statistics Canada CPI (year-over-year % change, approximate 12-month avg)
  const categories = [
    { name: "All-items CPI",                  yoy: 2.7,  weight: 100, budgetCategory: "total" },
    { name: "Food — grocery stores",           yoy: 3.2,  weight: 15.8, budgetCategory: "groceries" },
    { name: "Food — restaurants",              yoy: 4.3,  weight: 6.5,  budgetCategory: "dining" },
    { name: "Shelter (rent + owned)",          yoy: 5.9,  weight: 29.0, budgetCategory: "housing" },
    { name: "Household operations & furnishings", yoy: 1.5, weight: 13.5, budgetCategory: "household" },
    { name: "Clothing and footwear",           yoy: 1.4,  weight: 4.5,  budgetCategory: "clothing" },
    { name: "Transportation (incl. gasoline)", yoy: 0.2,  weight: 17.1, budgetCategory: "transport" },
    { name: "Health and personal care",        yoy: 2.9,  weight: 5.0,  budgetCategory: "health" },
    { name: "Recreation, education, reading",  yoy: 1.6,  weight: 8.2,  budgetCategory: "recreation" },
    { name: "Alcoholic beverages & tobacco",   yoy: 3.2,  weight: 3.4,  budgetCategory: "other" },
  ];

  // Try Bank of Canada Valet API for live core inflation (CPIW = weighted median)
  let liveRate: number | null = null;
  let liveDate: string | null = null;
  try {
    const raw = await new Promise<string>((resolve, reject) => {
      const req = https.get("https://www.bankofcanada.ca/valet/observations/CPIW/json?recent=1", (r) => {
        let data = "";
        r.on("data", (c: string) => { data += c; });
        r.on("end", () => resolve(data));
      });
      req.on("error", reject);
      req.setTimeout(4000, () => { req.destroy(); reject(new Error("timeout")); });
    });
    const json = JSON.parse(raw);
    const obs = json?.observations;
    if (obs && obs.length > 0) {
      const latest = obs[obs.length - 1];
      liveRate = parseFloat(latest?.CPIW?.v ?? "0");
      liveDate = latest?.d ?? null;
    }
  } catch {
    // Fail silently — we still return hardcoded data
  }

  res.json({
    categories,
    liveCore: liveRate,
    liveCoreDate: liveDate,
    source: "Statistics Canada Table 18-10-0004-01 (2024 avg). Core inflation from Bank of Canada Valet API (CPIW).",
    baseYear: 2002,
    asOf: "2024",
  });
});

export default router;
