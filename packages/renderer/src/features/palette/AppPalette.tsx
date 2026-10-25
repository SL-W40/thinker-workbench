/**
 * 命令面板的应用层容器：聚合并装配四类候选，处理跳转副作用。
 *
 * 候选来源：
 * - 命令：新建会话、聚焦输入框、打开设置 / 控制台 / 时间线、停止运行
 * - 会话：侧栏同一份数据（工作区 + 会话标题）
 * - 文件：当前工作区的工作树（面板首次打开时按需拉一次，随后缓存）
 * - 设置：静态分区列表（点击直达对应分区）
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { workspaceTree } from "../../platform/ipc/workspaceFs";
import { listThreads, listWorkspaces } from "../../platform/ipc/workspaces";
import type { MessageKey } from "../../ui/i18n/translate";
import { useI18n } from "../../ui/i18n/useI18n";
import { CommandPalette } from "./CommandPalette";
import { dedupePaletteItems, fileItems, type PaletteItem, sessionItems } from "./paletteModel";

/** 设置分区：点击直达（标题走 i18n，id 与设置页分区 id 一致）。 */
const SETTINGS_SECTIONS: Array<{ id: string; labelKey: MessageKey }> = [
  { id: "general", labelKey: "settings.sections.general.title" },
  { id: "appearance", labelKey: "settings.sections.appearance.title" },
  { id: "notifications", labelKey: "settings.sections.notifications.title" },
  { id: "data", labelKey: "settings.sections.data.title" },
  { id: "permissions", labelKey: "settings.sections.permissions.title" },
  { id: "model", labelKey: "settings.sections.model.title" },
  { id: "mcp", labelKey: "settings.sections.mcp.title" },
  { id: "shortcuts", labelKey: "settings.sections.shortcuts.title" },
];

type Props = {
  open: boolean;
  onClose: () => void;
  /** 新建会话。 */
  onNewChat: () => void;
  /** 打开设置并定位到分区。 */
  onOpenSettings: (section: string) => void;
  /** 打开控制台（Trace / 日志等）。 */
  onOpenTools: (tab: string) => void;
  /** 切到某个会话。 */
  onSelectSession: (sessionId: string, threadId: string) => void;
  /** 打开文件（切到右栏编辑器）。 */
  onOpenFile: (workspaceId: string, path: string) => void;
};

export function AppPalette({
  open,
  onClose,
  onNewChat,
  onOpenSettings,
  onOpenTools,
  onSelectSession,
  onOpenFile,
}: Props) {
  const { t } = useI18n();
  const [workspaces, setWorkspaces] = useState<Array<{ id: string; name: string }>>([]);
  const [sessions, setSessions] = useState<
    Array<{
      id: string;
      threadId: string;
      title: string;
      workspaceName: string;
      workspaceId: string;
    }>
  >([]);
  const [files, setFiles] = useState<PaletteItem[]>([]);
  const [filesLoading, setFilesLoading] = useState(false);

  // 会话候选：与侧栏同源（listThreads）
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void Promise.all([listWorkspaces(), listThreads()])
      .then(([wsList, threads]) => {
        if (cancelled) return;
        setWorkspaces(wsList.map((w) => ({ id: w.id, name: w.name })));
        const nameById = new Map(wsList.map((w) => [w.id, w.name]));
        setSessions(
          threads.map((th) => ({
            id: th.sessionId,
            threadId: th.id,
            title: th.title,
            workspaceId: th.workspaceId,
            workspaceName: nameById.get(th.workspaceId) ?? "",
          })),
        );
      })
      .catch(() => {
        /* 拉取失败只影响候选，不影响面板打开 */
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  // 文件候选：打开时才拉一次（大仓库不预加载）
  useEffect(() => {
    if (!open || workspaces.length === 0) return;
    let cancelled = false;
    setFilesLoading(true);
    void (async () => {
      const collected: string[] = [];
      for (const ws of workspaces) {
        if (collected.length >= 400) break;
        try {
          const tree = await workspaceTree(ws.id);
          flattenTree(ws.id, tree, collected, 400);
        } catch {
          /* 单个工作区失败不影响其它工作区 */
        }
      }
      if (cancelled) return;
      setFiles(fileItems(collected, t("palette.groupFile")));
      setFilesLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, workspaces, t]);

  const commands = useMemo<PaletteItem[]>(
    () => [
      { id: "cmd:newChat", group: "command", title: t("palette.newChat"), shortcut: "Mod+Alt+N" },
      {
        id: "cmd:focusComposer",
        group: "command",
        title: t("palette.focusComposer"),
        shortcut: "Mod+I",
      },
      {
        id: "cmd:openSettings",
        group: "command",
        title: t("palette.openSettings"),
        shortcut: "Mod+,",
      },
      { id: "cmd:openTrace", group: "command", title: t("palette.openTrace") },
      { id: "cmd:openConsole", group: "command", title: t("palette.openConsole") },
    ],
    [t],
  );

  const sessionCandidates = useMemo(
    () =>
      dedupePaletteItems(
        sessionItems(
          sessions.map((s) => ({
            id: s.id,
            threadId: s.threadId,
            title: s.title,
            workspaceName: s.workspaceName,
          })),
        ),
      ),
    [sessions],
  );

  const settingCandidates = useMemo<PaletteItem[]>(
    () =>
      SETTINGS_SECTIONS.map((section) => ({
        id: `setting:${section.id}`,
        group: "setting" as const,
        title: t(section.labelKey),
        subtitle: t("palette.settingsHint"),
      })),
    [t],
  );

  const handlePick = useCallback(
    (item: PaletteItem) => {
      if (item.group === "command") {
        switch (item.id) {
          case "cmd:newChat":
            onNewChat();
            break;
          case "cmd:openSettings":
            onOpenSettings("general");
            break;
          case "cmd:openTrace":
            onOpenTools("logs");
            break;
          case "cmd:openConsole":
            onOpenTools("mcp");
            break;
          default:
            break;
        }
        return;
      }
      if (item.group === "session") {
        const hit = sessions.find((s) => `session:${s.id}` === item.id);
        if (hit) onSelectSession(hit.id, hit.threadId);
        return;
      }
      if (item.group === "setting") {
        const id = item.id.replace("setting:", "");
        onOpenSettings(id);
        return;
      }
      // 文件：id 形如 file:文件:<path>
      const path = item.id.split(":").slice(2).join(":");
      const ws = sessions[0]?.workspaceId ?? workspaces[0]?.id ?? "";
      if (path && ws) onOpenFile(ws, path);
    },
    [sessions, workspaces, onNewChat, onOpenSettings, onOpenTools, onSelectSession, onOpenFile],
  );

  return (
    <CommandPalette
      open={open}
      onClose={onClose}
      commands={commands}
      sessions={sessionCandidates}
      files={files}
      settings={settingCandidates}
      filesLoading={filesLoading}
      onPick={handlePick}
    />
  );
}

/** 把工作树压成相对路径列表（带深度与数量上限，避免卡顿）。 */
function flattenTree(
  _workspaceId: string,
  node: unknown,
  out: string[],
  limit: number,
  prefix = "",
  depth = 0,
): void {
  if (!node || typeof node !== "object" || out.length >= limit || depth > 6) return;
  const record = node as { path?: unknown; name?: unknown; children?: unknown };
  const name = String(record.name ?? record.path ?? "");
  const path = prefix ? `${prefix}/${name}` : name;
  if (name) out.push(path);
  const children = Array.isArray(record.children) ? record.children : [];
  for (const child of children) {
    flattenTree(_workspaceId, child, out, limit, path, depth + 1);
  }
}
