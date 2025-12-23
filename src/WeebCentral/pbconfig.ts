import {
    ContentRating,
    SourceIntents,
    type SourceInfo,
} from "@paperback/types";

export default {
    name: "Weeb Central",
    description: "Extension that pulls content from weebcentral.com.",
    version: "0.0.02",
    icon: "icon.png",
    author: "xdKinso",
    authorWebsite: "https://github.com/xdKinso",
    language: "en",
    contentRating: ContentRating.EVERYONE,
    capabilities: [
        SourceIntents.MANGA_CHAPTERS,
        SourceIntents.DISCOVER_SECIONS,
        SourceIntents.MANGA_SEARCH,
        SourceIntents.SETTINGS_UI,
    ],
    badges: [],
    developers: [
        {
            name: "xdKinso",
            github: "https://github.com/xdKinso",
        },
    ],
} satisfies SourceInfo;
