import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import AppShell from "./AppShell";
import React from "react";
import { usePathname } from "next/navigation";

// Mock next/navigation
vi.mock("next/navigation", () => ({
  usePathname: vi.fn(() => "/")
}));

// Mock auraPath
vi.mock("../app/lib/auraPath", () => ({
  stripAuraBasePath: vi.fn((path) => path)
}));

describe("AppShell", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders both desktop and mobile navigation", () => {
    vi.mocked(usePathname).mockReturnValue("/");
    render(<AppShell>Test Content</AppShell>);
    
    const desktopNav = screen.getByLabelText("Desktop Primary");
    const mobileNav = screen.getByLabelText("Mobile Primary");
    
    expect(desktopNav).toBeDefined();
    expect(mobileNav).toBeDefined();
    
    // Check for navigation labels - using getAllByText since we have two versions (desktop & mobile)
    const homeLabels = screen.getAllByText("Home");
    const notesLabels = screen.getAllByText("Fleeting Notes");
    const settingsLabels = screen.getAllByText("Settings");
    
    expect(homeLabels.length).toBeGreaterThanOrEqual(2);
    expect(notesLabels.length).toBeGreaterThanOrEqual(2);
    expect(settingsLabels.length).toBeGreaterThanOrEqual(2);
  });

  it("highlights the active link based on pathname", () => {
    vi.mocked(usePathname).mockReturnValue("/settings");
    
    render(<AppShell>Test Content</AppShell>);
    
    // Check for aria-current="page" on the active links
    const activeLinks = screen.getAllByRole("link", { current: "page" });
    expect(activeLinks.length).toBe(2);
    
    activeLinks.forEach(link => {
      expect(link.textContent).toMatch(/settings/i);
    });
  });

  it("renders the children content", () => {
    render(<AppShell><div data-testid="test-child">Child Content</div></AppShell>);
    expect(screen.getByTestId("test-child")).toBeDefined();
    expect(screen.getByText("Child Content")).toBeDefined();
  });
});
