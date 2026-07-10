import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import type { InsertProfile, InsertSwipe, InsertMessage } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";

// ============================================
// PROFILE HOOKS
// ============================================

export function useMyProfile() {
  return useQuery({
    queryKey: [api.profiles.me.get.path],
    queryFn: async () => {
      const res = await fetch(api.profiles.me.get.path, { credentials: "include" });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error("Failed to fetch profile");
      return api.profiles.me.get.responses[200].parse(await res.json());
    },
    retry: false,
  });
}

export function useUpdateProfile() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: InsertProfile) => {
      const res = await fetch(api.profiles.me.update.path, {
        method: api.profiles.me.update.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      
      if (!res.ok) {
        if (res.status === 400) {
          const error = api.profiles.me.update.responses[400].parse(await res.json());
          throw new Error(error.message);
        }
        throw new Error("Failed to update profile");
      }
      return api.profiles.me.update.responses[200].parse(await res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.profiles.me.get.path] });
      toast({ title: "Profile updated", description: "You look great!" });
    },
    onError: (err) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });
}

export function useFeed() {
  return useQuery({
    queryKey: [api.profiles.list.path],
    queryFn: async () => {
      const res = await fetch(api.profiles.list.path, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch feed");
      return api.profiles.list.responses[200].parse(await res.json());
    },
  });
}

export function useRecommendedProfiles() {
  return useQuery({
    queryKey: [api.profiles.recommended.path],
    queryFn: async () => {
      const res = await fetch(api.profiles.recommended.path, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch recommended profiles");
      return api.profiles.recommended.responses[200].parse(await res.json());
    },
  });
}

export function useCrushPicks() {
  return useQuery({
    queryKey: [api.profiles.crushPicks.path],
    queryFn: async () => {
      const res = await fetch(api.profiles.crushPicks.path, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch crush picks");
      return api.profiles.crushPicks.responses[200].parse(await res.json());
    },
  });
}

// ============================================
// SAVED & HIDDEN PROFILES HOOKS
// ============================================

export function useSavedProfiles() {
  return useQuery({
    queryKey: ["/api/profiles/saved"],
    queryFn: async () => {
      const res = await fetch("/api/profiles/saved", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch saved profiles");
      return await res.json();
    },
  });
}

export function useSaveProfile() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ userId, save }: { userId: string; save: boolean }) => {
      const res = await fetch(`/api/profiles/save/${userId}`, {
        method: save ? "POST" : "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to update saved status");
      return await res.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/profiles/saved"] });
      toast({ 
        title: variables.save ? "Profile saved" : "Profile removed from saved",
        description: variables.save ? "You can find them in your saved list." : ""
      });
    },
  });
}

export function useHideProfile() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (userId: string) => {
      const res = await fetch(`/api/profiles/hide/${userId}`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to hide profile");
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.profiles.list.path] });
      toast({ title: "Profile hidden", description: "You won't see them again." });
    },
  });
}

// ============================================
// SWIPE HOOKS
// ============================================

export function useSwipe() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (data: Pick<InsertSwipe, "swipedId" | "liked">) => {
      const res = await fetch(api.swipes.create.path, {
        method: api.swipes.create.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        if (res.status === 429 && body?.slowModeLimit) {
          throw new Error("SLOW_MODE_LIMIT");
        }
        throw new Error("Swipe failed");
      }
      return api.swipes.create.responses[201].parse(await res.json());
    },
    onSuccess: (data) => {
      // Invalidate feed to remove swiped person if needed, or just filter client side
      queryClient.invalidateQueries({ queryKey: [api.profiles.list.path] });
      if (data.match) {
        queryClient.invalidateQueries({ queryKey: [api.matches.list.path] });
      }
    },
  });
}

// ============================================
// MATCH & MESSAGE HOOKS
// ============================================

export function useMatches() {
  return useQuery({
    queryKey: [api.matches.list.path],
    queryFn: async () => {
      const res = await fetch(api.matches.list.path, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch matches");
      return api.matches.list.responses[200].parse(await res.json());
    },
  });
}

export function useMatch(id: number) {
  return useQuery({
    queryKey: [api.matches.get.path, id],
    queryFn: async () => {
      const url = buildUrl(api.matches.get.path, { id });
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch match");
      return api.matches.get.responses[200].parse(await res.json());
    },
    enabled: !!id,
  });
}

export function useMessages(matchId: number) {
  return useQuery({
    queryKey: [api.messages.list.path, matchId],
    queryFn: async () => {
      const url = buildUrl(api.messages.list.path, { id: matchId });
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch messages");
      return api.messages.list.responses[200].parse(await res.json());
    },
    enabled: !!matchId,
    refetchInterval: 3000, // Simple polling for chat
  });
}

export function useSendMessage(matchId: number) {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (data: string | { content: string; voiceNoteUrl?: string; voiceNoteDuration?: number }) => {
      const body = typeof data === "string" ? { content: data } : data;
      const url = buildUrl(api.messages.create.path, { id: matchId });
      const res = await fetch(url, {
        method: api.messages.create.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        credentials: "include",
      });

      if (!res.ok) {
        if (res.status === 402) {
          const error = api.messages.create.responses[402].parse(await res.json());
          throw new Error(`TRIAL_EXPIRED:${error.message}`);
        }
        throw new Error("Failed to send message");
      }
      return api.messages.create.responses[201].parse(await res.json());
    },
    onSuccess: () => {
      const url = buildUrl(api.messages.list.path, { id: matchId });
      queryClient.invalidateQueries({ queryKey: [url] });
    },
  });
}
