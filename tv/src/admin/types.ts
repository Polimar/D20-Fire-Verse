export type Overview = {
  users: { total: number; admins: number; active: number; disabled: number; pending: number; amazon: number };
  rooms: number;
  saves: { total: number; auto: number; archived: number };
  content: {
    all: number;
    inPlay: number;
    needsReview: number;
    missingMechanic: number;
    invalid: number;
    edited: number;
  };
  campaigns: number;
};

export type PageCtx = {
  /** False once the operator navigated away; async renders stop painting. */
  isCurrent: () => boolean;
  refreshCounts: () => Promise<void>;
  me: { id: string; username: string };
};

export type Page = {
  id: string;
  label: string;
  group: string;
  count?: (o: Overview) => { value: number; alert?: boolean } | null;
  render: (host: HTMLElement, ctx: PageCtx) => Promise<void>;
  /** Return false to stay (unsaved work). */
  leave?: () => Promise<boolean>;
  dirty?: () => boolean;
};

/** Route segments after the page id: #/campaigns/luppolandia-brew → ["luppolandia-brew"]. */
export function subPath(): string[] {
  return location.hash.replace(/^#\/?/, "").split("?")[0]!.split("/").slice(1).filter(Boolean).map(decodeURIComponent);
}
