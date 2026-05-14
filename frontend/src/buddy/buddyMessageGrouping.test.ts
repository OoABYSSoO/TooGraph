import assert from "node:assert/strict";
import test from "node:test";

import { shouldShowGroupedBuddyMessageLabel } from "./buddyMessageGrouping.ts";

type Message = {
  role: "user" | "assistant";
  visible: boolean;
};

const isVisible = (message: Message) => message.visible;

test("shouldShowGroupedBuddyMessageLabel shows only the first label in a visible role run", () => {
  const messages: Message[] = [
    { role: "user", visible: true },
    { role: "assistant", visible: true },
    { role: "assistant", visible: true },
    { role: "assistant", visible: true },
    { role: "user", visible: true },
    { role: "user", visible: true },
  ];

  assert.equal(shouldShowGroupedBuddyMessageLabel(messages, 0, isVisible), true);
  assert.equal(shouldShowGroupedBuddyMessageLabel(messages, 1, isVisible), true);
  assert.equal(shouldShowGroupedBuddyMessageLabel(messages, 2, isVisible), false);
  assert.equal(shouldShowGroupedBuddyMessageLabel(messages, 3, isVisible), false);
  assert.equal(shouldShowGroupedBuddyMessageLabel(messages, 4, isVisible), true);
  assert.equal(shouldShowGroupedBuddyMessageLabel(messages, 5, isVisible), false);
});

test("shouldShowGroupedBuddyMessageLabel ignores hidden controller messages between visible messages", () => {
  const messages: Message[] = [
    { role: "user", visible: true },
    { role: "assistant", visible: false },
    { role: "assistant", visible: true },
    { role: "assistant", visible: true },
  ];

  assert.equal(shouldShowGroupedBuddyMessageLabel(messages, 2, isVisible), true);
  assert.equal(shouldShowGroupedBuddyMessageLabel(messages, 3, isVisible), false);
});
