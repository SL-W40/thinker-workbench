/**
 * 进行中的回复不拦编辑，只拦再提交。
 */

/** 本会话正在跑或已排队时，不能再发新消息，也不能原位重发。 */
export function chatSubmitBlocked(busy: boolean, queued: boolean): boolean {
  return busy || queued;
}
