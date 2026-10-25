/**
 * app 装配层对外出口：`main.tsx` 只从这里取根组件。
 *
 * 本层负责把 platform 的能力（IPC / 外观 / 日志）与 features 的业务页面装配成一棵树，
 * 不对外暴露内部构造；调整 App / ChatShell / boot 的组织方式时不需要改动入口。
 */
export { RootApp } from "./RootApp";
