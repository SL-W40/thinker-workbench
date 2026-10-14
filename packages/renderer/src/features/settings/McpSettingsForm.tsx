/**
 * Customize / Settings →MCP：stdio / http 服务端列表、启用、编辑、测试、导入导出。 */
import {
  Badge,
  Button,
  Callout,
  CloseIcon,
  Field,
  IconButton,
  Input,
  Modal,
  SegmentedControl,
  Switch,
  TextArea,
} from "@thinker-workbench/design/react";
import type {
  CustomizeScope,
  McpImportConflict,
  McpServerConfig,
  McpServerRuntimeStatus,
  McpServerUpsertInput,
  McpTransport,
  WorkspaceRecord,
} from "@thinker-workbench/shared";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  mcpExportFile,
  mcpImportFile,
  mcpList,
  mcpRemove,
  mcpSetEnabled,
  mcpTest,
  mcpUpsert,
  onMcpStatus,
  pickDirectory,
} from "../../bridge/thinker";
import { useT } from "../../i18n/useI18n";
import { ScopeGroupSection } from "../customize/ScopeGroupSection";
import { buildScopeGroups, customizeScopeKey } from "../customize/scopeHelpers";
import "./McpSettingsForm.less";

/** 去掉 mcp_ / mcp__ 服务前缀，卡片上只留工具短名。*/
function shortToolLabel(toolName: string, serverId: string): string {
  const id = serverId.trim();
  if (id) {
    for (const prefixed of [`mcp__${id}__`, `mcp_${id}_`, `${id}__`, `${id}_`]) {
      if (toolName.startsWith(prefixed)) return toolName.slice(prefixed.length);
    }
  }
  const m = /^mcp_{1,2}[^_]+_{1,2}(.+)$/.exec(toolName);
  return m?.[1] || toolName;
}

type ToolInfo = NonNullable<McpServerRuntimeStatus["tools"]>[number];

/** 工具卡片横向滑动轨道：隐藏滚动条，两端按需渐隐。 */
function McpToolsRail({ serverId, tools }: { serverId: string; tools: ToolInfo[] }) {
  const scrollerRef = useRef<HTMLUListElement>(null);
  const [fadeLeft, setFadeLeft] = useState(false);
  const [fadeRight, setFadeRight] = useState(false);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;

    const update = () => {
      const { scrollLeft, scrollWidth, clientWidth } = el;
      setFadeLeft(scrollLeft > 2);
      setFadeRight(scrollLeft + clientWidth < scrollWidth - 2);
    };

    update();
    el.addEventListener("scroll", update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", update);
      ro.disconnect();
    };
  }, []);

  return (
    <div
      className={[
        "mcp-settings__tools-rail",
        fadeLeft ? "is-fade-left" : "",
        fadeRight ? "is-fade-right" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <ul ref={scrollerRef} className="mcp-settings__tools">
        {tools.map((tool) => {
          const label = shortToolLabel(tool.name, serverId);
          const desc = tool.description?.trim() || "";
          return (
            <li key={tool.name}>
              <div
                className="mcp-settings__tool"
                title={desc ? `${tool.name}\n${desc}` : tool.name}
              >
                <span className="mcp-settings__tool-name">{label}</span>
                {desc ? <span className="mcp-settings__tool-desc">{desc}</span> : null}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

type Draft = {
  id: string;
  name: string;
  transport: McpTransport;
  command: string;
  argsText: string;
  envText: string;
  cwd: string;
  url: string;
  headersText: string;
  enabled: boolean;
};

type Props = {
  /** 已登记工作区；与用户组一起按作用域展开。 */
  workspaces: WorkspaceRecord[];
};

function emptyDraft(): Draft {
  return {
    id: "",
    name: "",
    transport: "stdio",
    command: "",
    argsText: "",
    envText: "",
    cwd: "",
    url: "",
    headersText: "",
    enabled: true,
  };
}

function draftFromConfig(c: McpServerConfig): Draft {
  if (c.transport === "http") {
    return {
      id: c.id,
      name: c.name,
      transport: "http",
      command: "",
      argsText: "",
      envText: "",
      cwd: "",
      url: c.url,
      headersText: Object.entries(c.headers ?? {})
        .map(([k, v]) => `${k}=${v}`)
        .join("\n"),
      enabled: c.enabled,
    };
  }
  return {
    id: c.id,
    name: c.name,
    transport: "stdio",
    command: c.command,
    argsText: c.args.join("\n"),
    envText: Object.entries(c.env)
      .map(([k, v]) => `${k}=${v}`)
      .join("\n"),
    cwd: c.cwd ?? "",
    url: "",
    headersText: "",
    enabled: c.enabled,
  };
}

function parseKv(text: string): Record<string, string> {
  const env: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    env[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1);
  }
  return env;
}

function toUpsert(d: Draft, scope: CustomizeScope): McpServerUpsertInput {
  const base = {
    id: d.id.trim() || "server",
    name: d.name.trim() || d.id.trim() || "server",
    enabled: d.enabled,
    scope,
  };
  if (d.transport === "http") {
    return {
      ...base,
      transport: "http",
      url: d.url.trim(),
      headers: parseKv(d.headersText),
    };
  }
  return {
    ...base,
    transport: "stdio",
    command: d.command.trim(),
    args: d.argsText
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean),
    env: parseKv(d.envText),
    cwd: d.cwd.trim() || null,
  };
}

function statusVariant(
  state: McpServerRuntimeStatus["state"] | undefined,
): "neutral" | "success" | "danger" | "accent" {
  if (state === "ready") return "success";
  if (state === "error") return "danger";
  if (state === "starting") return "accent";
  return "neutral";
}

function sameScope(a: CustomizeScope | undefined, b: CustomizeScope): boolean {
  if (!a) return b.kind === "user";
  if (a.kind !== b.kind) return false;
  if (a.kind === "user") return true;
  return a.workspaceId === (b as { workspaceId: string }).workspaceId;
}

export function McpSettingsForm({ workspaces }: Props) {
  const t = useT();
  const available = Boolean(window.thinker?.mcp);
  const canBrowse = Boolean(window.thinker?.settings?.pickDirectory);
  const groupsDef = useMemo(() => buildScopeGroups(workspaces), [workspaces]);

  const [servers, setServers] = useState<McpServerConfig[]>([]);
  const [statuses, setStatuses] = useState<Record<string, McpServerRuntimeStatus>>({});
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [activeScope, setActiveScope] = useState<CustomizeScope>({ kind: "user" });
  const [draft, setDraft] = useState<Draft>(() => emptyDraft());
  const [testResult, setTestResult] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<McpServerConfig | null>(null);
  const [importConflictOpen, setImportConflictOpen] = useState(false);

  async function refresh() {
    try {
      const res = await mcpList();
      setServers(res.servers);
      const map: Record<string, McpServerRuntimeStatus> = {};
      for (const s of res.statuses) map[s.id] = s;
      setStatuses((prev) => ({ ...prev, ...map }));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  useEffect(() => {
    if (!available) return;
    void refresh();
    return onMcpStatus((st) => {
      setStatuses((prev) => ({ ...prev, [st.id]: st }));
    });
  }, [available, refresh]);

  const groups = useMemo(() => {
    return groupsDef.map((g) => {
      const rows = servers
        .filter((s) => sameScope(s.scope, g.scope))
        .map((s) => ({
          config: s,
          status: statuses[s.id],
        }));
      return {
        ...g,
        title:
          g.scope.kind === "user"
            ? t("customize.scope.user")
            : t("customize.scope.workspace", { name: g.name }),
        rows,
      };
    });
  }, [groupsDef, servers, statuses, t]);

  function openCreate(scope: CustomizeScope) {
    setActiveScope(scope);
    setEditingId(null);
    setDraft(emptyDraft());
    setTestResult(null);
    setModalOpen(true);
  }

  function openEdit(c: McpServerConfig) {
    setActiveScope(c.scope ?? { kind: "user" });
    setEditingId(c.id);
    setDraft(draftFromConfig(c));
    setTestResult(null);
    setModalOpen(true);
  }

  async function saveDraft() {
    setBusy(true);
    try {
      await mcpUpsert(toUpsert(draft, activeScope));
      setModalOpen(false);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function onTest() {
    setBusy(true);
    setTestResult(null);
    try {
      const st = await mcpTest(toUpsert(draft, activeScope));
      setTestResult(
        st.state === "ready"
          ? t("settings.mcp.testOk", { n: String(st.toolCount ?? 0) })
          : st.error || st.state,
      );
      if (st.id) setStatuses((prev) => ({ ...prev, [st.id]: st }));
    } catch (err) {
      setTestResult(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function runImport(conflict: McpImportConflict) {
    setImportConflictOpen(false);
    try {
      const r = await mcpImportFile(conflict, activeScope);
      await refresh();
      setNotice(
        r.imported.length || r.skipped.length
          ? t("settings.mcp.importResult", {
              imported: String(r.imported.length),
              skipped: String(r.skipped.length),
            })
          : null,
      );
      setError(null);
    } catch (err) {
      setNotice(null);
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function onExport(scope: CustomizeScope) {
    try {
      const r = await mcpExportFile(scope);
      if (r.ok) {
        setNotice(t("settings.mcp.exportOk", { path: r.path ?? "" }));
        setError(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    const id = deleteTarget.id;
    const scope = deleteTarget.scope ?? { kind: "user" as const };
    setDeleteTarget(null);
    try {
      await mcpRemove(id, scope);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  const saveDisabled =
    busy || (draft.transport === "stdio" ? !draft.command.trim() : !draft.url.trim());

  if (!available) {
    return (
      <Callout tone="warning">{t("settings.mcp.unavailable", { cmd: "pnpm run dev" })}</Callout>
    );
  }

  return (
    <div className="mcp-settings">
      {error ? (
        <Callout tone="danger" className="mcp-settings__banner">
          {error}
        </Callout>
      ) : null}
      <Callout tone="info" className="mcp-settings__banner">
        {t("settings.mcp.lead")}
      </Callout>
      {notice ? (
        <Callout tone="info" className="mcp-settings__banner">
          {notice}
        </Callout>
      ) : null}
      <div className="mcp-settings__groups">
        {groups.map((group) => (
          <ScopeGroupSection
            key={group.key}
            title={group.title}
            count={group.rows.length}
            addLabel={t("settings.mcp.add")}
            onAdd={() => openCreate(group.scope)}
            emptyTitle={t("settings.mcp.emptyTitle")}
            emptyBody={t("settings.mcp.emptyBody")}
            isEmpty={group.rows.length === 0}
            headerExtra={
              <>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    setActiveScope(group.scope);
                    setImportConflictOpen(true);
                  }}
                >
                  {t("settings.mcp.importFile")}
                </Button>
                <Button size="sm" variant="secondary" onClick={() => void onExport(group.scope)}>
                  {t("settings.mcp.export")}
                </Button>
              </>
            }
          >
            <ul className="mcp-settings__list">
              {group.rows.map(({ config, status }) => {
                const scope = config.scope ?? group.scope;
                return (
                  <li
                    key={`${customizeScopeKey(scope)}:${config.id}`}
                    className="mcp-settings__row"
                  >
                    <div className="mcp-settings__top">
                      <div className="mcp-settings__head">
                        <span className="mcp-settings__name">{config.name}</span>
                        <span className="mcp-settings__id">{config.id}</span>
                        <Badge variant="neutral">
                          {config.transport === "http"
                            ? t("settings.mcp.transportHttp")
                            : t("settings.mcp.transportStdio")}
                        </Badge>
                        <Badge variant={statusVariant(status?.state)}>
                          {status?.state ?? "stopped"}
                          {typeof status?.toolCount === "number" ? ` · ${status.toolCount}` : ""}
                        </Badge>
                      </div>
                      <div className="mcp-settings__row-actions">
                        <Switch
                          checked={config.enabled}
                          aria-label={t("settings.mcp.enabled")}
                          disabled={config.writable === false}
                          onChange={(checked) => {
                            void mcpSetEnabled(config.id, checked, scope).then(refresh);
                          }}
                        />
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={config.writable === false}
                          onClick={() => openEdit(config)}
                        >
                          {t("settings.mcp.edit")}
                        </Button>
                        <IconButton
                          size="sm"
                          variant="ghost"
                          aria-label={t("settings.mcp.remove")}
                          disabled={config.writable === false}
                          onClick={() => setDeleteTarget(config)}
                        >
                          <CloseIcon />
                        </IconButton>
                      </div>
                    </div>
                    {status?.error ? (
                      <span className="mcp-settings__err" title={status.error}>
                        {status.error}
                      </span>
                    ) : null}
                    {status?.tools && status.tools.length > 0 ? (
                      <McpToolsRail serverId={config.id} tools={status.tools} />
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </ScopeGroupSection>
        ))}
      </div>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        closeOnBackdrop
        closeOnEscape
        aria-label={editingId ? t("settings.mcp.editTitle") : t("settings.mcp.addTitle")}
      >
        <div className="mcp-settings__form">
          <h2 className="mcp-settings__modal-title">
            {editingId ? t("settings.mcp.editTitle") : t("settings.mcp.addTitle")}
          </h2>
          <Field label={t("settings.mcp.fieldId")}>
            <Input
              value={draft.id}
              disabled={Boolean(editingId)}
              onChange={(e) => setDraft((d) => ({ ...d, id: e.target.value }))}
            />
          </Field>
          <Field label={t("settings.mcp.fieldName")}>
            <Input
              value={draft.name}
              onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
            />
          </Field>
          <Field label={t("settings.mcp.fieldTransport")}>
            <SegmentedControl
              value={draft.transport}
              onChange={(v) => {
                if (v === "stdio" || v === "http") {
                  setDraft((d) => ({ ...d, transport: v }));
                }
              }}
              options={[
                { value: "stdio", label: t("settings.mcp.transportStdio") },
                { value: "http", label: t("settings.mcp.transportHttp") },
              ]}
              aria-label={t("settings.mcp.fieldTransport")}
            />
          </Field>
          {draft.transport === "stdio" ? (
            <>
              <Field
                label={t("settings.mcp.fieldCommand")}
                description={t("settings.mcp.commandHint")}
              >
                <Input
                  value={draft.command}
                  onChange={(e) => setDraft((d) => ({ ...d, command: e.target.value }))}
                />
              </Field>
              <Field label={t("settings.mcp.fieldArgs")} description={t("settings.mcp.argsHint")}>
                <TextArea
                  rows={3}
                  value={draft.argsText}
                  onChange={(e) => setDraft((d) => ({ ...d, argsText: e.target.value }))}
                />
              </Field>
              <Field label={t("settings.mcp.fieldEnv")} description={t("settings.mcp.envHint")}>
                <TextArea
                  rows={3}
                  value={draft.envText}
                  onChange={(e) => setDraft((d) => ({ ...d, envText: e.target.value }))}
                />
              </Field>
              <Field label={t("settings.mcp.fieldCwd")}>
                <div className="mcp-settings__cwd-row">
                  <Input
                    value={draft.cwd}
                    onChange={(e) => setDraft((d) => ({ ...d, cwd: e.target.value }))}
                  />
                  {canBrowse ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        void pickDirectory({
                          title: t("settings.mcp.browseCwd"),
                          defaultPath: draft.cwd || undefined,
                        }).then((dir) => {
                          if (dir) setDraft((d) => ({ ...d, cwd: dir }));
                        });
                      }}
                    >
                      {t("settings.mcp.browseCwd")}
                    </Button>
                  ) : null}
                </div>
              </Field>
            </>
          ) : (
            <>
              <Field label={t("settings.mcp.fieldUrl")} description={t("settings.mcp.urlHint")}>
                <Input
                  value={draft.url}
                  onChange={(e) => setDraft((d) => ({ ...d, url: e.target.value }))}
                  placeholder="https://"
                />
              </Field>
              <Field
                label={t("settings.mcp.fieldHeaders")}
                description={t("settings.mcp.headersHint")}
              >
                <TextArea
                  rows={3}
                  value={draft.headersText}
                  onChange={(e) => setDraft((d) => ({ ...d, headersText: e.target.value }))}
                />
              </Field>
            </>
          )}
          {testResult ? <Callout tone="info">{testResult}</Callout> : null}
          <div className="mcp-settings__modal-actions">
            <Button size="sm" variant="secondary" disabled={busy} onClick={() => void onTest()}>
              {t("settings.mcp.test")}
            </Button>
            <Button
              size="sm"
              variant="primary"
              disabled={saveDisabled}
              onClick={() => void saveDraft()}
            >
              {t("settings.mcp.save")}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        closeOnBackdrop
        closeOnEscape
        aria-label={t("settings.mcp.deleteTitle")}
      >
        <div className="mcp-settings__form">
          <h2 className="mcp-settings__modal-title">{t("settings.mcp.deleteTitle")}</h2>
          <p className="mcp-settings__delete-body">
            {t("settings.mcp.deleteBody", { name: deleteTarget?.name ?? "" })}
          </p>
          <div className="mcp-settings__modal-actions">
            <Button size="sm" variant="secondary" onClick={() => setDeleteTarget(null)}>
              {t("settings.mcp.cancel")}
            </Button>
            <Button size="sm" variant="danger" onClick={() => void confirmDelete()}>
              {t("settings.mcp.remove")}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={importConflictOpen}
        onClose={() => setImportConflictOpen(false)}
        closeOnBackdrop
        closeOnEscape
        aria-label={t("settings.mcp.importConflictTitle")}
      >
        <div className="mcp-settings__form">
          <h2 className="mcp-settings__modal-title">{t("settings.mcp.importConflictTitle")}</h2>
          <p className="mcp-settings__delete-body">{t("settings.mcp.importConflictBody")}</p>
          <div className="mcp-settings__modal-actions">
            <Button size="sm" variant="secondary" onClick={() => void runImport("skip")}>
              {t("settings.mcp.importSkip")}
            </Button>
            <Button size="sm" variant="primary" onClick={() => void runImport("overwrite")}>
              {t("settings.mcp.importOverwrite")}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
