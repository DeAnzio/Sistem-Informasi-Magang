export function escapeApplicantSearchTerm(value: string): string {
  return value.replace(/[\\%_,]/g, "\\$&");
}
