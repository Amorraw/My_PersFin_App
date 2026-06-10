"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.categorizeTransaction = categorizeTransaction;
exports.getSuggestedCategory = getSuggestedCategory;
exports.getAvailableCategories = getAvailableCategories;
// Rule-based transaction categorization using merchant/description keyword patterns
const categoryCatalog_1 = require("../data/categoryCatalog");
const categoryRules = {
    "Groceries": [/walmart|costco|safeway|whole foods|trader joe|aldi|supermarket|grocery/i],
    "Eating Out": [/restaurant|cafe|coffee|starbucks|mcdonald|burger|pizza|doordash|uber eats|grubhub/i],
    "Vehicle Fuel": [/shell|chevron|exxon|mobil|petro|esso|fuel|gas station/i],
    "Bus / Taxi / Ride Share": [/uber|lyft|taxi|transit|metro|bus fare|ride share/i],
    "Parking": [/parking|parkade|meter/i],
    "Hydro / Power": [/hydro|electric|bc hydro|power/i],
    "Gas": [/fortis|natural gas|gas bill/i],
    "Internet": [/internet|isp|comcast|xfinity|shaw|telus internet|rogers internet/i],
    "Cell Phone(s)": [/cell phone|wireless|mobile|telus mobility|rogers wireless|fido|koodo/i],
    "Phone (Including Long Distance)": [/phone service|landline|long distance/i],
    "Cable / Streaming Services": [/netflix|disney|spotify|crave|prime video|hulu|streaming|cable/i],
    "House / Tenant Insurance": [/tenant insurance|house insurance|home insurance/i],
    "Vehicle Insurance / Registration": [/icbc|vehicle insurance|registration/i],
    "Prescriptions": [/pharmacy|prescription|rx|shoppers drug mart/i],
    "Over-the-counter Medication / Vitamins": [/vitamin|supplement|over-the-counter|otc/i],
    "Dental / Orthodontist": [/dental|dentist|orthodont/i],
    "Eye Care": [/optometrist|glasses|contact lenses|eye exam/i],
    "Specialists (e.g. Massage, Chiropractor, Physiotherapy)": [/massage|chiropractor|physio|physiotherapy/i],
    "Hair Cuts & Services": [/barber|haircut|hair salon/i],
    "Salon Services (e.g. Tanning, Aesthetics)": [/nail|spa|aesthetic|tanning|salon/i],
    "Fitness Memberships": [/gym|fitness|yoga|pilates|crossfit/i],
    "E-Subscriptions & Apps": [/subscription|app store|google play|membership/i],
    "Travel / Vacations": [/airbnb|hotel|airline|flight|travel|expedia|booking\.com/i],
    "Donations / Charity / Assisting Family": [/donation|charity|foundation|go fund me|support family/i],
    "First Mortgage": [/mortgage/i],
    "Rent": [/\brent\b|landlord|property management/i],
    "Bank Fees/Safety Deposit Box": [/bank fee|monthly fee|nsf|overdraft|safety deposit/i],
    "Income Tax Repayment": [/cra|income tax repayment|tax payment/i],
    "Child Tax Benefits": [/child tax benefit|ccb/i],
    "Employment Insurance": [/employment insurance|ei payment/i],
    "Part-Time Income": [/part-time income|part time salary/i],
    "Full-Time Income": [/payroll|salary|paycheque|direct deposit/i],
    "Commission": [/commission/i],
    "Child / Spousal Support": [/spousal support|child support/i],
    "Secured Debt Payment": [/loan payment|line of credit payment|mortgage payment/i],
    "RRSP / TFSA": [/rrsp|tfsa/i],
    "RESP / RDSP": [/resp|rdsp/i]
};
const allSubcategoryNames = new Set(categoryCatalog_1.CATEGORY_CATALOG.flatMap((major) => major.subcategories.map((sub) => sub.name.toLowerCase())));
// Match description against regex rules; fall back to "Other Living Expenses"
function categorizeTransaction(description) {
    if (!description)
        return "Other Living Expenses";
    const desc = description.toLowerCase();
    for (const [category, patterns] of Object.entries(categoryRules)) {
        for (const pattern of patterns) {
            if (pattern.test(desc)) {
                return category;
            }
        }
    }
    return "Other Living Expenses";
}
// Thin alias used by the import flow to suggest a category from raw description text
function getSuggestedCategory(description) {
    return categorizeTransaction(description);
}
// Return all subcategory names from the catalog, deduplicated and sorted alphabetically
function getAvailableCategories() {
    return Array.from(allSubcategoryNames)
        .map((name) => categoryCatalog_1.CATEGORY_CATALOG.flatMap((major) => major.subcategories).find((sub) => sub.name.toLowerCase() === name)?.name || name)
        .sort((a, b) => a.localeCompare(b));
}
