/**
 * 进程内 AgentEvent 发布订阅。
 * UtilityHost 订阅后转发到主进程；测试也可直接订阅做断言。
 */
import type { AgentEvent } from "@thinker-workbench/shared";

type Listener = (event: AgentEvent) => void;

export class EventBus {
  private listeners = new Set<Listener>();

  /** 注册监听；返回取消订阅函数。 */
  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** 同步广播给当前全部监听者。 */
  emit(event: AgentEvent): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }
}
