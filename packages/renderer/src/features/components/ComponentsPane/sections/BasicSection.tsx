/**
 * 基础输入与展示控件样例：Masonry / Input / TextArea / Field / Button / IconButton / Icon / Spinner。
 */
import {
  Button,
  ChevronLeftIcon,
  ChevronRightIcon,
  Field,
  IconButton,
  Input,
  Masonry,
  Spinner,
  TextArea,
} from "@thinker-workbench/design/react";
import { useT } from "../../../../i18n/useI18n";
import { DemoCard } from "../ComponentCard";
import { DESIGN_ICON_GALLERY, MASONRY_DEMO_BREAKPOINTS } from "../catalog";

type Props = {
  nameId: string;
  notesId: string;
  fieldId: string;
  text: string;
  onTextChange: (value: string) => void;
  invalid: boolean;
  onInvalidToggle: () => void;
  notes: string;
  onNotesChange: (value: string) => void;
  fieldValue: string;
  onFieldValueChange: (value: string) => void;
  onOpenDocs: (docId: string) => void;
};

export function BasicSection({
  nameId,
  notesId,
  fieldId,
  text,
  onTextChange,
  invalid,
  onInvalidToggle,
  notes,
  onNotesChange,
  fieldValue,
  onFieldValueChange,
  onOpenDocs,
}: Props) {
  const t = useT();

  return (
    <>
      <DemoCard
        docId="Masonry"
        titleKey="components.section.masonry"
        descKey="components.section.masonryDesc"
        onOpenDocs={onOpenDocs}
      >
        <Masonry
          className="components-masonry-demo"
          columns={3}
          gap={8}
          breakpoints={MASONRY_DEMO_BREAKPOINTS}
        >
          <div className="components-masonry-tile" style={{ height: 44 }}>
            A
          </div>
          <div className="components-masonry-tile" style={{ height: 72 }}>
            B
          </div>
          <div className="components-masonry-tile" style={{ height: 52 }}>
            C
          </div>
          <div className="components-masonry-tile" style={{ height: 64 }}>
            D
          </div>
          <div className="components-masonry-tile" style={{ height: 40 }}>
            E
          </div>
          <div className="components-masonry-tile" style={{ height: 88 }}>
            F
          </div>
        </Masonry>
      </DemoCard>

      <DemoCard
        docId="Input"
        titleKey="components.section.input"
        descKey="components.section.inputDesc"
        onOpenDocs={onOpenDocs}
      >
        <Input
          id={nameId}
          value={text}
          invalid={invalid}
          placeholder={t("components.demo.namePlaceholder")}
          onChange={(e) => onTextChange(e.target.value)}
          aria-label={t("components.demo.name")}
        />
        <div className="components-row">
          <Button size="sm" variant="ghost" onClick={onInvalidToggle}>
            {invalid ? t("components.demo.clearInvalid") : t("components.demo.markInvalid")}
          </Button>
        </div>
      </DemoCard>

      <DemoCard
        docId="TextArea"
        titleKey="components.section.textarea"
        descKey="components.section.textareaDesc"
        onOpenDocs={onOpenDocs}
      >
        <TextArea
          id={notesId}
          value={notes}
          placeholder={t("components.demo.notesPlaceholder")}
          onChange={(e) => onNotesChange(e.target.value)}
          aria-label={t("components.demo.notes")}
        />
      </DemoCard>

      <DemoCard
        docId="Field"
        titleKey="components.section.field"
        descKey="components.section.fieldDesc"
        onOpenDocs={onOpenDocs}
      >
        <Field
          label={t("components.demo.notes")}
          htmlFor={fieldId}
          description={t("components.demo.notesHint")}
        >
          <Input
            id={fieldId}
            value={fieldValue}
            placeholder={t("components.demo.notesPlaceholder")}
            onChange={(e) => onFieldValueChange(e.target.value)}
          />
        </Field>
      </DemoCard>

      <DemoCard
        docId="Button"
        titleKey="components.section.button"
        descKey="components.section.buttonDesc"
        onOpenDocs={onOpenDocs}
      >
        <div className="components-row">
          <Button variant="primary">{t("components.demo.primary")}</Button>
          <Button variant="secondary">{t("components.demo.secondary")}</Button>
          <Button variant="ghost">{t("components.demo.ghost")}</Button>
          <Button variant="text">{t("components.demo.text")}</Button>
          <Button variant="danger">{t("components.demo.danger")}</Button>
        </div>
        <div className="components-row">
          <Button size="sm">{t("components.demo.small")}</Button>
          <Button size="md">{t("components.demo.medium")}</Button>
          <Button size="lg">{t("components.demo.large")}</Button>
          <Button disabled>{t("components.demo.disabled")}</Button>
          <Button busy>{t("components.demo.loading")}</Button>
        </div>
      </DemoCard>

      <DemoCard
        docId="IconButton"
        titleKey="components.section.iconButton"
        descKey="components.section.iconButtonDesc"
        onOpenDocs={onOpenDocs}
      >
        <div className="components-row">
          <IconButton aria-label={t("nav.back")} title={t("nav.back")}>
            <ChevronLeftIcon />
          </IconButton>
          <IconButton variant="secondary" aria-label={t("nav.forward")} title={t("nav.forward")}>
            <ChevronRightIcon />
          </IconButton>
        </div>
      </DemoCard>

      <DemoCard
        docId="Icon"
        titleKey="components.section.icon"
        descKey="components.section.iconDesc"
        onOpenDocs={onOpenDocs}
      >
        <div className="components-icon-grid">
          {DESIGN_ICON_GALLERY.map(({ name, Icon: Glyph }) => (
            <div key={name} className="components-icon-cell" title={name}>
              <Glyph size="md" />
              <span>{name.replace(/Icon$/, "")}</span>
            </div>
          ))}
        </div>
      </DemoCard>

      <DemoCard
        docId="Spinner"
        titleKey="components.section.spinner"
        descKey="components.section.spinnerDesc"
        onOpenDocs={onOpenDocs}
      >
        <div className="components-row">
          <Spinner size="sm" label={t("components.demo.loading")} />
          <Spinner size="md" label={t("components.demo.loading")} />
          <Spinner size="lg" label={t("components.demo.loading")} />
        </div>
      </DemoCard>
    </>
  );
}
