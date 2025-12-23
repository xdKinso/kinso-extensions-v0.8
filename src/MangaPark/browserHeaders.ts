import randomUseragent from 'random-useragent';

// Browser-like header generation to appear less suspicious to Cloudflare

const CHROME_VERSIONS = ['120', '121', '122', '123', '124', '125', '126', '127'];
const SAFARI_VERSIONS = ['17.0', '17.1', '17.2', '17.3', '17.4', '17.5'];

function getRandomElement<T>(array: T[]): T {
  return array[Math.floor(Math.random() * array.length)] as T;
}

function getRandomChromeVersion(): string {
  return getRandomElement(CHROME_VERSIONS);
}

function getRandomSafariVersion(): string {
  return getRandomElement(SAFARI_VERSIONS);
}

// Generate sec-ch-ua header that matches the user agent
function generateSecChUa(isMobile: boolean): string {
  const chromeVersion = getRandomChromeVersion();
  if (isMobile) {
    return `"Not A(Brand";v="8", "Chromium";v="${chromeVersion}", "Google Chrome";v="${chromeVersion}"`;
  }
  return `"Not A(Brand";v="99", "Chromium";v="${chromeVersion}", "Google Chrome";v="${chromeVersion}"`;
}

// Generate realistic browser headers
export function generateBrowserHeaders(url: string): Record<string, string> {
  // Use random-useragent to get realistic UA, filtered for modern browsers
  const userAgent = randomUseragent.getRandom((ua: any) => {
    const agent = ua.userAgent.toLowerCase();
    // Only use Chrome, Safari, or Edge user agents from last 2 years
    return (
      (agent.includes('chrome') || agent.includes('safari') || agent.includes('edg/')) &&
      !agent.includes('bot') &&
      !agent.includes('crawler') &&
      ua.browserName !== 'IE'
    );
  }) || 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

  const isMobile = userAgent.toLowerCase().includes('mobile');
  const isImageRequest = url.includes('/media/') || /\.(jpg|jpeg|png|webp|gif)/.test(url);

  // Build comprehensive browser-like headers
  const headers: Record<string, string> = {
    'user-agent': userAgent,
    'accept': isImageRequest 
      ? 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8'
      : 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
    'accept-language': 'en-US,en;q=0.9',
    'accept-encoding': 'gzip, deflate, br',
    'referer': 'https://mangapark.net/',
    'dnt': '1',
    'upgrade-insecure-requests': '1',
    'sec-fetch-dest': isImageRequest ? 'image' : 'document',
    'sec-fetch-mode': 'navigate',
    'sec-fetch-site': isImageRequest ? 'cross-site' : 'same-origin',
    'sec-fetch-user': '?1',
    'cache-control': 'max-age=0',
  };

  // Add Chrome-specific headers if using Chrome UA
  if (userAgent.includes('Chrome') && !userAgent.includes('Edg')) {
    headers['sec-ch-ua'] = generateSecChUa(isMobile);
    headers['sec-ch-ua-mobile'] = isMobile ? '?1' : '?0';
    headers['sec-ch-ua-platform'] = isMobile ? '"Android"' : '"Windows"';
  }

  return headers;
}

// Add random delay to requests to appear more human-like
export function getRandomDelay(): number {
  // Random delay between 100-800ms
  return Math.floor(Math.random() * 700) + 100;
}

// Vary the delay slightly for each request type
export function getRequestDelay(requestType: 'page' | 'image' | 'api'): number {
  switch (requestType) {
    case 'page':
      return Math.floor(Math.random() * 500) + 200; // 200-700ms
    case 'image':
      return Math.floor(Math.random() * 200) + 50;  // 50-250ms
    case 'api':
      return Math.floor(Math.random() * 300) + 100; // 100-400ms
    default:
      return getRandomDelay();
  }
}

// Calculate exponential backoff delay for retries
export function getRetryDelay(attemptNumber: number): number {
  // Exponential backoff: 2s, 4s, 8s, 16s, 32s
  const baseDelay = 2000;
  const delay = baseDelay * Math.pow(2, attemptNumber - 1);
  // Add jitter to prevent thundering herd
  const jitter = Math.random() * 1000;
  return Math.min(delay + jitter, 32000); // Cap at 32 seconds
}
