import {
    ContentRating,
    SourceIntents,
    type SourceInfo,
} from "@paperback/types";

export default {
    name: "Bato.To",
    description: "Extension that pulls content from bato.to.",
    version: "0.0.19",
    icon: "icon.png",
    author: "Kinso",
    authorWebsite: "https://kinso.github.io",
    language: "en",
    contentRating: ContentRating.EVERYONE,
    capabilities: [
        SourceIntents.SETTINGS_UI,
        SourceIntents.DISCOVER_SECIONS,
        SourceIntents.MANGA_SEARCH,
        SourceIntents.MANGA_CHAPTERS,
    ],
    badges: [],
    developers: [
        {
            name: "Kinso",
            website: "https://kinso.github.io",
            github: "https://github.com/kinso",
        },
    ],
} satisfies SourceInfo;
