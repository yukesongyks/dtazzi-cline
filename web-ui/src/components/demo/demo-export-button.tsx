import { Download } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { getExportUrl } from "./demo-api";

interface DemoExportButtonProps {
	type: string;
	data: string;
}

export function DemoExportButton({ type, data }: DemoExportButtonProps) {
	const [loading, setLoading] = useState(false);

	const handleExport = () => {
		setLoading(true);
		const url = getExportUrl(type, data);
		window.location.href = url;
		setTimeout(() => setLoading(false), 1000);
	};

	return (
		<Button
			variant="default"
			icon={<Download size={16} />}
			onClick={handleExport}
			fill
		>
			{loading ? "导出中..." : "导出结果"}
		</Button>
	);
}
