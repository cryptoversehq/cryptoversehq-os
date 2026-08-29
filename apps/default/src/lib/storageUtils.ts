// storageUtils.ts — localStorage sizing / cleanup utilities
//
// Companion to authApi.ts session storage quota handling. Provides a diagnostic
// pass over localStorage so over-sized items can be identified and (if desired)
// cleared by the caller.

export function cleanupLargeStorageItems(): void {
  const keys = Object.keys(localStorage);
  let totalSize = 0;

  for (const key of keys) {
    try {
      const value = localStorage.getItem(key);
      if (value) {
        const size = value.length;
        totalSize += size;
        // If any single item is > 100KB, log it for review
        if (size > 1024 * 100) {
          console.warn(`[Storage] Large item "${key}" uses ${size} bytes (~${Math.round(size / 1024)}KB)`);
        }
      }
    } catch {}
  }

  console.log(`[Storage] Total localStorage usage: ~${Math.round(totalSize / 1024)}KB`);
}
