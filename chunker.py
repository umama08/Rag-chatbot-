import json
import os
import re

TARGET_TOKENS = 500
OVERLAP_TOKENS = 80
TOKEN_RATIO = 0.75  # tokens = words / 0.75

def estimate_tokens(text):
    """Estimate token count: word_count / 0.75"""
    words = text.split()
    return len(words) / TOKEN_RATIO

def split_into_sentences(text):
    """Split text into sentences using sentence-ending punctuation and newlines."""
    # Split by newlines or punctuation (. ! ?) followed by whitespace
    raw_sentences = re.split(r'(?<=[.!?])\s+|\n+', text)
    return [s.strip() for s in raw_sentences if s.strip()]

def chunk_text(text, target_tokens=TARGET_TOKENS, overlap_tokens=OVERLAP_TOKENS):
    """
    Chunk text into medium-sized blocks targetting target_tokens (~500),
    with overlap_tokens (~80) carried over to the next chunk.
    Splits ONLY on sentence boundaries.
    """
    sentences = split_into_sentences(text)
    if not sentences:
        return []

    chunks = []
    current_sentences = []
    current_tokens = 0.0

    for sentence in sentences:
        sentence_tokens = estimate_tokens(sentence)

        # If adding this sentence exceeds target_tokens and we already have sentences in the buffer
        if current_tokens + sentence_tokens > target_tokens and current_sentences:
            # Save the current chunk
            chunk_content = " ".join(current_sentences)
            chunks.append(chunk_content)

            # Compute overlap: take trailing sentences from current_sentences up to overlap_tokens
            overlap_sentences = []
            overlap_acc = 0.0
            for s in reversed(current_sentences):
                s_tok = estimate_tokens(s)
                if overlap_acc + s_tok <= overlap_tokens or not overlap_sentences:
                    overlap_sentences.insert(0, s)
                    overlap_acc += s_tok
                else:
                    break

            # Start new buffer with overlap sentences + current sentence
            current_sentences = overlap_sentences + [sentence]
            current_tokens = sum(estimate_tokens(s) for s in current_sentences)
        else:
            current_sentences.append(sentence)
            current_tokens += sentence_tokens

    # Add remaining sentences if any
    if current_sentences:
        chunk_content = " ".join(current_sentences)
        # Avoid duplicate chunk if it's identical to the previous chunk
        if not chunks or chunks[-1] != chunk_content:
            chunks.append(chunk_content)

    return chunks

def process_scraped_json(input_file="scraped_data.json", output_file="chunks.json"):
    # Fallback if scraped.json is specified or used
    if not os.path.exists(input_file) and os.path.exists("scraped.json"):
        input_file = "scraped.json"
    elif not os.path.exists(input_file) and os.path.exists("scraped_data.json"):
        input_file = "scraped_data.json"

    print(f"Loading scraped data from {input_file}...")
    with open(input_file, "r", encoding="utf-8") as f:
        pages = json.load(f)

    all_chunks = []
    for page in pages:
        url = page.get("url", "")
        title = page.get("title", "")
        text = page.get("text", "")

        page_chunks = chunk_text(text, TARGET_TOKENS, OVERLAP_TOKENS)
        for content in page_chunks:
            all_chunks.append({
                "url": url,
                "title": title,
                "content": content
            })

    print(f"Processed {len(pages)} pages into {len(all_chunks)} chunks.")

    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(all_chunks, f, indent=2, ensure_ascii=False)

    # Also save a copy as scraped.json if scraped_data.json was used to satisfy exact prompt naming
    if input_file == "scraped_data.json" and not os.path.exists("scraped.json"):
        with open("scraped.json", "w", encoding="utf-8") as f:
            json.dump(pages, f, indent=2, ensure_ascii=False)

    print(f"Saved chunked data to {output_file}.")
    return all_chunks

if __name__ == "__main__":
    process_scraped_json()
