"use client"

import { create } from "zustand"
import { School, SchoolDetail, VotingSession } from "@/lib/api"

export type VoteStep = "select-school" | "verify" | "vote" | "conflict"

interface VoteStore {
  step: VoteStep
  school: School | null
  schoolDetail: SchoolDetail | null
  session: VotingSession | null
  conflictType: "same_school" | "different_school" | null
  pendingNickname: string
  setSchool: (school: School, detail: SchoolDetail) => void
  setSession: (session: VotingSession) => void
  goTo: (step: VoteStep) => void
  setConflict: (type: "same_school" | "different_school", nickname: string) => void
  reset: () => void
}

export const useVoteStore = create<VoteStore>((set) => ({
  step: "select-school",
  school: null,
  schoolDetail: null,
  session: null,
  conflictType: null,
  pendingNickname: "",
  setSchool: (school, schoolDetail) => set({ school, schoolDetail }),
  setSession: (session) => set({ session }),
  goTo: (step) => set({ step }),
  setConflict: (conflictType, pendingNickname) =>
    set({ conflictType, pendingNickname, step: "conflict" }),
  reset: () =>
    set({
      step: "select-school",
      school: null,
      schoolDetail: null,
      session: null,
      conflictType: null,
      pendingNickname: "",
    }),
}))
