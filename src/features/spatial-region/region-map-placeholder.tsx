export function RegionMapPlaceholder({ error }: { error?: string | null }) {
  return (
    <div
      className="rounded-lg border bg-muted/30 p-6 text-center space-y-3"
      data-testid="map-config-placeholder"
    >
      {error ? (
        <>
          <p className="text-sm text-muted-foreground">地图加载失败：{error}</p>
          <p className="text-sm text-muted-foreground">您仍可通过坐标输入完成区域选择。</p>
        </>
      ) : (
        <>
          <p className="text-sm font-medium text-muted-foreground">
            地图不可用：未配置 Mapbox 公共访问令牌
          </p>
          <div className="text-xs text-muted-foreground space-y-2">
            <p>演示准备步骤：</p>
            <ol className="list-decimal list-inside space-y-1 text-left max-w-md mx-auto">
              <li>
                在 Mapbox 官网（
                <a
                  href="https://account.mapbox.com/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:text-foreground"
                >
                  account.mapbox.com
                </a>
                ）创建账号并生成公共访问令牌（以 pk. 开头）
              </li>
              <li>将令牌设置为环境变量 VITE_MAPBOX_ACCESS_TOKEN</li>
              <li>重新构建应用以嵌入令牌</li>
            </ol>
            <p className="pt-2">注意：请勿在代码中硬编码或公开提交凭证值</p>
          </div>
          <p className="text-sm text-muted-foreground pt-2">您仍可通过坐标输入完成区域选择。</p>
        </>
      )}
    </div>
  )
}
