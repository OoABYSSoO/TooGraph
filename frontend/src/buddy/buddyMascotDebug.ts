export type BuddyMascotDebugAction =
  | "idle"
  | "thinking"
  | "speaking"
  | "error"
  | "tap"
  | "dragging"
  | "hop"
  | "roam"
  | "face-left"
  | "face-front"
  | "face-right";

export type BuddyMascotDebugActionGroup = {
  labelKey: "buddyPage.mascotDebug.groups.state" | "buddyPage.mascotDebug.groups.motion" | "buddyPage.mascotDebug.groups.facing";
  actions: Array<{
    label: string;
    action: BuddyMascotDebugAction;
  }>;
};

export const BUDDY_DEBUG_ACTION_GROUPS: BuddyMascotDebugActionGroup[] = [
  {
    labelKey: "buddyPage.mascotDebug.groups.state",
    actions: [
      { label: "Idle", action: "idle" },
      { label: "Thinking", action: "thinking" },
      { label: "Speaking", action: "speaking" },
      { label: "Error", action: "error" },
    ],
  },
  {
    labelKey: "buddyPage.mascotDebug.groups.motion",
    actions: [
      { label: "Tap", action: "tap" },
      { label: "Drag", action: "dragging" },
      { label: "Hop", action: "hop" },
      { label: "Roam", action: "roam" },
    ],
  },
  {
    labelKey: "buddyPage.mascotDebug.groups.facing",
    actions: [
      { label: "Left", action: "face-left" },
      { label: "Front", action: "face-front" },
      { label: "Right", action: "face-right" },
    ],
  },
];
