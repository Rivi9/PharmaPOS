import { Toaster as Sonner, type ToasterProps } from 'sonner'
import { useThemeStore } from '@renderer/hooks/useTheme'
import {
  CircleCheckIcon,
  InfoIcon,
  TriangleAlertIcon,
  OctagonXIcon,
  Loader2Icon
} from 'lucide-react'

const Toaster = ({ ...props }: ToasterProps) => {
  const theme = useThemeStore((s) => s.resolved)
  return (
    <Sonner
      theme={theme}
      position="top-center"
      // Below the header, so the shift badge and End Shift stay visible.
      offset={{ top: 76 }}
      richColors
      className="toaster group"
      icons={{
        success: <CircleCheckIcon className="size-5" />,
        info: <InfoIcon className="size-5" />,
        warning: <TriangleAlertIcon className="size-5" />,
        error: <OctagonXIcon className="size-5" />,
        loading: <Loader2Icon className="size-5 animate-spin" />
      }}
      style={
        {
          '--normal-bg': 'var(--popover)',
          '--normal-text': 'var(--popover-foreground)',
          '--normal-border': 'var(--border)',
          '--border-radius': 'var(--radius)'
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: 'cn-toast text-base! min-h-14'
        }
      }}
      {...props}
    />
  )
}

export { Toaster }
