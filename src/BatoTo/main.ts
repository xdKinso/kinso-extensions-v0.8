import {
    BasicRateLimiter,
    CloudflareError,
    ContentRating,
    DiscoverSectionType,
    Form,
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
    type SettingsFormProviding,
    type SortingOption,
    type SourceManga,
    type TagSection,
} from "@paperback/types";
import * as cheerio from "cheerio";
import { URLBuilder } from "../utils/url-builder/base";
import { BatoToSettingsForm, getLanguages } from "./forms";
import { AdultGenres, Genres, MatureGenres, type Metadata } from "./models";

const DOMAIN_NAME = "https://bato.si/";

// Extracts a manga identifier from either the legacy /series/ path or the new /title/ slugged path
const extractMangaIdFromHref = (href: string): string => {
    const slugMatch = href.match(/\/title\/([^/?#]+)/);
    if (slugMatch?.[1]) return slugMatch[1];

    const legacyMatch = href.match(/\/series\/(\d+)/);
    if (legacyMatch?.[1]) return legacyMatch[1];

    return "";
};

// Keeps the new slug-style IDs intact while stripping unsafe characters
const sanitizeMangaId = (id: string): string =>
    decodeURIComponent(id).replace(/[^a-zA-Z0-9@._-]/g, "_").trim();

const normalizeImageUrl = (url: string): string =>
    url.includes("//k") ? url.replace("//k", "//n") : url;

// Should match the capabilities which you defined in pbconfig.ts
type BatoToImplementation = SettingsFormProviding &
    Extension &
    DiscoverSectionProviding &
    SearchResultsProviding &
    MangaProviding &
    ChapterProviding;

// Intercepts all the requests and responses and allows you to make changes to them
class MainInterceptor extends PaperbackInterceptor {
    override async interceptRequest(request: Request): Promise<Request> {
        // Fix BatoTo image server issue: replace broken '//k' servers with working '//n' servers
        if (request.url.includes('//k')) {
            request.url = request.url.replace('//k', '//n');
        }

        request.headers = {
            ...request.headers,
            referer: `${DOMAIN_NAME}/`,
            origin: DOMAIN_NAME,
            "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            accept: "image/webp,image/apng,image/*,*/*;q=0.8",
        };

        return request;
    }

    override async interceptResponse(
        request: Request,
        response: Response,
        data: ArrayBuffer,
    ): Promise<ArrayBuffer> {
        // Check for Cloudflare server connectivity errors on image requests
        // 521 = Web Server Is Down, 522 = Connection Timed Out, 523 = Origin Unreachable
        const isImageRequest = request.url.includes(".mbwnp.org") || 
                              request.url.includes(".mbgqu.org") ||
                              request.url.includes(".mbzcp.org") ||
                              request.url.includes(".mbtba.org") ||
                              request.url.includes(".mbopg.org") ||
                              request.url.includes(".mbuul.org");
        
        if (isImageRequest && (response.status === 521 || response.status === 522 || response.status === 523)) {
            // Log the error but don't throw - let the app show placeholder
            console.log(`[BatoTo] CDN server error ${response.status} for image: ${request.url}`);
            // Return empty buffer to avoid crash
            return new ArrayBuffer(0);
        }
        
        return data;
    }
}

// Main extension class
export class BatoToExtension implements BatoToImplementation {
    // Implementation of the main rate limiter
    mainRateLimiter = new BasicRateLimiter("main", {
        numberOfRequests: 15,
        bufferInterval: 10,
        ignoreImages: true,
    });

    // Implementation of the main interceptor
    mainInterceptor = new MainInterceptor("main");

    // Method from the Extension interface which we implement, initializes the rate limiter, interceptor, discover sections and search filters
    async initialise(): Promise<void> {
        this.mainRateLimiter.registerInterceptor();
        this.mainInterceptor.registerInterceptor();
    }

    // Implements the settings form, check SettingsForm.ts for more info
    async getSettingsForm(): Promise<Form> {
        return new BatoToSettingsForm();
    }

    async getDiscoverSections(): Promise<DiscoverSection[]> {
        return [
            {
                id: "popular-updates",
                title: "Popular Updates",
                type: DiscoverSectionType.featured,
            },
            {
                id: "latest-releases",
                title: "Latest Releases",
                type: DiscoverSectionType.prominentCarousel,
            },
            {
                id: "browse-sections",
                title: "Browse Sections",
                type: DiscoverSectionType.simpleCarousel,
            },
            {
                id: "get-genre-section",
                title: "Genres",
                type: DiscoverSectionType.genres,
            },
        ];
    }

    // Populates both the discover sections
    async getDiscoverSectionItems(
        section: DiscoverSection,
        metadata: Metadata | undefined,
    ): Promise<PagedResults<DiscoverSectionItem>> {
        switch (section.id) {
            case "popular-updates":
                return this.getPopularUpdates(metadata);
            case "latest-releases":
                return this.getLatestReleases(section, metadata);
            case "browse-sections":
                return this.getBrowseSections(section, metadata);
            case "get-genre-section":
                return this.getGenreSection();
            default:
                return { items: [] };
        }
    }

    // Populates the popular updates section
    async getPopularUpdates(
        metadata: { page?: number; collectedIds?: string[] } | undefined,
    ): Promise<PagedResults<DiscoverSectionItem>> {
        const items: DiscoverSectionItem[] = [];
        const collectedIds = metadata?.collectedIds ?? [];

        const request = {
            url: new URLBuilder(DOMAIN_NAME).build(),
            method: "GET",
        };

        const $ = await this.fetchCheerio(request);

        // Extract from .home-popular
        $("div.home-popular > div.col.item").each((_, element) => {
            const unit = $(element);

            const anchor = unit.find("a.item-cover");
            const href = anchor.attr("href") || "";
            const mangaId = sanitizeMangaId(extractMangaIdFromHref(href));

            const image = normalizeImageUrl(
                anchor.find("img").attr("src") || "",
            );
            const title = unit.find("a.item-title").text().trim();

            if (mangaId && title && image && !collectedIds.includes(mangaId)) {
                collectedIds.push(mangaId);
                items.push({
                    type: "simpleCarouselItem",
                    mangaId: mangaId,
                    imageUrl: image,
                    title: title,
                    metadata: undefined,
                });
            }
        });

        return {
            items: items,
            metadata: undefined,
        };
    }

    // Populates the latest releases section
    async getLatestReleases(
        section: DiscoverSection,
        metadata: { page?: number; collectedIds?: string[] } | undefined,
    ): Promise<PagedResults<DiscoverSectionItem>> {
        const page = metadata?.page ?? 1;
        const items: DiscoverSectionItem[] = [];
        const collectedIds = metadata?.collectedIds ?? [];
        const languages = getLanguages();

        const request = {
            url: new URLBuilder(DOMAIN_NAME)
                .addPath("latest")
                .addQuery("langs", languages.join(","))
                .addQuery("orig", "all")
                .build(),
            method: "GET",
        };

        const $ = await this.fetchCheerio(request);

        // Extract manga items from the new HTML structure
        $("div#series-list > div.col.item").each((_, element) => {
            const unit = $(element);

            // Get title and link
            const titleLink = unit.find("a.item-title").first();
            const href = titleLink.attr("href") || "";
            let mangaId = sanitizeMangaId(extractMangaIdFromHref(href));

            // Get image - try src first (it's populated in HTML)
            const imgElement = unit.find("a.item-cover img");
            let image = imgElement.attr("src") || 
                         imgElement.attr("data-src") || 
                         imgElement.attr("data-lazy-src") || "";
            
            // Fix broken k server URLs immediately for faster loading
            image = normalizeImageUrl(image);

            // Get title text
            const title = titleLink.text().trim();

            // Get latest chapter text
            const chapterLink = unit.find("div.item-volch a.visited").first();
            const subtitle = chapterLink.text().trim();

            if (mangaId && title && image && !collectedIds.includes(mangaId)) {
                collectedIds.push(mangaId);
                items.push({
                    type: "simpleCarouselItem",
                    mangaId: mangaId,
                    imageUrl: image,
                    title: title,
                    subtitle: subtitle,
                    metadata: undefined,
                });
            }
        });

        // Check for "Load More" button to determine if there are more items
        const loadMoreButton = $("div.load-more button.btn-warning");
        let nextOffset: number | undefined;

        if (loadMoreButton.length > 0) {
            nextOffset = page + 1;
        }

        return {
            items: items,
            metadata: nextOffset
                ? { page: nextOffset, collectedIds: collectedIds }
                : undefined,
        };
    }

    // Populates the browse sections
    async getBrowseSections(
        section: DiscoverSection,
        metadata: { page?: number; collectedIds?: string[] } | undefined,
    ): Promise<PagedResults<DiscoverSectionItem>> {
        const page = metadata?.page ?? 1;
        const items: DiscoverSectionItem[] = [];
        const collectedIds = metadata?.collectedIds ?? [];
        const languages = getLanguages();

        //https://bato.to/browse?langs=nl&sort=views_m.za&orig=all
        const request = {
            url: new URLBuilder(DOMAIN_NAME)
                .addPath("browse")
                .addQuery("langs", languages.join(","))
                .addQuery("sort", "views_m.za")
                .addQuery("orig", "all")
                .addQuery("page", page.toString())
                .build(),
            method: "GET",
        };

        const $ = await this.fetchCheerio(request);

        // Extract manga items from the new HTML structure
        $("div#series-list > div.col.item").each((_, element) => {
            const unit = $(element);

            // Get title and link
            const titleLink = unit.find("a.item-title").first();
            const href = titleLink.attr("href") || "";
            let mangaId = sanitizeMangaId(extractMangaIdFromHref(href));

            // Get image - try src first (it's populated in HTML)
            const imgElement = unit.find("a.item-cover img");
            let image = imgElement.attr("src") || 
                         imgElement.attr("data-src") || 
                         imgElement.attr("data-lazy-src") || "";
            
            // Fix broken k server URLs immediately for faster loading
            image = normalizeImageUrl(image);

            // Get title text
            const title = titleLink.text().trim();

            // Get latest chapter text
            const chapterLink = unit.find("div.item-volch a.visited").first();
            const subtitle = chapterLink.text().trim();

            if (mangaId && title && image && !collectedIds.includes(mangaId)) {
                collectedIds.push(mangaId);
                items.push({
                    type: "simpleCarouselItem",
                    mangaId: mangaId,
                    imageUrl: image,
                    title: title,
                    subtitle: subtitle,
                    metadata: undefined,
                });
            }
        });

        // Check for next page
        const paginationContainer = $("ul.pagination");
        let nextPage: number | undefined;

        if (paginationContainer.length > 0) {
            const nextPageItem = paginationContainer
                .find("li.page-item > a.page-link span")
                .filter((_, el) => $(el).text().trim() === "»")
                .parent(); // Get the <a> tag

            if (nextPageItem.length > 0) {
                const nextHref = nextPageItem.attr("href");
                const pageMatch = nextHref?.match(/page=(\d+)/);
                if (pageMatch && pageMatch[1]) {
                    nextPage = parseInt(pageMatch[1], 10);
                }
            }
        }

        return {
            items: items,
            metadata: nextPage
                ? { page: nextPage, collectedIds: collectedIds }
                : undefined,
        };
    }

    // Populates the genre section
    async getGenreSection(): Promise<PagedResults<DiscoverSectionItem>> {
        return {
            items: Genres.map((genre) => ({
                type: "genresCarouselItem",
                searchQuery: {
                    title: "",
                    filters: [
                        { id: "genres", value: { [genre.id]: "included" } },
                    ],
                },
                name: genre.value,
                metadata: undefined,
            })),
        };
    }

    // Populate search filters
    async getSearchFilters(): Promise<SearchFilter[]> {
        const filters: SearchFilter[] = [];

        // Type filter dropdown
        filters.push({
            id: "genres",
            type: "multiselect",
            options: Genres,
            allowExclusion: true,
            value: {},
            title: "Genre Filter",
            allowEmptySelection: false,
            maximum: undefined,
        });

        return filters;
    }

    async getSortingOptions(): Promise<SortingOption[]> {
        return [
            { id: "field_score", label: "Rating Score" },
            { id: "field_follow", label: "Most Follows" },
            { id: "field_review", label: "Most Reviews" },
            { id: "field_comment", label: "Most Comments" },
            { id: "field_chapter", label: "Most Chapters" },
            { id: "field_upload", label: "Latest Upload" },
            { id: "field_public", label: "Recently Created" },
            { id: "field_name", label: "Name A-Z" },
            { id: "views_d030", label: "Views (30 days)" },
            { id: "views_d000", label: "Views (All time)" },
        ];
    }

    // Populates search
    async getSearchResults(
        query: SearchQuery,
        metadata?: { page?: number },
        sortingOption?: SortingOption,
    ): Promise<PagedResults<SearchResultItem>> {
        const page = metadata?.page ?? 1;
        const languages: string[] = getLanguages();

        const urlBuilder = new URLBuilder(DOMAIN_NAME).addPath("v4x-search");

        // The site accepts both query and path based paging; keep both for safety
        if (page > 1) {
            urlBuilder.addPath(page.toString());
        }

        if (query.title && query.title.trim() !== "") {
            urlBuilder.addQuery("word", query.title.trim());
        }

        urlBuilder.addQuery("orig", "");
        urlBuilder.addQuery("lang", languages.join(","));
        urlBuilder.addQuery("sort", sortingOption?.id || "views_d360");
        urlBuilder.addQuery("page", page.toString());

        const request = { url: urlBuilder.build(), method: "GET" };
        const $ = await this.fetchCheerio(request);
        const searchResults: SearchResultItem[] = [];
        const collectedIds = new Set<string>();

        // The search page markup changes often, so harvest every anchor that points to a title
        const anchors = $('a[href*="/title/"]');

        anchors.each((_, element) => {
            const anchor = $(element);
            const href = anchor.attr("href") || "";
            const rawId = extractMangaIdFromHref(href);
            const mangaId = sanitizeMangaId(rawId);

            if (!mangaId || collectedIds.has(mangaId)) return;

            const container = anchor.closest("article, div, li, section");
            const resolvedContainer = container.length ? container : anchor;

            const titleText = (
                anchor.text() ||
                resolvedContainer.find(".item-title, h3, .font-bold").first().text() ||
                ""
            ).trim();

            if (!titleText) return;

            const imgElement = resolvedContainer
                .find("img")
                .add(anchor.find("img"))
                .filter((_, img) => {
                    const src =
                        $(img).attr("src") ||
                        $(img).attr("data-src") ||
                        $(img).attr("data-lazy-src") ||
                        "";
                    return !!src;
                })
                .first();

            let image =
                imgElement.attr("src") ||
                imgElement.attr("data-src") ||
                imgElement.attr("data-lazy-src") ||
                "";

            image = normalizeImageUrl(image);

            searchResults.push({
                mangaId: mangaId,
                imageUrl: image,
                title: titleText,
                subtitle: "",
            });

            collectedIds.add(mangaId);
        });

        // Handle pagination by inspecting both path- and query-based links
        let maxPage = page;

        $('a[href*="/v4x-search"]').each((_, element) => {
            const href = $(element).attr("href") || "";

            const pathPage = href.match(/v4x-search\/(\d+)/);
            if (pathPage?.[1]) {
                maxPage = Math.max(maxPage, parseInt(pathPage[1], 10));
            }

            const queryPage = href.match(/[?&]page=(\d+)/);
            if (queryPage?.[1]) {
                maxPage = Math.max(maxPage, parseInt(queryPage[1], 10));
            }
        });

        $('a').each((_, element) => {
            const numericText = parseInt($(element).text().trim(), 10);
            if (!isNaN(numericText)) {
                maxPage = Math.max(maxPage, numericText);
            }
        });

        const hasNextPage = page < maxPage;

        return {
            items: searchResults,
            metadata: hasNextPage ? { page: page + 1 } : undefined,
        };
    }

    // Populates the title details
    async getMangaDetails(mangaId: string): Promise<SourceManga> {
        const request = {
            url: new URLBuilder(DOMAIN_NAME)
                .addPath("title")
                .addPath(mangaId)
                .build(),
            method: "GET",
        };

        const $ = await this.fetchCheerio(request);

        // Extract the primary title
        let title = $("h3.text-lg.md\\:text-2xl.font-bold").text().trim();
        // Check if title is duplicated and fix it
        if (title.length % 2 === 0) {
            const halfLength = title.length / 2;
            const firstHalf = title.substring(0, halfLength);
            const secondHalf = title.substring(halfLength);
            if (firstHalf === secondHalf) {
                title = firstHalf; // Use only the first half if duplicated
            }
        }

        // Extract alternative titles
        const altNames: string[] = [];
        $(".mt-1.text-xs.md\\:text-base.opacity-80").each((_, element) => {
            const altName = $(element).text().trim();
            if (altName) altNames.push(altName);
        });

        // Extract thumbnail URL
        const image =
            $(".w-24.md\\:w-52.flex-none.justify-start.items-start img").attr(
                "data-src",
            ) ||
            $(".w-24.md\\:w-52.flex-none.justify-start.items-start img").attr(
                "src",
            ) ||
            "";
        const validImage = image.trim();

        // Extract description
        const description = $(".prose.lg\\:prose-lg.limit-html .limit-html-p")
            .text()
            .trim();

        // Extract status
        let status = "UNKNOWN";
        const statusText = $("span.font-bold.uppercase.text-success")
            .text()
            .trim()
            .toLowerCase();
        if (statusText.includes("ongoing")) {
            status = "ONGOING";
        } else if (statusText.includes("completed")) {
            status = "COMPLETED";
        }

        // Extract authors
        const authors: string[] = [];
        $(".mt-2.text-sm.md\\:text-base.opacity-80 a").each((_, element) => {
            authors.push($(element).text().trim());
        });

        // Extract artists
        const artists: string[] = [];
        $(".mt-2.text-sm.md\\:text-base.opacity-80 a").each((_, element) => {
            artists.push($(element).text().trim());
        });

        // Extract genres - FIXED
        const mangaGenres: string[] = [];
        $(
            '.space-y-2 .flex.items-center.flex-wrap span span.font-bold, .space-y-2 .flex.items-center.flex-wrap span span:not([class*="text-base-content"])',
        ).each((_, element) => {
            const genre = $(element).text().trim();
            // Only add the genre if it's not empty and doesn't contain a comma
            if (genre && !genre.includes(",") && !mangaGenres.includes(genre)) {
                mangaGenres.push(genre);
            }
        });

        // Extract tags from the Tags section - FIXED
        const tags: string[] = [];
        $(
            '.flex.items-center.flex-wrap span span:not([class*="text-base-content"])',
        ).each((_, element) => {
            const tag = $(element).text().trim().replace(/^#/, "");
            // Only add the tag if it's not empty, doesn't contain a comma, and isn't already in the list
            if (tag && !tag.includes(",") && !tags.includes(tag)) {
                tags.push(tag);
            }
        });

        // Function to sanitize IDs - IMPROVED
        const sanitizeId = (str: string): string => {
            return str
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, "-") // Replace all non-alphanumeric characters with '-'
                .replace(/^-+|-+$/g, ""); // Remove leading and trailing '-'
        };

        // Build tag sections
        const tagSections: TagSection[] = [];
        if (Genres.length > 0) {
            tagSections.push({
                id: "genres",
                title: "Genres",
                tags: mangaGenres.map((genre) => ({
                    id: sanitizeId(genre), // Sanitize genre ID
                    title: genre,
                })),
            });
        }

        // Determine content rating based on genres
        let contentRating = ContentRating.EVERYONE;
        if (mangaGenres.some((genre) => AdultGenres.includes(genre))) {
            contentRating = ContentRating.ADULT;
        } else if (mangaGenres.some((genre) => MatureGenres.includes(genre))) {
            contentRating = ContentRating.MATURE;
        }

        // Extract language from manga details
        const langCode = $(
            ".space-y-2 .whitespace-nowrap.overflow-hidden > span.mr-1",
        )
            .first()
            .text()
            .trim();

        return {
            mangaId: mangaId,
            mangaInfo: {
                primaryTitle: title,
                secondaryTitles: altNames,
                thumbnailUrl: validImage,
                synopsis: description,
                contentRating: contentRating,
                status: status as "ONGOING" | "COMPLETED",
                tagGroups: tagSections,
                shareUrl: request.url,
                author: authors.join(", "),
                additionalInfo: { langCode: langCode },
                //artist: artists.join(', ')
            },
        };
    }

    // Populates the chapter list
    async getChapters(sourceManga: SourceManga): Promise<Chapter[]> {
        const langCode = sourceManga.mangaInfo.additionalInfo?.langCode || "";
        const request = {
            url: new URLBuilder(DOMAIN_NAME)
                .addPath("title")
                .addPath(sourceManga.mangaId)
                .build(),
            method: "GET",
        };

        const $ = await this.fetchCheerio(request);
        const chapters: Chapter[] = [];

        // Select each chapter row using the scrollable panel and chapter divs
        $(".scrollable-panel div.px-2.py-2").each((idx, element) => {
            const row = $(element);
            const chapterLink = row.find("a.link-hover.link-primary").first();
            const chapterPath = chapterLink.attr("href") || "";
            const chapterId = chapterPath.split("/").pop() || "";
            const rawChapterText = chapterLink.text().trim();

            if (!chapterId) return;

            // Chapter number parsing
            const chapNum = parseFloat(chapterId.split("-ch_").pop() || "0");

            // Extract volume if present
            const volumeMatch = rawChapterText.match(
                /(?:Volume|Vol\.?)\s*([\d.]+)(?:\s*[:\--]\s*(.*))?/i,
            );
            const volume = volumeMatch && volumeMatch[1] ? parseFloat(volumeMatch[1]) : 0;
            const titleMatch = rawChapterText.split(chapNum.toString()).pop();
            const title = titleMatch
                ? titleMatch.replace(/^[\s:;.,\-–—]+/, "").trim()
                : rawChapterText.includes(chapNum.toString())
                  ? ""
                  : rawChapterText;

            // Extract publish date from time attribute
            const rawDate = row.find("time").attr("time") || "";
            const publishDate = new Date(rawDate);

            chapters.push({
                chapterId,
                title,
                sourceManga,
                chapNum,
                publishDate,
                langCode,
                volume,
                sortingIndex: idx,
            });
        });

        return chapters;
    }

    // Populates a chapter with images
    async getChapterDetails(chapter: Chapter): Promise<ChapterDetails> {
        const request = {
            url: new URLBuilder(DOMAIN_NAME)
                .addPath("title")
                .addPath(chapter.sourceManga.mangaId)
                .addPath(chapter.chapterId)
                .build(),
            method: "GET",
        };

        try {
            const $ = await this.fetchCheerio(request);
            const pages: string[] = [];

            // Find the astro-island component containing images
            const imageIsland = $('astro-island[component-url*="ImageList"]');
            interface ImageProps {
                imageFiles?: [number, string]; // Adjusted to match the actual structure
            }
            const props = JSON.parse(
                imageIsland.attr("props") || "{}",
            ) as ImageProps;

            // Extract image URLs from the JSON props
            if (props.imageFiles && props.imageFiles.length > 1) {
                const imageFilesArray = JSON.parse(
                    props.imageFiles[1],
                ) as Array<[number, string]>;
                imageFilesArray.forEach(([format, url]) => {
                    if (format === 0) {
                        // Check the format code
                        pages.push(url);
                    }
                });
            }

            if (pages.length === 0) {
                throw new Error("No valid image URLs found");
            }

            return {
                id: chapter.chapterId,
                mangaId: chapter.sourceManga.mangaId,
                pages: pages,
            };
        } catch (error) {
            console.error(
                `Failed to load chapter details: ${error instanceof Error ? error.message : String(error)}`,
            );
            throw new Error(
                `Failed to load chapter: ${error instanceof Error ? error.message : String(error)}`,
            );
        }
    }

    async fetchCheerio(request: Request): Promise<cheerio.CheerioAPI> {
        const [response, data] = await Application.scheduleRequest(request);
        this.checkCloudflareStatus(response.status);
        return cheerio.load(Application.arrayBufferToUTF8String(data), {
            xml: {
                xmlMode: false,
                // decodeEntities: false,
            },
        });
    }

    checkCloudflareStatus(status: number): void {
        if (status === 503 || status === 403) {
            throw new CloudflareError({ url: DOMAIN_NAME, method: "GET" });
        }
    }
}

export const BatoTo = new BatoToExtension();
