/**
 * 设计系统组件目录页（编排壳）：在应用内展示 `@thinker-workbench/design/react` 控件样例。
 * 点击卡片标题可打开弹窗，用自研 Markdown 渲染对应组件说明文档。
 * 各控件族样例见 ./sections/*。
 */
import { Button, Masonry, Modal, useDesignTheme } from "@thinker-workbench/design/react";
import { MarkdownView } from "@thinker-workbench/markdown/react";
import { useId, useState } from "react";
import { useT } from "../../../i18n/useI18n";
import { getComponentDoc } from "../componentDocs";
import "../components.less";
import { BasicSection } from "./sections/BasicSection";
import { FeedbackSection } from "./sections/FeedbackSection";
import { LayoutSection } from "./sections/LayoutSection";
import { NavigationSection } from "./sections/NavigationSection";
import { OverlaySection } from "./sections/OverlaySection";
import { SelectionSection } from "./sections/SelectionSection";

type Props = {
  /** 当前是否为可见的组件目录页（否则 CSS hidden，仍可保活）。*/
  active: boolean;
};

export function ComponentsPane({ active }: Props) {
  const t = useT();
  const { markdownTheme } = useDesignTheme();
  const nameId = useId();
  const notesId = useId();
  const fieldId = useId();
  const docsTitleId = useId();
  const [text, setText] = useState("doubao-seed-2-1-pro");
  const [notes, setNotes] = useState("");
  const [fieldValue, setFieldValue] = useState("");
  /** Select 演示用语言选项（非应用真实 locale）。*/
  const [locale, setLocale] = useState("en");
  const [on, setOn] = useState(true);
  const [checked, setChecked] = useState(false);
  /** 切换 Input ?invalid 态，演示错误描边。*/
  const [invalid, setInvalid] = useState(false);
  const [segment, setSegment] = useState("one");
  const [choice, setChoice] = useState("a");
  const [nav, setNav] = useState("general");
  const [radio, setRadio] = useState("one");
  /** Kbd 录制高亮开关（演示 recording 视觉）。*/
  const [recording, setRecording] = useState(false);
  const [progress, setProgress] = useState(42);
  /** 当前打开的组件说明文档 id；null 表示关闭。*/
  const [docId, setDocId] = useState<string | null>(null);

  return (
    <div className="components-shell" hidden={!active}>
      <header className="components-header">
        <h1>{t("components.title")}</h1>
        <p>{t("components.lead")}</p>
      </header>

      <Masonry className="components-grid" gap={16}>
        <BasicSection
          nameId={nameId}
          notesId={notesId}
          fieldId={fieldId}
          text={text}
          onTextChange={setText}
          invalid={invalid}
          onInvalidToggle={() => setInvalid((v) => !v)}
          notes={notes}
          onNotesChange={setNotes}
          fieldValue={fieldValue}
          onFieldValueChange={setFieldValue}
          onOpenDocs={setDocId}
        />
        <SelectionSection
          on={on}
          onOnChange={setOn}
          checked={checked}
          onCheckedChange={setChecked}
          locale={locale}
          onLocaleChange={setLocale}
          segment={segment}
          onSegmentChange={setSegment}
          radio={radio}
          onRadioChange={setRadio}
          choice={choice}
          onChoiceChange={setChoice}
          nav={nav}
          onNavChange={setNav}
          recording={recording}
          onRecordingToggle={() => setRecording((v) => !v)}
          onOpenDocs={setDocId}
        />
        <FeedbackSection progress={progress} onProgressChange={setProgress} onOpenDocs={setDocId} />
        <OverlaySection onOpenDocs={setDocId} />
        <NavigationSection onOpenDocs={setDocId} />
        <LayoutSection
          on={on}
          onOnChange={setOn}
          fieldValue={fieldValue}
          onFieldValueChange={setFieldValue}
          onOpenDocs={setDocId}
        />
      </Masonry>

      <Modal
        open={docId != null}
        onClose={() => setDocId(null)}
        closeOnBackdrop
        closeOnEscape
        aria-labelledby={docsTitleId}
        panelClassName="components-docs-panel"
      >
        <div className="components-docs-head">
          <h2 id={docsTitleId} className="components-modal-title">
            {docId ?? ""}
          </h2>
          <Button variant="ghost" size="sm" onClick={() => setDocId(null)}>
            {t("components.demo.close")}
          </Button>
        </div>
        <div className="components-docs-body">
          {docId ? (
            <MarkdownView
              className="components-docs-md"
              markdown={getComponentDoc(docId)}
              theme={markdownTheme}
            />
          ) : null}
        </div>
      </Modal>
    </div>
  );
}
