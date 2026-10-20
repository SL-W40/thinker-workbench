/**
 * 浮层控件样例：Modal / ContextMenu / Popover / Menu（演示状态自持）。
 */
import { Button, ContextMenu, Menu, Modal, Popover } from "@thinker-workbench/design/react";
import { useRef, useState } from "react";
import { useT } from "../../../../i18n/useI18n";
import { DemoCard } from "../ComponentCard";

type Props = {
  onOpenDocs: (docId: string) => void;
};

export function OverlaySection({ onOpenDocs }: Props) {
  const t = useT();
  const [modalOpen, setModalOpen] = useState(false);
  const [ctxOpen, setCtxOpen] = useState(false);
  const [ctxAnchor, setCtxAnchor] = useState<{ x: number; y: number } | null>(null);
  const popoverAnchorRef = useRef<HTMLButtonElement>(null);
  const menuAnchorRef = useRef<HTMLButtonElement>(null);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <>
      <DemoCard
        docId="Modal"
        titleKey="components.section.modal"
        descKey="components.section.modalDesc"
        onOpenDocs={onOpenDocs}
      >
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
          <Modal.Header title={t("components.demo.modalTitle")} titleId="components-modal-title" />
          <Modal.Body>{t("components.demo.modalBody")}</Modal.Body>
          <Modal.Footer>
            <Button variant="ghost" onClick={() => setModalOpen(false)}>
              {t("components.demo.close")}
            </Button>
            <Button variant="primary" onClick={() => setModalOpen(false)}>
              {t("components.demo.confirm")}
            </Button>
          </Modal.Footer>
        </Modal>
      </DemoCard>

      <DemoCard
        docId="ContextMenu"
        titleKey="components.section.contextMenu"
        descKey="components.section.contextMenuDesc"
        onOpenDocs={onOpenDocs}
      >
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
              shortcut: "F2",
              onSelect: () => undefined,
            },
            {
              label: t("components.demo.ctxPin"),
              checked: true,
              onSelect: () => undefined,
            },
            {
              label: t("components.demo.submenu"),
              items: [
                {
                  label: t("components.demo.ctxRename"),
                  onSelect: () => undefined,
                },
              ],
            },
            {
              label: t("components.demo.ctxDelete"),
              danger: true,
              separatorBefore: true,
              onSelect: () => undefined,
            },
          ]}
        />
      </DemoCard>

      <DemoCard
        docId="Popover"
        titleKey="components.section.popover"
        descKey="components.section.popoverDesc"
        onOpenDocs={onOpenDocs}
      >
        <Button
          ref={popoverAnchorRef}
          variant="secondary"
          onClick={() => setPopoverOpen((v) => !v)}
        >
          {t("components.demo.openPopover")}
        </Button>
        <Popover
          open={popoverOpen}
          onClose={() => setPopoverOpen(false)}
          anchorRef={popoverAnchorRef}
          role="dialog"
          aria-label={t("components.section.popover")}
        >
          <p className="components-card-desc">{t("components.demo.popoverBody")}</p>
          <div className="components-row">
            <Button size="sm" variant="primary" onClick={() => setPopoverOpen(false)}>
              {t("components.demo.close")}
            </Button>
          </div>
        </Popover>
      </DemoCard>

      <DemoCard
        docId="Menu"
        titleKey="components.section.menu"
        descKey="components.section.menuDesc"
        onOpenDocs={onOpenDocs}
      >
        <Button ref={menuAnchorRef} variant="secondary" onClick={() => setMenuOpen((v) => !v)}>
          {t("components.demo.openMenu")}
        </Button>
        <Menu
          open={menuOpen}
          onClose={() => setMenuOpen(false)}
          anchorRef={menuAnchorRef}
          aria-label={t("components.section.menu")}
          groups={[
            {
              label: t("components.demo.menuGroup"),
              items: [
                {
                  label: t("components.demo.menuChecked"),
                  description: t("components.demo.menuCheckedDesc"),
                  checked: true,
                  shortcut: "Ctrl+1",
                  onSelect: () => undefined,
                },
                {
                  label: t("components.demo.menuOther"),
                  description: t("components.demo.menuOtherDesc"),
                  shortcut: "Ctrl+2",
                  onSelect: () => undefined,
                },
              ],
            },
            {
              items: [
                {
                  label: t("components.demo.menuDanger"),
                  danger: true,
                  onSelect: () => undefined,
                },
              ],
            },
          ]}
        />
      </DemoCard>
    </>
  );
}
