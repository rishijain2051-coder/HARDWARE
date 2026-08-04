import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["192.168.1.16", "192.168.1.2"],

  experimental: {
    /**
     * Client-side router cache lifetimes.
     *
     * Every screen here is dynamic (they all read the session), so `dynamic`
     * governs, and its default of 0 means Next re-requests the RSC payload for a
     * page on *every* visit — walking सामान आया → create → back re-rendered the
     * list from scratch each time. 30 seconds covers the back-and-forth of data
     * entry without letting anything go visibly stale, and mutations still call
     * `router.refresh()`, which invalidates this cache regardless of the window.
     *
     * The counterpart for reference data is the localStorage cache in
     * components/lookup-cache.tsx, which survives reloads; this one only lives
     * as long as the tab.
     */
    staleTimes: {
      dynamic: 30,
      static: 180,
    },
  },
};

export default nextConfig;
