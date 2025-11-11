import { useState, useEffect, useMemo } from "react";
import { axios } from "@/services/axios";
import { clientConfig } from "@/services/auth";

export default function useGitHubLink(queryId) {
  const [githubUrl, setGithubUrl] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    // Don't check if GitHub is not configured or queryId is not valid
    if (!clientConfig.githubApiToken || !queryId) {
      setLoading(false);
      return;
    }

    // Check cache first
    const cacheKey = `github_file_${queryId}`;
    const cached = sessionStorage.getItem(cacheKey);
    if (cached) {
      try {
        const { url, timestamp } = JSON.parse(cached);
        // Cache valid for 5 minutes
        if (Date.now() - timestamp < 5 * 60 * 1000) {
          setGithubUrl(url);
          setLoading(false);
          return;
        }
      } catch (e) {
        // Invalid cache, continue to fetch
        sessionStorage.removeItem(cacheKey);
      }
    }

    let cancelRequest = false;

    // Check if file exists
    axios
      .get(`api/queries/${queryId}/github_file_exists`)
      .then(response => {
        if (!cancelRequest) {
          if (response.exists && response.url) {
            setGithubUrl(response.url);
            // Cache the result
            sessionStorage.setItem(
              cacheKey,
              JSON.stringify({ url: response.url, timestamp: Date.now() })
            );
          }
          setLoading(false);
        }
      })
      .catch(err => {
        if (!cancelRequest) {
          setError(err);
          setLoading(false);
        }
      });

    return () => {
      cancelRequest = true;
    };
  }, [queryId]);

  return useMemo(
    () => ({
      githubUrl,
      isLoading: loading,
      isAvailable: !loading && !error && !!githubUrl,
    }),
    [githubUrl, loading, error]
  );
}
