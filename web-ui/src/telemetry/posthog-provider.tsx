import type { ReactElement, ReactNode } from "react";

// TelemetryProvider is a no-op wrapper for internal builds
// PostHog has been removed to avoid external dependencies
export function TelemetryProvider({ children }: { children: ReactNode }): ReactElement {
	return <>{children}</>;
}
