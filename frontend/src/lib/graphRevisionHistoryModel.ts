import type { GraphDocument, GraphRevisionRecord } from "../types/node-system.ts";

export type GraphRevisionHistoryRow = {
  revisionId: string;
  reason: string;
  createdAt: string;
  actor: string;
  runId: string;
  nodeId: string;
  previousName: string;
  nextName: string;
  diffCount: number;
  restoresToDeletion: boolean;
};

export function buildGraphRevisionHistoryRows(revisions: GraphRevisionRecord[]): GraphRevisionHistoryRow[] {
  return revisions.map((revision) => ({
    revisionId: revision.revision_id,
    reason: revision.reason,
    createdAt: revision.created_at,
    actor: revision.actor,
    runId: revision.run_id,
    nodeId: revision.node_id,
    previousName: readGraphName(revision.previous_graph),
    nextName: readGraphName(revision.next_graph),
    diffCount: revision.diff.length,
    restoresToDeletion: revision.previous_graph === null,
  }));
}

function readGraphName(graph: GraphDocument | null): string {
  return graph?.name ?? "";
}
