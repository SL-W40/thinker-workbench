/**
 * utilityProcess 入口。
 *
 * Electron 主进程会拉起本包编译产物 `artifacts/entry.js`，
 * 进程启动后立刻创建 UtilityHost，并通过 parentPort 与主进程通信。
 * 不要在这里写业务逻辑，只负责把 host 跑起来。
 */
import { UtilityHost } from "./host/UtilityHost";

const host = new UtilityHost();
host.start();
