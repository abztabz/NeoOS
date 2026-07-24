import {
  FRESHNESS_CONFIDENCE_MULTIPLIER,
  FRESHNESS_HORIZON_DAYS,
  SOURCE_TIERS,
  type FreshnessStatus,
  type SourceTierName,
} from "@/engine/constants";
import type { ConflictRecord, EvidenceRecord } from "@/engine/models";

const DAY_MS = 86_400_000;

const tierNameByNumber: Record<number, SourceTierName> = Object.fromEntries(
  Object.entries(SOURCE_TIERS).map(([name, n]) => [n, name as SourceTierName]),
) as Record<number, SourceTierName>;

/**
 * Freshness of one evidence record at `now`. An explicit expiresAt always
 * wins; otherwise the per-type horizon applies (stale past 1×, expired past
 * 2×). Invalid dates are expired — never silently fresh.
 */
export function freshnessOf(record: EvidenceRecord, now: Date): FreshnessStatus {
  if (record.expiresAt) {
    const expires = new Date(record.expiresAt).getTime();
    if (Number.isNaN(expires) || now.getTime() > expires) return "expired";
  }
  const published = new Date(record.effectiveDate ?? record.publicationDate).getTime();
  if (Number.isNaN(published)) return "expired";
  const horizonDays = FRESHNESS_HORIZON_DAYS[tierNameByNumber[record.sourceTier] ?? "sentiment"];
  const ageDays = (now.getTime() - published) / DAY_MS;
  if (ageDays > horizonDays * 2) return "expired";
  if (ageDays > horizonDays) return "stale";
  if (ageDays > (horizonDays * 2) / 3) return "aging";
  return "fresh";
}

/** Effective confidence of a record after freshness decay. Expired → 0. */
export function effectiveConfidence(record: EvidenceRecord, now: Date): number {
  return record.confidence * FRESHNESS_CONFIDENCE_MULTIPLIER[freshnessOf(record, now)];
}

/**
 * Detect conflicts: records sharing a claimKey whose normalized values
 * disagree beyond tolerance (or whose verification is disputed). Both records
 * are ALWAYS preserved; the stronger tier prevails, the conflict is recorded,
 * and confidence takes the penalty downstream. Nothing is overwritten.
 */
export function detectConflicts(evidence: EvidenceRecord[], now: Date): ConflictRecord[] {
  const groups = new Map<string, EvidenceRecord[]>();
  for (const record of evidence) {
    if (!record.claimKey || freshnessOf(record, now) === "expired") continue;
    const key = `${record.assetId ?? "macro"}::${record.claimKey}`;
    groups.set(key, [...(groups.get(key) ?? []), record]);
  }

  const conflicts: ConflictRecord[] = [];
  for (const [key, records] of groups) {
    if (records.length < 2) continue;
    const values = records
      .map((r) => r.normalizedValue)
      .filter((v): v is number => v !== null);
    const disputed = records.some((r) => r.verificationStatus === "disputed");
    // Tolerance: 5% relative disagreement on the same normalized claim.
    const spread =
      values.length >= 2
        ? (Math.max(...values) - Math.min(...values)) /
          Math.max(Math.abs(Math.max(...values)), 1e-9)
        : 0;
    if (!disputed && spread <= 0.05) continue;

    const ranked = [...records].sort((a, b) => a.sourceTier - b.sourceTier);
    const prevailing = ranked[0]!;
    const tierGap = ranked[ranked.length - 1]!.sourceTier - prevailing.sourceTier;
    // High severity: sources of similar authority disagree (a filing vs a blog
    // is resolvable by hierarchy; two filings disagreeing is a real problem),
    // or any record is formally disputed.
    const severity: ConflictRecord["severity"] = disputed || tierGap <= 1 ? "high" : "low";
    conflicts.push({
      conflictId: `conflict:${key}`,
      claimKey: key,
      evidenceIds: records.map((r) => r.evidenceId),
      prevailingEvidenceId: prevailing.evidenceId,
      severity,
      resolution: severity === "low" ? "resolved_by_tier" : "unresolved",
      confidenceEffect:
        severity === "high"
          ? "Unresolved high-severity conflict: factor confidence penalized and rating capped at Hold."
          : "Resolved by source hierarchy: minor confidence penalty on affected factors.",
      note: `Sources disagree on "${prevailing.claimKey}": ${records
        .map((r) => `${r.sourceName} (tier ${r.sourceTier})`)
        .join(" vs ")}.`,
    });
  }
  return conflicts;
}

/**
 * Evidence integrity 0–100 for a set of records: tier-weighted share of
 * verified, non-expired evidence. Strong primary sources that are fresh and
 * verified push this toward 100.
 */
export function evidenceIntegrity(evidence: EvidenceRecord[], now: Date): number {
  if (evidence.length === 0) return 0;
  let weightSum = 0;
  let integritySum = 0;
  for (const record of evidence) {
    // Tier weight: filings count ~3× sentiment.
    const tierWeight = 1 + (6 - record.sourceTier) * 0.4;
    const fresh = FRESHNESS_CONFIDENCE_MULTIPLIER[freshnessOf(record, now)];
    const verified =
      record.verificationStatus === "verified"
        ? 1
        : record.verificationStatus === "unverified"
          ? 0.6
          : 0.25;
    weightSum += tierWeight;
    integritySum += tierWeight * fresh * verified;
  }
  return (integritySum / weightSum) * 100;
}

export function summarizeEvidence(evidence: EvidenceRecord[], now: Date) {
  const byFreshness: Record<string, number> = { fresh: 0, aging: 0, stale: 0, expired: 0 };
  let verified = 0;
  for (const record of evidence) {
    byFreshness[freshnessOf(record, now)] = (byFreshness[freshnessOf(record, now)] ?? 0) + 1;
    if (record.verificationStatus === "verified") verified += 1;
  }
  return {
    total: evidence.length,
    byFreshness,
    verifiedShare: evidence.length === 0 ? 0 : verified / evidence.length,
  };
}
