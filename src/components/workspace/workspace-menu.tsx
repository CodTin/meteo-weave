import { useEffect, useRef, useState, type RefObject } from 'react'
import { useDemoSessionTransition } from '@/features/auth/session-transition'
import { Menu, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { WorkspaceNavigation } from '@/components/workspace/workspace-navigation'

export function WorkspaceMenu({ contentRef }: { contentRef: RefObject<HTMLElement | null> }) {
  const { endSession } = useDemoSessionTransition()
  const dialogRef = useRef<HTMLDialogElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const [isOpen, setIsOpen] = useState(false)

  useEffect(() => {
    if (!isOpen) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const desktop = window.matchMedia('(min-width: 64rem)')
    const closeOnDesktop = () => {
      if (desktop.matches) dialogRef.current?.close()
    }
    closeOnDesktop()
    desktop.addEventListener('change', closeOnDesktop)
    return () => {
      document.body.style.overflow = previousOverflow
      desktop.removeEventListener('change', closeOnDesktop)
    }
  }, [isOpen])

  function openMenu() {
    // showModal supplies focus containment and makes the rest of the document inert.
    dialogRef.current?.showModal()
    setIsOpen(true)
  }

  function closeMenu() {
    dialogRef.current?.close()
  }

  function restoreFocus() {
    setIsOpen(false)
    // The opener is hidden after a desktop resize; return to content instead.
    const target = window.matchMedia('(min-width: 64rem)').matches
      ? contentRef.current
      : triggerRef.current
    target?.focus({ preventScroll: true })
  }

  return (
    <>
      <Button
        ref={triggerRef}
        variant="outline"
        size="icon"
        className="lg:hidden"
        aria-label="打开工作区导航"
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-controls="workspace-navigation-dialog"
        onClick={openMenu}
      >
        <Menu aria-hidden="true" />
      </Button>
      {/* oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- Native modal backdrop dismissal and Tab wrapping require dialog event handlers. */}
      <dialog
        ref={dialogRef}
        id="workspace-navigation-dialog"
        aria-labelledby="workspace-navigation-title"
        aria-describedby="workspace-navigation-description"
        onClose={restoreFocus}
        onKeyDown={(event) => {
          if (event.key !== 'Tab') return
          // Wrap at the menu boundaries instead of handing focus to browser chrome.
          const controls = event.currentTarget.querySelectorAll<HTMLElement>(
            'button:not(:disabled), a[href]',
          )
          const first = controls[0]
          const last = controls[controls.length - 1]
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault()
            last?.focus()
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault()
            first?.focus()
          }
        }}
        onClick={(event) => {
          if (event.target !== event.currentTarget) return
          // Backdrop clicks target the dialog too; panel padding must not dismiss it.
          const bounds = event.currentTarget.getBoundingClientRect()
          if (
            event.clientX < bounds.left ||
            event.clientX > bounds.right ||
            event.clientY < bounds.top ||
            event.clientY > bounds.bottom
          )
            closeMenu()
        }}
        className="fixed inset-y-0 left-0 m-0 h-svh max-h-none w-80 max-w-[calc(100%-3rem)] border-r bg-sidebar p-6 text-sidebar-foreground backdrop:bg-background/80 open:flex open:flex-col open:gap-6"
      >
        <div className="flex items-center justify-between gap-3">
          <h2 id="workspace-navigation-title" className="font-display text-xl font-semibold">
            工作区菜单
          </h2>
          <Button
            autoFocus
            variant="ghost"
            size="icon"
            aria-label="关闭工作区导航"
            onClick={closeMenu}
          >
            <X aria-hidden="true" />
          </Button>
        </div>
        <p
          id="workspace-navigation-description"
          className="text-sm leading-7 text-muted-foreground"
        >
          当前演示账号的工作区。选择页面，或退出登录以结束本次演示。
        </p>
        <WorkspaceNavigation onNavigate={closeMenu} />
        <Button variant="outline" onClick={() => void endSession()}>
          退出登录
        </Button>
      </dialog>
    </>
  )
}
