import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  decideRoomEntry,
  RESUME_HOST,
  RESUME_GUEST,
  TAKE_SEAT,
  NOT_MEMBER,
  ROOM_MISSING,
  ROOM_FULL,
  NOT_SIGNED_IN,
} from './roomEntry.js'

const HOST = 'host-uid'
const GUEST = 'guest-uid'
const STRANGER = 'stranger-uid'

test('the host re-entering their own room resumes instead of claiming a seat', () => {
  // This is the case that broke online play: the database rules require
  // guestUid !== hostUid, so the old "always take the second seat" path
  // failed with PERMISSION_DENIED for the one person who most needed to
  // get back in — and only the host is allowed to deal.
  const meta = { hostUid: HOST, status: 'waiting' }
  assert.deepEqual(decideRoomEntry({ meta, myUid: HOST }), { action: RESUME_HOST, isHost: true })
})

test('the host resumes even after a guest has taken the other seat', () => {
  const meta = { hostUid: HOST, guestUid: GUEST, status: 'waiting' }
  assert.deepEqual(decideRoomEntry({ meta, myUid: HOST }), { action: RESUME_HOST, isHost: true })
})

test('the guest resumes rather than being told the room is full', () => {
  const meta = { hostUid: HOST, guestUid: GUEST, status: 'placing' }
  assert.deepEqual(decideRoomEntry({ meta, myUid: GUEST }), { action: RESUME_GUEST, isHost: false })
})

test('a stranger takes the open seat', () => {
  const meta = { hostUid: HOST, status: 'waiting' }
  assert.deepEqual(decideRoomEntry({ meta, myUid: STRANGER }), { action: TAKE_SEAT, isHost: false })
})

test('a stranger is refused once both seats are taken', () => {
  const meta = { hostUid: HOST, guestUid: GUEST }
  assert.equal(decideRoomEntry({ meta, myUid: STRANGER }).action, ROOM_FULL)
})

test('resume-only entry never consumes the open seat', () => {
  // Landing on a room URL must not take the seat the real opponent is
  // about to claim, so the deep-link path asks for this mode.
  const meta = { hostUid: HOST, status: 'waiting' }
  assert.equal(decideRoomEntry({ meta, myUid: STRANGER, allowNewSeat: false }).action, NOT_MEMBER)
  // ...but a member landing on the same URL still gets back in.
  assert.equal(decideRoomEntry({ meta, myUid: HOST, allowNewSeat: false }).action, RESUME_HOST)
})

test('missing room and missing sign-in are distinguished from each other', () => {
  assert.equal(decideRoomEntry({ meta: null, myUid: HOST }).action, ROOM_MISSING)
  assert.equal(decideRoomEntry({ meta: {}, myUid: HOST }).action, ROOM_MISSING)
  assert.equal(decideRoomEntry({ meta: { hostUid: HOST }, myUid: null }).action, NOT_SIGNED_IN)
})
