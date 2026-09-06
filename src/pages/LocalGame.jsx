import { useEffect, useRef, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useLocalGameStore, HUMAN_UID, BOT_UID } from '../store/useLocalGameStore.js'
import { useAuthStore } from '../store/useAuthStore.js'
import { getCurrentTurnUid, getNextCard, PHASE } from '../game/engine.js'
import { maskHiddenRow } from '../game/board.js'
import { recordGameResult, newLocalGameId } from '../store/useLeaderboardStore.js'
import GameScreen from '../components/GameScreen.jsx'

// The local engine's `state.result` is built entirely from HUMAN_UID/
// BOT_UID ('you'/'bot' — see useLocalGameStore.js), since that's all the
// engine itself ever knows about; it has no idea what the signed-in
// player's real Firebase uid is. recordGameResult, though, writes
// `players: [myUid, opponentUid]` using the REAL uid alongside the
// literal 'bot' uid — so a result.winnerUid of 'you' (unchanged) ends up
// compared against a players array that only contains the real uid and
// 'bot'. 'you' is in neither, so firestore.rules' `winnerUid in players`
// check on games/{gameId}'s create rule rejects the write outright.
// 'bot' happens to still match one of the two array entries, which is
// exactly why this only ever failed when the HUMAN won, never when the
// bot did — a real, deterministic bug, not a Firebase deployment issue.
// Only winnerUid and columnsWon's keys carry a uid recordGameResult
// actually reads for this call; nothing else in `result` is uid-keyed.
function forFirestore(result, realUid) {
  const swapUid = (uid) => (uid === HUMAN_UID ? realUid : uid)
  return {
    ...result,
    winnerUid: result.winnerUid === null ? null : swapUid(result.winnerUid),
    columnsWon: result.columnsWon
      ? Object.fromEntries(Object.entries(result.columnsWon).map(([uid, n]) => [swapUid(uid), n]))
      : result.columnsWon,
  }
}

export default function LocalGame() {
  const navigate = useNavigate()
  const location = useLocation()
  const { state, startGame, place, swap, reset } = useLocalGameStore()
  const { user } = useAuthStore()
  const [displayedTip, setDisplayedTip] = useState(null)
  const [statsNote, setStatsNote] = useState(null)

  // A fresh id per game, not per component mount — regenerated in
  // onPlayAgain below alongside reset()+startGame(), since that replays a
  // whole new game inside the same mounted component rather than
  // navigating away and back.
  const [gameId, setGameId] = useState(newLocalGameId)
  // Guards against writing the same finished game twice — e.g. if this
  // effect were to re-run for any reason while `status` is still
  // COMPLETE, which a bare "have I recorded yet" boolean wouldn't survive
  // across the id changing on a "Play Again".
  const recordedGameIdRef = useRef(null)

  useEffect(() => {
    if (!state) {
      startGame({
        humanName: location.state?.name ?? 'You',
        cashGame: location.state?.cashGame,
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Vs-computer games never touched Firestore at all until now, which is
  // the main reason the leaderboard looked broken/permanently empty
  // before recording vs-computer games at all: this is the mode actually
  // played in this sandbox. isOnline: false keeps it that way on purpose
  // even now that it IS recorded — see useLeaderboardStore.js's
  // recordGameResult doc comment: only a real head-to-head result touches
  // the ranked leaderboard stats, so a solo player can't inflate them by
  // farming wins against the bot. "How much you've won vs. the Computer"
  // still gets recorded, as a headToHead entry rather than a leaderboard
  // stat. Best-effort and non-blocking: recording failure (or no
  // signed-in user at all, e.g. a fully offline device) must never affect
  // the result already on screen, only add a footnote to it.
  useEffect(() => {
    if (state?.status !== PHASE.COMPLETE || !state.result) return
    if (!user?.uid || !gameId) return
    if (recordedGameIdRef.current === gameId) return
    recordedGameIdRef.current = gameId

    recordGameResult({
      gameId,
      isHost: true,
      myUid: user.uid,
      myName: state.players[HUMAN_UID].name,
      opponentUid: BOT_UID,
      opponentName: state.players[BOT_UID].name,
      isOnline: false,
      cashGame: state.cashGame,
      result: forFirestore(state.result, user.uid),
    })
      .then((outcome) => {
        if (outcome && outcome.recorded === false) setStatsNote(outcome.reason)
      })
      .catch((err) => setStatsNote(err.message))
    // user?.uid IS a real dependency, not just an exhaustive-deps nag: a
    // brand-new visitor's anonymous sign-in is still in flight (no cached
    // session to resume) when a quick vs-computer game reaches COMPLETE,
    // so the very first run of this effect hits the `!user?.uid` guard
    // above and bails. Without user?.uid listed here, this effect would
    // never fire again once sign-in actually finished — neither
    // state?.status nor gameId change again — so that game's result
    // (and its headToHead entry) would silently never get recorded, with
    // no error shown anywhere, exactly the "new player, nothing happens"
    // failure mode this was reported as.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.status, gameId, user?.uid])

  // engine.js's lastCoachTip is a single shared field the bot's own moves
  // also write to — capture only the human's tips here so a bot move
  // ~700ms later doesn't yank the toast away before its own display timer
  // (see CoachTipToast) has run its course.
  useEffect(() => {
    if (state?.lastCoachTip?.uid === HUMAN_UID) {
      setDisplayedTip(state.lastCoachTip)
    }
  }, [state?.lastCoachTip])

  if (!state) {
    return <div className="flex flex-1 items-center justify-center text-white/60">Dealing…</div>
  }

  const isMyTurn = state.status === PHASE.PLACING && getCurrentTurnUid(state) === HUMAN_UID
  const nextCard = isMyTurn ? getNextCard(state) : null
  // The bot's board object always holds its true hidden card (the local
  // engine has no network boundary to keep it off this client) — mask it
  // until the game reaches COMPLETE, when ShowdownReveal takes over and
  // needs the real values to animate the column-by-column reveal.
  const revealed = state.status === PHASE.COMPLETE
  const opponentBoard = revealed ? state.players[BOT_UID].board : maskHiddenRow(state.players[BOT_UID].board)

  return (
    <GameScreen
      status={state.status}
      myUid={HUMAN_UID}
      myName={state.players[HUMAN_UID].name}
      opponentName={state.players[BOT_UID].name}
      myBoard={state.players[HUMAN_UID].board}
      opponentBoard={opponentBoard}
      isMyTurn={isMyTurn}
      cashGame={state.cashGame}
      nextCard={nextCard}
      onPlaceCard={place}
      swapCard={state.players[HUMAN_UID].swapCard}
      myLocked={state.players[HUMAN_UID].locked}
      opponentLocked={state.players[BOT_UID].locked}
      onSwapCard={swap}
      coachTip={displayedTip}
      result={state.result}
      statsNote={statsNote}
      onPlayAgain={() => {
        reset()
        setStatsNote(null)
        setGameId(newLocalGameId())
        startGame({ humanName: state.players[HUMAN_UID].name, cashGame: state.cashGame })
      }}
      onExit={() => {
        reset()
        navigate('/')
      }}
    />
  )
}
