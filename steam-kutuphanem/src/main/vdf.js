'use strict';

/**
 * Valve VDF (KeyValues) okuyucu.
 * Steam'in libraryfolders.vdf ve appmanifest_*.acf dosyalari bu formattadir.
 *
 * Desteklenenler: tirnakli/tirnaksiz degerler, ic ice objeler, // yorumlari,
 * \\ \" \n \t kacis dizileri.
 */

const WHITESPACE = new Set([' ', '\t', '\r', '\n']);

function tokenize(input) {
  const tokens = [];
  let i = 0;

  while (i < input.length) {
    const char = input[i];

    if (WHITESPACE.has(char)) {
      i += 1;
      continue;
    }

    // Yorum satiri
    if (char === '/' && input[i + 1] === '/') {
      while (i < input.length && input[i] !== '\n') i += 1;
      continue;
    }

    if (char === '{' || char === '}') {
      tokens.push(char);
      i += 1;
      continue;
    }

    if (char === '"') {
      i += 1;
      let value = '';
      let closed = false;
      while (i < input.length) {
        const current = input[i];
        if (current === '\\' && i + 1 < input.length) {
          const next = input[i + 1];
          if (next === 'n') { value += '\n'; i += 2; continue; }
          if (next === 't') { value += '\t'; i += 2; continue; }
          value += next;
          i += 2;
          continue;
        }
        if (current === '"') { closed = true; i += 1; break; }
        value += current;
        i += 1;
      }
      if (!closed) throw new Error('VDF: kapanmayan tirnak isareti');
      tokens.push({ value });
      continue;
    }

    // Tirnaksiz deger (ornegin eski libraryfolders.vdf icindeki yollar)
    let value = '';
    while (i < input.length && !WHITESPACE.has(input[i]) && input[i] !== '{' && input[i] !== '}') {
      value += input[i];
      i += 1;
    }
    tokens.push({ value });
  }

  return tokens;
}

function parse(text) {
  if (typeof text !== 'string') throw new TypeError('VDF: metin bekleniyordu');
  const tokens = tokenize(text);
  let position = 0;

  function parseObject(stopAtClosingBrace) {
    const result = {};

    while (position < tokens.length) {
      const token = tokens[position];

      if (token === '}') {
        if (!stopAtClosingBrace) throw new Error('VDF: fazladan kapanis suslu parantezi');
        position += 1;
        return result;
      }

      if (token === '{') throw new Error('VDF: anahtarsiz acilis suslu parantezi');

      const key = token.value;
      position += 1;
      const next = tokens[position];

      if (next === undefined) throw new Error(`VDF: "${key}" icin deger yok`);

      if (next === '{') {
        position += 1;
        result[key] = parseObject(true);
      } else if (next === '}') {
        throw new Error(`VDF: "${key}" icin deger yok`);
      } else {
        result[key] = next.value;
        position += 1;
      }
    }

    if (stopAtClosingBrace) throw new Error('VDF: kapanmayan suslu parantez');
    return result;
  }

  return parseObject(false);
}

module.exports = { parse, tokenize };
