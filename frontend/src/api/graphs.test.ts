import test from "node:test";
import assert from "node:assert/strict";

import {
  deleteGraph,
  deleteTemplate,
  exportLangGraphPython,
  fetchGraph,
  fetchGraphRevisions,
  fetchGraphs,
  fetchTemplate,
  fetchTemplates,
  importGraphFromPythonSource,
  restoreGraphRevision,
  runGraph,
  saveGraph,
  saveGraphAsTemplate,
  updateGraphStatus,
  updateTemplateCapabilityDiscoverable,
  updateTemplateStatus,
} from "./graphs.ts";
import { ApiHttpError } from "./http.ts";
import type { GraphPayload } from "@/types/node-system";

const originalFetch = globalThis.fetch;

test("exportLangGraphPython posts graph payload and returns raw Python source", async () => {
  let requestedUrl = "";
  let requestBody = "";

  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    requestedUrl = String(input);
    requestBody = String(init?.body ?? "");
    return new Response("from langgraph.graph import StateGraph\n", {
      status: 200,
      headers: {
        "Content-Type": "text/x-python",
      },
    });
  }) as typeof fetch;

  const payload: GraphPayload = {
    graph_id: null,
    name: "Export Demo",
    state_schema: {},
    nodes: {},
    edges: [],
    conditional_edges: [],
    metadata: {},
  };

  const source = await exportLangGraphPython(payload);

  assert.equal(requestedUrl, "/api/graphs/export/langgraph-python");
  assert.deepEqual(JSON.parse(requestBody), payload);
  assert.equal(source, "from langgraph.graph import StateGraph\n");

  globalThis.fetch = originalFetch;
});

test("importGraphFromPythonSource posts Python source and returns an imported graph payload", async () => {
  let requestedUrl = "";
  let requestBody = "";

  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    requestedUrl = String(input);
    requestBody = String(init?.body ?? "");
    return new Response(
      JSON.stringify({
        graph_id: null,
        name: "Imported Graph",
        state_schema: {},
        nodes: {},
        edges: [],
        conditional_edges: [],
        metadata: {},
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
        },
      },
    );
  }) as typeof fetch;

  const graph = await importGraphFromPythonSource("TOOGRAPH_EXPORT_VERSION = 1");

  assert.equal(requestedUrl, "/api/graphs/import/python");
  assert.deepEqual(JSON.parse(requestBody), { source: "TOOGRAPH_EXPORT_VERSION = 1" });
  assert.equal(graph.name, "Imported Graph");

  globalThis.fetch = originalFetch;
});

test("saveGraphAsTemplate posts graph payload to the template save endpoint", async () => {
  let requestedUrl = "";
  let requestBody = "";

  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    requestedUrl = String(input);
    requestBody = String(init?.body ?? "");
    return new Response(
      JSON.stringify({
        template_id: "user_template_1",
        saved: true,
        template: {
          template_id: "user_template_1",
          label: "Template Graph",
          description: "",
          default_graph_name: "Template Graph",
          source: "user",
          state_schema: {},
          nodes: {},
          edges: [],
          conditional_edges: [],
          metadata: {},
        },
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
        },
      },
    );
  }) as typeof fetch;

  const payload: GraphPayload = {
    graph_id: null,
    name: "Template Graph",
    state_schema: {},
    nodes: {},
    edges: [],
    conditional_edges: [],
    metadata: {},
  };

  const response = await saveGraphAsTemplate(payload);

  assert.equal(requestedUrl, "/api/templates/save");
  assert.deepEqual(JSON.parse(requestBody), payload);
  assert.equal(response.template_id, "user_template_1");

  globalThis.fetch = originalFetch;
});

test("saveGraphAsTemplate preserves structured validation issues from template save failures", async () => {
  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({
        detail: {
          valid: false,
          issues: [
            {
              code: "input_node_write_count_invalid",
              message: "Input node 'input_0edfba58' must define exactly one written state.",
              path: "nodes.input_0edfba58.writes",
            },
          ],
        },
      }),
      {
        status: 422,
        headers: {
          "Content-Type": "application/json",
        },
      },
    )) as typeof fetch;

  const payload: GraphPayload = {
    graph_id: null,
    name: "Invalid Template Graph",
    state_schema: {},
    nodes: {},
    edges: [],
    conditional_edges: [],
    metadata: {},
  };

  try {
    await assert.rejects(
      () => saveGraphAsTemplate(payload),
      (error: unknown) => {
        assert.ok(error instanceof ApiHttpError);
        assert.equal(error.status, 422);
        assert.equal(error.method, "POST");
        assert.equal(error.path, "/api/templates/save");
        assert.deepEqual(error.validationIssues, [
          {
            code: "input_node_write_count_invalid",
            message: "Input node 'input_0edfba58' must define exactly one written state.",
            path: "nodes.input_0edfba58.writes",
          },
        ]);
        return true;
      },
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("saveGraph can attach revision context to the saved graph request", async () => {
  let requestedUrl = "";
  let requestBody = "";

  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    requestedUrl = String(input);
    requestBody = String(init?.body ?? "");
    return new Response(
      JSON.stringify({
        graph_id: "graph_1",
        saved: true,
        revision_id: "grev_1",
        validation: { valid: true, issues: [] },
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
        },
      },
    );
  }) as typeof fetch;

  const payload: GraphPayload = {
    graph_id: "graph_1",
    name: "Revision Context Demo",
    state_schema: {},
    nodes: {},
    edges: [],
    conditional_edges: [],
    metadata: {},
  };

  try {
    const response = await saveGraph(payload, {
      revisionContext: {
        actor: "buddy",
        run_id: "run_graph_edit",
        node_id: "execute_page_operation",
        reason: "Persist Buddy graph edit playback.",
      },
    });

    assert.equal(requestedUrl, "/api/graphs/save");
    assert.deepEqual(JSON.parse(requestBody), {
      ...payload,
      revision_context: {
        actor: "buddy",
        run_id: "run_graph_edit",
        node_id: "execute_page_operation",
        reason: "Persist Buddy graph edit playback.",
      },
    });
    assert.equal(response.revision_id, "grev_1");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("fetchGraphs and fetchTemplates can request the management catalog including disabled items", async () => {
  const requestedUrls: string[] = [];

  globalThis.fetch = (async (input: string | URL | Request) => {
    requestedUrls.push(String(input));
    return new Response(JSON.stringify([]), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
      },
    });
  }) as typeof fetch;

  try {
    await fetchGraphs();
    await fetchGraphs({ includeDisabled: true });
    await fetchTemplates();
    await fetchTemplates({ includeDisabled: true });

    assert.deepEqual(requestedUrls, [
      "/api/graphs",
      "/api/graphs?include_disabled=true",
      "/api/templates",
      "/api/templates?include_disabled=true",
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("fetchGraphRevisions requests graph revision history", async () => {
  let requestedUrl = "";

  globalThis.fetch = (async (input: string | URL | Request) => {
    requestedUrl = String(input);
    return new Response(
      JSON.stringify([
        {
          revision_id: "grev_1",
          graph_id: "graph_1",
          previous_graph: null,
          next_graph: null,
          diff: [],
          actor: "buddy",
          run_id: "run_1",
          node_id: "node_1",
          reason: "Graph edit playback.",
          validation: { valid: true, issues: [] },
          created_at: "2026-05-18T10:00:00Z",
        },
      ]),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
        },
      },
    );
  }) as typeof fetch;

  try {
    const revisions = await fetchGraphRevisions("graph_1");

    assert.equal(requestedUrl, "/api/graphs/graph_1/revisions");
    assert.equal(revisions[0]?.revision_id, "grev_1");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("graph and template helpers encode readable ids in path segments", async () => {
  const requestedUrls: string[] = [];

  globalThis.fetch = (async (input: string | URL | Request) => {
    requestedUrls.push(String(input));
    return new Response(JSON.stringify({}), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
      },
    });
  }) as typeof fetch;

  try {
    await fetchGraph("我的 图(1)");
    await fetchTemplate("模板 A(2)");
    await fetchGraphRevisions("我的 图(1)");
    await restoreGraphRevision("我的 图(1)", "grev 1");
    await updateGraphStatus("我的 图(1)", "disabled");
    await deleteGraph("我的 图(1)");
    await updateTemplateStatus("模板 A(2)", "active");
    await updateTemplateCapabilityDiscoverable("模板 A(2)", true);
    await deleteTemplate("模板 A(2)");

    assert.deepEqual(requestedUrls, [
      "/api/graphs/%E6%88%91%E7%9A%84%20%E5%9B%BE(1)",
      "/api/templates/%E6%A8%A1%E6%9D%BF%20A(2)",
      "/api/graphs/%E6%88%91%E7%9A%84%20%E5%9B%BE(1)/revisions",
      "/api/graphs/%E6%88%91%E7%9A%84%20%E5%9B%BE(1)/revisions/grev%201/restore",
      "/api/graphs/%E6%88%91%E7%9A%84%20%E5%9B%BE(1)/disable",
      "/api/graphs/%E6%88%91%E7%9A%84%20%E5%9B%BE(1)",
      "/api/templates/%E6%A8%A1%E6%9D%BF%20A(2)/enable",
      "/api/templates/%E6%A8%A1%E6%9D%BF%20A(2)/capability-discoverable",
      "/api/templates/%E6%A8%A1%E6%9D%BF%20A(2)",
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("restoreGraphRevision posts to the graph revision restore endpoint", async () => {
  const requests: Array<{ url: string; method: string | undefined; body: string | null }> = [];

  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    requests.push({
      url: String(input),
      method: init?.method,
      body: typeof init?.body === "string" ? init.body : null,
    });
    return new Response(
      JSON.stringify({
        graph_id: "graph_1",
        restored: true,
        graph: null,
        revision: {
          revision_id: "grev_restore",
          graph_id: "graph_1",
          previous_graph: null,
          next_graph: null,
          diff: [],
          actor: "user",
          run_id: "",
          node_id: "",
          reason: "Restore graph revision grev_1.",
          validation: { valid: true, issues: [] },
          created_at: "2026-05-18T10:00:01Z",
        },
        restored_revision_id: "grev_restore",
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
        },
      },
    );
  }) as typeof fetch;

  try {
    const response = await restoreGraphRevision("graph_1", "grev_1");

    assert.deepEqual(requests, [{ url: "/api/graphs/graph_1/revisions/grev_1/restore", method: "POST", body: "null" }]);
    assert.equal(response.revision.revision_id, "grev_restore");
    assert.equal(response.restored_revision_id, "grev_restore");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("graph and template management helpers call status and delete endpoints", async () => {
  const requests: Array<{ url: string; method: string | undefined; body: string | null }> = [];

  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    requests.push({
      url: String(input),
      method: init?.method,
      body: typeof init?.body === "string" ? init.body : null,
    });
    return new Response(
      JSON.stringify({
        graph_id: "graph_1",
        template_id: "template_1",
        status: "active",
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
        },
      },
    );
  }) as typeof fetch;

  try {
    await updateGraphStatus("graph_1", "disabled");
    await updateGraphStatus("graph_1", "active");
    await deleteGraph("graph_1");
    await updateTemplateStatus("template_1", "disabled");
    await updateTemplateStatus("template_1", "active");
    await updateTemplateCapabilityDiscoverable("template_1", false);
    await deleteTemplate("template_1");

    assert.deepEqual(requests, [
      { url: "/api/graphs/graph_1/disable", method: "POST", body: "null" },
      { url: "/api/graphs/graph_1/enable", method: "POST", body: "null" },
      { url: "/api/graphs/graph_1", method: "DELETE", body: null },
      { url: "/api/templates/template_1/disable", method: "POST", body: "null" },
      { url: "/api/templates/template_1/enable", method: "POST", body: "null" },
      {
        url: "/api/templates/template_1/capability-discoverable",
        method: "POST",
        body: JSON.stringify({ capabilityDiscoverable: false }),
      },
      { url: "/api/templates/template_1", method: "DELETE", body: null },
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("runGraph surfaces backend validation issue details for failed requests", async () => {
  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({
        detail: {
          valid: false,
          issues: [
            {
              code: "edge_source_kind_invalid",
              message: "Node 'output_final_summary' cannot emit a plain control-flow edge.",
              path: "edges.13",
            },
          ],
        },
      }),
      {
        status: 422,
        headers: {
          "Content-Type": "application/json",
        },
      },
    )) as typeof fetch;

  const payload: GraphPayload = {
    graph_id: null,
    name: "Invalid Graph",
    state_schema: {},
    nodes: {},
    edges: [],
    conditional_edges: [],
    metadata: {},
  };

  await assert.rejects(
    () => runGraph(payload),
    /POST \/api\/graphs\/run failed with status 422: Node 'output_final_summary' cannot emit a plain control-flow edge\. \(edges\.13\)/,
  );

  globalThis.fetch = originalFetch;
});

test("runGraph surfaces FastAPI request validation details for failed requests", async () => {
  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({
        detail: [
          {
            type: "missing",
            loc: ["body", "nodes"],
            msg: "Field required",
          },
        ],
      }),
      {
        status: 422,
        headers: {
          "Content-Type": "application/json",
        },
      },
    )) as typeof fetch;

  const payload: GraphPayload = {
    graph_id: null,
    name: "Invalid Graph",
    state_schema: {},
    nodes: {},
    edges: [],
    conditional_edges: [],
    metadata: {},
  };

  await assert.rejects(
    () => runGraph(payload),
    /POST \/api\/graphs\/run failed with status 422: Field required \(body\.nodes\)/,
  );

  globalThis.fetch = originalFetch;
});
