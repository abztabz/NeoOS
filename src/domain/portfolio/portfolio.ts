import type { NeoosReport } from "@/schemas/neoos-report";
import type { IntakeProfile } from "@/domain/intake/types";

/**
 * The boundary between the worked example and somebody's actual money.
 *
 * NeoOS carries two different objects that both look like "a portfolio":
 *
 *   - the **declared position** (`IntakeProfile`), which is what the subject
 *     says they own;
 *   - the **analysed report** (`NeoosReport`), which is what the engine has
 *     rated, priced and formed a thesis about.
 *
 * They were never merged, and they should not be. The failure was subtler: the
 * report store defaults to a fixture report, so every workspace rendered the
 * fixture's holdings — Apple, an S&P tracker, a developed-market ETF — under
 * headings like "PORTFOLIO" and "WATCHLIST", distinguished from real holdings
 * only by a badge in the corner.
 *
 * A badge is not a boundary. Somebody who has declared their entire net worth
 * and then reads "Apple · HOLD · 8% allocation" has been shown a claim about
 * their money that is false, and the badge asks them to remember a distinction
 * the interface is actively blurring.
 *
 * So the mode is carried in the data, every portfolio-dependent selector takes
 * it, and a demo position can never reach a user surface. Where the honest
 * answer is "there is nothing analysed yet", that is what gets said.
 */

export type PortfolioMode = "user" | "demo";

export const portfolioModeLabels: Record<PortfolioMode, string> = {
  user: "Your position",
  demo: "Worked example",
};

/**
 * A portfolio, tagged with whose it is.
 *
 * `positions` is deliberately generic over the two shapes NeoOS holds, because
 * the isolation rule applies identically to both: a declared holding and an
 * analysed one are equally forbidden from crossing the boundary.
 */
export interface Portfolio<TPosition = unknown> {
  id: string;
  ownerId?: string;
  mode: PortfolioMode;
  positions: TPosition[];
}

/** The single user portfolio id. NeoOS is a one-subject system. */
export const USER_PORTFOLIO_ID = "portfolio-user";
export const DEMO_PORTFOLIO_ID = "portfolio-demo";

export function portfolioIdFor(mode: PortfolioMode): string {
  return mode === "user" ? USER_PORTFOLIO_ID : DEMO_PORTFOLIO_ID;
}

/* ---------------- what the deployment actually has ---------------- */

/**
 * Which portfolio a surface should render, decided once rather than per
 * component.
 *
 * The rule the directive asks for: **a real portfolio, once it exists, is the
 * portfolio.** No prompt, no toggle, no remembering which mode you are in. The
 * demo becomes reachable only before a real position exists, and only as an
 * explicitly-labelled secondary action.
 */
export interface ActivePortfolio {
  mode: PortfolioMode;
  portfolioId: string;
  /** True when a declared position exists and is therefore authoritative. */
  hasUserPortfolio: boolean;
  /** Whether demo content may appear anywhere in the normal UI. */
  demoVisible: boolean;
  /** Why, in the user's terms. Shown on first run only. */
  reason: string;
}

export function resolveActivePortfolio(input: {
  profile: IntakeProfile | null;
  /** True when the operator has explicitly opened the demo before declaring. */
  exploringDemo?: boolean;
}): ActivePortfolio {
  const hasUserPortfolio = input.profile !== null && input.profile.assets.length > 0;

  if (hasUserPortfolio) {
    // Non-negotiable: once a real position exists it is the active one, and the
    // demo stops being reachable from the normal UI. Leaving a toggle would
    // leave a way to read fixture holdings as your own.
    return {
      mode: "user",
      portfolioId: USER_PORTFOLIO_ID,
      hasUserPortfolio: true,
      demoVisible: false,
      reason: "Your declared position is active.",
    };
  }

  if (input.exploringDemo === true) {
    return {
      mode: "demo",
      portfolioId: DEMO_PORTFOLIO_ID,
      hasUserPortfolio: false,
      demoVisible: true,
      reason: "You are looking at a worked example. Nothing here is about your money.",
    };
  }

  return {
    mode: "user",
    portfolioId: USER_PORTFOLIO_ID,
    hasUserPortfolio: false,
    demoVisible: false,
    reason: "Nothing has been declared yet.",
  };
}

/* ---------------- the isolation rule ---------------- */

/**
 * Whether content belonging to `contentMode` may be rendered while
 * `active.mode` is the active portfolio.
 *
 * One direction only. Demo content is forbidden on a user surface; user content
 * on a demo surface is impossible rather than forbidden, because the demo never
 * holds user positions.
 */
export function mayRender(active: ActivePortfolio, contentMode: PortfolioMode): boolean {
  if (contentMode === "user") return true;
  return active.demoVisible;
}

/**
 * Positions belonging to one portfolio, and nothing else.
 *
 * Trivial, and it exists so the filter is a named, tested thing rather than an
 * inline predicate somebody can forget. Every portfolio-dependent calculation
 * routes through it.
 */
export function positionsFor<T extends { portfolioId?: string }>(
  positions: T[],
  portfolioId: string,
): T[] {
  return positions.filter((position) => position.portfolioId === portfolioId);
}

/**
 * The analysed report a surface may use, or null.
 *
 * Returns null on a user surface with no analysed report, which is the honest
 * state: the engine has not rated the subject's holdings, so there is nothing
 * to show. Returning the fixture report instead is precisely the bug.
 */
export function reportForSurface(
  active: ActivePortfolio,
  report: NeoosReport,
  reportMode: PortfolioMode,
): NeoosReport | null {
  return mayRender(active, reportMode) ? report : null;
}

/**
 * What to say when a user surface has no analysed content.
 *
 * Not an error and not an empty div. The subject has declared a position; what
 * is absent is the engine's analysis of it, and the difference is worth a
 * sentence.
 */
export const NO_ANALYSIS_YET =
  "Nothing here has been analysed against your position yet. Your declared holdings are shown where they are known; ratings, prices and opportunities appear once a run completes with a connected data source.";

export const NO_QUALIFYING_OPPORTUNITY =
  "No evidence-supported Buy opportunities currently meet NeoOS standards.";

export const DECISIONS_SUSPENDED =
  "Watchlist decisions suspended — current prices could not be verified.";

export const VALUATION_REVIEW_REQUIRED =
  "Valuation review required before this opportunity can be ranked.";
