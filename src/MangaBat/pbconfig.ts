import { ContentRating, type SourceInfo, SourceIntents } from '@paperback/types';

export default {
    version: '0.0.6',
    name: 'MangaBat',
    icon: 'icon.png',
    description: 'Extension for MangaBat (mangabats.com)',
    language: 'multi',
    contentRating: ContentRating.EVERYONE,
    capabilities: [
        SourceIntents.MANGA_CHAPTERS,
        SourceIntents.SEARCH_RESULTS_PROVIDING,
        SourceIntents.DISCOVER_SECIONS_PROVIDING,
    ],
    badges: [],
    developers: [
        {
            name: 'Kinso',
            github: 'https://github.com/xdKinso',
        }
    ],
} satisfies SourceInfo;
