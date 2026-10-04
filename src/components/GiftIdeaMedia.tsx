import { useEffect, useState } from 'react';

interface Props {
  imageUrl?: string;
  emoji?: string;
  link?: string;
}

export default function GiftIdeaMedia({ imageUrl, emoji, link }: Props) {
  const [preview, setPreview] = useState<{ link: string; imageUrl: string } | null>(null);
  const previewImageUrl = preview && preview.link === link ? preview.imageUrl : undefined;

  useEffect(() => {
    if (!link || imageUrl || emoji) return;

    const controller = new AbortController();

    const loadPreviewImage = async () => {
      try {
        const response = await fetch(`/api/link-preview?url=${encodeURIComponent(link)}`, {
          signal: controller.signal,
        });
        if (!response.ok) return;

        const preview = await response.json() as { imageUrl?: string };
        if (preview.imageUrl) setPreview({ link, imageUrl: preview.imageUrl });
      } catch {
        // A card without preview metadata continues to use the gift fallback.
      }
    };

    void loadPreviewImage();

    return () => controller.abort();
  }, [emoji, imageUrl, link]);

  if (imageUrl) return <img src={imageUrl} alt="" className="idea-media" />;
  if (emoji) return <div className="idea-media idea-emoji" aria-hidden="true">{emoji}</div>;
  if (previewImageUrl) {
    return (
      <img
        src={previewImageUrl}
        alt=""
        className="idea-media"
        onError={() => setPreview(null)}
      />
    );
  }

  return <div className="idea-media idea-emoji idea-emoji-empty" aria-hidden="true">🎁</div>;
}
