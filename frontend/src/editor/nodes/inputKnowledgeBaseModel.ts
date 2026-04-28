import type { KnowledgeBaseRecord } from "@/types/knowledge";

export type InputKnowledgeBaseRecord = Pick<KnowledgeBaseRecord, "name" | "label" | "description">;

export type InputKnowledgeBaseOption = {
  value: string;
  label: string;
  description: string;
};

const CURRENT_KNOWLEDGE_BASE_UNAVAILABLE_DESCRIPTION = "This knowledge base is no longer available in the imported catalog.";

export function buildInputKnowledgeBaseOptions(
  knowledgeBases: readonly InputKnowledgeBaseRecord[],
  currentValue: string | null | undefined,
): InputKnowledgeBaseOption[] {
  const options = knowledgeBases.map((knowledgeBase) => ({
    value: knowledgeBase.name,
    label: knowledgeBase.label?.trim() || knowledgeBase.name,
    description: knowledgeBase.description?.trim() || "",
  }));

  const trimmedCurrentValue = currentValue?.trim() ?? "";
  if (trimmedCurrentValue && !options.some((option) => option.value === trimmedCurrentValue)) {
    return [
      {
        value: trimmedCurrentValue,
        label: `${trimmedCurrentValue} (current)`,
        description: CURRENT_KNOWLEDGE_BASE_UNAVAILABLE_DESCRIPTION,
      },
      ...options,
    ];
  }

  return options;
}

export function resolveSelectedKnowledgeBaseDescription(input: {
  showKnowledgeBaseInput: boolean;
  selectedValue: string;
  options: readonly InputKnowledgeBaseOption[];
  emptyOptionsDescription: string;
  fallbackDescription: string;
}) {
  if (!input.showKnowledgeBaseInput) {
    return "";
  }

  const selectedOption = input.options.find((option) => option.value === input.selectedValue);
  if (selectedOption?.description) {
    return selectedOption.description;
  }

  if (input.options.length === 0) {
    return input.emptyOptionsDescription;
  }

  return input.fallbackDescription;
}
