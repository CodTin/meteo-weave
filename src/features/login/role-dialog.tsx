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
            使用公开演示账号选择体验身份。这里介绍角色定位；角色切换与参数权限尚未开放。
          </DialogDescription>
        </DialogHeader>
        <RoleDescriptions />
        <p className="flex gap-2 rounded-md border bg-muted p-3 text-sm leading-7">
          <Info className="mt-1 size-5 shrink-0 text-ring" aria-hidden="true" />
          请勿输入真实凭证。会话仅保存公开演示账号标识，不是生产认证或防篡改机制，只能用于合成 Demo
          数据。
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
