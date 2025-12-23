import { ContentRating, type SourceInfo, SourceIntents } from '@paperback/types';

export default {
    version: '0.0.10',
    name: 'MangaDemon',
    icon: 'icon.png',
    author: 'Kinso',
    authorWebsite: 'https://github.com/xdKinso',
    description: 'Extension for MangaDemon (demonicscans.org)',
    language: 'multi',
    contentRating: ContentRating.MATURE,
    capabilities: [
        SourceIntents.MANGA_CHAPTERS,
        SourceIntents.SEARCH_RESULTS_PROVIDING,
        SourceIntents.DISCOVER_SECIONS,
    ],
    badges: [],
    developers: [
        {
            name: 'Kinso',
            github: 'https://github.com/xdKinso',
        }
    ],
} satisfies SourceInfo;
