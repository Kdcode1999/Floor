// The test runner can hand a test the app's own source files as text. This tells TypeScript so.
interface ImportMeta {
  glob<T>(pattern: string, options: { query: string; import: string; eager: true }): Record<string, T>;
}
