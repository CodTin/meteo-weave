import { useState, useSyncExternalStore } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { Eye, EyeOff, Info } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { FormField } from '@/components/ui/form-field'
import { Input } from '@/components/ui/input'

// UI presence checks only: this is deliberately not an authentication contract.
const formSchema = z.object({
  account: z.string().trim().min(1, '请输入账号'),
  password: z.string().min(1, '请输入密码'),
})

const subscribeToHydration = () => () => undefined

export function LoginForm() {
  // The server snapshot keeps controls disabled until the client submit handler is installed.
  const interactive = useSyncExternalStore(
    subscribeToHydration,
    () => true,
    () => false,
  )
  const [checked, setChecked] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: { account: '', password: '' },
  })

  return (
    <form
      noValidate
      autoComplete="off"
      aria-label="登录表单预览"
      aria-describedby="authentication-boundary"
      data-sentry-block
      onChange={() => setChecked(false)}
      onSubmit={handleSubmit(
        () => setChecked(true),
        () => setChecked(false),
      )}
    >
      <fieldset disabled={!interactive || isSubmitting} className="space-y-5">
        <legend className="sr-only">仅使用虚构内容检查必填项</legend>
        <FormField
          id="login-account"
          label="账号"
          help="必填。仅输入虚构内容，不验证账号真伪。"
          error={errors.account?.message}
        >
          <Input
            id="login-account"
            type="text"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            required
            aria-invalid={Boolean(errors.account)}
            aria-describedby={`login-account-help${errors.account ? ' login-account-error' : ''}`}
            data-sentry-mask
            data-sentry-ignore
            {...register('account')}
          />
        </FormField>
        <FormField
          id="login-password"
          label="密码"
          help="必填。请勿输入真实密码；此处不设认证格式规则。"
          error={errors.password?.message}
        >
          <div className="flex items-center gap-2">
            <Input
              id="login-password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="off"
              required
              aria-invalid={Boolean(errors.password)}
              aria-describedby={`login-password-help${errors.password ? ' login-password-error' : ''}`}
              data-sentry-mask
              data-sentry-ignore
              {...register('password')}
            />
            <Button
              variant="outline"
              size="icon"
              aria-label={showPassword ? '隐藏密码' : '显示密码'}
              aria-pressed={showPassword}
              aria-controls="login-password"
              onClick={() => setShowPassword((visible) => !visible)}
            >
              {showPassword ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
            </Button>
          </div>
        </FormField>
        <Button type="submit" className="w-full active:bg-primary/75">
          检查登录表单
        </Button>
      </fieldset>
      {!interactive && (
        <p className="mt-4 text-sm text-muted-foreground">
          请启用 JavaScript 后预览表单。当前输入与提交已禁用，不会发送数据。
        </p>
      )}
      <output aria-live="polite" aria-atomic="true" className="mt-4 block">
        {checked && (
          <span className="flex gap-3 rounded-md border bg-muted p-4 text-sm leading-7">
            <Info className="mt-1 size-5 shrink-0 text-ring" aria-hidden="true" />
            <span>
              必填项已补全，但演示认证尚未接入。未验证账号或密码，也未建立会话。
              当前仅检查界面，不会发送或保存输入。
            </span>
          </span>
        )}
      </output>
    </form>
  )
}
