import {
  BasicRateLimiter,
  ContentRating,
  DiscoverSectionType,
  PaperbackInterceptor,
  type Chapter,
  type ChapterDetails,
  type ChapterProviding,
  type DiscoverSection,
  type DiscoverSectionItem,
  type DiscoverSectionProviding,
  type Extension,
  type MangaProviding,
  type PagedResults,
  type Request,
  type Response,
  type SearchFilter,
  type SearchQuery,
  type SearchResultItem,
  type SearchResultsProviding,
  type SourceManga,
  type Tag,
  type TagSection,
} from "@paperback/types";
import * as cheerio from "cheerio";
import { type CheerioAPI } from "cheerio";
import { Genres, type Metadata } from "./models";

const DOMAIN = "https://en-thunderscans.com";

type ThunderScansImplementation = Extension &
  DiscoverSectionProviding &
  SearchResultsProviding &
  MangaProviding &
  ChapterProviding;

class ThunderScansInterceptor extends PaperbackInterceptor {
  override async interceptRequest(request: Request): Promise<Request> {
    request.headers = {
      ...request.headers,
      "referer": "https://en-thunderscans.com/",
      "origin": "https://en-thunderscans.com",
      "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "accept": "image/webp,image/apng,image/*,*/*;q=0.8",
    };
    return request;
  }

  override async interceptResponse(
    request: Request,
    response: Response,
    data: ArrayBuffer,
  ): Promise<ArrayBuffer> {
    return data;
  }
}

export class ThunderScansExtension implements ThunderScansImplementation {
  interceptor = new ThunderScansInterceptor("interceptor");

  rateLimiter = new BasicRateLimiter("rateLimiter", {
    numberOfRequests: 3,
    bufferInterval: 5,
    ignoreImages: false,
  });

  async initialise(): Promise<void> {
    this.interceptor.registerInterceptor();
    this.rateLimiter.registerInterceptor();
  }

  async fetchCheerio(request: Request): Promise<CheerioAPI> {
    const [response, data] = await Application.scheduleRequest(request);
    return cheerio.load(Application.arrayBufferToUTF8String(data));
  }

  getMangaShareUrl(mangaId: string): string {
    return `${DOMAIN}/comics/${mangaId}/`;
  }

  async getSearchFilters(): Promise<SearchFilter[]> {
    return [];
  }

  async getSearchTags(): Promise<TagSection[]> {
    return [
      {
        id: "genres",
        title: "Genres",
        tags: Genres.map(g => ({ id: g.id, title: g.label })),
      },
    ];
  }

  async getDiscoverSections(): Promise<DiscoverSection[]> {
    return [
      {
        id: "popular",
        title: "Popular Today",
        type: DiscoverSectionType.prominentCarousel,
      },
      {
        id: "editors",
        title: "Editor's Pick",
        type: DiscoverSectionType.simpleCarousel,
      },
      {
        id: "latest",
        title: "Latest Update",
        type: DiscoverSectionType.chapterUpdates,
      },
    ];
  }

  async getDiscoverSectionItems(
    section: DiscoverSection,
    metadata: Metadata | undefined,
  ): Promise<PagedResults<DiscoverSectionItem>> {
    const page = metadata?.page ?? 1;
    const url = `${DOMAIN}${section.id === "latest" ? `/page/${page}/` : "/"}`;

    const request = {
      url: url,
      method: "GET",
    };

    const $ = await this.fetchCheerio(request);
    const items: DiscoverSectionItem[] = [];
    
    if (section.id === "popular") {
      // Parse Popular Today - first .pop-list section
      const $popularSection = $('.pop-list').first();
      $popularSection.find('.swiper-slide .bsx').each((_, element) => {
        const $elem = $(element);
        const $link = $elem.find('a').first();
        const href = $link.attr('href');
        const title = $elem.find('.tt').text().trim();
        const image = $elem.find('img.ts-post-image, img.wp-post-image, img').first().attr('src') || '';
        
        if (href && title) {
          const mangaId = this.extractMangaId(href);
          if (mangaId) {
            items.push({
              type: 'prominentCarouselItem',
              mangaId: mangaId,
              title: title,
              imageUrl: image,
            });
          }
        }
      });
    } else if (section.id === "editors") {
      // Parse Editor's Pick - second .pop-list section (after "Editor's Pick" h2)
      let foundEditorsSection = false;
      $('h2').each((_, h2Element) => {
        const h2Text = $(h2Element).text().trim();
        if (h2Text.includes("Editor") && !foundEditorsSection) {
          foundEditorsSection = true;
          // Find the .pop-list that comes after this h2
          const $editorsSection = $(h2Element).closest('.releases').next('.pop-list');
          $editorsSection.find('.swiper-slide .bsx').each((_, element) => {
            const $elem = $(element);
            const $link = $elem.find('a').first();
            const href = $link.attr('href');
            const title = $elem.find('.tt').text().trim();
            const image = $elem.find('img.ts-post-image, img.wp-post-image, img').first().attr('src') || '';
            
            if (href && title) {
              const mangaId = this.extractMangaId(href);
              if (mangaId) {
                items.push({
                  type: 'simpleCarouselItem',
                  mangaId: mangaId,
                  title: title,
                  imageUrl: image,
                });
              }
            }
          });
        }
      });
    } else if (section.id === "latest") {
      // Parse Latest Update section - main content area with .bsx
      $('.bs .bsx').each((_, element) => {
        const $elem = $(element);
        const $link = $elem.find('a').first();
        const href = $link.attr('href');
        const title = $elem.find('.tt').text().trim();
        const image = $elem.find('img').first().attr('src') || '';
        
        // Get the first chapter link
        const $firstChapter = $elem.find('.chapter-list a').first();
        const chapterHref = $firstChapter.attr('href');
        const chapterText = $firstChapter.find('.epxs').text().trim();
        
        if (href && title && chapterHref) {
          const mangaId = this.extractMangaId(href);
          const chapterId = this.extractChapterId(chapterHref);
          if (mangaId && chapterId) {
            items.push({
              type: 'chapterUpdatesCarouselItem',
              mangaId: mangaId,
              title: title,
              imageUrl: image,
              chapterId: chapterId,
            });
          }
        }
      });
    }

    return {
      items: items,
      metadata: section.id === "latest" && items.length > 0 ? { page: page + 1 } : undefined,
    };
  }

  async getSearchResults(
    query: SearchQuery,
    metadata: Metadata | undefined,
  ): Promise<PagedResults<SearchResultItem>> {
    const page = metadata?.page ?? 1;
    const searchTerm = query.title?.trim() || '';

    let url = `${DOMAIN}/page/${page}/?s=${encodeURIComponent(searchTerm)}`;

    const request = {
      url: url,
      method: "GET",
    };

    const $ = await this.fetchCheerio(request);

    const results: SearchResultItem[] = [];

    $('.bsx').each((_, element) => {
      const $elem = $(element);
      const $link = $elem.find('a').first();
      const href = $link.attr('href');
      const title = $elem.find('.tt').text().trim();
      const image = $elem.find('img').first().attr('src') || '';
      
      if (href && title) {
        const mangaId = this.extractMangaId(href);
        if (mangaId) {
          results.push({
            mangaId: mangaId,
            title: title,
            imageUrl: image,
          });
        }
      }
    });

    return {
      items: results,
      metadata: results.length > 0 ? { page: page + 1 } : undefined,
    };
  }

  async getMangaDetails(mangaId: string): Promise<SourceManga> {
    const url = `${DOMAIN}/comics/${mangaId}/`;

    const request = {
      url: url,
      method: "GET",
    };

    const $ = await this.fetchCheerio(request);

    const title = $('h1.entry-title, h1, .entry-title').first().text().trim();
    const image = $('.infoanime img, .summary_image img, img.ts-post-image, img.wp-post-image').first().attr('src') || '';
    
    const description = $('.entry-content-single, .entry-content, .summary__content, .description, .synopsis').text().trim();
    const author = $('.infox .spe span:contains("Author")').next().text().trim() || 'Unknown';
    const artist = $('.infox .spe span:contains("Artist")').next().text().trim() || author;

    // Parse status
    let status = 'ONGOING';
    const statusText = $('.post-status, .status').text().toLowerCase();
    if (statusText.includes('completed') || statusText.includes('complete')) {
      status = 'COMPLETED';
    }

    // Parse genres
    const tags: Tag[] = [];
    $('a[rel="tag"], .genres a, .tags a').each((_, element) => {
      const tag = $(element).text().trim();
      if (tag) {
        tags.push({ id: tag.toLowerCase().replace(/\s+/g, '-'), title: tag });
      }
    });

    return {
      mangaId: mangaId,
      mangaInfo: {
        primaryTitle: title,
        secondaryTitles: [],
        thumbnailUrl: image,
        status: status as "ONGOING" | "COMPLETED",
        artist: artist,
        author: author,
        contentRating: ContentRating.EVERYONE,
        synopsis: description,
        tagGroups: tags.length > 0 ? [{ id: 'genres', title: 'Genres', tags }] : [],
      },
    };
  }

  async getChapters(sourceManga: SourceManga): Promise<Chapter[]> {
    const url = `${DOMAIN}/comics/${sourceManga.mangaId}/`;

    const request = {
      url: url,
      method: "GET",
    };

    const $ = await this.fetchCheerio(request);

    const chapters: Chapter[] = [];

    // Try multiple selectors for different chapter list structures
    $('ul.eplister li, .eplister li, .wp-manga-chapter, .chapter-item, .listing-chapters_wrap a').each((_, element) => {
      const $elem = $(element);
      const $link = $elem.is('a') ? $elem : $elem.find('a').first();
      const href = $link.attr('href');
      const chapterTitle = $link.text().trim();
      
      if (href && chapterTitle) {
        const chapterId = this.extractChapterId(href);
        if (chapterId) {
          // Extract chapter number from title
          const chapterNumMatch = chapterTitle.match(/chapter[:\s]+(\d+(?:\.\d+)?)/i);
          const chapterNum = chapterNumMatch && chapterNumMatch[1] ? parseFloat(chapterNumMatch[1]) : 0;

          // Try to parse date
          const dateText = $elem.find('.chapter-release-date, .post-on').text().trim();
          let date = new Date();
          if (dateText) {
            date = this.parseRelativeDate(dateText);
          }

          chapters.push({
            chapterId: chapterId,
            sourceManga: sourceManga,
            langCode: "en",
            chapNum: chapterNum,
            title: chapterTitle,
            publishDate: date,
          });
        }
      }
    });

    return chapters;
  }

  async getChapterDetails(chapter: Chapter): Promise<ChapterDetails> {
    const url = `${DOMAIN}/${chapter.chapterId}/`;

    const request = {
      url: url,
      method: "GET",
    };

    const $ = await this.fetchCheerio(request);

    const pages: string[] = [];

    // ThunderScans loads images via JavaScript - extract from ts_reader.run() script
    const html = $.html();
    const scriptMatch = html.match(/ts_reader\.run\((\{[\s\S]+?\})\);/);
    
    if (scriptMatch && scriptMatch[1]) {
      try {
        // Extract the JSON from the script and fix escaped slashes
        const jsonStr = scriptMatch[1].replace(/\\\//g, '/');
        const readerData = JSON.parse(jsonStr);
        
        // Get images from the first source
        if (readerData.sources && readerData.sources.length > 0 && readerData.sources[0].images) {
          readerData.sources[0].images.forEach((imageUrl: string) => {
            if (imageUrl && !imageUrl.includes('loading') && !imageUrl.includes('spinner')) {
              pages.push(imageUrl);
            }
          });
        }
      } catch (e) {
        // Fallback to DOM parsing if JSON parsing fails
        console.error('Failed to parse ts_reader.run JSON:', e);
        $('#readerarea img.ts-main-image, #readerarea img').each((_, element) => {
          const $img = $(element);
          const src = $img.attr('src') || $img.attr('data-src') || '';
          if (src && !src.includes('loading') && !src.includes('spinner')) {
            pages.push(src.trim());
          }
        });
      }
    }

    return {
      id: chapter.chapterId,
      mangaId: chapter.sourceManga.mangaId,
      pages: pages,
    };
  }

  private extractMangaId(url: string): string | null {
    // Extract manga ID from URL like /comics/manga-slug/ or /comics/manga-slug
    const match = url.match(/\/comics\/([^\/]+)/);
    return match && match[1] ? match[1] : null;
  }

  private extractChapterId(url: string): string | null {
    // Extract chapter ID from URL like /manga-slug-chapter-123/
    const match = url.match(/\/([^\/]+chapter[^\/]+)/);
    if (match && match[1]) {
      return match[1];
    }
    // Alternative: extract from full path
    const parts = url.split('/').filter(p => p);
    const lastPart = parts[parts.length - 1];
    return lastPart ? lastPart : null;
  }

  private parseRelativeDate(dateString: string): Date {
    const now = new Date();
    const lower = dateString.toLowerCase();

    // Handle relative dates
    if (lower.includes('ago')) {
      const match = dateString.match(/(\d+)\s+(second|minute|hour|day|week|month|year)/i);
      if (match && match[1] && match[2]) {
        const value = parseInt(match[1]);
        const unit = match[2].toLowerCase();

        switch (unit) {
          case 'second':
            now.setSeconds(now.getSeconds() - value);
            break;
          case 'minute':
            now.setMinutes(now.getMinutes() - value);
            break;
          case 'hour':
            now.setHours(now.getHours() - value);
            break;
          case 'day':
            now.setDate(now.getDate() - value);
            break;
          case 'week':
            now.setDate(now.getDate() - value * 7);
            break;
          case 'month':
            now.setMonth(now.getMonth() - value);
            break;
          case 'year':
            now.setFullYear(now.getFullYear() - value);
            break;
        }
      }
      return now;
    }

    // Try to parse as regular date
    const parsed = new Date(dateString);
    return isNaN(parsed.getTime()) ? now : parsed;
  }
}

export const ThunderScans = new ThunderScansExtension();
