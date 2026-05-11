import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { ResultsResponse } from "@/types";

interface UseResultsResult {
  data: ResultsResponse | null;
  loading: boolean;
  error: string | null;
}

export function useResults(scanId: string | null): UseResultsResult {
  const [data, setData] = useState<ResultsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!scanId) {
      setData(null);
      return;
    }
    setLoading(true);
    setError(null);
    api
      .getResults(scanId)
      .then(setData)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [scanId]);

  return { data, loading, error };
}
