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
  if (res.status === 401 && typeof window !== "undefined") {
    const hadToken = !!localStorage.getItem("access_token")
    clearTokens()
    if (hadToken && !window.location.pathname.startsWith("/auth/")) {
      const next = encodeURIComponent(window.location.pathname + window.location.search)
      window.location.href = `/auth/login?next=${next}`
    }
    throw new APIError(401, "Unauthorized")
  }
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

export async function requestBlob(path: string, init?: RequestInit): Promise<Blob> {
  const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
  })
  if (res.status === 401 && typeof window !== "undefined") {
    const hadToken = !!token
    clearTokens()
    if (hadToken && !window.location.pathname.startsWith("/auth/")) {
      const next = encodeURIComponent(window.location.pathname + window.location.search)
      window.location.href = `/auth/login?next=${next}`
    }
    throw new APIError(401, "Unauthorized")
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }))
    throw new APIError(res.status, (err as { message?: string }).message ?? res.statusText)
  }
  return res.blob()
}

export interface School {
  id: string
  name: string
  code: string
}

export interface SchoolDetail extends School {
  email_suffixes: string[]
  verification_questions: Array<{ question: string; answer?: string }>
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
  cover_image_url?: string | null
  description?: string
  display_order: number
  related_bangumi_id?: string
  related_name?: string
  related_image_url?: string
}

export interface Award {
  id: string
  name: string
  description?: string
  category: "mandatory" | "optional" | "entertainment"
  type: "anime" | "character" | "staff" | "seiyuu" | "other"
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
  is_guest?: boolean
}

export interface UserInfo {
  id: string
  nickname: string
  email?: string
  role: "voter" | "school_admin" | "super_admin"
  school_id?: string
  school_code?: string
  is_guest: boolean
}

// Admin API types
export interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  page_size: number
}

export interface SessionListItem {
  id: string
  year: number
  name: string
  status: "pending" | "active" | "counting" | "published"
  created_at: string
}

export interface SchoolListItem {
  id: string
  name: string
  code: string
  email_suffixes: string[]
  verification_questions: Array<{ question: string; answer?: string }>
  is_active: boolean
  created_at: string
}

export interface AwardListItem {
  id: string
  name: string
  category: "mandatory" | "optional" | "entertainment"
  type: "anime" | "character" | "staff" | "seiyuu" | "other"
  score_config: ScoreConfig
  display_order: number
  session_id: string
  school_id?: string
  nominee_count: number
}

export interface NomineeListItem {
  id: string
  name: string
  cover_image_key?: string
  cover_image_url?: string | null
  description?: string
  display_order: number
  award_id: string
  bangumi_id?: string
  related_bangumi_id?: string
  related_name?: string
  related_image_url?: string
}

export interface VoteItemListItem {
  id: string
  user_nickname: string
  school_name: string
  award_name: string
  nominee_name: string
  score: number
  ip_address: string
  updated_at: string
}

export interface UserListItem {
  id: string
  nickname: string
  email?: string
  role: "voter" | "school_admin" | "super_admin"
  school_name?: string
  is_guest: boolean
  created_at: string
}

export const api = {
  schools: {
    list: () => request<School[]>("/schools"),
    get: (code: string) => request<SchoolDetail>(`/schools/${code}`),
  },
  auth: {
    sendCode: (email: string, schoolCode?: string) =>
      request<{ message: string }>("/auth/send-code", {
        method: "POST",
        body: JSON.stringify({ email, ...(schoolCode ? { school_code: schoolCode } : {}) }),
      }),
    register: async (body: {
      nickname: string
      school_code: string
      method: "question" | "email"
      answers?: string[]
      email?: string
      code?: string
      password: string
    }): Promise<TokenResponse | ConflictResponse> => {
      const res = await fetch(`${BASE}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      if (res.status === 409) {
        return res.json() as Promise<ConflictResponse>
      }
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: res.statusText }))
        throw new APIError(res.status, (err as { message?: string }).message ?? res.statusText)
      }
      return res.json() as Promise<TokenResponse>
    },
    guest: async (body: {
      nickname: string
      school_code: string
      method: "question" | "email"
      answers?: string[]
      email?: string
      code?: string
      reauth?: boolean
    }): Promise<TokenResponse | ConflictResponse> => {
      const token =
        typeof window !== "undefined" ? localStorage.getItem("access_token") : null
      const res = await fetch(`${BASE}/auth/guest`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(body),
      })
      if (res.status === 409) {
        return res.json() as Promise<ConflictResponse>
      }
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: res.statusText }))
        throw new APIError(res.status, (err as { message?: string }).message ?? res.statusText)
      }
      return res.json() as Promise<TokenResponse>
    },
    login: (email: string, password: string) =>
      request<TokenResponse>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      }),
    upgrade: (password: string) =>
      request<{ message: string }>("/auth/upgrade", {
        method: "POST",
        body: JSON.stringify({ password }),
      }),
    verifyEmail: (email: string, code: string) =>
      request<{ message: string }>("/auth/verify-email", {
        method: "POST",
        body: JSON.stringify({ email, code }),
      }),
    sendUpgradeCode: (email: string) =>
      request<{ message: string }>("/auth/send-upgrade-code", {
        method: "POST",
        body: JSON.stringify({ email }),
      }),
    checkNickname: (nickname: string, schoolCode: string) =>
      request<{ available: boolean; conflict?: "same_school" | "different_school"; is_guest?: boolean }>(
        `/auth/check-nickname?nickname=${encodeURIComponent(nickname)}&school_code=${encodeURIComponent(schoolCode)}`
      ),
    claimNickname: async (body: {
      nickname: string
      school_code: string
      email: string
      code: string
    }): Promise<TokenResponse | { conflict: "email_mismatch" }> => {
      const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null
      const res = await fetch(`${BASE}/auth/claim-nickname`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(body),
      })
      if (res.status === 409) return res.json()
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: res.statusText }))
        throw new APIError(res.status, (err as { message?: string }).message ?? res.statusText)
      }
      return res.json()
    },
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
    // Sessions
    listSessions: (params?: { page?: number; page_size?: number; q?: string }) => {
      const query = new URLSearchParams()
      if (params?.page) query.set("page", params.page.toString())
      if (params?.page_size) query.set("page_size", params.page_size.toString())
      if (params?.q) query.set("q", params.q)
      return request<PaginatedResponse<SessionListItem>>(
        `/admin/sessions?${query.toString()}`
      )
    },
    createSession: (data: { year: number; name: string; status?: string }) =>
      request<{ id: string }>("/admin/sessions", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    getSession: (id: string) => request<VotingSession>(`/admin/sessions/${id}`),
    updateSession: (
      id: string,
      data: { year?: number; name?: string; status?: string }
    ) =>
      request<VotingSession>(`/admin/sessions/${id}`, {
        method: "PUT",
        body: JSON.stringify(data),
      }),
    deleteSession: (id: string) =>
      request<void>(`/admin/sessions/${id}`, { method: "DELETE" }),
    // Schools
    listSchools: (params?: { page?: number; page_size?: number; q?: string }) => {
      const query = new URLSearchParams()
      if (params?.page) query.set("page", params.page.toString())
      if (params?.page_size) query.set("page_size", params.page_size.toString())
      if (params?.q) query.set("q", params.q)
      return request<PaginatedResponse<SchoolListItem>>(
        `/admin/schools?${query.toString()}`
      )
    },
    createSchool: (data: {
      name: string
      code: string
      email_suffixes?: string[]
      verification_questions?: Array<{ question: string; answer?: string }>
      is_active?: boolean
    }) =>
      request<{ id: string }>("/admin/schools", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    updateSchool: (
      id: string,
      data: {
        name?: string
        code?: string
        email_suffixes?: string[]
        verification_questions?: Array<{ question: string; answer?: string }>
        is_active?: boolean
      }
    ) =>
      request<SchoolListItem>(`/admin/schools/${id}`, {
        method: "PUT",
        body: JSON.stringify(data),
      }),
    deleteSchool: (id: string) =>
      request<void>(`/admin/schools/${id}`, { method: "DELETE" }),
    // Awards
    listAwards: (params?: { session_id?: string; page?: number; page_size?: number }) => {
      const query = new URLSearchParams()
      if (params?.session_id) query.set("session_id", params.session_id)
      if (params?.page) query.set("page", params.page.toString())
      if (params?.page_size) query.set("page_size", params.page_size.toString())
      return request<PaginatedResponse<AwardListItem>>(
        `/admin/awards?${query.toString()}`
      )
    },
    createAward: (data: {
      session_id: string
      name: string
      category: string
      type?: string
      score_config: ScoreConfig
      display_order?: number
      school_id?: string
    }) =>
      request<{ id: string }>("/admin/awards", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    updateAward: (
      id: string,
      data: {
        name?: string
        category?: string
        type?: string
        score_config?: ScoreConfig
        display_order?: number
        session_id?: string
        school_id?: string
      }
    ) =>
      request<AwardListItem>(`/admin/awards/${id}`, {
        method: "PUT",
        body: JSON.stringify(data),
      }),
    deleteAward: (id: string) =>
      request<void>(`/admin/awards/${id}`, { method: "DELETE" }),
    // Nominees
    listNominees: (params: { award_id: string; page?: number; page_size?: number }) => {
      const query = new URLSearchParams()
      query.set("award_id", params.award_id)
      if (params.page) query.set("page", params.page.toString())
      if (params.page_size) query.set("page_size", params.page_size.toString())
      return request<PaginatedResponse<NomineeListItem>>(
        `/admin/nominees?${query.toString()}`
      )
    },
    createNominee: (data: {
      award_id: string
      name: string
      cover_image_key?: string
      description?: string
      display_order?: number
      bangumi_id?: string
      related_bangumi_id?: string
      related_name?: string
      related_image_url?: string
    }) =>
      request<{ id: string }>("/admin/nominees", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    updateNominee: (
      id: string,
      data: {
        name?: string
        cover_image_key?: string
        description?: string
        display_order?: number
        bangumi_id?: string
        related_bangumi_id?: string
        related_name?: string
        related_image_url?: string
      }
    ) =>
      request<NomineeListItem>(`/admin/nominees/${id}`, {
        method: "PUT",
        body: JSON.stringify(data),
      }),
    deleteNominee: (id: string) =>
      request<void>(`/admin/nominees/${id}`, { method: "DELETE" }),
    // Vote Items
    listVoteItems: (params: { session_id: string; page?: number; page_size?: number }) => {
      const query = new URLSearchParams()
      query.set("session_id", params.session_id)
      if (params.page) query.set("page", params.page.toString())
      if (params.page_size) query.set("page_size", params.page_size.toString())
      return request<PaginatedResponse<VoteItemListItem>>(
        `/admin/vote-items?${query.toString()}`
      )
    },
    deleteVoteItem: (id: string) =>
      request<void>(`/admin/vote-items/${id}`, { method: "DELETE" }),
    // Users
    listUsers: (params?: { page?: number; page_size?: number; q?: string }) => {
      const query = new URLSearchParams()
      if (params?.page) query.set("page", params.page.toString())
      if (params?.page_size) query.set("page_size", params.page_size.toString())
      if (params?.q) query.set("q", params.q)
      return request<PaginatedResponse<UserListItem>>(
        `/admin/users?${query.toString()}`
      )
    },
    patchUserRole: (id: string, role: "voter" | "school_admin" | "super_admin") =>
      request<{ id: string; role: string }>(`/admin/users/${id}/role`, {
        method: "PATCH",
        body: JSON.stringify({ role }),
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
