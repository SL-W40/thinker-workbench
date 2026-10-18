/**
 * system 按块记录，拼回发给模型的单条字符串。
 * Trace 用同一份分块展示，避免详情里铺开一整段。
 */
export type SystemSection = {
  id: string;
  text: string;
};

/** 丢掉空块后用空行接成一条 system。块正文保持原样。 */
export function joinSystemSections(sections: SystemSection[]): string {
  return sections
    .filter((section) => section.text.trim().length > 0)
    .map((section) => section.text)
    .join("\n\n");
}
