export const MAX_CURATION_CANDIDATES = 500;
export interface CurationBudget { requests: number; bytes: number; deadline: number }
export function createCurationBudget(): CurationBudget {
  return { requests: 12, bytes: 512 * 1024, deadline: Date.now() + 120000 };
}
export function curationBudgetAvailable(budget: CurationBudget): boolean {
  return budget.requests > 0 && budget.bytes > 0 && Date.now() < budget.deadline;
}
export function reserveCurationRequest(budget: CurationBudget, prompt: string): number {
  const bytes = Buffer.byteLength(prompt);
  if (!curationBudgetAvailable(budget) || bytes > budget.bytes) throw new Error('Curation run budget exhausted.');
  budget.requests--; budget.bytes -= bytes;
  return Math.max(1, Math.min(30000, budget.deadline - Date.now()));
}
