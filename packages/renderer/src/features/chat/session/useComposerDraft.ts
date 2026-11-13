/**
 * Composer 正文本地草稿：按会话留存输入框文本，刷新 / 重启后灌回。
 * 附图不进本地存档（仅落盘 images 目录的引用随发送进会话）。
 */

import {
  type Dispatch,
  type SetStateAction,
  useEffect,
  useRef,
} from "react";
import {
  clearComposerDraft,
  flushComposerDrafts,
  loadComposerDraft,
  saveComposerDraft,
} from "../composer/composerDraft";

export type ComposerDraftDeps = {
  draft: string;
  sessionId: string | null;
  setDraft: Dispatch<SetStateAction<string>>;
};

/** 挂载草稿读写副作用；无返回值，调用方继续用自有 setDraft。 */
export function useComposerDraft(host: ComposerDraftDeps): void {
  const { draft, sessionId, setDraft } = host;

  /** 当前草稿已绑到哪个会话（换会话时要撤掉旧会话的存档）。 */
  const draftSessionRef = useRef<string | null>(null);
  /** 本次提交刚灌回了草稿：跳过一次写回，别用中间态覆盖存档。 */
  const skipDraftWriteRef = useRef(false);

  // 启动 / 切会话：先按原语义丢掉旧会话草稿，再把本地存档灌回输入框
  useEffect(() => {
    const prev = draftSessionRef.current;
    draftSessionRef.current = sessionId;
    if (prev && prev !== sessionId) clearComposerDraft(prev);
    if (!sessionId) return;
    const saved = loadComposerDraft(sessionId);
    if (!saved) return;
    skipDraftWriteRef.current = true;
    if (saved.text) setDraft(saved.text);
  }, [sessionId, setDraft]);

  // 正文写回本地存档（输入密集，走模块内防抖）
  useEffect(() => {
    if (!sessionId) return;
    if (skipDraftWriteRef.current) {
      skipDraftWriteRef.current = false;
      return;
    }
    saveComposerDraft(sessionId, { text: draft });
  }, [sessionId, draft]);

  // 卸载 / 刷新前冲掉未落盘的草稿
  useEffect(() => {
    window.addEventListener("pagehide", flushComposerDrafts);
    window.addEventListener("beforeunload", flushComposerDrafts);
    return () => {
      window.removeEventListener("pagehide", flushComposerDrafts);
      window.removeEventListener("beforeunload", flushComposerDrafts);
      flushComposerDrafts();
    };
  }, []);
}
