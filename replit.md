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
- **AI Integration**: OpenAI (gpt-5-mini) for conversation coaching and profile optimization.
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
- **Stripe**: Via Replit Connector (`stripe-replit-sync`) for tiered subscription management (Basic, Pro, Elite), checkout, and customer portal.
- **OpenAI**: For AI Conversation Coach and AI Profile Optimizer.