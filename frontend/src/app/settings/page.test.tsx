import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { CodexUsage } from "../lib/usage";
import SettingsPage from "./page";

const usageMock: CodexUsage = {
  plan_type: "pro",
  rate_limit: {
    allowed: true,
    limit_reached: false,
    primary_window: {
      used_percent: 42,
      limit_window_seconds: 60,
      reset_after_seconds: 30,
      reset_at: Math.floor(Date.now() / 1000) + 60
    },
    secondary_window: {
      used_percent: 68,
      limit_window_seconds: 60,
      reset_after_seconds: 30,
      reset_at: Math.floor(Date.now() / 1000) + 120
    }
  },
  code_review_rate_limit: null,
  additional_rate_limits: null,
  credits: {
    has_credits: true,
    unlimited: false,
    overage_limit_reached: false,
    balance: "$10",
    approx_local_messages: [1, 2],
    approx_cloud_messages: [3]
  },
  spend_control: { reached: false },
  promo: null
};

vi.mock("../lib/usage", () => ({
  fetchUsage: vi.fn(() => Promise.resolve(usageMock))
}));

vi.mock("../lib/classifications", () => ({
  fetchClassifications: vi.fn(() => Promise.resolve([])),
  saveClassification: vi.fn(),
  deleteClassification: vi.fn()
}));

describe("SettingsPage", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("renders the view selector and toggles panels", async () => {
    render(<SettingsPage />);

    await screen.findByRole("tab", { name: "Usage monitoring" });
    screen.getByRole("tab", { name: "Classification metadata" });

    await screen.findByRole("heading", { name: "Usage monitoring" });
    await screen.findByText("Raw payload");

    fireEvent.click(screen.getByRole("tab", { name: "Classification metadata" }));

    await screen.findByRole("heading", { name: "Manage classification metadata" });
    expect(screen.queryByText("Raw payload")).toBeNull();
  });
});
