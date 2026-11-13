import { useNavigate } from 'react-router-dom'
import { Button } from '../components/ui'
import { IconDumbbell } from '../components/icons'

export function NotFound() {
  const navigate = useNavigate()
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-accent text-accent-contrast">
        <IconDumbbell />
      </span>
      <h1 className="text-title font-semibold">Page not found</h1>
      <p className="max-w-xs text-caption text-text-muted">
        That page drifted out of orbit. It may have been moved or removed.
      </p>
      <Button variant="primary" onClick={() => navigate('/')}>
        Back home
      </Button>
    </div>
  )
}
