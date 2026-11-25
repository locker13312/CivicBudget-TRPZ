// Типи відповідей REST API (відповідають моделям читання DAL та DTO бекенду)

export interface LookupItem {
  id: number
  name: string
}

export interface PagedResult<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
}

export interface UserInfo {
  userId: number
  fullName: string
  email: string | null
  roles: string[]
  verificationStatus: string
  verificationMethod: string | null
  birthDate: string | null
}

export interface AuthResponse {
  accessToken: string
  refreshToken: string
  accessExpiresAt: string
  user: UserInfo
}

export interface CampaignCategory {
  categoryId: number
  categoryName: string
  budgetLimit: number
}

export interface Campaign {
  campaignId: number
  campaignYear: number
  name: string
  totalBudget: number
  minProjectCost: number
  maxProjectCost: number
  votesPerVoter: number
  maxVotesPerProject: number
  maxProjectsPerAuthor: number
  minVoterAge: number
  submissionStart: string
  submissionEnd: string
  reviewEnd: string
  votingStart: string
  votingEnd: string
  resultsDate: string
  showInterimResults: boolean
  status: string
  categories: CampaignCategory[]
}

export interface ProjectListItem {
  projectId: number
  campaignId: number
  regNumber: string | null
  title: string
  summary: string | null
  status: string
  categoryId: number
  categoryName: string
  districtId: number
  districtName: string
  cost: number
  totalVotes: number
  authorName: string
  updatedAt: string
  lastDecision: string | null
  lastComment: string | null
}

export interface BudgetItem {
  budgetItemId: number
  name: string
  unit: string
  quantity: number
  unitPrice: number
  amount: number
}

export interface Review {
  reviewId: number
  reviewType: string
  decision: string
  comment: string | null
  reviewerName: string
  createdAt: string
}

export interface ProjectDetails {
  projectId: number
  campaignId: number
  campaignName: string
  campaignStatus: string
  regNumber: string | null
  title: string
  summary: string | null
  description: string | null
  address: string | null
  status: string
  categoryId: number
  categoryName: string
  districtId: number
  districtName: string
  authorId: number
  authorName: string
  createdAt: string
  submittedAt: string | null
  publishedAt: string | null
  cost: number
  totalVotes: number
  onlineVotes: number
  paperVotes: number
  voterCount: number
  budgetItems: BudgetItem[]
  reviews: Review[]
}

export interface ProjectForEdit {
  project: ProjectDetails
  canEdit: boolean
  revisionComment: string | null
}

export interface BudgetItemInput {
  name: string
  unit: string
  quantity: number
  unitPrice: number
}

export interface ProjectEdit {
  title: string
  summary: string
  description: string
  address: string
  categoryId: number
  districtId: number
  budgetItems: BudgetItemInput[]
}

export interface SubmitResult {
  projectId: number
  regNumber: string
  estimatedCost: number
}

export interface ModerationQueue {
  queue: ProjectListItem[]
  readyToPublish: ProjectListItem[]
}

export interface BallotProject {
  projectId: number
  regNumber: string | null
  title: string
  categoryName: string
  districtName: string
  cost: number
  totalVotes: number
  myVotes: number
}

export interface MyBallot {
  campaign: Campaign | null
  votingOpen: boolean
  votesPerVoter: number
  maxVotesPerProject: number
  used: number
  remaining: number
  channel: string | null
  projects: BallotProject[]
}

export interface ResultRow {
  projectId: number
  regNumber: string | null
  title: string
  status: string
  categoryId: number
  categoryName: string
  districtName: string
  cost: number
  totalVotes: number
  onlineVotes: number
  paperVotes: number
  voterCount: number
}

export interface ResultsResponse {
  campaign: Campaign
  votesHidden: boolean
  rows: ResultRow[]
}

export interface UserRow {
  userId: number
  fullName: string
  email: string | null
  birthDate: string | null
  verificationStatus: string
  verificationMethod: string | null
  isBlocked: boolean
  districtName: string | null
  roles: string[]
}

export interface NotificationItem {
  notificationId: number
  projectId: number | null
  notifType: string
  body: string
  isRead: boolean
  createdAt: string
}

export interface WinnerRow {
  categoryId: number
  categoryName: string
  categoryLimit: number
  place: number
  projectId: number
  regNumber: string | null
  title: string
  votes: number
  cost: number
  isWinner: boolean
}

export interface AuditRow {
  auditId: number
  createdAt: string
  userName: string | null
  actionCode: string
  entityName: string
  entityId: number | null
  details: string | null
  ipAddress: string | null
}

export interface Statistics {
  campaign: Campaign
  summary: {
    users: number
    verifiedUsers: number
    projects: number
    publishedProjects: number
    votes: number
    onlineVotes: number
    paperVotes: number
    voters: number
  }
  byCategory: {
    categoryName: string
    projectCount: number
    totalCost: number
    totalVotes: number
    budgetLimit: number
  }[]
  byDistrict: { districtName: string; projectCount: number; totalVotes: number }[]
  byStatus: { status: string; count: number }[]
}

export interface References {
  categories: LookupItem[]
  districts: LookupItem[]
  stations: LookupItem[]
  roles: { code: string; name: string }[]
}
