# Toast

轻提示：操作结果的临时反馈，自动消失，不打断当前操作。

- 由 `ToastProvider` 提供能力，`useToast()` 取命令式 API：`info` / `success` / `warning` / `danger` / `show` / `dismiss` / `clear`。
- 文案一律由调用方传入，组件不内置语言。
- 按语气给默认停留时长（info / success 3.2s、warning 5s、danger 6s）；`duration: 0` 常驻。
- 悬停或键盘聚焦暂停计时，离开后重新计时。
- 同屏超过 `max`（默认 4）条时挤掉最旧一条。

```tsx
<ToastProvider dismissLabel={t("common.dismiss")}>
  <App />
</ToastProvider>

const toast = useToast();
toast.success({ title: "已保存" });
toast.danger({ title: "处置失败", description: err.message });
```

何时不用：需要用户决策（确认 / 取消）时用 `ConfirmDialog`；需要长文或表单时用 `Modal`。
