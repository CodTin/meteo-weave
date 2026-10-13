import { useState } from 'react'
import type { DemoAccount } from '@/features/auth/demo-accounts'
import { Info } from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { LoginForm } from '@/features/login/login-form'
import { RoleDescriptions } from '@/features/login/role-descriptions'

export function LoginPreview({ preselectedAccount }: { preselectedAccount?: DemoAccount['id'] }) {
  const [tab, setTab] = useState('login')

  return (
    <Tabs value={tab} onValueChange={setTab}>
      <TabsList aria-label="登录入口内容" className="mb-4 grid w-full grid-cols-2">
        <TabsTrigger value="login">登录</TabsTrigger>
        <TabsTrigger value="explanation">演示说明</TabsTrigger>
      </TabsList>
      <TabsContent value="login" forceMount hidden={tab !== 'login'}>
        <LoginForm preselectedAccount={preselectedAccount} />
      </TabsContent>
      <TabsContent value="explanation" className="space-y-5">
        <p className="flex gap-2 text-sm leading-7 text-muted-foreground">
          <Info className="mt-1 size-5 shrink-0 text-ring" aria-hidden="true" />
          使用公开演示账号登录并恢复会话。以下介绍角色定位；可在设置中切换角色并重新登录，任务配置能力以当前已登录账号为准。
        </p>
        <RoleDescriptions />
      </TabsContent>
    </Tabs>
  )
}
