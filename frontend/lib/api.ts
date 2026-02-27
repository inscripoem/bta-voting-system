const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080/api/v1"

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token =
    typeof window !== "undefined" ? localStorage.getItem("access_token") : null
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }))
    throw new APIError(res.status, (err as { message?: string }).message ?? res.statusText)
  }
  return res.json() as Promise<T>
}

export class APIError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message)
    this.name = "APIError"
  }
}

export interface School {
  id: string
  name: string
  code: string
}

export interface SchoolDetail extends School {
  email_suffixes: string[]
  verification_questions: Array<{ question: string }>
}

export interface VotingSession {
  id: string
  year: number
  name: string
  status: "pending" | "active" | "counting" | "published"
}

export interface ScoreConfig {
  allowed_scores: number[]
  max_count: Record<string, number>
}

export interface Nominee {
  id: string
  name: string
  cover_image_key?: string
  description?: string
  display_order: number
}

export interface Award {
  id: string
  name: string
  description?: string
  category: "mandatory" | "optional" | "entertainment"
  score_config: ScoreConfig
  display_order: number
  school_id?: string
  nominees: Nominee[]
}

export interface VoteItemResponse {
  nominee_id: string
  award_id: string
  score: number
}

export interface TokenResponse {
  access_token: string
  refresh_token: string
}

export interface ConflictResponse {
  conflict: "same_school" | "different_school"
}

export interface UserInfo {
  id: string
  nickname: string
  email?: string
  role: string
  school_id?: string
  is_guest: boolean
}

export const api = {
  schools: {
    list: () => request<School[]>("/schools"),
    get: (code: string) => request<SchoolDetail>(`/schools/${code}`),
  },
  auth: {
    sendCode: (email: string, schoolCode: string) =>
      request<{ message: string }>("/auth/send-code", {
        method: "POST",
        body: JSON.stringify({ email, school_code: schoolCode }),
      }),
    guest: (body: {
      nickname: string
      school_code: string
      method: "question" | "email"
      answer?: string
      email?: string
      code?: string
      reauth?: boolean
    }) => request<TokenResponse | ConflictResponse>("/auth/guest", {
      method: "POST",
      body: JSON.stringify(body),
    }),
    login: (nickname: string, password: string) =>
      request<TokenResponse>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ nickname, password }),
      }),
    upgrade: (email: string) =>
      request<{ message: string }>("/auth/upgrade", {
        method: "POST",
        body: JSON.stringify({ email }),
      }),
  },
  me: {
    get: () => request<UserInfo>("/me"),
  },
  admin: {
    patchSessionStatus: (
      id: string,
      status: "pending" | "active" | "counting" | "published"
    ) =>
      request<VotingSession>(`/admin/sessions/${id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      }),
  },
  sessions: {
    current: () => request<VotingSession>("/sessions/current"),
  },
  awards: {
    list: (schoolId?: string) =>
      request<Award[]>(`/awards${schoolId ? `?school_id=${schoolId}` : ""}`),
  },
  vote: {
    getItems: (sessionId: string) =>
      request<VoteItemResponse[]>(`/vote/items?session_id=${sessionId}`),
    upsertItems: (
      sessionId: string,
      items: Array<{ nominee_id: string; score: number }>
    ) =>
      request<{ status: string }>("/vote/items", {
        method: "PUT",
        body: JSON.stringify({ session_id: sessionId, items }),
      }),
  },
}

export function saveTokens(access: string, refresh: string) {
  localStorage.setItem("access_token", access)
  localStorage.setItem("refresh_token", refresh)
}

export function clearTokens() {
  localStorage.removeItem("access_token")
  localStorage.removeItem("refresh_token")
}
