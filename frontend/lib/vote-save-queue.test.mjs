import { test, expect } from "bun:test"
import { VoteSaveQueue } from "./vote-save-queue.ts"

test("a later successful nominee does not hide an earlier failed save", async () => {
  let state
  let fail = true
  const queue = new VoteSaveQueue({ a: 0 }, async (id) => {
    if (id === "a" && fail) throw new Error("offline")
  }, (value) => { state = value })
  const first = queue.enqueue("a", 1)
  const second = queue.enqueue("b", 1)
  await Promise.all([first, second])
  expect(state.votes).toEqual({ a: 0, b: 1 })
  expect(state.failed).toEqual(["a"])
  expect(state.pending).toBe(0)
  fail = false
  await queue.enqueue("a", 1)
  expect(state.failed).toEqual([])
  expect(state.votes).toEqual({ a: 1, b: 1 })
})

test("requests run in click order while newer selections remain visible", async () => {
  let state
  let finishFirst
  const calls = []
  const queue = new VoteSaveQueue({}, async (id, score) => {
    calls.push([id, score])
    if (calls.length === 1) await new Promise((resolve) => { finishFirst = resolve })
  }, (value) => { state = value })
  const first = queue.enqueue("a", 1)
  const second = queue.enqueue("a", 0)
  await Promise.resolve()
  expect(calls).toEqual([["a", 1]])
  expect(state.pending).toBe(2)
  expect(state.votes.a).toBe(0)
  finishFirst()
  await Promise.all([first, second])
  expect(calls).toEqual([["a", 1], ["a", 0]])
  expect(state.pending).toBe(0)
  expect(state.votes.a).toBe(0)
})

test("failed latest selection restores the most recently confirmed score", async () => {
  let state
  const queue = new VoteSaveQueue({}, async (_id, score) => {
    if (score === 0) throw new Error("rejected")
  }, (value) => { state = value })
  await Promise.all([queue.enqueue("a", 1), queue.enqueue("a", 0)])
  expect(state.votes.a).toBe(1)
  expect(state.failed).toEqual(["a"])
})

test("a failed first selection restores the unanswered state", async () => {
  let state
  const queue = new VoteSaveQueue({}, async () => { throw new Error("offline") }, (value) => { state = value })
  await queue.enqueue("a", 1)
  expect(state.votes).toEqual({})
  expect(state.failed).toEqual(["a"])
  expect(state.lastSavedAt).toBeNull()
})

test("an obsolete failed write cannot replace a newer successful selection", async () => {
  let state
  const queue = new VoteSaveQueue({}, async (_id, score) => {
    if (score === 1) throw new Error("offline")
  }, (value) => { state = value })
  await Promise.all([queue.enqueue("a", 1), queue.enqueue("a", 0)])
  expect(state.votes.a).toBe(0)
  expect(state.failed).toEqual([])
  expect(state.pending).toBe(0)
})
