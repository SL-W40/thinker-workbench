/**
 * 选择与标记控件样例：Select / SegmentedControl / Switch / Checkbox / RadioGroup / Badge / Kbd / ChoiceCard / SideNavItem。
 */
import {
  Badge,
  Checkbox,
  ChoiceCard,
  Field,
  Kbd,
  RadioGroup,
  SegmentedControl,
  Select,
  SideNavItem,
  Slider,
  Switch,
} from "@thinker-workbench/design/react";
import { useT } from "../../../../ui/i18n/useI18n";
import { DemoCard } from "../ComponentCard";

type Props = {
  on: boolean;
  onOnChange: (value: boolean) => void;
  checked: boolean;
  onCheckedChange: (value: boolean) => void;
  locale: string;
  onLocaleChange: (value: string) => void;
  segment: string;
  onSegmentChange: (value: string) => void;
  radio: string;
  onRadioChange: (value: string) => void;
  slider: number;
  onSliderChange: (value: number) => void;
  choice: string;
  onChoiceChange: (value: string) => void;
  nav: string;
  onNavChange: (value: string) => void;
  recording: boolean;
  onRecordingToggle: () => void;
  onOpenDocs: (docId: string) => void;
};

export function SelectionSection({
  on,
  onOnChange,
  checked,
  onCheckedChange,
  locale,
  onLocaleChange,
  segment,
  onSegmentChange,
  radio,
  onRadioChange,
  slider,
  onSliderChange,
  choice,
  onChoiceChange,
  nav,
  onNavChange,
  recording,
  onRecordingToggle,
  onOpenDocs,
}: Props) {
  const t = useT();

  return (
    <>
      <DemoCard
        docId="Select"
        titleKey="components.section.select"
        descKey="components.section.selectDesc"
        onOpenDocs={onOpenDocs}
      >
        <Field label={t("components.demo.locale")}>
          <Select
            value={locale}
            options={[
              { value: "en", label: t("settings.general.localeEn") },
              { value: "zh", label: t("settings.general.localeZh") },
            ]}
            onChange={onLocaleChange}
            aria-label={t("components.demo.locale")}
          />
        </Field>
      </DemoCard>

      <DemoCard
        docId="SegmentedControl"
        titleKey="components.section.segmented"
        descKey="components.section.segmentedDesc"
        onOpenDocs={onOpenDocs}
      >
        <Field label={t("components.demo.segmented")}>
          <SegmentedControl
            value={segment}
            options={[
              { value: "one", label: t("components.demo.radioOne") },
              { value: "two", label: t("components.demo.radioTwo") },
            ]}
            onChange={onSegmentChange}
            aria-label={t("components.demo.segmented")}
          />
        </Field>
      </DemoCard>

      <DemoCard
        docId="Switch"
        titleKey="components.section.switch"
        descKey="components.section.switchDesc"
        onOpenDocs={onOpenDocs}
      >
        <div className="components-row components-row--between">
          <span>{t("components.demo.switch")}</span>
          <Switch checked={on} onChange={onOnChange} aria-label={t("components.demo.switch")} />
        </div>
      </DemoCard>

      <DemoCard
        docId="Checkbox"
        titleKey="components.section.checkbox"
        descKey="components.section.checkboxDesc"
        onOpenDocs={onOpenDocs}
      >
        <Checkbox checked={checked} onChange={onCheckedChange}>
          {t("components.demo.checkbox")}
        </Checkbox>
      </DemoCard>

      <DemoCard
        docId="RadioGroup"
        titleKey="components.section.radio"
        descKey="components.section.radioDesc"
        onOpenDocs={onOpenDocs}
      >
        <RadioGroup
          name="components-radio"
          value={radio}
          options={[
            { value: "one", label: t("components.demo.radioOne") },
            { value: "two", label: t("components.demo.radioTwo") },
          ]}
          onChange={onRadioChange}
          aria-label={t("components.demo.radio")}
        />
      </DemoCard>

      <DemoCard
        docId="Slider"
        titleKey="components.section.slider"
        descKey="components.section.sliderDesc"
        onOpenDocs={onOpenDocs}
      >
        <Field label={t("components.demo.slider")}>
          <Slider
            value={slider}
            step={10}
            ticks={11}
            valueText={`${slider}%`}
            onChange={onSliderChange}
            aria-label={t("components.demo.slider")}
          />
        </Field>
        <Slider
          value={slider}
          size="sm"
          disabled
          aria-label={t("components.demo.sliderDisabled")}
          onChange={onSliderChange}
        />
      </DemoCard>

      <DemoCard
        docId="Badge"
        titleKey="components.section.badge"
        descKey="components.section.badgeDesc"
        onOpenDocs={onOpenDocs}
      >
        <div className="components-row">
          <Badge>{t("components.demo.badgeNeutral")}</Badge>
          <Badge variant="accent">{t("components.demo.badgeAccent")}</Badge>
          <Badge variant="success">{t("components.demo.badgeSuccess")}</Badge>
          <Badge variant="danger">{t("components.demo.badgeDanger")}</Badge>
        </div>
      </DemoCard>

      <DemoCard
        docId="Kbd"
        titleKey="components.section.kbd"
        descKey="components.section.kbdDesc"
        onOpenDocs={onOpenDocs}
      >
        <div className="components-row">
          <Kbd
            recording={recording}
            onClick={onRecordingToggle}
            aria-label={t("components.demo.kbd")}
          >
            {recording ? t("settings.shortcuts.pressKeys") : "Ctrl+R"}
          </Kbd>
        </div>
      </DemoCard>

      <DemoCard
        docId="ChoiceCard"
        titleKey="components.section.choice"
        descKey="components.section.choiceDesc"
        onOpenDocs={onOpenDocs}
      >
        <div className="components-choice-grid">
          <ChoiceCard selected={choice === "a"} onSelect={() => onChoiceChange("a")}>
            <strong>{t("components.demo.choiceA")}</strong>
            <span>{t("components.demo.choiceADesc")}</span>
          </ChoiceCard>
          <ChoiceCard selected={choice === "b"} onSelect={() => onChoiceChange("b")}>
            <strong>{t("components.demo.choiceB")}</strong>
            <span>{t("components.demo.choiceBDesc")}</span>
          </ChoiceCard>
        </div>
      </DemoCard>

      <DemoCard
        docId="SideNavItem"
        titleKey="components.section.nav"
        descKey="components.section.navDesc"
        onOpenDocs={onOpenDocs}
      >
        <div className="components-nav-demo">
          <SideNavItem selected={nav === "general"} onClick={() => onNavChange("general")}>
            {t("settings.sections.general.title")}
          </SideNavItem>
          <SideNavItem selected={nav === "model"} onClick={() => onNavChange("model")}>
            {t("settings.sections.model.title")}
          </SideNavItem>
        </div>
      </DemoCard>
    </>
  );
}
