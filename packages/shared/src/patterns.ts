// Kept free of Node imports so the browser frontend can use it too.

/** Case-insensitive match of a file name against simple wildcard patterns ("*" only). */
export function matchesAnyPattern(fileName: string, patterns: string[]): boolean {
  const name = fileName.toLowerCase();
  return patterns.some((p) => {
    const rx = new RegExp(
      '^' +
        p
          .toLowerCase()
          .split('*')
          .map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
          .join('.*') +
        '$'
    );
    return rx.test(name);
  });
}
