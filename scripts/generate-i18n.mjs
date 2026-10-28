import {
  mkdir,
  readFile,
  writeFile,
} from "node:fs/promises";

import path from "node:path";
import {
  fileURLToPath,
} from "node:url";

// 現在のスクリプト位置からプロジェクトルートを取得
const currentFilePath =
  fileURLToPath(import.meta.url);

const currentDirectory =
  path.dirname(currentFilePath);

const projectRoot =
  path.resolve(
    currentDirectory,
    ".."
  );

// 翻訳CSVと出力先
const csvPath =
  path.join(
    projectRoot,
    "src",
    "i18n",
    "translations.csv"
  );

const outputDirectory =
  path.join(
    projectRoot,
    "src",
    "i18n",
    "locales"
  );

// 対応言語
const languages = [
  "ja",
  "en",
  "zh-CN",
];

// CSVの1行を解析
// ダブルクォート内のカンマにも対応
const parseCsvLine = (line) => {
  const values = [];

  let currentValue = "";
  let insideQuotes = false;

  for (
    let index = 0;
    index < line.length;
    index += 1
  ) {
    const character = line[index];
    const nextCharacter =
      line[index + 1];

    if (
      character === "\"" &&
      insideQuotes &&
      nextCharacter === "\""
    ) {
      // CSV内の連続したダブルクォート
      currentValue += "\"";
      index += 1;
      continue;
    }

    if (character === "\"") {
      insideQuotes = !insideQuotes;
      continue;
    }

    if (
      character === "," &&
      !insideQuotes
    ) {
      values.push(currentValue);
      currentValue = "";
      continue;
    }

    currentValue += character;
  }

  if (insideQuotes) {
    throw new Error(
      `閉じられていないダブルクォートがあります: ${line}`
    );
  }

  values.push(currentValue);

  return values;
};

// ドット区切りキーをネストしたオブジェクトへ変換
const setNestedValue = (
  target,
  key,
  value
) => {
  const keyParts = key.split(".");
  let current = target;

  keyParts.forEach(
    (keyPart, index) => {
      const isLast =
        index === keyParts.length - 1;

      if (isLast) {
        current[keyPart] = value;
        return;
      }

      if (
        typeof current[keyPart] !==
          "object" ||
        current[keyPart] === null ||
        Array.isArray(
          current[keyPart]
        )
      ) {
        current[keyPart] = {};
      }

      current = current[keyPart];
    }
  );
};

// CSVを読み込む
const csvText =
  await readFile(
    csvPath,
    "utf8"
  );

// BOMとWindows改行に対応
const lines = csvText
  .replace(/^\uFEFF/, "")
  .split(/\r?\n/)
  .filter(
    (line) =>
      line.trim().length > 0
  );

if (lines.length < 2) {
  throw new Error(
    "translations.csvに翻訳データがありません。"
  );
}

// ヘッダーを確認
const headers =
  parseCsvLine(lines[0]);

const expectedHeaders = [
  "key",
  ...languages,
];

if (
  JSON.stringify(headers) !==
  JSON.stringify(expectedHeaders)
) {
  throw new Error(
    `CSVヘッダーが不正です。期待値: ${expectedHeaders.join(",")}`
  );
}

// 言語別の出力データ
const resources =
  Object.fromEntries(
    languages.map(
      (language) => [
        language,
        {},
      ]
    )
  );

const usedKeys = new Set();

for (
  let lineIndex = 1;
  lineIndex < lines.length;
  lineIndex += 1
) {
  const lineNumber =
    lineIndex + 1;

  const values =
    parseCsvLine(
      lines[lineIndex]
    );

  if (
    values.length !==
    expectedHeaders.length
  ) {
    throw new Error(
      `${lineNumber}行目の列数が不正です。`
    );
  }

  const [
    rawKey,
    ...translations
  ] = values;

  const key = rawKey.trim();

  if (!key) {
    throw new Error(
      `${lineNumber}行目のkeyが空です。`
    );
  }

  if (usedKeys.has(key)) {
    throw new Error(
      `${lineNumber}行目のkeyが重複しています: ${key}`
    );
  }

  usedKeys.add(key);

  languages.forEach(
    (language, languageIndex) => {
      const translation =
        translations[
          languageIndex
        ];

      if (
        translation.trim() === ""
      ) {
        throw new Error(
          `${lineNumber}行目の${language}翻訳が空です: ${key}`
        );
      }

      setNestedValue(
        resources[language],
        key,
        translation
      );
    }
  );
}

// 出力先を作成
await mkdir(
  outputDirectory,
  {
    recursive: true,
  }
);

// 言語別JSONを書き出す
for (const language of languages) {
  const outputPath =
    path.join(
      outputDirectory,
      `${language}.json`
    );

  await writeFile(
    outputPath,
    `${JSON.stringify(
      resources[language],
      null,
      2
    )}\n`,
    "utf8"
  );

  console.log(
    `Generated: ${path.relative(
      projectRoot,
      outputPath
    )}`
  );
}

console.log(
  `Completed: ${usedKeys.size} translation keys`
);