/**
 * 反馈控件样例：Callout / Progress / EmptyState / Separator。
 */
import {
  Button,
  Callout,
  EmptyState,
  FolderIcon,
  Progress,
  Separator,
} from "@thinker-workbench/design/react";
import { useT } from "../../../../i18n/useI18n";
import { DemoCard } from "../ComponentCard";

type Props = {
  progress: number;
  onProgressChange: (value: number) => void;
  onOpenDocs: (docId: string) => void;
};

export function FeedbackSection({ progress, onProgressChange, onOpenDocs }: Props) {
  const t = useT();

  return (
    <>
      <DemoCard
        docId="Callout"
        titleKey="components.section.callout"
        descKey="components.section.calloutDesc"
        onOpenDocs={onOpenDocs}
      >
        <Callout tone="info" title={t("components.demo.calloutInfo")}>
          {t("components.demo.calloutBody")}
        </Callout>
        <Callout tone="warning">{t("components.demo.calloutWarn")}</Callout>
      </DemoCard>

      <DemoCard
        docId="Progress"
        titleKey="components.section.progress"
        descKey="components.section.progressDesc"
        onOpenDocs={onOpenDocs}
      >
        <Progress value={progress} aria-label={t("components.demo.progress")} />
        <Progress indeterminate aria-label={t("components.demo.progressIndeterminate")} />
        <div className="components-row">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onProgressChange(Math.min(100, progress + 10))}
          >
            {t("components.demo.progressMore")}
          </Button>
        </div>
      </DemoCard>

      <DemoCard
        docId="EmptyState"
        titleKey="components.section.empty"
        descKey="components.section.emptyDesc"
        onOpenDocs={onOpenDocs}
      >
        <EmptyState
          icon={<FolderIcon size="lg" />}
          title={t("components.demo.emptyTitle")}
          description={t("components.demo.emptyDesc")}
          action={
            <Button size="sm" variant="secondary">
              {t("components.demo.emptyAction")}
            </Button>
          }
        />
      </DemoCard>

      <DemoCard
        docId="Separator"
        titleKey="components.section.separator"
        descKey="components.section.separatorDesc"
        onOpenDocs={onOpenDocs}
      >
        <p className="components-card-desc">{t("components.demo.separatorAbove")}</p>
        <Separator />
        <p className="components-card-desc">{t("components.demo.separatorBelow")}</p>
      </DemoCard>
    </>
  );
}
