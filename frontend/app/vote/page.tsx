"use client"

import { useVoteStore } from "@/hooks/useVoteStore"
import { SelectSchool } from "./steps/SelectSchool"
import { Verify } from "./steps/Verify"
import { VoteForm } from "./steps/VoteForm"
import { NicknameConflict } from "./steps/NicknameConflict"

export default function VotePage() {
  const step = useVoteStore((s) => s.step)

  return (
    <div className="container py-8 max-w-3xl mx-auto px-4">
      {step === "select-school" && <SelectSchool />}
      {step === "verify" && <Verify />}
      {step === "vote" && <VoteForm />}
      {step === "conflict" && <NicknameConflict />}
    </div>
  )
}
