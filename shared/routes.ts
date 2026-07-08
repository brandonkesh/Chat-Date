import { z } from 'zod';
import { insertProfileSchema, insertMessageSchema, profiles, matches, messages, insertSwipeSchema, insertFeedbackSchema, updateFeedbackStatusSchema, feedback } from './schema';

export const errorSchemas = {
  validation: z.object({
    message: z.string(),
    field: z.string().optional(),
  }),
  notFound: z.object({
    message: z.string(),
  }),
  unauthorized: z.object({
    message: z.string(),
  }),
  paymentRequired: z.object({
    message: z.string(),
    trialEndsAt: z.string().optional(),
  }),
};

export const api = {
  profiles: {
    me: {
      get: {
        method: 'GET' as const,
        path: '/api/profiles/me',
        responses: {
          200: z.custom<typeof profiles.$inferSelect>(),
          404: errorSchemas.notFound,
        },
      },
      update: {
        method: 'PUT' as const,
        path: '/api/profiles/me',
        input: insertProfileSchema,
        responses: {
          200: z.custom<typeof profiles.$inferSelect>(),
          400: errorSchemas.validation,
        },
      },
    },
    list: {
      method: 'GET' as const,
      path: '/api/profiles',
      responses: {
        200: z.array(z.custom<typeof profiles.$inferSelect>()),
      },
    },
    get: {
      method: 'GET' as const,
      path: '/api/profiles/:id',
      responses: {
        200: z.custom<typeof profiles.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
    recommended: {
      method: 'GET' as const,
      path: '/api/profiles/recommended',
      responses: {
        200: z.array(z.custom<typeof profiles.$inferSelect>()),
      },
    },
    crushPicks: {
      method: 'GET' as const,
      path: '/api/profiles/crush-picks',
      responses: {
        200: z.array(z.custom<typeof profiles.$inferSelect>()),
      },
    },
  },
  swipes: {
    create: {
      method: 'POST' as const,
      path: '/api/swipes',
      input: insertSwipeSchema.pick({ swipedId: true, liked: true }),
      responses: {
        201: z.object({ match: z.boolean(), matchId: z.number().optional() }),
        400: errorSchemas.validation,
      },
    },
    likesReceived: {
      method: 'GET' as const,
      path: '/api/swipes/likes-received',
      responses: {
        200: z.array(z.custom<typeof profiles.$inferSelect>()),
      },
    },
  },
  matches: {
    list: {
      method: 'GET' as const,
      path: '/api/matches',
      responses: {
        200: z.array(z.object({
          match: z.custom<typeof matches.$inferSelect>(),
          partnerProfile: z.custom<typeof profiles.$inferSelect>(),
          lastMessageAt: z.string().nullable().optional(),
        })),
      },
    },
    get: {
      method: 'GET' as const,
      path: '/api/matches/:id',
      responses: {
        200: z.object({
          match: z.custom<typeof matches.$inferSelect>(),
          partnerProfile: z.custom<typeof profiles.$inferSelect>(),
        }),
        404: errorSchemas.notFound,
      },
    },
  },
  messages: {
    list: {
      method: 'GET' as const,
      path: '/api/matches/:id/messages',
      responses: {
        200: z.array(z.custom<typeof messages.$inferSelect>()),
        404: errorSchemas.notFound,
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/matches/:id/messages',
      input: z.object({ 
        content: z.string().min(1).max(2000),
        voiceNoteUrl: z.string().optional(),
        voiceNoteDuration: z.number().optional(),
      }),
      responses: {
        201: z.custom<typeof messages.$inferSelect>(),
        400: errorSchemas.validation,
        402: errorSchemas.paymentRequired, // For expired trial
        404: errorSchemas.notFound,
      },
    },
  },
  feedback: {
    create: {
      method: 'POST' as const,
      path: '/api/feedback',
      input: insertFeedbackSchema,
      responses: {
        201: z.object({ success: z.boolean() }),
        400: errorSchemas.validation,
      },
    },
    list: {
      method: 'GET' as const,
      path: '/api/feedback',
      responses: {
        200: z.array(z.custom<typeof feedback.$inferSelect & { submitterEmail: string | null; submitterName: string | null }>()),
        403: errorSchemas.unauthorized,
      },
    },
    updateStatus: {
      method: 'PATCH' as const,
      path: '/api/feedback/:id/status',
      input: updateFeedbackStatusSchema,
      responses: {
        200: z.custom<typeof feedback.$inferSelect>(),
        400: errorSchemas.validation,
        403: errorSchemas.unauthorized,
      },
    },
  },
};

export function buildUrl(path: string, params?: Record<string, string | number>): string {
  let url = path;
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (url.includes(`:${key}`)) {
        url = url.replace(`:${key}`, String(value));
      }
    });
  }
  return url;
}
