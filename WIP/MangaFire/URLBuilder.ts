export class URLBuilder {
  private baseUrl: string;
  private path: string[] = [];
  private queryParams: Map<string, string[]>;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
    this.queryParams = new Map();
  }

  addPath(path: string): this {
    this.path.push(path);
    return this;
  }

  addQuery(key: string, value: string): this {
    const existing = this.queryParams.get(key) || [];
    existing.push(value);
    this.queryParams.set(key, existing);
    return this;
  }

  build(): string {
    const pathString = this.path.length > 0 ? "/" + this.path.join("/") : "";
    const queryParts: string[] = [];

    this.queryParams.forEach((values, key) => {
      values.forEach((value) => {
        queryParts.push(`${encodeURIComponent(key)}=${encodeURIComponent(value)}`);
      });
    });

    const queryString = queryParts.length > 0 ? "?" + queryParts.join("&") : "";
    return `${this.baseUrl}${pathString}${queryString}`;
  }
}
