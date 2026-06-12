export function slugifyCase(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/['']/g, '')          // drop apostrophes
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')   // non-alphanumerics → hyphen
    .replace(/^-+|-+$/g, '')       // trim leading/trailing hyphens
}