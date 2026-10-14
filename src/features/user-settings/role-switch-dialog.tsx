import { Check, ArrowRightLeft } from 'lucide-react'
import { AccountMark } from '@/features/auth/account-mark'
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
        <Button className="spec02-primary-action">
          <ArrowRightLeft aria-hidden="true" />
          切换演示角色
        </Button>
      </DialogTrigger>
      <DialogContent className="spec02-dialog">
        <DialogHeader className="text-left">
          <DialogTitle className="pr-8">切换演示角色</DialogTitle>
          <DialogDescription>
            确认后将退出当前会话并清理当前工作区的临时状态。目标账号仅预选，下次仍需使用公开演示密码重新登录；取消不会改变当前身份或工作区。
          </DialogDescription>
        </DialogHeader>
        <p className="rounded-md border bg-background px-4 py-3 text-sm leading-6">
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
                className="spec02-role-option text-sm leading-6"
              >
                <input
                  id={`next-demo-${candidate.id}`}
                  type="radio"
                  name="next-demo-account"
                  value={candidate.id}
                  checked={target === candidate.id}
                  onChange={() => setTarget(candidate.id)}
                  className="size-4 shrink-0 accent-primary"
                />
                <AccountMark account={candidate} />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 font-medium">
                    <span>
                      {candidate.roleLabel}{' '}
                      <span className="text-xs font-normal text-muted-foreground">
                        · {candidate.roleTitle}
                      </span>
                    </span>
                    <span className="spec02-selection-label inline-flex min-h-4 min-w-14 items-center gap-1">
                      {target === candidate.id && (
                        <>
                          <Check aria-hidden="true" className="size-3" />
                          已选择
                        </>
                      )}
                    </span>
                  </span>
                  <span className="mt-1 block text-xs text-muted-foreground">
                    {candidate.name} · <code className="font-mono">{candidate.id}</code>
                  </span>
                </span>
              </label>
            ))}
        </fieldset>
        <DialogFooter className="border-t pt-4">
          <Button
            className="spec02-primary-action"
            disabled={!target}
            onClick={() => void endSession(target)}
          >
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
