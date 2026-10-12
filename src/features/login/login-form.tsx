import { useEffect, useState, useSyncExternalStore } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { Eye, EyeOff, Info } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { useSearch, useLocation } from '@tanstack/react-router'
import { useDemoSessionTransition } from '@/features/auth/session-transition'
import { safeReturnTo } from '@/features/auth/return-to'
import { loginDemo } from '@/server/functions/demo-session'
import { Button } from '@/components/ui/button'
import { FormField } from '@/components/ui/form-field'
import { Input } from '@/components/ui/input'

// Presence feedback is local; the server validates the fixed Demo catalog.
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
  const { completeLogin } = useDemoSessionTransition()
  const { returnTo } = useSearch({ from: '/login' })
  const hash = useLocation({ select: (location) => location.hash })
  const [notice, setNotice] = useState('')
  const [loginFailed, setLoginFailed] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const {
    register,
    handleSubmit,
    setFocus,
    formState: { errors, isSubmitting },
  } = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: { account: '', password: '' },
  })

  useEffect(() => {
    // Focus only after the pending fieldset is enabled again.
    if (loginFailed && !isSubmitting) setFocus('account')
  }, [loginFailed, isSubmitting, setFocus])

  return (
    <form
      noValidate
      autoComplete="off"
      aria-label="Demo 登录表单"
      aria-describedby="authentication-boundary demo-credentials"
      data-sentry-block
      onChange={() => {
        setNotice('')
        setLoginFailed(false)
      }}
      onSubmit={handleSubmit(
        async (values) => {
          setLoginFailed(false)
          setNotice('正在登录演示账号…')
          try {
            const result = await loginDemo({ data: values })
            if (!result.ok) {
              setNotice(result.error)
              setLoginFailed(true)
              return
            }
            const destination = safeReturnTo(returnTo)
            // HTTP requests never include fragments. Browsers inherit the original fragment
            // on the SSR login redirect; preserve it only for a valid return destination.
            const target =
              returnTo === destination && hash && !destination.includes('#')
                ? safeReturnTo(`${destination}#${hash}`)
                : destination
            await completeLogin(target)
          } catch {
            setNotice('暂时无法登录，请稍后重试。')
            setLoginFailed(true)
          }
        },
        () => {
          setNotice('')
          setLoginFailed(false)
        },
      )}
    >
      <fieldset disabled={!interactive || isSubmitting} className="space-y-5">
        <legend className="sr-only">使用公开演示账号登录</legend>
        <FormField
          id="login-account"
          label="账号"
          help="必填。使用上方公开的演示账号标识。"
          error={errors.account?.message}
        >
          <Input
            id="login-account"
            type="text"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            required
            aria-invalid={Boolean(errors.account) || loginFailed}
            aria-describedby={`login-account-help${errors.account ? ' login-account-error' : ''}${loginFailed ? ' login-feedback' : ''}`}
            data-sentry-mask
            data-sentry-ignore
            {...register('account')}
          />
        </FormField>
        <FormField
          id="login-password"
          label="密码"
          help="必填。仅使用公开演示密码，请勿输入真实密码。"
          error={errors.password?.message}
        >
          <div className="flex items-center gap-2">
            <Input
              id="login-password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="off"
              required
              aria-invalid={Boolean(errors.password) || loginFailed}
              aria-describedby={`login-password-help${errors.password ? ' login-password-error' : ''}${loginFailed ? ' login-feedback' : ''}`}
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
          {isSubmitting ? '正在登录…' : '登录演示账号'}
        </Button>
      </fieldset>
      {!interactive && (
        <p className="mt-4 text-sm text-muted-foreground">
          请启用 JavaScript 后登录演示账号。当前输入与提交已禁用，不会发送数据。
        </p>
      )}
      <output aria-live="polite" aria-atomic="true" className="mt-4 block">
        {notice && (
          <span className="flex gap-3 rounded-md border bg-muted p-4 text-sm leading-7">
            <Info className="mt-1 size-5 shrink-0 text-ring" aria-hidden="true" />
            <span id="login-feedback">{notice}</span>
          </span>
        )}
      </output>
    </form>
  )
}
