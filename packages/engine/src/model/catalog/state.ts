/**
 * 模型目录运行时状态：进程级目录 / 选用 / 路由上下文，run 内以 RunContext 为准。
 */
import {
  buildModelCandidates,
  type ModelCatalog,
  type ModelEntry,
  type ModelSelection,
  resolveModelSettings,
} from "@thinker-workbench/shared";
import { getRunContext } from "../../runtime/runContext";
import { configureChatModel } from "../openai";

/** 进程级目录与选用（hello / 无 ALS）；run 内以 RunContext 为准。 */
let catalog: ModelCatalog | null = null;
let selection: ModelSelection = { mode: "auto" };
/** 本轮用户文本 / 路径 / 是否含图（供 Auto 路由）。 */
let routeContext: { userText: string; contextPaths?: string[]; hasImages?: boolean } = {
  userText: "",
};

export function activeCatalog(): ModelCatalog | null {
  return getRunContext()?.catalog ?? catalog;
}

export function activeSelection(): ModelSelection {
  const ctx = getRunContext();
  return ctx ? ctx.selection : selection;
}

export function activeRoute(): { userText: string; contextPaths?: string[]; hasImages?: boolean } {
  const ctx = getRunContext();
  return ctx ? ctx.routeContext : routeContext;
}

/** 应用主进程下发的目录与选用（有 RunContext 时只写本 run）。 */
export function configureModelCatalog(
  nextCatalog?: ModelCatalog | null,
  nextSelection?: ModelSelection | null,
  route?: { userText?: string; contextPaths?: string[]; hasImages?: boolean },
): void {
  const ctx = getRunContext();
  const targetCatalog = ctx ? { holder: ctx as { catalog: ModelCatalog | null } } : null;

  if (nextCatalog) {
    const cloned: ModelCatalog = {
      providers: nextCatalog.providers.map((p) => ({ ...p })),
      models: nextCatalog.models.map((m) => ({ ...m, tags: [...m.tags] })),
      selection: nextCatalog.selection,
      allowEmoji: nextCatalog.allowEmoji,
    };
    if (ctx) ctx.catalog = cloned;
    else catalog = cloned;
  }
  if (nextSelection) {
    if (ctx) ctx.selection = nextSelection;
    else selection = nextSelection;
  } else if (nextCatalog) {
    if (ctx) ctx.selection = nextCatalog.selection;
    else selection = nextCatalog.selection;
  }
  if (route) {
    const nextRoute = {
      userText: route.userText ?? "",
      contextPaths: route.contextPaths,
      ...(route.hasImages ? { hasImages: true as const } : {}),
    };
    if (ctx) ctx.routeContext = nextRoute;
    else routeContext = nextRoute;
  }
  void targetCatalog;

  // 预配置首候选（兼容仍直接 getChatModel 的路径）
  const candidates = listCandidates();
  const first = candidates[0];
  const cat = activeCatalog();
  if (first && cat) {
    const settings = resolveModelSettings(cat, first);
    configureChatModel(settings);
  } else if (cat) {
    configureChatModel({
      apiKey: "",
      baseUrl: "",
      model: "",
      allowEmoji: cat.allowEmoji,
    });
  }
}

/** 当前候选列表。 */
export function listCandidates(): ModelEntry[] {
  const cat = activeCatalog();
  if (!cat) return [];
  const sel = activeSelection();
  const route = activeRoute();
  return buildModelCandidates(cat, sel, {
    userText: route.userText,
    contextPaths: route.contextPaths,
    hasImages: route.hasImages,
  });
}

/** 当前选用（供子代理临时覆盖后还原）。 */
export function getModelSelection(): ModelSelection {
  return { ...activeSelection() };
}
