/**
 * electron-builder afterSign 占位：提醒未配置公证时不要指望 Gatekeeper 放行。
 * 正式分发前接 @electron/notarize，并对 asarUnpack 出的 .node / spawn-helper 再签一次名。
 */
export default async function afterSign(_context) {
  if (
    process.env.APPLE_ID &&
    process.env.APPLE_APP_SPECIFIC_PASSWORD &&
    process.env.APPLE_TEAM_ID
  ) {
    console.log(
      "[notarize-hint] 已检测到 Apple 公证环境变量，但本仓库尚未接入 @electron/notarize；请补全后再发正式包。",
    );
    return;
  }
  console.warn(
    "[notarize-hint] 未配置 APPLE_ID / APPLE_APP_SPECIFIC_PASSWORD / APPLE_TEAM_ID；" +
      "未公证的 .app 会被 Gatekeeper 拦截。asarUnpack 的 .node / spawn-helper 也需单独 codesign。",
  );
}
