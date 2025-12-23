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
  type TagSection,
} from "@paperback/types";
import * as cheerio from "cheerio";
import { type CheerioAPI } from "cheerio";
import { URLBuilder } from "../utils/url-builder/base";
import { genreOptions } from "./genreOptions";
import { genres } from "./genres";
import { isLastPage, parseSearch, parseTags } from "./MangaKatanaParser";
import pbconfig from "./pbconfig";

const DOMAIN_NAME = "https://mangakatana.com/";

// Define CloudflareError class for handling Cloudflare protection
class CloudflareError extends Error {
  constructor(request: { url: string; method: string }) {
    super("Cloudflare protection detected");
    this.name = "CloudflareError";
    this.request = request;
  }

  request: { url: string; method: string };
}

// Should match the capabilities which you defined in pbconfig.ts
type MangaKatanaImplementation = Extension &
  DiscoverSectionProviding &
  SearchResultsProviding &
  MangaProviding &
  ChapterProviding;

// Intercepts all the requests and responses and allows you to make changes to them
class MangaKatanaInterceptor extends PaperbackInterceptor {
  override async interceptRequest(request: Request): Promise<Request> {
    request.headers = {
      ...request.headers,
      referer: DOMAIN_NAME,
      origin: DOMAIN_NAME,
      "user-agent": await Application.getDefaultUserAgent(),
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

// Main extension class
export class MangaKatanaExtension implements MangaKatanaImplementation {
  // Implementation of the main rate limiter
  mainRateLimiter = new BasicRateLimiter("main", {
    numberOfRequests: 15,
    bufferInterval: 10,
    ignoreImages: true,
  });

  // Implementation of the main interceptor
  mangaKatanaInterceptor = new MangaKatanaInterceptor("main");

  // Method from the Extension interface which we implement, initializes the rate limiter, interceptor, discover sections and search filters
  async initialise(): Promise<void> {
    this.mainRateLimiter.registerInterceptor();
    this.mangaKatanaInterceptor.registerInterceptor();
  }

  async getDiscoverSections(): Promise<DiscoverSection[]> {
    const get_Hot_Updates_Section: DiscoverSection = {
      id: "hot-updates",
      title: "Hot Updates",
      type: DiscoverSectionType.featured,
    };

    const get_Latest_Updates_Section: DiscoverSection = {
      id: "latest-updates",
      title: "Latest Updates",
      type: DiscoverSectionType.simpleCarousel,
    };

    const get_New_Manga_Section: DiscoverSection = {
      id: "new-manga",
      title: "New Manga",
      type: DiscoverSectionType.simpleCarousel,
    };

    const get_Genres_Section: DiscoverSection = {
      id: "genres",
      title: "Genres",
      type: DiscoverSectionType.genres,
    };

    return [
      get_Hot_Updates_Section,
      get_Latest_Updates_Section,
      get_New_Manga_Section,
      get_Genres_Section,
    ];
  }

  // Populates both the discover sections
  async getDiscoverSectionItems(
    section: DiscoverSection,
    metadata: Katana.Metadata | undefined,
  ): Promise<PagedResults<DiscoverSectionItem>> {
    switch (section.id) {
      case "hot-updates":
        return this.getHotUpdatesSectionItems();
      case "latest-updates":
        return this.getLatestUpdatesSectionItems(section, metadata);
      case "new-manga":
        return this.getNewMangaSectionItems(section, metadata);
      case "genres":
        return this.getGenresSectionItems();
      default:
        return { items: [] };
    }
  }

  // Populates the hot updates section
  async getHotUpdatesSectionItems(): Promise<PagedResults<DiscoverSectionItem>> {
    const request = {
      url: new URLBuilder(DOMAIN_NAME).build(),
      method: "GET",
    };
    const $ = await this.fetchCheerio(request);

    const items: DiscoverSectionItem[] = [];

    // Hot updates use a different container
    $("div#hot_update > div.item").each((_, element) => {
      const unit = $(element);
      
      // Get title and link
      const titleLink = unit.find("h3.title a").first();
      const title = titleLink.text().trim();
      const href = titleLink.attr("href") || "";
      
      if (!title || !href) return;

      let mangaId = href.split("/").pop() || "";
      if (!mangaId) return;

      const image = unit.find(".wrap_img img").attr("src") ?? "";
      const chapter = unit.find(".chapter a").first().text().trim();

      if (mangaId && title && image) {
        items.push({
          imageUrl: image,
          title: title,
          mangaId: mangaId,
          subtitle: chapter || undefined,
          type: "simpleCarouselItem",
          contentRating: pbconfig.contentRating,
        });
      }
    });

    return {
      items: items,
      metadata: undefined,
    };
  }

  async getLatestUpdatesSectionItems(
    section: DiscoverSection,
    metadata: Katana.Metadata | undefined,
  ): Promise<PagedResults<DiscoverSectionItem>> {
    const page = (metadata as { page?: number } | undefined)?.page ?? 1;
    const collectedIds = metadata?.collectedIds ?? [];

    const request = {
      url: new URLBuilder(DOMAIN_NAME).addPath("page").addPath(page.toString()).build(),
      method: "GET",
    };
    const $ = await this.fetchCheerio(request);

    const items: DiscoverSectionItem[] = [];

    $("div#book_list > div.item").each((_, element) => {
      const unit = $(element);
      
      // Get title and link using correct selector
      const titleLink = unit.find("div.text > h3 > a").first();
      const href = titleLink.attr("href") || "";
      const title = titleLink.text().trim();
      
      if (!title || !href) return;

      let mangaId = href.split("/").pop() || "";
      if (!mangaId) return;

      // Get image with absolute URL
      const image = unit.find("img").attr("src") ?? "";

      if (mangaId && title && image && !collectedIds.includes(mangaId)) {
        collectedIds.push(mangaId);
        items.push({
          imageUrl: image,
          title: title,
          mangaId: mangaId,
          type: "simpleCarouselItem",
          contentRating: pbconfig.contentRating,
        });
      }
    });

    // Check for next page
    const nextPageHref = $("a.next.page-numbers").attr("href");
    let nextPage: number | undefined;
    if (nextPageHref) {
      const pageMatch = nextPageHref.match(/\/page\/(\d+)/);
      if (pageMatch && pageMatch[1]) {
        nextPage = parseInt(pageMatch[1], 10);
      } else {
        nextPage = page + 1;
      }
    }

    return {
      items: items,
      metadata: nextPage ? { page: nextPage, collectedIds } : undefined,
    };
  }

  // Populates the new manga section
  async getNewMangaSectionItems(
    section: DiscoverSection,
    metadata: Katana.Metadata | undefined,
  ): Promise<PagedResults<DiscoverSectionItem>> {
    const page = (metadata as { page?: number } | undefined)?.page ?? 1;
    const collectedIds = metadata?.collectedIds ?? [];

    const request = {
      url: new URLBuilder(DOMAIN_NAME)
        .addPath("manga")
        .addPath("page")
        .addPath(page.toString())
        .addQuery("order", "new")
        .build(),
      method: "GET",
    };

    const $ = await this.fetchCheerio(request);
    const items: DiscoverSectionItem[] = [];

    $("div#book_list > div.item").each((_, element) => {
      const unit = $(element);
      
      const titleLink = unit.find("div.text > h3 > a").first();
      const href = titleLink.attr("href") || "";
      const title = titleLink.text().trim();
      
      if (!title || !href) return;

      let mangaId = href.split("/").pop() || "";
      if (!mangaId) return;

      const image = unit.find("img").attr("src") ?? "";

      if (mangaId && title && image && !collectedIds.includes(mangaId)) {
        collectedIds.push(mangaId);
        items.push({
          imageUrl: image,
          title: title,
          mangaId: mangaId,
          type: "simpleCarouselItem",
          contentRating: pbconfig.contentRating,
        });
      }
    });

    const nextPageHref = $("a.next.page-numbers").attr("href");
    let nextPage: number | undefined;
    if (nextPageHref) {
      const pageMatch = nextPageHref.match(/\/page\/(\d+)/);
      if (pageMatch && pageMatch[1]) {
        nextPage = parseInt(pageMatch[1], 10);
      } else {
        nextPage = page + 1;
      }
    }

    return {
      items: items,
      metadata: nextPage ? { page: nextPage, collectedIds } : undefined,
    };
  }

  // Populates the genres section
  async getGenresSectionItems(): Promise<PagedResults<DiscoverSectionItem>> {
    // We are using genres array from the imported file here
    return {
      items: genres.map((genre) => ({
        type: "genresCarouselItem",
        searchQuery: {
          title: "",
          filters: [{ id: "genres", value: { [genre.id]: "included" } }],
        },
        name: genre.name,
        // No need to pass metadata for genres as it's a static list
        metadata: undefined,
      })),
    };
  }

  async getCloudflareBypassRequestAsync(): Promise<Request> {
    return {
      url: `${DOMAIN_NAME}/`,
      method: "GET",
      headers: {
        referer: `${DOMAIN_NAME}/`,
        origin: `${DOMAIN_NAME}/`,
        "user-agent": await Application.getDefaultUserAgent(),
      },
    };
  }

  async fetchCheerio(request: Request): Promise<CheerioAPI> {
    const [response, data] = await Application.scheduleRequest(request);
    this.checkCloudflareStatus(response.status);
    return cheerio.load(Application.arrayBufferToUTF8String(data));
  }

  checkCloudflareStatus(status: number): void {
    if (status === 503 || status === 403) {
      throw new CloudflareError({ url: DOMAIN_NAME, method: "GET" });
    }
  }

  // Populate search filters
  async getSortingOptions(): Promise<import("@paperback/types").SortingOption[]> {
    return [
      { id: "latest", label: "New Updates" },
      { id: "new", label: "Newest" },
      { id: "az", label: "A-Z" },
      { id: "numc", label: "Number Of Chapters" },
    ];
  }

  async getSearchFilters(): Promise<SearchFilter[]> {
    const filters: SearchFilter[] = [];

    // Genre filter
    filters.push({
      id: "genres",
      type: "multiselect",
      options: genreOptions,
      allowExclusion: true,
      value: {},
      title: "Genres",
      allowEmptySelection: true,
      maximum: undefined,
    });

    // Include mode toggle
    filters.push({
      id: "include_mode",
      type: "dropdown",
      options: [
        { id: "and", value: "AND (All Selected Genres)" },
        { id: "or", value: "OR (Any Selected Genre)" },
      ],
      value: "and",
      title: "Genre Inclusion Mode",
    });

    // Status filter
    filters.push({
      id: "status",
      type: "multiselect",
      options: [
        { id: "cancelled", value: "Cancelled" },
        { id: "ongoing", value: "Ongoing" },
        { id: "completed", value: "Completed" },
      ],
      allowExclusion: false,
      value: {},
      title: "Status",
      allowEmptySelection: true,
      maximum: undefined,
    });

    // Chapters filter
    filters.push({
      id: "chapters",
      type: "dropdown",
      options: [
        { id: "1", value: "1+" },
        { id: "10", value: "10+" },
        { id: "20", value: "20+" },
        { id: "30", value: "30+" },
        { id: "50", value: "50+" },
        { id: "100", value: "100+" },
      ],
      value: "1",
      title: "Chapters",
    });

    return filters;
  }

  async getSearchTags(): Promise<TagSection[]> {
    const request = {
      url: `${DOMAIN_NAME}/genres`,
      method: "GET",
    };

    const $ = await this.fetchCheerio(request);
    return parseTags($);
  }

  async getSearchResults(
    query: SearchQuery,
    metadata: Katana.Metadata | undefined,
    sortingOption?: import("@paperback/types").SortingOption,
  ): Promise<PagedResults<SearchResultItem>> {
    const page = (metadata as { page?: number } | undefined)?.page ?? 1;

    // Skip search for single character queries
    if (query.title && query.title.length === 1) {
      return { items: [], metadata: undefined };
    }

    // Set up request
    let request;
    if (query.title) {
      request = {
        url: new URLBuilder(DOMAIN_NAME)
          .addPath("page")
          .addPath(String(page))
          .addQuery("search", encodeURIComponent(query.title))
          .addQuery("search_by", "book_name")
          .build(),
        method: "GET",
      };
    } else {
      // Extract the genre ID from the filters
      const genreFilter = query.filters?.find((f) => f.id === "genres");
      const genreValue = genreFilter?.value;

      // Get all included genre IDs
      const includedGenreIds = Object.entries(genreValue || {})
        .filter(([, value]) => value === "included")
        .map(([id]) => id);

      // Map genre IDs to their values
      const includedGenreValues = includedGenreIds
        .map((id) => {
          const genreOption = genreOptions.find((option) => option.id === id);
          return genreOption ? genreOption.value.toLowerCase().replace(/ /g, "_") : "";
        })
        .filter(Boolean);

      // Join multiple genres with underscores
      const includeValue = includedGenreValues.join("_");

      // Get include mode
      const includeModeFilter = query.filters?.find((f) => f.id === "include_mode");
      const includeMode = (includeModeFilter?.value as string) || "and";

      // Get status filter
      const statusFilter = query.filters?.find((f) => f.id === "status");
      const statusValue = statusFilter?.value;
      const includedStatuses = Object.entries(statusValue || {})
        .filter(([, value]) => value === "included")
        .map(([id]) => id)
        .join("_");

      // Get chapters filter
      const chaptersFilter = query.filters?.find((f) => f.id === "chapters");
      const chaptersValue = (chaptersFilter?.value as string) || "1";

      const urlBuilder = new URLBuilder(DOMAIN_NAME)
        .addPath("latest")
        .addPath("page")
        .addPath(String(page))
        .addQuery("filter", "1")
        .addQuery("include_mode", includeMode)
        .addQuery("bookmark_opts", "off")
        .addQuery("chapters", chaptersValue);

      // Add genres if any selected
      if (includeValue) {
        urlBuilder.addQuery("include", includeValue);
      }

      // Add status if any selected
      if (includedStatuses) {
        urlBuilder.addQuery("status", includedStatuses);
      }

      // Add sorting
      if (sortingOption?.id) {
        urlBuilder.addQuery("order", sortingOption.id);
      }

      request = {
        url: urlBuilder.build(),
        method: "GET",
      };
    }

    try {
      // Execute the request
      const $ = await this.fetchCheerio(request);

      const manga = parseSearch($);

      console.log(`\n\n It failed from here \n\n`);

      // Return results
      const nextPageMeta = !isLastPage($) ? { page: page + 1 } : undefined;

      console.log(
        `\n\nThe Mangas Length: ${manga.length} , the page: ${page} and nextPageMeta: ${JSON.stringify(nextPageMeta)}\n\n`,
      );

      return {
        items: manga,
        metadata: nextPageMeta,
      };
    } catch (error) {
      console.error(`Error fetching search results: `, error);
      throw new Error("Tap to retry search");
    }
  }

  // Populates the chapter list
  async getChapters(sourceManga: SourceManga): Promise<Chapter[]> {
    const request = {
      url: new URLBuilder(DOMAIN_NAME).addPath("manga").addPath(sourceManga.mangaId).build(),
      method: "GET",
    };
    const $ = await this.fetchCheerio(request);

    const chapters: Chapter[] = [];

    $(".chapters table.uk-table tbody tr").each((_, element) => {
      const row = $(element);
      const chapterLink = row.find(".chapter a");
      const chapterPath = chapterLink.attr("href") || "";
      const chapterId = chapterPath.split("/").pop() || "";
      const rawChapterText = chapterLink.text().trim();

      // Extract chapter number and subtitle using regex
      const chapterMatch = rawChapterText.match(/Chapter\s+([\d.]+)(?:\s*-\s*(.*))?/i);
      const chapterNumber =
        chapterMatch && chapterMatch[1] ? parseFloat(chapterMatch[1] ?? "0") : 0;
      const chapterSubtitle = chapterMatch?.[2]?.trim() || "";

      // Format title: Use subtitle if available, otherwise blank
      const formattedTitle = chapterSubtitle;

      // Parse publish date
      const rawDate = row.find(".update_time").text().trim();
      const [month, day, year] = rawDate.split("-");
      const publishDate = new Date(`${month} ${day}, ${year}`);

      chapters.push({
        chapterId: chapterId,
        title: formattedTitle, // Will be empty if no subtitle
        sourceManga,
        chapNum: chapterNumber,
        publishDate: publishDate,
        langCode: "en",
      });
    });

    return chapters.reverse();
  }

  // Populates a chapter with images
  async getChapterDetails(chapter: Chapter): Promise<ChapterDetails> {
    const url = new URLBuilder(DOMAIN_NAME)
      .addPath("manga")
      .addPath(chapter.sourceManga.mangaId)
      .addPath(chapter.chapterId)
      .build();

    const request = {
      url: url,
      method: "GET",
      headers: {
        referer: DOMAIN_NAME,
        origin: DOMAIN_NAME,
        "user-agent": await Application.getDefaultUserAgent(),
      },
    };

    try {
      const [response, data] = await Application.scheduleRequest(request);
      if (response.status !== 200) {
        throw new Error(`Failed to fetch chapter data: HTTP ${response.status}`);
      }

      const htmlStr = Application.arrayBufferToUTF8String(data);
      const $ = cheerio.load(htmlStr);

      let pages: string[] = [];

      const imageArrayNameRegex = /data-src['"],\s*(\w+)/;
      const imageUrlRegex = /\'([^\']*)\'/;

      const imageScript = $("script:containsData(data-src)").first().html() || "";

      if (imageScript) {
        const imageArrayNameMatch = imageScript.match(imageArrayNameRegex);
        if (imageArrayNameMatch && imageArrayNameMatch[1]) {
          const imageArrayName = imageArrayNameMatch[1];
          const imageArrayRegex = new RegExp(`var\\s+${imageArrayName}\\s*=\\s*\\[([^\\[]*)]`);
          const imageArrayMatch = imageScript.match(imageArrayRegex);

          if (imageArrayMatch && imageArrayMatch[1]) {
            const imageUrlMatches = imageArrayMatch[1].matchAll(/\'([^\']*)\'/g);
            for (const match of imageUrlMatches) {
              if (match[1]) {
                pages.push(match[1]);
              }
            }
          }
        }
      }

      // Fallback: Extract from DOM elements if script parsing didn't work
      if (pages.length === 0) {
        $("#imgs .wrap_img img").each((_, img) => {
          let imageUrl = $(img).attr("data-src") || $(img).attr("src");
          if (imageUrl) {
            imageUrl = imageUrl.startsWith("http") ? imageUrl : `${DOMAIN_NAME}${imageUrl}`;
            pages.push(imageUrl);
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

  getMangaShareUrl(mangaId: string): string {
    return `${DOMAIN_NAME}/manga/${mangaId}`;
  }

  async getMangaDetails(mangaId: string): Promise<SourceManga> {
    const request = {
      url: new URLBuilder(DOMAIN_NAME).addPath("manga").addPath(mangaId).build(),
      method: "GET",
    };

    const $ = await this.fetchCheerio(request);

    // Extract title
    const title = $("h1.heading").text().trim();

    // Extract cover image - use correct selector
    const image = $("div.media div.cover img").attr("src") ?? "";

    // Extract description/summary
    const description = $(".summary > p").text().trim();

    // Extract alternative titles
    const altNames: string[] = [];
    const altNameText = $(".alt_name").text().trim();
    if (altNameText) {
      altNames.push(...altNameText.split(";").map((t) => t.trim()).filter((t) => t));
    }

    // Extract authors
    const authors: string[] = [];
    $(".author").each((_, el) => {
      const author = $(el).text().trim();
      if (author) authors.push(author);
    });

    // Extract status
    let status = "UNKNOWN";
    const statusText = $(".value.status").text().trim().toLowerCase();
    if (statusText.includes("ongoing")) {
      status = "ONGOING";
    } else if (statusText.includes("completed")) {
      status = "COMPLETED";
    }

    // Extract genres
    const genres: string[] = [];
    $(".genres > a").each((_, el) => {
      const genre = $(el).text().trim();
      if (genre) genres.push(genre);
    });

    // Build tag sections
    const tags: TagSection[] = [];
    if (genres.length > 0) {
      tags.push({
        id: "genres",
        title: "Genres",
        tags: genres.map((genre) => ({
          id: genre.toLowerCase().replace(/\s+/g, "-").replace(/[^\w\-]/g, ""),
          title: genre,
        })),
      });
    }

    // Determine content rating
    let contentRating = ContentRating.EVERYONE;
    const adultGenres = ["Adult", "Erotica"];
    const matureGenres = ["Ecchi", "Gore", "Psychological", "Sexual violence"];

    if (genres.some((g) => adultGenres.includes(g))) {
      contentRating = ContentRating.ADULT;
    } else if (genres.some((g) => matureGenres.includes(g))) {
      contentRating = ContentRating.MATURE;
    }

    return {
      mangaId: mangaId,
      mangaInfo: {
        primaryTitle: title,
        secondaryTitles: altNames,
        thumbnailUrl: image,
        synopsis: description,
        contentRating: contentRating,
        status: status as "ONGOING" | "COMPLETED" | "UNKNOWN",
        tagGroups: tags,
      },
    };
  }
}

function createDiscoverSectionItem(options: {
  id: string;
  image: string;
  title: string;
  subtitle?: string;
  type: "simpleCarouselItem";
}): DiscoverSectionItem {
  return {
    type: options.type,
    mangaId: options.id,
    imageUrl: options.image,
    title: options.title,
    subtitle: options.subtitle,
    metadata: undefined,
  };
}

export const MangaKatana = new MangaKatanaExtension();
