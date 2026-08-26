/**
 * Deciding what "enter this room" means is pure logic over the room's
 * meta, so it lives here rather than inline in the store — it's the exact
 * spot the online mode was getting wrong, and this way it can be tested
 * without a live database (which is the one thing development against a
 * free-tier Firebase project can't do; see README's testing notes).
 *
 * The bug this encodes the fix for: the old code only ever considered
 * "a stranger takes the empty second seat". Every other case fell through
 * to that path and was rejected by the database rules as a bare
 * PERMISSION_DENIED — most damagingly when the person entering was the
 * room's own host, which is what happens on every reload of a host's tab.
 */

export const RESUME_HOST = 'resume-host'
export const RESUME_GUEST = 'resume-guest'
export const TAKE_SEAT = 'take-seat'
export const NOT_MEMBER = 'not-member'
export const ROOM_MISSING = 'room-missing'
export const ROOM_FULL = 'room-full'
export const NOT_SIGNED_IN = 'not-signed-in'

export function decideRoomEntry({ meta, myUid, allowNewSeat = true }) {
  if (!myUid) return { action: NOT_SIGNED_IN }
  if (!meta?.hostUid) return { action: ROOM_MISSING }

  // Resuming takes priority over everything else, including a "full"
  // room: a member re-entering is not competing for a seat, they already
  // hold one. Checking this first is what makes a reload survivable.
  if (meta.hostUid === myUid) return { action: RESUME_HOST, isHost: true }
  if (meta.guestUid === myUid) return { action: RESUME_GUEST, isHost: false }

  if (!allowNewSeat) return { action: NOT_MEMBER }
  if (meta.guestUid) return { action: ROOM_FULL }
  return { action: TAKE_SEAT, isHost: false }
}
