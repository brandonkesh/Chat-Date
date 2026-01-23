## Packages
framer-motion | Essential for swipe animations and page transitions
date-fns | For formatting dates and trial countdowns

## Notes
Tailwind Config - extend fontFamily:
fontFamily: {
  display: ["var(--font-display)"],
  body: ["var(--font-body)"],
}

API Integration:
- Auth is handled via Replit Auth (/api/login)
- 402 Payment Required status on message send indicates trial expiry
- Profile photos use Dicebear API as fallback
