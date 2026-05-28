/*
 * Adapted from https://github.com/wojtekmaj/country-code-to-flag-emoji
 * Copyright (c) 2019-2026 Wojciech Maj
 * Released under the MIT License.
 * SPDX-License-Identifier: MIT
 */

const BLACK_FLAG = "🏴";
const CANCEL_TAG = "󠁿";

const shiftCodePoint = ({
  letter,
  offset,
}: {
  letter: string;
  offset: number;
}): string => {
  return String.fromCodePoint(letter.toLowerCase().charCodeAt(0) + offset);
};

/**
 * Converts 'a' to '🇦', 'b' to '🇧' and so on.
 *
 * @param {string} letter A single letter, eg. 'a', 'b', 'c' or 'A', 'B', 'C'
 * @returns {string} A regional indicator symbol letter
 */
const letterToRegionalIndicator = (letter: string): string => {
  return shiftCodePoint({ letter, offset: 127365 });
};

/**
 * Converts 'a' to tag latin small letter a, 'b' to tag latin small letter b and so on.
 *
 * @param {string} letter A single letter, eg. 'a', 'b', 'c' or 'A', 'B', 'C'
 * @returns {string} A tag latin small letter
 */
const letterToTagLatinSmallLetter = (letter: string): string => {
  return shiftCodePoint({ letter, offset: 917504 });
};

/**
 * Converts 'pl' to 'PL', 'en-US' to 'US' and so on.
 *
 * @param {string} countryCode An ISO 3166-1 alpha-2 code or IETF language tag
 * @returns {string} An ISO 3166-1 alpha-2 code
 */
const getIsoAlphaCode = (countryCode: string): string => {
  const country = countryCode.split("-").pop();

  if (!country) {
    throw new Error("countryCode is required");
  }

  return country.toUpperCase();
};

/**
 * Converts 'pl-PL' to 🇵🇱 and so on.
 *
 * @param {string} countryCode An ISO 3166-1 alpha-2 code or IETF language tag
 * @returns {string} A flag emoji
 */
export const countryCodeToFlagEmoji = (countryCode: string): string => {
  if (!countryCode) {
    throw new Error("countryCode is required");
  }

  // Special case for UK extended codes like 'GB-SCT', 'GB-WLS' and so on
  const uppercasedCountryCode = countryCode.toUpperCase();

  if (uppercasedCountryCode.startsWith("GB-")) {
    const extendedCountryCode = (
      uppercasedCountryCode === "GB-CYM" ? "GB-WLS" : uppercasedCountryCode
    ).replace("-", "");

    return (
      BLACK_FLAG +
      Array.from(extendedCountryCode)
        .map(letterToTagLatinSmallLetter)
        .join("") +
      CANCEL_TAG
    );
  }

  return Array.from(getIsoAlphaCode(countryCode))
    .map(letterToRegionalIndicator)
    .join("");
};
