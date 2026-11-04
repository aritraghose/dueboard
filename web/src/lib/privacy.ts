import type { Privacy } from "@dueboard/api/rpc";

export const PRIVACY_LABEL: Record<Privacy, string> = {
  public: "Public",
  connections: "Connections",
  private: "Private",
};

export const PRIVACY_HINT: Record<Privacy, string> = {
  public: "Anyone can see it.",
  connections: "Your connections can see it.",
  private: "Only you see the details.",
};
