/**
 * 桌面自动更新 API 封装。
 * 桥接缺失（老版本 preload / 浏览器预览）时返回禁用态，不抛异常。
 */
import type { UpdateState } from "@thinker-workbench/shared";
import { emptyUpdateState } from "@thinker-workbench/shared";

function api() {
  return window.thinker?.update;
}

/** 默认（禁用）状态：dev 与桥接缺失时共用。 */
function disabledState(): UpdateState {
  return emptyUpdateState("0.0.0", false);
}

/** 读取当前更新状态。 */
export async function getUpdateState(): Promise<UpdateState> {
  return (await api()?.getState()) ?? disabledState();
}

/** 检查更新。 */
export async function checkForUpdate(): Promise<UpdateState> {
  return (await api()?.check()) ?? disabledState();
}

/** 下载可用更新。 */
export async function downloadUpdate(): Promise<UpdateState> {
  return (await api()?.download()) ?? disabledState();
}

/** 安装并重启应用。 */
export async function installUpdate(): Promise<boolean> {
  return (await api()?.install()) ?? false;
}

/** 订阅状态推送；返回取消订阅函数。 */
export function subscribeUpdateState(cb: (state: UpdateState) => void): () => void {
  return api()?.onState(cb) ?? (() => undefined);
}
