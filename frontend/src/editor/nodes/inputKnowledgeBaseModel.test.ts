import test from "node:test";
import assert from "node:assert/strict";

import {
  buildInputKnowledgeBaseOptions,
  resolveSelectedKnowledgeBaseDescription,
} from "./inputKnowledgeBaseModel.ts";

const knowledgeBases = [
  {
    name: "toograph-official",
    label: "TooGraph Docs",
    description: "  Product documentation  ",
  },
  {
    name: "python-3.14",
    label: "  ",
    description: "",
  },
];

test("buildInputKnowledgeBaseOptions preserves NodeCard catalog presentation", () => {
  assert.deepEqual(buildInputKnowledgeBaseOptions(knowledgeBases, "toograph-official"), [
    {
      value: "toograph-official",
      label: "TooGraph Docs",
      description: "Product documentation",
    },
    {
      value: "python-3.14",
      label: "python-3.14",
      description: "",
    },
  ]);
});

test("buildInputKnowledgeBaseOptions keeps an unavailable current value selectable", () => {
  assert.deepEqual(buildInputKnowledgeBaseOptions(knowledgeBases, " imported-kb "), [
    {
      value: "imported-kb",
      label: "imported-kb (current)",
      description: "This knowledge base is no longer available in the imported catalog.",
    },
    {
      value: "toograph-official",
      label: "TooGraph Docs",
      description: "Product documentation",
    },
    {
      value: "python-3.14",
      label: "python-3.14",
      description: "",
    },
  ]);
});

test("resolveSelectedKnowledgeBaseDescription preserves NodeCard meta text rules", () => {
  const options = buildInputKnowledgeBaseOptions(knowledgeBases, "toograph-official");

  assert.equal(
    resolveSelectedKnowledgeBaseDescription({
      showKnowledgeBaseInput: false,
      selectedValue: "toograph-official",
      options,
      emptyOptionsDescription: "Import a knowledge base first.",
      fallbackDescription: "Choose a knowledge base for this input.",
    }),
    "",
  );
  assert.equal(
    resolveSelectedKnowledgeBaseDescription({
      showKnowledgeBaseInput: true,
      selectedValue: "toograph-official",
      options,
      emptyOptionsDescription: "Import a knowledge base first.",
      fallbackDescription: "Choose a knowledge base for this input.",
    }),
    "Product documentation",
  );
  assert.equal(
    resolveSelectedKnowledgeBaseDescription({
      showKnowledgeBaseInput: true,
      selectedValue: "python-3.14",
      options,
      emptyOptionsDescription: "Import a knowledge base first.",
      fallbackDescription: "Choose a knowledge base for this input.",
    }),
    "Choose a knowledge base for this input.",
  );
  assert.equal(
    resolveSelectedKnowledgeBaseDescription({
      showKnowledgeBaseInput: true,
      selectedValue: "",
      options: [],
      emptyOptionsDescription: "Import a knowledge base first.",
      fallbackDescription: "Choose a knowledge base for this input.",
    }),
    "Import a knowledge base first.",
  );
});
