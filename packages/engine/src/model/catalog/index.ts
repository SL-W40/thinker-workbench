/**
 * catalog 目录 barrel：保持 `model/catalog` 的既有导入路径与导出面不变。
 */
export { chatWithFailover } from "./failover";
export {
  configureModelCatalog,
  getModelSelection,
  listCandidates,
} from "./state";
