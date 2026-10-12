import { Info, X } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
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
import { RoleDescriptions } from '@/features/login/role-descriptions'

export function RoleDialog() {
  return (
    <Dialog>
      <DialogTrigger className={buttonVariants({ variant: 'secondary', className: 'w-full' })}>
        <Info aria-hidden="true" />
        查看角色与演示说明
      </DialogTrigger>
      <DialogContent>
        <DialogHeader className="text-left">
          <DialogTitle className="pr-8">角色与演示说明</DialogTitle>
          <DialogDescription>
            真实 Demo 登录属于 Spec 02。这里仅说明计划中的角色定位，不能登录、切换角色或更改权限。
          </DialogDescription>
        </DialogHeader>
        <RoleDescriptions />
        <p className="flex gap-2 rounded-md border bg-muted p-3 text-sm leading-7">
          <Info className="mt-1 size-5 shrink-0 text-ring" aria-hidden="true" />
          请勿输入真实凭证。表单只检查必填项，不验证身份，不发送或保存输入。
        </p>
        <DialogFooter>
          <DialogClose className={buttonVariants({ variant: 'outline' })}>
            <X aria-hidden="true" />
            关闭说明
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
