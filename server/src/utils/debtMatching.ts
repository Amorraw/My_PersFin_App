// Shared fuzzy name-match used to tell whether a liability Account is already
// tracked as a Debt document, so callers don't double-count the same real-world
// debt once via Account.balance and again via Debt.currentBalance.

export function matchesTrackedDebt(accountName: string, debtNames: Set<string>): boolean {
  const aName = accountName.toLowerCase().trim();
  for (const n of debtNames) {
    if (n === aName || n.includes(aName) || aName.includes(n)) return true;
  }
  return false;
}

export function debtNameSet(debts: { name: string }[]): Set<string> {
  return new Set(debts.map((d) => d.name.toLowerCase().trim()));
}
