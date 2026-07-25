import { notificationWebhookUrl } from "@/server/config/env";

/**
 * Notifications.
 *
 * The rule that shapes this module: a notification system that fires on
 * everything gets muted, and a muted alarm is worse than no alarm because it
 * creates the belief that someone is watching. So NeoOS notifies on findings
 * that change what a person would do — a provider that stopped working, a run
 * that produced nothing, a signature that failed — and stays silent on a normal
 * run, however much detail that run contains.
 *
 * Delivery is best-effort and failure is never allowed to fail the cycle. A
 * report that was generated, signed, and stored correctly has succeeded even if
 * the webhook was down, and throwing here would turn a messaging outage into a
 * lost report.
 */

export type NotificationSeverity = "info" | "warning" | "error";

export interface Notification {
  severity: NotificationSeverity;
  title: string;
  body: string;
  details: string[];
}

export interface DispatchResult {
  delivered: boolean;
  reason: string;
}

export const NOTIFICATION_TIMEOUT_MS = 5_000;

/** Severities worth interrupting someone for. `info` is recorded, not sent. */
const DELIVERABLE: NotificationSeverity[] = ["warning", "error"];

export async function dispatchNotification(
  notification: Notification,
  fetchImpl: (url: string, init?: RequestInit) => Promise<Response> = fetch,
): Promise<DispatchResult> {
  if (!DELIVERABLE.includes(notification.severity)) {
    return { delivered: false, reason: "Informational notifications are not dispatched." };
  }

  const url = notificationWebhookUrl();
  if (!url) {
    return { delivered: false, reason: "No notification webhook is configured." };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), NOTIFICATION_TIMEOUT_MS);
  try {
    const response = await fetchImpl(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      // The payload carries findings only. No credential, no connection
      // string, no report content — a webhook URL is a shared secret at best
      // and often lands in a chat channel with a wide audience.
      body: JSON.stringify({
        source: "neoos-cio",
        severity: notification.severity,
        title: notification.title,
        body: notification.body,
        details: notification.details,
        at: new Date().toISOString(),
      }),
      signal: controller.signal,
    });
    return response.ok
      ? { delivered: true, reason: "Delivered." }
      : { delivered: false, reason: `Webhook returned HTTP ${response.status}.` };
  } catch (error) {
    const aborted = error instanceof Error && error.name === "AbortError";
    return {
      delivered: false,
      reason: aborted
        ? `Webhook did not respond within ${NOTIFICATION_TIMEOUT_MS}ms.`
        : `Webhook delivery failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Decide whether a cycle's alerts are worth sending.
 *
 * Exported so the decision is testable and stated in one place rather than
 * scattered across the routes that call it.
 */
export function severityForAlerts(alerts: string[], hasReport: boolean): NotificationSeverity {
  if (!hasReport) return "error";
  if (alerts.some((a) => /signature|failed|blocking/i.test(a))) return "error";
  return alerts.length > 0 ? "warning" : "info";
}
