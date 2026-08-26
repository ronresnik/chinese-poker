import { test } from 'node:test'
import assert from 'node:assert/strict'
import { classifyRtdbError, shortId, describeRole, buildRoomErrorReport, DENIED, NETWORK, UNKNOWN } from './errors.js'

test('classifyRtdbError recognizes both shapes RTDB uses for a denial', () => {
  // get() rejects with a bare message, update()/set() with the prefixed
  // form and a .code — the whole reason this normalization exists.
  assert.equal(classifyRtdbError(new Error('Permission denied')), DENIED)
  assert.equal(classifyRtdbError(new Error('PERMISSION_DENIED: Permission denied')), DENIED)
  assert.equal(classifyRtdbError({ code: 'PERMISSION_DENIED' }), DENIED)
})

test('classifyRtdbError separates connectivity failures from denials', () => {
  assert.equal(classifyRtdbError(new Error('Failed to fetch')), NETWORK)
  assert.equal(classifyRtdbError(new Error('client is offline')), NETWORK)
  assert.equal(classifyRtdbError(new Error('something else entirely')), UNKNOWN)
})

test('shortId keeps both ends so two uids can be compared at a glance', () => {
  const uid = 'LtmHXfBkRqfpFiYvmNZuc8yknR1'
  const short = shortId(uid)
  assert.ok(short.startsWith('LtmHXfBk'))
  assert.ok(short.endsWith('yknR1'.slice(-4)))
  assert.equal(shortId(null), '(none)')
  assert.equal(shortId('short'), 'short')
})

test('describeRole names which seat the reader holds', () => {
  assert.equal(describeRole({ myUid: 'a', hostUid: 'a', guestUid: 'b' }), 'the HOST of this room')
  assert.equal(describeRole({ myUid: 'b', hostUid: 'a', guestUid: 'b' }), 'the GUEST of this room')
  assert.equal(describeRole({ myUid: 'c', hostUid: 'a', guestUid: 'b' }), 'not a member of this room')
  assert.equal(describeRole({ myUid: null }), 'not signed in')
})

test('a denied guest-seat claim leads with the self-join explanation', () => {
  const report = buildRoomErrorReport({
    op: 'claim-guest-seat',
    path: 'rooms/-ABC/meta/guestUid',
    err: new Error('PERMISSION_DENIED: Permission denied'),
    facts: { roomId: '-ABC', myUid: 'hostuid', hostUid: 'hostuid', roomStatus: 'waiting' },
  })
  // The top-ranked cause has to be the one the database screenshots
  // actually showed: hosting a room and then trying to join it yourself.
  assert.match(report, /1\. You are the host of this room/)
  assert.match(report, /PERMISSION_DENIED/)
  assert.match(report, /rooms\/-ABC\/meta\/guestUid/)
})

test('the report always carries the uid comparison and raw error', () => {
  const report = buildRoomErrorReport({
    op: 'read-meta',
    path: 'rooms/-ABC/meta',
    err: new Error('Permission denied'),
    facts: { roomId: '-ABC', myUid: 'me', hostUid: 'someoneelse', signedIn: false, databaseHost: 'x.firebaseio.com' },
  })
  assert.match(report, /you are\s+: not a member of this room/)
  assert.match(report, /signed in\s+: NO/)
  assert.match(report, /database\s+: x\.firebaseio\.com/)
  assert.match(report, /raw error\s+: Permission denied/)
})

test('network failures do not blame the security rules', () => {
  const report = buildRoomErrorReport({
    op: 'create-room',
    path: 'rooms/-ABC/meta/hostUid',
    err: new Error('Failed to fetch'),
    facts: { roomId: '-ABC', myUid: 'me' },
  })
  assert.match(report, /offline|connection/i)
  assert.doesNotMatch(report, /rules said no/)
})
