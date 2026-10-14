export function RoleDescriptions() {
  return (
    <dl className="divide-y text-sm leading-7">
      <div className="py-4 first:pt-0 last:pb-0">
        <dt className="font-medium text-foreground">研究人员</dt>
        <dd className="text-muted-foreground">关注技术指标、模型细节与完整参数控制。</dd>
      </div>
      <div className="py-4 first:pt-0 last:pb-0">
        <dt className="font-medium text-foreground">决策者</dt>
        <dd className="text-muted-foreground">关注应用场景、决策支持信息与中等参数权限。</dd>
      </div>
      <div className="py-4 first:pt-0 last:pb-0">
        <dt className="font-medium text-foreground">农业用户</dt>
        <dd className="text-muted-foreground">关注农业相关气象指标与中等参数权限。</dd>
      </div>
    </dl>
  )
}
