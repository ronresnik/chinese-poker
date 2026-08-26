/**
 * Realtime Database errors are famously unhelpful in exactly the situation
 * where you most need them. A denied write surfaces as
 * "PERMISSION_DENIED: Permission denied" and a denied read as just
 * "Permission denied" — no path, no operation, no reason, and (by design,
 * so rules can't be probed) no hint about *which* rule said no. Shown
 * straight to a player, as this app used to do, that string is unusable:
 * it can't distinguish "you tried to join your own room" from "the rules
 * in the Firebase Console are older than this build" from "you're offline".
 *
 * This module turns one of those errors plus the caller's context into a
 * report a person can actually act on, and that can be pasted verbatim
 * into a bug report. It deliberately imports nothing from Firebase so it
 * stays unit-testable (see errors.test.js).
 */

export const DENIED = 'permission-denied'
export const NETWORK = 'network'
export const UNKNOWN = 'unknown'

/**
 * RTDB reports the same underlying condition through several shapes
 * depending on which call produced it: get() rejects with a bare
 * "Permission denied", update()/set() with "PERMISSION_DENIED: Permission
 * denied", and some paths carry a machine-readable `.code` while others
 * only have `.message`. Normalize all of it to one of the constants above.
 */
export function classifyRtdbError(err) {
  const text = `${err?.code ?? ''} ${err?.message ?? ''}`.toUpperCase()
  if (text.includes('PERMISSION')) return DENIED
  if (
    text.includes('NETWORK') ||
    text.includes('UNAVAILABLE') ||
    text.includes('OFFLINE') ||
    text.includes('DISCONNECT') ||
    text.includes('FAILED TO FETCH')
  ) {
    return NETWORK
  }
  return UNKNOWN
}

// Room ids and uids are long opaque push keys; printing them in full makes
// the report unreadable, but they still have to be comparable at a glance
// (the single most useful diagnostic here is "is your uid the same as the
// host uid?"), so keep both ends rather than truncating to a prefix.
export function shortId(id) {
  if (!id) return '(none)'
  const s = String(id)
  return s.length <= 16 ? s : `${s.slice(0, 8)}…${s.slice(-4)}`
}

/**
 * Each room operation gets a human label and its own set of likely causes,
 * because "permission denied" means something completely different
 * depending on which write it was. These are ordered most-likely-first.
 */
const OPS = {
  'read-meta': {
    label: 'look up the room',
    verb: 'read',
    deniedHints: [
      'The database rules published in the Firebase Console are older than this app. `rooms/$roomId/meta` must be readable by any signed-in user, because someone checking whether a room exists is not a member of it yet.',
      'You are not signed in. Anonymous sign-in can silently fail in a private/incognito window or an in-app browser (Instagram, WhatsApp, Messenger) that blocks site storage — try opening the link in Safari or Chrome directly.',
    ],
  },
  'claim-guest-seat': {
    label: 'take the second seat in the room',
    verb: 'write',
    deniedHints: [
      'You are the host of this room. A room needs two different devices — you cannot be both players. Open the room on your own device instead of joining it, and send the code to your opponent.',
      'Someone else already took the second seat.',
      'The database rules published in the Firebase Console are older than this app.',
    ],
  },
  'write-player': {
    label: 'save your player profile in the room',
    verb: 'write',
    deniedHints: [
      'Your seat in the room was not registered — the room may have been reset or deleted while you were joining.',
      'The database rules published in the Firebase Console are older than this app.',
    ],
  },
  'create-room': {
    label: 'create the room',
    verb: 'write',
    deniedHints: [
      'You are not signed in. Anonymous sign-in can silently fail in a private/incognito window or an in-app browser that blocks site storage — try Safari or Chrome directly.',
      'The database rules published in the Firebase Console are older than this app.',
    ],
  },
  'rejoin': {
    label: 'rejoin the room',
    verb: 'write',
    deniedHints: [
      'This device is signed in as a different anonymous user than the one that was in the room. Anonymous identity is per-browser and is lost if site data is cleared, so the room no longer recognises you.',
      'The room was deleted or reset.',
    ],
  },
  deal: {
    label: 'deal the cards',
    verb: 'write',
    deniedHints: [
      'Only the host deals, and only while the room is still in the "waiting" state. If the room already moved on, the deal was already done.',
      'The database rules published in the Firebase Console are older than this app.',
    ],
  },
  place: {
    label: 'place your card',
    verb: 'write',
    deniedHints: [
      'It may not be your turn any more, or the room has moved to another phase.',
      'The database rules published in the Firebase Console are older than this app.',
    ],
  },
}

function hintsFor(opKey, kind) {
  const op = OPS[opKey]
  if (kind === NETWORK) {
    return [
      'Your device looks offline or the connection dropped mid-request. Check your signal and try again.',
    ]
  }
  if (kind === DENIED) return op?.deniedHints ?? ['The database rules rejected this request.']
  return ['This one is not a permissions problem — the raw error below is the best clue.']
}

/**
 * Builds the multi-line report shown in the app's error area. `facts` is
 * everything known at the call site that helps tell the causes apart —
 * most importantly the reader's own uid next to the room's host/guest
 * uids, since "you are trying to join your own room" and "someone else
 * took the seat" are indistinguishable from Firebase's message alone.
 */
export function buildRoomErrorReport({ op, path, err, facts = {} }) {
  const kind = classifyRtdbError(err)
  const meta = OPS[op]
  const label = meta?.label ?? op
  const verb = meta?.verb ?? 'access'

  const headline =
    kind === DENIED
      ? `The database refused to let this device ${label}.`
      : kind === NETWORK
        ? `Couldn't reach the database to ${label}.`
        : `Something went wrong trying to ${label}.`

  const reason =
    kind === DENIED
      ? 'PERMISSION_DENIED — the security rules said no.'
      : kind === NETWORK
        ? 'The request never reached the server.'
        : (err?.message ?? String(err))

  const lines = [
    headline,
    '',
    `What failed: ${verb} → ${path}`,
    `Firebase said: ${reason}`,
    '',
    'Most likely causes, in order:',
    ...hintsFor(op, kind).map((h, i) => `  ${i + 1}. ${h}`),
    '',
    'Diagnostics (copy this whole block if you report the problem):',
    ...diagnosticLines({ op, path, kind, err, facts }),
  ]

  return lines.join('\n')
}

function diagnosticLines({ op, path, kind, err, facts }) {
  const rows = [
    ['operation', op],
    ['path', path],
    ['classified as', kind],
    ['raw error', err?.message ?? String(err)],
    ['raw code', err?.code ?? '(none)'],
    ['your uid', shortId(facts.myUid)],
    ['room id', facts.roomId ?? '(none)'],
    ['room hostUid', shortId(facts.hostUid)],
    ['room guestUid', shortId(facts.guestUid)],
    ['room status', facts.roomStatus ?? '(unknown)'],
    ['you are', describeRole(facts)],
    ['signed in', facts.signedIn === undefined ? '(unknown)' : facts.signedIn ? 'yes (anonymous)' : 'NO — this alone explains a permission error'],
    ['database', facts.databaseHost ?? '(unknown)'],
    ['app mode', facts.mode ?? '(unknown)'],
    ['time', facts.now ?? new Date().toISOString()],
  ]
  const width = Math.max(...rows.map(([k]) => k.length))
  return rows.map(([k, v]) => `  ${k.padEnd(width)} : ${v}`)
}

// The single most diagnostic line in the whole report: it collapses the
// uid comparison a reader would otherwise have to do by eye.
export function describeRole({ myUid, hostUid, guestUid }) {
  if (!myUid) return 'not signed in'
  if (myUid === hostUid) return 'the HOST of this room'
  if (myUid === guestUid) return 'the GUEST of this room'
  if (!hostUid) return 'a stranger to this room (room has no host?)'
  return 'not a member of this room'
}
