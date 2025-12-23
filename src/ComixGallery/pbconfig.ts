import { ContentRating, SourceIntents, type ExtensionInfo } from "@paperback/types";

export default {
  name: "ComixGallery",
  description: "Extension that pulls content from Comix.to",
  version: "0.0.10",
  icon: "icon.png",
  language: "en",
  contentRating: ContentRating.EVERYONE,
  capabilities:
    SourceIntents.SETTINGS_FORM_PROVIDING |
    SourceIntents.DISCOVER_SECIONS_PROVIDING |
    SourceIntents.SEARCH_RESULTS_PROVIDING |
    SourceIntents.CHAPTER_PROVIDING,
  badges: [],
  developers: [
    {
      name: "Kinso",
      github: "https://github.com/Kinso",
    },
  ],
} satisfies ExtensionInfo;
