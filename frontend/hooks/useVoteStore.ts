"use client"

import { create } from "zustand"
import { School, SchoolDetail, VotingSession } from "@/lib/api"

export type VoteStep = "select-school" | "nickname" | "verify" | "register" | "vote" | "conflict"

interface VoteStore {
  step: VoteStep
  school: School | null
  schoolDetail: SchoolDetail | null
  session: VotingSession | null
  conflictType: "same_school" | "different_school" | null
  pendingNickname: string
  verifiedEmail: string | null
  verificationMethod: "question" | "email" | null
  setSchool: (school: School, detail: SchoolDetail) => void
  setSession: (session: VotingSession) => void
  goTo: (step: VoteStep) => void
  setNickname: (nickname: string) => void
  setConflict: (type: "same_school" | "different_school", nickname: string) => void
  setVerificationResult: (method: "question" | "email", email: string | null) => void
  reset: () => void
}

export const useVoteStore = create<VoteStore>((set) => ({
  step: "select-school",
  school: null,
  schoolDetail: null,
  session: null,
  conflictType: null,
  pendingNickname: "",
  verifiedEmail: null,
  verificationMethod: null,
  setSchool: (school, schoolDetail) => set({ school, schoolDetail }),
  setSession: (session) => set({ session }),
  goTo: (step) => set({ step }),
  setNickname: (pendingNickname) => set({ pendingNickname }),
  setConflict: (conflictType, pendingNickname) =>
    set({ conflictType, pendingNickname, step: "conflict" }),
  setVerificationResult: (verificationMethod, verifiedEmail) =>
    set({ verificationMethod, verifiedEmail }),
  reset: () =>
    set({
      step: "select-school",
      school: null,
      schoolDetail: null,
      session: null,
      conflictType: null,
      pendingNickname: "",
      verifiedEmail: null,
      verificationMethod: null,
    }),
}))
