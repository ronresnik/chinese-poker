export default function Home() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6 py-10 text-center">
      <h1 className="font-display text-3xl font-bold text-gold-light sm:text-4xl">
        5-Column Poker
      </h1>
      <p className="max-w-sm text-sm text-white/70">
        Build five hands. Win the columns. This is Step 1 scaffolding — lobby,
        matchmaking, and gameplay land in later steps.
      </p>
      <div className="flex w-full max-w-xs flex-col gap-3">
        <button className="btn-gold" disabled>
          Play Online (coming soon)
        </button>
        <button className="btn-ghost" disabled>
          Play vs. Computer (coming soon)
        </button>
      </div>
    </div>
  )
}
