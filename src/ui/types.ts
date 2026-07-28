export type Size = {
  width: number;
  height: number;
};

export type AtlasFrame = {
  x: number;
  y: number;
  w: number;
  h: number;
  offsetX: number;
  offsetY: number;
};

export type ActionFrame = {
  ref: string;
  durationMs: number;
};

export type PetAction = {
  loop: boolean;
  frames: ActionFrame[];
  cuePoints: Array<{
    name: string;
    timeMs: number;
  }>;
};

export type PetManifest = {
  schemaVersion: number;
  id: string;
  version: string;
  displayName: string;
  description: string;
  canvas: Size;
  actions: Record<string, PetAction>;
};

export type AtlasManifest = {
  imagePath: string;
  pixelWidth: number;
  pixelHeight: number;
  frames: Record<string, AtlasFrame>;
};

export type ValidationIssue = {
  severity: "error" | "warning";
  code: string;
  path: string;
  message: string;
};

export type PetPackPayload = {
  revision: number;
  manifest: PetManifest;
  atlas: AtlasManifest;
  summary: {
    id: string;
    version: string;
    displayName: string;
    description: string;
    canvas: Size;
    atlasImage: string;
    actionCount: number;
    frameCount: number;
    actions: Array<{
      name: string;
      frameCount: number;
      durationMs: number;
      loops: boolean;
    }>;
    warnings: ValidationIssue[];
  };
  imageUrl: string;
};

export type ShellSnapshot = {
  clickThrough: boolean;
  alwaysOnTop: boolean;
  visibleOnAllWorkspaces: boolean;
};

export type BehaviorStep = {
  action: string;
  reason: string;
  holdMs: number;
};

export type CommandError = {
  code: string;
  message: string;
  details: ValidationIssue[];
  revision: number | null;
};
