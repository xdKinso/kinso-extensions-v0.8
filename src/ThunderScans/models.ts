export interface Metadata {
  page?: number;
}

export interface Genre {
  id: string;
  label: string;
}

export const Genres: Genre[] = [
  { id: "action", label: "Action" },
  { id: "adventure", label: "Adventure" },
  { id: "comedy", label: "Comedy" },
  { id: "demons", label: "Demons" },
  { id: "drama", label: "Drama" },
  { id: "fantasy", label: "Fantasy" },
  { id: "historical", label: "Historical" },
  { id: "magic", label: "Magic" },
  { id: "martial-arts", label: "Martial Arts" },
  { id: "mystery", label: "Mystery" },
  { id: "psychological", label: "Psychological" },
  { id: "romance", label: "Romance" },
  { id: "school-life", label: "School Life" },
  { id: "sci-fi", label: "Sci-Fi" },
  { id: "supernatural", label: "Supernatural" },
  { id: "webtoons", label: "Webtoons" },
];
