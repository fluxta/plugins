/** `fetch` as YouTube's clients use it, so tests can hand them a fake one. */
export type Fetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;
