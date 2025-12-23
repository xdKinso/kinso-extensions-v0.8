import {
    ContentRating,
    type Chapter,
    type SearchResultItem,
    type SourceManga,
    type DiscoverSectionItem,
} from '@paperback/types';
import type { CheerioAPI } from 'cheerio';

export function parseSearchResults($: CheerioAPI, baseUrl: string, searchTerm: string = ''): SearchResultItem[] {
    const results: SearchResultItem[] = [];
    const seen = new Set<string>();
    
    // MangaDemon uses JavaScript autocomplete dropdown with links like:
    // <a href="/manga/Title-Name"></a> with <img src="...">
    const searchTermLower = searchTerm.toLowerCase();
    
    // Parse all manga links in the page
    $('a[href^="/manga/"]').each((_, element) => {
        const $elem = $(element);
        const href = $elem.attr('href') || '';
        const text = $elem.text().trim();
        
        // Skip if no text
        if (!text || !href) return;
        
        // If we have a search term, filter by it
        if (searchTerm && !text.toLowerCase().includes(searchTermLower)) {
            return;
        }
        
        // Avoid duplicates
        if (seen.has(href)) return;
        seen.add(href);
        
        // Try to get image from the same container or following element
        let imageUrl = '';
        const $img = $elem.find('img').first();
        if ($img.length) {
            imageUrl = $img.attr('src') || $img.attr('data-src') || '';
        }
        
        // Fallback: look in parent or adjacent elements
        if (!imageUrl) {
            const $parent = $elem.parent();
            const $siblingImg = $parent.find('img').first();
            if ($siblingImg.length) {
                imageUrl = $siblingImg.attr('src') || $siblingImg.attr('data-src') || '';
            }
        }
        
        results.push({
            mangaId: encodeURIComponent(href),
            imageUrl: imageUrl,
            title: text,
        });
    });

    return results;
}

export function parseMangaDetails($: CheerioAPI, mangaId: string): SourceManga {
    const $container = $('div#manga-info-container');
    
    const title = $container.find('h1.big-fat-titles').first().text().trim() || 'Unknown';
    const thumbnailUrl = $container.find('div#manga-page img').attr('src') || '';
    const synopsis = $container.find('div#manga-info-rightColumn > div > div.white-font').text().trim();
    
    let author = 'Unknown';
    $container.find('div#manga-info-stats > div').each((_, elem) => {
        const $div = $(elem);
        const firstLi = $div.find('li').first().text().trim();
        if (firstLi.includes('Author')) {
            author = $div.find('li').eq(1).text().trim();
        }
    });

    const tags: { id: string; title: string }[] = [];
    $container.find('div.genres-list > li').each((_, elem) => {
        const genreText = $(elem).text().trim();
        if (genreText) {
            tags.push({ id: genreText.toLowerCase(), title: genreText });
        }
    });

    return {
        mangaId,
        mangaInfo: {
            primaryTitle: title,
            secondaryTitles: [],
            thumbnailUrl,
            synopsis,
            contentRating: ContentRating.MATURE,
            status: 'ONGOING',
            tagGroups: tags.length > 0 ? [{ id: 'genre', title: 'Genres', tags }] : [],
        },
    };
}

export function parseChapters($: CheerioAPI, sourceManga: SourceManga): Chapter[] {
    const chapters: Chapter[] = [];

    $('div#chapters-list a.chplinks').each((_, element) => {
        const $elem = $(element);
        const url = $elem.attr('href');
        const title = $elem.clone().children().remove().end().text().trim();
        const dateText = $elem.find('span').text().trim();

        if (url && title) {
            let publishDate = new Date(0);
            if (dateText) {
                try {
                    publishDate = new Date(dateText);
                } catch {
                    // Keep default
                }
            }

            chapters.push({
                chapterId: encodeURIComponent(url),
                sourceManga,
                title,
                langCode: '🇬🇧',
                chapNum: parseFloat(title.match(/\d+(\.\d+)?/)?.[0] || '0'),
                publishDate,
            });
        }
    });

    return chapters;
}

export function parseChapterPages($: CheerioAPI): string[] {
    const pages: string[] = [];
    $('div > img.imgholder').each((_, element) => {
        const src = $(element).attr('src');
        if (src) pages.push(src);
    });
    return pages;
}

export function parseMostViewedToday($: CheerioAPI, baseUrl: string): DiscoverSectionItem[] {
    const results: DiscoverSectionItem[] = [];
    
    // The "Most Viewed Today" section contains direct anchor tags with images
    $('h1:contains("Most Viewed Today")').parent().find('a[href*="/manga/"]').each((_, element) => {
        const $elem = $(element);
        const url = $elem.attr('href');
        const $img = $elem.find('img');
        const imageUrl = $img.attr('src');
        const title = $img.attr('alt') || $elem.text().trim();

        if (url && title && imageUrl) {
            results.push({
                mangaId: encodeURIComponent(url),
                imageUrl,
                title,
            } as DiscoverSectionItem);
        }
    });

    return results;
}

export function parseLatestTranslations($: CheerioAPI, baseUrl: string): DiscoverSectionItem[] {
    const results: DiscoverSectionItem[] = [];
    
    // The "Our Latest Translations" section contains direct anchor tags
    $('h1:contains("Our Latest Translations")').parent().find('a[href*="/manga/"]').each((_, element) => {
        const $elem = $(element);
        const url = $elem.attr('href');
        const $img = $elem.find('img');
        const imageUrl = $img.attr('src');
        const title = $img.attr('alt') || $elem.text().trim();

        if (url && title && imageUrl) {
            results.push({
                mangaId: encodeURIComponent(url),
                imageUrl,
                title,
            } as DiscoverSectionItem);
        }
    });

    return results;
}

export function parseLatestUpdates($: CheerioAPI, baseUrl: string): DiscoverSectionItem[] {
    const results: DiscoverSectionItem[] = [];
    
    // Find the "Latest Updates" section heading (same pattern as Most Viewed Today)
    const $latestUpdatesSection = $('h1:contains("Latest Updates")').parent();
    
    // Find all manga links within this section
    $latestUpdatesSection.find('a[href*="/manga/"]').each((_, element) => {
        const $link = $(element);
        const url = $link.attr('href');
        const title = $link.attr('title') || $link.text().trim();
        const imageUrl = $link.find('img[src]').first().attr('src');
        
        if (url && title && imageUrl) {
            const encodedUrl = encodeURIComponent(url);
            // Check for duplicates
            if (!results.some(r => 'mangaId' in r && r.mangaId === encodedUrl)) {
                results.push({
                    mangaId: encodedUrl,
                    imageUrl,
                    title,
                } as DiscoverSectionItem);
            }
        }
    });

    return results;
}
