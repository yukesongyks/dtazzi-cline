// PostHog telemetry is disabled for internal builds
// This file is kept for compatibility but returns disabled state

export const posthogApiKey: string | null = null;
export const posthogHost = "https://data.cline.bot";

export const posthogOptions = {};

export function isTelemetryEnabled(): boolean {
	return false;
}
