import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 1000 * 60 * 60, // 1 hour client memory cache
        gcTime: 1000 * 60 * 60 * 24, // 24 hours garbage collection
        refetchOnWindowFocus: false, // Prevent redundant background fetches
        refetchOnReconnect: false,
        retry: 2,
      },
    },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 1000 * 60 * 30,
  });

  return router;
};
