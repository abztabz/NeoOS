import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IntelligencePanel } from "@/components/neoos/IntelligencePanel";
import { IntelligenceProvider } from "@/data/intelligence-store";
import { ReportProvider } from "@/data/report-store";
import { ConversationProvider } from "@/data/conversation-store";
import { OPERATOR_TOKEN_KEY } from "@/data/run-now";

/**
 * The Run now button is the only control in this panel that produces numbers
 * about the operator's own position. What is tested here is mostly what it does
 * when it *cannot* — because a refusal that renders as a generic failure is
 * indistinguishable from a bug, and would send somebody looking for the wrong
 * problem.
 */

beforeAll(() => {
  if (!HTMLDialogElement.prototype.showModal) {
    HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
      this.setAttribute("open", "");
    };
    HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
      this.removeAttribute("open");
      this.dispatchEvent(new Event("close"));
    };
  }
});

function renderPanel() {
  return render(
    <ReportProvider>
      <ConversationProvider>
        <IntelligenceProvider>
          <IntelligencePanel open onClose={() => {}} />
        </IntelligenceProvider>
      </ConversationProvider>
    </ReportProvider>,
  );
}

afterEach(() => {
  cleanup();
  sessionStorage.clear();
  vi.restoreAllMocks();
});

describe("IntelligencePanel — Run now", () => {
  it("asks for the operator token instead of failing silently when none is held", async () => {
    const user = userEvent.setup();
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    renderPanel();

    await user.click(screen.getByTestId("run-now"));

    expect(await screen.findByRole("alert")).toHaveTextContent(/No operator token is held/i);
    // Nothing was sent. Asking for a run without a credential would produce a
    // 401 whose message is about authorisation rather than about what to do.
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("shows a readiness refusal with the missing inputs named", async () => {
    sessionStorage.setItem(OPERATOR_TOKEN_KEY, "token");
    const user = userEvent.setup();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          ran: false,
          reason: "Live runs are unavailable because no market data provider is configured.",
          missing: ["MARKET_DATA_API_KEY", "REPORT_SIGNING_PRIVATE_KEY"],
        }),
        { status: 409, headers: { "content-type": "application/json" } },
      ),
    );

    renderPanel();
    await user.click(screen.getByTestId("run-now"));

    const refusal = await screen.findByTestId("run-refusal");
    expect(refusal).toHaveTextContent("no market data provider is configured");
    expect(refusal).toHaveTextContent("MARKET_DATA_API_KEY");
    expect(refusal).toHaveTextContent("REPORT_SIGNING_PRIVATE_KEY");
    // A refusal is an answer. It must not be rendered in the alert register.
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("reports a run that stored nothing without claiming the cockpit changed", async () => {
    sessionStorage.setItem(OPERATOR_TOKEN_KEY, "token");
    const user = userEvent.setup();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          ran: true,
          runId: "run-9",
          cycleState: "insufficient_evidence",
          liveState: "insufficient_evidence",
          reportId: null,
          stored: false,
          storeReason: "No report was produced, so none was stored.",
          alerts: ["Two assets were excluded for want of a verified price."],
          evidenceCounts: {},
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    renderPanel();
    await user.click(screen.getByTestId("run-now"));

    await waitFor(() => {
      expect(screen.getByText(/run-9/)).toHaveTextContent("No report was produced");
    });
    expect(screen.getByTestId("run-alerts")).toHaveTextContent("excluded for want of a verified price");
    expect(screen.queryByText(/loaded into the cockpit/i)).toBeNull();
  });

  it("names a rejected token as an authorisation fault", async () => {
    sessionStorage.setItem(OPERATOR_TOKEN_KEY, "wrong");
    const user = userEvent.setup();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: "The supplied token was not accepted." }), {
        status: 403,
        headers: { "content-type": "application/json" },
      }),
    );

    renderPanel();
    await user.click(screen.getByTestId("run-now"));

    expect(await screen.findByRole("alert")).toHaveTextContent("was not accepted");
  });
});
