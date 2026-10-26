# ConfirmDialog

二次确认对话框，用于替代 `window.confirm`（原生弹窗样式不可控、不跟主题与 i18n）。

```tsx
const [open, setOpen] = useState(false);

<ConfirmDialog
  open={open}
  title={t("inspector.changes.revertAllTitle")}
  description={t("inspector.changes.confirmRevertAll")}
  confirmLabel={t("inspector.changes.revertAll")}
  cancelLabel={t("inspector.changes.cancel")}
  tone="danger"
  busy={busy}
  onConfirm={() => {
    setOpen(false);
    void run();
  }}
  onCancel={() => setOpen(false)}
/>;
```

约定：

- 不可逆操作用 `tone="danger"`，确认按钮不自动聚焦。
- `busy` 期间禁用按钮并关闭 Escape / 蒙层关闭路径。
- 只做「确认 / 取消」二选一；需要输入或长文时直接用 `Modal`。
