/**
 * 把「每次渲染都是新函数」的回调包成引用恒定的版本。
 *
 * 用途：给 memo 化的子组件传回调。原函数照旧在每次渲染时重建、照旧读到最新的 state，
 * 但传给下层的引用永远不变，不会因为身份变化击穿 memo。
 *
 * 只适用于**事件回调**（用户交互时才调用）：那时 ref 里已经是最新一次渲染的函数。
 * 不要在渲染期间同步依赖它返回值的地方使用。
 */
import { useCallback, useRef } from "react";

export function useStableCallback<A extends unknown[]>(
  fn: (...args: A) => void,
): (...args: A) => void {
  const ref = useRef(fn);
  ref.current = fn;
  // 依赖为空数组：返回的函数身份在整个组件生命周期内恒定。
  return useCallback((...args: A) => {
    ref.current(...args);
  }, []);
}
