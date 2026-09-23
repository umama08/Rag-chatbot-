import json
import time
from urllib.parse import urljoin, urlparse, urldefrag
from urllib.robotparser import RobotFileParser
import requests
from bs4 import BeautifulSoup

START_URL = "https://developer.mozilla.org/en-US/docs/Web/JavaScript"
BASE_DOMAIN = "developer.mozilla.org"
PATH_PREFIX = "/en-US/docs/Web/JavaScript"
DISALLOWED_SUBSTRINGS = ["/api/", "/files/", "/media/"]
MAX_PAGES = 50
DELAY_SECONDS = 1.0
OUTPUT_FILE = "scraped_data.json"

def init_robot_parser(user_agent="*"):
    rfp = RobotFileParser()
    robots_url = f"https://{BASE_DOMAIN}/robots.txt"
    try:
        rfp.set_url(robots_url)
        rfp.read()
    except Exception as e:
        print(f"Warning: Could not fetch robots.txt ({e}). Falling back to manual rule check.", flush=True)
        rfp = None
    return rfp

def is_allowed_url(url, rfp, user_agent="*"):
    parsed = urlparse(url)
    if parsed.netloc != BASE_DOMAIN:
        return False
    
    # Must stay under /en-US/docs/Web/JavaScript/
    path = parsed.path
    if not (path == PATH_PREFIX or path.startswith(PATH_PREFIX + "/")):
        return False
    
    # Check explicitly disallowed paths (/api/, /files/, /media/)
    for sub in DISALLOWED_SUBSTRINGS:
        if sub in path:
            return False
            
    # Check robots.txt if available
    if rfp and not rfp.can_fetch(user_agent, url):
        return False
        
    return True

def extract_page_data(html, url):
    soup = BeautifulSoup(html, "html.parser")
    
    # Remove requested elements
    for element_type in ["nav", "footer", "header", "script", "style", "aside"]:
        for el in soup.find_all(element_type):
            el.decompose()
            
    # Extract Title
    title = ""
    if soup.title and soup.title.string:
        title = soup.title.string.strip()
    elif soup.h1:
        title = soup.h1.get_text(strip=True)
        
    # Extract visible text from p, li, h1, h2, h3 tags
    target_tags = soup.find_all(["p", "li", "h1", "h2", "h3"])
    extracted_blocks = []
    for tag in target_tags:
        text = tag.get_text(strip=True)
        if text:
            extracted_blocks.append(text)
            
    full_text = "\n".join(extracted_blocks)
    
    # Extract internal links
    links = []
    for a in soup.find_all("a", href=True):
        href = a["href"]
        full_url = urljoin(url, href)
        # Strip fragment
        full_url, _ = urldefrag(full_url)
        links.append(full_url)
        
    return title, full_text, links

def main():
    print("Initializing robots.txt parser...", flush=True)
    rfp = init_robot_parser()
    
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 RAGBotScraper/1.0"
    }
    
    queue = [START_URL]
    visited = set()
    scraped_data = []
    
    print(f"Starting web scraper for {START_URL}...", flush=True)
    
    while queue and len(scraped_data) < MAX_PAGES:
        current_url = queue.pop(0)
        
        if current_url in visited:
            continue
            
        visited.add(current_url)
        
        if not is_allowed_url(current_url, rfp):
            print(f"Skipping disallowed URL: {current_url}", flush=True)
            continue
            
        print(f"[{len(scraped_data) + 1}/{MAX_PAGES}] Fetching: {current_url}", flush=True)
        
        try:
            response = requests.get(current_url, headers=headers, timeout=10)
            if response.status_code != 200:
                print(f"Failed to fetch {current_url} (Status: {response.status_code})", flush=True)
                time.sleep(DELAY_SECONDS)
                continue
                
            title, text, links = extract_page_data(response.text, current_url)
            
            # Enqueue new allowed links
            for link in links:
                if link not in visited and is_allowed_url(link, rfp):
                    if link not in queue:
                        queue.append(link)
                        
            # Skip pages under 200 characters of extracted text
            if len(text) < 200:
                print(f"Skipping page (text length {len(text)} < 200 chars): {current_url}", flush=True)
            else:
                scraped_data.append({
                    "url": current_url,
                    "title": title,
                    "text": text
                })
                print(f"Saved: '{title}' ({len(text)} chars)", flush=True)
                
        except Exception as e:
            print(f"Error fetching {current_url}: {e}", flush=True)
            
        time.sleep(DELAY_SECONDS)
        
    print(f"\nScraping complete. Total pages scraped: {len(scraped_data)}", flush=True)
    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(scraped_data, f, indent=2, ensure_ascii=False)
    print(f"Data saved to {OUTPUT_FILE}", flush=True)

if __name__ == "__main__":
    main()
