import { closeSync, fstatSync, openSync, readSync } from 'fs';

// Most timestamp/usage tail records fit in 1 KiB. Longer records transparently
// pull more chunks, while 3k old histories avoid a fixed 192 MiB read tax.
const DEFAULT_CHUNK_BYTES = 1024;

export interface ReverseJsonlLine {
  text: string;
  /** Whether this record ended with a newline in the source file. */
  terminated: boolean;
}

/**
 * Proves that a non-newline-terminated fragment is a syntactically valid
 * prefix of an object/array JSON value. Invalid tokens are rejected even when
 * the outer closing delimiter has not arrived yet.
 */
export function isClearlyIncompleteJsonlTail(text: string): boolean {
  return new JsonPrefixParser(text).isIncompleteContainer();
}

type PrefixStatus = 'complete' | 'incomplete' | 'invalid';

class JsonPrefixParser {
  private index = 0;

  constructor(private readonly text: string) {}

  isIncompleteContainer(): boolean {
    this.skipWhitespace();
    const first = this.text[this.index];
    if (first !== '{' && first !== '[') return false;
    return this.parseValue() === 'incomplete';
  }

  private parseValue(): PrefixStatus {
    this.skipWhitespace();
    const char = this.text[this.index];
    if (char === undefined) return 'incomplete';
    if (char === '{') return this.parseObject();
    if (char === '[') return this.parseArray();
    if (char === '"') return this.parseString();
    if (char === 't') return this.parseLiteral('true');
    if (char === 'f') return this.parseLiteral('false');
    if (char === 'n') return this.parseLiteral('null');
    if (char === '-' || isDigit(char)) return this.parseNumber();
    return 'invalid';
  }

  private parseObject(): PrefixStatus {
    this.index++;
    this.skipWhitespace();
    if (this.atEnd()) return 'incomplete';
    if (this.text[this.index] === '}') {
      this.index++;
      return 'complete';
    }

    while (true) {
      if (this.text[this.index] !== '"') return 'invalid';
      const key = this.parseString();
      if (key !== 'complete') return key;
      this.skipWhitespace();
      if (this.atEnd()) return 'incomplete';
      if (this.text[this.index] !== ':') return 'invalid';
      this.index++;

      const value = this.parseValue();
      if (value !== 'complete') return value;
      this.skipWhitespace();
      if (this.atEnd()) return 'incomplete';
      if (this.text[this.index] === '}') {
        this.index++;
        return 'complete';
      }
      if (this.text[this.index] !== ',') return 'invalid';
      this.index++;
      this.skipWhitespace();
      if (this.atEnd()) return 'incomplete';
    }
  }

  private parseArray(): PrefixStatus {
    this.index++;
    this.skipWhitespace();
    if (this.atEnd()) return 'incomplete';
    if (this.text[this.index] === ']') {
      this.index++;
      return 'complete';
    }

    while (true) {
      const value = this.parseValue();
      if (value !== 'complete') return value;
      this.skipWhitespace();
      if (this.atEnd()) return 'incomplete';
      if (this.text[this.index] === ']') {
        this.index++;
        return 'complete';
      }
      if (this.text[this.index] !== ',') return 'invalid';
      this.index++;
      this.skipWhitespace();
      if (this.atEnd()) return 'incomplete';
    }
  }

  private parseString(): PrefixStatus {
    this.index++;
    while (!this.atEnd()) {
      const char = this.text[this.index++]!;
      if (char === '"') return 'complete';
      if (char.charCodeAt(0) < 0x20) return 'invalid';
      if (char !== '\\') continue;
      if (this.atEnd()) return 'incomplete';
      const escape = this.text[this.index++]!;
      if ('"\\/bfnrt'.includes(escape)) continue;
      if (escape !== 'u') return 'invalid';
      for (let count = 0; count < 4; count++) {
        if (this.atEnd()) return 'incomplete';
        if (!/[0-9a-f]/i.test(this.text[this.index++]!)) return 'invalid';
      }
    }
    return 'incomplete';
  }

  private parseLiteral(expected: 'true' | 'false' | 'null'): PrefixStatus {
    for (const char of expected) {
      if (this.atEnd()) return 'incomplete';
      if (this.text[this.index++] !== char) return 'invalid';
    }
    return 'complete';
  }

  private parseNumber(): PrefixStatus {
    if (this.text[this.index] === '-') {
      this.index++;
      if (this.atEnd()) return 'incomplete';
    }

    if (this.text[this.index] === '0') {
      this.index++;
      if (isDigit(this.text[this.index])) return 'invalid';
    } else if (isNonZeroDigit(this.text[this.index])) {
      while (isDigit(this.text[this.index])) this.index++;
    } else {
      return 'invalid';
    }

    if (this.text[this.index] === '.') {
      this.index++;
      if (this.atEnd()) return 'incomplete';
      if (!isDigit(this.text[this.index])) return 'invalid';
      while (isDigit(this.text[this.index])) this.index++;
    }

    if (this.text[this.index] === 'e' || this.text[this.index] === 'E') {
      this.index++;
      if (this.atEnd()) return 'incomplete';
      if (this.text[this.index] === '+' || this.text[this.index] === '-') {
        this.index++;
        if (this.atEnd()) return 'incomplete';
      }
      if (!isDigit(this.text[this.index])) return 'invalid';
      while (isDigit(this.text[this.index])) this.index++;
    }
    return 'complete';
  }

  private skipWhitespace(): void {
    while (isJsonWhitespace(this.text[this.index])) this.index++;
  }

  private atEnd(): boolean {
    return this.index >= this.text.length;
  }
}

function isDigit(char: string | undefined): boolean {
  return char !== undefined && char >= '0' && char <= '9';
}

function isNonZeroDigit(char: string | undefined): boolean {
  return char !== undefined && char >= '1' && char <= '9';
}

function isJsonWhitespace(char: string | undefined): boolean {
  return char === ' ' || char === '\t' || char === '\r' || char === '\n';
}

/**
 * Streams complete JSONL lines from the end of a file without decoding across
 * UTF-8 chunk boundaries. Callers may stop early; the descriptor is still
 * closed by the generator's finally block.
 */
export function* readJsonlLinesReverse(
  sourcePath: string,
  chunkBytes = DEFAULT_CHUNK_BYTES,
  knownSizeBytes?: number,
): Generator<ReverseJsonlLine> {
  const fd = openSync(sourcePath, 'r');
  try {
    let position = knownSizeBytes ?? fstatSync(fd).size;
    let carry = Buffer.alloc(0);
    let lineTerminated = false;
    let firstChunk = true;
    let nextChunkBytes = chunkBytes;

    while (position > 0) {
      const size = Math.min(nextChunkBytes, position);
      position -= size;
      const chunk = Buffer.allocUnsafe(size);
      const bytesRead = readSync(fd, chunk, 0, size, position);
      const data = Buffer.concat([chunk.subarray(0, bytesRead), carry]);
      if (firstChunk) {
        lineTerminated = data.length > 0 && data[data.length - 1] === 0x0a;
        firstChunk = false;
      }
      let lineEnd = data.length;
      let foundNewline = false;

      for (let index = data.length - 1; index >= 0; index--) {
        if (data[index] !== 0x0a) continue;
        foundNewline = true;
        if (index + 1 < lineEnd) {
          yield {
            text: data.subarray(index + 1, lineEnd).toString('utf8'),
            terminated: lineTerminated,
          };
        }
        lineEnd = index;
        lineTerminated = true;
      }

      carry = Buffer.from(data.subarray(0, lineEnd));
      // Exponential growth bounds total carry copying to O(line length) for a
      // large final record. Reset after a boundary so ordinary records still
      // pay only the 1 KiB first-read cost.
      nextChunkBytes = foundNewline ? chunkBytes : nextChunkBytes * 2;
    }

    if (carry.length > 0) {
      yield { text: carry.toString('utf8'), terminated: lineTerminated };
    }
  } finally {
    closeSync(fd);
  }
}
