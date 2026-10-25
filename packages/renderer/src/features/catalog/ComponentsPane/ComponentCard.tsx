/**
 * 预览卡：标题可点开说明文档，正文区留给交互演示。
 */
import type { ReactNode } from "react";
import type { MessageKey } from "../../../ui/i18n/translate";
import { useT } from "../../../ui/i18n/useI18n";

type CardProps = {
  /** 对应 `packages/design/src/components/<docId>/<docId>.md`。*/
  docId: string;
  title: string;
  description: string;
  docsHint: string;
  onOpenDocs: (docId: string) => void;
  children: ReactNode;
};

export function ComponentCard({
  docId,
  title,
  description,
  docsHint,
  onOpenDocs,
  children,
}: CardProps) {
  return (
    <section className="components-card">
      <button
        type="button"
        className="components-card-title"
        onClick={() => onOpenDocs(docId)}
        aria-label={`${title} …${docsHint}`}
      >
        <h2>{title}</h2>
        <span className="components-card-docs-hint">{docsHint}</span>
      </button>
      <p className="components-card-desc">{description}</p>
      {children}
    </section>
  );
}

/** 带 i18n key 解析的目录卡（各 section 共用）。 */
export function DemoCard({
  docId,
  titleKey,
  descKey,
  onOpenDocs,
  children,
}: {
  docId: string;
  titleKey: MessageKey;
  descKey: MessageKey;
  onOpenDocs: (docId: string) => void;
  children: ReactNode;
}) {
  const t = useT();
  return (
    <ComponentCard
      docId={docId}
      title={t(titleKey)}
      description={t(descKey)}
      docsHint={t("components.openDocs")}
      onOpenDocs={onOpenDocs}
    >
      {children}
    </ComponentCard>
  );
}
