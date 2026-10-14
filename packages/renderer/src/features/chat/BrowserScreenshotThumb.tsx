/**
 * 时间线展开：懒加载 browser-screenshots 下 PNG 预览。
 */
import { useEffect, useState } from "react";
import { browserReadScreenshot } from "../../bridge/browser";
import { useT } from "../../i18n/useI18n";

type Props = {
  absolutePath: string;
};

/** 展开面板内的截图缩略图。 */
export function BrowserScreenshotThumb({ absolutePath }: Props) {
  const t = useT();
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setDataUrl(null);
    setFailed(false);
    void browserReadScreenshot(absolutePath).then((preview) => {
      if (cancelled) return;
      if (preview?.dataUrl) setDataUrl(preview.dataUrl);
      else setFailed(true);
    });
    return () => {
      cancelled = true;
    };
  }, [absolutePath]);

  if (failed) {
    return (
      <div className="run-timeline-explore-files__shot is-failed">
        {t("chat.exploreScreenshotMissing")}
      </div>
    );
  }
  if (!dataUrl) {
    return (
      <div className="run-timeline-explore-files__shot is-loading">
        {t("chat.exploreScreenshotLoading")}
      </div>
    );
  }
  return (
    <div className="run-timeline-explore-files__shot">
      <img
        className="run-timeline-explore-files__img"
        src={dataUrl}
        alt={t("chat.exploreScreenshotAlt")}
        draggable={false}
      />
    </div>
  );
}
