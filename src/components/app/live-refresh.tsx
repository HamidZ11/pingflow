"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

// Keeps Attention current without a reload: when a request for this business
// arrives or is resolved (here, in another tab, or on another device), the
// server-rendered screens refresh. Realtime applies the same row level
// security as everything else, so only this business's changes arrive.
export function LiveRefresh({ businessId }: { businessId: string }) {
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let channel: ReturnType<typeof supabase.channel> | undefined;
    let cancelled = false;

    // Join as the signed-in owner, not anonymously: the session is read from
    // cookies first, so the channel is authorised by row level security.
    void supabase.realtime.setAuth().then(() => {
      if (cancelled) return;
      channel = supabase
        .channel(`attention:${businessId}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "pending_actions",
            filter: `business_id=eq.${businessId}`,
          },
          () => {
            // Several rows can change in one transaction: refresh once.
            clearTimeout(timer);
            timer = setTimeout(() => router.refresh(), 150);
          },
        )
        .subscribe();
    });

    return () => {
      cancelled = true;
      clearTimeout(timer);
      if (channel) void supabase.removeChannel(channel);
    };
  }, [businessId, router]);

  return null;
}
