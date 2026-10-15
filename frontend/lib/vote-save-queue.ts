export interface VoteSaveState {
  votes: Record<string, number>
  pending: number
  failed: string[]
  lastSavedAt: Date | null
}

// Keep writes in click order and retain failures until that nominee is retried.
// Confirmed scores are separate from optimistic selections so a rejected write
// can restore the actual server value, including after earlier queued writes.
export class VoteSaveQueue {
  private confirmed: Record<string, number>
  private votes: Record<string, number>
  private versions: Record<string, number> = {}
  private failed = new Set<string>()
  private pending = 0
  private lastSavedAt: Date | null = null
  private tail: Promise<void> = Promise.resolve()

  constructor(
    initial: Record<string, number>,
    private save: (nomineeId: string, score: number) => Promise<unknown>,
    private onChange: (state: VoteSaveState) => void,
  ) {
    this.confirmed = { ...initial }
    this.votes = { ...initial }
  }

  enqueue(nomineeId: string, score: number): Promise<void> {
    const version = (this.versions[nomineeId] ?? 0) + 1
    this.versions[nomineeId] = version
    this.votes[nomineeId] = score
    this.failed.delete(nomineeId)
    this.pending++
    this.emit()

    this.tail = this.tail.then(async () => {
      try {
        await this.save(nomineeId, score)
        this.confirmed[nomineeId] = score
        this.lastSavedAt = new Date()
      } catch {
        // A newer selection for the same nominee owns its optimistic display.
        if (this.versions[nomineeId] === version) {
          if (nomineeId in this.confirmed) {
            this.votes[nomineeId] = this.confirmed[nomineeId]
          } else {
            delete this.votes[nomineeId]
          }
          this.failed.add(nomineeId)
        }
      } finally {
        this.pending--
        this.emit()
      }
    })
    return this.tail
  }

  private emit() {
    this.onChange({
      votes: { ...this.votes },
      pending: this.pending,
      failed: [...this.failed],
      lastSavedAt: this.lastSavedAt,
    })
  }
}
