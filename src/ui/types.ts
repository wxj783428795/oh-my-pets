export type Size = {
  width: number;
  height: number;
};

export type Point = {
  x: number;
  y: number;
};

export type Rect = Point & Size;

export type PetLayout = {
  baseline: Point;
  hitbox: Rect;
  dropZone: Rect;
  bubbleAnchor: Point;
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
  layout: PetLayout;
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

export type PetSize = "small" | "medium" | "large";
export type ActivityFrequency = "low" | "standard" | "high";

export type ProductStateSnapshot = {
  preferences: {
    petSize: PetSize;
    activityFrequency: ActivityFrequency;
    launchAtLogin: boolean;
    lastValidPosition: { x: number; y: number } | null;
    onboardingSeen: boolean;
  };
  session: {
    quietMode: boolean;
    petHidden: boolean;
    clickThrough: boolean;
    currentAction: string;
    velocity: { x: number; y: number };
    behaviorTimerMs: number | null;
  };
  preferenceHealth: {
    kind: "healthy" | "missing" | "migrated" | "recovered";
    message: string;
  };
};

export type BehaviorStep = {
  action: string;
  reason: string;
  holdMs: number;
};

export type InteractionPayload = {
  kind: "ignored" | "captured" | "action" | "dragging" | "throw";
  captureId?: number;
  revision?: number;
  action?: string;
  holdMs?: number;
  completeOnFinish?: boolean;
};

export type CommandError = {
  code: string;
  message: string;
  details: ValidationIssue[];
  revision: number | null;
};
