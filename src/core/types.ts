export type AssetKind = "prompt" | "skill";

export type DiscoveredAsset = {
	id: string;
	kind: AssetKind;
	source: string;
	path: string;
};

export type ScanReport = {
	home: string;
	scannedSources: string[];
	unsyncedPrompts: DiscoveredAsset[];
	unsyncedSkills: DiscoveredAsset[];
};
