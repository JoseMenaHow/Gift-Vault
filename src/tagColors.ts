const tagColorClasses = [
  'tag-color-ocean',
  'tag-color-mint',
  'tag-color-amber',
  'tag-color-rose',
  'tag-color-violet',
  'tag-color-cyan',
  'tag-color-lime',
  'tag-color-coral',
];

export function getTagColorClassName(tag: string): string {
  let hash = 0;
  const normalizedTag = tag.toLocaleLowerCase();

  for (let index = 0; index < normalizedTag.length; index += 1) {
    hash = ((hash << 5) - hash + normalizedTag.charCodeAt(index)) | 0;
  }

  return tagColorClasses[(hash >>> 0) % tagColorClasses.length];
}
