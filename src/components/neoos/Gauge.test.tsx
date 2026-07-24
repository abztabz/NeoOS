import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Gauge } from "@/components/neoos/Gauge";
import { demoReport } from "@/data/demo-report";

// jsdom may not implement the <dialog> modal API; stub it minimally.
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

describe("Gauge", () => {
  afterEach(() => cleanup());

  it("renders the deployment score, recommendation, and posture", () => {
    render(<Gauge report={demoReport} />);
    expect(screen.getByTestId("deployment-score").textContent).toBe("35%");
    expect(screen.getByText("Deploy Gradually", { selector: "strong" })).toBeInTheDocument();
    expect(screen.getByText("Light Pressure", { selector: "strong" })).toBeInTheDocument();
  });

  it("exposes meter semantics for the gauge track", () => {
    render(<Gauge report={demoReport} />);
    const meter = screen.getByRole("meter", { name: "Deployment intensity" });
    expect(meter).toHaveAttribute("aria-valuenow", "35");
    expect(meter.getAttribute("aria-valuetext")).toMatch(/Deploy Gradually/);
  });

  it("opens and closes the explanation dialog with every reason listed", async () => {
    const user = userEvent.setup();
    render(<Gauge report={demoReport} />);

    await user.click(screen.getByRole("button", { name: /why this score/i }));
    for (const reason of demoReport.deployment.reasons) {
      expect(screen.getByText(reason)).toBeInTheDocument();
    }

    await user.click(screen.getByRole("button", { name: /close explanation/i }));
    const dialog = document.querySelector("dialog");
    expect(dialog?.open).toBeFalsy();
  });
});
