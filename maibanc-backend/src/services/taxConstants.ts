/**
 * Tax year 2026, single filer, published federal (IRS Rev. Proc. 2025-32 /
 * OBBBA-adjusted) and California (FTB, latest published — CA had not yet
 * released official 2026 thresholds as of this build, so the 2025 FTB
 * thresholds are used and labeled accordingly) brackets.
 *
 * Assumes Single filing status. Swap FEDERAL_BRACKETS_SINGLE for a
 * married/HOH table if the user's filing status changes.
 */

export type Bracket = { rate: number; upTo: number | null };

export const FEDERAL_BRACKETS_SINGLE: Bracket[] = [
  { rate: 0.10, upTo: 12_400 },
  { rate: 0.12, upTo: 50_400 },
  { rate: 0.22, upTo: 105_700 },
  { rate: 0.24, upTo: 201_775 },
  { rate: 0.32, upTo: 256_225 },
  { rate: 0.35, upTo: 640_600 },
  { rate: 0.37, upTo: null },
];
export const FEDERAL_STANDARD_DEDUCTION_SINGLE = 16_100;

// California FTB — 2025 thresholds (latest published; FTB releases 2026
// thresholds in fall 2026). +1% mental health services tax above $1M.
export const CA_BRACKETS_SINGLE: Bracket[] = [
  { rate: 0.01, upTo: 11_079 },
  { rate: 0.02, upTo: 26_264 },
  { rate: 0.04, upTo: 41_452 },
  { rate: 0.06, upTo: 57_542 },
  { rate: 0.08, upTo: 72_724 },
  { rate: 0.093, upTo: 371_479 },
  { rate: 0.103, upTo: 445_771 },
  { rate: 0.113, upTo: 742_953 },
  { rate: 0.123, upTo: 1_000_000 },
  { rate: 0.133, upTo: null }, // includes +1% mental health services tax
];
export const CA_STANDARD_DEDUCTION_SINGLE = 5_706;

export const SE_TAX_RATE = 0.153; // 12.4% Social Security + 2.9% Medicare
export const SE_SS_WAGE_BASE_2026 = 184_500;
export const SE_NET_EARNINGS_FACTOR = 0.9235; // net SE earnings subject to SE tax
export const ADDITIONAL_MEDICARE_RATE = 0.009; // above threshold, Medicare-only portion
export const ADDITIONAL_MEDICARE_THRESHOLD_SINGLE = 200_000;

/** Marginal-bracket tax on a given taxable income. */
export function bracketTax(taxableIncome: number, brackets: Bracket[]): number {
  if (taxableIncome <= 0) return 0;
  let tax = 0;
  let lastCap = 0;
  for (const { rate, upTo } of brackets) {
    const cap = upTo ?? Infinity;
    if (taxableIncome <= lastCap) break;
    const slice = Math.min(taxableIncome, cap) - lastCap;
    tax += slice * rate;
    lastCap = cap;
    if (taxableIncome <= cap) break;
  }
  return Math.round(tax * 100) / 100;
}

/** Self-employment tax (Social Security + Medicare) on net business earnings. */
export function selfEmploymentTax(netEarnings: number): number {
  if (netEarnings <= 0) return 0;
  const seEarnings = netEarnings * SE_NET_EARNINGS_FACTOR;
  const ssPortion = Math.min(seEarnings, SE_SS_WAGE_BASE_2026) * 0.124;
  const medicarePortion = seEarnings * 0.029;
  const additionalMedicare =
    seEarnings > ADDITIONAL_MEDICARE_THRESHOLD_SINGLE
      ? (seEarnings - ADDITIONAL_MEDICARE_THRESHOLD_SINGLE) * ADDITIONAL_MEDICARE_RATE
      : 0;
  return Math.round((ssPortion + medicarePortion + additionalMedicare) * 100) / 100;
}

/**
 * Full quarterly-estimate-style breakdown for a given annualized net
 * business income: federal income tax, CA income tax, and SE tax, using the
 * standard deduction (itemizing is out of scope for an automated estimate).
 */
export function estimateAnnualTax(annualNetIncome: number) {
  const seTax = selfEmploymentTax(annualNetIncome);
  // Half of SE tax is deductible from income for federal/state purposes.
  const seDeduction = seTax / 2;
  const federalTaxable = Math.max(0, annualNetIncome - seDeduction - FEDERAL_STANDARD_DEDUCTION_SINGLE);
  const caTaxable = Math.max(0, annualNetIncome - seDeduction - CA_STANDARD_DEDUCTION_SINGLE);
  const federalTax = bracketTax(federalTaxable, FEDERAL_BRACKETS_SINGLE);
  const caTax = bracketTax(caTaxable, CA_BRACKETS_SINGLE);
  const totalTax = Math.round((federalTax + caTax + seTax) * 100) / 100;
  return {
    annualNetIncome: Math.round(annualNetIncome * 100) / 100,
    selfEmploymentTax: seTax,
    federalIncomeTax: federalTax,
    stateIncomeTax: caTax,
    totalAnnualTax: totalTax,
    quarterlyPayment: Math.round((totalTax / 4) * 100) / 100,
  };
}
