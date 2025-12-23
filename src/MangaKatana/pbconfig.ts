import { ContentRating, SourceIntents, type SourceInfo } from "@paperback/types";

export default {
  name: "MangaKatana",
  description: "Extension that pulls content from mangakatana.com.",
  version: "0.0.20",
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
    },
  ],
} satisfies SourceInfo;
