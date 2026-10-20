/**
 * 布局控件样例：SettingsRow / Disclosure / Table。
 */
import {
  Badge,
  Button,
  Disclosure,
  Input,
  SettingsRow,
  Switch,
  Table,
} from "@thinker-workbench/design/react";
import { useState } from "react";
import { useT } from "../../../../i18n/useI18n";
import { DemoCard } from "../ComponentCard";

type Props = {
  on: boolean;
  onOnChange: (value: boolean) => void;
  fieldValue: string;
  onFieldValueChange: (value: string) => void;
  onOpenDocs: (docId: string) => void;
};

export function LayoutSection({
  on,
  onOnChange,
  fieldValue,
  onFieldValueChange,
  onOpenDocs,
}: Props) {
  const t = useT();
  const [disclosureOpen, setDisclosureOpen] = useState(true);

  return (
    <>
      <DemoCard
        docId="SettingsRow"
        titleKey="components.section.settingsRow"
        descKey="components.section.settingsRowDesc"
        onOpenDocs={onOpenDocs}
      >
        <div>
          <SettingsRow
            title={t("components.demo.settingsRowTitle")}
            description={t("components.demo.settingsRowDesc")}
          >
            <Switch
              checked={on}
              aria-label={t("components.demo.settingsRowTitle")}
              onChange={onOnChange}
            />
          </SettingsRow>
          <SettingsRow
            stack
            title={t("components.demo.settingsRowStackTitle")}
            description={t("components.demo.settingsRowStackDesc")}
          >
            <Input
              value={fieldValue}
              placeholder={t("components.demo.notesPlaceholder")}
              aria-label={t("components.demo.settingsRowStackTitle")}
              onChange={(e) => onFieldValueChange(e.target.value)}
            />
          </SettingsRow>
        </div>
      </DemoCard>

      <DemoCard
        docId="Disclosure"
        titleKey="components.section.disclosure"
        descKey="components.section.disclosureDesc"
        onOpenDocs={onOpenDocs}
      >
        <Disclosure
          title={t("components.demo.disclosureTitle")}
          count={3}
          open={disclosureOpen}
          onOpenChange={setDisclosureOpen}
          actions={
            <Button size="sm" variant="secondary">
              {t("components.demo.disclosureAdd")}
            </Button>
          }
        >
          <p className="components-card-desc">{t("components.demo.disclosureBody")}</p>
        </Disclosure>
      </DemoCard>

      <DemoCard
        docId="Table"
        titleKey="components.section.table"
        descKey="components.section.tableDesc"
        onOpenDocs={onOpenDocs}
      >
        <Table density="compact" scroll={false} cellOverflow="ellipsis">
          <Table.Head>
            <Table.Row>
              <Table.Header>{t("components.demo.tableName")}</Table.Header>
              <Table.Header>{t("components.demo.tableStatus")}</Table.Header>
              <Table.Header fit>{t("components.demo.tableAction")}</Table.Header>
            </Table.Row>
          </Table.Head>
          <Table.Body>
            <Table.Row>
              <Table.Cell>{t("components.demo.tableRowA")}</Table.Cell>
              <Table.Cell>
                <Badge variant="success">{t("components.demo.badgeSuccess")}</Badge>
              </Table.Cell>
              <Table.Cell align="end" fit>
                <Button size="sm" variant="ghost">
                  {t("components.demo.tableEdit")}
                </Button>
              </Table.Cell>
            </Table.Row>
            <Table.Row>
              <Table.Cell>{t("components.demo.tableRowB")}</Table.Cell>
              <Table.Cell>
                <Badge variant="danger">{t("components.demo.badgeDanger")}</Badge>
              </Table.Cell>
              <Table.Cell align="end" fit>
                <Button size="sm" variant="ghost">
                  {t("components.demo.tableEdit")}
                </Button>
              </Table.Cell>
            </Table.Row>
          </Table.Body>
        </Table>
      </DemoCard>
    </>
  );
}
