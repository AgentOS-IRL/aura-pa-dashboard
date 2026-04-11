import { BACKEND_PATH_PREFIX } from "./auraPath";

const isProd = process.env.NODE_ENV === "production";
const BACKEND_BASE_URL = (process.env.NEXT_PUBLIC_BACKEND_URL ?? (isProd ? "" : "http://localhost:4000")).replace(/\/$/, "");

export interface RateLimitWindow {
  used_percent: number;
  limit_window_seconds: number;
  reset_after_seconds: number;
  reset_at: number;
}

export interface RateLimit {
  allowed: boolean;
  limit_reached: boolean;
  primary_window?: RateLimitWindow;
  secondary_window?: RateLimitWindow;
}

export interface Credits {
  has_credits: boolean;
  unlimited: boolean;
  overage_limit_reached: boolean;
  balance: string;
  approx_local_messages?: number[] | null;
  approx_cloud_messages?: number[] | null;
}

export interface SpendControl {
  reached: boolean;
}

export interface CodexUsage {
  plan_type: string;
  rate_limit: RateLimit;
  code_review_rate_limit: Record<string, unknown> | null;
  additional_rate_limits: Record<string, unknown> | null;
  credits: Credits;
  spend_control: SpendControl;
  promo: Record<string, unknown> | null;
}

const USAGE_PATH = `${BACKEND_PATH_PREFIX}/usage`;

export async function fetchUsage(): Promise<CodexUsage> {
  const url = `${BACKEND_BASE_URL}${USAGE_PATH}`;
  const response = await fetch(url, { method: "GET" });
  if (!response.ok) {
    const message = await response.text().catch(() => response.statusText);
    throw new Error(`Failed to load OpenAI usage (${response.status}): ${message}`);
  }
  return (await response.json()) as CodexUsage;
}
