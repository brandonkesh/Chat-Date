# Crush Dating App

## Overview

Crush is a modern dating application built with a React frontend and Express backend. It features a Tinder-style swipe interface for discovering potential matches, real-time messaging between matched users, and a 30-day free trial system for premium chat features. The app uses Replit Auth for authentication and PostgreSQL for data persistence.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Routing**: Wouter for lightweight client-side routing
- **State Management**: TanStack React Query for server state management and caching
- **Styling**: Tailwind CSS with shadcn/ui component library (New York style variant)
- **Animations**: Framer Motion for swipe gestures and page transitions
- **Build Tool**: Vite with path aliases (`@/` for client src, `@shared/` for shared code)

### Backend Architecture
- **Framework**: Express.js with TypeScript
- **API Design**: RESTful API with typed route definitions in `shared/routes.ts`
- **Validation**: Zod schemas for request/response validation with drizzle-zod integration
- **Session Management**: Express-session with PostgreSQL session store (connect-pg-simple)

### Data Storage
- **Database**: PostgreSQL with Drizzle ORM
- **Schema Location**: `shared/schema.ts` contains all table definitions
- **Key Tables**:
  - `users` - Core user accounts (managed by Replit Auth)
  - `sessions` - Session storage for authentication
  - `profiles` - Dating profile information with trial expiry tracking
  - `swipes` - User swipe actions (like/pass)
  - `matches` - Mutual likes between users
  - `messages` - Chat messages between matched users

### Authentication
- **Provider**: Replit Auth via OpenID Connect
- **Implementation**: Located in `server/replit_integrations/auth/`
- **Session Storage**: PostgreSQL-backed sessions with 7-day TTL
- **Protected Routes**: `isAuthenticated` middleware guards API endpoints

### Key Design Patterns
- **Shared Types**: Schema types and route definitions shared between client/server via `@shared/` alias
- **Monorepo Structure**: Client code in `client/`, server code in `server/`, shared types in `shared/`
- **Trial System**: Profiles include `trialEndsAt` timestamp; 402 status indicates trial expiry on message send

## External Dependencies

### Database
- PostgreSQL database via `DATABASE_URL` environment variable
- Drizzle ORM for database operations with drizzle-kit for migrations

### Authentication
- Replit Auth (OpenID Connect) requiring `ISSUER_URL`, `REPL_ID`, and `SESSION_SECRET` environment variables

### Object Storage
- **Provider**: Replit Object Storage (Google Cloud Storage backed)
- **Implementation**: Located in `server/replit_integrations/object_storage/`
- **Photo Uploads**: Users can upload profile photos via presigned URLs
- **Routes**: `/api/uploads/request-url` (authenticated) and `/objects/uploads/:id` (serving)
- **Limits**: 5MB max file size, image types only (JPEG, PNG, GIF, WebP)

### Third-Party Services
- **Dicebear API**: Fallback avatar generation for users without profile photos
- **Google Fonts**: DM Sans (body) and Outfit (display) font families

### Stripe Payment Integration
- **Provider**: Stripe via Replit Connector (`stripe-replit-sync`)
- **Implementation**: Located in `server/stripeClient.ts`, `server/stripeService.ts`, `server/stripeStorage.ts`
- **Webhook Handling**: `server/webhookHandlers.ts` processes subscription events
- **Database Schema**: Stripe data synced to `stripe.*` schema (products, prices, subscriptions, customers)
- **Membership Tiers**: Three paid tiers with different feature sets:
  - **Basic** ($4.99/month): 10 daily super likes, see who viewed you, basic filters, ad-free
  - **Pro** ($9.99/month): Unlimited super likes, see who likes you, priority matching, advanced filters, read receipts
  - **Elite** ($19.99/month): All Pro features + profile boost, incognito mode, VIP badge, priority support, exclusive events
- **Profile Fields**: `stripeCustomerId`, `stripeSubscriptionId`, `stripePriceId`, `isPremium`, `membershipTier` track subscription status
- **Checkout Flow**: `/api/checkout` creates Stripe Checkout session, `/api/customer-portal` for subscription management
- **Tier Detection**: Webhook handler determines tier from product metadata or name matching

### Key NPM Packages
- `@tanstack/react-query` - Server state management
- `framer-motion` - Swipe animations and transitions
- `date-fns` - Date formatting and trial countdown calculations
- `drizzle-orm` / `drizzle-zod` - Database ORM and schema validation
- `openid-client` / `passport` - Authentication flow
- `shadcn/ui` components via Radix UI primitives
- `stripe` / `stripe-replit-sync` - Payment processing and data sync

## Recent Changes

### February 6, 2026
- **Background & Identity Feature**: Added comprehensive identity fields to user profiles
  - New schema fields: `languages` (array), `orientation`, `ethnicity`, `politicalViews`, `astrologicalSign`
  - Edit Profile: "Background & Identity" section with language tags, orientation, ethnicity, politics, and zodiac sign selectors
  - Preferences: Expanded "Background & Identity" card showing all identity fields (languages, orientation, ethnicity, religion, politics, education, employment, zodiac sign) with summary view
  - Verification status integrated into the same card
- **Video Chat Icon**: Added video chat quick action button to Feed/Home page top-right corner
- **Lifestyle Preferences**: Added Lifestyle card to Preferences page
  - New `marijuana` schema field added to profiles
  - Preferences: "Lifestyle" card showing alcohol, smoking, marijuana, and diet with icons and "Edit Lifestyle" link
  - EditProfile: Marijuana dropdown added to Lifestyle section
- **About Us & FAQ**: Added informational content
  - New About Us page (`/about`) with mission, how it works, and values sections
  - About Us and FAQ quick-link cards added to Help & Support page
- **Family Preferences**: Added Family card to Preferences page
  - Displays pets, has kids, and wants kids fields with icons
  - "Edit Family" button links to Edit Profile
- **Voice Intro**: Users can record a short voice introduction (up to 30 seconds)
  - New `voiceIntroUrl` field in profiles schema
  - VoiceIntro component with record/play/save/delete functionality
  - Uses MediaRecorder API and Replit Object Storage for audio files
  - Available on Edit Profile and Preferences pages
  - VoiceIntroPlayer shows inline on profile cards in Feed for playback
  - API endpoints: POST `/api/uploads/voice-intro`, PUT `/api/profiles/voice-intro`

### January 29, 2026
- **Recommendations & Crush Picks**: Added personalized profile discovery features
  - "For You" tab in navigation with Sparkles icon
  - **Crush Picks**: Featured profiles prioritizing verified and premium users
  - **Recommended for You**: Profiles with shared interests based on user's profile
  - Profile cards with like/pass actions, badges for verified/premium status
  - API endpoints: `/api/profiles/recommended`, `/api/profiles/crush-picks`
- **Profile Verification**: Added photo verification system for profile authenticity
  - Users take a selfie matching a random pose to verify their identity
  - Verification page with camera capture and pose guidance
  - Auto-approval system with polling for status updates
  - Verified badge displayed on profile cards and profile pages
  - Verification prompts on Feed and Edit Profile pages for unverified users
  - Profile fields: `isVerified`, `verificationPhotoUrl`, `verificationStatus`

### February 11, 2026
- **Matchmaking Feature**: Comprehensive compatibility-based matchmaking system
  - Multi-dimensional scoring: interests (25pts), lifestyle (20pts), relationship goals (15pts), religion (10pts), family plans (10pts), education (5pts), pets (5pts), languages (5pts), profile quality (5pts)
  - Only scores categories where both users have data (avoids penalizing incomplete profiles)
  - "Best Matches" section on For You page with compatibility percentage and match reasons
  - Each match card shows colored compatibility badge (green 80%+, blue 60%+, amber 40%+)
  - Match reason badges explain why each profile was recommended
  - Like/pass actions directly on matchmaking cards
  - API endpoint: GET `/api/profiles/matchmaking`
- **User Blocking**: Block/unblock users with bidirectional filtering
  - Blocked Users card on Preferences page with unblock functionality
  - Block & Report combined option in ReportDialog
  - Block check on message sending (403 if blocked)
  - API endpoints: POST/DELETE/GET `/api/blocks`, GET `/api/blocks/check/:userId`

### January 28, 2026
- **Multiple Membership Tiers**: Expanded from single premium to three-tier subscription system
  - Basic ($4.99), Pro ($9.99), Elite ($19.99) monthly plans
  - Each tier has unique features and benefits
  - Premium page displays all tiers with feature comparisons
  - Webhook handler determines tier from Stripe product metadata
- **Profile Schema Updates**: Added `membershipTier`, `stripePriceId` fields for tier tracking
- **Hobbies & Interests**: Users can add personal interests to their profiles
  - Tag-style input on onboarding and edit profile pages
  - Interests displayed as badges on profile cards
- **Stripe Premium Subscription**: Added full Stripe payment integration
  - Checkout flow redirects to Stripe-hosted payment page
  - Webhook handlers update user premium status and tier on subscription events
  - Premium users bypass free trial restrictions for messaging
  - Customer portal for subscription management

### January 27, 2026
- **Photo Upload**: Added profile photo upload with Replit Object Storage
- **Inbox Tab**: Added conversation list showing matches with messages
- **Premium Tab**: Added subscription page with feature list and pricing
- **Bottom Navigation**: 5 tabs - Discover, Matches, Inbox, Premium, Profile
- **Edit Profile Fix**: Split into parent/child components for proper form pre-filling