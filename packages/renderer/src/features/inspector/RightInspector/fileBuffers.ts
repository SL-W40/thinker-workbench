/**
 * 按路径读入编辑缓冲（RightInspector 文件 tab 共用）。
 */
import type { Dispatch, SetStateAction } from "react";
import { workspaceReadFile } from "../../../platform/ipc/workspaceFs";
import type { MediaPreviewInfo } from "../MediaPreview";
import { fileTabKey } from "./tabs";

/**
 * 按路径读入编辑缓冲。
 * @returns 文件存在且已写入缓冲为 true；缺失 / 读失败为 false（调用方应关掉对应 tab）。
 */
export async function loadFileBuffers(
  workspaceId: string,
  path: string,
  setters: {
    setDrafts: Dispatch<SetStateAction<Record<string, string>>>;
    setSaved: Dispatch<SetStateAction<Record<string, string>>>;
    setUnsaved: Dispatch<SetStateAction<Record<string, boolean>>>;
    setMediaByKey: Dispatch<SetStateAction<Record<string, MediaPreviewInfo>>>;
    setReadOnlyByPath: Dispatch<SetStateAction<Record<string, boolean>>>;
  },
): Promise<boolean> {
  const key = fileTabKey(path);
  const { setDrafts, setSaved, setUnsaved, setMediaByKey, setReadOnlyByPath } = setters;
  try {
    const file = await workspaceReadFile(workspaceId, path);
    if (file.missing) return false;
    const mediaKind = file.mediaKind;
    if (mediaKind) {
      setMediaByKey((d) => ({
        ...d,
        [key]: {
          kind: mediaKind,
          mimeType: file.mimeType,
          previewDataUrl: file.previewDataUrl,
          size: file.size,
        },
      }));
      setDrafts((d) => ({ ...d, [key]: "" }));
      setSaved((d) => ({ ...d, [key]: "" }));
      setReadOnlyByPath((d) => ({ ...d, [path]: true }));
      setUnsaved((d) => ({ ...d, [key]: false }));
    } else if (file.binary || !file.editable) {
      setMediaByKey((d) => ({
        ...d,
        [key]: { kind: "binary", size: file.size, mimeType: file.mimeType },
      }));
      setDrafts((d) => ({ ...d, [key]: "" }));
      setSaved((d) => ({ ...d, [key]: "" }));
      setReadOnlyByPath((d) => ({ ...d, [path]: true }));
      setUnsaved((d) => ({ ...d, [key]: false }));
    } else {
      setMediaByKey((d) => {
        const n = { ...d };
        delete n[key];
        return n;
      });
      setDrafts((d) => ({ ...d, [key]: file.content }));
      setSaved((d) => ({ ...d, [key]: file.content }));
      setReadOnlyByPath((d) => ({ ...d, [path]: false }));
      setUnsaved((d) => ({ ...d, [key]: false }));
    }
    return true;
  } catch {
    return false;
  }
}
