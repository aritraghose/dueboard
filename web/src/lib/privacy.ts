import type { Privacy } from "@dueboard/api/rpc";

// Privacy in words, for every item's card (tasks, habits, …).

export const PRIVACY_LABEL: Record<Privacy, string> = {
  public: "Public",
  connections: "Connections",
  private: "Private",
};

export const PRIVACY_HINT: Record<Privacy, string> = {
  public: "Anyone can see it in your diary.",
  connections: "Your connections can see it in your diary.",
  private: "Only you can see it. Live shows that you did something, not what.",
};
