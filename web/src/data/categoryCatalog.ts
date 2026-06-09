// Full Canadian budget category tree used for transaction tagging and budgets
import type { CategoryMajor } from "../types";

// Converts a display name to a URL-safe dot-path key segment
const slugify = (value: string) =>
  value
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/\//g, "-")
    .replace(/\(/g, "")
    .replace(/\)/g, "")
    .replace(/\./g, "")
    .replace(/\*/g, "")
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

// Builds subcategory list with prefixed keys like "housing-expenses.rent"
const makeSubcategories = (majorKey: string, names: string[]) =>
  names.map((name) => ({ key: `${majorKey}.${slugify(name)}`, name }));

export const CATEGORY_CATALOG: CategoryMajor[] = [
  {
    key: "income",
    name: "Income",
    subcategories: makeSubcategories("income", [
      "Full-Time Income",
      "Part-Time Income",
      "Employment Insurance",
      "Pension (Disability / Retirement etc.)",
      "Income Assistance",
      "Child Tax Benefits",
      "Child / Spousal Support",
      "Commission",
      "Family Support",
      "Other"
    ])
  },
  {
    key: "housing-expenses",
    name: "Housing Expenses",
    subcategories: makeSubcategories("housing-expenses", [
      "First Mortgage",
      "Second Mortgage / Home Line of Credit",
      "Rent",
      "Property Tax",
      "Strata / Condo / Pad Fee",
      "House / Tenant Insurance",
      "Hydro / Power",
      "Gas",
      "Alternate Heating Source",
      "Water / Sewage / Garbage",
      "Phone (Including Long Distance)",
      "Cell Phone(s)",
      "Cable / Streaming Services",
      "Internet",
      "Storage Locker",
      "Home Security",
      "Home Repairs / Maintenance",
      "Other Housing Expenses"
    ])
  },
  {
    key: "living-expenses",
    name: "Living Expenses",
    subcategories: makeSubcategories("living-expenses", [
      "Groceries",
      "Personal Care (e.g. Grooming, Cosmetics)",
      "Baby / Infant Needs (e.g. Diapers, Formula)",
      "Laundry / Dry Cleaning",
      "Bus / Taxi / Ride Share",
      "Vehicle Payments",
      "Vehicle Fuel",
      "Vehicle Insurance / Registration",
      "Parking",
      "Vehicle Maintenance",
      "Roadside Assistance",
      "Provincial Medical Premiums",
      "Specialists (e.g. Massage, Chiropractor, Physiotherapy)",
      "Eye Care",
      "Prescriptions",
      "Dental / Orthodontist",
      "Over-the-counter Medication / Vitamins",
      "Deductibles / Out-of-Pocket",
      "Other Health Expenses",
      "Life Insurance",
      "Disability Insurance",
      "Extended Health Benefits",
      "Other Health Insurances",
      "Pets / Vet Bills & Insurance",
      "Bank Fees/Safety Deposit Box",
      "Income Tax Deductions",
      "Other Living Expenses"
    ])
  },
  {
    key: "work-expenses",
    name: "Work Expenses",
    subcategories: makeSubcategories("work-expenses", [
      "Daycare",
      "Lunches / Breaks (Person 1)",
      "Lunches / Breaks (Person 2)",
      "Special / Professional Clothing",
      "License Fees / Professional Dues",
      "Work Supplies (e.g. Tools)",
      "Other Work Expenses"
    ])
  },
  {
    key: "personal-expenses",
    name: "Personal Expenses",
    subcategories: makeSubcategories("personal-expenses", [
      "Clothing & Shoes (Adults)",
      "Tobacco / Vaping / Cannabis",
      "Alcohol",
      "Recreation (e.g. sports equipment & fees, activities)",
      "Fitness Memberships",
      "Eating Out",
      "Entertainment (e.g. movies, event tickets, social activities)",
      "E-Subscriptions & Apps",
      "Magazines / Newspapers / Books",
      "Lottery / Gaming",
      "Babysitting",
      "Hair Cuts & Services",
      "Salon Services (e.g. Tanning, Aesthetics)",
      "Education (Tuition/Supplies)",
      "Gifts / Special Occasions",
      "Hobbies",
      "Travel / Vacations",
      "Donations / Charity / Assisting Family",
      "Annual Memberships (Store, Online etc.)",
      "Other Personal Expenses",
      "Clothing & Shoes (Children)",
      "Allowances (Children)",
      "Lessons / Activities",
      "School Supplies / Fees",
      "Gifts (Children)",
      "Other Child Expenses"
    ])
  },
  {
    key: "payments",
    name: "Payments",
    subcategories: makeSubcategories("payments", [
      "Child / Spousal Support",
      "Secured Debt Payment",
      "Money Owned to Family & Friends",
      "Other Debt Payment",
      "Emergency Savings",
      "Income Tax Repayment",
      "RRSP / TFSA",
      "RESP / RDSP"
    ])
  }
];
