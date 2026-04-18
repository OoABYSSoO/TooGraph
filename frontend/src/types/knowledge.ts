export type KnowledgeBaseRecord = {
  name: string;
  kb_id: string;
  label: string;
  description: string;
  sourceKind: string;
  sourceUrl: string;
  version: string;
  documentCount: number;
  chunkCount: number;
  importedAt: string;
};
