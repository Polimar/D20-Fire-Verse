/** Notifies open TV consoles when a user's hero library changes (forge, rename, delete). */

let push: ((userId: string) => void) | undefined;

export function setHeroLibraryPush(fn: (userId: string) => void): void {
  push = fn;
}

export function notifyHeroLibraryChanged(userId: string): void {
  push?.(userId);
}
