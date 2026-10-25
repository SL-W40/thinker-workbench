# 后续待办

[English](../TODOS.md) | **简体中文**

多会话并行架构里暂缓的产品 backlog，当前版本不交付，仅作优先级跟踪。另见 [README](./README.zh-CN.md)。

已落地的准入队列（不再单列待办）：全局一条纯 FIFO。并行槽满才入队，队列非空时新请求只能排到队尾。模型、模式、shell、权限和工作区根在派发时读取，不在入队时冻结。轮次内容只留在主进程内存里，应用退出或崩溃后残留 `queued` 收成失败，不自动重跑。HITL 期间仍是 `running` 并占着槽，不插队。

已落地的 Shell 黑名单（不再单列待办）：`GeneralSettings.shellBlocklist` 在 hello 以及每次 run/resume 下发。engine 在 unrestricted、白名单、AI 研判和 HITL 之前拒绝命中的首 token。确认不能把它加入白名单。两边都有的 token 从白名单剔除。

已落地的路径建议锁（不再单列待办，原第 1 条）：写类文件工具（`write_file` / `edit_file` / `delete_file`）在 engine 内按**归一化绝对路径**串行（`tools/shared/pathLock.ts`），只读工具完全不排队。同一路径的第二个写请求等待 5s，超时后给出明确的「另一会话正在写入」错误，而不是静默覆盖；不同路径依旧全并行。锁粒度单一且无嵌套申请，因此不会死锁，异常时也必定释放。

---

*暂无其余暂缓项。新增候选：无。*
