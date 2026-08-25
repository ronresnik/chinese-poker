import { Link, Outlet } from 'react-router-dom'

export default function Layout() {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-white/10 bg-ink/80 px-4 py-3 backdrop-blur-md">
        <Link to="/" className="font-display text-lg font-bold text-gold-light">
          5♠ Column Poker
        </Link>
        <nav className="flex gap-4 text-sm font-medium text-white/70">
          <Link to="/leaderboard" className="hover:text-gold-light">
            Leaderboard
          </Link>
        </nav>
      </header>
      <main className="flex flex-1 flex-col">
        <Outlet />
      </main>
    </div>
  )
}
