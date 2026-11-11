// apps/server/src/schema.ts
import { gql } from "apollo-server";

export const typeDefs = gql`
  scalar DateTime
  scalar JSON
  scalar JSONObject


  # ---------- Enums ----------
  enum PostKind { POST REEL }
  enum MediaKind { IMAGE VIDEO }
  enum VlogPrivacy { PUBLIC PRIVATE }
  enum VlogRole { OWNER ADMIN MEMBER }
  enum MembershipStatus { PENDING ACCEPTED INVITED REJECTED }
  enum TagStatus { PENDING ACCEPTED REJECTED }
  enum MediaProcessStatus { NONE PENDING PROCESSING DONE FAILED }
  enum AppPlatform { IOS ANDROID }


  # ---------- Account / User ----------
  type Account {
    id: ID!
    email: String
    phoneNumber: String
    profiles: [User!]
    emailVerifiedAt: DateTime
    phoneVerifiedAt: DateTime
  }

  type EmailVerificationState {
    isVerified: Boolean!
    expiresAt: DateTime
  }

  type PhoneVerificationState {
    phoneNumber: String!
    expiresAt: DateTime!
  }

  input OnboardingInput {
    city: String!
    lat: Float
    lng: Float
    educationLevel: String
    educationOrg: String
    educationField: String
    educationGradYear: Int
    interests: [String!]!
  }

  type User {
    id: ID!
    username: String!
    name: String
    avatarUrl: String
    avatarThumbUrl: String
    bio: String
    createdAt: DateTime!

    city: String
    educationLevel: String
    educationOrg: String
    educationField: String
    educationGradYear: Int
    interests: [String!]!
    onboardingCompletedAt: DateTime

    termsVersionAccepted: Int
    termsAcceptedAt: DateTime

    account: Account!

    postCount: Int!
    reelCount: Int!
    followerCount: Int!
    followingCount: Int!
    connectionCount: Int!
    totalLikeCount: Int!

    isMe: Boolean!
    isFollowing: Boolean!
    isPrimary: Boolean!
    isAdmin: Boolean!

    bannedUntil: DateTime
    bannedReason: String

    posts(kind: PostKind, offset: Int = 0, limit: Int = 12): [Post!]!
    tagged(offset: Int = 0, limit: Int = 12): [Post!]!
    sharedCommunities(limit: Int = 6): [GroupLink!]!
    isPrivate: Boolean!
    followRequested: Boolean!
  }

  type AuthPayload { token: String!, user: User! }

  # ---------- Post / Media ----------
  type PostMedia {
    id: ID!
    idx: Int!
    kind: MediaKind!     # IMAGE | VIDEO
    imageUrl: String
    videoUrl: String
    thumbUrl: String
    mime: String!
    order: Int!          # Reihenfolge im Carousel (0..n)
    width: Int
    height: Int
    durationS: Int

    edit: JSON
    processStatus: MediaProcessStatus!
  }
 

  type Post {
    id: ID!
    kind: PostKind!
    imageUrl: String
    videoUrl: String
    thumbUrl: String
    caption: String
    location: String
    locationLat: Float
    locationLng: Float
    likeCount: Int!
    viewCount: Int!
    uniqueViewCount: Int!
    comments(offset: Int = 0, limit: Int = 20): [Comment!]!
    commentCount: Int!
    isLiked: Boolean!
    interests: [String!]!
    createdAt: DateTime!
    updatedAt: DateTime!
    author: User!


    isCarousel: Boolean!
    media: [PostMedia!]!
    taggedVlogs: [Vlog!]!     # akzeptierte Vlogs
    pendingVlogs: [Vlog!]!    # wartet auf Freigabe





    acceptedVlogs: [Vlog!]!
    isMine: Boolean!
    iAmTagged: Boolean!
    iShowOnProfile: Boolean!
    hasAcceptedVlog: Boolean!
    hideFromGrid: Boolean!

    isProcessing: Boolean!


    taggedUsers: [TaggedUser!]!
    communityContext: PostCommunityContext
  }

  type ProfessionalDashboard {
    totalViews: Int!
    totalUniqueViews: Int!
    views: Int!
    previousViews: Int!
    reachedProfiles: Int!
    series: [ProfessionalDashboardPoint!]!
    interactions: Int!
    likes: Int!
    comments: Int!
    newFollowers: Int!
  }

  type ProfessionalDashboardPoint {
    date: String!
    views: Int!
    uniqueViews: Int!
    interactions: Int!
  }

  type ProfileViewer {
    viewedAt: DateTime!
    seen: Boolean!
    viewer: User!
  }

  type PostCommunityContext {
    groupId: ID!
    title: String!
    type: GroupLinkType!
    visibility: GroupLinkVisibility
    slug: String
    reason: String
    sharedCount: Int
  }
 

  # ---------- Stories ----------
  type Story {
    id: ID!
    mediaUrl: String
    thumbUrl: String
    mime: String!
    isVideo: Boolean!
    duration: Int
    isCloseFriends: Boolean!
    createdAt: DateTime!
    author: User!
    editJson: String
    viewCount: Int!
    mentionClickCount: Int!
    linkClickCount: Int!
    locationClickCount: Int!
    pollClickCount: Int!
    questionAnswerCount: Int!
    
    seenByMe: Boolean!
    viewedAtByMe: DateTime
  }

  input CreateStoryInput {
    key: String!
    thumbKey: String
    mime: String!
    duration: Int
    isCloseFriends: Boolean
    editJson: String
  }

  type StoryView {
    id: ID!
    viewer: User!
    viewedAt: DateTime!

  }

  type StoryMention {
    id: ID!
    storyId: ID!
    username: String!
    mentionedUser: User!
    clickCount: Int!
  }

  type StoryLinkClickStats {
    id: ID!
    overlayId: String
    label: String
    url: String!
    clickCount: Int!
  }

  type StoryLocationClickStats {
    id: ID!
    overlayId: String
    label: String!
    clickCount: Int!
  }

  type StoryPollOptionStats {
    optionIndex: Int!
    optionText: String!
    clickCount: Int!
  }

  type StoryPollClickStats {
    id: ID!
    overlayId: String
    question: String!
    totalClickCount: Int!
    options: [StoryPollOptionStats!]!
  }

  type StoryQuestionAnswer {
    id: ID!
    storyId: ID!
    overlayId: String
    prompt: String!
    answer: String!
    createdAt: DateTime!
    respondent: User!
  }

  type StoryViewPage {
    items: [StoryView!]!
    totalCount: Int!
    hasMore: Boolean!
  }


  # ---------- Upload / Explore ----------
  type SignedUpload { putUrl: String! getUrl: String! key: String! mime: String! }

  type ExploreEdge { cursor: String!, node: Post! }
  type ExploreConnection { edges: [ExploreEdge!]!, nextCursor: String }

  # ---------- Vlogs ----------
  type VlogOwner { id: ID!, username: String!, avatarUrl: String }
  type Vlog {
    id: ID!
    slug: String
    title: String!
    description: String
    coverUrl: String
    coverThumbUrl: String
    privacy: VlogPrivacy!
    memberCount: Int!
    postCount: Int!
    owner: User!
    distanceKm: Float
    lat: Float
    lng: Float
    isMember: Boolean!
    isAdmin: Boolean!
    createdAt: DateTime!
    updatedAt: DateTime!
  }

  type VlogMember {
    vlog: Vlog!
    user: User!
    role: VlogRole!
    status: MembershipStatus!
    createdAt: DateTime!
  }

  type VlogTag {
    vlogId: ID!
    postId: ID!
    status: TagStatus!
    createdAt: DateTime!
    post: Post!
    vlog: Vlog!
  }

  type VlogEdge {
    id: ID!
    slug: String!
    title: String!
    description: String
    coverUrl: String
    coverThumbUrl: String!
    privacy: VlogPrivacy!
    memberCount: Int!
    postCount: Int!
    distanceKm: Float
    owner: VlogOwner!
    lat: Float
    lng: Float
    updatedAt: DateTime!
    
    createdAt: DateTime!
  }
  type VlogConnection { edges: [VlogEdge!]!, nextCursor: String }

  # ---------- Notifications ----------
  enum NotificationKind { 
    VLOG_TAG_REQUEST VLOG_TAG_APPROVED VLOG_TAG_REJECTED FOLLOW LIKE COMMENT SYSTEM 
    POST_SHARE_REQUEST
    POST_SHARE_APPROVED
    POST_SHARE_REJECTED
    VLOG_NEW_POST
    VLOG_DELETED  
    FOLLOW_REQUEST
    FOLLOW_REQUEST_ACCEPTED
    STORY_POSTED
    STORY_MENTION
    
  }
  enum NotificationChannel { INBOX ACTIVITY BOTH }

  type Notification {
    id: ID!
    kind: NotificationKind!
    channel: NotificationChannel!
    isRead: Boolean!
    createdAt: DateTime!
    # Beteiligte
    recipient: User!
    fromUser: User
    actor: User
    vlog: Vlog
    post: Post
    requestStatus: RequestStatus
    handledAt: DateTime
    # Zusatzinfos als String-Map (JSON)
    payload: JSON
  }

  type NotificationConnection {
    edges: [Notification!]!
    nextCursor: String
  }

  type Comment {
    id: ID!
    content: String!
    createdAt: DateTime!
    updatedAt: DateTime!
    author: User!
    post: Post!
  }

  # ---------- Inputs ----------
  input UpdateMeInput { name: String, username: String, bio: String, avatarUrl: String, avatarThumbUrl: String }

  input CreateProfileInput { username: String!, name: String }

  input LinkExistingProfileInput { usernameOrEmail: String!, password: String! }

  input CreatePostInput {
    kind: PostKind!
    key: String!
    thumbKey: String
    caption: String
    location: String
    locationLat: Float
    locationLng: Float
    mime: String!
    groupLinkId: ID
    interestLabels: [String!]
    taggedUserIds: [ID!]
    taggedVlogIds: [ID!]
    editMeta: JSON
  }

  input MediaInput {
    idx: Int!
    kind: MediaKind!
    key: String!
    thumbKey: String
    mime: String!
    width: Int
    height: Int
    durationS: Int
    edit: JSON
  }

  input CreateVlogInput {
    title: String!
    slug: String!
    description: String
    coverKey: String
    privacy: VlogPrivacy = PUBLIC
    lat: Float
    lng: Float
  }

  input UpdateVlogInput {
    title: String
    description: String
    coverKey: String
    privacy: VlogPrivacy
    slug: String 
    lat: Float
    lng: Float
  }

  input CreateCarouselPostInput {
    caption: String
    location: String
    locationLat: Float
    locationLng: Float
    media: [MediaInput!]!   # min 1
    groupLinkId: ID
    interestLabels: [String!]
    taggedUserIds: [ID!]
    taggedVlogIds: [ID!]    # werden als PENDING angelegt
  }




  type TaggedUser {
    user: User!
    status: TagStatus!        # PENDING | ACCEPTED | REJECTED
    showOnProfile: Boolean!   # ob im Raster des getaggten Nutzers sichtbar
  }



 

  input UpdatePostInput {
    id: ID!
    caption: String
    location: String
    locationLat: Float
    locationLng: Float
    groupLinkId: ID
    altText: String
    interests: [String!]
    addVlogIds: [ID!]
    
    removeVlogIds: [ID!]
  }




  enum ReportStatus { OPEN REVIEWED ACTION_TAKEN DISMISSED RESOLVED }
  enum ResolveAction {
    NONE            # nur schließen
    DELETE_CONTENT  # post/comment löschen
    SUSPEND_USER    # user sperren (z. B. 7 Tage)
  }

 

  type Report {
    id: ID!
    reason: String!
    details: String
    status: ReportStatus!
    createdAt: DateTime!
    resolvedAt: DateTime
    reporterId: ID!
    postId: ID
    commentId: ID
    targetUserId: ID
  }

  input ReportInput {
    postId: ID
    targetUserId: ID
    commentId: ID
    reason: String!
    details: String
  }

  type AdminReport {
    id: ID!
    reason: String!
    details: String
    status: ReportStatus!
    createdAt: DateTime!
    resolvedAt: DateTime
    reporterId: ID!
    postId: ID
    commentId: ID
    targetUserId: ID
    contentPostId: ID
    offenderId: ID
    offenderUsername: String
  }

  input ReportsFilter {
    status: ReportStatus = OPEN
    reason: String
    reporterId: ID
    targetUserId: ID
  }


  type ReportConnection {
    total: Int!
    nodes: [Report!]!
  }

  enum FeedItemKind {
    POST
    SUGGESTED_POST
    SUGGESTED_PROFILES
  }

  enum HomeFeedMode {
    SONGVERWANDT
    FOLLOWING
  }

  type FeedItem {
    id: ID!
    kind: FeedItemKind!

    # kind=POST | SUGGESTED_POST
    post: Post

    # kind=SUGGESTED_PROFILES
    title: String
    users: [User!]

    source: FeedSource

  }

  enum GroupLinkType {
    FAMILY
    UNI
    BUSINESS
    EVENT
    COMMUNITY
    DROP
    OTHER
  }

  enum GroupLinkVisibility {
    PRIVATE
    PUBLIC
  }

  type GroupLink {
    id: ID!
    code: String!
    title: String!
    type: GroupLinkType!
    visibility: GroupLinkVisibility!
    isNetworkCommunity: Boolean!
    imageUrl: String
    imageThumbUrl: String
    owner: User!
    memberCount: Int!
    viewerIsOwner: Boolean!
    viewerIsMember: Boolean!
    isActive: Boolean!
    createdAt: DateTime!
    expiresAt: DateTime
    slug: String
  }

  input UpdateGroupLinkInput {
    title: String
    imageKey: String
  }

  type CommunitySearchConnection {
    items: [GroupLink!]!
    hasMore: Boolean!
  }

  type CommunityInfluenceProfile { id: ID!, username: String!, name: String, avatarUrl: String }
  enum CommunityInfluenceEarnState { ACTIVE PAUSED PRIVATE UNAVAILABLE }
  enum CommunityInfluenceSupportState { SELF ASSIGNED UNAVAILABLE }
  type CommunityInfluencePosition {
    communityId: ID!
    title: String!
    type: GroupLinkType!
    visibility: GroupLinkVisibility!
    imageUrl: String
    isMember: Boolean!
    joinedAt: DateTime!
    entryPosition: Int
    growthCount: String!
    settledThrough: DateTime
    earnState: CommunityInfluenceEarnState!
    canAssign: Boolean!
    supportState: CommunityInfluenceSupportState!
    recipient: CommunityInfluenceProfile
    earnedUnits: String!
    communityUnits: String!
    participationUnits: String!
    resonanceUnits: String!
  }
  type CommunityInfluenceOverview {
    profile: CommunityInfluenceProfile!
    earnedUnits: String!
    retainedUnits: String!
    assignedUnits: String!
    receivedUnits: String!
    availableUnits: String!
    earningStartsAt: DateTime
    rankingEnabled: Boolean!
    positions: [CommunityInfluencePosition!]!
    hasMore: Boolean!
  }
  extend type Query {
    myCommunityInfluence(offset: Int = 0, limit: Int = 20): CommunityInfluenceOverview!
    communityInfluenceRecipients(q: String!, limit: Int = 20): [CommunityInfluenceProfile!]!
  }
  extend type Mutation {
    setCommunityInfluenceRecipient(communityId: ID!, recipientId: ID, expectedProfileId: ID!): Boolean!
  }

  enum CommunitySuggestionReason { FOLLOWING ACTIVE PUBLIC }
  type CommunitySuggestion {
    community: GroupLink!
    reason: CommunitySuggestionReason!
  }

  type FeedSource {
    kind: String!      # z.B. "GROUP_LINK"
    groupId: ID
    title: String
  }


  type UnreadCounts {
    inbox: Int!
    activity: Int!
  }

  type MiniUser {
    id: ID!
    username: String!
    avatarUrl: String
    avatarThumbUrl: String
  }

  type PostMini {
    id: ID!
    imageUrl: String
    thumbUrl: String
    videoUrl: String
  }


  union ActivityEdge = Notification | ActivityBundle

  type ActivityBundle {
    id: ID!
    kind: ActivityBundleKind!     # LIKE | STORY_SEEN
    latestAt: DateTime!
    createdAt: DateTime!          # = latestAt, fürs Sortieren
    count: Int!
    ids: [ID!]!                   # die Original-Notification-IDs
    actors: [MiniUser!]!          # distinct fromUser
    isRead: Boolean!              # true wenn alle ids isRead
    post: PostMini                # nur bei LIKE
    storyIds: [ID!]!
  }

  enum ActivityBundleKind {
    LIKE
    STORY_POSTED
  }

  type ActivityConnection {
    edges: [ActivityEdge!]!
    nextCursor: String
  }

  type ContextBubble {
    contextId: String!
    key: String!
    label: String!
    kind: String!
    score: Float!
    likeCount: Int!
    postCount: Int!
    uniqueLikerCount: Int!
  }

  enum ContextSearchKind { CONTEXT HASHTAG }

  type ContextSearchHit {
    kind: ContextSearchKind!
    score: Float!

    # kind=CONTEXT
    contextId: String
    contextKey: String
    label: String
    contextKind: String

    # kind=HASHTAG (latent oder promoted)
    hashtag: String
    hashtagKey: String

    postCount: Int!
    uniqueLikerCount: Int!
    likeCount: Int!
    isPromoted: Boolean!
  }

  type JoinGroupResult {
    id: ID!
    title: String!
    chatThread: Thread
  }

  type AppRuntimeConfig {
    platform: AppPlatform!
    minSupportedVersion: String
    latestVersion: String
    storeUrl: String
  }

  # ---------- Queries ----------
  type Query {
    appRuntimeConfig(platform: AppPlatform!, appSlug: String, currentVersion: String): AppRuntimeConfig!
    myJoinedGroupLinks: [GroupLink!]!
    myGroupLinks: [GroupLink!]!
    groupLink(id: ID!): GroupLink
    searchCommunities(q: String!, offset: Int = 0, limit: Int = 6): CommunitySearchConnection!
    suggestedCommunities(limit: Int = 6): [CommunitySuggestion!]!
    groupLinkPosts(groupId: ID!, offset: Int = 0, limit: Int = 20): [Post!]!
    groupLinkMembers(groupId: ID!, limit: Int = 24): [User!]!
    communityThread(groupId: ID!): Thread
    vlogMembers(vlogId: ID!): [VlogMember!]!
  
    searchContexts(q: String!, limit: Int = 20, windowHours: Int = 168): [ContextSearchHit!]!

    suggestPostsByContext(contextKey: String!, kind: PostKind, offset: Int = 0, limit: Int): [Post!]!
    contextBubbles(city: String, limit: Int, windowHours: Int): [ContextBubble!]!
    communityMomentsFeed(offset: Int = 0, limit: Int = 20): [Post!]!
    reelsFeed(offset: Int = 0, limit: Int = 20): [Post!]!

    # Feed/Profil
    feed(offset: Int = 0, limit: Int = 20): [Post!]!
    homeFeed(offset: Int = 0, limit: Int = 20, mode: HomeFeedMode = SONGVERWANDT): [FeedItem!]!
    me: User
    userByUsername(username: String!): User
    userById(id: ID!): User
    postsByUser(userId: ID!, kind: PostKind!, offset: Int = 0, limit: Int = 12): [Post!]!
    taggedPosts(userId: ID!, offset: Int = 0, limit: Int = 12): [Post!]!

    ping: String!
    checkUsernameAvailable(username: String!): Boolean!
    getSignedPostDownload(postId: ID!): String!

    storiesFeed(offset: Int = 0, limit: Int = 20): [Story!]!
    story(id: ID!): Story
    myStories: [Story!]!
    myStoriesRecent: [Story!]!

    exploreFeed(limit: Int = 30, cursor: String): ExploreConnection!
    searchUsers(q: String!, offset: Int = 0, limit: Int = 20): [User!]!

    myProfiles: [User!]!
    account: Account!

    profileGrid(userId: ID!, tab: String!, offset: Int = 0, limit: Int = 24): [Post!]!
    myProfessionalDashboard(days: Int = 30): ProfessionalDashboard!
    myProfileViewers(offset: Int = 0, limit: Int = 30): [ProfileViewer!]!

    # Vlogs
    vlogsFeed(limit: Int = 20, cursor: String): VlogConnection!
    vlogBySlug(slug: String!): Vlog
    myVlogs: [Vlog!]!
    vlogPosts(vlogId: ID!, offset: Int = 0, limit: Int = 20): [Post!]!
    searchVlogs(q: String!, offset: Int = 0, limit: Int = 20, canPostToOnly: Boolean): [Vlog!]!
    vlogsSearch(q: String!, limit: Int = 50, canPostToOnly: Boolean): VlogConnection!
    vlogsNear(lat: Float!, lng: Float!, radiusKm: Float! = 50, limit: Int = 40): VlogConnection!
    pendingVlogTagsByMe(offset: Int = 0, limit: Int = 30): [VlogTag!]!
    myVlogPosts(userId: ID!, offset: Int = 0, limit: Int = 24): [Post!]!
    vlogsICanPostTo: [Vlog!]!
    reelsVlogs(limit: Int = 40, days: Int = 30): VlogConnection!


    
    # Notifications
    inbox(offset: Int = 0, limit: Int = 20): NotificationConnection!
    
    unreadCounts: UnreadCounts!


    

    post(id: ID!): Post
    postComments(postId: ID!, offset: Int = 0, limit: Int = 20): [Comment!]!
    postLikers(postId: ID!, offset: Int = 0, limit: Int = 50): [User!]!

    meMini: User
    currentTermsVersion: Int!
    blockedUsers: [User!]!
    openReports(offset: Int = 0, limit: Int = 50): [AdminReport!]!
    reports(filter: ReportsFilter, offset: Int = 0, limit: Int = 50): [AdminReport!]!
    reportsOverdue24h: ReportConnection!
    adminSuspendedUsers(offset: Int = 0, limit: Int = 50): [User!]!

    followers(userId: ID!, offset: Int = 0, limit: Int = 50): [User!]!
    following(userId: ID!, offset: Int = 0, limit: Int = 50): [User!]!

    storyViewers(
      storyId: ID!
      offset: Int = 0
      limit: Int = 50
    ): StoryViewPage!
    storyMentions(storyId: ID!): [StoryMention!]!
    storyLinkClicks(storyId: ID!): [StoryLinkClickStats!]!
    storyLocationClicks(storyId: ID!): [StoryLocationClickStats!]!
    storyPollClicks(storyId: ID!): [StoryPollClickStats!]!
    storyQuestionAnswers(storyId: ID!): [StoryQuestionAnswer!]!

    searchPlaces(q: String!, limit: Int): [PlaceSuggestion!]!

    notificationSettings: NotificationSettings!

    activity(offset: Int, limit: Int): ActivityConnection!

    }

  # ---------- Mutations ----------
  type Mutation {
    leaveGroup(groupId: ID!): Boolean!
    createGroupLink(title: String!, type: GroupLinkType!, visibility: GroupLinkVisibility = PRIVATE): GroupLink!
    updateGroupLink(id: ID!, input: UpdateGroupLinkInput!): GroupLink!
    getSignedGroupLinkImageUpload(groupId: ID!, mime: String!, size: Int!): SignedUpload!
    removeGroupLinkMember(groupId: ID!, profileId: ID!): Boolean!
    joinGroupLink(slug: String!): JoinGroupResult!

    updateOnboarding(input: OnboardingInput!): User!

    changePassword(currentPassword: String!, newPassword: String!): Boolean!

    requestPasswordResetCode(emailOrUsername: String!): Boolean!
    resetPasswordWithCode(emailOrUsername: String!, code: String!, newPassword: String!): Boolean!
    
    setVlogMembers(vlogId: ID!, userIds: [ID!]!): Boolean!
    leaveVlog(vlogId: ID!): Boolean!

    requestEmailVerification: EmailVerificationState!
    verifyEmail(code: String!): Boolean!
    changeAccountEmail(email: String!): EmailVerificationState!
    checkPhoneAvailability(phoneNumber: String!): Boolean!
    requestPhoneLoginCode(phoneNumber: String!): PhoneVerificationState!
    verifyPhoneLoginCode(phoneNumber: String!, code: String!, username: String, name: String): AuthPayload!


    completeOnboarding(input: OnboardingInput!): User!

    # Social
    follow(userId: ID!): Boolean!
    unfollow(userId: ID!): Boolean!

    # Posts/Uploads
    getSignedPostUpload(mime: String!, size: Int!): SignedUpload!
    createPost(input: CreatePostInput!): Post!
    deletePost(id: ID!): Boolean!
    likePost(postId: ID!): Post!
    unlikePost(postId: ID!): Post!
    markPostViewed(postId: ID!): Post!
    markProfileViewed(profileId: ID!): Boolean!
    markProfileViewersSeen: Boolean!

    approvePostTag(postId: ID!, userId: ID!): Boolean!
    rejectPostTag(postId: ID!, userId: ID!): Boolean!

    requestUserTag(postId: ID!, userId: ID!): Boolean!

    # Auth/Profile
    register(email: String!, username: String!, password: String!, name: String): AuthPayload!
    login(emailOrUsername: String!, password: String!): AuthPayload!
    updateMe(input: UpdateMeInput!): User!

    # Person(en) um Freigabe bitten (Beitragsanfrage)
    requestSharePostWithUsers(postId: ID!, userIds: [ID!]!): Boolean!

    # Empfänger entscheidet:
    approveSharedPost(postId: ID!): Boolean!
    rejectSharedPost(postId: ID!): Boolean!
    setSharedPostOnProfile(postId: ID!, show: Boolean!): Boolean!

    # Autor blendet eigenen Post im Raster aus/ein (bleibt in „Vlogs“)
    setPostGridVisibility(postId: ID!, visible: Boolean!): Boolean!
    setPostTagShowOnProfile(postId: ID!, show: Boolean!): Boolean!

    untagSelf(postId: ID!): Boolean!

    # Stories
    getSignedStoryUpload(mime: String!, size: Int!): SignedUpload!
    createStory(input: CreateStoryInput!): Story!
    deleteStory(id: ID!): Boolean!

    # Profile Mgmt
    createProfile(input: CreateProfileInput!): User!
    setPrimaryProfile(profileId: ID!): Boolean!
    switchActiveProfile(profileId: ID!): User!
    linkExistingProfile(input: LinkExistingProfileInput!): Boolean!
    unlinkProfile(profileId: ID!): Boolean!

    # Vlogs
    createVlog(input: CreateVlogInput!): Vlog!
    updateVlog(id: ID!, input: UpdateVlogInput!): Vlog!
    requestJoinVlog(vlogId: ID!): Boolean!
    respondJoinRequest(vlogId: ID!, userId: ID!, accept: Boolean!): Boolean!
    addVlogAdmin(vlogId: ID!, userId: ID!): Boolean!
    removeVlogMember(vlogId: ID!, userId: ID!): Boolean!

    createCarouselPost(input: CreateCarouselPostInput!): Post!
    tagVlogOnPost(postId: ID!, vlogId: ID!): Boolean!
    approvePostForVlog(vlogId: ID!, postId: ID!): Boolean!
    rejectPostForVlog(vlogId: ID!, postId: ID!): Boolean!
    deleteVlog(id: ID!): Boolean!
    updatePost(input: UpdatePostInput!): Post!
    requestVlogTag(postId: ID!, vlogId: ID!): Boolean!

    # Notifications
    markNotificationRead(id: ID!): Boolean!
    # optional: alle
    markAllRead(channel: NotificationChannel!): Boolean!
    markAllNotificationsRead(channel: NotificationChannel): Boolean!

    
    addComment(postId: ID!, content: String!): Comment!
    deleteComment(commentId: ID!): Boolean!
    withdrawVlogPost(vlogId: ID!, postId: ID!): Boolean!

    getSignedAvatarUpload(mime: String!, size: Int!): SignedUpload!
    acceptTerms(version: Int!): User!


    reportContent(input: ReportInput!): Boolean!
    blockUser(userId: ID!): Boolean!
    unblockUser(userId: ID!): Boolean!
    resolveReport(reportId: ID!, action: ResolveAction = NONE, notes: String): Boolean!
    adminUnsuspendUser(userId: ID!): Boolean!

    deleteAccount: Boolean!

    acceptFollowRequest(userId: ID!): Boolean!
    rejectFollowRequest(userId: ID!): Boolean!
    setProfilePrivate(isPrivate: Boolean!): Boolean!


    removeFollower(userId: ID!): Boolean!

    registerPushToken(token: String!): Boolean!

    deleteMessage(messageId: ID!): Boolean!

    markStoryViewed(storyId: ID!): Boolean!
    markStoryMentionClicked(storyId: ID!, username: String!): Boolean!
    markStoryLinkClicked(storyId: ID!, overlayId: String, url: String!): Boolean!
    markStoryLocationClicked(storyId: ID!, overlayId: String, label: String!): Boolean!
    markStoryPollClicked(storyId: ID!, overlayId: String, optionIndex: Int!, optionText: String!): Boolean!
    answerStoryQuestion(storyId: ID!, overlayId: String, prompt: String!, answer: String!): Boolean!

    updateNotificationSettings(input: NotificationSettingsInput!): NotificationSettings!

    markNotificationsRead(ids: [ID!]!): Boolean!
  }












































  # =======================
  # Chat – Types & API
  # =======================

  # WICHTIG: DateTime & User sind bereits definiert – NICHT erneut definieren.

  enum ThreadKind {
    DM
    GROUP
    COMMUNITY
    BROADCAST
    DISABLED
  }

  type Thread {
    id: ID!
    title: String
    imageUrl: String
    kind: ThreadKind!
    members: [User!]!         # nutzt euren bestehenden User-Typ
    lastMessageAt: DateTime
    unreadCount: Int!
    isGroupChat: Boolean!
    viewerIsOwner: Boolean!
    community: GroupLink
  }

  # Medienobjekt NUR für Chat (wegen Kollision mit PostMedia/MediaInput)
  type ChatMedia {
    url: String!
    mime: String!
    key: String
    width: Int
    height: Int
    durationMs: Int
  }

  enum MessageKind { text image video file emoji }

  type Message {
    id: ID!
    clientId: String
    threadId: ID!
    sender: User!              # euer User
    kind: MessageKind!
    text: String
    media: ChatMedia
    createdAt: DateTime!
    editedAt: DateTime

    story: Story
    storyExpired: Boolean!

    likeCount: Int!
    likedByMe: Boolean!
  }

  type MessageEdge {
    node: Message!
    cursor: ID!
  }

  type MessageConnection {
    edges: [MessageEdge!]!
    nextCursor: ID
  }

  # Eigene SignedUpload-Definition für Chat, um Kollision mit eurer SignedUpload zu vermeiden
  type ChatHeaderKV { key: String!, value: String! }
  type ChatSignedUpload {
    putUrl: String!
    url: String!
    headers: [ChatHeaderKV!]!
  }

  type UnreadCount {
    total: Int!
    perThread: [UnreadPerThread!]!
  }
  type UnreadPerThread { threadId: ID!, count: Int! }

  # Eigene MediaInput-Definition für Chat
  input ChatMediaInput {
    key: String!
    mime: String!
    width: Int
    height: Int
    durationMs: Int
  }

  input SendMessageInput {
    threadId: ID!
    clientId: String
    kind: MessageKind!
    text: String
    emoji: String
    media: ChatMediaInput
    storyId: ID
    replyToId: ID
  }

  # --------- Queries (neu) ---------
  extend type Query {
    threads: [Thread!]
    thread(threadId: ID!): Thread
    messages(threadId: ID!, cursor: ID, take: Int = 30): MessageConnection!
    unreadCount: UnreadCount!
  }

  # --------- Mutations (neu) ---------
  extend type Mutation {
    sendMessage(input: SendMessageInput!): Message!
    markThreadRead(threadId: ID!): Boolean!
    signUpload(mime: String!, filename: String): SignedUpload!
    createThread(memberUserIds: [ID!]!, title: String, imageKey: String): Thread!
    updateThreadSettings(threadId: ID!, title: String!, imageKey: String): Thread!
    removeThreadMember(threadId: ID!, userId: ID!): Boolean!
    setCommunityChatKind(groupId: ID!, kind: ThreadKind!): Thread!
    setTyping(threadId: ID!, typing: Boolean!): Boolean!
    toggleMessageLike(messageId: ID!): Message!
  }

  # --------- Subscriptions (neu) ---------
  type Subscription {
    messageAdded(threadId: ID!): Message!
    typing(threadId: ID!, userId: ID!): Boolean!
    unreadUpdated: UnreadCount!
  }

  type PlaceSuggestion {
    id: String!
    title: String!
    subtitle: String
    lat: Float!
    lng: Float!
  }

   enum RequestStatus {
    PENDING
    ACCEPTED
    REJECTED
  }

  type NotificationSettings {
    pushEnabled: Boolean!
    digestEnabled: Boolean!

    follow: Boolean!
    followRequest: Boolean!
    followRequestAccepted: Boolean!

    like: Boolean!
    comment: Boolean!

    storyPosted: Boolean!
    storyMention: Boolean!

    postShareRequest: Boolean!
    postShareApproved: Boolean!
    postShareRejected: Boolean!

    postTagRequest: Boolean!

    vlogTagRequest: Boolean!
    vlogTagApproved: Boolean!
    vlogTagRejected: Boolean!

    vlogNewPost: Boolean!
    vlogDeleted: Boolean!
  }

  input NotificationSettingsInput {
    pushEnabled: Boolean
    digestEnabled: Boolean

    follow: Boolean
    followRequest: Boolean
    followRequestAccepted: Boolean

    like: Boolean
    comment: Boolean

    storyPosted: Boolean
    storyMention: Boolean
    
    postShareRequest: Boolean
    postShareApproved: Boolean
    postShareRejected: Boolean

    postTagRequest: Boolean

    vlogTagRequest: Boolean
    vlogTagApproved: Boolean
    vlogTagRejected: Boolean

    vlogNewPost: Boolean
    vlogDeleted: Boolean
  }

`;
