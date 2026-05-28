import { clsx } from 'clsx'

export function Card({ children, className, ...props }) {
  return (
    <div
      className={clsx('bg-surface-1 border border-border rounded-lg', className)}
      {...props}
    >
      {children}
    </div>
  )
}

export function CardHeader({ children, className }) {
  return (
    <div className={clsx('px-5 py-4 border-b border-border', className)}>
      {children}
    </div>
  )
}

export function CardBody({ children, className }) {
  return (
    <div className={clsx('px-5 py-4', className)}>
      {children}
    </div>
  )
}
