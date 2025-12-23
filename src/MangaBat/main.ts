import {
    BasicRateLimiter,
    type Chapter,
    type ChapterDetails,
    type ChapterProviding,
    type Extension,
    type PagedResults,
    type SearchQuery,
    type SearchResultItem,
    type SearchResultsProviding,
    type SourceManga,
    type SortingOption,
} from '@paperback/types';
import * as cheerio from 'cheerio';
import * as htmlparser2 from 'htmlparser2';

import { Interceptor } from './interceptors';
import {
    parseSearchResults,
    parseMangaDetails,
    parseChapters,
    parseChapterPages,
} from './parsers';

const baseUrl = 'https://www.mangabats.com';

type MangaBatImplementation = Extension &
    SearchResultsProviding &
    ChapterProviding & {
        getDiscoverySections(): Promise<any[]>;
        getDiscoveryItems(sectionId: string, metadata?: any): Promise<PagedResults<SearchResultItem>>;
    };

export class MangaBatExtension implements MangaBatImplementation {
    requestManager = new Interceptor('main');
    
    globalRateLimiter = new BasicRateLimiter('rateLimiter', {
        numberOfRequests: 1,
        bufferInterval: 1,
        ignoreImages: true,
    });

    async initialise(): Promise<void> {
        this.requestManager.registerInterceptor();
        this.globalRateLimiter.registerInterceptor();
    }

    async getSearchResults(
        query: SearchQuery,
        metadata?: any,
        _sortingOption?: SortingOption,
    ): Promise<PagedResults<SearchResultItem>> {
        const page = metadata?.page || 1;

        try {
            let searchUrl: string;

            if (query.title && query.title.trim() !== '') {
                // Use the search API endpoint for better results
                const searchTerm = encodeURIComponent(query.title.trim());
                searchUrl = `${baseUrl}/?s=${searchTerm}&post_type=wp-manga&page=${page}`;
            } else {
                // Default to latest manga
                searchUrl = `${baseUrl}/manga-list/latest-manga?page=${page}`;
            }

            const request = {
                url: searchUrl,
                method: 'GET',
            };

            const [_response, data] = await Application.scheduleRequest(request);
            const htmlStr = Application.arrayBufferToUTF8String(data);
            const $ = cheerio.load(htmlparser2.parseDocument(htmlStr));
            const items = parseSearchResults($, baseUrl);
            
            // Check if there's a next page
            const hasNextPage = $('a.next').length > 0 || items.length >= 20;

            return {
                items,
                metadata: hasNextPage ? { page: page + 1 } : undefined,
            };
        } catch (error) {
            console.error('[MangaBat] Search error:', error);
            return { items: [] };
        }
    }

    async getDiscoverySections(): Promise<any[]> {
        return [
            {
                id: 'latest',
                title: 'Latest Releases',
            },
            {
                id: 'popular',
                title: 'Popular Manga',
            },
            {
                id: 'new',
                title: 'New Manga',
            },
        ];
    }

    async getDiscoveryItems(sectionId: string, metadata?: any): Promise<PagedResults<SearchResultItem>> {
        const page = metadata?.page || 1;
        let url: string;

        try {
            switch (sectionId) {
                case 'latest':
                    url = `${baseUrl}/manga-list/latest-manga?page=${page}`;
                    break;
                case 'popular':
                    url = `${baseUrl}/manga-list/hot-manga?page=${page}`;
                    break;
                case 'new':
                    url = `${baseUrl}/manga-list/new-manga?page=${page}`;
                    break;
                default:
                    url = `${baseUrl}/manga-list/latest-manga?page=${page}`;
            }

            const request = {
                url,
                method: 'GET',
            };

            const [_response, data] = await Application.scheduleRequest(request);
            const htmlStr = Application.arrayBufferToUTF8String(data);
            const $ = cheerio.load(htmlparser2.parseDocument(htmlStr));
            const items = parseSearchResults($, baseUrl);

            const hasNextPage = $('a.next').length > 0 || items.length >= 20;

            return {
                items,
                metadata: hasNextPage ? { page: page + 1 } : undefined,
            };
        } catch (error) {
            console.error('[MangaBat] Discovery error:', error);
            return { items: [] };
        }
    }

    async getMangaDetails(mangaId: string): Promise<SourceManga> {
        const url = mangaId.startsWith('http') ? mangaId : `${baseUrl}${mangaId}`;
        const request = {
            url,
            method: 'GET',
        };

        const [_response, data] = await Application.scheduleRequest(request);
        const htmlStr = Application.arrayBufferToUTF8String(data);
        const $ = cheerio.load(htmlparser2.parseDocument(htmlStr));

        return parseMangaDetails($, mangaId);
    }

    async getChapters(sourceManga: SourceManga): Promise<Chapter[]> {
        const mangaId = sourceManga.mangaId;
        const url = mangaId.startsWith('http') ? mangaId : `${baseUrl}${mangaId}`;

        const request = {
            url,
            method: 'GET',
        };

        const [_response, data] = await Application.scheduleRequest(request);
        const htmlStr = Application.arrayBufferToUTF8String(data);
        const $ = cheerio.load(htmlparser2.parseDocument(htmlStr));

        return parseChapters($, sourceManga);
    }

    async getChapterDetails(chapter: Chapter): Promise<ChapterDetails> {
        const chapterId = chapter.chapterId;
        const url = chapterId.startsWith('http') ? chapterId : `${baseUrl}${chapterId}`;

        const request = {
            url,
            method: 'GET',
        };

        const [_response, data] = await Application.scheduleRequest(request);
        const htmlStr = Application.arrayBufferToUTF8String(data);
        const $ = cheerio.load(htmlparser2.parseDocument(htmlStr));

        const pages = parseChapterPages($);
        
        return {
            id: chapter.chapterId,
            mangaId: chapter.sourceManga.mangaId,
            pages,
        };
    }

    async getSearchFilters(): Promise<any[]> {
        return [];
    }

    async getSortingOptions(): Promise<any[]> {
        return [];
    }
}

export const MangaBat = new MangaBatExtension();
