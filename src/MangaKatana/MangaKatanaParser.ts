import { type SearchResultItem, type Tag, type TagSection } from "@paperback/types";
import { type CheerioAPI } from "cheerio";
import pbconfig from "./pbconfig";

const DOMAIN_NAME = "https://mangakatana.com/";

export const parseTags = ($: CheerioAPI): TagSection[] => {
  const arrayTags: Tag[] = [];

  for (const tag of $(".wrap_item").toArray()) {
    const label = $("a", tag).first().text().trim();
    const id = $("a", tag).attr("href")?.split("genre/")[1] ?? "";

    if (!id || !label) continue;
    arrayTags.push({ id: id, title: label });
  }
  const tagSections: TagSection[] = [
    {
      id: "0",
      title: "genres",
      tags: arrayTags.map((genre) => ({
        id: genre.id.toLowerCase().replace(/\s+/g, "_"),
        title: genre.title,
      })),
    },
  ];
  return tagSections;
};

export const parseSearch = ($: CheerioAPI): SearchResultItem[] => {
  const mangas: SearchResultItem[] = [];
  const collectedIds: string[] = [];

  // Check if this is a single manga detail page
  const pathSegments = $("meta[property='og:url']").attr("content")?.split("/") || [];
  if (pathSegments[pathSegments.length - 2] === "manga" && pathSegments[pathSegments.length - 1]) {
    // Single manga page
    const title = $("h1.heading").first().text().trim();
    const id = pathSegments[pathSegments.length - 1];
    const image = $("div.media div.cover img").attr("src") ?? "";

    if (id && title) {
      mangas.push({
        imageUrl: image,
        title: title,
        mangaId: id,
        subtitle: undefined,
        contentRating: pbconfig.contentRating,
      });
    }
  } else {
    // List page
    for (const manga of $("div#book_list > div.item").toArray()) {
      const titleLink = $(manga).find("div.text > h3 > a").first();
      const title = titleLink.text().trim();
      const href = titleLink.attr("href") || "";
      let id = href.split("/").pop() || "";
      
      const image = $(manga).find("img").attr("src") ?? "";
      const subtitle = $(manga).find(".chapter").first().text().trim();

      if (!id || !title) continue;
      if (collectedIds.includes(id)) continue;

      mangas.push({
        imageUrl: image,
        title: title,
        mangaId: id,
        subtitle: subtitle || undefined,
        contentRating: pbconfig.contentRating,
      });
      collectedIds.push(id);
    }
  }
  return mangas;
};

export const isLastPage = ($: CheerioAPI): boolean => {
  let isLast = true;
  const hasNext = Boolean($("a.next.page-numbers", "ul.uk-pagination").text());

  if (hasNext) isLast = false;
  return isLast;
};
