/**
 * 批量处置（全部回滚 / 全部采纳）的逻辑与反馈。
 *
 * 入口在面板头部的「⋯」菜单里，所以这层提在 ChangesPane 而不是表单组件内：
 * 菜单是 ChangesPane 的，逻辑跟着入口走，免得为了两个动作把处置状态再传一层。
 *
 * 结果反馈不静默：逐文件结果里失败的会点名。
 */
import type { ChangeDispositionKind, ChangeItemResult } from "@thinker-workbench/shared";
import { useState } from "react";
import { applyChangeDisposition } from "../../../platform/ipc/checkpoints";
import { useT } from "../../../ui/i18n/useI18n";

type Options = {
  workspaceId?: string | null;
  /** 改动文件路径列表（工作空间相对）。 */
  paths: string[];
  /** 处置完成后通知上层刷新 Git 状态。 */
  onChanged: () => void;
};

/** 把失败项压成一行提示（超过 3 条时只报前 3 条）。 */
function summarizeFailures(items: ChangeItemResult[]): string {
  const failed = items.filter((item) => !item.ok);
  if (failed.length === 0) return "";
  const head = failed
    .slice(0, 3)
    .map((item) => `${item.path}：${item.error ?? "失败"}`)
    .join("；");
  return failed.length > 3 ? `${head}（还有 ${failed.length - 3} 个）` : head;
}

export function useDisposeAll({ workspaceId, paths, onChanged }: Options) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function run(kind: ChangeDispositionKind) {
    if (busy || !workspaceId || paths.length === 0) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await applyChangeDisposition({ workspaceId, kind, paths });
      const failures = summarizeFailures(res.items);
      if (!res.ok) setError(failures || res.error || t("inspector.changes.disposeFailed"));
      else if (failures) setError(failures);
      else {
        setNotice(
          kind === "revert" ? t("inspector.changes.revertedAll") : t("inspector.changes.keptAll"),
        );
        // 采纳后不再需要「全部回滚」入口的数据：让上层重算状态
        onChanged();
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  /** 二次确认：批量操作不可逆。 */
  function confirmAndRun(label: string, kind: ChangeDispositionKind) {
    setError(null);
    setNotice(null);
    if (!window.confirm(label)) return;
    void run(kind);
  }

  return {
    busy,
    error,
    notice,
    revertAll: () => confirmAndRun(t("inspector.changes.confirmRevertAll"), "revert"),
    keepAll: () => confirmAndRun(t("inspector.changes.confirmKeepAll"), "keep"),
    clear: () => {
      setError(null);
      setNotice(null);
    },
  };
}
