import {
    ContentRating,
    type Chapter,
    type SearchResultItem,
    type SourceManga,
} from '@paperback/types';
import type { CheerioAPI } from 'cheerio';

export function parseSearchResults($: CheerioAPI, baseUrl: string): SearchResultItem[] {
    const results: SearchResultItem[] = [];
    const seen = new Set<string>();
    
    const $items = $('div.story_item, div.list-comic-item-wrap');
    
    $items.each((_, element) => {
        const $el = $(element);
        
        // Get ID from link
        const $link = $el.find('a').first();
        if (!$link.length) return;
        
        const url = $link.attr('href')?.trim();
        if (!url) return;
        
        // Get title - try story_name first (for story_item), then img alt (for list-comic-item-wrap)
        let title = $el.find('.story_name').text().trim();
        if (!title) {
            title = $el.find('img').attr('alt')?.trim() || '';
        }
        if (!title) return;
        
        // Get image - check multiple attributes
        let imageUrl = '';
        const $img = $el.find('img').first();
        if ($img.length) {
            // Try multiple image attributes in order
            imageUrl = $img.attr('src')?.trim() || 
                      $img.attr('data-src')?.trim() || 
                      $img.attr('data-lazy-src')?.trim() || 
                      $img.attr('data-cfsrc')?.trim() || '';
        }
        
        if (!seen.has(url)) {
            seen.add(url);
            results.push({
                mangaId: url,
                imageUrl: imageUrl,
                title,
            });
        }
    });

    return results;
}

export function parseMangaDetails($: CheerioAPI, mangaId: string): SourceManga {
    const $main = $('div.main-wrapper');
    
    // Get title - try img alt first, then story name, then h1
    let title = $main.find('img.manga-image').attr('alt')?.trim() || '';
    if (!title) {
        title = $main.find('.story_name, h1').first().text().trim();
    }
    if (!title) {
        title = $('h1.manga-title, h1.post-title, h1').first().text().trim();
    }
    if (!title) {
        title = $('meta[property="og:title"]').attr('content')?.trim() || 'Unknown';
    }
    
    // Get cover image - multiple selectors with fallback attributes
    let thumbnailUrl = '';
    
    // Try main wrapper image selectors first
    let $img = $main.find('img.manga-image, div.manga-info-pic img, span.info-image img').first();
    
    if ($img.length) {
        // Check multiple image attributes in priority order
        thumbnailUrl = $img.attr('src')?.trim() || 
                      $img.attr('data-src')?.trim() || 
                      $img.attr('data-lazy-src')?.trim() || 
                      $img.attr('data-cfsrc')?.trim() || '';
    }
    
    // Fallback to other image selectors
    if (!thumbnailUrl) {
        $img = $('img[src*="thumb"], img[src*="cover"], img[alt*="cover"]').first();
        if ($img.length) {
            thumbnailUrl = $img.attr('src')?.trim() || $img.attr('data-src')?.trim() || '';
        }
    }
    
    // Final fallback to og:image meta tag
    if (!thumbnailUrl) {
        thumbnailUrl = $('meta[property="og:image"]').attr('content')?.trim() || '';
    }
    
    // Get description/synopsis - multiple selectors
    let synopsis = '';
    let $desc = $main.find('div#noidungm');
    if (!$desc.length) {
        $desc = $main.find('div#panel-story-info-description');
    }
    if (!$desc.length) {
        $desc = $main.find('div#contentBox');
    }
    if (!$desc.length) {
        $desc = $('div.manga-summary, div.manga-description').first();
    }
    
    if ($desc.length) {
        synopsis = $desc.text().trim();
    }
    
    // Fallback to meta description
    if (!synopsis) {
        synopsis = $('meta[name="description"], meta[property="og:description"]').attr('content')?.trim() || '';
    }
    
    // Get genres/tags
    const tags: { id: string; title: string }[] = [];
    const seenTags = new Set<string>();
    
    // Try multiple genre selectors
    const $genres = $main.find('li.genres a, .genres a, .tag a, a[href*="genre"], a[href*="tag"]');
    $genres.each((_, elem) => {
        const text = $(elem).text().trim();
        if (text && text.length > 0 && !text.toLowerCase().includes('genre') && !text.toLowerCase().includes('tag')) {
            if (!seenTags.has(text.toLowerCase())) {
                seenTags.add(text.toLowerCase());
                const slugId = text.toLowerCase().replace(/\s+/g, '-').replace(/[^\w\-]/g, '');
                tags.push({ id: slugId, title: text });
            }
        }
    });

    return {
        mangaId,
        mangaInfo: {
            primaryTitle: title,
            secondaryTitles: [],
            thumbnailUrl,
            synopsis,
            contentRating: ContentRating.EVERYONE,
            status: 'ONGOING',
            tagGroups: tags.length > 0 ? [{ id: 'genre', title: 'Genres', tags }] : [],
        },
    };
}

export function parseChapters($: CheerioAPI, sourceManga: SourceManga): Chapter[] {
    const chapters: Chapter[] = [];
    const seen = new Set<string>();

    // MangaBats has chapters in divs or list items
    // Look for links that have chapter numbers in them
    $('a[href*="/chapter"], li a').each((_, element) => {
        const $link = $(element);
        const href = $link.attr('href')?.trim();
        const title = $link.text().trim();
        
        // Skip if not a chapter link
        if (!href || !title || !href.includes('/chapter')) {
            return;
        }
        
        // Skip duplicates
        if (seen.has(href)) {
            return;
        }
        seen.add(href);

        // Extract chapter number from title (e.g., "Chapter 1", "Ch. 1.5")
        const chapterMatch = title.match(/\d+(?:\.\d+)?/);
        const chapNum = chapterMatch ? parseFloat(chapterMatch[0]) : 0;

        chapters.push({
            chapterId: href,
            sourceManga,
            title,
            langCode: '🇬🇧',
            chapNum,
            publishDate: new Date(0),
        });
    });

    // Sort chapters in descending order (newest first)
    return chapters.sort((a, b) => b.chapNum - a.chapNum);
}

export function parseChapterPages($: CheerioAPI): string[] {
    const pages: string[] = [];
    
    // MangaBats has images in containers
    // Look for img tags with src or data-src attributes
    $('img[src*="storage"], img[src*="img"], img').each((_, element) => {
        const $img = $(element);
        const src = $img.attr('src')?.trim() || $img.attr('data-src')?.trim();
        
        // Skip if no src, or if it's a thumbnail/icon
        if (!src || src.includes('thumb') || src.includes('icon') || src.includes('logo')) {
            return;
        }
        
        // Skip duplicates
        if (!pages.includes(src)) {
            pages.push(src);
        }
    });

    // Filter out very short page arrays (likely not actual pages)
    return pages.length > 0 ? pages : [];
}
