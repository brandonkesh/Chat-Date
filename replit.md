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

### Key NPM Packages
- `@tanstack/react-query` - Server state management
- `framer-motion` - Swipe animations and transitions
- `date-fns` - Date formatting and trial countdown calculations
- `drizzle-orm` / `drizzle-zod` - Database ORM and schema validation
- `openid-client` / `passport` - Authentication flow
- `shadcn/ui` components via Radix UI primitives