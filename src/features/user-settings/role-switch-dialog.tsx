import { useState } from 'react'
import { useDemoSessionTransition } from '@/features/auth/session-transition'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { demoAccounts, type DemoAccount } from '@/features/auth/demo-accounts'

export function RoleSwitchDialog({ account }: { account: DemoAccount }) {
  const [target, setTarget] = useState('')
  const { endSession } = useDemoSessionTransition()

  return (
    <Dialog
      onOpenChange={(open) => {
        if (open) setTarget('')
      }}
    >
      <DialogTrigger asChild>
        <Button>切换演示角色</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader className="text-left">
          <DialogTitle className="pr-8">切换演示角色</DialogTitle>
          <DialogDescription>
            确认后将退出当前会话并清理当前工作区的临时状态。目标账号仅预选，下次仍需使用公开演示密码重新登录；取消不会改变当前身份或工作区。
          </DialogDescription>
        </DialogHeader>
        <p className="text-sm">
          当前账号：{account.name} · {account.roleLabel}
        </p>
        <fieldset className="space-y-3">
          <legend className="mb-3 text-sm font-medium">选择下次登录的演示角色</legend>
          {demoAccounts
            .filter((candidate) => candidate.id !== account.id)
            .map((candidate) => (
              <label
                key={candidate.id}
                htmlFor={`next-demo-${candidate.id}`}
                aria-label={`${candidate.roleLabel} · ${candidate.roleTitle} · ${candidate.name} · ${candidate.id}`}
                className="flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm leading-7"
              >
                <input
                  id={`next-demo-${candidate.id}`}
                  type="radio"
                  name="next-demo-account"
                  value={candidate.id}
                  checked={target === candidate.id}
                  onChange={() => setTarget(candidate.id)}
                  className="mt-2 size-4 shrink-0 accent-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                />
                <span>
                  <span className="block font-medium">
                    {candidate.roleLabel} · {candidate.roleTitle}
                  </span>
                  <span className="block text-muted-foreground">
                    {candidate.name} · {candidate.id}
                  </span>
                </span>
              </label>
            ))}
        </fieldset>
        <DialogFooter>
          <Button disabled={!target} onClick={() => void endSession(target)}>
            退出并重新登录
          </Button>
          <DialogClose asChild>
            <Button variant="outline">取消</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
