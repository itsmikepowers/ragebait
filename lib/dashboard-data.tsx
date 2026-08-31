"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";

export type MediaRef = {
  path: string;
  width: number;
  height: number;
};

export type Account = {
  id: string;
  name: string;
  username: string;
  logo: MediaRef | null;
};

export type ScheduledItem = {
  id: string;
  accountId: string;
  video: MediaRef;
  thumbnail: MediaRef | null;
  scheduledDate: string;
  caption: string;
  firstComment: string;
  instagramPostUrl: string;
  posted: boolean;
};

type Resource<T> = {
  data: T;
  loading: boolean;
  error: string;
  /** Fetches once and caches; pass force=true to bypass the cache. */
  load: (force?: boolean) => Promise<void>;
  set: React.Dispatch<React.SetStateAction<T>>;
};

type DashboardDataContextValue = {
  accounts: Resource<Account[]>;
  schedule: Resource<ScheduledItem[]>;
  home: Resource<{ accounts: number | null }>;
};

const DashboardDataContext = createContext<DashboardDataContextValue | null>(
  null,
);

/** Generic "fetch once, cache in state, re-fetch only on force" resource. */
function useResource<T>(
  initial: T,
  fetcher: () => Promise<T>,
): Resource<T> {
  const [data, setData] = useState<T>(initial);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const fetchedRef = useRef(false);
  const inFlightRef = useRef<Promise<void> | null>(null);

  const load = useCallback(
    (force = false) => {
      if (fetchedRef.current && !force) {
        return Promise.resolve();
      }
      if (inFlightRef.current) {
        return inFlightRef.current;
      }
      setLoading(true);
      setError("");
      const promise = fetcher()
        .then((result) => {
          fetchedRef.current = true;
          setData(result);
        })
        .catch((err: unknown) => {
          fetchedRef.current = false;
          setError(
            err instanceof Error ? err.message : "Could not load that.",
          );
        })
        .finally(() => {
          setLoading(false);
          inFlightRef.current = null;
        });
      inFlightRef.current = promise;
      return promise;
    },
    [fetcher],
  );

  return { data, loading, error, load, set: setData };
}

export function DashboardDataProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const fetchAccounts = useCallback(async () => {
    const response = await fetch("/api/accounts");
    const data = (await response.json()) as {
      accounts?: Account[];
      error?: string;
    };
    if (!response.ok) {
      throw new Error(data.error || "Could not load accounts.");
    }
    return data.accounts ?? [];
  }, []);

  const fetchSchedule = useCallback(async () => {
    const response = await fetch("/api/schedule");
    const data = (await response.json()) as {
      items?: ScheduledItem[];
      error?: string;
    };
    if (!response.ok) {
      throw new Error(data.error || "Could not load schedule.");
    }
    return data.items ?? [];
  }, []);

  const fetchHome = useCallback(async () => {
    const response = await fetch("/api/home");
    const data = (await response.json()) as {
      accounts?: number;
      error?: string;
    };
    if (!response.ok) {
      throw new Error(data.error || "Could not load home.");
    }
    return { accounts: data.accounts ?? 0 };
  }, []);

  const accounts = useResource<Account[]>([], fetchAccounts);
  const schedule = useResource<ScheduledItem[]>([], fetchSchedule);
  const home = useResource<{ accounts: number | null }>(
    { accounts: null },
    fetchHome,
  );

  const value = useMemo<DashboardDataContextValue>(
    () => ({ accounts, schedule, home }),
    [accounts, schedule, home],
  );

  return (
    <DashboardDataContext.Provider value={value}>
      {children}
    </DashboardDataContext.Provider>
  );
}

export function useDashboardData(): DashboardDataContextValue {
  const ctx = useContext(DashboardDataContext);
  if (!ctx) {
    throw new Error(
      "useDashboardData must be used within a DashboardDataProvider.",
    );
  }
  return ctx;
}
