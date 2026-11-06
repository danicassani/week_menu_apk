export const EMOJIS = [
  "🍽️",
  "🥣",
  "🥚",
  "🍚",
  "🥗",
  "🍝",
  "🍲",
  "🥪",
  "🍞",
  "🥔",
  "🥕",
  "🥦",
  "🍅",
  "🍎",
  "🍌",
  "🍗",
  "🐟",
  "🧀",
  "🥛",
  "🫘",
  "🥜",
  "🧑",
  "🙂",
  "😎",
  "🐱",
  "🐶",
  "🦊",
  "🐼",
  "🌻",
  "🌵",
  "🌈",
  "⭐",
] as const;
export type Presentation = { avatar: string; text_size: "standard" | "large" };
export function foodEmoji(
  item: { emoji?: string; id: string },
  recipe = false,
) {
  return (
    item.emoji ||
    (
      {
        oats: "🥣",
        eggs: "🥚",
        rice_white: "🍚",
        rice_brown: "🍚",
        bread: "🍞",
        chicken: "🍗",
        apple: "🍎",
        banana: "🍌",
        tomato: "🍅",
        potato: "🥔",
      } as Record<string, string>
    )[item.id] ||
    (recipe ? "🍽️" : "🥕")
  );
}
