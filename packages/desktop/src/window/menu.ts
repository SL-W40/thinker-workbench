/**
 * 应用菜单控制。
 *
 * 自定义无边框标题栏场景下清空原生 Application Menu，避免多余菜单栏占用空间。
 */
import { Menu } from "electron";

/** 移除应用级菜单栏（`Menu.setApplicationMenu(null)`）。 */
export function clearApplicationMenu(): void {
  Menu.setApplicationMenu(null);
}
