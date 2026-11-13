import { IconAlert } from '../components/icons'

export function SetupRequired() {
  return (
    <div className="flex min-h-dvh items-center justify-center px-6">
      <div className="glass max-w-md rounded-hero p-6 shadow-glass-raised">
        <div className="mb-3 flex items-center gap-2 text-accent">
          <IconAlert />
          <h1 className="text-title font-semibold">Setup required</h1>
        </div>
        <p className="text-body text-text-muted">
          Orbit Lifting needs its Supabase environment variables before it can run.
        </p>
        <ol className="mt-4 list-decimal space-y-2 pl-5 text-caption text-text-muted">
          <li>
            Create a Supabase project and run the migrations in{' '}
            <code className="rounded bg-glass-bg-strong px-1">supabase/migrations</code>.
          </li>
          <li>
            Set <code className="rounded bg-glass-bg-strong px-1">VITE_SUPABASE_URL</code> and{' '}
            <code className="rounded bg-glass-bg-strong px-1">VITE_SUPABASE_ANON_KEY</code> as
            GitHub Actions variables (never secrets containing the service-role key).
          </li>
          <li>Push to main — the workflow builds and deploys to GitHub Pages.</li>
        </ol>
      </div>
    </div>
  )
}
