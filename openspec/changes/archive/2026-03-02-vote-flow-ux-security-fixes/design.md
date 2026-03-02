# Design: vote-flow-ux-security-fixes

## Architecture Decisions

### Email Normalization
- **Decision**: `strings.ToLower(strings.TrimSpace(email))` applied at:
  1. `SendEmailCode` — normalize before storing in codes map
  2. `GuestByQuestion` — normalize before findOrCreateGuest
  3. `GuestByEmail` — already normalized via code map key lookup
  4. `ClaimNickname` — normalize input before comparing to user.email
  5. Guest creation `SetEmail()` — always store lowercase

### Nickname Matching
- **Decision**: Exact case-sensitive match (existing Ent behavior, no change)
- Rationale: Changing to case-insensitive requires DB migration and index changes; out of scope

### Error Split: ErrNicknameConflictSameSchool → Two Variants
- `ErrNicknameConflictSameSchoolFormal` → 409 `{ conflict: "same_school", is_guest: false }`
- `ErrNicknameConflictSameSchoolGuest` → 409 `{ conflict: "same_school", is_guest: true }`
- Applied in: `findOrCreateGuest`, `createRegistered`, `Guest` handler, `RegisterDirect` handler

### Claim Nickname Security Model
- Only email verification required (not re-running question answer)
- Email must match `user.email` (lowercase-normalized)
- Fails immediately if `user.is_guest = false` → no claim path for formal users
- School code verified to prevent cross-school claims

### Reauth Deprecation
- **Decision**: Hard remove in same PR — not a public/versioned API, no backwards compat needed
- Removes: handler `reauth` branch, `guestRequest.Reauth` field, `ReauthByQuestion`, `ReauthByEmail`

### Frontend State: conflictIsGuest
- Stored in Zustand `useVoteStore` → passed to `NicknameConflict` which conditionally renders
- Set from two paths:
  1. `Nickname.tsx` pre-check (Module D) — from `check-nickname` response
  2. `Verify.tsx` submit (existing path) — from Guest conflict response `is_guest` field

### TagInput @ Prefix
- Handled entirely in component: strip `@` for display, prepend for storage
- Fallback: if stored value already contains `@`, display correctly (idempotent)

## API Contract Summary

```
GET /api/v1/auth/check-nickname?nickname=X&school_code=Y
→ { available: true }
→ { available: false, conflict: "same_school", is_guest: boolean }
→ { available: false, conflict: "different_school" }
→ 400 if params missing | 404 if school not found

POST /api/v1/auth/claim-nickname
Body: { nickname, school_code, email, code }
→ 200 { access_token, refresh_token }
→ 401 invalid/expired code
→ 403 formal user protection
→ 404 school/user not found
→ 409 { conflict: "email_mismatch" }

POST /api/v1/auth/guest (modified)
question method: requires email + code (ErrEmailCodeRequired → 400)
→ 409 { conflict: "same_school", is_guest: boolean }
→ 409 { conflict: "different_school" }
```
