# Crush Dating App

## Overview

Crush is a modern dating application designed to connect users through a Tinder-style swipe interface, real-time messaging, and compatibility-based matchmaking. It aims to offer a rich, interactive dating experience with features like AI-powered conversation coaching and profile optimization, micro-dates, and a tiered premium subscription model. The project leverages Replit Auth for secure authentication and focuses on a user-friendly interface with robust backend services.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend
- **Framework**: React 18 with TypeScript
- **Routing**: Wouter
- **State Management**: TanStack React Query
- **Styling**: Tailwind CSS with shadcn/ui (New York style)
- **Animations**: Framer Motion for gestures and transitions
- **Build Tool**: Vite with path aliases (`@/`, `@shared/`)
- **UI/UX**: Consistent use of primary blue and accent orange; flame logo; light/dark mode; semantic colors for status; gradients for premium elements.

### Backend
- **Framework**: Express.js with TypeScript
- **API Design**: RESTful API with typed route definitions (shared between client/server)
- **Validation**: Zod schemas with drizzle-zod integration
- **Session Management**: Express-session with PostgreSQL store
- **Authentication**: Replit Auth via OpenID Connect with PostgreSQL-backed sessions.
- **Trial System**: 30-day free trial for premium chat features, managed by `trialEndsAt` timestamp on profiles.
- **Matchmaking**: Multi-dimensional scoring based on various profile attributes (interests, lifestyle, goals, etc.), including zip code proximity.
- **AI Scam Detector**: Real-time analysis of chat messages using OpenAI to detect fraudulent behavior and warn users.
- **AI Integration**: OpenAI (gpt-5-mini) for conversation coaching, profile optimization, scam detection, and AI Dating Advisor (voice + text chat).
- **AI Dating Advisor**: Interactive voice/text chat with an AI for dating ideas, advice, and tips. Supports speech-to-text input and text-to-speech responses via OpenAI audio models. Route: `/ai-advisor`, API: `POST /api/ai-advisor/chat`.
- **Profile Management**: Ability to save profiles for later viewing and hide profiles to remove them from the feed permanently.
- **Video Calling**: WebRTC-based peer-to-peer video calls between matched users (Elite-only). Uses WebSocket signaling server at `/ws` for offer/answer/ICE exchange. Notification WebSocket at `/ws/notifications` for real-time incoming call alerts (token auth via `POST /api/video-call/notify-token`). Call flow: caller sees "ringing" → recipient sees "incoming" with Accept/Decline → "connecting" → "active". Decline propagates via notification WS `decline-call` message (with match membership auth) to caller's signaling WS as `call-declined`. Routes: `/video-call/:id`, APIs: `POST /api/video-call/invite`, `GET /api/video-call/active/:matchId`, `GET /api/video-call/invite-status/:matchId`, `POST /api/video-call/decline`, `POST /api/video-call/cancel`, `POST /api/video-call/token`, `POST /api/video-call/notify-token`.
- **Micro-Dates**: Real-time interactive 5-minute virtual dates with activity catalog and polling for responses.
- **User Blocking**: Bidirectional user blocking with API enforcement.
- **App Lock**: Optional password protection for the app with server-side enforcement and recovery.

### Data Storage
- **Database**: PostgreSQL with Drizzle ORM.
- **Schema**: Defined in `shared/schema.ts`, including tables for users, profiles, swipes, matches, messages, sessions, and micro-dates.

### Key Design Patterns
- **Shared Types**: Centralized schema and route definitions for client-server consistency.
- **Monorepo Structure**: `client/`, `server/`, and `shared/` directories.

## External Dependencies

### Database
- PostgreSQL (via `DATABASE_URL`)
- Drizzle ORM / drizzle-kit

### Authentication
- Replit Auth (OpenID Connect)

### Object Storage
- Replit Object Storage (for profile photos, voice notes, voice intros, intro videos, verification photos)

### Third-Party Services
- **Dicebear API**: Fallback avatar generation.
- **Google Fonts**: DM Sans, Outfit.
- **PayPal**: Subscriptions API for tiered subscription management (Basic $4.99, Pro $9.99, Elite $19.99). Plans are auto-seeded on server start. Webhook events (`BILLING.SUBSCRIPTION.*`) at `/api/paypal/webhook` keep premium state in sync. Set `PAYPAL_WEBHOOK_ID` to enforce signature verification (required in production).
- **OpenAI**: For AI Conversation Coach and AI Profile Optimizer.