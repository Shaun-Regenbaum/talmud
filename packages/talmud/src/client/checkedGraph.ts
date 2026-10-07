import type { CheckedGraph } from '../lib/sage-graph/types';

export type GraphQuery = { person: string } | { tractate: string; page: string };
const requests = new Map<string, Promise<CheckedGraph>>();
export function fetchCheckedGraph(query: GraphQuery, after = '', revision = '', retry = false) {
  const params = new URLSearchParams({ ...query });
  if (after) params.set('after', after);
  if (revision) params.set('revision', revision);
  const url = `/api/sage-graph/checked?${params}`;
  if (retry) requests.delete(url);
  let request = requests.get(url);
  if (!request) {
    request = fetch(url).then(async (response) => {
      if (!response.ok) throw new Error('Checked connections unavailable');
      const result = (await response.json()) as CheckedGraph;
      if (
        !Array.isArray(result.connections) ||
        !Array.isArray(result.nodes) ||
        !Array.isArray(result.occurrences) ||
        !result.revision
      )
        throw new Error('Invalid checked connections');
      return result;
    });
    requests.set(url, request);
    request.catch(() => requests.delete(url));
    if (requests.size > 100) requests.delete(requests.keys().next().value!);
  }
  return request;
}
