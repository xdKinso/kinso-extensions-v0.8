import { ContentRating, SourceIntents, type SourceInfo } from "@paperback/types";

export default {
  name: "ThunderScans",
  description: "Extension that pulls content from en-thunderscans.com.",
  version: "0.0.08",
  icon: "icon.png",
  author: "Kinso",
  authorWebsite: "https://github.com/xdKinso",
  language: "en",
  contentRating: ContentRating.EVERYONE,
  capabilities: [
    SourceIntents.DISCOVER_SECIONS,
    SourceIntents.MANGA_SEARCH,
    SourceIntents.MANGA_CHAPTERS,
  ],
  badges: [],
  developers: [
    {
      name: "Kinso",
      github: "https://github.com/xdKinso",
    },
  ],
} satisfies SourceInfo;
