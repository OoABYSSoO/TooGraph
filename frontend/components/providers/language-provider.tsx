"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

type Language = "zh" | "en";

type LanguageContextValue = {
  language: Language;
  setLanguage: (language: Language) => void;
  t: (key: string) => string;
};

const STORAGE_KEY = "graphiteui:language";

const messages = {
  zh: {
    "nav.home": "首页",
    "nav.workspace": "工作台",
    "nav.editor": "编排器",
    "nav.skills": "技能",
    "nav.runs": "运行记录",
    "nav.knowledge": "知识库",
    "nav.memories": "记忆",
    "nav.settings": "设置",
    "lang.label": "语言",
    "lang.zh": "中文",
    "lang.en": "英文",
    "layout.note": "面向 LangGraph 工作流的可视化编排工作台。",
    "home.eyebrow": "可视化编排 + 运行观察",
    "home.title": "把工作流做成真正可观察、可回看的产品界面。",
    "home.desc": "GraphiteUI 把 LangGraph agent 逻辑组织成带编辑器、运行观察、历史记录和资产视图的工作台。",
    "home.enter": "进入工作台",
    "home.open_editor": "打开编排器",
    "home.workspace": "工作台",
    "home.workspace_desc": "查看最近 graph、最近 runs、快捷入口和整体状态。",
    "home.editor": "编排器",
    "home.editor_desc": "通过节点面板、画布、配置面板和工具栏搭建工作流。",
    "home.runtime": "运行时",
    "home.runtime_desc": "查看当前节点、节点执行摘要、revision 路由和最终产物。",
    "workspace.eyebrow": "工作台",
    "workspace.title": "最近的 graph、运行状态和下一步入口。",
    "workspace.desc": "这是 GraphiteUI 的总览页，负责引导进入 editor，但不把画布直接塞进工作台。",
    "knowledge.eyebrow": "知识库",
    "knowledge.title": "运行时可读取的知识源。",
    "knowledge.desc": "这个页面展示后端知识存储中的真实文档条目。",
    "memories.eyebrow": "记忆",
    "memories.title": "运行时可回看的历史模式。",
    "memories.desc": "这个页面展示当前存储中的真实记忆条目。",
    "settings.eyebrow": "设置",
    "settings.title": "运行与模型默认配置。",
    "settings.desc": "这里可以配置全局默认模型、thinking 和温度，新建 agent 节点会从这里起步。",
    "skills.eyebrow": "技能",
    "skills.title": "统一查看当前 skill、运行注册状态和兼容缺口。",
    "skills.desc": "这个页面先把已有 skill 看清楚，后续再在同一页继续推进 Claude Code / Codex 原生兼容。",
    "runs.eyebrow": "运行记录",
    "runs.title": "历史运行结果与运行状态。",
    "runs.desc": "这个页面已经接入后端真实 run 数据。",
    "runs.search": "按 graph 名称搜索",
    "runs.filter": "按状态筛选",
    "run_detail.eyebrow": "运行详情",
    "run_detail.title": "运行详情",
    "run_detail.desc": "这个页面展示后端返回的真实 run detail、节点摘要和产物信息。",
    "run_detail.status": "状态",
    "run_detail.current_node": "当前节点",
    "run_detail.completed": "已完成",
    "run_detail.revisions": "修订轮次",
    "run_detail.score": "评分",
    "run_detail.artifacts": "产物摘要",
    "run_detail.knowledge": "知识",
    "run_detail.memory": "记忆",
    "run_detail.final_result": "最终结果",
    "run_detail.no_knowledge": "暂无知识摘要。",
    "run_detail.no_memory": "暂无记忆摘要。",
    "run_detail.no_result": "暂无最终结果。",
    "run_detail.timeline": "节点时间线",
    "editor.eyebrow": "编排器",
    "editor.desc": "当前编排器支持节点创建、连线、移动、配置、本地保存和后端联调。",
    "editor.validate": "校验图",
    "editor.save": "保存图",
    "editor.run": "运行图",
    "editor.save_local": "保存本地草稿",
    "editor.simulate": "模拟运行",
    "editor.palette": "节点面板",
    "editor.config": "配置面板",
    "editor.graph_name": "图名称",
    "editor.node_name": "节点名称",
    "editor.description": "描述",
    "editor.advanced": "高级节点数据 JSON",
    "editor.latest_run": "最近一次运行",
    "editor.open_run": "打开运行详情",
    "editor.latest_execution": "最近执行摘要",
    "editor.loading_runs": "正在加载运行记录...",
    "common.loading": "加载中...",
    "common.no_data": "暂无数据",
    "common.failed": "加载失败",
    "common.quick_actions": "快捷入口",
    "common.recent_graphs": "最近 Graph",
    "common.recent_runs": "最近 Runs",
    "common.running_jobs": "运行中任务",
    "common.failed_runs": "失败运行",
    "common.search_docs": "搜索文档",
    "common.open_detail": "查看详情",
    "common.filter_memory": "按 memory_type 过滤"
  },
  en: {
    "nav.home": "Home",
    "nav.workspace": "Workspace",
    "nav.editor": "Editor",
    "nav.skills": "Skills",
    "nav.runs": "Runs",
    "nav.knowledge": "Knowledge",
    "nav.memories": "Memories",
    "nav.settings": "Settings",
    "lang.label": "Language",
    "lang.zh": "Chinese",
    "lang.en": "English",
    "layout.note": "Visual orchestration workspace for LangGraph workflows.",
    "home.eyebrow": "Visual Editing + Runtime Visibility",
    "home.title": "Turn workflows into interfaces people can inspect.",
    "home.desc": "GraphiteUI organizes LangGraph agent logic into a workspace with an editor, runtime observation, history, and asset views.",
    "home.enter": "Enter Workspace",
    "home.open_editor": "Open Editor",
    "home.workspace": "Workspace",
    "home.workspace_desc": "Review recent graphs, recent runs, quick actions, and overall status.",
    "home.editor": "Editor",
    "home.editor_desc": "Build workflows through the node palette, canvas, config panel, and toolbar.",
    "home.runtime": "Runtime",
    "home.runtime_desc": "Inspect current node, node execution summaries, revision routing, and final artifacts.",
    "workspace.eyebrow": "Workspace",
    "workspace.title": "Recent graphs, active runs, and next actions.",
    "workspace.desc": "This is the overview page for GraphiteUI. It guides people into the editor without putting the canvas in the dashboard itself.",
    "knowledge.eyebrow": "Knowledge",
    "knowledge.title": "Knowledge sources available to runtime.",
    "knowledge.desc": "This page shows real documents from backend knowledge storage.",
    "memories.eyebrow": "Memories",
    "memories.title": "Historical patterns the runtime can revisit.",
    "memories.desc": "This page shows real memory entries currently stored.",
    "settings.eyebrow": "Settings",
    "settings.title": "Runtime and model defaults.",
    "settings.desc": "Configure global default model, thinking, and temperature. New agent nodes start from these values.",
    "skills.eyebrow": "Skills",
    "skills.title": "Inspect current skills, runtime registration, and compatibility gaps.",
    "skills.desc": "This page makes the current skill registry visible first, then becomes the base for Claude Code and Codex native compatibility work.",
    "runs.eyebrow": "Runs",
    "runs.title": "Historical runs and runtime outcomes.",
    "runs.desc": "This page now reads live run data from the backend.",
    "runs.search": "Search graph name",
    "runs.filter": "Filter by status",
    "run_detail.eyebrow": "Run Detail",
    "run_detail.title": "Run detail",
    "run_detail.desc": "This page shows live run detail, node summaries, and artifact context from the backend.",
    "run_detail.status": "Status",
    "run_detail.current_node": "Current node",
    "run_detail.completed": "Completed",
    "run_detail.revisions": "Revisions",
    "run_detail.score": "Score",
    "run_detail.artifacts": "Artifacts Summary",
    "run_detail.knowledge": "Knowledge",
    "run_detail.memory": "Memory",
    "run_detail.final_result": "Final Result",
    "run_detail.no_knowledge": "No knowledge summary available.",
    "run_detail.no_memory": "No memory summary available.",
    "run_detail.no_result": "No final result yet.",
    "run_detail.timeline": "Node Timeline",
    "editor.eyebrow": "Editor",
    "editor.desc": "The editor currently supports node creation, connections, movement, configuration, local saves, and backend integration.",
    "editor.validate": "Validate Graph",
    "editor.save": "Save Graph",
    "editor.run": "Run Graph",
    "editor.save_local": "Save Local Draft",
    "editor.simulate": "Simulate Run",
    "editor.palette": "Node Palette",
    "editor.config": "Config Panel",
    "editor.graph_name": "Graph Name",
    "editor.node_name": "Node Name",
    "editor.description": "Description",
    "editor.advanced": "Advanced Node Data JSON",
    "editor.latest_run": "Latest Run",
    "editor.open_run": "Open Run Detail",
    "editor.latest_execution": "Latest Execution",
    "editor.loading_runs": "Loading runs...",
    "common.loading": "Loading...",
    "common.no_data": "No data yet",
    "common.failed": "Failed to load",
    "common.quick_actions": "Quick Actions",
    "common.recent_graphs": "Recent Graphs",
    "common.recent_runs": "Recent Runs",
    "common.running_jobs": "Running Jobs",
    "common.failed_runs": "Failed Runs",
    "common.search_docs": "Search documents",
    "common.open_detail": "Open detail",
    "common.filter_memory": "Filter by memory_type"
  }
} as const;

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>("zh");

  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved === "zh" || saved === "en") {
      setLanguageState(saved);
      document.documentElement.lang = saved;
    } else {
      document.documentElement.lang = "zh";
    }
  }, []);

  const value = useMemo<LanguageContextValue>(
    () => ({
      language,
      setLanguage: (nextLanguage) => {
        setLanguageState(nextLanguage);
        window.localStorage.setItem(STORAGE_KEY, nextLanguage);
        document.documentElement.lang = nextLanguage;
      },
      t: (key) => messages[language][key as keyof (typeof messages)["zh"]] ?? key,
    }),
    [language],
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error("useLanguage must be used within LanguageProvider.");
  }
  return context;
}
