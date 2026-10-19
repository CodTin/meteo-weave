export function RegionMapPlaceholder({ error }: { error?: string | null }) {
  return (
    <div className="rounded-lg border bg-muted/30 p-6 text-center">
      {error ? (
        <>
          <p className="text-sm text-muted-foreground">地图加载失败：{error}</p>
          <p className="text-sm text-muted-foreground">您仍可通过坐标输入完成区域选择。</p>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">
          地图不可用：未配置 Mapbox 公共访问令牌。您仍可通过坐标输入完成区域选择。
        </p>
      )}
    </div>
  )
}
