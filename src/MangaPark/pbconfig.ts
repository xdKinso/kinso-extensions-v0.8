import { ContentRating, type SourceInfo, SourceIntents } from "@paperback/types";

export default {
  name: "MangaPark",
  description: "Extension that pulls content from mangapark.net.",
  version: "0.0.31",
  icon: "icon.png",
  language: "multi",
  contentRating: ContentRating.EVERYONE,
  capabilities: [
    SourceIntents.DISCOVER_SECIONS,
    SourceIntents.MANGA_SEARCH,
    SourceIntents.MANGA_CHAPTERS,
    SourceIntents.SETTINGS_FORM_PROVIDING,
    SourceIntents.CLOUDFLARE_BYPASS_PROVIDING,
  ],
  badges: [],
  developers: [
    {
      name: "Kinso",
      github: "https://github.com/xdKinso",
    }
  ],
} satisfies SourceInfo;
