/**
 * 设置 → MCP：stdio 服务端列表、启用、编辑、测试、从 Cursor 导入。
 */
import {
  Badge,
  Button,
  Callout,
  CloseIcon,
  EmptyState,
  Field,
  IconButton,
  Input,
  Modal,
  Switch,
  TextArea,
} from "@thinker-workbench/design/react";
import type {
  McpServerConfig,
  McpServerRuntimeStatus,
  McpServerUpsertInput,
} from "@thinker-workbench/shared";
import { useEffect, useMemo, useState } from "react";
import {
  mcpImportCursorFile,
  mcpList,
  mcpRemove,
  mcpSetEnabled,
  mcpTest,
  mcpUpsert,
  onMcpStatus,
} from "../../bridge/thinker";
import { useT } from "../../i18n/I18nProvider";
import "./McpSettingsForm.less";

type Draft = {
  id: string;
  name: string;
  command: string;
  argsText: string;
  envText: string;
  cwd: string;
  enabled: boolean;
};

function emptyDraft(): Draft {
  return {
    id: "",
    name: "",
    command: "",
    argsText: "",
    envText: "",
    cwd: "",
    enabled: true,
  };
}

function draftFromConfig(c: McpServerConfig): Draft {
  return {
    id: c.id,
    name: c.name,
    command: c.command,
    argsText: (c.args ?? []).join("\n"),
    envText: Object.entries(c.env ?? {})
      .map(([k, v]) => `${k}=${v}`)
      .join("\n"),
    cwd: c.cwd ?? "",
    enabled: c.enabled,
  };
}

function parseEnv(text: string): Record<string, string> {
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

function toUpsert(d: Draft): McpServerUpsertInput {
  return {
    id: d.id.trim() || "server",
    name: d.name.trim() || d.id.trim() || "server",
    enabled: d.enabled,
    command: d.command.trim(),
    args: d.argsText
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean),
    env: parseEnv(d.envText),
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

export function McpSettingsForm() {
  const t = useT();
  const available = Boolean(window.thinker?.mcp);
  const [servers, setServers] = useState<McpServerConfig[]>([]);
  const [statuses, setStatuses] = useState<Record<string, McpServerRuntimeStatus>>({});
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(() => emptyDraft());
  const [testResult, setTestResult] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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
  }, [available]);

  const rows = useMemo(
    () =>
      servers.map((s) => ({
        config: s,
        status: statuses[s.id],
      })),
    [servers, statuses],
  );

  function openCreate() {
    setEditingId(null);
    setDraft(emptyDraft());
    setTestResult(null);
    setModalOpen(true);
  }

  function openEdit(c: McpServerConfig) {
    setEditingId(c.id);
    setDraft(draftFromConfig(c));
    setTestResult(null);
    setModalOpen(true);
  }

  async function saveDraft() {
    setBusy(true);
    try {
      await mcpUpsert(toUpsert(draft));
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
      const st = await mcpTest(toUpsert(draft));
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
      <div className="mcp-settings__actions">
        <Button size="sm" variant="primary" onClick={openCreate}>
          {t("settings.mcp.add")}
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => {
            void (async () => {
              try {
                const r = await mcpImportCursorFile();
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
            })();
          }}
        >
          {t("settings.mcp.importCursor")}
        </Button>
      </div>
      {rows.length === 0 ? (
        <EmptyState
          title={t("settings.mcp.emptyTitle")}
          description={t("settings.mcp.emptyBody")}
          action={
            <Button size="sm" variant="primary" onClick={openCreate}>
              {t("settings.mcp.add")}
            </Button>
          }
        />
      ) : (
        <ul className="mcp-settings__list">
          {rows.map(({ config, status }) => (
            <li key={config.id} className="mcp-settings__row">
              <div className="mcp-settings__meta">
                <span className="mcp-settings__name">{config.name}</span>
                <span className="mcp-settings__id">{config.id}</span>
                <Badge variant={statusVariant(status?.state)}>
                  {status?.state ?? "stopped"}
                  {typeof status?.toolCount === "number"
                    ? ` · ${status.toolCount}`
                    : ""}
                </Badge>
                {status?.error ? (
                  <span className="mcp-settings__err" title={status.error}>
                    {status.error}
                  </span>
                ) : null}
              </div>
              <div className="mcp-settings__row-actions">
                <Switch
                  checked={config.enabled}
                  aria-label={t("settings.mcp.enabled")}
                  onChange={(checked) => {
                    void mcpSetEnabled(config.id, checked).then(refresh);
                  }}
                />
                <Button size="sm" variant="ghost" onClick={() => openEdit(config)}>
                  {t("settings.mcp.edit")}
                </Button>
                <IconButton
                  size="sm"
                  variant="ghost"
                  aria-label={t("settings.mcp.remove")}
                  onClick={() => {
                    void mcpRemove(config.id).then(refresh);
                  }}
                >
                  <CloseIcon />
                </IconButton>
              </div>
            </li>
          ))}
        </ul>
      )}

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
          <Field label={t("settings.mcp.fieldCommand")} description={t("settings.mcp.commandHint")}>
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
            <Input
              value={draft.cwd}
              onChange={(e) => setDraft((d) => ({ ...d, cwd: e.target.value }))}
            />
          </Field>
          {testResult ? <Callout tone="info">{testResult}</Callout> : null}
          <div className="mcp-settings__modal-actions">
            <Button size="sm" variant="secondary" disabled={busy} onClick={() => void onTest()}>
              {t("settings.mcp.test")}
            </Button>
            <Button size="sm" variant="primary" disabled={busy || !draft.command.trim()} onClick={() => void saveDraft()}>
              {t("settings.mcp.save")}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
