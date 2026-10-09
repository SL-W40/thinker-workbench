/**
 * 设计系统组件目录页：在应用内展示 `@thinker-workbench/design/react` 控件样例。
 * 点击卡片标题可打开弹窗，用自研 Markdown 渲染对应组件说明文档。
 * 路由一般为 `#/components`；非激活时 CSS hidden 保活。
 */
import { useId, useState, type ReactNode } from "react";
import {
  Badge,
  Button,
  Callout,
  Checkbox,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChoiceCard,
  ContextMenu,
  EmptyState,
  Field,
  FolderIcon,
  IconButton,
  Input,
  Kbd,
  listDesignIcons,
  Masonry,
  Modal,
  Progress,
  RadioGroup,
  SegmentedControl,
  Select,
  Separator,
  SideNavItem,
  Spinner,
  Switch,
  TextArea,
  useDesignTheme,
} from "@thinker-workbench/design/react";
import { MarkdownView } from "@thinker-workbench/markdown/react";
import { useT } from "../../i18n/I18nProvider";
import type { MessageKey } from "../../i18n/translate";
import { getComponentDoc } from "./componentDocs";
import "./components.less";

/** 嵌套演示固定 3 列，不跟容器宽度降列。 */
const MASONRY_DEMO_BREAKPOINTS: [] = [];

/** 设计图标画廊（稳定顺序）。 */
const DESIGN_ICON_GALLERY = listDesignIcons();

type Props = {
  /** 当前是否为可见的组件目录页（否则 CSS hidden，仍可保活）。 */
  active: boolean;
};

type CardProps = {
  /** 对应 `packages/design/src/components/<docId>/<docId>.md`。 */
  docId: string;
  title: string;
  description: string;
  docsHint: string;
  onOpenDocs: (docId: string) => void;
  children: ReactNode;
};

/** 预览卡：标题可点开说明文档，正文区留给交互演示。 */
function ComponentCard({ docId, title, description, docsHint, onOpenDocs, children }: CardProps) {
  return (
    <section className="components-card">
      <button
        type="button"
        className="components-card-title"
        onClick={() => onOpenDocs(docId)}
        aria-label={`${title} — ${docsHint}`}
      >
        <h2>{title}</h2>
        <span className="components-card-docs-hint">{docsHint}</span>
      </button>
      <p className="components-card-desc">{description}</p>
      {children}
    </section>
  );
}

/**
 * 瀑布流卡片式预览：每个控件一张卡；页面本身用 Masonry 排布。
 * 各控件绑定独立 useState，便于点击试用；`useId` 保证 Field/htmlFor 在同页唯一。
 */
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
  /** Select 演示用语言选项（非应用真实 locale）。 */
  const [locale, setLocale] = useState("en");
  const [on, setOn] = useState(true);
  const [checked, setChecked] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [ctxOpen, setCtxOpen] = useState(false);
  const [ctxAnchor, setCtxAnchor] = useState<{ x: number; y: number } | null>(null);
  /** 切换 Input 的 invalid 态，演示错误描边。 */
  const [invalid, setInvalid] = useState(false);
  const [segment, setSegment] = useState("regular");
  const [choice, setChoice] = useState("a");
  const [nav, setNav] = useState("general");
  const [radio, setRadio] = useState("one");
  /** Kbd 录制高亮开关（演示 recording 视觉）。 */
  const [recording, setRecording] = useState(false);
  const [progress, setProgress] = useState(42);
  /** 当前打开的组件说明文档 id；null 表示关闭。 */
  const [docId, setDocId] = useState<string | null>(null);

  const docsHint = t("components.openDocs");
  const card = (id: string, titleKey: MessageKey, descKey: MessageKey, children: ReactNode) => (
    <ComponentCard
      docId={id}
      title={t(titleKey)}
      description={t(descKey)}
      docsHint={docsHint}
      onOpenDocs={setDocId}
    >
      {children}
    </ComponentCard>
  );

  return (
    <div className="components-shell" hidden={!active}>
      <header className="components-header">
        <h1>{t("components.title")}</h1>
        <p>{t("components.lead")}</p>
      </header>

      <Masonry className="components-grid" gap={16}>
        {card("Masonry", "components.section.masonry", "components.section.masonryDesc", (
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
        ))}

        {card("Input", "components.section.input", "components.section.inputDesc", (
          <>
            <Input
              id={nameId}
              value={text}
              invalid={invalid}
              placeholder={t("components.demo.namePlaceholder")}
              onChange={(e) => setText(e.target.value)}
              aria-label={t("components.demo.name")}
            />
            <div className="components-row">
              <Button size="sm" variant="ghost" onClick={() => setInvalid((v) => !v)}>
                {invalid ? t("components.demo.clearInvalid") : t("components.demo.markInvalid")}
              </Button>
            </div>
          </>
        ))}

        {card("TextArea", "components.section.textarea", "components.section.textareaDesc", (
          <TextArea
            id={notesId}
            value={notes}
            placeholder={t("components.demo.notesPlaceholder")}
            onChange={(e) => setNotes(e.target.value)}
            aria-label={t("components.demo.notes")}
          />
        ))}

        {card("Field", "components.section.field", "components.section.fieldDesc", (
          <Field
            label={t("components.demo.notes")}
            htmlFor={fieldId}
            description={t("components.demo.notesHint")}
          >
            <Input
              id={fieldId}
              value={fieldValue}
              placeholder={t("components.demo.notesPlaceholder")}
              onChange={(e) => setFieldValue(e.target.value)}
            />
          </Field>
        ))}

        {card("Button", "components.section.button", "components.section.buttonDesc", (
          <>
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
            </div>
          </>
        ))}

        {card("IconButton", "components.section.iconButton", "components.section.iconButtonDesc", (
          <div className="components-row">
            <IconButton aria-label={t("nav.back")} title={t("nav.back")}>
              <ChevronLeftIcon />
            </IconButton>
            <IconButton variant="secondary" aria-label={t("nav.forward")} title={t("nav.forward")}>
              <ChevronRightIcon />
            </IconButton>
          </div>
        ))}

        {card("Icon", "components.section.icon", "components.section.iconDesc", (
          <div className="components-icon-grid">
            {DESIGN_ICON_GALLERY.map(({ name, Icon: Glyph }) => (
              <div key={name} className="components-icon-cell" title={name}>
                <Glyph size="md" />
                <span>{name.replace(/Icon$/, "")}</span>
              </div>
            ))}
          </div>
        ))}

        {card("Spinner", "components.section.spinner", "components.section.spinnerDesc", (
          <div className="components-row">
            <Spinner size="sm" label={t("components.demo.loading")} />
            <Spinner size="md" label={t("components.demo.loading")} />
            <Spinner size="lg" label={t("components.demo.loading")} />
          </div>
        ))}

        {card("Select", "components.section.select", "components.section.selectDesc", (
          <Field label={t("components.demo.locale")}>
            <Select
              value={locale}
              options={[
                { value: "en", label: t("settings.general.localeEn") },
                { value: "zh", label: t("settings.general.localeZh") },
              ]}
              onChange={setLocale}
              aria-label={t("components.demo.locale")}
            />
          </Field>
        ))}

        {card(
          "SegmentedControl",
          "components.section.segmented",
          "components.section.segmentedDesc",
          (
            <Field label={t("components.demo.segmented")}>
              <SegmentedControl
                value={segment}
                options={[
                  { value: "regular", label: t("settings.general.typeStyle.regular") },
                  { value: "hand", label: t("settings.general.typeStyle.hand") },
                ]}
                onChange={setSegment}
                aria-label={t("components.demo.segmented")}
              />
            </Field>
          ),
        )}

        {card("Switch", "components.section.switch", "components.section.switchDesc", (
          <div className="components-row components-row--between">
            <span>{t("components.demo.switch")}</span>
            <Switch checked={on} onChange={setOn} aria-label={t("components.demo.switch")} />
          </div>
        ))}

        {card("Checkbox", "components.section.checkbox", "components.section.checkboxDesc", (
          <Checkbox checked={checked} onChange={setChecked}>
            {t("components.demo.checkbox")}
          </Checkbox>
        ))}

        {card("RadioGroup", "components.section.radio", "components.section.radioDesc", (
          <RadioGroup
            name="components-radio"
            value={radio}
            options={[
              { value: "one", label: t("components.demo.radioOne") },
              { value: "two", label: t("components.demo.radioTwo") },
            ]}
            onChange={setRadio}
            aria-label={t("components.demo.radio")}
          />
        ))}

        {card("Badge", "components.section.badge", "components.section.badgeDesc", (
          <div className="components-row">
            <Badge>{t("components.demo.badgeNeutral")}</Badge>
            <Badge variant="accent">{t("components.demo.badgeAccent")}</Badge>
            <Badge variant="success">{t("components.demo.badgeSuccess")}</Badge>
            <Badge variant="danger">{t("components.demo.badgeDanger")}</Badge>
          </div>
        ))}

        {card("Kbd", "components.section.kbd", "components.section.kbdDesc", (
          <div className="components-row">
            <Kbd
              recording={recording}
              onClick={() => setRecording((v) => !v)}
              aria-label={t("components.demo.kbd")}
            >
              {recording ? t("settings.shortcuts.pressKeys") : "Ctrl+R"}
            </Kbd>
          </div>
        ))}

        {card("ChoiceCard", "components.section.choice", "components.section.choiceDesc", (
          <div className="components-choice-grid">
            <ChoiceCard selected={choice === "a"} onSelect={() => setChoice("a")}>
              <strong>{t("components.demo.choiceA")}</strong>
              <span>{t("components.demo.choiceADesc")}</span>
            </ChoiceCard>
            <ChoiceCard selected={choice === "b"} onSelect={() => setChoice("b")}>
              <strong>{t("components.demo.choiceB")}</strong>
              <span>{t("components.demo.choiceBDesc")}</span>
            </ChoiceCard>
          </div>
        ))}

        {card("SideNavItem", "components.section.nav", "components.section.navDesc", (
          <div className="components-nav-demo">
            <SideNavItem selected={nav === "general"} onClick={() => setNav("general")}>
              {t("settings.sections.general.title")}
            </SideNavItem>
            <SideNavItem selected={nav === "model"} onClick={() => setNav("model")}>
              {t("settings.sections.model.title")}
            </SideNavItem>
          </div>
        ))}

        {card("Callout", "components.section.callout", "components.section.calloutDesc", (
          <>
            <Callout tone="info" title={t("components.demo.calloutInfo")}>
              {t("components.demo.calloutBody")}
            </Callout>
            <Callout tone="warning">{t("components.demo.calloutWarn")}</Callout>
          </>
        ))}

        {card("Progress", "components.section.progress", "components.section.progressDesc", (
          <>
            <Progress value={progress} aria-label={t("components.demo.progress")} />
            <Progress indeterminate aria-label={t("components.demo.progressIndeterminate")} />
            <div className="components-row">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setProgress((p) => Math.min(100, p + 10))}
              >
                {t("components.demo.progressMore")}
              </Button>
            </div>
          </>
        ))}

        {card("EmptyState", "components.section.empty", "components.section.emptyDesc", (
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
        ))}

        {card("Separator", "components.section.separator", "components.section.separatorDesc", (
          <>
            <p className="components-card-desc">{t("components.demo.separatorAbove")}</p>
            <Separator />
            <p className="components-card-desc">{t("components.demo.separatorBelow")}</p>
          </>
        ))}

        {card("Modal", "components.section.modal", "components.section.modalDesc", (
          <>
            <Button variant="primary" onClick={() => setModalOpen(true)}>
              {t("components.demo.openModal")}
            </Button>
            <Modal
              open={modalOpen}
              onClose={() => setModalOpen(false)}
              closeOnBackdrop
              closeOnEscape
              aria-labelledby="components-modal-title"
            >
              <h2 id="components-modal-title" className="components-modal-title">
                {t("components.demo.modalTitle")}
              </h2>
              <p className="components-modal-body">{t("components.demo.modalBody")}</p>
              <div className="components-row components-row--end">
                <Button variant="ghost" onClick={() => setModalOpen(false)}>
                  {t("components.demo.close")}
                </Button>
                <Button variant="primary" onClick={() => setModalOpen(false)}>
                  {t("components.demo.confirm")}
                </Button>
              </div>
            </Modal>
          </>
        ))}

        {card("ContextMenu", "components.section.contextMenu", "components.section.contextMenuDesc", (
          <>
            <Button
              variant="secondary"
              onClick={(e) => {
                const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                setCtxAnchor({ x: rect.left, y: rect.bottom + 4 });
                setCtxOpen(true);
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                setCtxAnchor({ x: e.clientX, y: e.clientY });
                setCtxOpen(true);
              }}
            >
              {t("components.demo.openContextMenu")}
            </Button>
            <ContextMenu
              open={ctxOpen}
              anchor={ctxAnchor}
              onClose={() => setCtxOpen(false)}
              aria-label={t("components.section.contextMenu")}
              items={[
                {
                  label: t("components.demo.ctxRename"),
                  onSelect: () => undefined,
                },
                {
                  label: t("components.demo.ctxPin"),
                  onSelect: () => undefined,
                },
                {
                  label: t("components.demo.ctxDelete"),
                  danger: true,
                  separatorBefore: true,
                  onSelect: () => undefined,
                },
              ]}
            />
          </>
        ))}
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
