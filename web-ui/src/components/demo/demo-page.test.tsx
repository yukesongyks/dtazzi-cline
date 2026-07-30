import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { DemoPage } from "./demo-page";

vi.mock("./demo-api", () => ({
	fetchHelloWorld: vi.fn().mockResolvedValue({ success: true, type: "helloworld", data: "Hello, World!" }),
	fetchHash: vi.fn().mockResolvedValue({ success: true, type: "hash", data: "abc123" }),
	fetchBubbleSort: vi.fn().mockResolvedValue({ success: true, type: "bubblesort", data: [1, 2, 3] }),
	getExportUrl: vi.fn().mockReturnValue("/api/demo/export?type=helloworld&data=test"),
	fetchStats: vi.fn().mockResolvedValue({
		totalCalls: 0,
		byUserType: [],
		byUserLevel: [],
		byDepartment: [],
		trendByDay: [],
	}),
}));

describe("DemoPage", () => {
	it("renders page header and three tabs", () => {
		render(<DemoPage />);
		expect(screen.getByText("Hello World 1.0T2 演示页面")).toBeTruthy();
		expect(screen.getByText("HelloWorld")).toBeTruthy();
		expect(screen.getByText("哈希算法")).toBeTruthy();
		expect(screen.getByText("冒泡排序")).toBeTruthy();
	});

	it("shows HelloWorld tab content by default", () => {
		render(<DemoPage />);
		expect(screen.getByText("点击按钮执行 HelloWorld 接口。")).toBeTruthy();
	});
});
